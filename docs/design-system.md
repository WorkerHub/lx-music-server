# LX Music Server 设计系统契约（冻结）

本文件是父单 ONE-130「lx-music-server UI 优化至奖项级视觉标准」Stage 1 的交付物：现状审计 + 差距清单 + 冻结的设计契约。Stage 2/3/4 以此文档为唯一实施依据，任何变更必须经 Mike 裁决后回填本文档。

## 0. 设计主张（originality 锚点）

**「安静的仪表盘，绿色的脉搏」（Quiet console, living pulse）。**

lx-music-server 的独特身份不是「又一个蓝色管理后台」，而是：零外部依赖、JS 可禁用仍可用的自包含服务端渲染 + LX Music 数据同步服务。视觉主张从这一身份生长出来：

1. **品牌色取自 LX Music 音符 logo 的绿**（`#5ed698` 族系），替换通用 blue-600。绿色贯穿 CTA、链接、聚焦环、图表，是全场唯一品牌色，与状态色（成功同为绿族但通过明度/色相错位区分，并永远配合文案/图标，不单靠颜色）明确分工。
2. **「连接」是第一公民**：home / register 成功态、admin 状态徽标都把「设备已连接 / 同步中」当作最重要的信息层级来排版，连接码与服务器地址用等宽 + tabular-nums 呈现，可一键识别的「凭据区块」成为标志性视觉元素。
3. **工程感 = 精确感**：4px 严格网格、tabular-nums 数字、克制的单阴影、单一缓动曲线。奖项级在这里不是炫技，而是 Linear / Vercel 级别的「每个像素都有出处」。

基准参照（校准完成度）：Linear（层级与留白纪律）、Vercel Dashboard（深色面板的对比度与徽标体系）、Raycast（微交互与聚焦态）、Arc（品牌色的克制使用）；奖项条目侧对照 Awwwards SOTD 工具类条目（如 Linear App 页、Vercel 站）的字体排印与动效节制。

---

## 1. 现状审计与差距清单（现状 vs 目标）

审计对象：`src/pages/home.ts`（162 行）、`src/pages/admin.ts`（2262 行）、`src/pages/register.ts`（350 行）、`src/assets/favicon.ts`（45 行）。

### 1.1 typography 字体排印

| 现状 | 目标 | 差距 |
| --- | --- | --- |
| 全局 `font-size: 14px`，标题仅 24/20/18/17/16/15px 零散取值 | 7 级字号阶梯（12/13/14/16/18/24/30，以 §3.2 为准），每级绑定行高/字重/字距 | 字号不成体系，同级标题跨页不一致（home h1=24、admin h1=20） |
| 行高统一 1.5 | 标题 1.2–1.3、正文 1.5–1.65、说明文字 1.45 按级分工 | 大标题行高偏松、长文偏挤 |
| 字重只有 400/600/700 裸用 | 字重阶梯与层级绑定（见 §3） | kpi-value 700 与 field-label 600 无体系依据 |
| 无字距规则 | 大标题 -0.02em 收紧、12px 全大写标签 +0.06em、正文 0 | 完全缺失 |
| 数字无 tabular-nums（kpi 值、设备数、表格数字跳动） | 所有数据/状态数字 `font-variant-numeric: tabular-nums` | 缺失 |
| 字体栈仅一种 | 系统字体栈分档（正文 / 等宽 / 数字），中英混排 PingFang SC / Microsoft YaHei 落位正确 | 等宽已局部有，但未令牌化 |

### 1.2 whitespace 留白

| 现状 | 目标 | 差距 |
| --- | --- | --- |
| 间距值 2/4/6/8/10/12/14/16/18/20/24/56/64px 混用 | 4px 基准阶梯 4/8/12/16/24/32/48/64（8 档，以 §4 为准） | 非 4 倍数（6/9/10/14/18/22/56）遍布三页 |
| 卡片内边距三页不一致（20/18/14px） | 卡片 padding 桌面 24 / 移动 16，与页面容器 padding 成比例 | 节奏无规则 |
| 区块间几乎同一 gap | 区块间距 ≥ 卡片内距 × 1.5，形成节奏差 | home 56/24/20 随机，admin 全靠 16 平铺 |

### 1.3 visual_hierarchy 视觉层级

