# PC Maker.lk — SL PC Parts Tracker

Pick a PC part, see which Sri Lankan shop stocks it and at what price, and build
a whole machine out of parts that actually work together — mixing shops freely.

The premise is narrowness. PCPartPicker knows every part in the world and none
of the prices here; this knows only what four Colombo retailers have on the
shelf, which is the only catalogue a buyer in Sri Lanka can act on.

**Live:** deployed on Vercel · **Repo:** [ShehanEk/sl-pc-part-picker](https://github.com/ShehanEk/sl-pc-part-picker)

## Documentation

| Doc | What's in it |
|---|---|
| [Architecture](docs/architecture.md) | How the pieces fit, module map, rendering and caching, known gaps |
| [Decisions](docs/decisions.md) | Every significant choice, why it was made, what it costs |
| [Data pipeline](docs/pipeline.md) | The four stages, schedules, failure modes, how to run and reprocess |
| [What we capture](docs/data.md) | Retailers, fields, spec coverage, and what is deliberately not captured |
| [Admin](#admin) | Sync health, catalogue summary, and filling missing specs by hand |
| [Retailer inspection](docs/retailers.md) | Per-site scraping mechanics, selectors, robots.txt, gotchas |

## Quick start

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in the three values (see
[Configuration](#configuration)). Then:

```bash
npm run db:migrate
```

```bash
npm run dev
```

The app is at `http://localhost:3000` (`npm run dev -- -p 3100` if 3000 is taken;
`.claude/launch.json` uses 3100).

With an empty database the page renders but every category is empty. To fill it:

```bash
npm run scrape -- all
```

```bash
npm run normalize
```

A full scrape of all five shops takes upwards of an hour, dominated by
nanotek.lk (three requests per product, serialised, with a 1.5s floor per host —
that gap is deliberate). For a quick smoke test:

```bash
npm run scrape -- gamestreet.lk --categories gpu --max-products 5 --dry-run
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm test` | Compatibility-rule tests (46, `node:test` via tsx) |
| `npm run lint` | ESLint |
| `npm run scrape -- <shop\|all>` | Stage 1–2: scrape a retailer into `raw_listings` |
| `npm run normalize` | Stage 3–4: resolve raw rows to parts, write `listings` + `price_history` |
| `npm run seed:specs` | Push the curated spec catalogs onto `parts` |
| `npm run db:generate` / `db:migrate` / `db:studio` | Drizzle schema tooling |

Useful scrape flags: `--categories gpu,psu`, `--max-products N`, `--max-pages N`,
`--dry-run`. Useful normalize flags: `--limit N`, `--redo`, `--no-ai`, `--dry-run`.

## Configuration

| Variable | Required | Used by |
|---|---|---|
| `DATABASE_URL` | yes | App and pipeline. Neon **pooled** connection. |
| `DATABASE_URL_UNPOOLED` | migrations only | `drizzle-kit`. Same host without `-pooler`. |
| `ANTHROPIC_API_KEY` | no | Normalizer's fallback title matcher. Without it, titles the rules can't parse are left unmatched rather than the run failing. |
| `ADMIN_PASSWORD` | admin only | Signs you in at `/admin`. 32+ random characters — there is no rate limiting. |
| `ADMIN_SESSION_SECRET` | admin only | Signs the admin session cookie. Changing it signs everyone out. |
| `REVALIDATE_SECRET` | no | Lets the nightly job clear the site's read cache when it finishes. |
| `SCRAPER_USER_AGENT` | no | Overrides the default bot UA. |
| `SCRAPER_DELAY_MS` | no | Minimum gap between requests to one host. Floor is 1500ms; a smaller or unparseable value is ignored. |

Secrets live in `.env.local` (gitignored), in GitHub Actions secrets for the
nightly jobs, and in Vercel project settings for the deployed app. They are
never committed.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · Drizzle ORM · Neon serverless
Postgres · cheerio · Anthropic SDK (ingest-time matching only) · GitHub Actions ·
Vercel.

## Admin

`/admin`, behind one password. Three things:

- **Sync health** — when each shop last *landed* a row, against the run it was
  scheduled for. It cannot tell a failed run from a run that found nothing new
  (the scraper throws before writing, so nothing records the difference), which
  is stated on the page. Red means go and read the Actions log.
- **Catalogue summary** — parts, listings, stock and price range per category,
  computed live rather than from the cache.
- **Missing data** — spec fields a compatibility rule actually needs, ranked by
  how many shops stock the part. Values that are correctly absent are excluded:
  a processor on LGA1700 has no memory generation of its own. Each part has an
  edit form showing what the pipeline produced, what the shops published in
  their own spec tables, and where your value would disagree.

Edits are stored in `part_overrides` and applied **after** the curated catalog
on every run, so they survive the pipeline. See
[decisions.md](docs/decisions.md) for why that ordering is the whole design.
