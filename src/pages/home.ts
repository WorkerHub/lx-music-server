// The landing page served at `/` is a server-rendered document: inline styles,
// no script at all and no external resources, so it obeys the same CSP as
// /admin and /register and keeps working with JavaScript disabled.
//
// The registration entry is decided while rendering. `registrationMode` comes
// from the same registry settings `GET /api/registration-info` reports, so a
// `closed` deployment never even links to /register instead of hiding the link
// after a round trip.
//
// The only dynamic values written into the markup are the page's own origin
// and the build version, both HTML-escaped before interpolation (defensive);
// the registration mode is only branched on, never written out.
//
// Layout notes (docs/design-system.md §0/§8): one 640px column, a hero whose
// headline carries the page, then one card per idea with a deliberate
// whitespace rhythm (space-7 header → hero → space-6 → cards). The connection
// strip is the "credential block" the design contract calls the signature
// element: monospaced, tabular figures, self-explanatory without a script.

import { ssrTokenCss } from '@/ui/tokens'

// Dynamic values interpolated into the document are the page's own origin
// (from `new URL(c.req.url).origin`) and the build version. A URL origin
// cannot carry markup characters today, but both are escaped anyway so nothing
// raw ever enters the markup.
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })

// Build version shown in the footer. The route passes the deploy-injected
// display version ("v{version}-{build count}-{short sha}") or "dev" when it is
// not injected. It is printed verbatim, with no prefix of our own, so the
// landing footer matches the admin panel's footer and about page exactly.
const versionLabel = (version: string): string => (version ? version : 'dev')