| 现状 | 目标 | 差距 |
| --- | --- | --- |
| 层级主要靠 14px 基准上 ±2px 浮动 | 字号 × 字重 × 颜色 × 留白四者协同的 5 级层级 | 一屏内主标题/正文/次要/标签区分度不足 |
| 主 CTA 与次级按钮仅靠蓝底区分，尺寸相同 | 主 CTA 独占品牌绿实心 + 更大内边距，次级幽灵化 | admin 登录卡与 home 操作区 CTA 权重不突出 |
| 标签（th、hint）与次要文字同用 --muted | 标签级（12px 600 大写/宽字距）与说明级分离 | th 与 muted 文案视觉撞车 |

### 1.4 color 配色

| 现状 | 目标 | 差距 |
| --- | --- | --- |
| 品牌色 blue-600（#2563eb / #3b82f6）通用模板脸 | 唯一品牌绿（LX logo 族系），中性色阶带轻微冷调 | 原创性不足（见 §0） |
| 中性色仅 5 档（bg/card/text/muted/line） | 8 档中性阶（bg/sunken/card/raised/line/border-strong/muted/text/heading） | 暗主题 `--shadow: none` 后层级扁平，缺少 raised 层 |
| 状态色只定义 bg+text 两色，无边框/图标色 | 状态色三件套（bg/border/text，图标复用 text 色） | notice/badge 边框直接 transparent，弱主题下轮廓不清 |
| 对比度未验证 | 正文 ≥4.5:1、大字与组件 ≥3:1，逐对列出实测值 | 暗主题 `--muted #98a2b3` on `#1a1f26` ≈ 7.0（达标），但 `--warn-text #fec84b` on `#2e2410` ≈ 8.6 达标而亮主题 `#b54708` on `#fffaeb` ≈ 4.6 临界，需统一复测并在 §5 冻结达标值 |

### 1.5 motion 动效

| 现状 | 目标 | 差距 |
| --- | --- | --- |
| 全站 0 动效，无 transition/animation | 统一 token（时长 120/200/320ms × 缓动 2 条）；视图切换淡入、按钮按压缩放、modal 上浮 | 全部缺失 |
| 无 `prefers-reduced-motion` 处理 | 全局降级为即时切换（时长归 0，仅保留状态变化本身） | 缺失 |
| home 禁 JS 可用 | 所有动效纯 CSS 实现，JS 仅触发 class；home 依旧零脚本 | 约束需写入实现纪律 |

### 1.6 micro_interaction 微交互

| 现状 | 目标 | 差距 |
| --- | --- | --- |
| hover 仅 border-color 变化；active 无；loading 仅 `disabled` | hover/active/focus/disabled/loading 五态齐全且一致（见 §7） | active/loading 缺失，disabled 仅 0.55 透明度无去饱和 |
| focus 环仅 input/tab/todo-item/theme-btn 有 | 所有可交互元素统一 `:focus-visible` 品牌色 2px 环 + 2px offset | `.btn`、`.icon-btn`、`.mode-option` 无焦点环 |
| 空状态只有 muted 文字一行 | 空状态组件（图标位 + 标题 + 说明 + 可选操作） | admin 表格/列表空态无设计 |
| 无 toast | 轻量 toast（操作成功/失败反馈，admin 内） | 操作成败反馈散落在 notice/alert 式文案里 |

### 1.7 responsive 响应式

| 现状 | 目标 | 差距 |
| --- | --- | --- |
| 断点只有 admin 一个 `max-width: 640px`；home/register 无断点 | 三档 ≤640 / 641–1023 / ≥1024，每页有布局方案（见 §8） | 641–1023 档完全未定义 |
| admin 表格靠 `overflow-x: auto` 横向滚动 | 窄屏表格降级为卡片列表（关键列前置，操作收进每行块） | 用户表 7 列在 640px 下仍需横滚 |
| 无触控目标尺寸规范 | 可点目标 ≥ 40×40px（theme-btn 现为 28×24） | theme-btn、btn.sm、icon-btn 不达标 |

### 1.8 originality 原创性

| 现状 | 目标 | 差距 |
| --- | --- | --- |
| blue-600 + 灰阶通用模板脸 | §0 设计主张落地：绿品牌色 + 凭据区块 + 精确网格 | 无任何「属于 lx-music-server」的视觉语言 |
| logo 仅在 home 出现 | logo 绿成为品牌色来源；favicon 与页面视觉同源 | admin/register 头部无品牌印记（admin 有 logo 但配色体系与其无关） |
| favicon 为官方 LX 图标（已合规自包含） | 保持不变（32+16 双帧 ICO 已达标），仅在 Stage 3 核对暗色标签页下可读性 | 基本无差距 |

---

## 2. 令牌集中方式（冻结决定）

