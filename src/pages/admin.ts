// The admin panel is a single self-contained HTML document: inline styles and
// inline vanilla JS, no build step and no external resources, so it keeps
// working on offline/intranet deployments.
//
// Every dynamic value (user names, device names, error copy) is written with
// textContent. The page never builds markup from strings, which is what keeps
// stored XSS from a user-controlled field out of the admin session.
//
// The client script deliberately avoids template literals and `${` so the
// whole document can live in one outer template below.

import { adminTokenCss } from '@/ui/tokens'

const adminStyles = `
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--lx-bg);
  color: var(--lx-text);
  font-family: var(--lx-font-body);
  font-size: var(--lx-text-body-size);
  font-weight: var(--lx-text-body-weight);
  line-height: var(--lx-text-body-lh);
  letter-spacing: var(--lx-text-body-tracking);
}
body.modal-open { overflow: hidden; }
.wrap { max-width: 1180px; margin: 0 auto; padding: var(--lx-space-5) var(--lx-space-4) var(--lx-space-8); }

/* --- Top bar: one brand row, then the page's working area ---------------- */
.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--lx-space-4);
  margin-bottom: var(--lx-space-5);
  padding-bottom: var(--lx-space-4);
  border-bottom: 1px solid var(--lx-line);
  flex-wrap: wrap;
}
.topbar h1 {
  font-size: var(--lx-text-h1-size);
  font-weight: var(--lx-text-h1-weight);
  line-height: var(--lx-text-h1-lh);
  letter-spacing: var(--lx-text-h1-tracking);
  color: var(--lx-heading);
  margin: 0 0 var(--lx-space-1);
}
.topbar-actions { display: flex; align-items: center; gap: var(--lx-space-2); flex-wrap: wrap; }
/* 品牌块：logo 的垂直中线对齐 h1 大标题的中线，而不是「标题+副标题」整块。
   做法：h1 的行盒与 logo 等高（--brand-logo-size）后两者顶端对齐，两条中线
   自然重合；副标题排在 h1 之下，不参与 logo 定位。 */
.brand { --brand-logo-size: 28px; display: flex; align-items: flex-start; gap: 10px; }
.brand svg { flex: none; }
.brand h1 { line-height: var(--brand-logo-size); }
/* 主题切换：三段式图标按钮组。图标用 currentColor 着色，亮/暗两套主题下
   都直接跟随文字色，因此不需要第二套图标配色。按钮尺寸走控件高度 token
   （与 .btn / input 同一节奏），不在页面里写裸尺寸（项 6）。外层容器去掉
   内边距与边框、只用圆角背景区分分组，整体高度与 .btn 顶栏节奏一致。
   首/末段按钮外侧上下角各用 --lx-radius-pill（18px，即 36px 控件高度
   的一半），竖向拼成半圆，与胶囊外轮廓融合；水平方向与内角 6px 之和
   24px ≤ 按钮宽 36px，不触发 CSS 相邻圆角缩放，内角保持 --lx-radius-sm。
   不用 999px 外角：会把内角按比例压成直角（CSS 相邻圆角缩放）。
   也不用容器 overflow: hidden 剪裁，以免剪掉端部按钮 focus-visible
   的外描边。 */
.theme-switch {
  display: inline-flex; align-items: center; gap: var(--lx-space-1);
  padding: 0; border: none; border-radius: var(--lx-radius-full);
  background: var(--lx-sunken);
}
.theme-btn:first-child {
  border-top-left-radius: var(--lx-radius-pill);
  border-bottom-left-radius: var(--lx-radius-pill);
}
.theme-btn:last-child {
  border-top-right-radius: var(--lx-radius-pill);
  border-bottom-right-radius: var(--lx-radius-pill);
}
.theme-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--lx-control-height); height: var(--lx-control-height); padding: 0;
  border: 1px solid transparent; border-radius: var(--lx-radius-sm);
  background: transparent; color: var(--lx-muted); cursor: pointer;
  transition:
    background-color var(--lx-motion-fast) var(--lx-ease-standard),
    border-color var(--lx-motion-fast) var(--lx-ease-standard),
    color var(--lx-motion-fast) var(--lx-ease-standard);
}
.theme-btn:hover { color: var(--lx-text); border-color: var(--lx-line); }
.theme-btn[aria-pressed="true"] {
  color: var(--lx-brand); background: var(--lx-brand-soft); border-color: var(--lx-brand);
}
.theme-btn:focus-visible { outline: 2px solid var(--lx-brand); outline-offset: 2px; }
.theme-btn svg { display: block; }

/* --- Tabs: label-grade type, brand underline for the active view --------- */
.tabs {
  display: flex; gap: var(--lx-space-1);
  border-bottom: 1px solid var(--lx-line);
  margin-bottom: var(--lx-space-5);
}
.tab {
  border: none; background: transparent; color: var(--lx-muted); font: inherit;
  padding: var(--lx-space-2) var(--lx-space-3); cursor: pointer; white-space: nowrap;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition:
    background-color var(--lx-motion-fast) var(--lx-ease-standard),
    border-color var(--lx-motion-base) var(--lx-ease-standard),
    color var(--lx-motion-fast) var(--lx-ease-standard);
}
.tab:hover { color: var(--lx-text); background: var(--lx-sunken); }
.tab:active { transform: translateY(1px); }
.tab.active {
  color: var(--lx-brand);
  border-bottom-color: var(--lx-brand);
  font-weight: var(--lx-text-label-weight);
}
.tab:focus-visible { outline: 2px solid var(--lx-brand); outline-offset: -2px; }

h2 {
  font-size: var(--lx-text-h2-size);
  font-weight: var(--lx-text-h2-weight);
  line-height: var(--lx-text-h2-lh);
  letter-spacing: var(--lx-text-h2-tracking);
  color: var(--lx-heading);
  margin: 0;
}
.eyebrow {
  margin: 0 0 var(--lx-space-2);
  color: var(--lx-brand);
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-label-weight);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-label-tracking);
  text-transform: uppercase;
}
.muted { color: var(--lx-muted); }
.center { text-align: center; }
.card {
  background: var(--lx-card);
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-md);
  padding: var(--lx-space-5);
  box-shadow: var(--lx-shadow-1);
}
.card + .card, .kpi-grid + .card, .card + .kpi-grid { margin-top: var(--lx-space-4); }
.card + .build-line { margin-top: var(--lx-space-5); }
.section-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--lx-space-3);
  margin-bottom: var(--lx-space-4); padding-bottom: var(--lx-space-3);
  border-bottom: 1px solid var(--lx-line);
  flex-wrap: wrap;
}
.section-head .muted { font-size: var(--lx-text-small-size); line-height: var(--lx-text-small-lh); }
.login-card { max-width: 420px; margin: var(--lx-space-7) auto; }
.login-card .muted { font-size: var(--lx-text-small-size); line-height: var(--lx-text-small-lh); margin: var(--lx-space-1) 0 var(--lx-space-4); }
.login-card .stack { gap: var(--lx-space-4); }
.stack { display: flex; flex-direction: column; gap: var(--lx-space-3); }
.field { display: flex; flex-direction: column; gap: var(--lx-space-2); }
.field-label {
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-label-weight);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-label-tracking);
  color: var(--lx-heading);
}
input, select, button { font: inherit; }
input, select {
  width: 100%;
  /* Regular control height (item 1/4: the spacing scale is not a control
     height). Field height = 2×8px padding + 2×1px border + the control-height
     step, landing on the regular control rhythm shared with .btn and
     .theme-btn. */
  min-height: var(--lx-control-height);
  padding: var(--lx-space-2) var(--lx-space-3);
  border: 1px solid var(--lx-border-strong);
  border-radius: var(--lx-radius-sm);
  background: var(--lx-card);
  color: var(--lx-text);
}
input:focus, select:focus { outline: 2px solid var(--lx-brand); outline-offset: 2px; }
input:disabled, select:disabled { opacity: 0.5; filter: saturate(0.4); cursor: not-allowed; }
.hint {
  color: var(--lx-muted);
  font-size: var(--lx-text-small-size);
  font-weight: var(--lx-text-small-weight);
  line-height: var(--lx-text-small-lh);
  letter-spacing: var(--lx-text-small-tracking);
}
.hint.warn { color: var(--lx-warn-text); }
.hint.ok { color: var(--lx-ok-text); }
.form-error {
  color: var(--lx-danger-text);
  background: var(--lx-danger-bg);
  border: 1px solid var(--lx-danger-border);
  border-radius: var(--lx-radius-sm);
  padding: var(--lx-space-2) var(--lx-space-3);
  margin: 0;
  font-size: var(--lx-text-small-size);
  line-height: var(--lx-text-small-lh);
}

/* --- Buttons: one solid brand CTA, outlined secondaries, outlined danger -- */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  /* Same control-height step as input/select: padding (2×8px) + border
     (2×1px) + height lands every button on the same 54px rhythm. */
  min-height: var(--lx-control-height);
  border: 1px solid var(--lx-border-strong); border-radius: var(--lx-radius-sm); padding: var(--lx-space-2) var(--lx-space-3);
  background: var(--lx-card); color: var(--lx-text); cursor: pointer; white-space: nowrap;
  transition:
    background-color var(--lx-motion-fast) var(--lx-ease-standard),
    border-color var(--lx-motion-fast) var(--lx-ease-standard),
    color var(--lx-motion-fast) var(--lx-ease-standard),
    transform var(--lx-motion-crisp) var(--lx-ease-standard);
}
.btn:hover:not(:disabled) { border-color: var(--lx-muted); background: var(--lx-sunken); }
.btn:active:not(:disabled) { transform: scale(0.98); }
.btn:focus-visible { outline: 2px solid var(--lx-brand); outline-offset: 2px; }
.btn:disabled { opacity: 0.5; filter: saturate(0.4); cursor: not-allowed; }
.btn[aria-busy="true"]::before {
  content: '';
  flex: none;
  width: var(--lx-space-4);
  height: var(--lx-space-4);
  margin-right: var(--lx-space-2);
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: var(--lx-radius-full);
  animation: lx-spin var(--lx-motion-spin) linear infinite;
}
@keyframes lx-spin { to { transform: rotate(360deg); } }
.btn.primary { background: var(--lx-brand); border-color: var(--lx-brand); color: var(--lx-brand-on); }
.btn.primary:hover:not(:disabled) { background: var(--lx-brand-hover); border-color: var(--lx-brand-hover); }
/* Danger stays an outline everywhere: the dark palette's danger-text is a pale
   coral that reads as a pale solid fill, so a filled danger button would look
   inverted once the theme flips (Stage 2 review, ONE-145 nit 1). The status
   color still marks the action, and the confirmation copy carries the meaning. */
.btn.danger {
  background: var(--lx-danger-bg);
  border-color: var(--lx-danger-border);
  color: var(--lx-danger-text);
}
.btn.danger:hover:not(:disabled) {
  background: var(--lx-danger-bg);
  border-color: var(--lx-danger-text);
  color: var(--lx-danger-text);
  box-shadow: inset 0 0 0 1px var(--lx-danger-text);
}
.btn.danger:active:not(:disabled) { background: var(--lx-danger-border); }
.btn.ghost { background: transparent; }
.btn.sm { padding: var(--lx-space-1) var(--lx-space-3); font-size: var(--lx-text-small-size); min-height: var(--lx-space-6); }
.grid-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--lx-space-4); align-items: start; }
/* 添加用户 / 登录的提交按钮跟随常规按钮尺寸（项 5）：只对齐纵向，不再
   把它撑到输入框的旧高度。 */
.form-actions { display: flex; align-items: end; }
.grid-form .form-error { grid-column: 1 / -1; }

/* --- Tables -------------------------------------------------------------- */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td {
  text-align: left;
  padding: var(--lx-space-2) var(--lx-space-3);
  border-bottom: 1px solid var(--lx-line);
  vertical-align: top;
}
th {
  font-size: var(--lx-text-label-size);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-label-tracking);
  color: var(--lx-muted);
  font-weight: var(--lx-text-label-weight);
  white-space: nowrap;
}
tbody tr:last-child td { border-bottom: none; }
.user-row { transition: background-color var(--lx-motion-fast) var(--lx-ease-standard); }
.user-row:hover { background: var(--lx-sunken); }
.name-cell {
  font-weight: var(--lx-text-h3-weight);
  color: var(--lx-heading);
  word-break: break-all;
}
.actions-col { white-space: nowrap; }
.row-actions { display: flex; gap: var(--lx-space-2); flex-wrap: nowrap; }
/* 用户表专属布局：7 列全部左对齐；用户名列宽收缩到 18%，长用户名换行，富余宽度交给其余列。
   全部选择器都限定在 .users-table 内，残留数据表与弹窗按钮布局不受影响。 */
.users-table { table-layout: auto; width: 100%; }
.users-table th, .users-table td { white-space: nowrap; }
/* 用户名不再 width: 100% 吃满富余宽度：固定 18%、最小 160px，长名字换行而不是把表格撑宽。 */
.users-table th:first-child, .users-table td:first-child { width: 18%; min-width: 160px; white-space: normal; }
.users-table .row-actions { justify-content: flex-start; flex-wrap: nowrap; }

/* --- Status badges: label type + state colour trio + text (never colour
   alone) ---------------------------------------------------------------- */
.badge {
  display: inline-flex; align-items: center; gap: var(--lx-space-1);
  padding: var(--lx-space-1) var(--lx-space-2);
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-full);
  font-size: var(--lx-text-label-size);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-label-tracking);
  font-weight: var(--lx-text-label-weight);
  background: var(--lx-sunken);
  color: var(--lx-muted);
  white-space: nowrap;
  transition:
    background-color var(--lx-motion-fast) var(--lx-ease-standard),
    border-color var(--lx-motion-fast) var(--lx-ease-standard),
    color var(--lx-motion-fast) var(--lx-ease-standard);
}
.badge::before {
  content: '';
  width: var(--lx-space-1);
  height: var(--lx-space-1);
  border-radius: var(--lx-radius-full);
  background: currentColor;
}
.badge.ok { background: var(--lx-ok-bg); color: var(--lx-ok-text); border-color: var(--lx-ok-border); }
/* Shape as well as hue: warn reads as a pill, danger as a ring, so the state
   survives greyscale printing and colour-vision differences. */
.badge.warn::before { width: var(--lx-space-2); height: var(--lx-space-1); }
.badge.danger::before { background: transparent; border: 1px solid currentColor; }
.badge.warn { background: var(--lx-warn-bg); color: var(--lx-warn-text); border-color: var(--lx-warn-border); }
.badge.danger { background: var(--lx-danger-bg); color: var(--lx-danger-text); border-color: var(--lx-danger-border); }

.data-status { min-width: 210px; }
.status-line {
  display: flex; gap: var(--lx-space-2);
  font-size: var(--lx-text-small-size);
  line-height: var(--lx-text-small-lh);
  font-variant-numeric: tabular-nums;
}
.status-line + .status-line { margin-top: var(--lx-space-1); }
.status-key {
  color: var(--lx-muted);
  min-width: 36px;
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-label-weight);
  letter-spacing: var(--lx-text-label-tracking);
}

/* --- Empty / unknown / unavailable states --------------------------------
   Each state says what is missing and what to do, in a slot that is designed
   rather than a bare muted line (docs/design-system.md §7.2). */
.empty {
  display: flex; align-items: center; gap: var(--lx-space-3);
  color: var(--lx-muted);
  padding: var(--lx-space-4) 0 var(--lx-space-1);
  margin: 0;
  font-size: var(--lx-text-small-size);
  line-height: var(--lx-text-small-lh);
}
.empty::before {
  content: '';
  flex: none;
  width: var(--lx-space-5);
  height: var(--lx-space-5);
  border: 1px dashed var(--lx-border-strong);
  border-radius: var(--lx-radius-full);
}
.empty, .data-unavailable, .todo-unknown {
  animation: lx-fade-up var(--lx-motion-base) var(--lx-ease-out) both;
}
@keyframes lx-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
/* Boot / first-paint placeholder: a skeleton bar instead of a bare ellipsis,
   so "loading" reads as a slot waiting for data rather than as content
   (docs/design-system.md §7.2 loading). */
#boot {
  display: block;
  width: 100%;
  margin: var(--lx-space-7) 0;
  text-align: center;
}
#boot::before {
  content: '';
  display: inline-block;
  width: var(--lx-space-8);
  height: var(--lx-space-3);
  margin-right: var(--lx-space-2);
  vertical-align: middle;
  border-radius: var(--lx-radius-full);
  background: var(--lx-sunken);
}
/* Unknown KPI values are quieter than real numbers: same slot, muted colour,
   so a dash never competes with a metric that has actually loaded. */
.kpi-value { color: var(--lx-heading); }
.mode-options { display: grid; gap: var(--lx-space-3); }
.mode-option {
  display: flex; gap: var(--lx-space-3); align-items: flex-start;
  padding: var(--lx-space-3);
  border: 1px solid var(--lx-border-strong);
  border-radius: var(--lx-radius-sm);
  cursor: pointer;
  transition:
    background-color var(--lx-motion-fast) var(--lx-ease-standard),
    border-color var(--lx-motion-fast) var(--lx-ease-standard);
}
.mode-option:hover { border-color: var(--lx-muted); background: var(--lx-sunken); }
.mode-option:has(input:checked) {
  border-color: var(--lx-brand);
  background: var(--lx-brand-soft);
}
.mode-option:has(input:focus-visible) {
  outline: 2px solid var(--lx-brand);
  outline-offset: 2px;
}
.mode-option input { width: auto; min-height: 0; margin-top: 3px; }
.mode-option span { display: flex; flex-direction: column; gap: var(--lx-space-1); }
.mode-option strong {
  font-size: var(--lx-text-h3-size);
  font-weight: var(--lx-text-h3-weight);
  line-height: var(--lx-text-h3-lh);
  letter-spacing: var(--lx-text-h3-tracking);
  color: var(--lx-heading);
}
.mode-option .muted { font-size: var(--lx-text-small-size); line-height: var(--lx-text-small-lh); }
.check { display: flex; gap: var(--lx-space-2); align-items: flex-start; cursor: pointer; }
.check input { width: auto; min-height: 0; margin-top: 3px; }
.check:has(input:focus-visible), .field:has(input:focus-visible), .field:has(select:focus-visible) {
  outline: 2px solid var(--lx-brand);
  outline-offset: 2px;
}
/* 登录页密码输入框（.login-card 内唯一输入框）：聚焦态去掉绿色 outline
   （input 内层 + .field 外层两条规则都会命中，形成双层框），改用中性强调色
   边框作为焦点指示，保持键盘可达。范围限定 .login-card，不影响「添加用户」
   与「系统设置」里的输入框。 */
.login-card input:focus,
.login-card input:focus-visible {
  outline: none;
  border-color: var(--lx-heading);
}
.login-card .field:has(input:focus-visible) {
  outline: none;
}
.notice {
  border-radius: var(--lx-radius-sm);
  padding: var(--lx-space-2) var(--lx-space-3);
  margin-bottom: var(--lx-space-4);
  background: var(--lx-sunken);
  border: 1px solid var(--lx-line);
  font-size: var(--lx-text-small-size);
  line-height: var(--lx-text-small-lh);
}
.notice.ok { background: var(--lx-ok-bg); color: var(--lx-ok-text); border-color: var(--lx-ok-border); }
.notice.warn { background: var(--lx-warn-bg); color: var(--lx-warn-text); border-color: var(--lx-warn-border); }
.notice.err { background: var(--lx-danger-bg); color: var(--lx-danger-text); border-color: var(--lx-danger-border); }

/* --- Modal --------------------------------------------------------------- */
.modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--lx-space-4); z-index: 20; }
.modal[hidden] { display: none !important; }
.modal-backdrop {
  position: absolute; inset: 0; background: var(--lx-backdrop); opacity: 0.55;
  animation: lx-fade var(--lx-motion-base) var(--lx-ease-standard) both;
}
.modal-card {
  position: relative;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--lx-raised);
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-lg);
  padding: var(--lx-space-5);
  box-shadow: var(--lx-shadow-2);
  animation: lx-modal-in var(--lx-motion-slow) var(--lx-ease-emphasized) both;
}
@keyframes lx-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes lx-modal-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.modal-head {
  display: flex; align-items: center; justify-content: space-between; gap: var(--lx-space-3);
  margin-bottom: var(--lx-space-3);
  padding-bottom: var(--lx-space-3);
  border-bottom: 1px solid var(--lx-line);
}
.modal-desc {
  color: var(--lx-muted);
  margin: 0 0 var(--lx-space-4);
  font-size: var(--lx-text-small-size);
  line-height: var(--lx-text-small-lh);
}
.modal-desc:empty { display: none; }
.modal-actions {
  display: flex; justify-content: flex-end; gap: var(--lx-space-2);
  margin-top: var(--lx-space-5);
  padding-top: var(--lx-space-4);
  border-top: 1px solid var(--lx-line);
}
.icon-btn {
  border: none; background: transparent; color: var(--lx-muted);
  font-size: var(--lx-text-h1-size); line-height: 1; cursor: pointer;
  padding: var(--lx-space-2); border-radius: var(--lx-radius-sm);
  transition:
    background-color var(--lx-motion-fast) var(--lx-ease-standard),
    color var(--lx-motion-fast) var(--lx-ease-standard);
}
.icon-btn:hover { background: var(--lx-sunken); color: var(--lx-text); }
.icon-btn:active { transform: scale(0.96); }
.icon-btn:focus-visible { outline: 2px solid var(--lx-brand); outline-offset: 2px; }

code {
  font-family: var(--lx-font-mono);
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-small-weight);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-small-tracking);
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}

/* --- Dashboard ----------------------------------------------------------- */
.kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--lx-space-3); margin-bottom: var(--lx-space-4); }
.kpi { margin-bottom: 0; display: flex; flex-direction: column; gap: var(--lx-space-2); }
.kpi-label {
  color: var(--lx-muted);
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-label-weight);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-label-tracking);
}
.kpi-value {
  font-size: var(--lx-text-display-size);
  font-weight: var(--lx-text-display-weight);
  line-height: var(--lx-text-display-lh);
  letter-spacing: var(--lx-text-display-tracking);
  color: var(--lx-heading);
  font-variant-numeric: tabular-nums;
}
.todo-list { display: flex; flex-direction: column; gap: var(--lx-space-2); }
.todo-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--lx-space-3);
  width: 100%; text-align: left; font: inherit; cursor: pointer;
  border: 1px solid var(--lx-line); background: var(--lx-sunken); color: var(--lx-text);
  border-radius: var(--lx-radius-sm); padding: var(--lx-space-3);
  transition:
    background-color var(--lx-motion-fast) var(--lx-ease-standard),
    border-color var(--lx-motion-fast) var(--lx-ease-standard),
    transform var(--lx-motion-crisp) var(--lx-ease-standard);
}
.todo-item:hover { border-color: var(--lx-border-strong); background: var(--lx-card); }
.todo-item:active { transform: scale(0.99); }
.todo-item:focus-visible { outline: 2px solid var(--lx-brand); outline-offset: 2px; }
.todo-arrow { color: var(--lx-brand); font-weight: var(--lx-text-label-weight); }
.data-unavailable {
  margin: 0; padding: var(--lx-space-3);
  border: 1px dashed var(--lx-border-strong);
  border-radius: var(--lx-radius-sm);
  color: var(--lx-text);
  background: var(--lx-sunken);
  font-size: var(--lx-text-small-size);
  line-height: var(--lx-text-small-lh);
}
.todo-unknown {
  margin: 0; padding: var(--lx-space-3);
  border: 1px dashed var(--lx-border-strong);
  border-radius: var(--lx-radius-sm);
  color: var(--lx-muted);
  background: var(--lx-sunken);
  font-size: var(--lx-text-small-size);
  line-height: var(--lx-text-small-lh);
}
.chart {
  display: flex; align-items: flex-end; gap: var(--lx-space-1);
  height: 120px; padding-top: var(--lx-space-2);
  font-variant-numeric: tabular-nums;
}
.chart-col {
  flex: 1 1 0; min-width: 0; height: 100%; display: flex; align-items: flex-end;
  /* 键盘可达（项 3）：柱条容器可聚焦，focus 时与 hover 同样变暗。
     position: relative 是 ::after tooltip 的包含块：没有它，绝对定位会退化
     到根视口，提示会飘到页面顶部、横向居中到整页而不是柱条（评审打回 #1）。 */
  position: relative;
  transition: opacity var(--lx-motion-fast) var(--lx-ease-standard);
  border-radius: var(--lx-radius-sm);
}
.chart-col:hover, .chart-col:focus-visible { opacity: 0.72; }
.chart-col:focus-visible { outline: 2px solid var(--lx-brand); outline-offset: 1px; }
/* 柱顶日期（项 3）：纯 CSS tooltip，hover / focus / 触屏点按均可达，
   不新增任何脚本，CSP 无需变动。 */
.chart-col::after {
  content: attr(data-label);
  position: absolute; bottom: calc(100% + var(--lx-space-1)); left: 50%;
  transform: translateX(-50%);
  padding: var(--lx-space-1) var(--lx-space-2);
  border: 1px solid var(--lx-line); border-radius: var(--lx-radius-sm);
  background: var(--lx-raised); color: var(--lx-text);
  font-size: var(--lx-text-label-size);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-label-tracking);
  white-space: nowrap; pointer-events: none;
  opacity: 0; visibility: hidden;
  transition:
    opacity var(--lx-motion-fast) var(--lx-ease-standard),
    visibility var(--lx-motion-fast) var(--lx-ease-standard);
  z-index: 1;
}
.chart-col:hover::after, .chart-col:focus-visible::after {
  opacity: 1; visibility: visible;
}
.chart-bar {
  width: 100%; background: var(--lx-brand); border-radius: var(--lx-radius-sm) var(--lx-radius-sm) 0 0;
  transition: height var(--lx-motion-base) var(--lx-ease-out);
}
.chart-bar.zero { background: var(--lx-line); min-height: 2px; }
.chart-range { margin: var(--lx-space-2) 0 0; font-size: var(--lx-text-label-size); letter-spacing: var(--lx-text-label-tracking); }
.build-line {
  margin: 0; font-size: var(--lx-text-label-size); text-align: center;
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--lx-text-label-tracking);
  font-family: var(--lx-font-mono);
}

/* --- About --------------------------------------------------------------- */
.about-hero { display: flex; flex-direction: column; gap: var(--lx-space-1); }
.about-hero h2 { font-size: var(--lx-text-h2-size); }
.about-list { margin: 0; }
.about-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: var(--lx-space-3);
  align-items: baseline;
  padding: var(--lx-space-2) 0;
  border-bottom: 1px solid var(--lx-line);
}
.about-row:last-child { border-bottom: none; }
.about-row dt {
  color: var(--lx-muted);
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-label-weight);
  letter-spacing: var(--lx-text-label-tracking);
}
.about-row dd { margin: 0; word-break: break-all; }
.about-row a { color: var(--lx-brand); }

/* --- Responsive: ≥1024 desktop, 641–1023 tablet, ≤640 mobile ------------- */
@media (max-width: 1024px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
/* Narrow layouts turn every result set into cards: labels come from each
   td[data-label], so the table stays semantic while the user no longer has to
   scroll sideways to reach a value or an action. */
@media (max-width: 640px) {
  .wrap { padding: var(--lx-space-4) var(--lx-space-3) var(--lx-space-7); }
  .topbar { gap: var(--lx-space-3); }
  .topbar-actions { width: 100%; justify-content: space-between; }
  .card { padding: var(--lx-space-4); }
  .tabs {
    overflow-x: auto; flex-wrap: nowrap; overscroll-behavior-x: contain;
    scrollbar-width: thin; -webkit-overflow-scrolling: touch;
  }
  .tab { min-height: var(--lx-control-tap); }
  .users-table, .users-table tbody, .users-table tr, .users-table td { display: block; width: 100%; }
  .users-table thead {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap;
  }
  .users-table tr {
    margin-bottom: var(--lx-space-3); padding: var(--lx-space-3);
    border: 1px solid var(--lx-line); border-radius: var(--lx-radius-md);
    background: var(--lx-sunken);
  }
  .users-table tr:last-child { margin-bottom: 0; }
  .users-table td {
    display: grid; grid-template-columns: 88px minmax(0, 1fr);
    gap: var(--lx-space-3); align-items: baseline;
    padding: var(--lx-space-2) 0; border-bottom: 1px solid var(--lx-line);
    white-space: normal; min-width: 0;
  }
  .users-table td::before {
    content: attr(data-label);
    color: var(--lx-muted);
    font-size: var(--lx-text-label-size);
    font-weight: var(--lx-text-label-weight);
    letter-spacing: var(--lx-text-label-tracking);
  }
  .users-table td:first-child {
    width: auto; min-width: 0; grid-template-columns: 1fr;
    font-size: var(--lx-text-h3-size); line-height: var(--lx-text-h3-lh);
    font-weight: var(--lx-text-h3-weight); color: var(--lx-heading);
    padding-top: 0;
  }
  .users-table td:first-child::before { content: none; }
  .users-table td:last-child {
    display: block; border-bottom: none; padding-bottom: 0;
  }
  .users-table td:last-child::before {
    display: block; margin-bottom: var(--lx-space-2);
  }
  .users-table .row-actions {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    flex-wrap: nowrap; gap: var(--lx-space-2);
  }
  .users-table .row-actions .btn {
    width: 100%; min-width: 0; min-height: var(--lx-control-tap); white-space: normal;
  }
  .users-table .actions-col, .users-table .row-actions { white-space: normal; }
  .data-status { min-width: 0; }
  .chart { height: 96px; }
  .kpi-value { font-size: var(--lx-text-h1-size); }
  .about-row { grid-template-columns: 1fr; gap: var(--lx-space-1); }
  .modal { align-items: flex-end; padding: 0; }
  .modal-card { max-width: none; max-height: 92vh; border-radius: var(--lx-radius-lg) var(--lx-radius-lg) 0 0; }
  .modal-actions { flex-direction: column-reverse; }
  .modal-actions .btn { width: 100%; min-height: var(--lx-control-tap); }
  .grid-form { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .btn:active:not(:disabled), .icon-btn:active, .todo-item:active, .tab:active {
    transform: none;
  }
}
`

