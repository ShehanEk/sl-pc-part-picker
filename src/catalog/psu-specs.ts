/**
 * Curated PSU connector catalog.
 *
 * The counterpart to gpu-specs.ts, and the data the GPU power-connector rule
 * needs. Retailer listings never publish connector lists, so without this the
 * check can only ever answer "unknown".
 *
 * Rules for editing this file:
 *
 *  - Cite the source on every entry, and read it — do not infer a connector
 *    complement from wattage or from a model's family. Claiming a lead a unit
 *    does not have is how someone ends up unable to plug in a card they bought
 *    on our say-so.
 *  - `connectors` lists PCIe GPU power leads only, one array entry per physical
 *    connector. CPU (EPS), SATA and Molex are irrelevant to this rule.
 *  - A native 12V-2x6 is listed separately from the 8-pin leads it ships
 *    alongside, because the rule treats native and adapter-fed differently.
 *  - `aliases` fold part_ids that different retailer titles minted for the same
 *    unit ("Corsair CX650" vs "CORSAIR CX Series CX650 ATX").
 */

export type PsuConnector = '8pin' | '2x8pin' | '12vhpwr' | '12v-2x6'

export type CuratedPsu = {
  partId: string
  connectors: PsuConnector[]
  aliases?: string[]
  source: string
}

const CORSAIR = 'https://www.corsair.com'

export const CURATED_PSUS: CuratedPsu[] = [
  // --- Corsair --------------------------------------------------------------
  // Spec tables read from each product page: the "PCIe Connector" count is the
  // number of 8-pin (6+2) GPU leads, with any 12V-2x6 listed separately in the
  // cable list.
  {
    partId: 'corsair-cx550-550w-bronze',
    connectors: ['8pin', '8pin'],
    source: `${CORSAIR}/us/en/p/psu/cp-9020121-na/cx-series-cx550-550-watt-80-plus-bronze-certified-atx-psu-cp-9020121-na`,
  },
  {
    partId: 'corsair-cx650-650w-bronze',
    connectors: ['8pin', '8pin'],
    aliases: ['corsair-cx-cx650-atx-650w-bronze'],
    source: `${CORSAIR}/us/en/p/psu/cp-9020278-na/cx-series-cx650-650-watt-80-plus-bronze-atx-power-supply-cp-9020278-na`,
  },
  {
    partId: 'corsair-cx750-750w-bronze',
    connectors: ['8pin', '8pin'],
    aliases: ['corsair-cx-cx750-atx-750w-bronze'],
    source: `${CORSAIR}/us/en/p/psu/cp-9020279-na/cx-series-cx750-750-watt-80-plus-bronze-atx-power-supply-cp-9020279-na`,
  },
  {
    // ATX 3.1, PCIe 5.1: ships a native 600W 12V-2x6 GPU cable alongside its
    // three 8-pin leads.
    partId: 'corsair-rme-rm750e-750w-gold',
    connectors: ['8pin', '8pin', '8pin', '12v-2x6'],
    aliases: ['corsair-rme-rm750e-years-warranty-750w-gold', 'corsair-rm750e-750w-gold'],
    source: `${CORSAIR}/us/en/p/psu/cp-9020295-na/rme-series-rm750e-fully-modular-low-noise-atx-power-supply-cp-9020295-na`,
  },
  {
    partId: 'corsair-rmx-rm850x-850w-gold',
    connectors: ['8pin', '8pin', '8pin', '8pin', '8pin', '8pin'],
    aliases: ['corsair-rmx-rm850x-atx-v3-850w'],
    source: `${CORSAIR}/us/en/p/psu/cp-9020180-na/rmx-series-rm850x-850-watt-80-plus-gold-certified-fully-modular-psu-cp-9020180-na`,
  },

  // TODO: the rest of the catalogue — Antec, Thermaltake, Gamdias, Asus, MSI,
  // Deepcool, NZXT and Monova, plus the remaining Corsair units (RM650e,
  // RM1000x, HX1200i, AX1600i). Roughly 90 in-stock listings across those
  // brands still answer "unknown" for the connector check. Each brand publishes
  // the data on its own product pages; there is no single source covering them.
]

export const CURATED_PSU_BY_ID: Map<string, CuratedPsu> = new Map(
  CURATED_PSUS.map((p) => [p.partId, p]),
)

/** alias part_id → canonical part_id */
export const PSU_ALIASES: Record<string, string> = Object.fromEntries(
  CURATED_PSUS.flatMap((p) => (p.aliases ?? []).map((a) => [a, p.partId])),
)
