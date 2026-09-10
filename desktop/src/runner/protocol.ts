/** Messages between the main process and the runner. Shared by both sides. */

export type JobRequest =
  | {
      type: 'scrape'
      jobId: string
      shop: string
      categories?: string[]
      maxProducts?: number
      dryRun?: boolean
    }
  | { type: 'normalize'; jobId: string; limit?: number; redo?: boolean; dryRun?: boolean }
  | { type: 'ping'; jobId: string }

export type JobEvent =
  | { type: 'log'; jobId: string; line: string }
  | { type: 'done'; jobId: string; ok: true; result: unknown }
  | { type: 'done'; jobId: string; ok: false; error: string }
  | { type: 'ready'; runtime: { fetch: boolean; abort: boolean; getSetCookie: boolean } }
