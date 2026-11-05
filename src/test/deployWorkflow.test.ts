/// <reference types="node" />

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

// The deploy workflow's secret validation is the only gate that keeps a
// release from shipping with /admin disabled. It has already been flipped
// twice (#112 made the hash required, #125 made it optional again), so these
// tests run the exact python block from deploy.yml: if a third flip silently
// relaxes it, CI fails here instead of on a live deployment.

const WORKFLOW_PATH = join(process.cwd(), '.github/workflows/deploy.yml')
const WRANGLER_TOML_PATH = join(process.cwd(), 'wrangler.toml')

const ADMIN_HASH = 'a'.repeat(64)

// The validation block is python inside a bash heredoc; skipping (instead of
// failing) keeps the suite usable on machines without python3, while CI and
// the usual dev machines do run it.
const suite =
  spawnSync('python3', ['--version']).status === 0 ? describe : describe.skip

const extractValidationScript = (): string => {
  const lines = readFileSync(WORKFLOW_PATH, 'utf8').split('\n')
  const start = lines.findIndex((line) => line.includes("python3 - <<'EOF'"))
  if (start < 0) throw new Error('deploy.yml: python heredoc not found')
  const end = lines.findIndex(
    (line, index) => index > start && line.trim() === 'EOF',
  )
  if (end < 0) throw new Error('deploy.yml: python heredoc is not terminated')
  // The heredoc body is indented 10 spaces to sit inside the YAML block
  // scalar; undo exactly that so the dedented result is runnable python.
  return lines
    .slice(start + 1, end)
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n')
}

const tempDirs: string[] = []

interface RunResult {
  status: number | null
  stderr: string
  secrets: string | null
}

const runValidation = (env: Record<string, string>): RunResult => {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-secrets-'))
  tempDirs.push(dir)
  writeFileSync(join(dir, 'secrets.py'), extractValidationScript())
  writeFileSync(
    join(dir, 'wrangler.toml'),
    readFileSync(WRANGLER_TOML_PATH, 'utf8'),
  )
  // Never inherit LX_* / KV_* from the caller: the "missing secret" case must
  // see a genuinely empty environment.
  const baseEnv = { ...process.env }
  delete baseEnv.LX_ADMIN_PASSWORD_HASH
  delete baseEnv.LX_USERS
  delete baseEnv.KV_NAMESPACE_ID
  const result = spawnSync('python3', ['secrets.py'], {
    cwd: dir,
    env: { ...baseEnv, RUNNER_TEMP: dir, ...env },
    encoding: 'utf8',
  })
  let secrets: string | null = null
  try {
    secrets = readFileSync(join(dir, 'secrets.json'), 'utf8')
  } catch {
    secrets = null
  }
  return {
    status: result.status,
    stderr: String(result.stderr ?? ''),
    secrets,
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

suite('deploy.yml 的 LX_ADMIN_PASSWORD_HASH 必填校验', () => {
  it('缺失时让部署失败，且不写出 secrets.json', () => {
    const result = runValidation({ KV_NAMESPACE_ID: 'test-kv' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      '::error:: LX_ADMIN_PASSWORD_HASH is required',
    )
    expect(result.secrets).toBeNull()
  })

  it('格式非法（63 位）时让部署失败', () => {
    const result = runValidation({
      KV_NAMESPACE_ID: 'test-kv',
      LX_ADMIN_PASSWORD_HASH: ADMIN_HASH.slice(0, 63),
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('must be a 64-character hex SHA-256 digest')
  })

  it('合法值（大写输入）以小写写入 secrets.json', () => {
    const result = runValidation({
      KV_NAMESPACE_ID: 'test-kv',
      LX_ADMIN_PASSWORD_HASH: ADMIN_HASH.toUpperCase(),
    })
    expect(result.status).toBe(0)
    expect(JSON.parse(result.secrets ?? '{}')).toEqual({
      LX_ADMIN_PASSWORD_HASH: ADMIN_HASH,
    })
  })

  it('与合法的 LX_USERS 一起下发', () => {
    const users = '[{"name":"u","password":"p"}]'
    const result = runValidation({
      KV_NAMESPACE_ID: 'test-kv',
      LX_ADMIN_PASSWORD_HASH: ADMIN_HASH,
      LX_USERS: users,
    })
    expect(result.status).toBe(0)
    const secrets = JSON.parse(result.secrets ?? '{}')
    expect(secrets.LX_ADMIN_PASSWORD_HASH).toBe(ADMIN_HASH)
    expect(JSON.parse(secrets.LX_USERS)).toEqual(JSON.parse(users))
  })

  it('既有 LX_USERS 校验不受影响', () => {
    const result = runValidation({
      KV_NAMESPACE_ID: 'test-kv',
      LX_ADMIN_PASSWORD_HASH: ADMIN_HASH,
      LX_USERS: '{oops',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('LX_USERS is not valid JSON')
  })

  it('既有 KV_NAMESPACE_ID 校验不受影响', () => {
    const result = runValidation({ LX_ADMIN_PASSWORD_HASH: ADMIN_HASH })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('KV_NAMESPACE_ID is required')
  })
})
