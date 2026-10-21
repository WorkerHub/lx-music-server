// The registration page mirrors the admin panel: one self-contained HTML
// document with inline styles and vanilla JS, no build step and no external
// resources. It reads the public registration mode, then renders either the
// closed notice, the form, or the success instructions.
//
// Like the admin panel, every dynamic value is written with textContent; the
// client script avoids template literals so the document can live in one outer
// template.

const registerStyles = `
:root {
  color-scheme: light dark;
  --bg: #f4f5f7;
  --card: #ffffff;
  --text: #1b1f24;
  --muted: #667085;
  --line: #e3e6ea;
  --primary: #2563eb;
  --primary-text: #ffffff;
  --ok-bg: #ecfdf3;
  --ok-text: #067647;
  --warn-bg: #fffaeb;
  --warn-text: #b54708;
  --danger-bg: #fef3f2;
  --danger-text: #b42318;
  --shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111418;
    --card: #1a1f26;
    --text: #e6e9ee;
    --muted: #98a2b3;
    --line: #2b323c;
    --primary: #3b82f6;
    --ok-bg: #0d2a1d;
    --ok-text: #75e0a7;
    --warn-bg: #2e2410;
    --warn-text: #fec84b;
    --danger-bg: #331715;
    --danger-text: #fda29b;
    --shadow: none;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
.wrap { max-width: 520px; margin: 0 auto; padding: 48px 16px 64px; }
.head { margin-bottom: 18px; }
.head h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 17px; margin: 0 0 10px; }
.muted { color: var(--muted); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 20px; box-shadow: var(--shadow); }
.stack { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-weight: 600; }
input, button { font: inherit; }
input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  color: var(--text);
}
input:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
.hint { color: var(--muted); font-size: 12px; }
.hint.warn { color: var(--warn-text); }
.hint.ok { color: var(--ok-text); }
.form-error { color: var(--danger-text); background: var(--danger-bg); border-radius: 8px; padding: 8px 10px; margin: 0; }
.notice { border-radius: 8px; padding: 9px 12px; margin: 0; background: var(--bg); border: 1px solid var(--line); color: var(--text); }
.notice.warn { background: var(--warn-bg); color: var(--warn-text); border-color: transparent; }
.notice.ok { background: var(--ok-bg); color: var(--ok-text); border-color: transparent; }
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--line); border-radius: 8px; padding: 8px 14px;
  background: var(--card); color: var(--text); cursor: pointer;
}
.btn:hover:not(:disabled) { border-color: var(--muted); }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn.primary { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
.btn.ghost { background: transparent; }
.server-box { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 14px 0 10px; }
.server-row { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.server-key { color: var(--muted); }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; word-break: break-all; }
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

    var submit = $('submit')
    submit.disabled = true
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
      submit.disabled = false
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
${registerStyles}
</style>
</head>
<body>
<main class="wrap">
  <header class="head">
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
      <button class="btn primary" id="submit" type="submit">注册</button>
      <p class="hint">注册成功后，用这个用户名和密码（连接码）在 LX Music 客户端连接本服务器。</p>
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
