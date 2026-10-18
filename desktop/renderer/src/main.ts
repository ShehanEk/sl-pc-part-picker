/**
 * The window.
 *
 * Vanilla TypeScript, and every string goes in through `textContent` — product
 * titles, shop URLs and error messages all originated on third-party sites, and
 * none of it is ever interpolated as markup. The only markup built here is the
 * structure, from fixed tag names.
 */

// A module, not a global script: otherwise `status` below would merge with the
// DOM's window.status (a string) and every read of it would be mistyped.
export {}

type Tone = 'ok' | 'warn' | 'bad'

type ShopSync = {
  shop: string
  lastScrapeAgeHours: number
  tone: Tone
  pending: number
  listings: number
  inStock: number
}

type Run = {
  id: number
  kind: string
  shop: string | null
  status: string
  actor: string
  startedAt: string
  durationMs: number | null
  error: string | null
}

type Job = {
  kind: 'scrape' | 'normalize'
  shop: string | null
  trigger: 'schedule' | 'manual'
  startedAt: string
}

type Status = {
  configured: boolean
  error?: string
  sync?: ShopSync[]
  summary?: { totals: { parts: number; listings: number; shops: number } }
  runs?: Run[]
  schedule?: { shop: string; localLabel: string; ci: boolean }[]
  normalizeLabel?: string
  job?: Job | null
  paused?: boolean
  skipOnBattery?: boolean
  onBattery?: boolean
  nextCheckAt?: number | null
}

type Settings = {
  hasDatabaseUrl: boolean
  host: string | null
  database: string | null
  encryptionAvailable: boolean
  delayMs: number
  minDelayMs: number
  maxDelayMs: number
  paused: boolean
  skipOnBattery: boolean
  openAtLogin: boolean
}

type Api = {
  status(): Promise<void>
  settings(): Promise<Settings>
  setSecret(key: string, value: string): Promise<{ ok: boolean; error?: string }>
  importEnv(): Promise<{ ok: boolean; imported: string[]; error?: string }>
  runNow(shop: string): Promise<{ ok: boolean; error?: string }>
  normalizeNow(): Promise<{ ok: boolean; error?: string }>
  checkNow(): Promise<{ ok: boolean }>
  cancel(): Promise<{ ok: boolean }>
  setPaused(value: boolean): Promise<{ ok: boolean }>
  setDelay(ms: number): Promise<{ ok: boolean; delayMs?: number; error?: string }>
  setLoginItem(value: boolean): Promise<{ ok: boolean; openAtLogin: boolean }>
  setSkipOnBattery(value: boolean): Promise<{ ok: boolean }>
  onLog(cb: (line: string) => void): void
  onJob(cb: (job: { state: 'running' | 'done'; label: string; ok?: boolean } & Partial<Job>) => void): void
  onStatus(cb: (status: Status) => void): void
}

const api = (window as unknown as { pcmaker: Api }).pcmaker

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

let status: Status = { configured: true }
let settings: Settings | null = null
let job: Job | null = null
let view: 'dashboard' | 'settings' = 'dashboard'
let sideTab: 'tonight' | 'log' = 'tonight'
let lastLogLine = ''
const logLines: string[] = []
const MAX_LOG_LINES = 500
const DISMISSED_KEY = 'dismissedRuns'

// ---------------------------------------------------------------- helpers

type Child = Node | string | null | undefined | false