const homeStyles = `
* { box-sizing: border-box; }
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
/* Subtle brand presence behind the hero: two blurred brand-soft blobs, pure
   CSS (CSP keeps every other decoration out). They sit behind the content and
   never affect layout. */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(circle at 12% -10%, var(--lx-brand-soft), transparent 55%),
    radial-gradient(circle at 92% 8%, var(--lx-sunken), transparent 45%);
}
.wrap {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--lx-space-7) var(--lx-space-4) var(--lx-space-8);
  animation: lx-fade-up var(--lx-motion-base) var(--lx-ease-out) both;
}
/* Logo and h1 share one visual row (centered against each other); the subtitle
   sits on its own row below, so the 40px logo no longer centers against the
   whole h1 + subtitle block. */
.brand { display: flex; flex-direction: column; gap: var(--lx-space-1); }
.brand-row { display: flex; align-items: center; gap: var(--lx-space-4); }
.brand-row svg { flex: none; }
.brand h1 {
  font-size: var(--lx-text-h1-size);
  font-weight: var(--lx-text-h1-weight);
  line-height: var(--lx-text-h1-lh);
  letter-spacing: var(--lx-text-h1-tracking);
  color: var(--lx-heading);
  margin: 0;
}
.eyebrow {
  margin: 0;
  color: var(--lx-brand);
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-label-weight);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-label-tracking);
  text-transform: uppercase;
}
.muted { color: var(--lx-muted); margin: 0; }
.lead {
  margin: var(--lx-space-4) 0 0;
  font-size: var(--lx-text-h3-size);
  font-weight: var(--lx-text-h3-weight);
  line-height: var(--lx-text-h3-lh);
  letter-spacing: var(--lx-text-h3-tracking);
}
.hero { margin-bottom: var(--lx-space-6); }
.hero .display {
  margin: var(--lx-space-3) 0 0;
  font-size: var(--lx-text-display-size);
  font-weight: var(--lx-text-display-weight);
  line-height: var(--lx-text-display-lh);
  letter-spacing: var(--lx-text-display-tracking);
  color: var(--lx-heading);
}
.card {
  background: var(--lx-card);
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-md);
  padding: var(--lx-space-5);
  box-shadow: var(--lx-shadow-1);
}
.card + .card { margin-top: var(--lx-space-4); }
.card, .connect-strip {
  transition:
    border-color var(--lx-motion-fast) var(--lx-ease-standard),
    box-shadow var(--lx-motion-fast) var(--lx-ease-standard),
    transform var(--lx-motion-fast) var(--lx-ease-standard);
}
@media (hover: hover) {
  .card:hover, .connect-strip:hover {
    border-color: var(--lx-border-strong);
    box-shadow: var(--lx-shadow-2);
    transform: translateY(-1px);
  }
}
@keyframes lx-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.card h2 {
  font-size: var(--lx-text-h2-size);
  font-weight: var(--lx-text-h2-weight);
  line-height: var(--lx-text-h2-lh);
  letter-spacing: var(--lx-text-h2-tracking);
  color: var(--lx-heading);
  margin: 0 0 var(--lx-space-3);
}
.features { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--lx-space-3); }
.features li { display: flex; gap: var(--lx-space-3); }
.feature-index {
  flex: none;
  min-width: var(--lx-space-6);
  color: var(--lx-brand);
  font-family: var(--lx-font-mono);
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-label-weight);
  line-height: var(--lx-text-h3-lh);
  letter-spacing: var(--lx-text-label-tracking);
  font-variant-numeric: tabular-nums;
}
.feature-body { display: flex; flex-direction: column; gap: var(--lx-space-1); }
.feature-body strong {
  font-size: var(--lx-text-h3-size);
  font-weight: var(--lx-text-h3-weight);
  line-height: var(--lx-text-h3-lh);
  letter-spacing: var(--lx-text-h3-tracking);
  color: var(--lx-heading);
}
.feature-body span {
  color: var(--lx-muted);
  font-size: var(--lx-text-small-size);
  line-height: var(--lx-text-small-lh);
}
/* Credential strip: the page's signature block (docs/design-system.md §0).
   Sunken surface + monospaced tabular rows so the values read as "data you
   type into a client", not as prose. */
.connect-strip {
  margin: var(--lx-space-4) 0 0;
  padding: var(--lx-space-4);
  background: var(--lx-sunken);
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-sm);
  display: flex;
  flex-direction: column;
  gap: var(--lx-space-2);
}
.connect-row { display: flex; gap: var(--lx-space-3); align-items: baseline; flex-wrap: wrap; }
.connect-key {
  color: var(--lx-muted);
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-label-weight);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-label-tracking);
  min-width: 68px;
}
.connect-value {
  font-family: var(--lx-font-mono);
  font-size: var(--lx-text-small-size);
  line-height: var(--lx-text-small-lh);
  font-variant-numeric: tabular-nums;
  color: var(--lx-text);
  word-break: break-all;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--lx-space-3);
  margin-top: var(--lx-space-5);
  padding-top: var(--lx-space-4);
  border-top: 1px solid var(--lx-line);
}
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--lx-border-strong); border-radius: var(--lx-radius-sm);
  /* Compact single-line CTA: the same control-height step as admin inputs and
     buttons (2×8px padding + 2×1px border), not the spacing scale. */
  padding: var(--lx-space-2) var(--lx-space-3);
  background: var(--lx-card); color: var(--lx-text);
  text-decoration: none; font: inherit;
  min-height: var(--lx-control-height);
  white-space: nowrap;
  transition:
    background-color var(--lx-motion-fast) var(--lx-ease-standard),
    border-color var(--lx-motion-fast) var(--lx-ease-standard),
    color var(--lx-motion-fast) var(--lx-ease-standard),
    transform var(--lx-motion-crisp) var(--lx-ease-standard);
}
.btn:hover { border-color: var(--lx-muted); background: var(--lx-sunken); }
.btn:active { transform: scale(0.98); }
.btn:focus-visible { outline: 2px solid var(--lx-brand); outline-offset: 2px; }
.btn:disabled, .btn[aria-disabled="true"] {
  opacity: 0.5;
  filter: saturate(0.4);
  cursor: not-allowed;
  pointer-events: none;
}
/* Primary CTA: the only solid brand fill on the page, so the main action is
   unmistakable against the ghost secondary below it. */
.btn.primary { background: var(--lx-brand); border-color: var(--lx-brand); color: var(--lx-brand-on); }
.btn.primary:hover { background: var(--lx-brand-hover); border-color: var(--lx-brand-hover); }
.hint { color: var(--lx-muted); font-size: var(--lx-text-small-size); font-weight: var(--lx-text-small-weight); line-height: var(--lx-text-small-lh); letter-spacing: var(--lx-text-small-tracking); margin: 0; flex-basis: 100%; }
.notice {
  margin: 0; flex-basis: 100%;
  border-radius: var(--lx-radius-sm); padding: var(--lx-space-2) var(--lx-space-3);
  background: var(--lx-bg); border: 1px solid var(--lx-line); color: var(--lx-text);
  font-size: var(--lx-text-small-size);
  font-weight: var(--lx-text-small-weight);
  line-height: var(--lx-text-small-lh);
  letter-spacing: var(--lx-text-small-tracking);
}
.notice.warn { background: var(--lx-warn-bg); color: var(--lx-warn-text); border-color: var(--lx-warn-border); }
footer {
  margin-top: var(--lx-space-6);
  padding-top: var(--lx-space-4);
  border-top: 1px solid var(--lx-line);
  color: var(--lx-muted);
  font-size: var(--lx-text-small-size);
  line-height: var(--lx-text-small-lh);
}
@media (max-width: 640px) {
  .wrap { padding: var(--lx-space-6) var(--lx-space-4) var(--lx-space-7); }
  .card { padding: var(--lx-space-4); }
  .actions { flex-direction: column; align-items: stretch; }
  .btn { align-self: flex-start; }
  .hint, .notice { text-align: left; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .card:hover, .connect-strip:hover { transform: none; }
  .btn:active { transform: none; }
}
`

