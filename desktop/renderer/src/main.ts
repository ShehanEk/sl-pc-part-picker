/**
 * The window.
 *
 * Vanilla TypeScript and `textContent` throughout — every string shown here
 * (product titles, shop URLs, error messages) originated on a third-party site,
 * and none of it is ever interpolated as markup.
 */

type ShopSync = {
  shop: string
  lastScrapeAgeHours: number
  tone: 'ok' | 'warn' | 'bad'
  pending: number
  listings: number
  inStock: number
}

type Run = {
  kind: string
  shop: string | null
  status: string
  actor: string
  startedAt: string
  durationMs: number | null
  scraped: number | null
  error: string | null
}

type Status = {
  configured: boolean
  error?: string
  sync?: ShopSync[]
  summary?: { totals: { parts: number; listings: number; shops: number } }
  runs?: Run[]
}

const api = (window as unknown as { pcmaker: Record<string, (...a: never[]) => Promise<never>> })
  .pcmaker

const $ = (id: string) => document.getElementById(id)!
const MAX_LOG_LINES = 500
const logLines: string[] = []

function ago(hours: number): string {
  if (!Number.isFinite(hours)) return 'never'
  if (hours < 1) return `${Math.round(hours * 60)}m ago`
  if (hours < 48) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function cell(row: HTMLTableRowElement, text: string, className?: string) {
  const td = document.createElement('td')
  td.textContent = text
  if (className) td.className = className
  row.appendChild(td)
  return td
}

function renderShops(sync: ShopSync[]) {
  const body = $('shops').querySelector('tbody')!
  body.replaceChildren()

  for (const s of sync) {
    const row = document.createElement('tr')

    const first = document.createElement('td')
    const dot = document.createElement('span')
    dot.className = `dot ${s.tone}`
    first.appendChild(dot)
    first.appendChild(document.createTextNode(' ' + s.shop))
    row.appendChild(first)

    cell(row, ago(s.lastScrapeAgeHours), s.tone === 'ok' ? '' : s.tone)
    cell(row, String(s.pending), 'n')
    cell(row, String(s.listings), 'n')
    cell(row, String(s.inStock), 'n')

    const action = document.createElement('td')
    const button = document.createElement('button')
    button.textContent = 'Run'
    button.addEventListener('click', async () => {
      button.disabled = true
      const res = (await api.runNow(s.shop as never)) as unknown as {
        ok: boolean
        error?: string
      }
      if (!res.ok) appendLog(`${s.shop}: ${res.error ?? 'could not start'}`)
    })
    action.appendChild(button)
    row.appendChild(action)

    body.appendChild(row)
  }
}

function renderRuns(runs: Run[]) {
  const body = $('runs').querySelector('tbody')!
  body.replaceChildren()

  for (const r of runs) {
    const row = document.createElement('tr')
    cell(row, new Date(r.startedAt).toLocaleString())
    cell(row, r.shop ? `${r.kind} ${r.shop}` : r.kind)
    cell(row, r.actor)

    const outcome =
      r.status === 'ok'
        ? `ok${r.scraped != null ? ` · ${r.scraped} rows` : ''}${
            r.durationMs ? ` · ${Math.round(r.durationMs / 1000)}s` : ''
          }`
        : r.status === 'running'
          ? 'running…'
          : `${r.status}${r.error ? ` — ${r.error}` : ''}`
    cell(row, outcome, r.status === 'ok' ? 'ok' : r.status === 'running' ? '' : 'bad')

    body.appendChild(row)
  }
}

function appendLog(line: string) {
  logLines.push(line)
  if (logLines.length > MAX_LOG_LINES) logLines.shift()
  const pre = $('log')
  pre.textContent = logLines.join('\n')
  pre.scrollTop = pre.scrollHeight
}

function renderStatus(status: Status) {
  if (!status.configured) {
    $('summary').textContent =
      'No database configured yet — import your credentials below to begin.'
    return
  }
  if (status.error) {
    $('summary').textContent = `Could not read the database: ${status.error}`
    return
  }
  if (status.sync) renderShops(status.sync)
  if (status.runs) renderRuns(status.runs)
  if (status.summary) {
    const t = status.summary.totals
    const behind = (status.sync ?? []).filter((s) => s.tone !== 'ok').length
    $('summary').textContent =
      `${t.parts} parts · ${t.listings} listings · ${t.shops} shops — ` +
      (behind === 0 ? 'every shop is current.' : `${behind} behind schedule.`)
  }
}

async function refreshSettings() {
  const s = (await api.settings()) as unknown as {
    hasDatabaseUrl: boolean
    host: string | null
    database: string | null
    encryptionAvailable: boolean
    delayMs: number
    paused: boolean
  }
  $('settings').textContent = s.hasDatabaseUrl
    ? `Connected to ${s.database ?? '?'} at ${s.host ?? '?'} · ${s.delayMs}ms between requests` +
      (s.encryptionAvailable ? ' · credentials encrypted' : ' · NOT encrypted on this system')
    : 'No credentials stored.'
  ;($('pause') as HTMLButtonElement).textContent = s.paused ? 'Resume' : 'Pause'
}

$('check').addEventListener('click', () => void api.checkNow())
$('normalize').addEventListener('click', () => void api.normalizeNow())
$('cancel').addEventListener('click', () => void api.cancel())
$('pause').addEventListener('click', async () => {
  const label = ($('pause') as HTMLButtonElement).textContent
  await api.setPaused((label === 'Pause') as never)
  await refreshSettings()
})
$('import').addEventListener('click', async () => {
  const res = (await api.importEnv()) as unknown as {
    ok: boolean
    imported: string[]
    error?: string
  }
  appendLog(
    res.ok
      ? `Imported ${res.imported.join(', ')} — restart the app to use them.`
      : `Import failed: ${res.error}`,
  )
  await refreshSettings()
})

api.onLog?.(((line: string) => appendLog(line)) as never)
api.onStatus?.(((status: Status) => renderStatus(status)) as never)
api.onJob?.(((job: { state: string; label: string; ok?: boolean }) => {
  ;($('cancel') as HTMLButtonElement).disabled = job.state !== 'running'
  appendLog(
    job.state === 'running'
      ? `— started ${job.label} —`
      : `— ${job.label} ${job.ok ? 'finished' : 'FAILED'} —`,
  )
}) as never)

void api.status()
void refreshSettings()
