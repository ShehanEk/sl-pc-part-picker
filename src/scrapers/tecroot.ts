import { createWooScraper } from './woocommerce'

/**
 * tecroot.lk — WordPress + WooCommerce, read through the Store API (see
 * `woocommerce.ts`). Mostly a games and accessories shop; its PC parts sit
 * under "Accessories".
 *
 * robots.txt disallows only filter, sort and price-range query strings.
 *
 * Product names leave the brand out ("Pro B760M-P DDR4" is an MSI board), so
 * it is read from the "Brands" attribute and put in front of the title.
 */
export const tecroot = createWooScraper({
  shop: 'tecroot.lk',
  baseUrl: 'https://www.tecroot.lk',
  brandAttribute: 'Brands',
  categoryIds: {
    gpu: { id: 3236, label: 'Graphics Cards' },
    cpu: { id: 6230, label: 'Processors' },
    motherboard: { id: 6229, label: 'Motherboards' },
    // No RAM or storage: both are sold as one product per range with the
    // capacity picked on the page ("Corsair Vengeance DDR5"), so a title never
    // says which kit or drive a price is for. Reading each variation would
    // cost a request per capacity; see the open item in docs/status.md.
    psu: { id: 6153, label: 'Power Supply Units' },
    case: { id: 6131, label: 'Casings' },
    peripherals: [
      { id: 1919, label: 'Keyboards' },
      { id: 1920, label: 'Mice' },
      { id: 321, label: 'Controllers' },
    ],
    // Includes retro mini-consoles, which match no console model and drop.
    consoles: { id: 227, label: 'Gaming Consoles' },
  },
})
