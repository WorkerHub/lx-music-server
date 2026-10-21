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
})
