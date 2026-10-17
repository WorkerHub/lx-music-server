# lx-music-server 全面审查报告

- 审查时间：2026-10-17
- 审查范围：全仓库（`src/` 约 4000 行 TS、wrangler.toml、4 个 GitHub workflow、biome/tsconfig、依赖与锁文件）
- 审查方式：静态通读 + 实际执行构建工具链
- 性质：只审查，未修改任何业务代码

## 一、实测结果（能跑的都跑了）

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 依赖安装 | `pnpm install --frozen-lockfile`（pnpm 12.5.1） | ✅ 通过，锁文件一致 |
| Lint + 格式 | `biome ci src package.json pnpm-lock.yaml biome.json .github/workflows/*.yml` | ✅ 0 错误；1 条 info：biome.json `$schema` 写的是 2.5.6，安装版本是 2.5.15（建议跑 `biome migrate`） |
| 类型检查 | `wrangler types && tsc --noEmit` | ✅ 通过，0 错误 |
| 构建 | `wrangler deploy --dry-run` | ✅ 通过，绑定（USER_SYNC / KV / LX_USERS / SERVER_NAME）解析正常 |
| 测试 | — | ❌ 仓库中不存在任何测试文件与测试脚本 |

注：本机 corepack 缓存的 pnpm 12.5.1 二进制损坏（与仓库无关），实际用 `npx pnpm@12.5.1` 完成安装与构建。

## 二、问题清单

级别统计：**Critical 1 / High 4 / Medium 9 / Low 8**。

### Critical

#### C1. 认证与同步全程使用 AES-ECB + MD5 截断派生密钥，且设备密钥实际上未启用
- 位置：`src/utils/crypto.ts:29-41`（aesEncrypt/aesDecrypt 用 `aes-js` ECB 模式）；`src/routes/auth.ts:74` 与 `src/durable/UserSyncDO.ts:190`（`toMD5(password).substring(0,16)` 作为密钥）；`src/utils/compress.ts:49-58`（`encryptMsg` 只 gzip 不加密，注释自述 "per-device AES encryption is not yet implemented"）
- 问题：
  1. ECB 模式无 IV、确定性加密，相同明文块产生相同密文，可泄露明文结构；认证消息前缀固定（`lx-music auth::`），是已知明文攻击的理想素材。
  2. 密钥派生为 `MD5(password)` 截断 16 字节：无盐、单次 MD5，离线字典/彩虹表成本极低；且用户密码明文存于环境变量 `LX_USERS`。
  3. 首次认证把密码 MD5 当作共享密钥——任何知道密码的人都能解密他人认证包；WebSocket 阶段的 token 用设备 key 加密，但整个同步数据流（`encryptMsg`）实际只做了 gzip，设备 key 分发后并未用于加密业务消息。
- 触发场景：攻击者嗅探或中间人获取认证包/同步流量；或拿到一次认证密文后离线爆破弱密码。
- 修复建议：协议层面短期内难以大改（要兼容 LX Music 客户端），建议：(a) 文档明确告诫用户使用高强度随机密码并只对受信网络开放；(b) 至少把密钥派生换成带盐的 PBKDF2/scrypt（需客户端配合）；(c) 中期目标迁移到 AES-GCM（含随机 nonce + 认证标签），并让 `encryptMsg` 真正使用设备 key 做 AEAD 加密；(d) `LX_USERS` 改为存密码哈希而非明文。

### High

#### H1. gzip 解压无大小上限，存在压缩炸弹 DoS
- 位置：`src/utils/compress.ts:37-45`（unGzip 全量读入内存）；调用点 `src/durable/UserSyncDO.ts:407`（`decryptMsg` 处理每条 WS 消息）
- 问题：任何已认证设备（或持有泄露 clientId+key 者）可发送极小但解压后巨大的 `cg_` 消息，DO 单线程内存被打爆，影响该用户全部同步；`JSON.parse` 前的明文也无长度限制。
- 触发场景：恶意/故障客户端发送压缩比极高的 payload。
- 修复建议：解压流式计数，明文超过阈值（如 8–16 MB）即丢弃并关闭连接；WS message 入口先限原始字节数。

#### H2. Worker 侧 IP 限流为 isolate 内内存 Map，基本无效
- 位置：`src/routes/auth.ts:14-38`
- 问题：`ipFailures` 是普通模块级 Map，Workers 全球多 isolate、随时回收，注释虽自述 "first-pass guard"，但实际对分布式爆破几乎没有约束；`/ah` 新设备路径对每个用户尝试解密，本身就是密码在线爆破入口。
- 触发场景：攻击者轮询 `/ah` 爆破用户密码（MD5 派生 + 固定前缀使验证成本极低，见 C1）。
- 修复建议：用 Cloudflare 原生手段（WAF rate limiting rule / Workers Rate Limiting API，或 KV/DO 集中计数）替换内存 Map；DO 内 `ipFailures`（UserSyncDO.ts:34）同理只保活于单实例，可保留但不应是唯一防线。