/** Builds structure from fixed tags; text only ever via textContent. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; title?: string; attrs?: Record<string, string> } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (props.class) node.className = props.class
  if (props.text !== undefined) node.textContent = props.text
  if (props.title) node.title = props.title
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v)
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    node.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

const SVG_NS = 'http://www.w3.org/2000/svg'
function icon(name: 'spin' | 'check' | 'refresh' | 'stop' | 'pause' | 'play' | 'plug', cls = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  if (cls) svg.setAttribute('class', cls)
  const paths: Record<typeof name, string[]> = {
    spin: ['M21 12a9 9 0 1 1-6.2-8.56'],
    check: ['m5 12 4.5 4.5L19 7'],
    refresh: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
    stop: [],
    pause: ['M9 5v14', 'M15 5v14'],
    play: ['M7 5l12 7-12 7z'],
    plug: ['M9 2v6', 'M15 2v6', 'M6 8h12v4a6 6 0 0 1-12 0z', 'M12 18v4'],
  }
  if (name === 'stop') {
    const rect = document.createElementNS(SVG_NS, 'rect')
    for (const [k, v] of Object.entries({ x: '6', y: '6', width: '12', height: '12', rx: '2', fill: 'currentColor', stroke: 'none' }))
      rect.setAttribute(k, v)
    svg.append(rect)
  }
  for (const d of paths[name]) {
    const p = document.createElementNS(SVG_NS, 'path')
    p.setAttribute('d', d)
    svg.append(p)
  }
  return svg
}

function ago(hours: number): string {
  if (!Number.isFinite(hours)) return 'never'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`
  if (hours < 48) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function duration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return ''
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function clock(iso: string | number, seconds = false): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  })
}

/** "03:16" today, "17 Oct" before that. */
function when(iso: string): string {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return today ? clock(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function actorLabel(actor: string): string {
  return actor === 'desktop' ? 'This app' : actor === 'ci' ? 'GitHub CI' : 'Terminal'
}

function ownerChip(isApp: boolean): HTMLSpanElement {
  return h('span', { class: `owner ${isApp ? 'app' : 'ci'}`, text: isApp ? 'This app' : 'GitHub CI' })
}

function jobLabel(j: Job): string {
  return j.kind === 'scrape' && j.shop ? j.shop : 'normalize'
}

/** "Neon, us-east-2" for a Neon host, the bare host otherwise. */
function friendlyHost(host: string | null): string {
  if (!host) return '—'
  const region = host.match(/\b((?:us|eu|ap|sa|ca)-[a-z]+-\d)\b/)
  return host.endsWith('neon.tech') && region ? `Neon, ${region[1]}` : host
}

function dismissed(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as number[])
  } catch {
    return new Set()
  }
}

// ---------------------------------------------------------------- render

function render() {
  for (const node of document.querySelectorAll<HTMLElement>('[data-view]')) {
    node.hidden = node.dataset.view !== view
  }
  $('dashboard').hidden = view !== 'dashboard'
  $('settings').hidden = view !== 'settings'

  renderPill()
  renderPause()
  renderFooter()
  if (view === 'dashboard') {
    renderHero()
    renderNote()
    renderShops()
    renderRuns()
    renderSide()
  } else {
    renderSettings()
  }
}

function renderPill() {
  const pill = $('pill')
  pill.className = 'pill'
  pill.replaceChildren()
  if (job) {
    pill.classList.add('busy')
    pill.append(icon('spin', 'spin'), job.kind === 'scrape' ? `Syncing ${job.shop}` : 'Normalizing')
  } else if (!status.configured) {
    pill.classList.add('warn')
    pill.append(h('span', { class: 'dot warn' }), 'Not connected')
  } else if (status.paused) {
    pill.append(h('span', { class: 'dot' }), 'Scheduled syncs paused')
  } else if (status.onBattery && status.skipOnBattery) {
    pill.classList.add('warn')
    pill.append(h('span', { class: 'dot warn' }), 'On battery · scheduled syncs wait')
  } else {
    pill.append(
      h('span', { class: 'dot ok' }),
      status.nextCheckAt ? `Idle · next check ${clock(status.nextCheckAt)}` : 'Idle',
    )
  }
}

function renderPause() {
  const button = $<HTMLButtonElement>('pause')
  button.replaceChildren(
    status.paused ? icon('play') : icon('pause'),
    status.paused ? 'Resume schedule' : 'Pause schedule',
  )
  button.disabled = !status.configured
}

function renderFooter() {
  const left = $('foot-left')
  const right = $('foot-right')
  left.replaceChildren()
  if (settings?.hasDatabaseUrl) {
    left.append(
      h('span', { class: 'dot ok' }),
      `Connected to ${settings.database ?? 'database'}` +
        (settings.encryptionAvailable ? ' · credentials encrypted' : ' · not encrypted'),
    )
  } else {
    left.append(h('span', { class: 'dot warn' }), 'No database connected')
  }
  const gap = ((settings?.delayMs ?? 1500) / 1000).toFixed(1).replace(/\.0$/, '')
  right.textContent =
    `${status.paused ? 'Scheduled syncs paused' : 'Scheduled syncs on'} · ` +
    `${gap}s between requests · checks every 5 min`
}

