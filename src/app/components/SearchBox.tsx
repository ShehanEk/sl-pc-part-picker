import Form from 'next/form'

/**
 * Part search. A plain GET to /search, so it works before JavaScript loads;
 * `next/form` makes the submit a client-side navigation once it has.
 *
 * `large` is the hero box, with its own submit button; `after` puts a second
 * action beside that button (the home page's "Build a PC"). The header's
 * compact box submits on Enter.
 */
export function SearchBox({
  large = false,
  defaultValue,
  placeholder = 'Search parts, e.g. RTX 5070',
  after,
}: {
  large?: boolean
  defaultValue?: string
  placeholder?: string
  after?: React.ReactNode
}) {
  const id = large ? 'search-hero' : 'search-header'

  return (
    <Form
      action="/search"
      role="search"
      className={large ? 'flex w-full max-w-[780px] flex-wrap gap-2.5' : 'w-full'}
    >
      <label htmlFor={id} className="sr-only">
        Search parts
      </label>
      <div
        className={`flex flex-1 basis-[300px] items-center gap-2.5 border border-[rgb(30_50_100/12%)] bg-white/90 ${
          large
            ? 'min-h-14 rounded-2xl px-[18px] shadow-[var(--glass-shadow)]'
            : 'min-h-11 rounded-[var(--radius-sm)] px-3.5'
        }`}
      >
        <svg
          width={large ? 20 : 18}
          height={large ? 20 : 18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          className="flex-none text-ink-3"
          aria-hidden
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          id={id}
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          className={`min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3 ${
            large ? 'text-[16px]' : 'text-[14.5px]'
          }`}
        />
      </div>
      {large && (
        // On a phone the buttons share the row below the input, half each.
        <div className="flex w-full gap-2.5 sm:w-auto">
          <button
            type="submit"
            className="min-h-14 flex-1 rounded-2xl bg-[var(--accent)] px-6 text-[15px] font-semibold text-white transition hover:bg-[var(--accent-strong)] sm:flex-none"
          >
            Find cheapest
          </button>
          {after}
        </div>
      )}
    </Form>
  )
}
