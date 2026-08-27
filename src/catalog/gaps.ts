import type { Part } from '@/db/schema'
import type { BuildSlot } from '@/compat/build'

/**
 * What counts as missing spec data, and what is correctly absent.
 *
 * The distinction is the whole point of this module. Roughly 1,300 spec cells
 * in the catalogue are empty, and a dashboard that lists all of them is a
 * dashboard nobody opens twice. Two filters cut it to something a person can
 * actually work through:
 *
 *  1. Only fields a compatibility rule consumes are worth chasing. A field the
 *     UI merely displays is not a gap, it is a blank.
 *  2. Some nulls are the correct answer, not an omission. Flagging those
 *     generates busywork with no right value to enter.
 */

/** Field names on `parts` an operator may fill. */
export type EditableField =
  | 'tdpWatts'
  | 'vramGb'
  | 'powerConnector'
  | 'recommendedPsuWatts'
  | 'socket'
  | 'ramType'
  | 'ramSlots'
  | 'maxRamGb'
  | 'maxSupportedSpeedMhz'
  | 'formFactor'
  | 'speedMhz'
  | 'modules'
  | 'capacityGb'
  | 'storageInterface'
  | 'ratedWatts'
  | 'connectors'
  | 'efficiencyRating'

export type FieldSpec = {
  field: EditableField
  label: string
  /** How the value is entered. */
  kind: 'int' | 'text' | 'enum' | 'enum-multi'
  options?: readonly string[]
  unit?: string
  /**
   * The compatibility check this unblocks, by `CheckResult.id`. Present means
   * a rule reads it and a null is a real gap; absent means display-only.
   */
  unblocks?: string
  /**
   * Folded into `part_id` by the extractors, so the value is part of the URL.
   * These may be filled when null but never changed once set — otherwise
   * `/motherboard/asus-prime-b760m-a-ddr4` ends up claiming DDR5.
   */
  identityBearing?: boolean
  /**
   * Returns true when a null is the right answer for this particular part, so
   * it is reported as settled rather than missing.
   */
  correctlyNull?: (part: Part) => boolean
}

const CONNECTORS = ['8pin', '2x8pin', '12vhpwr', '12v-2x6'] as const
const RAM_TYPES = ['DDR4', 'DDR5'] as const
const FORM_FACTORS = ['ATX', 'mATX', 'ITX'] as const
const STORAGE_INTERFACES = ['m2-nvme', 'm2-sata', 'sata'] as const

/**
 * Intel's 600 and 700 series platforms ship in DDR4 and DDR5 variants and the
 * *board* decides, so a processor on LGA1700 genuinely has no memory
 * generation of its own — `src/catalog/platforms.ts` encodes this as
 * `ramType: null` on purpose. That is ~31 of 90 processors; treating them as
 * gaps would invent a third of the CPU backlog out of nothing.
 *
 * The same socket on a motherboard is the opposite case: the board does decide,
 * the listing title just did not say, so those are worth filling.
 */
const cpuRamTypeIsUndecidable = (part: Part) => part.socket === 'LGA1700'

