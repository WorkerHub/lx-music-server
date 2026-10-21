import { describe, expect, it } from 'vitest'
import { adminPageHtml } from '@/pages/admin'
import { registerPageHtml } from '@/pages/register'
import app from './pages'

const ADMIN_HASH = 'a'.repeat(64)

const makeEnv = (hash?: string): LX.Env =>
  ({ LX_ADMIN_PASSWORD_HASH: hash }) as unknown as LX.Env

describe('page routes', () => {
  it('hides the admin page when the admin hash is missing', async () => {
    const res = await app.request('/admin', {}, makeEnv())
    expect(res.status).toBe(404)
  })

  it('hides the admin page when the admin hash is malformed', async () => {
    const res = await app.request('/admin', {}, makeEnv('not-a-hash'))
    expect(res.status).toBe(404)
  })

  it('serves the admin page with hardened headers when configured', async () => {
    const res = await app.request('/admin', {}, makeEnv(ADMIN_HASH))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    )
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(await res.text()).toContain('LX Music 管理面板')
  })

  it('always serves the register page', async () => {
    const res = await app.request('/register', {}, makeEnv())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('注册 LX Music 账号')
  })
})

const pages: Array<[string, string]> = [
  ['admin', adminPageHtml],
  ['register', registerPageHtml],
]

