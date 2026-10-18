# PCPrice.lk desktop

A tray app that monitors sync health and **runs the scrapers from this machine**.

## Why it exists

Two things the web admin dashboard structurally cannot do:

1. **gamestreet.lk answers GitHub's runners with 403 and a residential connection
   normally.** Spoofing a browser user-agent was rejected as evading an access
   control ([decisions.md](../docs/decisions.md)), so the only honest fix is to
   scrape from somewhere that is not a data centre.
2. **Nothing recorded whether a run failed.** `RunResult` was printed and thrown
   away, so a failed scrape and a scrape that found nothing new looked identical.
   This app opens a `pipeline_runs` row before the work starts, so both the
   outcome and the failure survive.

## Running it

```bash
cd desktop
npm install
npm start
```

On first launch, with nothing stored yet, it copies `DATABASE_URL` and
`ANTHROPIC_API_KEY` out of the repo's `.env.local` into OS-encrypted storage —
once. After that the file is never read again, so the app keeps working if the
repo moves and does not quietly change behaviour when that file does. The
Connection panel has an **Import from .env.local** button to repeat it
deliberately, and the startup log says which database it ended up pointed at.

Credentials live in `%APPDATA%/PC Maker Sync/secrets.json` (the folder keeps
the app's name from before it became PCPrice Sync; see `src/main/index.ts`), encrypted with the
OS keychain via Electron's `safeStorage` — the file contains no readable
connection string. If the platform reports no encryption available, the app
refuses to store them rather than writing a database password in plaintext.
The renderer never receives them: it is told the host and database name so you
can confirm you are pointed at the right place, and nothing more.

The switches in Settings (scheduled syncs on or off, skip on battery) live in
`settings.json` beside it, readable, because nothing in them is secret.

## Start with Windows

The Settings switch registers a startup entry named **PCPrice Sync** (it shows
in Task Manager's Startup apps). It runs the same command as the desktop
shortcut, so a login start also rebuilds first, plus `--hidden` so the app comes
up in the tray rather than opening its window.

Two Electron details it depends on, both found by testing it:

- The folder path is written with forward slashes. Electron drops backslashes
  from the command line it writes to the registry, which produced a path
  Windows could not find.
- The switch reads `executableWillLaunchAtLogin`, not `openAtLogin`. The latter
  only looks for an entry under Electron's default name, so with ours it always
  read false.

## How it decides what to sync

Not a cron. Every five minutes it asks, per shop: *has a row landed since this
shop's own last scheduled slot?* If yes, the slot was served and the app leaves
it alone. If not:

- **Desktop-only shops** (`ci: false` in `SHOP_SCHEDULE` — gamestreet,
  chamacomputers, pcbuilders, which all block GitHub's runners) are the app's
  at their slot.
- **CI shops** go by CI's own `pipeline_runs` row. CI failed tonight → the app
  takes over at once. CI running → leave it. CI not started → wait up to four
  hours past the slot, because GitHub starts scheduled runs 2–3 hours late.

Either way, a shop is never re-scraped within 12 hours of its last data.

That has three properties a wall-clock schedule does not:

- **It never doubles up on CI.** A fixed staleness threshold does: a healthy
  shop's age sweeps from 0h to 24h across the day, so any threshold under 24 is
  crossed shortly before the next CI run. So did the previous two-hour wait,
  which was shorter than GitHub's delay: the app scraped every CI shop first,
  and CI then skipped it on the lease.
- **Catch-up is free.** There is no missed firing to reconstruct; staleness is
  simply still there when the machine wakes up.
- **A shop that starts blocking CI is covered the same night**, because the
  failed CI run is what triggers the app.

Scheduled runs are skipped on battery unless that switch is off in Settings.
Manual runs always go ahead.

## Politeness

The pipeline is shared with CI, not reimplemented, so the 1.5s per-host floor
and the bot user-agent come along unchanged. On top of that:

- **One job at a time, globally.** The throttle in `src/lib/http.ts` is
  per-host, so it would permit six shops in parallel — which from a single home
  connection is exactly the aggregate rudeness the staggered CI schedule avoids.
- **The delay may be raised, never lowered.** The UI can make the app slower
  than 1500ms and cannot make it faster.
- **Stopping a job costs a cooldown.** `runScraper` has no AbortSignal, so
  cancelling kills the runner — which discards the throttle map with it. Five
  seconds are paid back before anything else starts. This is the one place the
  app is measurably less polite than `npm run scrape`.
- **A `pipeline_runs` lease** stops two actors scraping one shop at once.
  GitHub's `concurrency` groups only coordinate runs inside GitHub; running
  `npm run scrape -- gamestreet.lk` while the app is scraping it now exits
  non-zero and says so.

## Architecture

```
main process          tray, window, scheduler, IPC, secrets
  └─ utilityProcess   the runner: one long-lived process, one job at a time
       └─ dist/runner.cjs   the pipeline, bundled from ../src
```

The runner is its own process because cheerio parsing is **synchronous** over
~1MB documents and nanotek is ~700 products — in the main process that would
stall the tray for hours. It is *one* long-lived process because the per-host
throttle is module-level state: a process per job would give each its own
throttle map, and the floor would stop being a floor.

Credentials are passed at `utilityProcess.fork` time, so they are in `process.env`
before any pipeline module body runs. That matters because `src/lib/http.ts`
captures the delay floor at module load and `getDb()` caches its client on first
use — which is also why **changing credentials requires a restart**.

## Building

`scripts/build.mjs` resolves the `@/*` alias at build time with esbuild, so
Electron loads plain CommonJS with no loader hooks and no `tsx`.

**The app runs a snapshot of `../src`.** A change to a scraper needs
`npm run build` here before the desktop picks it up. `..` is referenced only in
`build.mjs`, which is what keeps packaging a later config change rather than a
rewrite.

The window uses the website's fonts, Instrument Sans and JetBrains Mono,
bundled from `@fontsource-variable` into `renderer/dist/fonts`: its CSP allows
nothing remote, so they cannot come from Google. The window's design lives on
the Claude Design canvas "PC Maker Sync desktop redesign".

## Not done yet

No installer, signing or auto-update — this runs on one machine on one
connection, so there is no distribution problem to solve, and an unsigned
Windows binary trips SmartScreen.