function renderHero() {
  const hero = $('hero')
  hero.className = 'hero'
  hero.replaceChildren()

  if (!status.configured || status.error) {
    hero.append(
      h('span', { class: 'hero-icon warn' }, icon('plug')),
      h(
        'div',
        { class: 'hero-body' },
        h('span', { class: 'hero-title', text: status.error ? 'Could not read the database' : 'No database connected' }),
        h('span', {
          class: 'hero-sub',
          text: status.error ?? 'Import the connection from .env.local in Settings to start syncing.',
        }),
      ),
      button('Open settings', 'btn btn-primary', () => openSettings()),
    )
    return
  }

  if (job) {
    hero.classList.add('running')
    const title = h('span', { class: 'hero-title' })
    if (job.kind === 'scrape') title.append('Scraping ', h('span', { class: 'mono', text: job.shop ?? '' }))
    else title.append('Normalizing new listings')
    hero.append(
      h('span', { class: 'hero-icon busy' }, icon('spin', 'spin')),
      h(
        'div',
        { class: 'hero-body' },
        h('div', {}, title),
        h(
          'span',
          { class: 'hero-meta' },
          `${job.trigger === 'schedule' ? 'Scheduled' : 'Manual'} · started ${clock(job.startedAt)} · `,
          h('span', { class: 'mono', attrs: { id: 'elapsed' }, text: duration(Date.now() - Date.parse(job.startedAt)) }),
        ),
        h('span', { class: 'hero-line', attrs: { id: 'hero-line' }, text: lastLogLine || 'Starting…' }),
        h('span', {
          class: 'hero-meta',
          text:
            job.kind === 'normalize'
              ? 'Matches the new rows to parts and updates the site’s prices.'
              : job.trigger === 'schedule'
                ? 'Normalize follows once the scheduled scrapes finish.'
                : 'Manual run. Normalize runs on its own schedule, or press Normalize now after.',
        }),
      ),
      button('Stop', 'btn btn-stop', () => void api.cancel(), icon('stop')),
      h('span', { class: 'stripe', attrs: { 'aria-hidden': 'true' } }),
    )
    return
  }

  const sync = status.sync ?? []
  const behind = sync.filter((s) => s.tone !== 'ok')
  const lastDone = (status.runs ?? []).find((r) => r.status !== 'running')
  const next = nextAppSlot()
  hero.append(
    h('span', { class: `hero-icon ${behind.length ? 'warn' : 'ok'}` }, icon(behind.length ? 'refresh' : 'check')),
    h(
      'div',
      { class: 'hero-body' },
      h('span', {
        class: 'hero-title',
        text: behind.length
          ? `${behind.length} of ${sync.length} shops are behind`
          : `All ${sync.length} shops are current`,
      }),
      h(
        'span',
        { class: 'hero-sub' },
        lastDone
          ? `Last finished ${when(new Date(Date.parse(lastDone.startedAt) + (lastDone.durationMs ?? 0)).toISOString())} (${
              lastDone.kind === 'normalize' ? 'normalize' : lastDone.shop
            }). `
          : '',
        next ? 'Next here: ' : '',
        next ? h('span', { class: 'mono', text: next.shop }) : '',
        next ? ` at ${next.localLabel}.` : '',
      ),
    ),
    button('Normalize now', 'btn', async () => {
      const res = await api.normalizeNow()
      if (!res.ok) appendLog(`normalize: ${res.error ?? 'could not start'}`)
    }),
    button('Check now', 'btn btn-primary', () => void api.checkNow(), icon('refresh')),
  )
}

/** The next nightly slot this app owns, by Sri Lanka clock time. */
function nextAppSlot(): { shop: string; localLabel: string } | null {
  const mine = (status.schedule ?? []).filter((s) => !s.ci).sort((a, b) => a.localLabel.localeCompare(b.localLabel))
  if (mine.length === 0) return null
  const now = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit' })
  return mine.find((s) => s.localLabel > now) ?? mine[0]
}

