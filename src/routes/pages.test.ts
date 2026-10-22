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
    expect(await res.text()).toContain('LX Music server 管理面板')
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
    // The mode read state is reset too — to "not read yet", never to "failed".
    expect(resetData).toContain("state.modeStatus = 'idle'")
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

  it('shows a neutral loading copy for the registration mode until the read fails', () => {
    // A pending read is not a failure: the hint has to distinguish "not read
    // yet / reading" from "the read failed", otherwise the ~1.5s between a
    // fresh login and /api/registration-info returning shows 读取失败.
    const renderMode = section('function renderMode', '// --- Home dashboard')
    expect(renderMode).toContain("var ready = state.modeStatus === 'ready'")
    expect(renderMode).toContain('radios[i].disabled = !ready')
    // The failure copy is gated on 'error' and is not the catch-all branch.
    expect(renderMode).toContain("state.modeStatus === 'error'")
    expect(renderMode).toContain('正在读取注册模式…')
    expect(renderMode).toContain('注册模式读取失败')
    expect(renderMode.indexOf("state.modeStatus === 'error'")).toBeLessThan(
      renderMode.indexOf('注册模式读取失败'),
    )
    // The neutral copy is the fallback of that ternary (idle / loading), and
    // each copy appears exactly once in the page — the failure text cannot be
    // reached without the 'error' check above.
    expect(renderMode.indexOf('注册模式读取失败')).toBeLessThan(
      renderMode.indexOf('正在读取注册模式…'),
    )
    expect(adminPageHtml.split('注册模式读取失败').length - 1).toBe(1)
    expect(adminPageHtml.split('正在读取注册模式…').length - 1).toBe(2)

    // resetData() (logout / 401) lands on the neutral state, so a re-login
    // never starts out claiming a failure.
    const resetData = section('function resetData', 'function endSession')
    expect(resetData).toContain("state.modeStatus = 'idle'")
    expect(resetData).not.toContain("'error'")

    // loadMode() announces the read before awaiting it, and only the catch
    // branch may mark the read as failed.
    const loadMode = section(
      'async function loadMode',
      'async function refreshAll',
    )
    expect(loadMode).toContain("state.modeStatus = 'loading'")
    expect(loadMode).toContain("state.modeStatus = 'ready'")
    expect(loadMode).toContain("state.modeStatus = 'error'")
    expect(loadMode.indexOf("state.modeStatus = 'loading'")).toBeLessThan(
      loadMode.indexOf("state.modeStatus = 'ready'"),
    )
    expect(loadMode.indexOf("state.modeStatus = 'ready'")).toBeLessThan(
      loadMode.indexOf("state.modeStatus = 'error'"),
    )
    expect(loadMode.indexOf('state.modeStatus =')).toBeLessThan(
      loadMode.indexOf('await api('),
    )

    // A state change is not a repaint: the loading hint has to be painted
    // before the request is awaited, otherwise the user keeps looking at the
    // previous copy (or the static first paint) for the whole read. Pinning
    // the assignment alone would stay green if that renderMode() call were
    // deleted, so the call itself is pinned between the two.
    const paintAt = loadMode.indexOf('renderMode()')
    expect(paintAt).toBeGreaterThan(
      loadMode.indexOf("state.modeStatus = 'loading'"),
    )
    expect(paintAt).toBeLessThan(loadMode.indexOf('await api('))
    // Both paints survive: one for the in-flight state, one for the settled
    // state (ready or error) after the await.
    expect(loadMode.match(/renderMode\(\)/g)).toHaveLength(2)

    // The static first paint is honest as well: the radios start disabled and
    // the hint starts neutral, before any script has run.
    expect(adminPageHtml).toContain('id="mode-hint">正在读取注册模式…<')
    const modeInputs = adminPageHtml.match(
      /<input type="radio" name="registrationMode"[^>]*>/g,
    )
    expect(modeInputs).toHaveLength(3)
    for (const input of modeInputs ?? []) {
      expect(input).toContain('disabled')
    }
  })

  it('settles the registration mode when the panel load fails before the read', () => {
    // enterPanel() reads the user list first and returns early when it fails,
    // so /api/registration-info is never sent at all. Left on the neutral copy
    // the settings hint waits forever for a request that will not happen, so
    // the panel-level failure has to settle the mode region on its own.
    const enterPanel = section(
      'async function enterPanel',
      'function bindEvents',
    )
    const usersCatch = enterPanel.slice(
      enterPanel.indexOf('await loadUsers(epoch)'),
      enterPanel.indexOf('if (epoch !== sessionEpoch) return'),
    )
    // Comments talk about loadMode()/the request, so only the executable lines
    // are checked: a comment must not satisfy (or fail) any assertion here.
    // Block comments are stripped too — and the behavioural test below settles
    // the string-literal case by running the real function.
    const usersCatchCode = usersCatch
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    // Deleting either line (or moving them out of this catch) leaves the hint
    // on "正在读取注册模式…" and turns this red.
    expect(usersCatchCode).toContain("state.modeStatus = 'error'")
    expect(usersCatchCode).toContain('renderMode()')
    // A state change is not a repaint: the hint has to be painted before the
    // early return, otherwise the user keeps the loading copy.
    expect(usersCatchCode.indexOf("state.modeStatus = 'error'")).toBeLessThan(
      usersCatchCode.indexOf('renderMode()'),
    )
    expect(usersCatchCode.indexOf('renderMode()')).toBeLessThan(
      usersCatchCode.indexOf('notice('),
    )
    // ...and only while the mode state is still untouched (a 刷新 click during
    // this same request starts loadMode() concurrently, and its result must
    // not be overwritten here) — pinned behaviourally below, so either guard
    // form passes. Settled locally: no second /api/registration-info, no
    // request at all.
    expect(usersCatchCode).not.toContain('loadMode(')
    expect(usersCatchCode).not.toContain('api(')

    // The state it lands on is the one that renders the failure copy: the
    // failure branch is checked before the neutral fallback, so 'error' can
    // never paint "正在读取".
    const renderMode = section('function renderMode', '// --- Home dashboard')
    expect(renderMode).toContain("state.modeStatus === 'error'")
    expect(renderMode.indexOf("state.modeStatus === 'error'")).toBeLessThan(
      renderMode.indexOf('注册模式读取失败，请刷新页面重试。'),
    )
    expect(
      renderMode.indexOf('注册模式读取失败，请刷新页面重试。'),
    ).toBeLessThan(renderMode.indexOf('正在读取注册模式…'))
    // Every branch of the hint is a fixed literal, so no state (this one
    // included) can paint `undefined` into the region.
    expect(renderMode).toContain("'注册页地址：/register；切换后立即生效。'")
    expect(renderMode).toContain("'注册模式读取失败，请刷新页面重试。'")
    expect(renderMode).toContain("'正在读取注册模式…'")

    // The radios stay disabled: this path never reaches 'ready'.
    expect(renderMode).toContain("var ready = state.modeStatus === 'ready'")
    expect(renderMode).toContain('radios[i].disabled = !ready')
  })

  // The page ships as one inline script, so a source-level assertion cannot see
  // whether the failure branch overwrites a mode that a concurrent 刷新 already
  // loaded. This runs the real enterPanel() body (extracted from the page) with
  // the panel state and the collaborators it calls injected, so the assertions
  // below are on what the function actually does to `state`.
  const runEnterPanel = async (options: {
    modeStatus: string
    mode?: string
    usersFail?: boolean
  }) => {
    const source = section('async function enterPanel', 'function bindEvents')
    const state: { mode: string; modeStatus: string } = {
      mode: options.mode ?? '',
      modeStatus: options.modeStatus,
    }
    const calls: string[] = []
    const sessionEpoch = 7
    const build = new Function(
      'state',
      'sessionEpoch',
      'showPanel',
      'loadUsers',
      'handleAuth',
      'renderMode',
      'notice',
      'messageFor',
      'loadOrphans',
      'loadMode',
      'loadBuildInfo',
      `${source}\nreturn enterPanel`,
    ) as (...args: any[]) => any
    const enterPanel = build(
      state,
      sessionEpoch,
      () => calls.push('showPanel'),
      async (epoch: number) => {
        calls.push(`loadUsers:${epoch}`)
        if (options.usersFail) {
          throw Object.assign(new Error('boom'), { status: 500 })
        }
      },
      () => {
        calls.push('handleAuth')
        return false
      },
      () => calls.push('renderMode'),
      (message: string) => calls.push(`notice:${message}`),
      (err: { status: number }) => `HTTP ${err.status}`,
      async () => calls.push('loadOrphans'),
      async () => {
        calls.push('loadMode')
        // The real loader announces the read before awaiting it.
        state.modeStatus = 'loading'
      },
      async () => calls.push('loadBuildInfo'),
    ) as () => Promise<void>
    await enterPanel()
    return { state, calls }
  }

  it('collapses a panel-level failure only while the mode state is untouched', async () => {
    // Nothing read the mode yet: the hint must settle on the failure copy
    // instead of waiting for a request that was never sent.
    const idle = await runEnterPanel({ modeStatus: 'idle', usersFail: true })
    expect(idle.state.modeStatus).toBe('error')
    expect(idle.calls).toContain('renderMode')
    expect(idle.calls).toContain('notice:HTTP 500')
    // Settled locally: the read itself was never dispatched.
    expect(idle.calls).not.toContain('loadMode')
    expect(idle.calls).not.toContain('loadOrphans')

    // A 刷新 click during that same request already loaded the real mode. This
    // later failure must not repaint it as a failure (contract 2 + 4).
    const ready = await runEnterPanel({
      modeStatus: 'ready',
      mode: 'open',
      usersFail: true,
    })
    expect(ready.state.modeStatus).toBe('ready')
    expect(ready.state.mode).toBe('open')
    expect(ready.calls).not.toContain('renderMode')

    // A read still in flight owns the hint: the failure branch leaves it alone
    // and loadMode() settles it afterwards.
    const loading = await runEnterPanel({
      modeStatus: 'loading',
      usersFail: true,
    })
    expect(loading.state.modeStatus).toBe('loading')
    expect(loading.calls).not.toContain('renderMode')

    // A read that already failed keeps its own verdict.
    const failed = await runEnterPanel({
      modeStatus: 'error',
      usersFail: true,
    })
    expect(failed.state.modeStatus).toBe('error')
    expect(failed.calls).not.toContain('renderMode')

    // The successful path is untouched: the mode read still starts.
    const ok = await runEnterPanel({ modeStatus: 'idle' })
    expect(ok.calls).toContain('loadMode')
    expect(ok.state.modeStatus).toBe('loading')
  })

  // renderMode() is the only place that decides what the three radios show, so
  // its checked/disabled pair is exercised against a fake DOM instead of being
  // pinned by string matching: an assertion on the source line would stay green
  // for any expression that still paints the stale mode as selected. The same
  // painter is reused across states, because the bug is a transition — a read
  // that succeeded and then failed leaves the previous value in state.mode.
  const makeModePainter = () => {
    const source = section('function renderMode', '// --- Home dashboard')
    const radios = ['closed', 'approval', 'open'].map((value) => ({
      value,
      checked: false,
      disabled: false,
    }))
    const hint = { textContent: '' }
    const document = { querySelectorAll: () => radios }
    const $ = (id: string) => {
      expect(id).toBe('mode-hint')
      return hint
    }
    const state: { mode: string; modeStatus: string } = {
      mode: '',
      modeStatus: 'idle',
    }
    const renderMode = new Function(
      'state',
      'document',
      '$',
      `${source}\nreturn renderMode`,
    )(state, document, $) as () => void
    return {
      hint,
      state,
      // Omitted `mode` keeps the current value: a failed read does not rewrite
      // state.mode, it only changes the status.
      paint: (modeStatus: string, mode?: string) => {
        state.modeStatus = modeStatus
        if (mode !== undefined) state.mode = mode
        renderMode()
        return radios.map((radio) => ({
          value: radio.value,
          checked: radio.checked,
          disabled: radio.disabled,
        }))
      },
    }
  }

  it('never paints a stale registration mode as selected', () => {
    const painter = makeModePainter()
    const values = ['closed', 'approval', 'open']

    // The reported bug: /api/registration-info failed after a successful read,
    // so state.mode still says 'open'. Nothing may look selected while the
    // mode is unknown — a checked radio is read as "this is the live mode".
    painter.paint('ready', 'open')
    const failed = painter.paint('error')
    expect(painter.state.mode).toBe('open')
    expect(failed.map((radio) => radio.checked)).toEqual([false, false, false])
    expect(failed.map((radio) => radio.disabled)).toEqual([true, true, true])
    expect(painter.hint.textContent).toBe('注册模式读取失败，请刷新页面重试。')

    // Every not-ready status behaves the same: nothing selected, all disabled.
    // 'idle' covers the logout / first-paint state, 'loading' the read in
    // flight (and the repaint it triggers after a failed one).
    for (const modeStatus of ['error', 'idle', 'loading']) {
      const painted = painter.paint(modeStatus, 'open')
      expect(
        painted.map((radio) => radio.checked),
        modeStatus,
      ).toEqual([false, false, false])
      expect(
        painted.map((radio) => radio.disabled),
        modeStatus,
      ).toEqual([true, true, true])
    }

    // A settled 'ready' read is the only state that may select: the real mode
    // is checked, every radio is editable, and switching stays enabled.
    for (const mode of values) {
      const ready = painter.paint('ready', mode)
      expect(
        ready.map((radio) => radio.checked),
        mode,
      ).toEqual(values.map((value) => value === mode))
      expect(
        ready.map((radio) => radio.disabled),
        mode,
      ).toEqual([false, false, false])
      expect(painter.hint.textContent).toBe(
        '注册页地址：/register；切换后立即生效。',
      )
    }

    // ...and a failure after that ready paint drops the selection again
    // instead of leaving the last known mode checked.
    const relapsed = painter.paint('error')
    expect(relapsed.map((radio) => radio.checked)).toEqual([
      false,
      false,
      false,
    ])
    expect(painter.state.mode).toBe('open')
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

describe('admin theme switch and brand assets', () => {
  // Same slice helper as `page markup safety`, but local to this block: the
  // existing describe is not touched, only appended to.
  const between = (start: string, end: string): string => {
    const from = adminPageHtml.indexOf(start)
    expect(from, `missing start marker: ${start}`).toBeGreaterThan(-1)
    const to = adminPageHtml.indexOf(end, from + start.length)
    expect(to, `missing marker after ${start}: ${end}`).toBeGreaterThan(from)
    return adminPageHtml.slice(from, to)
  }

  it('serves /favicon.ico as a session-less static ICO', async () => {
    // Unconfigured deployment: the panel route 404s there, but its own
    // <link rel="icon"> must still resolve — an ICO leaks nothing.
    const res = await app.request('/favicon.ico', {}, makeEnv())
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/x-icon')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=604800, immutable',
    )

    const bytes = new Uint8Array(await res.arrayBuffer())
    // ICONDIR: reserved 0, type 1 (icon), image count 2.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x00, 0x00, 0x01, 0x00])
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint16(4, true)).toBe(2)

    // Both directory entries are PNG payloads (the ICO may embed PNG
    // directly): 16x16 first, then 32x32, "0" meaning 256.
    const sizes: number[] = []
    for (let index = 0; index < 2; index++) {
      const entry = 6 + index * 16
      const width = view.getUint8(entry)
      sizes.push(width === 0 ? 256 : width)
      expect(view.getUint8(entry + 1)).toBe(width === 0 ? 0 : width)
      expect(view.getUint16(entry + 4, true)).toBe(1)
      expect(view.getUint16(entry + 6, true)).toBe(32)
      const length = view.getUint32(entry + 8, true)
      const offset = view.getUint32(entry + 12, true)
      expect(offset + length).toBeLessThanOrEqual(bytes.length)
      expect(Array.from(bytes.slice(offset, offset + 8))).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ])
    }
    expect(sizes).toEqual([16, 32])
    expect(bytes.length).toBeLessThanOrEqual(8 * 1024)

    // The bytes are decoded once at module scope and reused: the route hands
    // back the very same view, and a second request is byte-identical.
    const { faviconIco } = await import('@/assets/favicon')
    expect(Array.from(bytes)).toEqual(Array.from(faviconIco))
    const again = await app.request('/favicon.ico', {}, makeEnv())
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(bytes)
  })

  it('links the favicon from both pages instead of the empty data: icon', () => {
    for (const [name, html] of pages) {
      expect(html, name).toContain(
        '<link rel="icon" href="/favicon.ico" sizes="any">',
      )
      expect(html, name).not.toContain('href="data:,"')
    }
  })

  it('inlines the brand logo to the left of the heading', () => {
    const topbar = between('<header class="topbar">', '</header>')
    // The brand svg only: the theme icons in the same topbar are counted in
    // their own test, so this slice stops where the logo does.
    const brand = between('<div class="brand">', '</div>')
    expect(brand).toContain('viewBox="0 0 447.942 447.943"')
    expect(brand).toContain('width="28" height="28"')
    expect(brand).toContain('aria-hidden="true"')
    expect(brand).toContain('focusable="false"')
    // Both paths verbatim, with the source fills and no gradient.
    expect(brand).toContain('fill="#5ed698"')
    expect(brand).toContain('fill="#4daf7c"')
    expect(brand.match(/<path /g)).toHaveLength(2)
    expect(brand).not.toContain('gradient')
    // Inside .brand, before the <h1>.
    expect(topbar.indexOf('class="brand"')).toBeGreaterThan(-1)
    expect(topbar.indexOf('viewBox=')).toBeGreaterThan(
      topbar.indexOf('class="brand"'),
    )
    expect(topbar.indexOf('viewBox=')).toBeLessThan(topbar.indexOf('<h1>'))

    expect(adminPageHtml).toContain(
      '.brand { --brand-logo-size: 28px; display: flex; align-items: flex-start; gap: 10px; }',
    )
    expect(adminPageHtml).toContain('.brand svg { flex: none; }')
    // Logo 的垂直中线对齐 h1 大标题的中线，而不是「标题+副标题」整块：
    // .brand 顶端对齐 + h1 行盒与 logo 等高 → 两条中线重合，副标题排在 h1
    // 之下、不参与 logo 定位。
    expect(adminPageHtml).toContain(
      '.brand h1 { line-height: var(--brand-logo-size); }',
    )
    expect(adminPageHtml).not.toContain(
      '.brand { display: flex; align-items: center;',
    )
  })

  it('puts a three-state theme switch in the session actions, left of 刷新', () => {
    const actions = between(
      'id="session-actions"',
      '<button class="btn ghost" id="logout-btn"',
    )
    // 一个三段式图标按钮组，不再是文字下拉。
    expect(actions).toContain(
      '<div class="theme-switch" id="theme-switch" role="group" aria-label="主题">',
    )
    expect(adminPageHtml).not.toContain('theme-select')
    expect(actions).not.toContain('<select')
    expect(actions).not.toContain('<option')
    for (const [mode, label] of [
      ['light', '亮色'],
      ['dark', '暗色'],
      ['auto', '跟随系统'],
    ] as const) {
      // 每个状态一个按钮：模式、初始 aria-pressed=false、可读标签 + title。
      expect(actions).toContain(
        `data-theme-mode="${mode}" aria-pressed="false" aria-label="${label}" title="${label}"`,
      )
    }

    // 图标全部内联且用 currentColor 着色：暗色主题下自动反色，不引外链、
    // 不写死 fill，CSP 无需放宽。
    const switchMarkup = between('<div class="theme-switch"', '</div>')
    expect(switchMarkup.match(/<svg /g)).toHaveLength(3)
    expect(switchMarkup.match(/width="16" height="16"/g)).toHaveLength(3)
    for (const icon of switchMarkup.split('<svg ').slice(1)) {
      expect(icon).toContain('fill="none"')
      expect(icon).toContain('stroke="currentColor"')
      expect(icon).toContain('aria-hidden="true"')
      expect(icon).toContain('focusable="false"')
      expect(icon).not.toMatch(/fill="#/)
      expect(icon).not.toContain('http')
    }
    expect(switchMarkup).not.toContain('<img')
    expect(switchMarkup).not.toContain('href=')
    // 三个不同的字形：太阳（圆 + 光线）、月亮、显示器。
    expect(switchMarkup).toContain('<circle cx="12" cy="12" r="4" />')
    expect(switchMarkup).toContain('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z')
    expect(switchMarkup).toContain(
      '<rect x="2" y="3" width="20" height="14" rx="2" />',
    )

    // 位置不变：#session-actions 内、刷新按钮左边。
    expect(actions.indexOf('id="theme-switch"')).toBeLessThan(
      actions.indexOf('id="refresh-btn"'),
    )
    // The control rides with #session-actions: it is hidden while logged out.
    expect(actions).toContain('id="session-actions" hidden')

    // 高亮态用主题变量（不写死颜色），亮/暗两套调色板各自提供它的底色。
    expect(between(':root {', '[data-theme="dark"] {')).toContain(
      '--primary-soft:',
    )
    expect(between('[data-theme="dark"] {', '\n}')).toContain('--primary-soft:')
    const pressed = between('.theme-btn[aria-pressed="true"] {', '\n}')
    expect(pressed).toContain('color: var(--primary)')
    expect(pressed).toContain('background: var(--primary-soft)')
    expect(pressed).toContain('border-color: var(--primary)')
    expect(pressed).not.toContain('#')
    // 未选中态是灰字，两个主题下都从 --muted 取色。
    expect(between('.theme-btn {', '\n}')).toContain('color: var(--muted)')
    // 图标不被全局 svg 规则撑开。
    expect(adminPageHtml).toContain('.theme-btn svg { display: block; }')
  })

  it('drives the palette from [data-theme] instead of the media query', () => {
    // The system-preference override has to go: with it in place, an explicit
    // "亮色" choice would still be overridden on a dark system.
    expect(adminPageHtml).not.toContain('@media (prefers-color-scheme: dark)')
    const light = between(':root {', '[data-theme="dark"] {')
    expect(light).toContain('color-scheme: light;')
    expect(light).toContain('--bg: #f4f5f7;')
    const dark = between('[data-theme="dark"] {', '\n}')
    expect(dark).toContain('color-scheme: dark;')
    expect(dark).toContain('--bg: #111418;')
    expect(dark).toContain('--card: #1a1f26;')
    expect(dark).toContain('--text: #e6e9ee;')
    // The new control is painted from the same variables as every other input.
    expect(between('input, select {', 'input:focus')).toContain(
      'background: var(--card)',
    )
    expect(between('.theme-switch {', '\n}')).toContain(
      'background: var(--card)',
    )
    expect(between('.theme-switch {', '\n}')).not.toContain('#')
  })

  it('resolves the first paint before the stylesheet loads', () => {
    const head = between('<head>', '</head>')
    expect(head).toContain('<link rel="icon" href="/favicon.ico" sizes="any">')
    // Nothing recorded resolves to light, and the head cannot see the session
    // at all (the cookie is HttpOnly), so it must never guess dark.
    expect(head).toContain("var mode = 'light'")
    expect(head).toContain("localStorage.getItem('lx-admin-theme')")
    expect(head).toContain('matchMedia')
    expect(head).toContain("root.setAttribute('data-theme', theme)")
    expect(head).toContain("root.setAttribute('data-theme-mode', mode)")
    expect(head).toContain('root.style.colorScheme = theme')
    // A blocked storage (private mode) must not break the page.
    expect(head).toContain('try {')
    expect(head).toContain('} catch (err) {')
    // The inline script is ahead of the stylesheet, not after it.
    expect(head.indexOf('lx-admin-theme')).toBeLessThan(head.indexOf('<style>'))
    expect(head.indexOf('<style>')).toBeGreaterThan(-1)
  })

  it('keeps the theme a session property: light when logged out, restored on login', () => {
    const showLogin = between('function showLogin', 'function showPanel')
    expect(showLogin).toContain("applyTheme('light')")
    // …without discarding the stored choice, so the next login restores it.
    expect(showLogin).not.toContain('removeItem')
    expect(showLogin).not.toContain('storeThemeMode(')

    const showPanel = between('function showPanel', 'async function loadUsers')
    expect(showPanel).toContain("applyTheme(readThemeMode() || 'auto')")
    expect(showPanel).toContain("$('session-actions').hidden = false")

    // Logout and every 401 go through endSession(), which ends in showLogin().
    const endSession = between('function endSession', 'function showLogin')
    expect(endSession).toContain('resetData()')
    expect(endSession).toContain('showLogin(message)')
  })

  it('persists the choice and repaints both modes from it', () => {
    // The theme helpers are exercised against a fake document instead of being
    // pinned by string matching: resolution, the <html> attributes and the
    // storage guards are the behaviour, not the source line.
    const source = between(
      '// --- Theme (light / dark / auto)',
      'function formatTime',
    )
    const build = (
      options: { stored?: string; throws?: boolean; matches?: boolean } = {},
    ) => {
      const store = new Map<string, string>()
      if (options.stored !== undefined)
        store.set('lx-admin-theme', options.stored)
      const storage = {
        getItem: (key: string) => {
          if (options.throws) throw new Error('denied')
          return store.has(key) ? (store.get(key) as string) : null
        },
        setItem: (key: string, value: string) => {
          if (options.throws) throw new Error('denied')
          store.set(key, value)
        },
      }
      const attributes: Record<string, string> = {}
      const root = {
        style: {} as { colorScheme?: string },
        getAttribute: (name: string) => attributes[name] ?? null,
        setAttribute: (name: string, value: string) => {
          attributes[name] = value
        },
      }
      // The panel paints the pressed state through exactly this selector, so
      // the fake asserts the query instead of accepting any selector.
      const buttons = ['light', 'dark', 'auto'].map((mode) => {
        const button = {
          mode,
          pressed: '',
          getAttribute(name: string) {
            if (name === 'data-theme-mode') return mode
            if (name === 'aria-pressed') return button.pressed || null
            return null
          },
          setAttribute(name: string, value: string) {
            if (name === 'aria-pressed') button.pressed = value
          },
        }
        return button
      })
      const document = {
        documentElement: root,
        querySelectorAll: (selector: string) => {
          expect(selector).toBe('#theme-switch [data-theme-mode]')
          return buttons
        },
      }
      const darkMedia = { matches: options.matches === true }
      const api = new Function(
        'document',
        'localStorage',
        '$',
        'darkMediaValue',
        'THEME_KEY',
        `${source}
  darkMedia = darkMediaValue
  return {
    readThemeMode: readThemeMode,
    storeThemeMode: storeThemeMode,
    systemTheme: systemTheme,
    themeMode: themeMode,
    applyTheme: applyTheme
  }`,
      )(document, storage, () => null, darkMedia, 'lx-admin-theme') as {
        readThemeMode: () => string
        storeThemeMode: (mode: string) => void
        systemTheme: () => string
        themeMode: () => string
        applyTheme: (mode: string) => void
      }
      return { ...api, store, root, buttons }
    }

    // The highlight is read back from aria-pressed, exactly what assistive
    // tech and the stylesheet see — never a private "active" flag.
    const pressed = (list: { mode: string; pressed: string }[]) =>
      list.filter((item) => item.pressed === 'true').map((item) => item.mode)

    // Nothing recorded yet: the panel starts on 'auto' (contract 3), which the
    // head script could only have resolved to light.
    const fresh = build()
    expect(fresh.readThemeMode()).toBe('')
    expect(fresh.systemTheme()).toBe('light')
    fresh.applyTheme(fresh.readThemeMode() || 'auto')
    expect(fresh.root.getAttribute('data-theme')).toBe('light')
    expect(fresh.root.getAttribute('data-theme-mode')).toBe('auto')
    expect(pressed(fresh.buttons)).toEqual(['auto'])

    // Explicit light stays light even on a dark system, and dark goes dark.
    for (const [mode, expected] of [
      ['light', 'light'],
      ['dark', 'dark'],
    ] as const) {
      const panel = build({ matches: true })
      panel.applyTheme(mode)
      expect(panel.root.getAttribute('data-theme'), mode).toBe(expected)
      expect(panel.root.getAttribute('data-theme-mode'), mode).toBe(mode)
      expect(panel.root.style.colorScheme, mode).toBe(expected)
      expect(pressed(panel.buttons), mode).toEqual([mode])
    }

    // 'auto' resolves both ways and only records itself as the mode.
    const autoDark = build({ matches: true })
    autoDark.applyTheme('auto')
    expect(autoDark.root.getAttribute('data-theme')).toBe('dark')
    expect(autoDark.root.getAttribute('data-theme-mode')).toBe('auto')
    expect(pressed(autoDark.buttons)).toEqual(['auto'])

    // The choice persists under the contract key, and is read back on reload.
    const persisted = build()
    persisted.applyTheme('dark')
    persisted.storeThemeMode('dark')
    expect(persisted.store.get('lx-admin-theme')).toBe('dark')
    expect(build({ stored: 'dark' }).readThemeMode()).toBe('dark')
    // An unknown stored value is ignored instead of being painted.
    expect(build({ stored: 'sepia' }).readThemeMode()).toBe('')

    // Blocked storage (private mode) must neither throw nor paint dark.
    const blocked = build({ stored: 'dark', throws: true })
    expect(blocked.readThemeMode()).toBe('')
    expect(() => blocked.storeThemeMode('dark')).not.toThrow()
    blocked.applyTheme(blocked.readThemeMode() || 'light')
    expect(blocked.root.getAttribute('data-theme')).toBe('light')
    expect(pressed(blocked.buttons)).toEqual(['light'])
  })

  it('follows the OS appearance live while, and only while, the choice is auto', () => {
    const watcher = between(
      "// 'auto' follows the OS appearance live",
      "window.addEventListener('hashchange'",
    )
    expect(watcher).toContain(
      "window.matchMedia('(prefers-color-scheme: dark)')",
    )
    expect(watcher).toContain("darkMedia.addEventListener('change'")
    // The listener is a no-op unless the user's choice is still 'auto': a
    // system flip must never override an explicit light/dark pick.
    expect(watcher).toContain("if (themeMode() !== 'auto') return")
    expect(watcher).toContain("applyTheme('auto')")

    // The three buttons write the choice and repaint in the same tick, whether
    // the hit landed on the button or on the icon inside it.
    const click = between(
      "var themeSwitch = $('theme-switch')",
      "// 'auto' follows the OS appearance live",
    )
    expect(click).toContain("node.getAttribute('data-theme-mode')")
    expect(click).toContain('node = node.parentNode')
    expect(click).toContain('storeThemeMode(mode)')
    expect(click).toContain('applyTheme(mode)')
    // The mode is validated before it is stored or painted.
    expect(click).toContain(
      "if (mode !== 'light' && mode !== 'dark' && mode !== 'auto') mode = 'light'",
    )
    // No dead <select> wiring left behind.
    expect(adminPageHtml).not.toContain("$('theme-select')")
  })
})

