import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Credentials, encrypted at rest by the OS keychain.
 *
 * The renderer never sees any of this. `describe()` is the only thing that
 * crosses the IPC boundary, and it deliberately returns the connection's host
 * and database name but never the password — enough to confirm you are pointed
 * at the right database, useless to anyone who is not.
 */

const KEYS = ['DATABASE_URL', 'ANTHROPIC_API_KEY', 'SCRAPER_DELAY_MS'] as const
export type SecretKey = (typeof KEYS)[number]

export function isSecretKey(value: unknown): value is SecretKey {
  return typeof value === 'string' && (KEYS as readonly string[]).includes(value)
}

function file(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

type Stored = Partial<Record<SecretKey, string>>

function readAll(): Stored {
  try {
    if (!existsSync(file())) return {}
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Record<string, string>
    const out: Stored = {}
    for (const key of KEYS) {
      const encrypted = raw[key]
      if (!encrypted) continue
      out[key] = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    }
    return out
  } catch {
    // A corrupt or undecryptable store is treated as empty: the app asks for
    // credentials again rather than refusing to start.
    return {}
  }
}

function writeAll(values: Stored) {
  const raw: Record<string, string> = {}
  for (const key of KEYS) {
    const value = values[key]
    if (!value) continue
    raw[key] = safeStorage.encryptString(value).toString('base64')
  }
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(raw, null, 2), 'utf8')
}

export function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function get(key: SecretKey): string | undefined {
  return readAll()[key]
}

export function set(key: SecretKey, value: string): { ok: boolean; error?: string } {
  // Refuse rather than silently writing a database password in plaintext.
  if (!encryptionAvailable()) {
    return {
      ok: false,
      error:
        'This system has no OS-level encryption available, so credentials cannot be stored safely. ' +
        'Set DATABASE_URL in the environment instead.',
    }
  }
  const all = readAll()
  if (value) all[key] = value
  else delete all[key]
  writeAll(all)
  return { ok: true }
}

/** The env handed to the runner. Clamped, never widened. */
export function runnerEnv(): Record<string, string> {
  const all = readAll()
  const env: Record<string, string> = {}
  if (all.DATABASE_URL) env.DATABASE_URL = all.DATABASE_URL
  if (all.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = all.ANTHROPIC_API_KEY

  // The floor may be raised but never lowered. `envOverride` in src/lib/http.ts
  // rejects empty and negative values but would happily accept 500ms, and the
  // politeness of this app is not a setting a UI gets to weaken.
  const requested = Number(all.SCRAPER_DELAY_MS)
  if (Number.isFinite(requested) && requested > 1500) {
    env.SCRAPER_DELAY_MS = String(Math.round(requested))
  }

  // Identify as the project's bot, exactly as CI does. Not configurable.
  env.SCRAPER_USER_AGENT =
    'SLPCPartsTrackerBot/0.1 (+https://github.com/ShehanEk/sl-pc-part-picker)'
  return env
}

/** Safe to send to the renderer: shape and location, never the secret. */
export function describe() {
  const all = readAll()
  let host: string | null = null
  let database: string | null = null
  if (all.DATABASE_URL) {
    try {
      const url = new URL(all.DATABASE_URL)
      host = url.hostname
      database = url.pathname.replace(/^\//, '') || null
    } catch {
      host = '(unparseable)'
    }
  }
  return {
    encryptionAvailable: encryptionAvailable(),
    hasDatabaseUrl: Boolean(all.DATABASE_URL),
    hasAnthropicKey: Boolean(all.ANTHROPIC_API_KEY),
    delayMs: all.SCRAPER_DELAY_MS ? Number(all.SCRAPER_DELAY_MS) : 1500,
    host,
    database,
  }
}

/**
 * One-shot import from the repo's .env.local.
 *
 * Deliberately not an ambient load: the app should not quietly depend on a file
 * outside its own data directory, or it will behave differently the day it is
 * moved. This copies the values in once, on a button press.
 */
export function importFromEnvLocal(repoRoot: string): { ok: boolean; imported: string[]; error?: string } {
  const path = resolve(repoRoot, '.env.local')
  if (!existsSync(path)) return { ok: false, imported: [], error: `No .env.local at ${path}` }
  if (!encryptionAvailable()) {
    return { ok: false, imported: [], error: 'OS encryption unavailable; refusing to store credentials.' }
  }

  const all = readAll()
  const imported: string[] = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/)
    if (!m) continue
    const [, key, value] = m
    if (!isSecretKey(key) || !value) continue
    all[key] = value
    imported.push(key)
  }
  writeAll(all)
  return { ok: true, imported }
}
