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

const adminStyles = `
:root {
  color-scheme: light dark;
  --bg: #f4f5f7;
  --card: #ffffff;
  --text: #1b1f24;
  --muted: #667085;
  --line: #e3e6ea;
  --primary: #2563eb;
  --primary-text: #ffffff;
  --danger: #d92d20;
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
body.modal-open { overflow: hidden; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 24px 16px 64px; }
.topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.topbar h1 { font-size: 20px; margin: 0 0 4px; }
.topbar-actions { display: flex; gap: 8px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 16px; }
.tab {
  border: none; background: transparent; color: var(--muted); font: inherit;
  padding: 8px 12px; cursor: pointer; white-space: nowrap;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab:hover { color: var(--text); }
.tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.tab:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
h2 { font-size: 16px; margin: 0; }
.muted { color: var(--muted); }
.center { text-align: center; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 18px; margin-bottom: 16px; box-shadow: var(--shadow); }
.section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.login-card { max-width: 420px; margin: 48px auto; }
.stack { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-weight: 600; }
input, select, button { font: inherit; }
input, select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  color: var(--text);
}
input:focus, select:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
.hint { color: var(--muted); font-size: 12px; }
.hint.warn { color: var(--warn-text); }
.hint.ok { color: var(--ok-text); }
.form-error { color: var(--danger-text); background: var(--danger-bg); border-radius: 8px; padding: 8px 10px; margin: 0; }
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--line); border-radius: 8px; padding: 7px 12px;
  background: var(--card); color: var(--text); cursor: pointer; white-space: nowrap;
}
.btn:hover:not(:disabled) { border-color: var(--muted); }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.btn.primary { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
.btn.danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.btn.ghost { background: transparent; }
.btn.sm { padding: 4px 9px; font-size: 13px; }
.grid-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; align-items: start; }
.form-actions { display: flex; align-items: end; }
.grid-form .form-error { grid-column: 1 / -1; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; color: var(--muted); font-weight: 600; white-space: nowrap; }
tbody tr:last-child td { border-bottom: none; }
.name-cell { font-weight: 600; word-break: break-all; }
.actions-col { white-space: nowrap; }
.row-actions { display: flex; gap: 6px; flex-wrap: nowrap; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--bg); color: var(--muted); }
.badge.ok { background: var(--ok-bg); color: var(--ok-text); }
.badge.warn { background: var(--warn-bg); color: var(--warn-text); }
.badge.danger { background: var(--danger-bg); color: var(--danger-text); }
.data-status { min-width: 210px; }
.status-line { display: flex; gap: 6px; font-size: 13px; }
.status-key { color: var(--muted); min-width: 36px; }
.empty { color: var(--muted); padding: 12px 0 0; margin: 0; }
.mode-options { display: grid; gap: 10px; }
.mode-option { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
.mode-option input { width: auto; margin-top: 3px; }
.mode-option span { display: flex; flex-direction: column; gap: 2px; }
.check { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
.check input { width: auto; margin-top: 3px; }
.notice { border-radius: 8px; padding: 9px 12px; margin-bottom: 14px; background: var(--bg); border: 1px solid var(--line); }
.notice.ok { background: var(--ok-bg); color: var(--ok-text); border-color: transparent; }
.notice.warn { background: var(--warn-bg); color: var(--warn-text); border-color: transparent; }
.notice.err { background: var(--danger-bg); color: var(--danger-text); border-color: transparent; }
.modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 20; }
.modal-backdrop { position: absolute; inset: 0; background: rgba(16, 24, 40, 0.55); }
.modal-card { position: relative; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; background: var(--card); border-radius: 12px; padding: 18px; box-shadow: 0 20px 40px rgba(16, 24, 40, 0.2); }
.modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.modal-desc { color: var(--muted); margin: 0 0 14px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.icon-btn { border: none; background: transparent; color: var(--muted); font-size: 22px; line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: 6px; }
.icon-btn:hover { background: var(--bg); color: var(--text); }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.kpi { margin-bottom: 0; display: flex; flex-direction: column; gap: 2px; }
.kpi-label { color: var(--muted); font-size: 13px; }
.kpi-value { font-size: 26px; font-weight: 700; line-height: 1.25; }
.todo-list { display: flex; flex-direction: column; gap: 8px; }
.todo-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; text-align: left; font: inherit; cursor: pointer;
  border: 1px solid var(--line); background: var(--bg); color: var(--text);
  border-radius: 8px; padding: 10px 12px;
}
.todo-item:hover { border-color: var(--muted); }
.todo-item:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
.todo-arrow { color: var(--muted); }
.chart { display: flex; align-items: flex-end; gap: 2px; height: 120px; padding-top: 8px; }
.chart-col { flex: 1 1 0; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
.chart-bar { width: 100%; background: var(--primary); border-radius: 2px 2px 0 0; }
.chart-bar.zero { background: var(--line); min-height: 2px; }
.chart-range { margin: 6px 0 0; font-size: 12px; }
.build-line { margin: 0; font-size: 12px; text-align: center; }
.about-hero { display: flex; flex-direction: column; gap: 4px; }
.about-hero h2 { font-size: 18px; }
.about-hash { display: inline-block; margin-top: 6px; font-size: 20px; font-weight: 700; }
.about-list { margin: 0; }
.about-row { display: grid; grid-template-columns: 96px 1fr; gap: 12px; align-items: baseline; padding: 9px 0; border-bottom: 1px solid var(--line); }
.about-row:last-child { border-bottom: none; }
.about-row dt { color: var(--muted); }
.about-row dd { margin: 0; word-break: break-all; }
.about-row a { color: var(--primary); }
@media (max-width: 640px) {
  .wrap { padding: 16px 12px 48px; }
  .card { padding: 14px; }
  .tabs { flex-wrap: wrap; }
  .actions-col { white-space: normal; }
  .row-actions { flex-wrap: wrap; }
  .chart { height: 96px; }
  .kpi-value { font-size: 22px; }
  .about-row { grid-template-columns: 1fr; gap: 2px; }
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
  // The repository link is applied with setAttribute so the document itself
  // never references an external origin (the page's own guard and CSP treat
  // that as a loaded resource, while an anchor is only user navigation).
  var REPO_URL = 'https://github.com/WorkerHub/lx-music-server'

  var state = {
    users: [],
    orphans: [],
    mode: 'approval',
    modeReady: false,
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
    node.addEventListener('click', handler)
    return node
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild)
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
    showLogin('登录已过期，请重新登录')
    return true
  }

  function showLogin(message) {
    closeModal()
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
    var tab = tabFromHash()
    // Keep the URL and the visible panel in sync, including the first load
    // without a hash: the home tab is the landing page.
    normalizeHash(tab)
    activateTab(tab)
  }

  async function loadUsers() {
    var data = await api('/api/admin/users')
    state.users = data && Array.isArray(data.users) ? data.users : []
    renderUsers()
  }

  async function loadOrphans() {
    var data = await api('/api/admin/orphans')
    state.orphans = Array.isArray(data) ? data : []
    renderOrphans()
  }

  async function loadMode() {
    try {
      var data = await api('/api/registration-info')
      state.mode = data && data.registrationMode ? data.registrationMode : 'approval'
      state.modeReady = true
    } catch (err) {
      state.modeReady = false
    }
    renderMode()
  }

  async function refreshAll() {
    await loadUsers()
    await loadOrphans()
  }

  function renderUsers() {
    var body = $('users-body')
    clear(body)
    $('users-count').textContent = state.users.length
      ? '共 ' + state.users.length + ' 个账号'
      : ''
    $('users-empty').hidden = state.users.length > 0

    state.users.forEach(function (user) {
      var row = el('tr')
      row.appendChild(el('td', 'name-cell', user.name))

      var statusCell = el('td')
      statusCell.appendChild(
        el('span', 'badge ' + statusClass(user.status), labelFrom(STATUS_LABELS, user.status))
      )
      row.appendChild(statusCell)

      row.appendChild(el('td', null, labelFrom(SOURCE_LABELS, user.source)))
      row.appendChild(el('td', 'muted', formatTime(user.createdAt)))

      var deviceCount = user.deviceCount
      var deviceCell = el(
        'td',
        null,
        deviceCount === null || deviceCount === undefined ? '—' : String(deviceCount)
      )
      if (deviceCount === null) deviceCell.title = '设备数读取失败'
      row.appendChild(deviceCell)

      row.appendChild(
        el(
          'td',
          null,
          user.maxSnapshotNum === undefined || user.maxSnapshotNum === null
            ? '默认'
            : String(user.maxSnapshotNum)
        )
      )

      var actionCell = el('td', 'actions-col')
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
        button('批准', 'btn primary sm', function () {
          runAction(
            group,
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
        button('禁用', 'btn ghost sm', function () {
          runAction(
            group,
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
        button('启用', 'btn ghost sm', function () {
          runAction(
            group,
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

  async function runAction(group, action, successText, overrides) {
    var buttons = group.querySelectorAll('button')
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true
    try {
      await action()
      notice(successText, 'ok')
      await refreshAll()
    } catch (err) {
      if (handleAuth(err)) return
      var custom = overrides ? overrides[err.status] : ''
      notice(custom || messageFor(err), err.status === 502 ? 'warn' : 'err')
    } finally {
      for (var j = 0; j < buttons.length; j++) buttons[j].disabled = false
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
    $('orphans-empty').hidden = state.orphans.length > 0

    state.orphans.forEach(function (orphan) {
      var row = el('tr')
      row.appendChild(el('td', 'name-cell', orphan.name))
      row.appendChild(el('td', null, labelFrom(SOURCE_LABELS, orphan.source)))
      row.appendChild(el('td', 'muted', formatTime(orphan.deletedAt)))

      var statusCell = el('td', 'data-status')
      renderDataStatus(statusCell, orphan.dataStatus)
      row.appendChild(statusCell)

      var actionCell = el('td', 'actions-col')
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
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = radios[i].value === state.mode
      radios[i].disabled = !state.modeReady
    }
    $('mode-hint').textContent = state.modeReady
      ? '注册页地址：/register；切换后立即生效。'
      : '注册模式读取失败，请刷新页面重试。'
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

  function renderHome() {
    var pending = pendingTotal()
    $('kpi-users').textContent = String(state.users.length)
    $('kpi-devices').textContent = String(deviceTotal())
    $('kpi-pending').textContent = String(pending)
    $('kpi-orphans').textContent = String(state.orphans.length)
    renderTodo(pending)
    renderRecent()
    renderActivity()
  }

  function renderTodo(pending) {
    var list = $('todo-list')
    clear(list)
    var orphans = state.orphans.length
    if (pending === 0 && orphans === 0) {
      list.appendChild(el('p', 'empty', '暂无待处理事项'))
      return
    }
    if (pending > 0) {
      list.appendChild(todoItem(pending + ' 个注册待审批', 'users'))
    }
    if (orphans > 0) {
      list.appendChild(todoItem(orphans + ' 条数据残留待处理', 'settings'))
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
    var rows = state.users.slice()
    rows.sort(function (a, b) {
      return timestampOf(b.createdAt) - timestampOf(a.createdAt)
    })
    rows = rows.slice(0, 5)
    $('recent-empty').hidden = rows.length > 0

    rows.forEach(function (user) {
      var row = el('tr')
      row.appendChild(el('td', 'name-cell', user.name))
      var statusCell = el('td')
      statusCell.appendChild(
        el(
          'span',
          'badge ' + statusClass(user.status),
          labelFrom(STATUS_LABELS, user.status)
        )
      )
      row.appendChild(statusCell)
      row.appendChild(el('td', 'muted', formatTime(user.createdAt)))
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

  function renderActivity() {
    var series = activitySeries()
    var bars = $('chart-bars')
    clear(bars)

    var peak = 0
    series.days.forEach(function (entry) {
      if (entry.count > peak) peak = entry.count
    })

    series.days.forEach(function (entry) {
      var column = el('div', 'chart-col')
      var bar = el('div', entry.count === 0 ? 'chart-bar zero' : 'chart-bar')
      bar.style.height = (peak === 0 ? 0 : Math.round((entry.count / peak) * 100)) + '%'
      column.title = entry.key + ' · ' + entry.count + ' 人'
      column.appendChild(bar)
      bars.appendChild(column)
    })

    $('chart-total').textContent =
      series.total === 0 ? '近 30 天暂无新增' : '近 30 天新增 ' + series.total + ' 人'
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

  async function loadBuildInfo() {
    try {
      var data = await api('/api/admin/build-info')
      state.build = data && typeof data === 'object' ? data : null
    } catch (err) {
      // Build metadata is cosmetic: a failure hides the footer instead of
      // interrupting the panel. Session expiry is handled by the data loads.
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
    $('about-commit-short').textContent = shortCommit(commit)
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
    submit.disabled = true
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
      if (err.status === 401) {
        modalState.busy = false
        closeModal()
        showLogin('登录已过期，请重新登录')
        return
      }
      errorNode.textContent = messageFor(err)
      errorNode.hidden = false
    } finally {
      modalState.busy = false
      cancel.disabled = false
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
    clear(container)
    container.appendChild(el('p', 'muted', '正在读取设备…'))
    var devices
    try {
      devices = await api('/api/admin/users/' + encodeURIComponent(name) + '/devices')
    } catch (err) {
      if (err.status === 401) {
        closeModal()
        showLogin('登录已过期，请重新登录')
        return
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
      var row = el('tr')
      row.appendChild(el('td', null, device.deviceName || '未命名设备'))
      row.appendChild(el('td', null, device.isMobile ? '手机' : '桌面'))
      row.appendChild(
        el(
          'td',
          'muted',
          device.lastConnectDate ? formatTime(device.lastConnectDate) : '从未连接'
        )
      )
      var idCell = el('td')
      idCell.appendChild(el('code', null, device.clientId || ''))
      row.appendChild(idCell)
      var actionCell = el('td')
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
    showPanel()
    try {
      await loadUsers()
    } catch (err) {
      if (handleAuth(err)) return
      notice(messageFor(err), 'err')
      return
    }
    try {
      await Promise.all([loadOrphans(), loadMode(), loadBuildInfo()])
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
      submit.disabled = true
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
        submit.disabled = false
      }
    })

    $('refresh-btn').addEventListener('click', async function () {
      var node = this
      node.disabled = true
      try {
        await Promise.all([loadUsers(), loadOrphans(), loadMode()])
        notice('已刷新', 'ok')
      } catch (err) {
        if (!handleAuth(err)) notice(messageFor(err), 'err')
      } finally {
        node.disabled = false
      }
    })

    $('logout-btn').addEventListener('click', async function () {
      var node = this
      node.disabled = true
      var loggedOut = false
      try {
        await api('/api/admin/logout', { method: 'POST' })
        loggedOut = true
      } catch (err) {
        if (err.status === 401) loggedOut = true
        else notice(messageFor(err), 'err')
      } finally {
        node.disabled = false
      }
      if (!loggedOut) return
      state.users = []
      state.orphans = []
      notice('已退出登录', 'ok')
      showLogin('')
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
      submit.disabled = true
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
        submit.disabled = false
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

    // The repository link is a navigation target, not a loaded resource, so its
    // href is applied here instead of living in the static markup.
    $('about-repo').setAttribute('href', REPO_URL)

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
      if (event.key === 'Escape' && !$('modal').hidden) closeModal()
    })
  }

  async function init() {
    try {
      await loadUsers()
    } catch (err) {
      $('boot').hidden = true
      if (err.status === 401) showLogin('')
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
<link rel="icon" href="data:,">
<title>管理面板 · LX Music Server</title>
<style>
${adminStyles}
</style>
</head>
<body>
<main class="wrap">
  <header class="topbar">
    <div>
      <h1>LX Music 管理面板</h1>
      <p class="muted">管理同步账号、注册模式与保留数据</p>
    </div>
    <div class="topbar-actions" id="session-actions" hidden>
      <button class="btn ghost" id="refresh-btn" type="button">刷新</button>
      <button class="btn ghost" id="logout-btn" type="button">退出登录</button>
    </div>
  </header>

  <p class="muted center" id="boot">正在加载…</p>
  <noscript><p class="form-error">管理面板需要启用 JavaScript。</p></noscript>
  <div class="notice" id="notice" role="status" aria-live="polite" hidden></div>

  <section class="card login-card" id="login-view" hidden>
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
          <strong class="kpi-value" id="kpi-users">0</strong>
        </div>
        <div class="card kpi">
          <span class="kpi-label">设备总数</span>
          <strong class="kpi-value" id="kpi-devices">0</strong>
        </div>
        <div class="card kpi">
          <span class="kpi-label">待审批</span>
          <strong class="kpi-value" id="kpi-pending">0</strong>
        </div>
        <div class="card kpi">
          <span class="kpi-label">数据残留</span>
          <strong class="kpi-value" id="kpi-orphans">0</strong>
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
        <div class="table-wrap">
          <table>
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
            <input type="radio" name="registrationMode" value="closed">
            <span><strong>关闭注册</strong><span class="muted">仅管理员可添加用户</span></span>
          </label>
          <label class="mode-option">
            <input type="radio" name="registrationMode" value="approval">
            <span><strong>需批准（默认）</strong><span class="muted">注册后为待批准，管理员批准后可用</span></span>
          </label>
          <label class="mode-option">
            <input type="radio" name="registrationMode" value="open">
            <span><strong>开放注册</strong><span class="muted">注册后立即可用</span></span>
          </label>
        </div>
        <p class="hint" id="mode-hint">注册页地址：/register；切换后立即生效。</p>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>数据残留</h2>
          <span class="muted">已删除账号保留的同步数据</span>
        </div>
        <div class="table-wrap">
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
      </section>
    </div>

    <div id="tab-panel-about" hidden>
      <section class="card about-hero">
        <h2>LX Music 管理面板</h2>
        <p class="muted">LX Music 同步服务的管理后台</p>
        <code class="about-hash" id="about-commit-short">dev</code>
      </section>

      <section class="card">
        <div class="section-head">
          <h2>构建信息</h2>
          <span class="muted">由部署流程注入</span>
        </div>
        <dl class="about-list">
          <div class="about-row">
            <dt>产品名称</dt>
            <dd>LX Music 管理面板</dd>
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
              <a id="about-repo" target="_blank" rel="noopener noreferrer">WorkerHub/lx-music-server</a>
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