// Markup that makes the browser fetch something from another origin. A plain
// `<a href="https://...">` is user navigation, not a load, so it is allowed on
// purpose (the about tab links to the public repository).
//
// Rules: matching is case-insensitive (HTML attribute names and CSS function
// names are), quoted and unquoted attribute values are both caught, and any
// whitespace after `=` or after the opening quote is skipped.
//
// Covered resource entry points: `src` / `srcset` (script, img, iframe, video,
// audio, source, embed, track, input, data-src-style lazy loaders…), `<link
// href>` (stylesheet, preload, icon), `object data`, iframe `srcdoc`, `poster`
// (video), the legacy `background` attribute, CSS `url()` and `@import`.
//
// Known gaps, deliberate: `<meta http-equiv="refresh" content="0;url=...">` is
// navigation rather than a subresource load (same as an anchor), and HTML
// entity-encoded URLs (`&#104;ttps://...`) are not decoded by these regexes.
// Both pages are also served with CSP `default-src 'none'`, so a variant that
// slips past a rule still cannot load anything.
//
// `@import` is banned unconditionally, including same-origin and relative
// imports: both pages are single self-contained documents, so any import is a
// violation. The self-test below pins that policy down.
const EXTERNAL_RESOURCE_PATTERNS: Record<string, RegExp> = {
  src: /\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i,
  srcset: /\bsrcset\s*=\s*["']?\s*(?:https?:)?\/\//i,
  'object data': /\bdata\s*=\s*["']?\s*(?:https?:)?\/\//i,
  'iframe srcdoc': /\bsrcdoc\s*=\s*["']?\s*(?:https?:)?\/\//i,
  'video poster': /\bposter\s*=\s*["']?\s*(?:https?:)?\/\//i,
  'body background': /\bbackground\s*=\s*["']?\s*(?:https?:)?\/\//i,
  '<link href>': /<link\b[^>]*\bhref\s*=\s*["']?\s*(?:https?:)?\/\//i,
  '@import': /@import/i,
  'css url()': /url\(\s*["']?\s*(?:https?:)?\/\//i,
}

describe('page markup safety', () => {
  // Slice of the inline script between two markers, so an assertion can only
  // pass on the code it names. Both markers must exist and come in order.
  const section = (start: string, end: string): string => {
    const from = adminPageHtml.indexOf(start)
    expect(from, `missing start marker: ${start}`).toBeGreaterThan(-1)
    const to = adminPageHtml.indexOf(end, from + start.length)
    expect(to, `missing end marker: ${end}`).toBeGreaterThan(from)
    return adminPageHtml.slice(from, to)
  }

  for (const [name, html] of pages) {
    it(`${name} page has no HTML injection sinks`, () => {
      expect(html).not.toMatch(
        /innerHTML|outerHTML|insertAdjacentHTML|document\.write/,
      )
    })

    it(`${name} page loads no external resources`, () => {
      for (const [label, pattern] of Object.entries(
        EXTERNAL_RESOURCE_PATTERNS,
      )) {
        expect(html, `external ${label}`).not.toMatch(pattern)
      }
    })
  }

  it('external resource guard still catches real loads', () => {
    // Every entry must be caught by the named rule, so a rule cannot silently
    // stop covering the variant it exists for.
    const violations: Array<[string, string]> = [
      ['<script src="https://cdn.example/x.js"></script>', 'src'],
      ['<script src=https://cdn.example/x.js></script>', 'src'],
      ['<SCRIPT SRC="https://cdn.example/x.js"></SCRIPT>', 'src'],
      ['<img src="//cdn.example/x.png">', 'src'],
      // Whitespace after the `=` and after the opening quote is still a load.
      ['<script src=  https://cdn.example/x.js></script>', 'src'],
      ['<img src=" https://cdn.example/x.png">', 'src'],
      ['<img srcset="https://cdn.example/x.png 1x">', 'srcset'],
      [
        '<link rel="stylesheet" href="https://cdn.example/x.css">',
        '<link href>',
      ],
      ['<link rel=stylesheet href=https://cdn.example/x.css>', '<link href>'],
      ['<object data="https://cdn.example/x.swf"></object>', 'object data'],
      ['<iframe srcdoc="//cdn.example/x.html"></iframe>', 'iframe srcdoc'],
      ['<video poster=https://cdn.example/x.jpg></video>', 'video poster'],
      ['<VIDEO POSTER="https://cdn.example/x.jpg"></VIDEO>', 'video poster'],
      ['<body background="https://cdn.example/x.png">', 'body background'],
      ['<BODY BACKGROUND=https://cdn.example/x.png>', 'body background'],
      ['<style>@import "x.css";</style>', '@import'],
      ['<style>@import url(https://cdn.example/x.css);</style>', '@import'],
      [
        '<style>.a { background: url(https://cdn.example/x.png); }</style>',
        'css url()',
      ],
      [
        '<style>.a { background: URL(https://cdn.example/x.png); }</style>',
        'css url()',
      ],
    ]
    for (const [sample, label] of violations) {
      expect(EXTERNAL_RESOURCE_PATTERNS[label], label).toBeDefined()
      expect(
        EXTERNAL_RESOURCE_PATTERNS[label].test(sample),
        `${label}: ${sample}`,
      ).toBe(true)
      expect(
        Object.values(EXTERNAL_RESOURCE_PATTERNS).some((pattern) =>
          pattern.test(sample),
        ),
        sample,
      ).toBe(true)
    }

    // Same-origin or inline references are not external loads, and neither is
    // user navigation (an anchor, a meta refresh target).
    const allowed = [
      '<script src="/static/app.js"></script>',
      '<img src="data:image/png;base64,AAAA">',
      '<link rel="icon" href="data:,">',
      '<video poster="/static/poster.jpg"></video>',
      '<a href="https://github.com/WorkerHub/lx-music-server">repo</a>',
      '<a href=https://github.com/WorkerHub/lx-music-server>repo</a>',
      '<a href=" https://github.com/WorkerHub/lx-music-server">repo</a>',
      '<meta http-equiv="refresh" content="0;url=https://example.com">',
    ]
    for (const sample of allowed) {
      expect(
        Object.values(EXTERNAL_RESOURCE_PATTERNS).some((pattern) =>
          pattern.test(sample),
        ),
        sample,
      ).toBe(false)
    }
  })

  it('keeps the required admin confirmation copy', () => {
    expect(adminPageHtml).toContain('同步数据保留')
    expect(adminPageHtml).toContain('不可恢复')
    expect(adminPageHtml).toContain('同时删除该用户全部设备')
  })

  it('splits the admin panel into users and settings tabs', () => {
    expect(adminPageHtml).toContain('id="tab-users"')
    expect(adminPageHtml).toContain('id="tab-settings"')
    expect(adminPageHtml).toContain('用户管理')
    expect(adminPageHtml).toContain('系统设置')
    expect(adminPageHtml).toContain("'#users'")
    expect(adminPageHtml).toContain("'#settings'")

    const usersPanel = adminPageHtml.slice(
      adminPageHtml.indexOf('id="tab-panel-users"'),
      adminPageHtml.indexOf('id="tab-panel-settings"'),
    )
    expect(usersPanel).toContain('id="users-body"')
    expect(usersPanel).toContain('id="add-form"')
    expect(usersPanel.indexOf('用户')).toBeLessThan(
      usersPanel.indexOf('添加用户'),
    )

    const settingsPanel = adminPageHtml.slice(
      adminPageHtml.indexOf('id="tab-panel-settings"'),
      adminPageHtml.indexOf('id="tab-panel-about"'),
    )
    expect(settingsPanel).toContain('id="mode-options"')
    expect(settingsPanel).toContain('id="orphans-body"')
    expect(settingsPanel.indexOf('注册设置')).toBeLessThan(
      settingsPanel.indexOf('数据残留'),
    )
    // The slice must stop at the panel boundary instead of running to EOF.
    expect(settingsPanel).not.toContain('id="about-repo"')
    expect(usersPanel).not.toContain('id="about-repo"')
  })

  it('expands the admin panel to four tabs in a fixed order', () => {
    const tabs: Array<[string, string, string]> = [
      ['home', '首页', "'#home'"],
      ['users', '用户管理', "'#users'"],
      ['settings', '系统设置', "'#settings'"],
      ['about', '关于', "'#about'"],
    ]

    const positions = tabs.map(([name, label, hash]) => {
      expect(adminPageHtml).toContain(`id="tab-${name}"`)
      expect(adminPageHtml).toContain(`id="tab-panel-${name}"`)
      expect(adminPageHtml).toContain(hash)
      expect(adminPageHtml).toContain(label)
      return adminPageHtml.indexOf(`id="tab-${name}"`)
    })
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('lands on the home tab by default and falls back to it', () => {
    expect(adminPageHtml).toContain("var DEFAULT_TAB = 'home'")
    expect(adminPageHtml).toContain("home: '#home'")
    expect(adminPageHtml.indexOf('id="tab-panel-home"')).toBeLessThan(
      adminPageHtml.indexOf('id="tab-panel-users"'),
    )

    const tabFromHash = adminPageHtml.slice(
      adminPageHtml.indexOf('function tabFromHash'),
      adminPageHtml.indexOf('function activateTab'),
    )
    expect(tabFromHash).toContain('return DEFAULT_TAB')
    expect(tabFromHash).not.toContain('users')
  })

  it('renders the home dashboard containers', () => {
    const containers = [
      'kpi-users',
      'kpi-devices',
      'kpi-pending',
      'kpi-orphans',
      'todo-list',
      'recent-body',
      'recent-empty',
      'chart-bars',
      'chart-total',
      'build-line',
    ]
    for (const id of containers) {
      expect(adminPageHtml).toContain(`id="${id}"`)
    }

    expect(adminPageHtml).toContain('用户总数')
    expect(adminPageHtml).toContain('设备总数')
    expect(adminPageHtml).toContain('待审批')
    expect(adminPageHtml).toContain('数据残留')
    expect(adminPageHtml).toContain('最近注册')
    expect(adminPageHtml).toContain('近 30 天新增')
    expect(adminPageHtml).toContain('暂无待处理事项')
    expect(adminPageHtml).toContain("'/api/admin/build-info'")
  })

  it('renders the about page build fields and repository link', () => {
    expect(adminPageHtml).toContain('id="tab-panel-about"')

    const fields = [
      'about-version',
      'about-commit',
      'about-commit-short',
      'about-built',
      'about-repo',
    ]
    for (const id of fields) {
      expect(adminPageHtml).toContain(`id="${id}"`)
    }

    expect(adminPageHtml).toContain('版本号')
    expect(adminPageHtml).toContain('构建哈希')
    expect(adminPageHtml).toContain('构建时间')

    // The repository link is static markup, not a runtime-injected href, so a
    // reader of the document can see where it points.
    const anchor =
      adminPageHtml.match(/<a\b[^>]*id="about-repo"[^>]*>/)?.[0] ?? ''
    expect(anchor).toContain(
      'href="https://github.com/WorkerHub/lx-music-server"',
    )
    expect(anchor).toContain('target="_blank"')
    expect(anchor).toContain('rel="noopener noreferrer"')
    expect(adminPageHtml).not.toMatch(/setAttribute\s*\(\s*['"]href['"]/)

    // dev builds must fall back to 'dev' / '—' instead of undefined or null.
    expect(adminPageHtml).toContain("commit === 'dev'")
    expect(adminPageHtml).toContain("'—'")
  })

  it('keeps orphan counts unknown until the list actually loads', () => {
    expect(adminPageHtml).toContain('orphansLoaded: false')
    // The KPI starts unknown, never a confident 0.
    expect(adminPageHtml).toContain('id="kpi-orphans">—<')

    const loadOrphans = adminPageHtml.slice(
      adminPageHtml.indexOf('async function loadOrphans'),
      adminPageHtml.indexOf('async function loadMode'),
    )
    expect(loadOrphans).toContain('state.orphansLoaded = true')
    expect(loadOrphans).toContain('state.orphansLoaded = false')
    expect(loadOrphans.indexOf('state.orphansLoaded = false')).toBeLessThan(
      loadOrphans.indexOf('state.orphansLoaded = true'),
    )

    const renderHome = adminPageHtml.slice(
      adminPageHtml.indexOf('function renderHome'),
      adminPageHtml.indexOf('function renderTodo'),
    )
    expect(renderHome).toContain('state.orphansLoaded')
    expect(renderHome).toContain('UNKNOWN')

    const renderTodo = adminPageHtml.slice(
      adminPageHtml.indexOf('function renderTodo'),
      adminPageHtml.indexOf('function todoItem'),
    )
    // The orphan reminder and the "nothing to do" copy are both gated on the
    // list having loaded; the unknown branch replaces them.
    expect(renderTodo).toContain('if (state.orphansLoaded)')
    expect(renderTodo).toContain('数据残留待处理：—')
    expect(
      renderTodo.indexOf("el('p', 'empty', '暂无待处理事项')"),
    ).toBeGreaterThan(renderTodo.indexOf('list.childNodes.length === 0'))
  })

  it('clears the previous session out of the DOM on logout and on 401', () => {
    // The reset helper must drop the data and re-render both tables: without
    // the renders the old rows (and their 删除账号 / 彻底清理 buttons) stay
    // clickable until the next load returns.
    const resetData = adminPageHtml.slice(
      adminPageHtml.indexOf('function resetData'),
      adminPageHtml.indexOf('function endSession'),
    )
    expect(resetData).toContain('state.users = []')
    expect(resetData).toContain('state.orphans = []')
    expect(resetData).toContain('state.usersLoaded = false')
    expect(resetData).toContain('state.orphansLoaded = false')
    expect(resetData).toContain('state.build = null')
    expect(resetData).toContain('state.modeReady = false')
    // The previous session's registration mode must not stay selected either.
    expect(resetData).toContain("state.mode = ''")
    // In-flight responses from the ended session are invalidated here.
    expect(resetData).toContain('sessionEpoch++')
    // Every renderer the panel has, not just the two tables: the dashboard,
    // the settings radios, the build footer and the about fields all fall back
    // to their unknown/empty state in the same tick.
    expect(resetData).toContain('renderUsers()')
    expect(resetData).toContain('renderOrphans()')
    expect(resetData).toContain('renderMode()')
    expect(resetData).toContain('renderBuildInfo()')
    expect(resetData).toContain('renderAbout()')

    // Logout goes through that helper instead of only clearing state, and the
    // login view is shown after the DOM has been reset.
    const logout = adminPageHtml.slice(
      adminPageHtml.indexOf("$('logout-btn').addEventListener"),
      adminPageHtml.indexOf("$('add-form').addEventListener"),
    )
    expect(logout).toContain('endSession(')
    expect(logout).not.toContain('showLogin(')
    expect(logout).not.toContain('state.users = []')

    const endSession = adminPageHtml.slice(
      adminPageHtml.indexOf('function endSession'),
      adminPageHtml.indexOf('function showLogin'),
    )
    expect(endSession).toContain('resetData()')
    expect(endSession.indexOf('resetData()')).toBeLessThan(
      endSession.indexOf('showLogin('),
    )

    // Expired sessions (401) take the same path, including the modal submit
    // branch that handles 401 itself instead of calling handleAuth.
    const handleAuth = adminPageHtml.slice(
      adminPageHtml.indexOf('function handleAuth'),
      adminPageHtml.indexOf('function resetData'),
    )
    expect(handleAuth).toContain('err.status !== 401')
    expect(handleAuth).toContain('endSession(')

    const runModalSubmit = adminPageHtml.slice(
      adminPageHtml.indexOf('async function runModalSubmit'),
      adminPageHtml.indexOf('function openRejectModal'),
    )
    expect(runModalSubmit).toContain('endSession(')
    expect(runModalSubmit).not.toContain('showLogin(')
  })

  it('routes every session exit through endSession()', () => {
    // 1. Logout button.
    const logout = section(
      "$('logout-btn').addEventListener",
      "$('add-form').addEventListener",
    )
    expect(logout).toContain('endSession(')
    expect(logout).not.toContain('showLogin(')
    expect(logout).not.toContain('state.users = []')

    // 2. Refresh button: any of the three loads may 401.
    const refresh = section(
      "$('refresh-btn').addEventListener",
      "$('logout-btn').addEventListener",
    )
    expect(refresh).toContain('if (!handleAuth(err))')
    expect(refresh).not.toContain('showLogin(')

    // 3. Add-user form.
    const addForm = section(
      "$('add-form').addEventListener",
      'var addPassword = $',
    )
    expect(addForm).toContain('if (handleAuth(err)) return')
    expect(addForm).not.toContain('showLogin(')

    // 4. Registration mode switch.
    const modeSwitch = section(
      "radios[i].addEventListener('change'",
      'for (var t = 0; t < TAB_ORDER.length; t++)',
    )
    expect(modeSwitch).toContain('if (handleAuth(err)) return')
    expect(modeSwitch).not.toContain('showLogin(')

    // 5. Login form: a wrong password is not a session exit (there is no
    // session yet), so it must NOT reset anything.
    const loginForm = section(
      "$('login-form').addEventListener",
      "$('refresh-btn').addEventListener",
    )
    expect(loginForm).toContain(
      "if (err.status === 401) errorNode.textContent = '密码错误'",
    )
    expect(loginForm).not.toContain('endSession(')

    // 6. First load: 401 resets, any other failure shows the login view with
    // the error (nothing to reset yet).
    const init = section('async function init', 'bindEvents()\n  init()')
    expect(init).toContain("if (err.status === 401) endSession('')")
    expect(init).toContain('else showLogin(messageFor(err))')

    // 7. Post-login load sequence: both stages route 401 through handleAuth.
    const enterPanel = section(
      'async function enterPanel',
      'function bindEvents',
    )
    expect(enterPanel.match(/if \(handleAuth\(err\)\) return/g)).toHaveLength(2)
    expect(enterPanel).not.toContain('showLogin(')

    // 8. Row actions (approve / disable / enable) and their refresh.
    const runAction = section(
      'async function runAction',
      'function summaryText',
    )
    expect(runAction).toContain('if (handleAuth(err)) return')
    expect(runAction).not.toContain('showLogin(')

    // 9. Modal submit: the single 401 branch that closes the dialog first.
    const runModalSubmit = section(
      'async function runModalSubmit',
      'function openRejectModal',
    )
    expect(runModalSubmit).toContain("endSession('登录已过期，请重新登录')")
    expect(runModalSubmit).not.toContain('showLogin(')

    // 10. Every modal submit rethrows 401 into that branch instead of turning
    // it into an inline field error.
    const modals: Array<[string, string]> = [
      ['openRejectModal', 'function openEditModal'],
      ['openEditModal', 'function openResetModal'],
      ['openResetModal', 'function openDeleteModal'],
      ['openDeleteModal', 'function openRestoreModal'],
      ['openRestoreModal', 'function openPurgeModal'],
      ['openPurgeModal', 'function openDevicesModalFor'],
      ['openDeleteDeviceModal', 'function bindTab'],
    ]
    for (const [name, end] of modals) {
      const body = section(`function ${name}`, end)
      expect(body, name).toContain('if (err.status === 401) throw err')
      expect(body, name).not.toContain('showLogin(')
    }

    // 11. Device dialog loader (F6): close the dialog, then the shared exit.
    const deviceList = section(
      'async function loadDeviceList',
      'function openDeleteDeviceModal',
    )
    expect(deviceList).toContain('closeModal()')
    expect(deviceList).toContain('if (handleAuth(err)) return')
    expect(deviceList).not.toContain('showLogin(')

    // 12. Build-info loader (S3): an authenticated request, so a 401 is a
    // session expiry, not a cosmetic failure.
    const buildInfo = section(
      'async function loadBuildInfo',
      'function renderBuildInfo',
    )
    expect(buildInfo).toContain('if (handleAuth(err)) return')
    expect(buildInfo).not.toContain('showLogin(')
    expect(buildInfo).not.toContain(
      'Session expiry is handled by the data loads',
    )

    // 13. The exit helpers themselves.
    const handleAuth = section('function handleAuth', 'function resetData')
    expect(handleAuth).toContain('if (err.status !== 401) return false')
    expect(handleAuth).toContain('endSession(')

    const endSession = section('function endSession', 'function showLogin')
    expect(endSession).toContain('resetData()')
  })

  it('keeps showLogin() behind the single session-exit path', () => {
    // The whole point of the audit: a new "session ended" path must call
    // endSession()/resetData(), never showLogin() directly. Exactly three call
    // sites are allowed — the definition, endSession() itself, and init()'s
    // non-401 first-load branch (where no session exists to reset). A fourth
    // one means a path bypassed the reset and would leak the old rows.
    const callSites = adminPageHtml
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('showLogin('))
    expect(callSites.sort()).toEqual(
      [
        'function showLogin(message) {',
        'showLogin(message)',
        'else showLogin(messageFor(err))',
      ].sort(),
    )
  })

  it('drops responses that arrive after the session was reset', () => {
    expect(adminPageHtml).toContain('var sessionEpoch = 0')
    const resetData = section('function resetData', 'function endSession')
    expect(resetData).toContain('sessionEpoch++')

    // Every loader must carry the guard, so a loader added later cannot skip
    // it without failing this list and the per-loader checks below.
    const loaderStarts = [
      ...adminPageHtml.matchAll(/async function (load\w+)/g),
    ]
    expect(loaderStarts.map((match) => match[1])).toEqual([
      'loadUsers',
      'loadOrphans',
      'loadMode',
      'loadBuildInfo',
      'loadDeviceList',
    ])
    for (const match of loaderStarts) {
      const from = match.index ?? 0
      const rest = adminPageHtml.slice(from + 1)
      const nextFunction = rest.search(/\n {2}(?:async )?function /)
      const body = adminPageHtml.slice(from, from + 1 + nextFunction)
      expect(body, match[1]).toContain('sessionEpoch')
      expect(body, match[1]).toMatch(/epoch !== sessionEpoch/)
    }

    // The guard sits before the write, in the failure path as well as the
    // success path: a late 200 must not land in state, a late 401 must not
    // reset a session that has already been replaced.
    const users = section(
      'async function loadUsers',
      'async function loadOrphans',
    )
    expect(users.match(/if \(epoch !== sessionEpoch\) return/g)).toHaveLength(2)
    expect(users.indexOf('if (epoch !== sessionEpoch) return')).toBeLessThan(
      users.indexOf('state.users = data.users'),
    )

    const orphans = section(
      'async function loadOrphans',
      'async function loadMode',
    )
    expect(orphans.match(/if \(epoch !== sessionEpoch\) return/g)).toHaveLength(
      2,
    )
    expect(orphans.indexOf('if (epoch !== sessionEpoch) return')).toBeLessThan(
      orphans.indexOf('state.orphans = data'),
    )

    const buildInfo = section(
      'async function loadBuildInfo',
      'function renderBuildInfo',
    )
    expect(
      buildInfo.match(/if \(epoch !== sessionEpoch\) return/g),
    ).toHaveLength(2)
    expect(
      buildInfo.indexOf('if (epoch !== sessionEpoch) return'),
    ).toBeLessThan(buildInfo.indexOf('state.build ='))

    const devices = section(
      'async function loadDeviceList',
      'function openDeleteDeviceModal',
    )
    expect(devices.match(/if \(epoch !== sessionEpoch\) return/g)).toHaveLength(
      2,
    )
    expect(devices.indexOf('if (epoch !== sessionEpoch) return')).toBeLessThan(
      devices.indexOf('container.appendChild(wrap)'),
    )

    // Composite flows pin the epoch they started in, so a logout between two
    // awaits cannot let the rest of the chain repopulate the panel.
    const refreshAll = section(
      'async function refreshAll',
      'function renderUsers',
    )
    expect(refreshAll).toContain('var epoch = sessionEpoch')
    expect(refreshAll).toContain('loadUsers(epoch)')
    expect(refreshAll).toContain('loadOrphans(epoch)')

    const enterPanel = section(
      'async function enterPanel',
      'function bindEvents',
    )
    expect(enterPanel).toContain('var epoch = sessionEpoch')
    expect(enterPanel).toContain('loadUsers(epoch)')
    expect(enterPanel).toContain(
      'loadOrphans(epoch), loadMode(epoch), loadBuildInfo(epoch)',
    )
    expect(
      enterPanel.indexOf('if (epoch !== sessionEpoch) return'),
    ).toBeLessThan(enterPanel.indexOf('Promise.all('))
  })

  it('drops both tables and the dashboard into an unavailable state on failure', () => {
    expect(adminPageHtml).toContain('usersLoaded: false')
    expect(adminPageHtml).toContain('orphansLoaded: false')
    for (const id of [
      'users-table-wrap',
      'users-unavailable',
      'orphans-table-wrap',
      'orphans-unavailable',
    ]) {
      expect(adminPageHtml).toContain(`id="${id}"`)
    }

    // A failed load re-renders the table (not only the dashboard), so stale
    // rows with live action buttons cannot survive a failed refresh.
    const loadUsers = adminPageHtml.slice(
      adminPageHtml.indexOf('async function loadUsers'),
      adminPageHtml.indexOf('async function loadOrphans'),
    )
    expect(loadUsers).toContain('state.usersLoaded = false')
    expect(loadUsers).toContain('state.usersLoaded = true')
    expect(loadUsers).toContain('renderUsers()')
    expect(loadUsers.indexOf('state.usersLoaded = false')).toBeLessThan(
      loadUsers.indexOf('state.usersLoaded = true'),
    )

    const loadOrphans = adminPageHtml.slice(
      adminPageHtml.indexOf('async function loadOrphans'),
      adminPageHtml.indexOf('async function loadMode'),
    )
    expect(loadOrphans).toContain('state.orphansLoaded = false')
    expect(loadOrphans).toContain('renderOrphans()')
    expect(loadOrphans.indexOf('state.orphansLoaded = false')).toBeLessThan(
      loadOrphans.indexOf('state.orphansLoaded = true'),
    )

    // Both renderers hide the table and show the unavailable note, and return
    // before building any row/action buttons.
    const renderOrphans = adminPageHtml.slice(
      adminPageHtml.indexOf('function renderOrphans'),
      adminPageHtml.indexOf('function renderMode'),
    )
    expect(renderOrphans).toContain("$('orphans-table-wrap').hidden = !loaded")
    expect(renderOrphans).toContain("$('orphans-unavailable').hidden = loaded")
    expect(renderOrphans.indexOf('if (!loaded)')).toBeLessThan(
      renderOrphans.indexOf('恢复账号'),
    )

    const renderUsers = adminPageHtml.slice(
      adminPageHtml.indexOf('function renderUsers'),
      adminPageHtml.indexOf('function addUserActions'),
    )
    expect(renderUsers).toContain("$('users-table-wrap').hidden = !loaded")
    expect(renderUsers).toContain("$('users-unavailable').hidden = loaded")
    expect(renderUsers.indexOf('if (!loaded)')).toBeLessThan(
      renderUsers.indexOf('addUserActions(group, user)'),
    )

    // Everything derived from the user list follows the same rule.
    const renderHome = adminPageHtml.slice(
      adminPageHtml.indexOf('function renderHome'),
      adminPageHtml.indexOf('function renderTodo'),
    )
    expect(renderHome).toContain('var usersLoaded = state.usersLoaded')
    expect(renderHome).toContain(
      '$(' + "'kpi-users').textContent = usersLoaded",
    )

    const renderRecent = adminPageHtml.slice(
      adminPageHtml.indexOf('function renderRecent'),
      adminPageHtml.indexOf('function dayKey'),
    )
    expect(renderRecent).toContain('用户列表暂时无法获取')

    const renderActivity = adminPageHtml.slice(
      adminPageHtml.indexOf('function renderActivity'),
      adminPageHtml.indexOf('function buildVersion'),
    )
    expect(renderActivity).toContain('bars.hidden = true')
  })
})