function renderNote() {
  const note = $('note')
  const runs = status.runs ?? []
  const skip = dismissed()
  const dayAgo = Date.now() - 24 * 3_600_000
  const failure = runs.find(
    (r) => (r.status === 'failed' || r.status === 'abandoned') && Date.parse(r.startedAt) > dayAgo && !skip.has(r.id),
  )
  if (!failure) {
    note.hidden = true
    return
  }

  const who = failure.actor === 'ci' ? 'GitHub' : failure.actor === 'desktop' ? 'This app' : 'A terminal run'
  const what = failure.kind === 'scrape' && failure.shop ? `scrape ${failure.shop}` : 'normalize'
  const recovered = runs.find(
    (r) =>
      r.status === 'ok' &&
      r.kind === failure.kind &&
      r.shop === failure.shop &&
      Date.parse(r.startedAt) > Date.parse(failure.startedAt) - 6 * 3_600_000 &&
      r.id !== failure.id,
  )
  const row = (status.sync ?? []).find((s) => s.shop === failure.shop)
  const reason = (failure.error ?? '').split(/ — |\n/)[0].replace(/^\[[^\]]+\]\s*/, '').slice(0, 140)

  let text: string
  if (recovered) {
    text = `No action needed. ${actorLabel(recovered.actor) === 'This app' ? 'This app' : 'GitHub'} completed it at ${when(recovered.startedAt)}, so its prices are current.`
  } else if (row && row.tone === 'ok') {
    text = `Its prices are still current (synced ${ago(row.lastScrapeAgeHours)}).`
  } else if (row) {
    text = `Its prices are ${ago(row.lastScrapeAgeHours).replace(' ago', '')} old. Run it now, or check the log.`
  } else {
    text = 'Check the log for details.'
  }

  note.hidden = false
  note.replaceChildren(
    h('span', { class: 'note-mark', text: '!', attrs: { 'aria-hidden': 'true' } }),
    h(
      'div',
      { class: 'note-body' },
      h('span', { class: 'note-title', text: `${who} couldn’t ${what} at ${when(failure.startedAt)}` }),
      h('span', { class: 'note-text', text: reason ? `${text} Reason: ${reason}.` : text }),
    ),
    button('Dismiss', 'btn', () => {
      const next = dismissed()
      next.add(failure.id)
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next].slice(-50)))
      } catch {
        // Storage unavailable: the note simply comes back next time.
      }
      renderNote()
    }),
  )
}

function renderShops() {
  const grid = $('shops')
  const sync = status.sync ?? []
  const schedule = status.schedule ?? sync.map((s) => ({ shop: s.shop, localLabel: '', ci: true }))
  const runs = status.runs ?? []
  const appShops = schedule.filter((s) => !s.ci).length
  $('shops-meta').textContent =
    `${schedule.length} shops · ${(status.summary?.totals.listings ?? 0).toLocaleString('en-LK')} listings · ` +
    `this app runs ${appShops}, GitHub runs ${schedule.length - appShops}`

  grid.replaceChildren(
    ...schedule.map((entry) => {
      const row = sync.find((s) => s.shop === entry.shop)
      const running = job?.kind === 'scrape' && job.shop === entry.shop
      // The last sync that worked: what the card's freshness actually rests on.
      // A later failure belongs to the note above, not here, or a shop whose
      // prices are current would read as broken.
      const shopRuns = runs.filter((r) => r.kind === 'scrape' && r.shop === entry.shop && r.status !== 'running')
      const last = shopRuns.find((r) => r.status === 'ok') ?? shopRuns[0]
      const tone = running ? 'busy' : (row?.tone ?? 'bad')

      const action = running
        ? h('span', { class: 'running-chip' }, icon('spin', 'spin'), 'Running')
        : button('Run now', 'btn btn-small', async (ev) => {
            const target = ev.currentTarget as HTMLButtonElement
            target.disabled = true
            const res = await api.runNow(entry.shop)
            if (!res.ok) {
              appendLog(`${entry.shop}: ${res.error ?? 'could not start'}`)
              target.disabled = false
            }
          })
      if (!running && action instanceof HTMLButtonElement) action.disabled = Boolean(job)

      return h(
        'article',
        { class: `shop${running ? ' running' : ''}` },
        h('div', { class: 'shop-head' }, h('span', { class: 'shop-name', text: entry.shop }), ownerChip(!entry.ci)),
        h(
          'div',
          { class: 'shop-status' },
          h('span', { class: `dot ${tone}` }),
          h('span', { text: running ? 'syncing now' : row ? `synced ${ago(row.lastScrapeAgeHours)}` : 'never synced' }),
          entry.localLabel ? h('span', { class: 'sep', text: '·' }) : null,
          entry.localLabel ? h('span', { text: `nightly ${entry.localLabel}` }) : null,
        ),
        h(
          'div',
          { class: 'shop-foot' },
          h(
            'span',
            { class: 'shop-counts' },
            h('b', { text: (row?.listings ?? 0).toLocaleString('en-LK') }),
            ' listed · ',
            h('b', { text: (row?.inStock ?? 0).toLocaleString('en-LK') }),
            ' in stock',
          ),
          action,
        ),
        h('span', {
          class: 'shop-last',
          text: running && job
            ? `Started ${clock(job.startedAt)}${last?.durationMs ? ` · previous run ${duration(last.durationMs)}` : ''}`
            : last
              ? `Last: ${actorLabel(last.actor) === 'This app' ? 'this app' : actorLabel(last.actor) === 'GitHub CI' ? 'GitHub' : 'terminal'} · ${
                  last.status === 'ok' ? duration(last.durationMs) : last.status
                } · ${when(last.startedAt)}`
              : 'No runs recorded yet',
        }),
      )
    }),
  )
}

