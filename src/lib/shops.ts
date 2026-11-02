import type { TRACKED_SHOPS } from './site'

/**
 * What the home page says about each shop. Branches come from the shop's own
 * site, or its Google listing where the site lists none. Review notes are refreshed by hand every 3 months: see
 * docs/shop-reviews.md for the steps and the rules notes must follow.
 *
 * This holds our own summary and a count, never review text.
 */
export type ShopNote = {
  attribute: 'Warranty' | 'Genuine products' | 'Customer care' | 'Delivery' | 'Price and stock'
  /** `check` is a prompt to the buyer, never a rating of the shop. */
  tone: 'good' | 'check'
  text: string
}

export type ShopProfile = {
  website: string
  branches: { name: string; mapsUrl: string }[]
  reviewsUrl: string
  /** Null when there are too few recent reviews to summarise. */
  reviews: {
    reviewedOn: string
    /** As shown on the card, e.g. "Aug–Oct 2026". */
    period: string
    count: number
    notes: ShopNote[]
  } | null
}

const maps = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`

export const SHOP_PROFILES: Record<(typeof TRACKED_SHOPS)[number], ShopProfile> = {
  'nanotek.lk': {
    website: 'https://www.nanotek.lk',
    branches: [
      { name: 'Dehiwala', mapsUrl: maps('Nanotek, 110A Galle Road, Dehiwala-Mount Lavinia') },
      { name: 'Colombo 03', mapsUrl: maps('Nanotek, 37 School Lane, Colombo 03') },
      { name: 'Kurunegala', mapsUrl: maps('Nanotek, 18 Suratissa Mawatha, Kurunegala') },
    ],
    reviewsUrl: 'https://maps.app.goo.gl/MsmTTCRdrbFMzTy28',
    reviews: {
      reviewedOn: '2026-11-02',
      period: 'Aug–Oct 2026',
      count: 215,
      notes: [
        { attribute: 'Warranty', tone: 'good', text: 'Buyers say claims and after-sales support go smoothly.' },
        { attribute: 'Genuine products', tone: 'good', text: 'Buyers mention original, sealed stock.' },
        { attribute: 'Customer care', tone: 'good', text: 'Staff described as friendly and helpful, in store and on WhatsApp.' },
        { attribute: 'Delivery', tone: 'good', text: 'Online orders often arrive in 1 to 3 days, well packed.' },
        { attribute: 'Price and stock', tone: 'good', text: 'Several buyers call the prices fair.' },
      ],
    },
  },
  'redlinetech.lk': {
    website: 'https://www.redlinetech.lk',
    branches: [{ name: 'Colombo 04', mapsUrl: maps("Redline Technologies, 21 Joseph's Lane, Colombo 04") }],
    reviewsUrl: maps("Redline Technologies, 21 Joseph's Lane, Colombo 04"),
    reviews: {
      reviewedOn: '2026-11-02',
      period: 'Aug–Oct 2026',
      count: 29,
      notes: [
        { attribute: 'Customer care', tone: 'good', text: 'Staff described as friendly and helpful with choosing parts.' },
        { attribute: 'Delivery', tone: 'good', text: 'Buyers report packages arriving safely.' },
        { attribute: 'Price and stock', tone: 'good', text: 'Buyers call the pricing reasonable.' },
      ],
    },
  },
  'gamestreet.lk': {
    website: 'https://www.gamestreet.lk',
    branches: [{ name: 'Bambalapitiya', mapsUrl: maps('Game Street, 100 Galle Road, Bambalapitiya, Colombo 04') }],
    reviewsUrl: maps('Game Street, 100 Galle Road, Bambalapitiya, Colombo 04'),
    reviews: {
      reviewedOn: '2026-11-02',
      period: 'Aug–Oct 2026',
      count: 39,
      notes: [
        { attribute: 'Warranty', tone: 'good', text: 'Buyers describe hassle-free warranty replacements.' },
        { attribute: 'Customer care', tone: 'good', text: 'Staff praised for quick replies and patient help.' },
        { attribute: 'Delivery', tone: 'good', text: 'Some online orders arrive within a day, well packed.' },
        { attribute: 'Price and stock', tone: 'good', text: 'Some buyers call the prices fair.' },
      ],
    },
  },
  'chamacomputers.lk': {
    website: 'https://www.chamacomputers.lk',
    branches: [
      { name: 'Minuwangoda', mapsUrl: maps('Chama Computers Minuwangoda') },
      { name: 'Kandy', mapsUrl: maps('Chama Computers Kandy') },
      { name: 'Colombo', mapsUrl: maps('Chama Computers Colombo') },
    ],
    reviewsUrl: maps('Chama Computers Minuwangoda'),
    reviews: {
      reviewedOn: '2026-11-02',
      period: 'Aug–Oct 2026',
      count: 412,
      notes: [
        { attribute: 'Warranty', tone: 'check', text: 'Repair team often praised. Check warranty terms before buying.' },
        { attribute: 'Customer care', tone: 'good', text: 'Staff often praised for patient, friendly help.' },
      ],
    },
  },
  'pcbuilders.lk': {
    website: 'https://pcbuilders.lk',
    branches: [{ name: 'Yakkala', mapsUrl: 'https://maps.app.goo.gl/jvv6n8154iDqyMXH9' }],
    reviewsUrl: 'https://maps.app.goo.gl/jvv6n8154iDqyMXH9',
    reviews: {
      reviewedOn: '2026-11-02',
      period: 'Aug–Oct 2026',
      count: 29,
      notes: [
        { attribute: 'Customer care', tone: 'good', text: 'Customer service described as helpful.' },
        { attribute: 'Delivery', tone: 'good', text: 'Orders described as fast, arriving in good condition.' },
        { attribute: 'Price and stock', tone: 'good', text: 'Buyers call the pricing fair.' },
      ],
    },
  },
  'winsoft.lk': {
    website: 'https://www.winsoft.lk',
    branches: [{ name: 'Unity Plaza, Colombo 04', mapsUrl: maps('Winsoft Technologies Colombo') }],
    reviewsUrl: maps('Winsoft Technologies Colombo'),
    reviews: {
      reviewedOn: '2026-11-02',
      period: 'Aug–Oct 2026',
      count: 18,
      notes: [
        { attribute: 'Customer care', tone: 'good', text: 'Staff described as friendly and patient.' },
        { attribute: 'Price and stock', tone: 'good', text: 'Buyers call the prices competitive.' },
      ],
    },
  },
  'tecroot.lk': {
    website: 'https://www.tecroot.lk',
    branches: [{ name: 'Colombo 04', mapsUrl: maps('TecRoot, 247 Galle Road, Colombo 04') }],
    reviewsUrl: maps('TecRoot, 247 Galle Road, Colombo 04'),
    reviews: {
      reviewedOn: '2026-11-02',
      period: 'Aug–Oct 2026',
      count: 26,
      notes: [
        { attribute: 'Warranty', tone: 'check', text: 'Check warranty terms before buying.' },
        { attribute: 'Genuine products', tone: 'check', text: 'Check the box seal when you collect.' },
        { attribute: 'Customer care', tone: 'check', text: 'Staff praised in store. Calls may go unanswered.' },
        { attribute: 'Price and stock', tone: 'check', text: 'Confirm the price before paying.' },
      ],
    },
  },
}
