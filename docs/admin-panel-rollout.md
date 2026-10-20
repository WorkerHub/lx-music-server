# 管理面板 + 自助注册：子单汇总与上线收尾

本文件由汇总单生成，用于记录三张子单的交付状态、规格验收对照、QA 结论与上线收尾步骤。汇总单本身**未改动任何业务代码**。

**一句话结论**：功能已全部合入 `main` 并通过全量回归；生产部署已完成，但 GitHub Secret `LX_ADMIN_PASSWORD_HASH` 尚未配置，因此线上 `/admin` 当前按设计返回 404，配置该 Secret 并重新部署后即可启用。

## 1. 子单状态

| 子单 | 内容 | 分支 | PR | 合并提交 |
|---|---|---|---|---|
| #9 后端 | Registry DO、注册接口、管理 API、DO 内部端点 | `tds/conv-01a158be-8982-7af9-b84c-57f8adb30aee` | [#93](https://github.com/WorkerHub/lx-music-server/pull/93) | `b21d08f`、`28cc6b1` |
| #10 前端 | `/admin` 管理面板、`/register` 注册页 | `tds/conv-01a158e3-c7ce-71da-b823-c21292b885cc` | [#94](https://github.com/WorkerHub/lx-music-server/pull/94) | `b81d966` |
| #11 QA | 全量回归与文档核查 | `tds/conv-01a159d8-b5e9-74cb-b5b7-b4336f979902` | [#95](https://github.com/WorkerHub/lx-music-server/pull/95) | `b3dfdf4` |

合并后 `main` 为 `b60f27e`；CI #243（main@`b60f27e`）与 Deploy to Cloudflare Workers #284 均为 success。

## 2. 规格验收对照

| 验收项 | 实现位置 | 结论 |
|---|---|---|
| 注册三档 `closed / open / approval`，出厂默认 `approval` | `src/durable/UserRegistryDO.ts:18`（默认值）、`:133`（settings 读写）；`src/routes/register.ts:20`（`/api/registration-info`）、`:25`（`/api/register`）；`src/routes/admin.ts:492`、`:496`（面板改设置） | 通过 |
| 三类账号来源：env 播种 / 管理员添加 / 自助注册 | `src/durable/UserRegistryDO.ts:56`（一次性播种，`seeded` 标记幂等）；`src/routes/admin.ts:260`（管理员添加，`active/admin`）；`src/routes/register.ts:25`（自助注册，`self`） | 通过 |
| 注册校验与限流 | `src/registry/validate.ts`（用户名 `^[A-Za-z0-9_-]{3,32}$`、密码 8–128、`__` 前缀保留）；`src/routes/register.ts:29`（`register:<ip>` 独立限流） | 通过 |
| 管理员认证与未配置时整体 404 | `src/admin/auth.ts`（SHA-256 校验、HMAC 会话 Cookie 7 天）；`src/routes/admin.ts:207`（未配置 `LX_ADMIN_PASSWORD_HASH` 时 `/api/admin/*` 404）；`src/routes/pages.ts:20`（`/admin` 404） | 通过 |
| 管理 API：用户列表/添加/编辑/重置密码/状态流转 | `src/routes/admin.ts:249`、`:260`、`:286`、`:303`、`:366-380` | 通过 |
| 两步删除：先删账号（墓碑 + 解绑设备，保留数据） | `src/routes/admin.ts:392`（tombstone + `/unbind-all`）；`src/durable/UserSyncDO.ts:204`（踢线并解绑全部设备，保留快照） | 通过 |
| 第二步：彻底清理（`confirmName` 二次确认） | `src/routes/admin.ts:473`；`src/durable/UserSyncDO.ts:220`（`storage.deleteAll()`，先 dispose 防止回写） | 通过 |
| 墓碑、恢复与数据状态 | `src/routes/admin.ts:442`（`/api/admin/orphans` + `/data-status`）、`:455`（恢复，`201`）；`src/durable/UserSyncDO.ts:233`（`/data-status` 摘要） | 通过 |
| 设备管理：列表与删除单个设备 | `src/routes/admin.ts:416`、`:422`（复用 DO 设备删除路径并清 KV 映射）；面板 `src/pages/admin.ts` 设备弹窗 | 通过 |
| 状态闸门：`pending` / `disabled` 三处入口统一拒绝 | `src/routes/auth.ts:48`（`/ah`）、`src/durable/UserSyncDO.ts:359`（`/socket`）、`src/routes/devices.ts:35`（`/devices`），均返回与不存在用户一致的 401 | 通过 |
| 页面：`/admin`、`/register` 单文件 HTML，无框架/外链 | `src/routes/pages.ts:20`、`:28`；`src/pages/admin.ts`、`src/pages/register.ts`（`textContent` 渲染、CSP 头） | 通过 |
| 文档三节 | `README.md` 与 `README.en.md`：部署指南（`LX_ADMIN_PASSWORD_HASH`、`LX_USERS` 可选且仅首次播种）、安全说明（面板权限、`open` 注册风险、删除保留数据）、迁移说明（Registry DO 自动播种） | 通过 |
| 部署 workflow | `.github/workflows/deploy.yml`（校验 64 位 hex、`--secrets-file` 下发、日志脱敏） | 通过 |

