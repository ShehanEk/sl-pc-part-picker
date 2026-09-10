import { build, context } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Bundles the desktop app.
 *
 * The pipeline lives in `../src` and is written against the `@/*` alias, which
 * only `tsx` resolves — and `tsx` is a devDependency of the web app, not
 * something to ship inside a desktop binary. So the alias is resolved here, at
 * build time, and Electron loads plain CommonJS with no loader hooks.
 *
 * `..` is referenced *only* in this file. Nothing the running app does reaches
 * back into the repo, which is what keeps packaging a later config change
 * rather than a rewrite.
 */

const here = dirname(fileURLToPath(import.meta.url))
const desktop = resolve(here, '..')
const repo = resolve(desktop, '..')

const watch = process.argv.includes('--watch')

/** Shared across every Node-side bundle. */
const node = {
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  bundle: true,
  // The pipeline's `@/*` imports. Resolved once, here.
  alias: { '@': resolve(repo, 'src') },
  // Set explicitly rather than relying on defaults: the closure mixes
  // `@neondatabase/serverless` (ESM-only exports) with `@anthropic-ai/sdk`
  // (CommonJS), and the wrong condition order silently picks a browser build
  // of the Neon driver that cannot open a socket.
  conditions: ['node', 'import'],
  // Readable stack traces beat a smaller file for a tool one person runs.
  minify: false,
  keepNames: true,
  logLevel: 'info',
}

/** @type {import('esbuild').BuildOptions[]} */
const targets = [
  {
    ...node,
    entryPoints: [resolve(desktop, 'src/runner/index.ts')],
    outfile: resolve(desktop, 'dist/runner.cjs'),
    // Self-contained: the runner is its own process, so a single file means the
    // packaged app ships no node_modules at all.
    sourcemap: false,
  },
  {
    ...node,
    // The bare pipeline surface, so it can be exercised under plain `node`
    // without Electron — see scripts/probe.mjs. Not loaded by the app itself.
    entryPoints: [resolve(desktop, 'src/runner/pipeline.ts')],
    outfile: resolve(desktop, 'dist/pipeline.cjs'),
    sourcemap: false,
  },
  {
    ...node,
    entryPoints: [resolve(desktop, 'src/main/admin-queries.ts')],
    outfile: resolve(desktop, 'dist/admin-queries.cjs'),
    // Kept separate from main so it can be `require`d *after* credentials are
    // in process.env — `getDb()` caches its client on first call.
    sourcemap: false,
  },
  {
    ...node,
    entryPoints: [resolve(desktop, 'src/main/index.ts')],
    outfile: resolve(desktop, 'dist/main.cjs'),
    // `electron` is provided by the runtime. admin-queries is deliberately
    // loaded late, so it must not be inlined here.
    external: ['electron', './admin-queries.cjs'],
  },
  {
    ...node,
    entryPoints: [resolve(desktop, 'src/preload/index.ts')],
    outfile: resolve(desktop, 'dist/preload.cjs'),
    external: ['electron'],
  },
  {
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    bundle: true,
    minify: false,
    logLevel: 'info',
    entryPoints: [resolve(desktop, 'renderer/src/main.ts')],
    outfile: resolve(desktop, 'renderer/dist/renderer.js'),
  },
  {
    bundle: true,
    logLevel: 'info',
    entryPoints: [resolve(desktop, 'renderer/src/styles.css')],
    outfile: resolve(desktop, 'renderer/dist/renderer.css'),
  },
]

async function run() {
  if (watch) {
    for (const target of targets) {
      const ctx = await context(target)
      await ctx.watch()
    }
    console.log('watching…')
    return
  }

  for (const target of targets) await build(target)
  console.log('built')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