新建 **`src/ui/tokens.ts`**，导出唯一令牌源。SSR 静态页（home/register）与 admin 面板注入方式不同——admin 的主题由 JS 状态与 `[data-theme]` 严格控制，`pages.test.ts` 硬断言 admin 页面**不得包含** `@media (prefers-color-scheme: dark)`，因此导出三组字符串：

```ts
export const baseTokensCss = `:root { ... }` // 全部令牌（亮色为默认）
export const darkTokensCss = `[data-theme="dark"] { ... }` // 暗色覆盖，无 @media
export const ssrDarkTokensCss = `@media (prefers-color-scheme: dark) { :root { ... } }` // 系统暗色跟随，仅 SSR 页

export const ssrTokenCss = baseTokensCss + ssrDarkTokensCss // home / register 用
export const adminTokenCss = baseTokensCss + darkTokensCss // admin 用，严禁含 @media
```

- 颜色 / 字号 / 行高 / 字重 / 字距 / 间距 / 圆角 / 阴影 / 缓动 / 时长全部以 CSS 自定义属性定义于此，字符串内插值拼成 `<style>` 注入文本。
- home/register 注入 `ssrTokenCss`，admin 注入 `adminTokenCss`；**不使用外部 .css 文件**（CSP 红线）。
- 页面私有样式仍留在各页文件，但**除 `src/ui/tokens.ts` 外，任何源码文件不得出现裸 hex/hsl()/rgb() 颜色字面量**（logo SVG 的品牌固定色除外，其取值也引用令牌注释中的来源值）。
- 命名规范：`--lx-<域>-<名>`，使用正文正式令牌名，如 `--lx-bg`、`--lx-space-4`、`--lx-text-h2`、`--lx-motion-fast`。

---

## 3. 字体排印体系

### 3.1 字体栈（系统字体，CSP 禁外部字体）

| 令牌 | 值 |
| --- | --- |
| `--lx-font-body` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif` |
| `--lx-font-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace` |

数字规则：凡数据展示（KPI、设备数、表格计数、时间戳、连接码、服务器地址）一律 `font-variant-numeric: tabular-nums`；连接码/地址同时用 `--lx-font-mono`。

### 3.2 字号阶梯（每级绑定行高/字重/字距）

| 令牌 | 字号 | 行高 | 字重 | 字距 | 用途 |
| --- | --- | --- | --- | --- | --- |
| `--lx-text-display` | 30px | 1.2 | 700 | -0.02em | home 主标题、admin KPI 大数 |
| `--lx-text-h1` | 24px | 1.25 | 700 | -0.02em | 页面主标题 |
| `--lx-text-h2` | 18px | 1.3 | 600 | -0.01em | 卡片/区块标题 |
| `--lx-text-h3` | 16px | 1.35 | 600 | -0.01em | 子区块标题 |
| `--lx-text-body` | 14px | 1.55 | 400 | 0 | 正文、表单、表格 |
| `--lx-text-small` | 13px | 1.45 | 400 | 0 | 次要说明、状态行 |
| `--lx-text-label` | 12px | 1.4 | 600 | +0.04em | 表头、字段标签、徽标（英文场景大写） |

上表中每级阶梯是 4 个属性的组合，`letter-spacing` 无法合入 `font:` 简写，单一变量无法承载。Stage 2 在 `tokens.ts` 中按级拆解为四个变量：`--lx-text-<step>-size` / `--lx-text-<step>-lh` / `--lx-text-<step>-weight` / `--lx-text-<step>-tracking`（`<step>` 为 display/h1/h2/h3/body/small/label）。

中英混排：中文标点与西文之间不额外加空格（交给字体回退），段落内数字与西文按 `tabular-nums` 规则；标点悬挂不做（超出 CSS 可靠范围，避免炫技）。

## 4. 间距阶梯（4px 基准）

`--lx-space-1..8` = **4 / 8 / 12 / 16 / 24 / 32 / 48 / 64** px。规则：

- 组件内部（图标-文字、表单字段内）用 1–3 档；卡片内元素间用 3–4 档；卡片之间用 5–6 档；页面区块（header→主卡→footer）用 6–8 档，形成节奏差。
- 卡片 padding：桌面 24px（space-5），移动 16px（space-4）；页面容器水平 padding 桌面 24 / 移动 16，与卡片内距成 1:1 呼应。
- 任何非阶梯值禁止出现（含 0 与 auto 之外的 margin/padding/gap）。

## 5. 颜色系统（明暗双主题）

### 5.1 品牌色（唯一）

源自 LX Music logo 绿 `#5ed698` 的可读化改造：