const adminScript = `
(function () {
  'use strict'

  var USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/
  var STATUS_LABELS = { active: '正常', pending: '待批准', disabled: '已禁用' }
  var SOURCE_LABELS = { imported: '部署导入', self: '自助注册', admin: '管理员添加' }
  var MODE_LABELS = { closed: '关闭注册', open: '开放注册', approval: '需批准' }
  var TAB_ORDER = ['home', 'users', 'settings', 'about']
  var TABS = { home: '#home', users: '#users', settings: '#settings', about: '#about' }
  var DEFAULT_TAB = 'home'
  var ACTIVITY_DAYS = 30
  var UNKNOWN = '—'
  // Persistence key for the theme choice; the value is the mode itself
  // ('light' | 'dark' | 'auto') so it stays readable from the head script.
  var THEME_KEY = 'lx-admin-theme'

  // Bumped by resetData(). Every request captures the epoch it started in and
  // drops its result (success *or* failure) when the epoch moved on: after a
  // logout or a 401, a response that arrives late must neither land in state
  // nor repaint the DOM, otherwise the next login's first paint would show the
  // previous session's rows again (the F5 leak, one request later).
  var sessionEpoch = 0

  var state = {
    users: [],
    orphans: [],
    // Only true after the matching list request succeeded. Both the dashboard
    // and the two tables render "unknown" instead of stale rows or a
    // confident 0 when a list never arrived (or a refresh failed).
    usersLoaded: false,
    orphansLoaded: false,
    mode: 'approval',
    // The registration mode read is a three-outcome affair, not a boolean:
    // 'idle' (not requested yet), 'loading' (request in flight), 'ready' (mode
    // is known) and 'error' (no mode to show: the read failed, or the panel
    // load failed before the read could even be sent — enterPanel() settles
    // that case, but only while the state is still 'idle', so a concurrent
    // read's result is never overwritten). Only 'error' may claim a failure —
    // a pending read used to borrow that copy, so a fresh login showed
    // "读取失败" for the ~1.5s before /api/registration-info returned.
    modeStatus: 'idle',
    build: null
  }
  var modalState = {
    onSubmit: null,
    onCanSubmit: null,
    closeOnSuccess: true,
    busy: false,
    opener: null
  }

  function $(id) {
    return document.getElementById(id)
  }

  function tabFromHash() {
    for (var i = 0; i < TAB_ORDER.length; i++) {
      if (TABS[TAB_ORDER[i]] === location.hash) return TAB_ORDER[i]
    }
    return DEFAULT_TAB
  }

  function activateTab(tab) {
    var name = TABS[tab] ? tab : DEFAULT_TAB
    for (var i = 0; i < TAB_ORDER.length; i++) {
      var key = TAB_ORDER[i]
      var tabButton = $('tab-' + key)
      if (tabButton) tabButton.classList.toggle('active', key === name)
      var panel = $('tab-panel-' + key)
      if (panel) panel.hidden = key !== name
    }
  }

  function goTab(name) {
    var hash = TABS[name] || TABS[DEFAULT_TAB]
    if (location.hash !== hash) location.hash = hash
    activateTab(name)
  }

  // An unknown hash (or no hash at all) still shows the home tab, and the URL
  // is rewritten to match what is on screen without adding a history entry.
  function normalizeHash(tab) {
    if (location.hash === TABS[tab]) return
    for (var i = 0; i < TAB_ORDER.length; i++) {
      if (TABS[TAB_ORDER[i]] === location.hash) return
    }
    if (history.replaceState) history.replaceState(null, '', TABS[tab])
    else location.hash = TABS[tab]
  }

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined && text !== null) node.textContent = String(text)
    return node
  }

  function button(label, className, handler) {
    var node = el('button', className || 'btn ghost', label)
    node.type = 'button'
    node.addEventListener('click', function () {
      handler(node)
    })
    return node
  }

  function setBusy(node, busy) {
    node.disabled = busy
    node.setAttribute('aria-busy', busy ? 'true' : 'false')
  }

  // One shared escape target for every dynamic dialog: devices are loaded
  // after openModal() returns, so a title is attached when the dialog already
  // has a heading and the caller has not chosen one.
  function ensureDialogLabel(container) {
    if (!container || container.getAttribute('aria-labelledby')) return
    container.setAttribute('aria-labelledby', 'modal-title')
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild)
  }

  // --- Theme (light / dark / auto) ---------------------------------------
  //
  // The user's choice lives in localStorage and is mirrored onto <html>:
  // data-theme carries the *resolved* value ('auto' is resolved to the actual
  // light/dark before it lands there, so the stylesheet only needs
  // [data-theme="dark"]), while data-theme-mode keeps the choice itself. The
  // panel has no build step and no framework, so the document element is the
  // single source of truth for every painter — the three icon buttons only
  // mirror it back as aria-pressed.
  var darkMedia = null

  function readThemeMode() {
    try {
      var stored = localStorage.getItem(THEME_KEY)
      if (stored === 'light' || stored === 'dark' || stored === 'auto')
        return stored
    } catch (err) {
      // Blocked storage (private mode): behave as "no choice recorded".
    }
    return ''
  }

  function storeThemeMode(mode) {
    try {
      localStorage.setItem(THEME_KEY, mode)
    } catch (err) {
      // Persisting is a nicety: the choice still applies to this page.
    }
  }

  function systemTheme() {
    return darkMedia && darkMedia.matches ? 'dark' : 'light'
  }

  function themeMode() {
    var mode = document.documentElement.getAttribute('data-theme-mode')
    if (mode === 'light' || mode === 'dark' || mode === 'auto') return mode
    return 'light'
  }

  // aria-pressed is both the visual state (highlighted border/fill) and the
  // accessible one, so the highlight can never disagree with data-theme-mode:
  // one writer, no separate "active" class to keep in sync.
  function syncThemeButtons(mode) {
    var buttons = document.querySelectorAll('#theme-switch [data-theme-mode]')
    for (var i = 0; i < buttons.length; i++) {
      var pressed = buttons[i].getAttribute('data-theme-mode') === mode
      buttons[i].setAttribute('aria-pressed', pressed ? 'true' : 'false')
    }
  }

  function applyTheme(mode) {
    var resolved = mode === 'auto' ? systemTheme() : mode
    var root = document.documentElement
    root.setAttribute('data-theme', resolved)
    root.setAttribute('data-theme-mode', mode)
    root.style.colorScheme = resolved
    syncThemeButtons(mode)
  }

  function formatTime(value) {
    if (value === undefined || value === null || value === '') return '—'
    var date = new Date(value)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleString('zh-CN', { hour12: false })
  }

  function labelFrom(map, value) {
    return map[value] || String(value || '未知')
  }

  function statusClass(status) {
    if (status === 'active') return 'ok'
    if (status === 'pending') return 'warn'
    if (status === 'disabled') return 'danger'
    return ''
  }

  function validateName(name) {
    if (!name) return '请输入用户名'
    if (!USERNAME_RE.test(name)) return '用户名需为 3–32 位字母、数字、下划线或短横线'
    return ''
  }

  function validatePassword(password) {
    if (!password) return '请输入密码'
    if (password.length < 8) return '密码至少 8 位'
    if (password.length > 128) return '密码最多 128 位'
    return ''
  }

  function updatePasswordHint(input, hint) {
    if (!hint) return
    var length = input.value.length
    if (length >= 16) {
      hint.textContent = '密码长度符合建议'
      hint.className = 'hint ok'
    } else if (length >= 8) {
      hint.textContent = '密码强度较弱，建议使用 16 位以上随机密码'
      hint.className = 'hint warn'
    } else {
      hint.textContent = '至少 8 位，建议 16 位以上随机密码'
      hint.className = 'hint'
    }
  }

  function field(labelText, control) {
    var wrap = el('label', 'field')
    wrap.appendChild(el('span', 'field-label', labelText))
    wrap.appendChild(control)
    return wrap
  }

  function passwordField(labelText) {
    var input = document.createElement('input')
    input.type = 'password'
    input.autocomplete = 'new-password'
    var wrap = field(labelText, input)
    var hint = el('span', 'hint', '至少 8 位，建议 16 位以上随机密码')
    wrap.appendChild(hint)
    input.addEventListener('input', function () {
      updatePasswordHint(input, hint)
    })
    return { input: input, wrap: wrap }
  }

  var noticeTimer = null
  function notice(text, kind) {
    var node = $('notice')
    node.textContent = text
    node.className = 'notice' + (kind ? ' ' + kind : '')
    node.hidden = false
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(function () {
      node.hidden = true
    }, 5000)
  }

  class ApiError extends Error {
    constructor(status, data) {
      super('HTTP ' + status)
      this.status = status
      this.data = data
    }
  }

  async function api(path, options) {
    var opts = options || {}
    var init = {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: {}
    }
    if (opts.body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(opts.body)
    }
    var res
    try {
      res = await fetch(path, init)
    } catch (err) {
      throw new ApiError(0, null)
    }
    var data = null
    if (res.status !== 204) {
      var text = await res.text()
      if (text) {
        try {
          data = JSON.parse(text)
        } catch (err) {
          data = null
        }
      }
    }
    if (!res.ok) throw new ApiError(res.status, data)
    return data
  }

  function messageFor(err) {
    if (err.status === 0) return '网络错误，请检查连接后重试'
    if (err.status === 400) return '输入不符合要求'
    if (err.status === 401) return '登录已过期，请重新登录'
    if (err.status === 403) return '操作过于频繁，请稍后再试'
    if (err.status === 404) return '请求的数据不存在或管理面板未启用'
    if (err.status === 409) return '当前状态不允许此操作'
    if (err.status === 502) return '同步数据服务暂时不可用'
    return '请求失败（HTTP ' + err.status + '）'
  }

  function handleAuth(err) {
    if (err.status !== 401) return false
    endSession('登录已过期，请重新登录')
    return true
  }

  // Logout and session expiry must leave no trace of the previous session in
  // the DOM. Clearing state alone is not enough: the tables and the dashboard
  // would keep rendering the old rows (with their action buttons) until the
  // next load returns, and a slow request would expose them to clicks.
  function resetData() {
    // Any request already in flight belongs to the session that just ended.
    sessionEpoch++
    state.users = []
    state.orphans = []
    state.usersLoaded = false
    state.orphansLoaded = false
    state.build = null
    state.modeStatus = 'idle'
    // The registration mode is unknown until loadMode() returns: keeping the
    // previous value would present a stale selection as fact, so the radios
    // fall back to "nothing selected" and stay disabled (modeStatus = 'idle').
    state.mode = ''
    // These renderers already know the unknown state: they hide the table,
    // show the unavailable note, disable the mode radios and drop the build
    // footer / about values back to their fallbacks.
    renderUsers()
    renderOrphans()
    renderMode()
    renderBuildInfo()
    renderAbout()
  }

  // Single exit path for "this session's data must not stay on screen", used
  // by the logout button and by every 401 handler.
  function endSession(message) {
    resetData()
    showLogin(message)
  }

  function showLogin(message) {
    closeModal()
    // The login view is light, always: a theme belongs to a session. The
    // stored choice is deliberately *not* cleared here, so the next login
    // restores it (showPanel() re-applies it). Settling it in this one place
    // covers every entry — logout, 401, and init()'s non-401 failure branch
    // — because this function is what makes #login-view visible.
    applyTheme('light')
    $('boot').hidden = true
    $('panel-view').hidden = true
    $('tabs').hidden = true
    $('session-actions').hidden = true
    $('login-view').hidden = false
    $('login-password').value = ''
    var errorNode = $('login-error')
    if (message) {
      errorNode.textContent = message
      errorNode.hidden = false
    } else {
      errorNode.textContent = ''
      errorNode.hidden = true
    }
  }

  function showPanel() {
    $('boot').hidden = true
    $('login-view').hidden = true
    $('panel-view').hidden = false
    $('tabs').hidden = false
    $('session-actions').hidden = false
    // A session restores the last choice; a first visit with nothing recorded
    // starts on 'auto' (the head script could only resolve that to light, so
    // the system preference is picked up here).
    applyTheme(readThemeMode() || 'auto')
    var tab = tabFromHash()
    // Keep the URL and the visible panel in sync, including the first load
    // without a hash: the home tab is the landing page.
    normalizeHash(tab)
    activateTab(tab)
  }

  // The epoch argument is supplied by composite flows (refreshAll /
  // enterPanel) that started earlier: if a logout happens in between, the
  // whole chain becomes a no-op instead of repopulating a panel the user has
  // already left.
  function cell(label, className, text) {
    var node = el('td', className, text)
    node.setAttribute('data-label', label)
    return node
  }

  // Keep the user count chrome in one place (item 2): the users-tab summary
  // and the home KPI render the same state.users.length through kpiNumber.
  function renderUsersCount() {
    $('users-count').textContent =
      state.usersLoaded && state.users.length
        ? '共 ' + kpiNumber(state.users.length) + ' 个账号'
        : ''
  }

  async function loadUsers(epoch) {
    if (epoch === undefined) epoch = sessionEpoch
    var data
    try {
      data = await api('/api/admin/users')
      if (!data || !Array.isArray(data.users)) throw new ApiError(502, data)
    } catch (err) {
      // Same policy as the orphan list: a failed refresh drops the table into
      // its unavailable state instead of leaving rows with live action buttons
      // that may act on stale data. A response from an ended session is
      // dropped entirely.
      if (epoch !== sessionEpoch) return
      state.users = []
      state.usersLoaded = false
      renderUsers()
      throw err
    }
    if (epoch !== sessionEpoch) return
    state.users = data.users
    state.usersLoaded = true
    renderUsers()
  }

  async function loadOrphans(epoch) {
    if (epoch === undefined) epoch = sessionEpoch
    var data
    try {
      data = await api('/api/admin/orphans')
      if (!Array.isArray(data)) throw new ApiError(502, data)
    } catch (err) {
      // The list is unknown, not empty: drop back to the unknown state so the
      // home KPI and the settings table never show stale data (or a 0) that a
      // "彻底清理" click could act on.
      if (epoch !== sessionEpoch) return
      state.orphans = []
      state.orphansLoaded = false
      renderOrphans()
      throw err
    }
    if (epoch !== sessionEpoch) return
    state.orphans = data
    state.orphansLoaded = true
    renderOrphans()
  }

  async function loadMode(epoch) {
    if (epoch === undefined) epoch = sessionEpoch
    // A request from an ended session must not even repaint the hint.
    if (epoch !== sessionEpoch) return
    // Reading, not failing: the hint says so while the request is outstanding.
    state.modeStatus = 'loading'
    renderMode()
    try {
      var data = await api('/api/registration-info')
      if (epoch !== sessionEpoch) return
      state.mode = data && data.registrationMode ? data.registrationMode : 'approval'
      state.modeStatus = 'ready'
    } catch (err) {
      if (epoch !== sessionEpoch) return
      // Only a read that actually failed lands here.
      state.modeStatus = 'error'
    }
    renderMode()
  }

  // The two lists are always refreshed together, so both are pinned to the
  // epoch captured here rather than to whatever session is current by the time
  // each request actually starts.
  async function refreshAll() {
    var epoch = sessionEpoch
    await loadUsers(epoch)
    await loadOrphans(epoch)
  }

  function renderUsers() {
    var body = $('users-body')
    clear(body)
    var loaded = state.usersLoaded

    $('users-table-wrap').hidden = !loaded
    $('users-unavailable').hidden = loaded
    renderUsersCount()
    $('users-empty').hidden = !loaded || state.users.length > 0
    if (!loaded) {
      renderHome()
      return
    }

    state.users.forEach(function (user) {
      var row = el('tr', 'user-row')
      row.appendChild(cell('用户名', 'name-cell', user.name))

      var statusCell = cell('状态', 'status-cell')
      statusCell.appendChild(
        el('span', 'badge ' + statusClass(user.status), labelFrom(STATUS_LABELS, user.status))
      )
      row.appendChild(statusCell)

      row.appendChild(cell('来源', null, labelFrom(SOURCE_LABELS, user.source)))
      row.appendChild(cell('创建时间', 'muted', formatTime(user.createdAt)))

      var deviceCount = user.deviceCount
      var deviceCell = cell(
        '设备数',
        null,
        deviceCount === null || deviceCount === undefined ? '—' : String(deviceCount)
      )
      if (deviceCount === null) deviceCell.title = '设备数读取失败'
      row.appendChild(deviceCell)

      row.appendChild(
        cell(
          '快照上限',
          null,
          user.maxSnapshotNum === undefined || user.maxSnapshotNum === null
            ? '默认'
            : String(user.maxSnapshotNum)
        )
      )

      var actionCell = cell('操作', 'actions-col')
      var group = el('div', 'row-actions')
      addUserActions(group, user)
      actionCell.appendChild(group)
      row.appendChild(actionCell)

      body.appendChild(row)
    })

    renderHome()
  }

  function addUserActions(group, user) {
    var encoded = encodeURIComponent(user.name)

    if (user.status === 'pending') {
      group.appendChild(
        button('批准', 'btn primary sm', function (trigger) {
          runAction(
            group,
            trigger,
            function () {
              return api('/api/admin/users/' + encoded + '/approve', { method: 'POST' })
            },
            '已批准 ' + user.name
          )
        })
      )
      group.appendChild(
        button('拒绝', 'btn danger sm', function () {
          openRejectModal(user)
        })
      )
      return
    }

    if (user.status === 'active') {
      group.appendChild(
        button('禁用', 'btn ghost sm', function (trigger) {
          runAction(
            group,
            trigger,
            function () {
              return api('/api/admin/users/' + encoded + '/disable', { method: 'POST' })
            },
            '已禁用 ' + user.name,
            { 502: '账号已禁用，但在线连接未能断开，请稍后重试' }
          )
        })
      )
    } else if (user.status === 'disabled') {
      group.appendChild(
        button('启用', 'btn ghost sm', function (trigger) {
          runAction(
            group,
            trigger,
            function () {
              return api('/api/admin/users/' + encoded + '/enable', { method: 'POST' })
            },
            '已启用 ' + user.name
          )
        })
      )
    }

    group.appendChild(
      button('编辑配置', 'btn ghost sm', function () {
        openEditModal(user)
      })
    )
    group.appendChild(
      button('重置密码', 'btn ghost sm', function () {
        openResetModal(user)
      })
    )
    group.appendChild(
      button('设备', 'btn ghost sm', function () {
        openDevicesModalFor(user.name)
      })
    )
    group.appendChild(
      button('删除账号', 'btn danger sm', function () {
        openDeleteModal(user)
      })
    )
  }

  async function runAction(group, trigger, action, successText, overrides) {
    var buttons = group.querySelectorAll('button')
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i] === trigger) setBusy(buttons[i], true)
      else buttons[i].disabled = true
    }
    try {
      await action()
      notice(successText, 'ok')
      await refreshAll()
    } catch (err) {
      if (handleAuth(err)) return
      var custom = overrides ? overrides[err.status] : ''
      notice(custom || messageFor(err), err.status === 502 ? 'warn' : 'err')
    } finally {
      for (var j = 0; j < buttons.length; j++) setBusy(buttons[j], false)
    }
  }

  function summaryText(summary) {
    if (!summary || !summary.latest) return '无数据'
    return String(summary.snapshotCount) + ' 个快照，最新 ' + formatTime(summary.time)
  }

  function renderDataStatus(cell, dataStatus) {
    if (!dataStatus) {
      cell.appendChild(el('span', 'badge danger', '数据不可达'))
      return
    }
    var listLine = el('div', 'status-line')
    listLine.appendChild(el('span', 'status-key', '歌单'))
    listLine.appendChild(el('span', null, summaryText(dataStatus.list)))
    var dislikeLine = el('div', 'status-line')
    dislikeLine.appendChild(el('span', 'status-key', '不喜欢'))
    dislikeLine.appendChild(el('span', null, summaryText(dataStatus.dislike)))
    cell.appendChild(listLine)
    cell.appendChild(dislikeLine)
  }

  function renderOrphans() {
    var body = $('orphans-body')
    clear(body)
    var loaded = state.orphansLoaded

    $('orphans-table-wrap').hidden = !loaded
    $('orphans-unavailable').hidden = loaded
    $('orphans-empty').hidden = !loaded || state.orphans.length > 0
    if (!loaded) {
      renderHome()
      return
    }

    state.orphans.forEach(function (orphan) {
      var row = el('tr', 'user-row')
      row.appendChild(cell('用户名', 'name-cell', orphan.name))
      row.appendChild(cell('来源', null, labelFrom(SOURCE_LABELS, orphan.source)))
      row.appendChild(cell('删除时间', 'muted', formatTime(orphan.deletedAt)))

      var statusCell = cell('数据状态', 'data-status')
      renderDataStatus(statusCell, orphan.dataStatus)
      row.appendChild(statusCell)

      var actionCell = cell('操作', 'actions-col')
      var group = el('div', 'row-actions')
      group.appendChild(
        button('恢复账号', 'btn primary sm', function () {
          openRestoreModal(orphan)
        })
      )
      group.appendChild(
        button('彻底清理', 'btn danger sm', function () {
          openPurgeModal(orphan)
        })
      )
      actionCell.appendChild(group)
      row.appendChild(actionCell)

      body.appendChild(row)
    })

    renderHome()
  }

  function renderMode() {
    var radios = document.querySelectorAll('input[name="registrationMode"]')
    var ready = state.modeStatus === 'ready'
    for (var i = 0; i < radios.length; i++) {
      // Only a settled 'ready' read may claim a selection. state.mode keeps the
      // last known value across a failed read (so a later successful read can
      // repaint it), but a checked — even disabled — radio reads as "this is
      // the mode in effect", which is exactly what a stale value must not say.
      radios[i].checked = ready && radios[i].value === state.mode
      radios[i].disabled = !ready
    }
    // Three distinct copies for three distinct situations: the ready copy, the
    // failure copy (reserved for a settled 'error' — the read itself failed, or
    // the panel load failed before it could be sent) and the neutral one, which
    // only ever shows while the panel is still loading.
    $('mode-hint').textContent = ready
      ? '注册页地址：/register；切换后立即生效。'
      : state.modeStatus === 'error'
        ? '注册模式读取失败，请刷新页面重试。'
        : '正在读取注册模式…'
  }

  // --- Home dashboard -------------------------------------------------------
  // Everything below is derived from state (users/orphans), which the panel
  // already loads on login and on every refreshAll; the dashboard never issues
  // its own data requests. Only the build footer reads the build-info endpoint.

  function deviceTotal() {
    var total = 0
    for (var i = 0; i < state.users.length; i++) {
      var count = state.users[i].deviceCount
      if (typeof count === 'number' && isFinite(count)) total += count
    }
    return total
  }

  function pendingTotal() {
    var total = 0
    for (var i = 0; i < state.users.length; i++) {
      if (state.users[i].status === 'pending') total++
    }
    return total
  }

  function timestampOf(value) {
    if (!value) return 0
    var time = new Date(value).getTime()
    return isNaN(time) ? 0 : time
  }

  // 计数统一走同一个格式化出口（项 2）：四个 KPI 与「最近注册」「待处理」
  // 里所有数字都经过这里，写进 DOM 的永远是同一形式（十进制数字、无千分
  // 位、无前后缀），避免任何一处另写格式导致四卡渲染不一致。
  function kpiNumber(value) {
    return String(value)
  }

  function renderHome() {
    var pending = pendingTotal()
    var usersLoaded = state.usersLoaded
    $('kpi-users').textContent = usersLoaded
      ? kpiNumber(state.users.length)
      : UNKNOWN
    $('kpi-devices').textContent = usersLoaded ? kpiNumber(deviceTotal()) : UNKNOWN
    $('kpi-pending').textContent = usersLoaded ? kpiNumber(pending) : UNKNOWN
    $('kpi-orphans').textContent = state.orphansLoaded
      ? kpiNumber(state.orphans.length)
      : UNKNOWN
    renderTodo(pending)
    renderRecent()
    renderActivity()
  }

  function renderTodo(pending) {
    var list = $('todo-list')
    clear(list)

    if (state.usersLoaded) {
      if (pending > 0) {
        list.appendChild(
          todoItem(kpiNumber(pending) + ' 个注册待审批', 'users')
        )
      }
    } else {
      list.appendChild(
        el('p', 'todo-unknown', '注册待审批：—（暂时无法获取，请刷新后重试）')
      )
    }

    if (state.orphansLoaded) {
      if (state.orphans.length > 0) {
        list.appendChild(
          todoItem(kpiNumber(state.orphans.length) + ' 条数据残留待处理', 'settings')
        )
      }
    } else {
      // Unknown, so neither a count nor "暂无待处理事项" is honest here.
      list.appendChild(
        el('p', 'todo-unknown', '数据残留待处理：—（暂时无法获取，请刷新后重试）')
      )
    }

    if (list.childNodes.length === 0) {
      list.appendChild(el('p', 'empty', '暂无待处理事项'))
    }
  }

  function todoItem(text, tab) {
    var node = el('button', 'todo-item', text)
    node.type = 'button'
    node.appendChild(el('span', 'todo-arrow', '→'))
    node.addEventListener('click', function () {
      goTab(tab)
    })
    return node
  }

  function renderRecent() {
    var body = $('recent-body')
    clear(body)
    var empty = $('recent-empty')

    if (!state.usersLoaded) {
      empty.textContent = '用户列表暂时无法获取，请刷新后重试。'
      empty.hidden = false
      return
    }

    empty.textContent = '还没有注册记录。'
    var rows = state.users.slice()
    rows.sort(function (a, b) {
      return timestampOf(b.createdAt) - timestampOf(a.createdAt)
    })
    rows = rows.slice(0, 5)
    empty.hidden = rows.length > 0

    rows.forEach(function (user) {
      var row = el('tr', 'user-row')
      row.appendChild(cell('用户名', 'name-cell', user.name))
      var statusCell = cell('状态', 'status-cell')
      statusCell.appendChild(
        el(
          'span',
          'badge ' + statusClass(user.status),
          labelFrom(STATUS_LABELS, user.status)
        )
      )
      row.appendChild(statusCell)
      row.appendChild(cell('创建时间', 'muted', formatTime(user.createdAt)))
      body.appendChild(row)
    })
  }

  function dayKey(date) {
    var month = date.getMonth() + 1
    var day = date.getDate()
    return (
      date.getFullYear() +
      '-' +
      (month < 10 ? '0' + month : String(month)) +
      '-' +
      (day < 10 ? '0' + day : String(day))
    )
  }

  function activitySeries() {
    var today = new Date()
    today.setHours(0, 0, 0, 0)
    var days = []
    var counts = {}
    for (var i = ACTIVITY_DAYS - 1; i >= 0; i--) {
      var date = new Date(today.getTime())
      date.setDate(today.getDate() - i)
      var key = dayKey(date)
      counts[key] = 0
      days.push({ key: key, count: 0 })
    }

    state.users.forEach(function (user) {
      if (!user.createdAt) return
      var created = new Date(user.createdAt)
      if (isNaN(created.getTime())) return
      var key = dayKey(created)
      if (counts[key] === undefined) return
      counts[key]++
    })

    var total = 0
    days.forEach(function (entry) {
      entry.count = counts[entry.key]
      total += entry.count
    })
    return { days: days, total: total }
  }

  // 柱条容器（项 3）：日期提示用 ::after + data-label 画出，所以这里把每一
  // 根柱子建成稳定节点：一个 tab stop（roving tabindex，方向键移动）可键盘
  // 聚焦，focus 同样弹出提示；aria-label 把日期读给读屏，触屏点按聚焦即兜底。
  function ensureChartColumns() {
    var bars = $('chart-bars')
    if (bars.childNodes.length === ACTIVITY_DAYS) return
    clear(bars)
    for (var i = 0; i < ACTIVITY_DAYS; i++) {
      var column = el('div', 'chart-col')
      column.tabIndex = i === 0 ? 0 : -1
      column.setAttribute('role', 'img')
      bars.appendChild(column)
    }
    // Arrow keys walk the series (a 30-stop tab sequence would be a trap).
    bars.addEventListener('keydown', function (event) {
      var key = event.key
      if (key !== 'ArrowLeft' && key !== 'ArrowRight') return
      var current = document.activeElement
      if (!current || !current.parentNode || current.parentNode !== bars) return
      var index = Array.prototype.indexOf.call(bars.children, current)
      if (index < 0) return
      var next = index + (key === 'ArrowRight' ? 1 : -1)
      if (next < 0 || next >= ACTIVITY_DAYS) return
      event.preventDefault()
      current.tabIndex = -1
      bars.children[next].tabIndex = 0
      bars.children[next].focus()
    })
  }

  function renderActivity() {
    var bars = $('chart-bars')

    if (!state.usersLoaded) {
      // An all-zero chart would read as "no signups", so hide it and say why.
      bars.hidden = true
      $('chart-total').textContent = '近 30 天新增：—'
      $('chart-range').textContent = '用户列表暂时无法获取，请刷新后重试。'
      return
    }

    bars.hidden = false
    ensureChartColumns()
    var series = activitySeries()

    var peak = 0
    series.days.forEach(function (entry) {
      if (entry.count > peak) peak = entry.count
    })

    // Columns are stable nodes the refresh re-labels in place, so a refresh
    // repaints the chart without tearing down focus — the tooltip stays open
    // on the column the keyboard or a touch tap is on.
    for (var i = 0; i < ACTIVITY_DAYS; i++) {
      var column = bars.children[i]
      var entry = series.days[i]
      var label = entry.key + ' · ' + kpiNumber(entry.count) + ' 人'
      var bar = column.firstChild
      if (!bar) {
        bar = el('div', 'chart-bar zero')
        column.appendChild(bar)
      }
      column.setAttribute('data-label', label)
      column.setAttribute('aria-label', label)
      // 原生 title 兜底：::after 提示之外，触屏长按/不支持伪元素的场景
      // 仍能拿到日期（评审 nit 5）。
      column.title = label
      bar.className = entry.count === 0 ? 'chart-bar zero' : 'chart-bar'
      bar.style.height = (peak === 0 ? 0 : Math.round((entry.count / peak) * 100)) + '%'
    }

    $('chart-total').textContent =
      series.total === 0
        ? '近 30 天暂无新增'
        : '近 30 天新增 ' + kpiNumber(series.total) + ' 人'
    $('chart-range').textContent =
      series.days[0].key + ' — ' + series.days[series.days.length - 1].key
  }

  // --- Build info ---------------------------------------------------------
  // GET /api/admin/build-info is the only extra request the dashboard makes.
  // A failure (or an un-injected dev build) leaves the footer hidden and the
  // about page on its fallback values; nothing here ever renders undefined.

  function buildVersion() {
    var version = state.build && state.build.version
    return typeof version === 'string' && version ? version : 'dev'
  }

  function buildCommit() {
    var commit = state.build && state.build.commit
    return typeof commit === 'string' && commit ? commit : 'dev'
  }

  function buildBuiltAt() {
    var builtAt = state.build && state.build.builtAt
    return typeof builtAt === 'string' && builtAt ? builtAt : null
  }

  function isDevBuild() {
    var commit = state.build && state.build.commit
    return typeof commit !== 'string' || commit === '' || commit === 'dev'
  }

  function shortCommit(commit) {
    return commit.length > 7 ? commit.slice(0, 7) : commit
  }

  function versionText() {
    var version = buildVersion()
    return version === 'dev' ? 'dev' : 'v' + version
  }

  async function loadBuildInfo(epoch) {
    if (epoch === undefined) epoch = sessionEpoch
    try {
      var data = await api('/api/admin/build-info')
      if (epoch !== sessionEpoch) return
      state.build = data && typeof data === 'object' ? data : null
    } catch (err) {
      if (epoch !== sessionEpoch) return
      // Build metadata itself is cosmetic, but the request is authenticated: a
      // 401 here means the session expired, so it takes the same exit as every
      // other authenticated call instead of being swallowed as "no footer".
      if (handleAuth(err)) return
      state.build = null
    }
    renderBuildInfo()
    renderAbout()
  }

  function renderBuildInfo() {
    var line = $('build-line')
    if (isDevBuild()) {
      line.textContent = ''
      line.hidden = true
      return
    }
    line.textContent = versionText() + ' · ' + shortCommit(buildCommit())
    line.hidden = false
  }

  function renderAbout() {
    var commit = buildCommit()
    $('about-version').textContent = versionText()
    $('about-commit').textContent = commit
    $('about-built').textContent = buildBuiltAt() ? formatTime(buildBuiltAt()) : '—'
  }

  function openModal(options) {
    modalState.onSubmit = options.onSubmit || null
    modalState.onCanSubmit = options.canSubmit || null
    modalState.closeOnSuccess = options.closeOnSuccess !== false
    modalState.busy = false
    modalState.opener = document.activeElement

    $('modal-title').textContent = options.title || ''

    var desc = $('modal-desc')
    if (options.description) {
      desc.textContent = options.description
      desc.hidden = false
    } else {
      desc.textContent = ''
      desc.hidden = true
    }

    var body = $('modal-body')
    clear(body)
    ensureDialogLabel(body.parentNode)
    var fields = options.fields || []
    for (var i = 0; i < fields.length; i++) body.appendChild(fields[i])

    var errorNode = $('modal-error')
    errorNode.textContent = ''
    errorNode.hidden = true

    var submit = $('modal-submit')
    submit.textContent = options.submitLabel || '确定'
    submit.className = 'btn ' + (options.danger ? 'danger' : 'primary')
    submit.hidden = options.submitLabel === null
    submit.disabled =
      options.submitDisabled === true ||
      (modalState.onCanSubmit ? !modalState.onCanSubmit() : false)

    $('modal-cancel').textContent = options.cancelLabel || '取消'
    $('modal').hidden = false
    document.body.classList.add('modal-open')

    var focusTarget = options.focus || body.querySelector('input, select, textarea')
    if (!focusTarget) focusTarget = $('modal-cancel')
    if (focusTarget && focusTarget.focus) focusTarget.focus()
  }

  function closeModal() {
    if (modalState.busy) return
    if ($('modal').hidden) return
    $('modal').hidden = true
    document.body.classList.remove('modal-open')
    modalState.onSubmit = null
    modalState.onCanSubmit = null
    var opener = modalState.opener
    modalState.opener = null
    if (opener && opener.focus) opener.focus()
  }

  async function runModalSubmit() {
    if (!modalState.onSubmit || modalState.busy) return
    var submitFn = modalState.onSubmit
    var closeOnSuccess = modalState.closeOnSuccess
    var errorNode = $('modal-error')
    var submit = $('modal-submit')
    var cancel = $('modal-cancel')
    errorNode.hidden = true
    modalState.busy = true
    setBusy(submit, true)
    cancel.disabled = true
    try {
      var message = await submitFn()
      if (message) {
        errorNode.textContent = message
        errorNode.hidden = false
        return
      }
      modalState.busy = false
      if (closeOnSuccess) closeModal()
    } catch (err) {
      // A 401 is a session expiry, not a field error: the modals below rethrow
      // it so this branch closes the dialog and resets the panel, instead of
      // painting "登录已过期" inside a dialog that is still on screen.
      if (err.status === 401) {
        modalState.busy = false
        closeModal()
        endSession('登录已过期，请重新登录')
        return
      }
      errorNode.textContent = messageFor(err)
      errorNode.hidden = false
    } finally {
      modalState.busy = false
      cancel.disabled = false
      setBusy(submit, false)
      submit.disabled = modalState.onCanSubmit ? !modalState.onCanSubmit() : false
    }
  }

  function openRejectModal(user) {
    openModal({
      title: '拒绝申请',
      description:
        '拒绝后将删除「' + user.name + '」的待批准申请。该账号尚未产生同步数据，不会留下墓碑。',
      fields: [],
      submitLabel: '拒绝申请',
      danger: true,
      onSubmit: async function () {
        try {
          await api('/api/admin/users/' + encodeURIComponent(user.name) + '/reject', {
            method: 'POST'
          })
        } catch (err) {
          if (err.status === 401) throw err
          if (err.status === 409) return '该账号状态已变化，请刷新后重试'
          return messageFor(err)
        }
        notice('已拒绝 ' + user.name + ' 的注册申请', 'ok')
        await refreshAll()
        return null
      }
    })
  }

  function openEditModal(user) {
    var maxInput = document.createElement('input')
    maxInput.type = 'number'
    maxInput.min = '1'
    maxInput.max = '100'
    maxInput.step = '1'
    maxInput.value = String(user.maxSnapshotNum)

    var locationSelect = document.createElement('select')
    var topOption = document.createElement('option')
    topOption.value = 'top'
    topOption.textContent = '顶部'
    var bottomOption = document.createElement('option')
    bottomOption.value = 'bottom'
    bottomOption.textContent = '底部'
    locationSelect.appendChild(topOption)
    locationSelect.appendChild(bottomOption)
    locationSelect.value = user.addMusicLocationType === 'top' ? 'top' : 'bottom'

    openModal({
      title: '编辑配置 · ' + user.name,
      fields: [
        field('快照上限（1–100）', maxInput),
        field('音乐添加位置', locationSelect)
      ],
      submitLabel: '保存',
      onSubmit: async function () {
        var max = Number(maxInput.value)
        if (!Number.isInteger(max) || max < 1 || max > 100)
          return '快照上限需为 1–100 的整数'
        try {
          await api('/api/admin/users/' + encodeURIComponent(user.name), {
            method: 'PATCH',
            body: {
              maxSnapshotNum: max,
              addMusicLocationType: locationSelect.value
            }
          })
        } catch (err) {
          if (err.status === 401) throw err
          if (err.status === 400) return '配置不符合要求'
          return messageFor(err)
        }
        notice('已更新 ' + user.name + ' 的配置', 'ok')
        await refreshAll()
        return null
      }
    })
  }

  function openResetModal(user) {
    var pw = passwordField('新密码')

    var checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = true
    checkbox.id = 'reset-remove-devices'
    var checkLabel = el('label', 'check')
    checkLabel.appendChild(checkbox)
    checkLabel.appendChild(el('span', null, '同时删除该用户全部设备（强制重新配对）'))

    var explanation = el(
      'p',
      'hint warn',
      '已配对设备的重认证走设备 key，改密码本身不会让旧设备失效。勾选后会删除该用户全部已配对设备，旧设备需用新密码重新配对。'
    )

    openModal({
      title: '重置密码 · ' + user.name,
      fields: [pw.wrap, checkLabel, explanation],
      submitLabel: '重置密码',
      onSubmit: async function () {
        var problem = validatePassword(pw.input.value)
        if (problem) return problem
        try {
          await api(
            '/api/admin/users/' + encodeURIComponent(user.name) + '/reset-password',
            {
              method: 'POST',
              body: {
                password: pw.input.value,
                removeDevices: checkbox.checked
              }
            }
          )
        } catch (err) {
          if (err.status === 401) throw err
          if (err.status === 502 && err.data && err.data.passwordChanged) {
            return '密码已修改，但设备解绑失败；请稍后重试，或在设备列表中手动删除设备。'
          }
          if (err.status === 400) return '密码需为 8–128 位'
          return messageFor(err)
        }
        notice(
          checkbox.checked
            ? '密码已重置，并已删除全部设备'
            : '密码已重置（已配对设备仍可继续使用）',
          'ok'
        )
        await refreshAll()
        return null
      }
    })
  }

  function openDeleteModal(user) {
    openModal({
      title: '删除账号',
      description:
        '仅删除账号「' +
        user.name +
        '」，同步数据（歌单、快照、不喜欢规则）保留，可在下方「数据残留」区恢复或彻底清理。',
      fields: [],
      submitLabel: '删除账号',
      danger: true,
      onSubmit: async function () {
        try {
          await api('/api/admin/users/' + encodeURIComponent(user.name), {
            method: 'DELETE'
          })
        } catch (err) {
          if (err.status === 401) throw err
          if (err.status === 502 && err.data && err.data.orphaned) {
            notice(
              '账号已删除、同步数据保留，但设备解绑失败，请在设备列表中手动清理',
              'warn'
            )
            await refreshAll()
            return null
          }
          if (err.status === 409) return '待批准账号没有同步数据，请使用「拒绝」'
          return messageFor(err)
        }
        notice('已删除账号 ' + user.name + '，同步数据保留', 'ok')
        await refreshAll()
        return null
      }
    })
  }

  function openRestoreModal(orphan) {
    var pw = passwordField('新密码')
    openModal({
      title: '恢复账号 · ' + orphan.name,
      description:
        '以同名重建正常（active）账号，原有同步数据保持不变。请为该账号设置新密码。',
      fields: [pw.wrap],
      submitLabel: '恢复账号',
      onSubmit: async function () {
        var problem = validatePassword(pw.input.value)
        if (problem) return problem
        try {
          await api(
            '/api/admin/orphans/' + encodeURIComponent(orphan.name) + '/restore',
            {
              method: 'POST',
              body: { password: pw.input.value }
            }
          )
        } catch (err) {
          if (err.status === 401) throw err
          if (err.status === 409) return '该用户名已被占用，无法恢复'
          if (err.status === 404) return '该数据残留已不存在'
          if (err.status === 400) return '密码需为 8–128 位'
          return messageFor(err)
        }
        notice('已恢复账号 ' + orphan.name, 'ok')
        await refreshAll()
        return null
      }
    })
  }

  function openPurgeModal(orphan) {
    var input = document.createElement('input')
    input.type = 'text'
    input.autocomplete = 'off'
    input.placeholder = orphan.name

    var wrap = field('输入完整用户名以确认', input)
    wrap.appendChild(el('span', 'hint warn', '确认用户名：' + orphan.name))

    openModal({
      title: '彻底清理 · ' + orphan.name,
      description:
        '彻底清理不可恢复：将删除该用户的全部同步数据（歌单、快照、不喜欢规则）以及墓碑记录。',
      fields: [wrap],
      submitLabel: '彻底清理',
      danger: true,
      submitDisabled: true,
      canSubmit: function () {
        return input.value === orphan.name
      },
      onSubmit: async function () {
        if (input.value !== orphan.name) return '请输入完整用户名'
        try {
          await api('/api/admin/orphans/' + encodeURIComponent(orphan.name), {
            method: 'DELETE',
            body: { confirmName: input.value }
          })
        } catch (err) {
          if (err.status === 401) throw err
          if (err.status === 400) return '确认用户名不一致'
          if (err.status === 404) return '该数据残留已不存在'
          if (err.status === 502) return '同步数据清理失败，墓碑已保留，请稍后重试'
          return messageFor(err)
        }
        notice('已彻底清理 ' + orphan.name + ' 的同步数据', 'ok')
        await refreshAll()
        return null
      }
    })

    input.addEventListener('input', function () {
      $('modal-submit').disabled = input.value !== orphan.name
    })
  }

  function openDevicesModalFor(name) {
    var container = el('div', 'stack')
    openModal({
      title: '设备 · ' + name,
      fields: [container],
      submitLabel: null,
      cancelLabel: '关闭'
    })
    loadDeviceList(name, container)
  }

  async function loadDeviceList(name, container) {
    var epoch = sessionEpoch
    clear(container)
    container.appendChild(el('p', 'muted', '正在读取设备…'))
    var devices
    try {
      devices = await api('/api/admin/users/' + encodeURIComponent(name) + '/devices')
    } catch (err) {
      if (epoch !== sessionEpoch) return
      if (err.status === 401) {
        // The dialog belongs to the expired session: close it, then take the
        // same reset exit as every other 401.
        closeModal()
        if (handleAuth(err)) return
      }
      clear(container)
      container.appendChild(
        el(
          'p',
          'form-error',
          err.status === 502 ? '该用户的同步数据暂时不可用' : messageFor(err)
        )
      )
      return
    }

    if (epoch !== sessionEpoch) return
    clear(container)
    if (!Array.isArray(devices) || devices.length === 0) {
      container.appendChild(el('p', 'muted', '该用户还没有配对设备。'))
      return
    }

    var table = el('table')
    var thead = el('thead')
    var headRow = el('tr')
    var headings = ['设备名', '类型', '最近连接', '设备 ID', '']
    for (var i = 0; i < headings.length; i++) {
      headRow.appendChild(el('th', null, headings[i]))
    }
    thead.appendChild(headRow)
    table.appendChild(thead)

    var tbody = el('tbody')
    devices.forEach(function (device) {
      var row = el('tr', 'user-row')
      row.appendChild(cell('设备名', null, device.deviceName || '未命名设备'))
      row.appendChild(cell('类型', null, device.isMobile ? '手机' : '桌面'))
      row.appendChild(
        cell(
          '最近连接',
          'muted',
          device.lastConnectDate ? formatTime(device.lastConnectDate) : '从未连接'
        )
      )
      var idCell = cell('设备 ID')
      idCell.appendChild(el('code', null, device.clientId || ''))
      row.appendChild(idCell)
      var actionCell = cell('操作')
      actionCell.appendChild(
        button('删除', 'btn danger sm', function () {
          openDeleteDeviceModal(name, device)
        })
      )
      row.appendChild(actionCell)
      tbody.appendChild(row)
    })
    table.appendChild(tbody)

    var wrap = el('div', 'table-wrap')
    wrap.appendChild(table)
    container.appendChild(wrap)
  }

  function openDeleteDeviceModal(name, device) {
    var deviceName = device.deviceName || device.clientId
    openModal({
      title: '删除设备',
      description:
        '删除设备「' + deviceName + '」后，该设备需要重新配对才能继续同步。',
      fields: [],
      submitLabel: '删除设备',
      danger: true,
      closeOnSuccess: false,
      onSubmit: async function () {
        try {
          await api(
            '/api/admin/users/' +
              encodeURIComponent(name) +
              '/devices/' +
              encodeURIComponent(device.clientId),
            { method: 'DELETE' }
          )
        } catch (err) {
          if (err.status === 401) throw err
          if (err.status === 404) return '设备已不存在'
          if (err.status === 502) return '该用户的同步数据暂时不可用'
          return messageFor(err)
        }
        notice('设备已删除', 'ok')
        await refreshAll()
        openDevicesModalFor(name)
        return null
      }
    })
  }

  function bindTab(name) {
    var node = $('tab-' + name)
    if (!node) return
    node.addEventListener('click', function () {
      goTab(name)
    })
  }

  async function enterPanel() {
    // Pin the whole login sequence to one session: if the user logs out while
    // the first list is still loading, the remaining loads must not run (and
    // must not repopulate the panel behind the login form).
    var epoch = sessionEpoch
    showPanel()
    try {
      await loadUsers(epoch)
    } catch (err) {
      if (handleAuth(err)) return
      // The mode read is sequenced behind the user list, so this failure may
      // mean /api/registration-info was never sent: left on the neutral copy,
      // the settings hint would wait forever for a request that will not
      // happen. Collapse to the failure copy only while the mode state is still
      // untouched — a 刷新 click during this very request starts loadMode()
      // concurrently, and its 'loading' (and later 'ready', a mode that was
      // really read) must not be overwritten here. 'idle' is exactly "no read
      // in flight and none settled": loadMode() sets 'loading' before its
      // first await, and resetData() puts the state back to 'idle' on logout.
      if (state.modeStatus === 'idle') {
        state.modeStatus = 'error'
        renderMode()
      }
      notice(messageFor(err), 'err')
      return
    }
    if (epoch !== sessionEpoch) return
    try {
      await Promise.all([loadOrphans(epoch), loadMode(epoch), loadBuildInfo(epoch)])
    } catch (err) {
      if (handleAuth(err)) return
      notice(messageFor(err), 'err')
    }
  }

  function bindEvents() {
    $('login-form').addEventListener('submit', async function (event) {
      event.preventDefault()
      var errorNode = $('login-error')
      var password = $('login-password').value
      errorNode.hidden = true
      if (!password) {
        errorNode.textContent = '请输入管理员密码'
        errorNode.hidden = false
        return
      }
      var submit = $('login-submit')
      setBusy(submit, true)
      try {
        await api('/api/admin/login', {
          method: 'POST',
          body: { password: password }
        })
        await enterPanel()
      } catch (err) {
        if (err.status === 401) errorNode.textContent = '密码错误'
        else if (err.status === 403) errorNode.textContent = '尝试过于频繁，请稍后再试'
        else if (err.status === 404)
          errorNode.textContent = '管理面板未启用（未配置管理员密码哈希）'
        else errorNode.textContent = messageFor(err)
        errorNode.hidden = false
      } finally {
        setBusy(submit, false)
      }
    })

    $('refresh-btn').addEventListener('click', async function () {
      var node = this
      setBusy(node, true)
      try {
        await Promise.all([loadUsers(), loadOrphans(), loadMode()])
        notice('已刷新', 'ok')
      } catch (err) {
        if (!handleAuth(err)) notice(messageFor(err), 'err')
      } finally {
        setBusy(node, false)
      }
    })

    $('logout-btn').addEventListener('click', async function () {
      var node = this
      setBusy(node, true)
      var loggedOut = false
      try {
        await api('/api/admin/logout', { method: 'POST' })
        loggedOut = true
      } catch (err) {
        if (err.status === 401) loggedOut = true
        else notice(messageFor(err), 'err')
      } finally {
        setBusy(node, false)
      }
      if (!loggedOut) return
      notice('已退出登录', 'ok')
      endSession('')
    })

    $('add-form').addEventListener('submit', async function (event) {
      event.preventDefault()
      var errorNode = $('add-error')
      errorNode.hidden = true

      var name = $('add-name').value.trim()
      var password = $('add-password').value
      var maxRaw = $('add-max').value.trim()
      var location = $('add-location').value

      var problem = validateName(name) || validatePassword(password)
      if (problem) {
        errorNode.textContent = problem
        errorNode.hidden = false
        return
      }

      var body = {
        name: name,
        password: password,
        addMusicLocationType: location
      }
      if (maxRaw) {
        var max = Number(maxRaw)
        if (!Number.isInteger(max) || max < 1 || max > 100) {
          errorNode.textContent = '快照上限需为 1–100 的整数'
          errorNode.hidden = false
          return
        }
        body.maxSnapshotNum = max
      }

      var submit = $('add-submit')
      setBusy(submit, true)
      try {
        await api('/api/admin/users', { method: 'POST', body: body })
        $('add-form').reset()
        updatePasswordHint($('add-password'), $('add-password-hint'))
        notice('已添加用户 ' + name, 'ok')
        await refreshAll()
      } catch (err) {
        if (handleAuth(err)) return
        if (err.status === 409)
          errorNode.textContent =
            '用户名已存在、为保留名，或仍处于数据残留中（请先在数据残留区恢复或彻底清理）'
        else if (err.status === 400)
          errorNode.textContent =
            '用户名或密码不符合要求（用户名 3–32 位字母/数字/下划线/短横线，密码 8–128 位）'
        else errorNode.textContent = messageFor(err)
        errorNode.hidden = false
      } finally {
        setBusy(submit, false)
      }
    })

    var addPassword = $('add-password')
    addPassword.addEventListener('input', function () {
      updatePasswordHint(addPassword, $('add-password-hint'))
    })

    var radios = document.querySelectorAll('input[name="registrationMode"]')
    for (var i = 0; i < radios.length; i++) {
      radios[i].addEventListener('change', async function () {
        if (!this.checked) return
        var next = this.value
        var previous = state.mode
        state.mode = next
        try {
          await api('/api/admin/settings', {
            method: 'PATCH',
            body: { registrationMode: next }
          })
          notice('注册模式已更新为「' + labelFrom(MODE_LABELS, next) + '」', 'ok')
        } catch (err) {
          if (handleAuth(err)) return
          state.mode = previous
          renderMode()
          notice(messageFor(err), 'err')
        }
      })
    }

    for (var t = 0; t < TAB_ORDER.length; t++) {
      bindTab(TAB_ORDER[t])
    }

    // The segmented control is one click handler on the group: the event
    // target is the pressed button, or the icon/path inside it, so walk up to
    // the element that owns the mode.
    var themeSwitch = $('theme-switch')
    themeSwitch.addEventListener('click', function (event) {
      var node = event.target
      while (node && node !== themeSwitch) {
        if (node.getAttribute && node.getAttribute('data-theme-mode')) break
        node = node.parentNode
      }
      if (!node || node === themeSwitch) return
      var mode = node.getAttribute('data-theme-mode')
      if (mode !== 'light' && mode !== 'dark' && mode !== 'auto') mode = 'light'
      storeThemeMode(mode)
      applyTheme(mode)
    })

    // 'auto' follows the OS appearance live, without a reload. matchMedia is
    // missing on a few old browsers: the buttons still work there, only the
    // live follow is skipped.
    if (window.matchMedia) {
      darkMedia = window.matchMedia('(prefers-color-scheme: dark)')
      var onSystemThemeChange = function () {
        if (themeMode() !== 'auto') return
        applyTheme('auto')
      }
      if (darkMedia.addEventListener) {
        darkMedia.addEventListener('change', onSystemThemeChange)
      } else if (darkMedia.addListener) {
        darkMedia.addListener(onSystemThemeChange)
      }
    }

    window.addEventListener('hashchange', function () {
      var tab = tabFromHash()
      normalizeHash(tab)
      activateTab(tab)
    })

    $('modal-close').addEventListener('click', closeModal)
    $('modal-cancel').addEventListener('click', closeModal)
    $('modal-submit').addEventListener('click', runModalSubmit)
    document.querySelector('.modal-backdrop').addEventListener('click', closeModal)
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !$('modal').hidden) {
        closeModal()
        return
      }
      if (event.key !== 'Tab' || $('modal').hidden || modalState.busy) return
      // Keep keyboard focus inside the dialog while it is open. The rest of
      // the panel is visually behind the backdrop but remains reachable by
      // Tab, so one shared trap protects every modal, including dynamically
      // loaded device lists.
      var dialog = document.querySelector('.modal-card')
      var focusable = dialog.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable.length) return
      var first = focusable[0]
      var last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      }
    })
  }

  async function init() {
    try {
      await loadUsers()
    } catch (err) {
      $('boot').hidden = true
      if (err.status === 401) endSession('')
      else showLogin(messageFor(err))
      return
    }
    $('boot').hidden = true
    showPanel()
    try {
      await Promise.all([loadOrphans(), loadMode(), loadBuildInfo()])
    } catch (err) {
      if (handleAuth(err)) return
      notice(messageFor(err), 'err')
    }
  }

  bindEvents()
  init()
})()
`