## 3. QA 结论

QA 单 #11 的 8 项验收全部通过，证据固化为 `src/test/qa-regression.test.ts`（9 个用例）：

1. 迁移播种幂等、注册表为准据 — `QA 1: 迁移…`
2. 三类账号完成 `/ah` + `/socket` + 一次歌单同步 — `QA 2: 三类账号…`
3. `pending` / `disabled` 状态闸门且不泄露状态 — `QA 3: 状态闸门…`
4. 三档注册模式、保留名、同名并发、限流 — `QA 4: 注册模式…`
5. 删除链：解绑、保留数据、恢复、彻底清理 — `QA 5: 删除链…`
6. 管理 API 安全：401 / 404 / 不含 `passwordHash` / 不含设备 key — `QA 6: 管理 API 安全…`
7. 全量回归全绿
8. 文档三节与实现一致

汇总单独立复跑结果：`pnpm test` 22 个测试文件、175 个用例全部通过；`pnpm typecheck`、`pnpm lint`、`pnpm format:check` 均以 0 退出（lint 有 4 条非阻塞 warning，CI 判定为通过）。

## 4. 契约核对结论

前端（`src/pages/admin.ts`、`src/pages/register.ts`）使用的端点与后端路由逐一对应，**无分歧**：

- 认证：`/api/admin/login`、`/api/admin/logout`
- 用户：`GET/POST /api/admin/users`、`PATCH/DELETE /api/admin/users/:name`、`.../reset-password`、`.../approve|reject|disable|enable`
- 设备：`GET /api/admin/users/:name/devices`、`DELETE /api/admin/users/:name/devices/:clientId`
- 残留：`GET /api/admin/orphans`、`POST /api/admin/orphans/:name/restore`、`DELETE /api/admin/orphans/:name`
- 设置与公开信息：`GET /api/registration-info`、`PATCH /api/admin/settings`（`GET /api/admin/settings` 为附带实现，前端未用）

实现相对规格 5.1 的**增量**（均向后兼容、不改变既有语义）：登录返回 `{ ok: true }`；创建/恢复用户返回 `{ user }`；彻底清理返回 `{ purged: true }`；新增 `/api/admin/settings` 的 GET/PATCH。

## 5. 上线收尾（需要用户操作）

当前线上状态：`main@b60f27e` 已部署（Deploy #284 success），但该次部署日志中 `LX_ADMIN_PASSWORD_HASH:` 为空，Worker 绑定列表里也没有该 Secret，因此 `/admin` 与 `/api/admin/*` 当前返回 404 —— 这是未配置 Secret 的预期行为，不是故障。

1. 生成管理员密码的 SHA-256（64 位 hex）：
   ```bash
   printf '%s' '你的管理员密码' | shasum -a 256
   ```
2. GitHub 仓库 → Settings → Secrets and variables → Actions → 新建 `LX_ADMIN_PASSWORD_HASH`，值为上一步结果。
3. Actions → **Deploy to Cloudflare Workers** → Run workflow（`main`），等待 success。
4. 访问 `https://<worker-url>/admin`，用管理员密码登录，确认用户列表、数据残留、设置三个区域可正常加载。
5. 确认现有同步用户仍可正常连接（`LX_USERS` 播种的账号不受影响），再按需把注册模式切到 `closed / open / approval`。

首次播种说明：`LX_USERS` 只在注册表为空时导入一次（`UserRegistryDO.seed` 的 `seeded` 标记）。当前版本已在生产创建注册表，补加管理员 Secret 并重新部署**不会**重新播种；此后修改 `LX_USERS` 也不再影响鉴权，用户增删改一律走面板。

停用面板：从 GitHub Secrets 删除并重新部署**不会**移除 Worker 上已有的 Secret，还需执行：

```bash
pnpm wrangler secret delete LX_ADMIN_PASSWORD_HASH
```

## 6. 未决项与已知风险

- **未决项**：无。核对未发现规格项缺失或行为不符，因此无需回退任何子单。
- **面板是最高权限入口**：可增删用户、重置密码、清理同步数据。建议使用独立高强度随机密码，并在 Cloudflare 侧叠加 Access 策略或 WAF 限源。
- **注册开放风险**：`open` 模式下任何人可创建账号；不需要注册时请切到 `closed`。注册与登录接口均按 IP 限流。
- **删除不等于清理**：删账号只删账号、保留同步数据与墓碑，同名注册会被拒绝以防继承歌单；彻底清理不可恢复，需输入完整用户名二次确认。