| 令牌 | light | dark | 用途 |
| --- | --- | --- | --- |
| `--lx-brand` | `#157f4a` | `#4ade80` | CTA 底、链接、激活态、图表 |
| `--lx-brand-hover` | `#11693d` | `#6be89a` | hover |
| `--lx-brand-on` | `#ffffff` | `#0b1f13` | 品牌底色上的文字 |
| `--lx-brand-soft` | `#e6f6ee` | `#12291c` | 软底（激活 tab 底、选中态） |
| `--lx-brand-border` | `#b3e2c8` | `#1f4530` | 软底描边、focus 环 |

对比度（实测，WCAG）：`#157f4a` on `#ffffff` = **5.04:1**（正文 AA ✓）；`#4ade80` on `#0e1116` = **10.9:1**（✓）；`#ffffff` on `#157f4a` = **5.04:1**（✓）。

### 5.2 中性色阶

| 令牌 | light | dark | 用途 |
| --- | --- | --- | --- |
| `--lx-bg` | `#f6f7f9` | `#0e1116` | 页面底 |
| `--lx-sunken` | `#eceef1` | `#14181e` | 凹陷区（server-box、图表底） |
| `--lx-card` | `#ffffff` | `#1a1f26` | 卡片 |
| `--lx-raised` | `#ffffff` | `#222933` | 浮层（modal、toast） |
| `--lx-line` | `#e3e6ea` | `#2b323c` | 分隔线 |
| `--lx-border-strong` | `#c9cfd6` | `#3d4550` | 输入框/按钮默认描边 |
| `--lx-muted` | `#5d6b7a` | `#98a2b3` | 次要文字 |
| `--lx-text` | `#1b2430` | `#e6e9ee` | 正文 |
| `--lx-heading` | `#0e141c` | `#f2f4f7` | 标题 |

对比度（实测）：正文 `#1b2430`/`#f6f7f9` = **13.5:1**；muted `#5d6b7a`/`#ffffff` = **4.9:1**（AA ✓）；dark muted `#98a2b3`/`#1a1f26` = **7.0:1**；dark text `#e6e9ee`/`#1a1f26` = **12.6:1**。

### 5.3 状态色（三件套：bg / border / text，图标复用 text 色）

变量命名：`<state>` ∈ ok / warn / danger，三色分别为 `--lx-<state>-bg`、`--lx-<state>-border`、`--lx-<state>-text`。

| 状态 | light bg / border / text | dark bg / border / text |
| --- | --- | --- |
| 成功 ok | `#ecfdf3` / `#a6e9c5` / `#067647` | `#0d2a1d` / `#1f5a3d` / `#75e0a7` |
| 警告 warn | `#fffaeb` / `#f5d98b` / `#93370d` | `#2e2410` / `#5c4a1f` / `#fec84b` |
| 危险 danger | `#fef3f2` / `#f5b8b2` / `#b42318` | `#331715` / `#5c2b27` / `#fda29b` |
| 信息 info | 复用 brand-soft 三件套 | 复用 brand-soft 三件套 |

冻结规则：成功色与品牌色同属绿族但**不允许出现在同一组件的同一层级**（徽标 ok vs 激活 tab 不并排）；所有状态必须同时带文案或图标，禁止只靠颜色传达；`--lx-warn-text` 亮主题取 `#93370d`（on `#fffaeb` = **7.2:1**，修复现状 4.6 临界值）。

## 6. 圆角 / 阴影 / 边框

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--lx-radius-sm` | 6px | 输入、按钮、徽标内元素 |
| `--lx-radius-md` | 10px | 卡片、notice |
| `--lx-radius-lg` | 14px | modal、toast |
| `--lx-radius-full` | 999px | 徽标、头像位 |
| `--lx-shadow-1` | `0 1px 2px rgba(14,20,28,.06)` | 卡片（dark 下改为 1px 亮描边思路，不用阴影） |
| `--lx-shadow-2` | `0 12px 32px -8px rgba(14,20,28,.18)` | modal/toast |
| 边框 | 统一 1px；默认 `--lx-line`，可交互默认 `--lx-border-strong`，focus 用品牌色 2px outline + 2px offset |

暗主题层级靠 `raised` 色 + 描边，不靠阴影。

## 7. 动效与微交互规范

### 7.1 动效 token

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--lx-motion-fast` | 120ms | hover/active 反馈 |
| `--lx-motion-base` | 200ms | 视图切换、tab、展开收起 |
| `--lx-motion-slow` | 320ms | modal/toast 入场 |
| `--lx-ease-standard` | `cubic-bezier(.2,.6,.3,1)` | 默认 |
| `--lx-ease-out` | `cubic-bezier(.16,1,.3,1)` | 入场（上浮/淡入） |