export const adminPageHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/favicon.ico" sizes="any">
<title>管理面板 · LX Music Server</title>
<script>
(function () {
  // Runs before the stylesheet so the first paint is already correct: a
  // logged-in panel with a stored dark choice must never flash light first.
  // The session cannot be read here (the cookie is HttpOnly), so "no record"
  // resolves straight to light — the logged-out panel is always light — and
  // showPanel() applies the real choice once the session is known.
  var mode = 'light'
  try {
    var stored = localStorage.getItem('lx-admin-theme')
    if (stored === 'light' || stored === 'dark' || stored === 'auto') mode = stored
  } catch (err) {
    // Blocked storage (private mode) is not fatal: stay light.
  }
  var theme = mode
  if (mode === 'auto' && window.matchMedia) {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  var root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.setAttribute('data-theme-mode', mode)
  root.style.colorScheme = theme
})()
</script>
<style>
${adminTokenCss}
${adminStyles}
</style>
</head>
<body>
<main class="wrap">
  <header class="topbar">
    <div class="brand">
      <svg viewBox="0 0 447.942 447.943" width="28" height="28" aria-hidden="true" focusable="false">
        <path fill="#5ed698" d="M203.806.482c-19.668-3.346-35.76 11.139-35.76 31.086v206.166c-11.642-4.271-24.165-6.725-37.281-6.725-59.905 0-108.469 48.566-108.469 108.473 0 59.903 48.564 108.461 108.469 108.461 34.141 0 64.54-15.82 84.406-40.482l-49.658-49.664c-15.116-15.112-11.708-28.901-9.542-34.14 2.166-5.233 9.514-17.4 30.883-17.4h18.082v-56.885c0-21.132 14.617-38.862 34.266-43.745.032-44.373.032-81.808.032-81.808 140.147 0 131.724 83.974 115.325 132.196-6.42 18.884-2.601 22.05 10.893 7.354C536.473 77.106 298.38 16.566 203.806.482z" />
        <path fill="#4daf7c" d="M301.061 223.876h-50.994c-3.911 0-7.574.95-10.889 2.523-8.616 4.09-14.615 12.798-14.615 22.973v76.51h-37.708c-14.082 0-17.428 8.071-7.466 18.029l46.893 46.898 31.25 31.246a25.424 25.424 0 0018.033 7.474c6.523 0 13.052-2.484 18.029-7.474l78.152-78.145c9.951-9.958 6.608-18.029-7.47-18.029h-37.71v-76.51c.001-14.078-11.42-25.495-25.505-25.495z" />
      </svg>
      <div>
        <h1>LX Music server 管理面板</h1>
        <p class="muted">一个兼容官方同步协议的重构版</p>
      </div>
    </div>
    <div class="topbar-actions" id="session-actions" hidden>
      <div class="theme-switch" id="theme-switch" role="group" aria-label="主题">
        <button class="theme-btn" type="button" data-theme-mode="light" aria-pressed="false" aria-label="亮色" title="亮色">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
        </button>
        <button class="theme-btn" type="button" data-theme-mode="dark" aria-pressed="false" aria-label="暗色" title="暗色">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        </button>
        <button class="theme-btn" type="button" data-theme-mode="auto" aria-pressed="false" aria-label="跟随系统" title="跟随系统">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
          </svg>
        </button>
      </div>
      <button class="btn ghost" id="refresh-btn" type="button">刷新</button>
      <button class="btn ghost" id="logout-btn" type="button">退出登录</button>
    </div>
  </header>

  <p class="muted center" id="boot">正在加载…</p>
  <noscript><p class="form-error">管理面板需要启用 JavaScript。</p></noscript>
  <div class="notice" id="notice" role="status" aria-live="polite" hidden></div>

  <section class="card login-card" id="login-view" hidden>
    <p class="eyebrow">Admin · Sign in</p>
    <h2>管理员登录</h2>
    <p class="muted">管理面板与同步账号完全分离，请使用管理员密码登录。</p>
    <form class="stack" id="login-form" novalidate>
      <label class="field">
        <span class="field-label">管理员密码</span>
        <input id="login-password" type="password" autocomplete="current-password" required>
      </label>
      <p class="form-error" id="login-error" hidden></p>
      <button class="btn primary" id="login-submit" type="submit">登录</button>
    </form>
  </section>

  <div id="panel-view" hidden>
    <nav class="tabs" id="tabs" hidden>
      <button class="tab" id="tab-home" type="button">首页</button>
      <button class="tab" id="tab-users" type="button">用户管理</button>
      <button class="tab" id="tab-settings" type="button">系统设置</button>
      <button class="tab" id="tab-about" type="button">关于</button>
    </nav>

    <div id="tab-panel-home" hidden>
      <section class="kpi-grid">
        <div class="card kpi">
          <span class="kpi-label">用户总数</span>
          <strong class="kpi-value" id="kpi-users">—</strong>
        </div>
        <div class="card kpi">
          <span class="kpi-label">设备总数</span>
          <strong class="kpi-value" id="kpi-devices">—</strong>
        </div>
        <div class="card kpi">
          <span class="kpi-label">待审批</span>
          <strong class="kpi-value" id="kpi-pending">—</strong>
        </div>
        <div class="card kpi">
          <span class="kpi-label">数据残留</span>
          <strong class="kpi-value" id="kpi-orphans">—</strong>
        </div>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>待处理</h2>
          <span class="muted">点击条目跳转对应页签</span>
        </div>
        <div class="todo-list" id="todo-list"></div>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>最近注册</h2>
          <span class="muted">按创建时间倒序，最多 5 人</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>状态</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody id="recent-body"></tbody>
          </table>
        </div>
        <p class="empty" id="recent-empty" hidden>还没有注册记录。</p>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>近 30 天新增</h2>
          <span class="muted" id="chart-total">近 30 天暂无新增</span>
        </div>
        <div class="chart" id="chart-bars"></div>
        <p class="muted chart-range" id="chart-range"></p>
      </section>

      <p class="muted build-line" id="build-line" hidden></p>
    </div>

    <div id="tab-panel-users">
      <section class="card">
        <div class="section-head">
          <h2>用户</h2>
          <span class="muted" id="users-count"></span>
        </div>
        <div class="table-wrap" id="users-table-wrap">
          <table class="users-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>状态</th>
                <th>来源</th>
                <th>创建时间</th>
                <th>设备数</th>
                <th>快照上限</th>
                <th class="actions-col">操作</th>
              </tr>
            </thead>
            <tbody id="users-body"></tbody>
          </table>
        </div>
        <p class="empty" id="users-empty" hidden>还没有用户，用下面的表单添加第一个。</p>
        <p class="data-unavailable" id="users-unavailable" hidden>用户列表暂时不可用，请刷新后重试。刷新成功前不会对旧数据执行任何操作。</p>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>添加用户</h2>
          <span class="muted">管理员创建的账号直接可用，无需批准</span>
        </div>
        <form class="grid-form" id="add-form" novalidate>
          <label class="field">
            <span class="field-label">用户名</span>
            <input id="add-name" type="text" autocomplete="off" maxlength="32" required>
            <span class="hint">3–32 位字母、数字、下划线或短横线</span>
          </label>
          <label class="field">
            <span class="field-label">密码</span>
            <input id="add-password" type="password" autocomplete="new-password" required>
            <span class="hint" id="add-password-hint">至少 8 位，建议 16 位以上随机密码</span>
          </label>
          <label class="field">
            <span class="field-label">快照上限（可选）</span>
            <input id="add-max" type="number" min="1" max="100" step="1" placeholder="默认 20">
          </label>
          <label class="field">
            <span class="field-label">音乐添加位置</span>
            <select id="add-location">
              <option value="bottom">底部（默认）</option>
              <option value="top">顶部</option>
            </select>
          </label>
          <div class="form-actions">
            <button class="btn primary" id="add-submit" type="submit">添加用户</button>
          </div>
          <p class="form-error" id="add-error" hidden></p>
        </form>
      </section>
    </div>

    <div id="tab-panel-settings" hidden>
      <section class="card">
        <div class="section-head">
          <h2>注册设置</h2>
          <span class="muted">切换后立即生效</span>
        </div>
        <div class="mode-options" id="mode-options">
          <label class="mode-option">
            <input type="radio" name="registrationMode" value="closed" disabled>
            <span><strong>关闭注册</strong><span class="muted">仅管理员可添加用户</span></span>
          </label>
          <label class="mode-option">
            <input type="radio" name="registrationMode" value="approval" disabled>
            <span><strong>需批准（默认）</strong><span class="muted">注册后为待批准，管理员批准后可用</span></span>
          </label>
          <label class="mode-option">
            <input type="radio" name="registrationMode" value="open" disabled>
            <span><strong>开放注册</strong><span class="muted">注册后立即可用</span></span>
          </label>
        </div>
        <p class="hint" id="mode-hint">正在读取注册模式…</p>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>数据残留</h2>
          <span class="muted">已删除账号保留的同步数据</span>
        </div>
        <div class="table-wrap" id="orphans-table-wrap">
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>来源</th>
                <th>删除时间</th>
                <th>数据状态</th>
                <th class="actions-col">操作</th>
              </tr>
            </thead>
            <tbody id="orphans-body"></tbody>
          </table>
        </div>
        <p class="empty" id="orphans-empty" hidden>没有保留的同步数据。</p>
        <p class="data-unavailable" id="orphans-unavailable" hidden>残留数据暂时不可用，请刷新后重试。刷新成功前列表不展示，避免对可能过期的行执行恢复或彻底清理。</p>
      </section>
    </div>

    <div id="tab-panel-about" hidden>
      <section class="card about-hero">
        <h2>LX Music server 管理面板</h2>
        <p class="muted">LX Music 同步服务的管理后台</p>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>构建信息</h2>
        </div>
        <dl class="about-list">
          <div class="about-row">
            <dt>产品名称</dt>
            <dd>LX Music server 管理面板</dd>
          </div>
          <div class="about-row">
            <dt>版本号</dt>
            <dd id="about-version">dev</dd>
          </div>
          <div class="about-row">
            <dt>构建哈希</dt>
            <dd><code id="about-commit">dev</code></dd>
          </div>
          <div class="about-row">
            <dt>构建时间</dt>
            <dd id="about-built">—</dd>
          </div>
          <div class="about-row">
            <dt>源码仓库</dt>
            <dd>
              <a id="about-repo" href="https://github.com/WorkerHub/lx-music-server" target="_blank" rel="noopener noreferrer">https://github.com/WorkerHub/lx-music-server</a>
            </dd>
          </div>
        </dl>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>致谢</h2>
        </div>
        <p class="muted">
          本项目是 <a href="https://github.com/lyswhut/lx-music-sync-server" target="_blank" rel="noopener noreferrer">原始项目</a> 的重构版本，运行在 Cloudflare Worker 上，完全兼容原始项目的通信协议。另外在此基础上添加了后台管理页面，以方便管理用户。
        </p>
        <dl class="about-list">
          <div class="about-row">
            <dt>原始项目</dt>
            <dd><a href="https://github.com/lyswhut/lx-music-sync-server" target="_blank" rel="noopener noreferrer">https://github.com/lyswhut/lx-music-sync-server</a></dd>
          </div>
          <div class="about-row">
            <dt>相关项目</dt>
            <dd>
              <a href="https://github.com/lyswhut/lx-music-desktop" target="_blank" rel="noopener noreferrer">https://github.com/lyswhut/lx-music-desktop</a><br>
              <a href="https://github.com/lyswhut/lx-music-mobile" target="_blank" rel="noopener noreferrer">https://github.com/lyswhut/lx-music-mobile</a>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</main>

<div class="modal" id="modal" hidden>
  <div class="modal-backdrop"></div>
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-head">
      <h2 id="modal-title"></h2>
      <button class="icon-btn" id="modal-close" type="button" aria-label="关闭">×</button>
    </div>
    <p class="modal-desc" id="modal-desc" hidden></p>
    <div class="stack" id="modal-body"></div>
    <p class="form-error" id="modal-error" hidden></p>
    <div class="modal-actions">
      <button class="btn ghost" id="modal-cancel" type="button">取消</button>
      <button class="btn primary" id="modal-submit" type="button">确定</button>
    </div>
  </div>
</div>

<script>
${adminScript}
</script>
</body>
</html>`