export const FIELDS: Record<BuildSlot, FieldSpec[]> = {
  gpu: [
    { field: 'vramGb', label: 'Memory', kind: 'int', unit: 'GB', identityBearing: true },
    { field: 'tdpWatts', label: 'Board power', kind: 'int', unit: 'W', unblocks: 'psu-wattage' },
    {
      field: 'recommendedPsuWatts',
      label: 'Recommended PSU',
      kind: 'int',
      unit: 'W',
      unblocks: 'psu-wattage',
    },
    {
      field: 'powerConnector',
      label: 'Power connector',
      kind: 'enum',
      options: CONNECTORS,
      unblocks: 'gpu-connector',
    },
  ],
  cpu: [
    { field: 'socket', label: 'Socket', kind: 'text', unblocks: 'cpu-socket' },
    {
      field: 'ramType',
      label: 'Memory type',
      kind: 'enum',
      options: RAM_TYPES,
      unblocks: 'ram-type',
      correctlyNull: cpuRamTypeIsUndecidable,
    },
    { field: 'tdpWatts', label: 'TDP', kind: 'int', unit: 'W', unblocks: 'psu-wattage' },
  ],
  motherboard: [
    { field: 'socket', label: 'Socket', kind: 'text', unblocks: 'cpu-socket' },
    {
      field: 'ramType',
      label: 'Memory type',
      kind: 'enum',
      options: RAM_TYPES,
      unblocks: 'ram-type',
      identityBearing: true,
    },
    {
      field: 'formFactor',
      label: 'Board size',
      kind: 'enum',
      options: FORM_FACTORS,
      unblocks: 'case-fit',
      identityBearing: true,
    },
    { field: 'ramSlots', label: 'Memory slots', kind: 'int', unblocks: 'ram-fits' },
    { field: 'maxRamGb', label: 'Max memory', kind: 'int', unit: 'GB', unblocks: 'ram-fits' },
    {
      field: 'maxSupportedSpeedMhz',
      label: 'Max memory speed',
      kind: 'int',
      unit: 'MHz',
      unblocks: 'ram-speed',
    },
  ],
  ram: [
    {
      field: 'ramType',
      label: 'Type',
      kind: 'enum',
      options: RAM_TYPES,
      unblocks: 'ram-type',
      identityBearing: true,
    },
    { field: 'capacityGb', label: 'Capacity', kind: 'int', unit: 'GB', unblocks: 'ram-fits', identityBearing: true },
    { field: 'modules', label: 'Modules', kind: 'int', unblocks: 'ram-fits', identityBearing: true },
    { field: 'speedMhz', label: 'Speed', kind: 'int', unit: 'MHz', unblocks: 'ram-speed', identityBearing: true },
  ],
  storage: [
    { field: 'capacityGb', label: 'Capacity', kind: 'int', unit: 'GB', identityBearing: true },
    {
      field: 'storageInterface',
      label: 'Interface',
      kind: 'enum',
      options: STORAGE_INTERFACES,
      identityBearing: true,
    },
  ],
  psu: [
    { field: 'ratedWatts', label: 'Rated output', kind: 'int', unit: 'W', unblocks: 'psu-wattage', identityBearing: true },
    {
      field: 'connectors',
      label: 'PCIe connectors',
      kind: 'enum-multi',
      options: CONNECTORS,
      unblocks: 'gpu-connector',
    },
    { field: 'efficiencyRating', label: 'Efficiency', kind: 'text', identityBearing: true },
  ],
  case: [
    {
      field: 'formFactor',
      label: 'Largest board',
      kind: 'enum',
      options: FORM_FACTORS,
      unblocks: 'case-fit',
      identityBearing: true,
    },
  ],
}

/**
 * Fields excluded on purpose, so nobody wonders where they went:
 *
 *  - `lengthMm` — captured from spec tables, but no rule reads it, because the
 *    case clearance it would be compared against is not published anywhere.
 *  - `msrpUsd`, `integratedGraphics` — zero writers and zero readers. Filling
 *    them by hand would be 1,149 cells of pure ceremony. Better to drop the
 *    columns than to build a form for them.
 */
export const EXCLUDED_FIELDS = ['lengthMm', 'msrpUsd', 'integratedGraphics'] as const

export type Gap = { field: EditableField; label: string; unblocks?: string }

/** Fields a rule needs that this part has not got, ignoring correct nulls. */
export function gapsForPart(part: Part): Gap[] {
  const specs = FIELDS[part.category as BuildSlot] ?? []
  return specs
    .filter((s) => s.unblocks)
    .filter((s) => {
      const value = part[s.field as keyof Part]
      const empty = value === null || value === undefined || (Array.isArray(value) && value.length === 0)
      if (!empty) return false
      return !s.correctlyNull?.(part)
    })
    .map((s) => ({ field: s.field, label: s.label, unblocks: s.unblocks }))
}

export function fieldSpec(category: BuildSlot, field: EditableField): FieldSpec | undefined {
  return FIELDS[category]?.find((f) => f.field === field)
}

/** Human-readable name of each check, for the "unblocks" chips. */
export const CHECK_LABEL: Record<string, string> = {
  'psu-wattage': 'power sizing',
  'gpu-connector': 'connector fit',
  'cpu-socket': 'socket match',
  'ram-type': 'memory generation',
  'ram-fits': 'memory fits the board',
  'ram-speed': 'memory speed',
  'case-fit': 'board fits the case',
}
