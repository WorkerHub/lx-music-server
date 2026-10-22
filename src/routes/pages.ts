import { Hono } from 'hono'
import { getAdminPasswordHash } from '@/admin/auth'
import { faviconIco } from '@/assets/favicon'
import { adminPageHtml } from '@/pages/admin'
import { homePageHtml } from '@/pages/home'
import { registerPageHtml } from '@/pages/register'
import { getSettings } from '@/registry/client'

const app = new Hono<{ Bindings: LX.Env }>()

// All three pages are self-contained documents: no external scripts, styles,
// fonts or images. The CSP pins them to same-origin API calls only, and the
// pages must never be cached (the admin page carries session-gated UI state,
// and the landing page reflects the live registration mode).
const PAGE_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

// The landing page `/` renders the registration entry only when self-service
// registration is available. The mode is read from the same registry settings
// `GET /api/registration-info` reports, while rendering, so `closed` never
// links to /register and the page needs no script to be correct.
app.get('/', async (c) => {
  // The landing page must never 500 because the registry is unreachable: an
  // unreadable mode renders the page without a registration entry.
  let mode: LX.RegistrationMode | null = null
  try {
    mode = (await getSettings(c.env)).registrationMode
  } catch {
    mode = null
  }
  return c.html(homePageHtml(mode), 200, PAGE_HEADERS)
})

app.get('/admin', (c) => {
  // Match `/api/admin/*`: an unconfigured (or malformed) admin hash hides the
  // panel entirely instead of exposing a login form nobody can pass.
  if (!getAdminPasswordHash(c.env)) return c.notFound()
  return c.html(adminPageHtml, 200, PAGE_HEADERS)
})

app.get('/register', (c) => c.html(registerPageHtml, 200, PAGE_HEADERS))

// The favicon is a static asset (the two pages link it from their <head>), so
// it needs no session and stays available even when the admin panel is not
// configured: an ICO carries no information beyond the logo. The bytes are
// decoded once in `@/assets/favicon` and reused for every request.
app.get('/favicon.ico', (c) =>
  c.body(faviconIco, 200, {
    'content-type': 'image/x-icon',
    'cache-control': 'public, max-age=604800, immutable',
  }),
)

export default app
