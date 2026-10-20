import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { createUser, getSettings } from '@/registry/client'
import {
  isReservedName,
  validatePassword,
  validateUsername,
} from '@/registry/validate'
import { toMD5 } from '@/utils/crypto'
import { isRateLimited } from '@/utils/rateLimit'
import { getClientIp, readJsonBody } from '@/utils/request'

const app = new Hono<{ Bindings: LX.Env }>()

const asStatus = (status: number): ContentfulStatusCode =>
  status as ContentfulStatusCode

// The register page asks for this before rendering: `closed` shows a notice,
// `open`/`approval` show the form (approval adds a "wait for review" hint).
app.get('/api/registration-info', async (c) => {
  const settings = await getSettings(c.env)
  return c.json({ registrationMode: settings.registrationMode })
})

app.post('/api/register', async (c) => {
  const ip = getClientIp(c)
  // Separate namespace from `/ah` so registrations cannot lock out logins.
  if (await isRateLimited(c.env, `register:${ip}`))
    return c.json({ error: 'blocked' }, 403)

  const body = await readJsonBody(c)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  const nameError = validateUsername(name)
  if (nameError) return c.json({ error: nameError }, 400)
  const passwordError = validatePassword(password)
  if (passwordError) return c.json({ error: passwordError }, 400)
  // Reserved names read as "unavailable" rather than a format error so we do
  // not advertise which internal names exist.
  if (isReservedName(name))
    return c.json({ error: 'username unavailable' }, 409)

  const settings = await getSettings(c.env)
  if (settings.registrationMode === 'closed')
    return c.json({ error: 'registration is closed' }, 403)

  const status: LX.UserStatus =
    settings.registrationMode === 'open' ? 'active' : 'pending'
  const result = await createUser(c.env, {
    name,
    passwordHash: toMD5(password),
    status,
    source: 'self',
  })
  // Already taken, tombstoned (name reserved to protect orphaned data) or a
  // race with another registration.
  if (!result.ok)
    return c.json({ error: 'username unavailable' }, asStatus(result.status))

  return c.json({ status }, 201)
})

export default app
