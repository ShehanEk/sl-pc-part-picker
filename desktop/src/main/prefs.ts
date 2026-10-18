import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Plain preferences, kept apart from secrets.json on purpose: nothing here is
 * sensitive, so it is stored readable, and a corrupt secrets file can never
 * take the user's switches down with it.
 */

export type Prefs = {
  /** Scheduled syncs stopped. Manual runs still work. */
  paused: boolean
  /** Scheduled syncs wait while the laptop is on battery. */
  skipOnBattery: boolean
}

const DEFAULTS: Prefs = { paused: false, skipOnBattery: true }

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function readPrefs(): Prefs {
  try {
    if (!existsSync(file())) return { ...DEFAULTS }
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Prefs>
    return {
      paused: typeof raw.paused === 'boolean' ? raw.paused : DEFAULTS.paused,
      skipOnBattery:
        typeof raw.skipOnBattery === 'boolean' ? raw.skipOnBattery : DEFAULTS.skipOnBattery,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writePrefs(change: Partial<Prefs>): Prefs {
  const next = { ...readPrefs(), ...change }
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(file(), JSON.stringify(next, null, 2), 'utf8')
  return next
}
