/**
 * Polite HTTP client for the scrapers.
 *
 * Scrapers hit real shop sites, so every request is serialised per host with a
 * delay between them. Do not parallelise requests to a single retailer.
 */

/**
 * Read an override that may arrive as an empty string.
 *
 * CI is why this exists rather than a plain `??`. GitHub Actions substitutes an
 * unset `vars.X` as "" rather than leaving it undefined, and "" is not nullish,
 * so `??` happily accepts it. That turned `Number(process.env.SCRAPER_DELAY_MS
 * ?? 1500)` into `Number("")` — zero — which would have removed every gap
 * between requests on the first unattended run against four real shops.
 */
function envOverride(name: string): string | null {
  const raw = process.env[name]?.trim()
  return raw ? raw : null
}

const DEFAULT_UA =
  envOverride('SCRAPER_USER_AGENT') ??
  'SLPCPartsTrackerBot/0.1 (+https://github.com/ShehanEk/sl-pc-part-picker)'

/** Minimum gap between two requests to the same host. */
const MIN_DELAY_MS = (() => {
  const override = Number(envOverride('SCRAPER_DELAY_MS'))
  // Only a positive, finite override is honoured; anything else keeps the floor.
  return Number.isFinite(override) && override > 0 ? override : 1500
})()

const lastRequestAt = new Map<string, number>()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function throttle(host: string) {
  const last = lastRequestAt.get(host)
  if (last !== undefined) {
    const wait = last + MIN_DELAY_MS - Date.now()
    if (wait > 0) await sleep(wait)
  }
  lastRequestAt.set(host, Date.now())
}

export type FetchOptions = {
  /** Sent as X-Requested-With: XMLHttpRequest — some endpoints need it. */
  ajax?: boolean
  /** Cookie header to send (Tyno price endpoints need the session cookie). */
  cookie?: string
  timeoutMs?: number
  retries?: number
}

export type FetchResult = {
  status: number
  body: string
  /** Cookies from Set-Cookie, joined ready to send back as a Cookie header. */
  cookie: string | null
  url: string
}

/**
 * GET a URL with throttling, a timeout and bounded retries.
 * Throws only on network failure or exhausted retries — a non-2xx is returned
 * so the caller can decide (a 404 on one product should not kill the run).
 */
export async function politeGet(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  const { ajax = false, cookie, timeoutMs = 30_000, retries = 3 } = opts
  const host = new URL(url).host

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(host)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': DEFAULT_UA,
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(ajax ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      })

      // Retry only on transient server-side failures.
      if (res.status >= 500 && attempt < retries) {
        lastError = new Error(`HTTP ${res.status}`)
        await sleep(1000 * 2 ** attempt)
        continue
      }

      const setCookie = res.headers.getSetCookie?.() ?? []
      return {
        status: res.status,
        body: await res.text(),
        cookie: setCookie.length
          ? setCookie.map((c) => c.split(';')[0]).join('; ')
          : null,
        url: res.url || url,
      }
    } catch (err) {
      lastError = err
      if (attempt < retries) await sleep(1000 * 2 ** attempt)
    } finally {
      clearTimeout(timer)
    }
  }

  throw new Error(`GET ${url} failed after ${retries + 1} attempts: ${lastError}`)
}

/** Parse "Rs.94,000.00" / "282,000" / "320,000 LKR" into a number. */
export function parseLkr(text: string | null | undefined): number | null {
  if (!text) return null
  const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  if (!match) return null
  const value = Number(match[0])
  return Number.isFinite(value) && value > 0 ? value : null
}