纪律：只动 `opacity` 与 `transform`（合成层属性）；入场位移 ≤ 8px；同一屏同时进行的动画 ≤ 3 个；`@media (prefers-reduced-motion: reduce)` 下所有 transition/animation 时长归 0（状态变化保留，过程去除）。全部 CSS 实现，home 保持零脚本。

### 7.2 五态规范（所有可交互元素一致执行）

| 状态 | 规范 |
| --- | --- |
| hover | 背景/描边向 `--lx-brand-soft` 或 `--lx-border-strong` 方向变化 + fast transition；禁止只有光标变化 |
| active | `transform: scale(.98)`（按钮）或亮度下探；按压有「沉下去」反馈 |
| focus | `:focus-visible` → 2px `--lx-brand` outline + 2px offset；所有可交互元素无一例外（含 `.btn`、`.icon-btn`、`.mode-option`、表格行操作） |
| disabled | 透明度 .5 + 去饱和（`filter: saturate(.4)`）+ `cursor: not-allowed`；禁只靠透明度 |
| loading | 按钮内文字替换为 spinner（CSS border 旋转圆环，16px，品牌色描边）+ 保留宽度不抖动；数据区用骨架条（`--lx-sunken` 上的 brand-soft 呼吸渐变） |

空状态组件：图标位（40px，muted 色）+ h3 标题 + small 说明 + 可选次级操作；toast：右上角滑入（ease-out 320ms），成功/失败用状态色三件套，4s 自动消退。

## 8. 响应式断点与页面布局

断点：**≤640（移动）/ 641–1023（平板）/ ≥1024（桌面）**。CSS 自定义属性不可在 `@media` 条件中解析（`@media (max-width: var(...))` 非法），且本项目无预处理器，因此 `tokens.ts` 导出 TypeScript 常量 `export const BREAKPOINTS = { sm: 640, md: 1024 } as const` 供 JS 使用；各页内联 `<style>` 中的 `@media` 一律写字面量 `640px` / `1024px`（单一真源为 `BREAKPOINTS` 常量，改断点时同步字面量）。触控目标 ≥ 40×40px（含 theme-btn、btn.sm、icon-btn，现状全部不达标需放大）。

| 页面 | ≥1024 | 641–1023 | ≤640 |
| --- | --- | --- | --- |
| home | 容器 640px 居中，brand 横排，卡片 padding 24 | 同桌面，容器 padding 收窄 | 容器 padding 16，按钮组纵向堆叠（主 CTA 全宽在上） |
| register | 容器 520px 居中，单列表单 | 同桌面 | 全宽卡片，成功态凭据区块允许横向滚动而非断行溢出 |
| admin | 容器 1180px，KPI 4 列，表格全列 | KPI 2 列，表格保留关键列 + 横滚兜底 | KPI 2 列，**用户表降级为卡片列表**（用户名/状态/设备数前置，操作按钮成组），tabs 可横滚不折行遮挡，modal 全屏抽屉化 |

规则：任何宽度无横向滚动（表格卡片化后）、无文字截断（截断必须 ellipsis + title 或换行）、导航不遮挡内容。

---

## 9. 落地映射（Stage 2/3/4 对号执行）

- Stage 2：建 `src/ui/tokens.ts`（§2–§7 全部令牌），三页接入令牌层并清除裸色/裸间距。
- Stage 3：按 §1 差距清单逐页重构排版/留白/层级/配色/品牌印记；favicon 保持不变。
- Stage 4：§7 动效与五态、§8 响应式（含用户表卡片化）。
- 回归红线（父单冻结契约）：CSP 不变、路由与导出名不变、`LX Music server 管理面板` 等测试依赖文案保留、admin `[data-theme="dark"]` + localStorage 三态主题切换保留、home 禁 JS 可用、动态值只走 textContent。
- **测试同步**：`src/routes/pages.test.ts:1348-1375` 目前对旧 CSS 字面量（如 `--bg: #f4f5f7`、`--bg: #111418`、`--primary-soft`）有硬编码断言；Stage 2 替换令牌层时必须同步更新这些断言（admin 不得含 `@media (prefers-color-scheme: dark)` 的断言保留），改动前报 Mike 批准。

本契约自写入 PR 起冻结；变更须经 Mike 裁决并回填本文档。
