# PC Maker.lk desktop

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

First launch: **Import from .env.local** in the Connection panel copies your
credentials into OS-encrypted storage, then restart. Nothing is read from the
repo after that — the app depends only on its own data directory, so it keeps
working if the repo moves.

## How it decides what to sync

Not a cron. Every five minutes it asks, per shop: *has a row landed since this
shop's own last scheduled slot?* If yes, CI served it and the app leaves it
alone. If the slot passed more than two hours ago and nothing landed, CI missed
it and the app takes over.

That has three properties a wall-clock schedule does not:

- **It never doubles up on CI.** A fixed staleness threshold does: a healthy
  shop's age sweeps from 0h to 24h across the day, so any threshold under 24 is
  crossed shortly before the next CI run — and the app would scrape a retailer
  CI was about to scrape anyway.
- **Catch-up is free.** There is no missed firing to reconstruct; staleness is
  simply still there when the machine wakes up.
- **The split maintains itself.** "CI covers these three, I cover those three"
  falls out of the data, and corrects itself the day gamestreet works again or
  the day winsoft breaks.

Scheduled runs are skipped on battery. Manual runs are not.

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

## Not done yet

No installer, signing or auto-update — this runs on one machine on one
connection, so there is no distribution problem to solve, and an unsigned
Windows binary trips SmartScreen. `app.setLoginItemSettings` is the piece that
actually matters for a nightly local scraper, and it works unpackaged.