function renderRuns() {
  const list = $('runs')
  const runs = (status.runs ?? []).slice(0, 12)
  if (runs.length === 0) {
    list.replaceChildren(h('li', { class: 'empty', text: 'No runs recorded yet.' }))
    return
  }
  list.replaceChildren(
    ...runs.map((r) => {
      const ok = r.status === 'ok'
      const live = r.status === 'running'
      return h(
        'li',
        { class: 'row', title: r.error ?? '' },
        h('span', { class: 'row-time', text: when(r.startedAt) }),
        h('span', {
          class: `row-mark ${live ? 'busy' : ok ? 'ok' : 'bad'}`,
          text: live ? '…' : ok ? '✓' : '✕',
          attrs: { 'aria-label': r.status },
        }),
        h('span', { class: 'row-what', text: r.kind === 'scrape' && r.shop ? `Scrape ${r.shop}` : 'Normalize' }),
        h('span', { class: `owner ${r.actor === 'desktop' ? 'app' : 'ci'}`, text: actorLabel(r.actor) }),
        h('span', {
          class: `row-took${!ok && !live ? ' bad' : ''}`,
          text: live ? 'running' : ok ? duration(r.durationMs) : r.status,
        }),
      )
    }),
  )
}

function renderSide() {
  const tonightTab = $('tab-tonight')
  const logTab = $('tab-log')
  tonightTab.setAttribute('aria-selected', String(sideTab === 'tonight'))
  logTab.setAttribute('aria-selected', String(sideTab === 'log'))
  $('tonight').hidden = sideTab !== 'tonight'
  $('log').hidden = sideTab !== 'log'
  $('side-meta').textContent =
    sideTab === 'tonight' ? 'Sri Lanka time' : job ? `${jobLabel(job)} · live` : 'this session'

  if (sideTab === 'tonight') {
    const slots = [
      ...(status.schedule ?? []).map((s) => ({ time: s.localLabel, what: s.shop, app: !s.ci })),
      ...(status.normalizeLabel ? [{ time: status.normalizeLabel, what: 'Normalize', app: false }] : []),
    ].sort((a, b) => a.time.localeCompare(b.time))
    $('tonight').replaceChildren(
      ...slots.map((s) =>
        h(
          'li',
          { class: 'row' },
          h('span', { class: 'row-time', text: s.time }),
          h('span', { class: 'row-what', text: s.what }),
          ownerChip(s.app),
        ),
      ),
    )
  }
}

function renderSettings() {
  if (!settings) return
  const s = settings

  const chip = $('db-status')
  chip.className = `status-chip ${s.hasDatabaseUrl ? 'ok' : 'bad'}`
  chip.replaceChildren(h('span', { class: `dot ${s.hasDatabaseUrl ? 'ok' : 'bad'}` }), s.hasDatabaseUrl ? 'Connected' : 'Not connected')
  $('db-name').textContent = s.database ?? '—'
  $('db-host').textContent = friendlyHost(s.host)
  $('db-stored').textContent = s.encryptionAvailable
    ? 'Encrypted with your Windows login'
    : 'Not stored: this system has no OS encryption'

  $('delay-value').textContent = `${(s.delayMs / 1000).toFixed(1)} s`
  $<HTMLButtonElement>('delay-minus').disabled = s.delayMs <= s.minDelayMs
  $<HTMLButtonElement>('delay-plus').disabled = s.delayMs >= s.maxDelayMs

  $('t-scheduled').setAttribute('aria-checked', String(!s.paused))
  $('t-login').setAttribute('aria-checked', String(s.openAtLogin))
  $('t-battery').setAttribute('aria-checked', String(s.skipOnBattery))

  $('owners').replaceChildren(
    ...(status.schedule ?? []).map((o) =>
      h(
        'tr',
        {},
        h('th', { text: o.shop, attrs: { scope: 'row' } }),
        h('td', { text: o.localLabel }),
        h('td', {}, ownerChip(!o.ci)),
      ),
    ),
  )
}

function button(
  label: string,
  cls: string,
  onClick: (ev: MouseEvent) => void,
  lead?: SVGSVGElement,
): HTMLButtonElement {
  const b = h('button', { class: cls, attrs: { type: 'button' } }, lead ?? null, label)
  b.addEventListener('click', onClick)
  return b
}