#### H3. WebSocket 认证 token 走 URL query，易泄露
- 位置：`src/index.ts:27`（`/socket?i=&t=`）
- 问题：token（设备 key 加密的 `lx-music connect`）出现在 URL 中，会进入浏览器历史、代理日志、错误上报等；这是上游协议使然，但服务端可考虑兼容更安全的传递方式。
- 修复建议：短期至少在文档中标注；中期支持 `Sec-WebSocket-Protocol` 或首条消息认证，query 仅作兼容回退。

#### H4. 设备管理 API 使用明文密码 + 非常量时间比较
- 位置：`src/routes/devices.ts:22-36`（`u.password === password` 字符串比较 + `LX_USERS` 明文）
- 问题：明文密码比较存在时序侧信道（影响有限但真实）；更主要的是密码明文落盘于 worker vars，Cloudflare 控制台可见。
- 修复建议：支持存哈希（如 SHA-256 + salt）并改用常量时间比较；文档建议管理接口仅在必要时暴露，或加 WAF 规则限制来源。

### Medium

#### M1. Durable Object 未使用 WebSocket Hibernation API，`setInterval` ping 使 DO 常驻计费
- 位置：`src/durable/UserSyncDO.ts:280-288`（`server.accept()` + `setInterval` ping）
- 问题：`this.sockets`、ping 定时器全部在内存，DO 只要有连接就永不休眠（连接计费持续）；且 isolate 重启后定时器/内存状态丢失属预期但未做处理。手机端 ping 也没有 pong 超时检测，死连接依赖运行时 close 事件清理。
- 修复建议：迁移到 `state.acceptWebSocket()` + `webSocketMessage/webSocketClose` 回调的 Hibernation 模式，用 `ws.serializeAttachment` 存 keyInfo；或至少加 pong 超时与连接数上限。

#### M2. snapshotInfo 落盘依赖 `throttle(setTimeout)`，DO 被驱逐时丢快照索引
- 位置：`src/modules/list/snapshotDataManage.ts:115-123`、`src/modules/dislike/snapshotDataManage.ts`（同构代码）
- 问题：`saveSnapshotInfoThrottle` 用 `setTimeout` 延迟 100ms 才真正 `storage.put`；若在此期间 DO 因异常/驱逐终止，内存中 snapshotInfo（latest/clients 映射）丢失。目前有 `flush()` 兜底（最后一个 socket 关闭时调用），但进程异常退出、或一直有连接直到驱逐的场景仍丢。注意 throttle 实现只保留尾随一次调用，高频 snapshot 时大量中间状态本来就会丢——属设计取舍，但要意识到恢复后 `clients` 映射可能过期。
- 修复建议：关键写路径（createSnapshot 后）直接 await put 或用 `state.storage.transaction`；throttle 仅用于 lastSyncDate 之类的非关键字段；配合 `state.waitUntil` 保证延迟写完成。

#### M3. 恶意/异常客户端输入可致同步 handler 抛 TypeError
- 位置：`src/modules/list/listDataManage.ts:213`（`userListsUpdatePosition` 中 `map.get(id) as ...` 后直接写 `locationUpdateTime`，id 不存在时为 undefined）；`src/modules/list/listDataManage.ts:312-318`（`listMusicUpdatePosition` 把 `map.get(id)` 的 undefined 推入 infos）
- 问题：已认证客户端发送不存在的 list/music id 即触发运行时异常，中断该 socket 同步流程（外层 catch 会 close，但属于可被远程触发的崩溃路径）。
- 修复建议：对 `map.get` 结果做存在性判断并跳过未知 id；入口对 action payload 做基本 shape 校验。

#### M4. 并发首认证在同密码用户间可能绑定错用户
- 位置：`src/durable/UserSyncDO.ts:186-229`（DO 内 handleAuth 再次遍历所有用户解密，取第一个成功者绑定 `this.userName`）
- 问题：路由层已按解密成功的 user 选 DO，DO 内却又全量遍历一次。正常情况两者一致；但若两个用户密码相同（或未来前缀碰撞），DO 可能把 userName 绑定到与路由选择不同的用户，造成数据串户。属小概率但后果严重。
- 修复建议：路由层把已确定的 `userName` 传入 DO body，DO 只校验该用户，不再遍历。

#### M5. KV `client:{id}` 映射无 TTL、无完整生命周期
- 位置：`src/routes/auth.ts:112`（put）；`src/routes/devices.ts:74-77`（仅 DELETE /devices 成功时删除）
- 问题：设备被删除外的所有路径（用户弃用客户端、DO 数据被清）都会留下孤儿映射；`/ah` 已知设备路径凭 clientId 直查 KV，孤儿映射 + 泄露的 clientId/key 可尝试重认证。
- 修复建议：put 时加 `expirationTtl`（如 30 天，重认证时续期）。

