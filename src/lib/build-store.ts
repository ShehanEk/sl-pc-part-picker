import type { BuildSlot } from '@/compat/build'

/**
 * The in-progress build, kept across navigations.
 *
 * The configurator used to hold the build in React state, which is right for
 * how it behaves — instant, no round trips — but state dies the moment you
 * follow a link. Now that every part has its own page, leaving the builder to
 * look one up is a normal thing to do, and coming back to an empty build would
 * make that link a trap.
 *
 * Modelled as an external store read through `useSyncExternalStore` rather than
 * state seeded by an effect. Storage cannot be read during the first render —
 * the server renders an empty build and reading it early would make the
 * client's HTML disagree — and `useSyncExternalStore` is the sanctioned way
 * through that: React uses the server snapshot to hydrate, then swaps in the
 * real one.
 *
 * Only the identity of each choice is stored, never the price or specs. Those
 * are re-read from the catalogue on the way back in, so a build restored
 * tomorrow shows tomorrow's prices rather than a snapshot of yesterday's. A
 * slot whose shop was not chosen explicitly stores `null`, so it keeps tracking
 * whichever shop is currently cheapest.
 *
 * `sessionStorage` rather than `localStorage`: a half-finished build is
 * something you are doing now, not something to greet you next week.
 */

const BUILD_KEY = 'pcmaker.build.v1'
const PENDING_KEY = 'pcmaker.build.pending.v1'

export type StoredChoice = { partId: string; shop: string | null }
export type StoredBuild = Partial<Record<BuildSlot, StoredChoice>>
export type PendingAdd = { slot: BuildSlot; partId: string; shop: string | null }

/** Stable identity, so the server snapshot never looks like a change. */
const EMPTY: StoredBuild = Object.freeze({})

let snapshot: StoredBuild = EMPTY
let hydrated = false
const listeners = new Set<() => void>()

function session(): Storage | null {
  // Absent during server rendering, and can throw when storage is blocked.
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function read<T>(key: string): T | null {
  const store = session()
  if (!store) return null
  try {
    const raw = store.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    // Corrupt or unparseable: drop it rather than breaking the page on load.
    try {
      store.removeItem(key)
    } catch {}
    return null
  }
}

function write(key: string, value: unknown) {
  const store = session()
  if (!store) return
  try {
    store.setItem(key, JSON.stringify(value))
  } catch {}
}

/** Read and clear in one step, so a queued part can never be added twice. */
function takePending(): PendingAdd | null {
  const pending = read<PendingAdd>(PENDING_KEY)
  if (!pending) return null
  try {
    session()?.removeItem(PENDING_KEY)
  } catch {}
  return pending
}

function hydrate() {
  if (hydrated) return
  hydrated = true

  const stored = read<StoredBuild>(BUILD_KEY) ?? {}
  // Applied here as well as in `subscribeBuild` so that a full page load from a
  // part page has the part in place before the first paint, rather than
  // popping in a beat later.
  const pending = takePending()
  if (pending) {
    stored[pending.slot] = { partId: pending.partId, shop: pending.shop }
    write(BUILD_KEY, stored)
  }

  if (Object.keys(stored).length > 0) snapshot = stored
}

export function subscribeBuild(onChange: () => void): () => void {
  listeners.add(onChange)

  // Draining on subscribe, not only on first read. Following a link within the
  // app does not re-evaluate this module, so `hydrate` has long since run by
  // the time someone returns from a part page with something queued — gating
  // the queue on it meant "Add to my build" silently did nothing.
  const pending = takePending()
  if (pending) {
    setStoredBuild({
      ...snapshot,
      [pending.slot]: { partId: pending.partId, shop: pending.shop },
    })
  }

  return () => {
    listeners.delete(onChange)
  }
}

/**
 * Returns the same object identity until something actually changes, which is
 * what `useSyncExternalStore` requires to avoid re-rendering forever.
 */
export function getBuildSnapshot(): StoredBuild {
  hydrate()
  return snapshot
}

export function getServerBuildSnapshot(): StoredBuild {
  return EMPTY
}

export function setStoredBuild(next: StoredBuild) {
  hydrated = true
  snapshot = next
  write(BUILD_KEY, next)
  for (const listener of listeners) listener()
}

/** Queued from a part page, picked up the next time the builder reads storage. */
export function queueAdd(slot: BuildSlot, partId: string, shop: string | null = null) {
  write(PENDING_KEY, { slot, partId, shop } satisfies PendingAdd)
}
