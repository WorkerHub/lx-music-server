// The landing page served at `/` is a server-rendered document: inline styles,
// no script at all and no external resources, so it obeys the same CSP as
// /admin and /register and keeps working with JavaScript disabled.
//
// The registration entry is decided while rendering. `registrationMode` comes
// from the same registry settings `GET /api/registration-info` reports, so a
// `closed` deployment never even links to /register instead of hiding the link
// after a round trip.
//
// Nothing user-controlled is interpolated: the only input is the enum above,
// and it is only branched on, never written into the markup.

import { ssrTokenCss } from '@/ui/tokens'

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
.wrap { max-width: 640px; margin: 0 auto; padding: var(--lx-space-7) var(--lx-space-4) var(--lx-space-8); }
.brand { display: flex; align-items: center; gap: var(--lx-space-4); }
.brand svg { flex: none; }
.brand h1 { font-size: var(--lx-text-h1-size); font-weight: var(--lx-text-h1-weight); line-height: var(--lx-text-h1-lh); letter-spacing: var(--lx-text-h1-tracking); color: var(--lx-heading); margin: 0; }
.muted { color: var(--lx-muted); }
.lead { margin: var(--lx-space-4) 0 0; font-size: var(--lx-text-h3-size); font-weight: var(--lx-text-h3-weight); line-height: var(--lx-text-h3-lh); letter-spacing: var(--lx-text-h3-tracking); }
.card {
  background: var(--lx-card);
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-md);
  padding: var(--lx-space-5);
  margin-top: var(--lx-space-5);
  box-shadow: var(--lx-shadow-1);
}
.card h2 { font-size: var(--lx-text-h2-size); font-weight: var(--lx-text-h2-weight); line-height: var(--lx-text-h2-lh); letter-spacing: var(--lx-text-h2-tracking); color: var(--lx-heading); margin: 0 0 var(--lx-space-3); }
.features { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--lx-space-2); }
.features li { display: flex; gap: var(--lx-space-2); }
.features .mark { color: var(--lx-brand); flex: none; }
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
  border: 1px solid var(--lx-border-strong); border-radius: var(--lx-radius-sm); padding: var(--lx-space-2) var(--lx-space-4);
  background: var(--lx-card); color: var(--lx-text);
  text-decoration: none; font: inherit;
}
.btn:hover { border-color: var(--lx-muted); }
.btn.primary { background: var(--lx-brand); border-color: var(--lx-brand); color: var(--lx-brand-on); }
.btn.primary:hover { background: var(--lx-brand-hover); border-color: var(--lx-brand-hover); }
.btn.primary:hover { border-color: var(--lx-brand); }
.hint { color: var(--lx-muted); font-size: var(--lx-text-label-size); font-weight: var(--lx-text-small-weight); line-height: var(--lx-text-label-lh); letter-spacing: var(--lx-text-small-tracking); margin: 0; flex-basis: 100%; }
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
footer { margin-top: var(--lx-space-6); color: var(--lx-muted); font-size: var(--lx-text-label-size); font-weight: var(--lx-text-small-weight); line-height: var(--lx-text-label-lh); letter-spacing: var(--lx-text-small-tracking); }
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
    ${brandLogo}
    <div>
      <h1>LX Music server</h1>
      <p class="muted">一个兼容官方同步协议的重构版</p>
    </div>
  </header>

  <p class="lead">在 Cloudflare Workers 上运行的 LX Music 同步服务：歌单、不喜欢列表与多设备同步配置实时互通，数据留在你自己的部署里。</p>

  <section class="card">
    <h2>这个服务器能做什么</h2>
    <ul class="features">
      <li><span class="mark" aria-hidden="true">·</span>多设备实时同步：WebSocket 长连接，改动即时互通</li>
      <li><span class="mark" aria-hidden="true">·</span>账号相互隔离：每个账号独立的 Durable Object 与存储</li>
      <li><span class="mark" aria-hidden="true">·</span>快照与合并：按设备保留历史快照，冲突时增量合并</li>
    </ul>
    <div class="actions">
      <a class="btn primary" id="admin-link" href="/admin">进入管理面板</a>
      ${registerEntry(mode)}
    </div>
  </section>

  <footer>在 LX Music 客户端里填写本页地址与账号（连接码）即可开始同步。</footer>
</main>
</body>
</html>`
