// Cloudflare always sets cf-connecting-ip on edge traffic; it is the only
// header we trust for rate limiting. x-forwarded-for is removed because a
// client can spoof it to rotate rate-limit buckets (REVIEW L1). In local
// `wrangler dev` the header is absent and every request keys on "unknown",
// which is acceptable because the dev fallback limiter is in-memory and
// per-machine anyway.
export const getClientIp = (c: { req: { raw: Request } }): string =>
  c.req.raw.headers.get('cf-connecting-ip') ?? 'unknown'

// Lenient JSON body reader for public/admin endpoints: malformed or non-object
// payloads become `{}` so the handler can answer 400 instead of throwing.
export const readJsonBody = async (c: {
  req: { json: () => Promise<unknown> }
}): Promise<Record<string, unknown>> => {
  try {
    const body = await c.req.json()
    if (body && typeof body === 'object' && !Array.isArray(body))
      return body as Record<string, unknown>
    return {}
  } catch {
    return {}
  }
}