#### M6. 模块级全局状态跨 DO 实例共享，依赖"每用户一个 isolate"的隐含假设
- 位置：`src/user/index.ts:14`（`_userSpaceMap`）、`src/user/data.ts:6-7`（`_users`）、`UserSyncDO.ts:117-120`（`global.event_list/event_dislike`）
- 问题：同一 isolate 先后服务多个用户的 DO 时，全局事件发射器与 users 上下文被复用。目前以 userName 为 key 隔离，逻辑上自洽，但非常脆弱：`global.event_list` 是首个初始化的 DO 创建的，任何用户共用；`setUsersContext` 每次 init 覆盖。一旦未来改动引入按实例状态的 listener，立刻串户。
- 修复建议：把事件发射器移入 UserSpace（每用户一个），`global.*` 仅作兼容过渡并加注释说明约束。

#### M7. 同步互斥锁为 1s 轮询忙等，无超时
- 位置：`src/modules/list/sync/sync.ts:531-541`、`src/modules/dislike/sync/sync.ts:285-296`（`while(true){ await wait() }`）
- 问题：前一个同步若卡住（msg2call timeout 120s 才解除），后到的同用户 sync 会一直轮询占用 DO 时间片；断开时靠 onClose 清 ref，异常路径（finally 之前的挂起）依赖 msg2call 超时兜底。
- 修复建议：轮询加最大等待（如 150s）超时抛错；或用 Promise 链代替轮询。

#### M8. 无测试
- 位置：全仓库
- 问题：合并/快照三方合并逻辑（`mergeListDataFromSnapshot`、`mergeList`）是全项目最复杂最易错的部分，零测试覆盖；CI 只跑 lint+typecheck。
- 修复建议：至少为 `mergeListDataFromSnapshot`、`overwriteList`、`filterRules`、`SnapshotDataManage.clearOldSnapshot` 补 vitest（`@cloudflare/vitest-pool-workers`）单测。

#### M9. 密码明文进 wrangler.toml 部署产物
- 位置：`.github/workflows/deploy.yml`（把 `LX_USERS` 明文 JSON 写入 wrangler.toml `[vars]`）
- 问题：`[vars]` 在 Cloudflare 控制台明文可见，任何有账号读权限者可看到所有用户密码；日志虽做了 sed 打码，但 var 本身是明文的。
- 修复建议：改用 `wrangler secret put`（或 terraform secret）下发密码哈希；配合 H4 的哈希化改造。

### Low

- **L1** `src/routes/auth.ts:8-12`：`x-forwarded-for` 回退可被伪造（CF 环境 `cf-connecting-ip` 总在，影响小）。建议只用 CF 头。
- **L2** `src/modules/list/listDataManage.ts:32-50` 与 `dislikeDataManage.ts:22-38`：构造函数里 fire-and-forget 的异步加载分支是死代码（loadAndInit 总是传预加载数据），且若被触发存在读写竞态。建议删除或改为工厂异步方法。
- **L3** `src/modules/list/snapshotDataManage.ts:24-40`：`clearOldSnapshot` 从过滤后数组 pop 再用 `indexOf` 从原数组删，逻辑绕且 O(n²)；`clientSnapshotKeys` 在多设备共享同一快照 key 时用 Set 计数会提前解除保护（A、B 同 key，A 更新后 key 从 Set 删除，B 还指着它，快照可能被清）。建议改用引用计数。
- **L4** `src/modules/dislike/snapshotDataManage.ts` 与 list 版本近乎完全重复（仅类型不同）。建议泛型化合并为一份。
- **L5** `src/types/worker.d.ts:5-6`：`feature: { list: any; dislike: any }` 及 handler 中大量 `as any`（`UserSyncDO.ts:358-360`）削弱类型安全。建议为 feature 定义具体类型。
- **L6** `src/durable/UserSyncDO.ts:176`：`handleGetDevices` 在 `userSpace` 为空时返回 `[]` 而非 503，掩盖初始化失败。建议返回明确错误状态。
- **L7** `biome.json` `$schema` 版本（2.5.6）落后于安装版本（2.5.15），`pnpm lint` 每次输出迁移提示。建议跑 `biome migrate --write`。
- **L8** `.github/workflows/release.yml` 无权限最小化之外的防护（任何 `v*` tag push 即发布），`tag.yml` 依赖长期 PAT（secrets.PAT_TOKEN）。可考虑换 GitHub App/细粒度 token，属运维加固。

## 三、修复建议顺序（按轮次）

1. **第一轮（Critical/High，安全优先）**：C1 密码哈希化 + 文档强化 → H4 常量时间比较/哈希存储 → H1 解压大小上限 → H2 接入 Cloudflare 原生限流 → H3 token 传递方式加固 → M9 secret 化管理。
2. **第二轮（数据正确性）**：M3 输入校验 → M4 DO 不再遍历用户 → M2 关键 snapshot 写路径去 throttle 化 → L3 快照引用计数 → L2 死代码清理。
3. **第三轮（可靠性/成本）**：M1 Hibernation 迁移 → M7 互斥锁超时 → M5 KV TTL → L6 错误状态明确化。
4. **第四轮（工程质量）**：M8 补核心合并逻辑测试 → M6 事件发射器收进 UserSpace → L4 去重 → L5 类型收紧 → L1/L7/L8 配置与运维清理。
