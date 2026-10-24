// The registration page mirrors the admin panel: one self-contained HTML
// document with inline styles and vanilla JS, no build step and no external
// resources. It reads the public registration mode, then renders either the
// closed notice, the form, or the success instructions.
//
// Like the admin panel, every dynamic value is written with textContent; the
// client script avoids template literals so the document can live in one outer
// template.

import { ssrTokenCss } from '@/ui/tokens'

const registerStyles = `
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
/* Same brand wash as the landing page: the two SSR pages share one language. */
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
  max-width: 520px;
  margin: 0 auto;
  padding: var(--lx-space-7) var(--lx-space-4) var(--lx-space-8);
  animation: lx-fade-up var(--lx-motion-base) var(--lx-ease-out) both;
}
.head { margin-bottom: var(--lx-space-5); }
.eyebrow {
  margin: 0 0 var(--lx-space-2);
  color: var(--lx-brand);
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-label-weight);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-label-tracking);
  text-transform: uppercase;
}
.head h1 {
  font-size: var(--lx-text-display-size);
  font-weight: var(--lx-text-display-weight);
  line-height: var(--lx-text-display-lh);
  letter-spacing: var(--lx-text-display-tracking);
  color: var(--lx-heading);
  margin: 0 0 var(--lx-space-2);
}
h2 {
  font-size: var(--lx-text-h2-size);
  font-weight: var(--lx-text-h2-weight);
  line-height: var(--lx-text-h2-lh);
  letter-spacing: var(--lx-text-h2-tracking);
  color: var(--lx-heading);
  margin: 0 0 var(--lx-space-3);
}
.muted { color: var(--lx-muted); font-size: var(--lx-text-small-size); line-height: var(--lx-text-small-lh); }
.card { background: var(--lx-card); border: 1px solid var(--lx-line); border-radius: var(--lx-radius-md); padding: var(--lx-space-5); box-shadow: var(--lx-shadow-1); }
.stack { display: flex; flex-direction: column; gap: var(--lx-space-4); }
.field { display: flex; flex-direction: column; gap: var(--lx-space-2); }
.field-label {
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-label-weight);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-label-tracking);
  color: var(--lx-heading);
}
input, button { font: inherit; }
input {
  width: 100%;
  min-height: var(--lx-space-8);
  padding: var(--lx-space-2) var(--lx-space-3);
  border: 1px solid var(--lx-border-strong);
  border-radius: var(--lx-radius-sm);
  background: var(--lx-card);
  color: var(--lx-text);
}
input:focus { outline: 2px solid var(--lx-brand); outline-offset: 2px; }
.hint { color: var(--lx-muted); font-size: var(--lx-text-small-size); font-weight: var(--lx-text-small-weight); line-height: var(--lx-text-small-lh); letter-spacing: var(--lx-text-small-tracking); }
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
.notice {
  border-radius: var(--lx-radius-sm);
  padding: var(--lx-space-2) var(--lx-space-3);
  margin: 0;
  background: var(--lx-sunken);
  border: 1px solid var(--lx-line);
  color: var(--lx-text);
  font-size: var(--lx-text-small-size);
  line-height: var(--lx-text-small-lh);
}
.notice.warn { background: var(--lx-warn-bg); color: var(--lx-warn-text); border-color: var(--lx-warn-border); }
.notice.ok { background: var(--lx-ok-bg); color: var(--lx-ok-text); border-color: var(--lx-ok-border); }
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: var(--lx-space-8);
  border: 1px solid var(--lx-border-strong); border-radius: var(--lx-radius-sm); padding: var(--lx-space-2) var(--lx-space-4);
  background: var(--lx-card); color: var(--lx-text); cursor: pointer;
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
.btn.primary { background: var(--lx-brand); border-color: var(--lx-brand); color: var(--lx-brand-on); }
.btn.primary:hover:not(:disabled) { background: var(--lx-brand-hover); border-color: var(--lx-brand-hover); }
.btn.ghost { background: transparent; }
.submit-row { display: flex; flex-direction: column; gap: var(--lx-space-3); }
.btn.primary[aria-busy="true"]::before {
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
/* Credential block: the success state of a registration is the pair the user
   must carry to the client, so it is typeset like data — sunken surface,
   monospaced tabular values (docs/design-system.md §0). */
.server-box {
  background: var(--lx-sunken);
  border: 1px solid var(--lx-line);
  border-radius: var(--lx-radius-sm);
  padding: var(--lx-space-4);
  margin: var(--lx-space-4) 0 var(--lx-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--lx-space-3);
}
.server-row { display: flex; gap: var(--lx-space-3); align-items: baseline; flex-wrap: wrap; }
.server-key {
  color: var(--lx-muted);
  font-size: var(--lx-text-label-size);
  font-weight: var(--lx-text-label-weight);
  line-height: var(--lx-text-label-lh);
  letter-spacing: var(--lx-text-label-tracking);
  min-width: 68px;
}
code {
  font-family: var(--lx-font-mono);
  font-size: var(--lx-text-small-size);
  font-weight: var(--lx-text-small-weight);
  line-height: var(--lx-text-small-lh);
  letter-spacing: var(--lx-text-small-tracking);
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}
.success-steps { margin: 0; padding-left: var(--lx-space-5); color: var(--lx-text); font-size: var(--lx-text-small-size); line-height: var(--lx-text-small-lh); }
.success-steps li + li { margin-top: var(--lx-space-1); }
@keyframes lx-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 640px) {
  .wrap { padding: var(--lx-space-6) var(--lx-space-4) var(--lx-space-7); }
  .card { padding: var(--lx-space-4); }
  .btn { width: 100%; }
  .server-row { flex-direction: column; gap: var(--lx-space-1); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .btn:active:not(:disabled) { transform: none; }
}
`