// ---------------------------------------------------------------- log

function appendLog(line: string) {
  lastLogLine = line.trim()
  logLines.push(`${clock(Date.now(), true)}  ${line}`)
  if (logLines.length > MAX_LOG_LINES) logLines.shift()
  const pre = $('log')
  pre.textContent = logLines.join('\n')
  pre.scrollTop = pre.scrollHeight
  const heroLine = document.getElementById('hero-line')
  if (heroLine) heroLine.textContent = lastLogLine
}

// ---------------------------------------------------------------- actions

async function refreshSettings() {
  settings = await api.settings()
  render()
}

function openSettings() {
  view = 'settings'
  void refreshSettings()
}

function message(id: string, text: string) {
  $(id).textContent = text
}

$('open-settings').addEventListener('click', openSettings)
$('back').addEventListener('click', () => {
  view = 'dashboard'
  render()
})
$('pause').addEventListener('click', async () => {
  await api.setPaused(!status.paused)
  await refreshSettings()
})
$('tab-tonight').addEventListener('click', () => {
  sideTab = 'tonight'
  renderSide()
})
$('tab-log').addEventListener('click', () => {
  sideTab = 'log'
  renderSide()
})

$('import').addEventListener('click', async () => {
  const res = await api.importEnv()
  message(
    'db-msg',
    res.ok ? `Imported ${res.imported.join(', ')}. Restart the app to use them.` : `Import failed: ${res.error}`,
  )
  await refreshSettings()
})
$('replace').addEventListener('click', () => {
  $('replace-form').hidden = false
  $<HTMLInputElement>('db-url').focus()
})
$('replace-cancel').addEventListener('click', () => {
  $<HTMLInputElement>('db-url').value = ''
  $('replace-form').hidden = true
})
$('replace-form').addEventListener('submit', async (ev) => {
  ev.preventDefault()
  const input = $<HTMLInputElement>('db-url')
  const res = await api.setSecret('DATABASE_URL', input.value.trim())
  input.value = ''
  $('replace-form').hidden = res.ok
  message('db-msg', res.ok ? 'Saved. Restart the app to use the new connection.' : `Not saved: ${res.error}`)
  await refreshSettings()
})

async function stepDelay(direction: 1 | -1) {
  if (!settings) return
  const res = await api.setDelay(settings.delayMs + direction * 500)
  message('delay-msg', res.ok ? 'Applies from the next sync.' : `Not saved: ${res.error}`)
  await refreshSettings()
}
$('delay-minus').addEventListener('click', () => void stepDelay(-1))
$('delay-plus').addEventListener('click', () => void stepDelay(1))

$('t-scheduled').addEventListener('click', async () => {
  if (!settings) return
  await api.setPaused(!settings.paused)
  await refreshSettings()
})
$('t-login').addEventListener('click', async () => {
  if (!settings) return
  await api.setLoginItem(!settings.openAtLogin)
  await refreshSettings()
})
$('t-battery').addEventListener('click', async () => {
  if (!settings) return
  await api.setSkipOnBattery(!settings.skipOnBattery)
  await refreshSettings()
})

// ---------------------------------------------------------------- wiring

api.onLog((line) => appendLog(line))

api.onStatus((next) => {
  status = next
  if (next.job !== undefined) {
    // A window opened mid-job learns about it here, not from a start event,
    // and should land on the live log just the same.
    if (!job && next.job) sideTab = 'log'
    job = next.job
  }
  if (settings) settings = { ...settings, paused: next.paused ?? settings.paused }
  render()
})

api.onJob((event) => {
  if (event.state === 'running' && event.kind && event.startedAt) {
    job = { kind: event.kind, shop: event.shop ?? null, trigger: event.trigger ?? 'manual', startedAt: event.startedAt }
    lastLogLine = ''
    sideTab = 'log'
    appendLog(`started ${event.label} (${job.trigger === 'schedule' ? 'scheduled' : 'manual'})`)
  } else if (event.state === 'done') {
    appendLog(`${event.label} ${event.ok ? 'finished' : 'FAILED'}`)
    job = null
  }
  render()
})

// The elapsed counter is the only thing that changes every second.
setInterval(() => {
  const elapsed = document.getElementById('elapsed')
  if (elapsed && job) elapsed.textContent = duration(Date.now() - Date.parse(job.startedAt))
}, 1000)

render()
void refreshSettings()
void api.status()
