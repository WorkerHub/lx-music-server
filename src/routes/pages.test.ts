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
    expect(resetData).toContain('renderUsers()')
    expect(resetData).toContain('renderOrphans()')

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