const registerScript = `
(function () {
  'use strict'

  var USERNAME_RE = /^[A-Za-z0-9_-]{3,32}$/
  var state = { mode: null }
  var VIEWS = ['loading-view', 'closed-view', 'error-view', 'form-view', 'success-view']

  function $(id) {
    return document.getElementById(id)
  }

  function show(id) {
    for (var i = 0; i < VIEWS.length; i++) {
      $(VIEWS[i]).hidden = VIEWS[i] !== id
    }
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

  function showFormError(message) {
    var node = $('form-error')
    node.textContent = message
    node.hidden = false
  }

  function clearFormError() {
    var node = $('form-error')
    node.textContent = ''
    node.hidden = true
  }

  function setSubmitBusy(busy) {
    var submit = $('submit')
    submit.disabled = busy
    submit.setAttribute('aria-busy', busy ? 'true' : 'false')
  }

  function render() {
    if (state.mode === 'closed') {
      show('closed-view')
      return
    }
    if (state.mode !== 'open' && state.mode !== 'approval') {
      show('closed-view')
      return
    }
    var hint = $('mode-hint')
    if (state.mode === 'approval') {
      hint.textContent = '提交后需要管理员批准，批准后即可连接。'
      hint.className = 'notice warn'
    } else {
      hint.textContent = '注册成功后可立即连接。'
      hint.className = 'notice ok'
    }
    clearFormError()
    show('form-view')
  }

  async function loadInfo() {
    show('loading-view')
    try {
      var res = await fetch('/api/registration-info', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      var data = await res.json()
      state.mode = data && data.registrationMode ? data.registrationMode : null
      render()
    } catch (err) {
      show('error-view')
    }
  }

  function showSuccess(status) {
    var active = status === 'active'
    $('success-title').textContent = active ? '注册成功，可直接连接' : '已提交，等待管理员批准'
    $('success-desc').textContent = active
      ? '打开 LX Music 客户端，填写下面的服务器地址和连接码即可开始同步。'
      : '管理员批准后即可连接。打开 LX Music 客户端，填写下面的服务器地址和连接码。'
    $('server-address').textContent = location.origin
    show('success-view')
  }

  $('form-view').addEventListener('submit', async function (event) {
    event.preventDefault()
    clearFormError()

    var name = $('name').value.trim()
    var password = $('password').value
    var confirm = $('confirm').value

    var problem = validateName(name) || validatePassword(password)
    if (problem) {
      showFormError(problem)
      return
    }
    if (password !== confirm) {
      showFormError('两次输入的密码不一致')
      return
    }

    setSubmitBusy(true)
    try {
      var res = await fetch('/api/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name, password: password })
      })
      var data = null
      try {
        data = await res.json()
      } catch (err) {
        data = null
      }

      if (res.status === 201 && data && data.status) {
        showSuccess(data.status)
        return
      }
      if (res.status === 409) {
        showFormError('该用户名已被占用或保留，请换一个。')
        return
      }
      if (res.status === 400) {
        showFormError(
          '用户名需为 3–32 位字母/数字/下划线/短横线，密码需为 8–128 位。'
        )
        return
      }
      if (res.status === 403) {
        await loadInfo()
        if (state.mode !== 'closed') showFormError('操作过于频繁，请稍后再试。')
        return
      }
      showFormError('注册失败（HTTP ' + res.status + '），请稍后再试。')
    } catch (err) {
      showFormError('网络错误，请检查连接后重试。')
    } finally {
      setSubmitBusy(false)
    }
  })

  var passwordInput = $('password')
  passwordInput.addEventListener('input', function () {
    updatePasswordHint(passwordInput, $('password-hint'))
  })

  $('retry-btn').addEventListener('click', loadInfo)

  $('again-btn').addEventListener('click', function () {
    $('form-view').reset()
    updatePasswordHint(passwordInput, $('password-hint'))
    loadInfo()
  })

  loadInfo()
})()
`

