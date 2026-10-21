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

describe('page markup safety', () => {
  for (const [name, html] of pages) {
    it(`${name} page has no HTML injection sinks`, () => {
      expect(html).not.toMatch(
        /innerHTML|outerHTML|insertAdjacentHTML|document\.write/,
      )
    })

    it(`${name} page loads no external resources`, () => {
      expect(html).not.toMatch(/(?:src|href)\s*=\s*["'](?:https?:)?\/\//)
      expect(html).not.toMatch(/@import|url\(\s*["']?https?:/)
    })
  }

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
    )
    expect(settingsPanel).toContain('id="mode-options"')
    expect(settingsPanel).toContain('id="orphans-body"')
    expect(settingsPanel.indexOf('注册设置')).toBeLessThan(
      settingsPanel.indexOf('数据残留'),
    )
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
    expect(adminPageHtml).toContain(
      'https://github.com/WorkerHub/lx-music-server',
    )
    // dev builds must fall back to 'dev' / '—' instead of undefined or null.
    expect(adminPageHtml).toContain("commit === 'dev'")
    expect(adminPageHtml).toContain("'—'")
  })
})
