import { createWooScraper } from './woocommerce'

/**
 * pcbuilders.lk — WordPress + WooCommerce, read through the Store API (see
 * `woocommerce.ts`). The Store API carries the product's own attribute table
 * (MANUFACTURER, MODEL, RAM - SIZE) alongside price and stock.
 *
 * robots.txt disallows /cart/, /checkout/, /my-account/, add-to-cart links
 * and, since 2026-10, `/*?*per_page=*` — see the open item in docs/status.md.
 *
 * Two things about this shop needed deciding rather than reading off the page:
 * the category map below, and backorders counting as out of stock (in
 * `woocommerce.ts`). Both are cases where the obvious reading of the data
 * would have put a price in front of a buyer that they could not actually pay.
 */
export const pcbuilders = createWooScraper({
  shop: 'pcbuilders.lk',
  baseUrl: 'https://pcbuilders.lk',
  /**
   * Every id here but the peripherals sits under `components`. The shop also
   * keeps a parallel `all-used-items` tree (used graphics cards, processors,
   * boards, supplies), deliberately excluded: a used card at half price would
   * win every comparison it appeared in, against new stock, with nothing on
   * the row to say why.
   *
   * Filtering by a parent id includes its children, so these cover the
   * Intel/AMD, desktop-RAM, NVMe and hard-disk sub-categories without listing
   * them (verified: processors=41 against intel 19 + amd 20).
   */
  categoryIds: {
    gpu: { id: 95, label: 'GRAPHIC CARDS' },
    cpu: { id: 58, label: 'PROCESSORS' },
    motherboard: { id: 69, label: 'MOTHERBOARDS' },
    ram: { id: 78, label: 'MEMORY' },
    storage: { id: 81, label: 'STORAGE' },
    // Was 76 ("POWER SUPPLY & UPS") until the shop split it, by 2026-10, into
    // power-supply (408) and ups-power-supply-ups (394). 76 went on answering
    // with an empty list rather than an error, so PSUs vanished without a
    // failure. UPS units are not PC PSUs, so only 408 is taken.
    psu: { id: 408, label: 'POWER SUPPLY' },
    case: { id: 143, label: 'COMPUTER CASE' },
    // The children, not "Gaming Peripherals" (24): that also holds headsets,
    // speakers, webcams and capture cards.
    peripherals: [
      { id: 380, label: 'KEYBOARDS' },
      { id: 377, label: 'MOUSE' },
      { id: 390, label: 'GAME CONTROLLERS' },
    ],
    // New only: 391 is Used Laptops, and the parent 404 adds laptop RAM, bags
    // and stands.
    laptops: { id: 407, label: 'NEW LAPTOPS' },
    consoles: [
      { id: 1570, label: 'GAMING CONSOLES' },
      { id: 1571, label: 'HANDHELD GAMING' },
    ],
  },
})