describe('admin panel layout and about page polish (WK-22)', () => {
  it('uses the "LX Music server 管理面板" wording for the page title and the about hero', () => {
    expect(adminPageHtml).toContain('<h1>LX Music server 管理面板</h1>')
    expect(adminPageHtml).not.toContain('<h1>LX Music 管理面板</h1>')
    expect(adminPageHtml).toContain(
      '<h2>LX Music server 管理面板</h2>\n        <p class="muted">LX Music 同步服务的管理后台</p>',
    )
    // 大标题、关于页 hero 与关于页「产品名称」行三处统一口径。
    expect(adminPageHtml.split('LX Music server 管理面板')).toHaveLength(4)
  })

  it('uses the new subtitle under the admin page heading', () => {
    expect(adminPageHtml).toContain(
      '<p class="muted">一个兼容官方同步协议的重构版</p>',
    )
    expect(adminPageHtml).not.toContain('管理同步账号、注册模式与保留数据')
    // 浏览器标题保持原样。
    expect(adminPageHtml).toContain('<title>管理面板 · LX Music Server</title>')
  })

  it('gives the user table its own layout so the action column hugs the right edge', () => {
    expect(adminPageHtml).toContain('<table class="users-table">')
    expect(adminPageHtml).toContain(
      '.users-table { table-layout: auto; width: 100%; }',
    )
    expect(adminPageHtml).toContain(
      '.users-table th, .users-table td { white-space: nowrap; }',
    )
    expect(adminPageHtml).toContain(
      '.users-table th:first-child, .users-table td:first-child { width: 100%; }',
    )
    expect(adminPageHtml).toContain(
      '.users-table th.actions-col, .users-table td.actions-col { text-align: right; }',
    )
    expect(adminPageHtml).toContain(
      '.users-table .row-actions { justify-content: flex-end; flex-wrap: nowrap; }',
    )
    // 数字列与表头同步右对齐。
    expect(adminPageHtml).toContain(
      '.users-table th:nth-child(5), .users-table td:nth-child(5),\n.users-table th:nth-child(6), .users-table td:nth-child(6) { text-align: right; }',
    )
    // 内边距不变，横向滚动容器保留。
    expect(adminPageHtml).toContain(
      'th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }',
    )
    expect(adminPageHtml).toContain('.table-wrap { overflow-x: auto; }')
    expect(adminPageHtml).toContain(
      '<div class="table-wrap" id="users-table-wrap">',
    )
    // 全局 .actions-col / .row-actions 保持原样，残留数据表布局不变。
    expect(adminPageHtml).toContain('.actions-col { white-space: nowrap; }')
    expect(adminPageHtml).toContain(
      '.row-actions { display: flex; gap: 6px; flex-wrap: nowrap; }',
    )
  })

  it('keeps the action buttons and their bindings untouched', () => {
    for (const label of [
      '批准',
      '拒绝',
      '禁用',
      '启用',
      '编辑配置',
      '重置密码',
      '设备',
      '删除账号',
    ]) {
      expect(adminPageHtml).toContain(`'${label}'`)
    }
    expect(adminPageHtml).toContain("var actionCell = el('td', 'actions-col')")
    expect(adminPageHtml).toContain("var group = el('div', 'row-actions')")
  })

  it('drops the debug leftovers from the about page', () => {
    expect(adminPageHtml).not.toContain('about-commit-short')
    expect(adminPageHtml).not.toContain('about-hash')
    expect(adminPageHtml).not.toContain('由部署流程注入')
    // 构建信息卡五行与它们的 JS 赋值仍然完整。
    for (const id of ['about-version', 'about-commit', 'about-built']) {
      expect(adminPageHtml).toContain(`id="${id}"`)
      expect(adminPageHtml).toContain(`$('${id}').textContent`)
    }
    // 源码仓库行是静态链接，不经过 JS 赋值。
    expect(adminPageHtml).toContain('id="about-repo"')
    expect(adminPageHtml).toContain('<dt>产品名称</dt>')
    expect(adminPageHtml).toContain('<dt>版本号</dt>')
    expect(adminPageHtml).toContain('<dt>构建哈希</dt>')
    expect(adminPageHtml).toContain('<dt>构建时间</dt>')
    expect(adminPageHtml).toContain('<dt>源码仓库</dt>')
  })

  it('credits the upstream project with safe external links', () => {
    const aboutTab = adminPageHtml.slice(
      adminPageHtml.indexOf('<div id="tab-panel-about"'),
      adminPageHtml.indexOf('<div class="modal" id="modal"'),
    )
    expect(aboutTab).toContain('致谢')
    expect(aboutTab).toContain(
      '本项目是 <a href="https://github.com/lyswhut/lx-music-sync-server" target="_blank" rel="noopener noreferrer">原始项目</a> 的重构版本',
    )
    for (const repo of [
      'lx-music-sync-server',
      'lx-music-desktop',
      'lx-music-mobile',
    ]) {
      const href = `href="https://github.com/lyswhut/${repo}" target="_blank" rel="noopener noreferrer"`
      expect(aboutTab).toContain(href)
    }
    // 致谢卡排在构建信息卡之后，并复用 about-list 样式。
    expect(aboutTab.indexOf('构建信息')).toBeLessThan(aboutTab.indexOf('致谢'))
    const creditSection = aboutTab.slice(aboutTab.indexOf('致谢'))
    expect(creditSection).toContain('<dl class="about-list">')
    expect(creditSection).toContain('<div class="about-row">')
  })
})