const brandLogo = `<svg viewBox="0 0 447.942 447.943" width="40" height="40" aria-hidden="true" focusable="false">
        <path fill="#5ed698" d="M203.806.482c-19.668-3.346-35.76 11.139-35.76 31.086v206.166c-11.642-4.271-24.165-6.725-37.281-6.725-59.905 0-108.469 48.566-108.469 108.473 0 59.903 48.564 108.461 108.469 108.461 34.141 0 64.54-15.82 84.406-40.482l-49.658-49.664c-15.116-15.112-11.708-28.901-9.542-34.14 2.166-5.233 9.514-17.4 30.883-17.4h18.082v-56.885c0-21.132 14.617-38.862 34.266-43.745.032-44.373.032-81.808.032-81.808 140.147 0 131.724 83.974 115.325 132.196-6.42 18.884-2.601 22.05 10.893 7.354C536.473 77.106 298.38 16.566 203.806.482z" />
        <path fill="#4daf7c" d="M301.061 223.876h-50.994c-3.911 0-7.574.95-10.889 2.523-8.616 4.09-14.615 12.798-14.615 22.973v76.51h-37.708c-14.082 0-17.428 8.071-7.466 18.029l46.893 46.898 31.25 31.246a25.424 25.424 0 0018.033 7.474c6.523 0 13.052-2.484 18.029-7.474l78.152-78.145c9.951-9.958 6.608-18.029-7.47-18.029h-37.71v-76.51c.001-14.078-11.42-25.495-25.505-25.495z" />
      </svg>`

// `open` / `approval` show the register button; the hint below it says what a
// successful registration means in each mode. `closed` shows no entry at all,
// only a notice pointing at the admin, and `null` (the settings read failed)
// hides the entry too: the page cannot claim registration is available.
const registerEntry = (mode: LX.RegistrationMode | null): string => {
  if (mode === 'open' || mode === 'approval') {
    const hint =
      mode === 'open'
        ? '注册开放中，注册成功即可在 LX Music 客户端连接本服务器。'
        : '注册开放中，提交后需管理员批准才能连接。'
    return `<a class="btn" id="register-link" href="/register">注册账号</a>
      <p class="hint">${hint}</p>`
  }
  if (mode === 'closed')
    return `<p class="notice" id="register-closed">当前未开放自助注册，如需账号请联系管理员。</p>`

  return `<p class="notice warn" id="register-unknown">暂时无法读取注册状态，请稍后刷新；如需账号请联系管理员。</p>`
}

export const homePageHtml = (
  mode: LX.RegistrationMode | null,
  origin: string,
  version = 'dev',
): string => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/favicon.ico" sizes="any">
<title>LX Music Server · 同步服务</title>
<style>
${ssrTokenCss}
${homeStyles}
</style>
</head>
<body>
<main class="wrap">
  <header class="brand">
    <div class="brand-row">
      ${brandLogo}
      <h1>LX Music server</h1>
    </div>
    <p class="muted">一个兼容官方同步协议的重构版</p>
  </header>

  <section class="hero">
    <p class="eyebrow">LX Music · Sync Server</p>
    <p class="display">你的音乐数据，同步在你自己的服务器上。</p>
    <p class="lead">在 Cloudflare Workers 上运行的 LX Music 同步服务：歌单、不喜欢列表与多设备同步配置实时互通，数据留在你自己的部署里。</p>
  </section>

  <section class="card">
    <h2>这个服务器能做什么</h2>
    <ul class="features">
      <li>
        <span class="feature-index" aria-hidden="true">01</span>
        <span class="feature-body">
          <strong>多设备实时同步</strong>
          <span>WebSocket 长连接，改动即时互通。</span>
        </span>
      </li>
      <li>
        <span class="feature-index" aria-hidden="true">02</span>
        <span class="feature-body">
          <strong>账号相互隔离</strong>
          <span>每个账号独立的 Durable Object 与存储。</span>
        </span>
      </li>
      <li>
        <span class="feature-index" aria-hidden="true">03</span>
        <span class="feature-body">
          <strong>快照与合并</strong>
          <span>按设备保留历史快照，冲突时增量合并。</span>
        </span>
      </li>
    </ul>
  </section>

  <section class="card">
    <h2>怎么连接</h2>
    <div class="connect-strip">
      <div class="connect-row">
        <span class="connect-key">服务器地址</span>
        <span class="connect-value">${escapeHtml(origin)}</span>
      </div>
      <div class="connect-row">
        <span class="connect-key">连接码</span>
        <span class="connect-value">注册后获得的用户名与密码</span>
      </div>
    </div>
    <div class="actions">
      <a class="btn primary" id="admin-link" href="/admin">进入管理面板</a>
      ${registerEntry(mode)}
    </div>
  </section>

  <footer>${escapeHtml(versionLabel(version))}</footer>
</main>
</body>
</html>`