export const registerPageHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/favicon.ico" sizes="any">
<title>注册 · LX Music Server</title>
<style>
${ssrTokenCss}
${registerStyles}
</style>
</head>
<body>
<main class="wrap">
  <header class="head">
    <p class="eyebrow">LX Music · Sync Server</p>
    <h1>注册 LX Music 账号</h1>
    <p class="muted">在当前服务器创建同步账号</p>
  </header>

  <section class="card">
    <p class="muted" id="loading-view">正在读取注册状态…</p>
    <noscript><p class="form-error">注册页面需要启用 JavaScript。</p></noscript>

    <div id="closed-view" hidden>
      <h2>暂未开放注册</h2>
      <p class="muted">本站当前未开放自助注册，请联系管理员为你开通账号。</p>
    </div>

    <div id="error-view" hidden>
      <h2>无法读取注册状态</h2>
      <p class="muted">请检查网络后重试。</p>
      <button class="btn primary" id="retry-btn" type="button">重试</button>
    </div>

    <form class="stack" id="form-view" hidden novalidate>
      <p class="notice" id="mode-hint"></p>
      <label class="field">
        <span class="field-label">用户名</span>
        <input id="name" type="text" autocomplete="username" maxlength="32" required>
        <span class="hint">3–32 位字母、数字、下划线或短横线</span>
      </label>
      <label class="field">
        <span class="field-label">密码（连接码）</span>
        <input id="password" type="password" autocomplete="new-password" required>
        <span class="hint" id="password-hint">至少 8 位，建议 16 位以上随机密码</span>
      </label>
      <label class="field">
        <span class="field-label">确认密码</span>
        <input id="confirm" type="password" autocomplete="new-password" required>
      </label>
      <p class="form-error" id="form-error" hidden></p>
      <div class="submit-row">
        <button class="btn primary" id="submit" type="submit">注册</button>
        <p class="hint">注册成功后，用这个用户名和密码（连接码）在 LX Music 客户端连接本服务器。</p>
      </div>
    </form>

    <div id="success-view" hidden>
      <h2 id="success-title"></h2>
      <p class="muted" id="success-desc"></p>
      <div class="server-box">
        <div class="server-row">
          <span class="server-key">服务器地址</span>
          <code id="server-address"></code>
        </div>
      </div>
      <ol class="success-steps">
        <li>打开 LX Music 客户端的「同步设置」。</li>
        <li>填写上面的服务器地址与你的用户名。</li>
        <li>用你刚才设置的密码（连接码）完成连接。</li>
      </ol>
      <p class="hint">连接码就是你刚才设置的密码。</p>
      <button class="btn ghost" id="again-btn" type="button">再注册一个</button>
    </div>
  </section>
</main>

<script>
${registerScript}
</script>
</body>
</html>`
