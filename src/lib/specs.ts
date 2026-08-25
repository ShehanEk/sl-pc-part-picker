import type { BuildPart } from '@/compat/build'

/**
 * Human-readable specs for a part, in the order a buyer reads them.
 *
 * Shared by the browse rows, the part page and the meta description, so the
 * three never disagree about what a part is. Missing values are omitted rather
 * than rendered as blanks — a spec we do not have is not a spec worth a row.
 */

export type SpecLine = { label: string; value: string }

type SpecSource = BuildPart & {
  vramGb?: number | null
  efficiencyRating?: string | null
}

export function specLines(part: SpecSource): SpecLine[] {
  const out: SpecLine[] = []
  const push = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== '') {
      out.push({ label, value: String(value) })
    }
  }

  switch (part.category) {
    case 'gpu':
      push('Memory', part.vramGb ? `${part.vramGb} GB` : null)
      push('Board power', part.tdpWatts ? `${part.tdpWatts} W` : null)
      push('Recommended PSU', part.recommendedPsuWatts ? `${part.recommendedPsuWatts} W` : null)
      push('Power connector', connectorLabel(part.powerConnector))
      break
    case 'cpu':
      push('Socket', part.socket)
      push('Memory', part.ramType)
      push('TDP', part.tdpWatts ? `${part.tdpWatts} W` : null)
      break
    case 'motherboard':
      push('Socket', part.socket)
      push('Memory', part.ramType)
      push('Size', part.formFactor)
      push('Memory slots', part.ramSlots)
      push('Max memory', part.maxRamGb ? `${part.maxRamGb} GB` : null)
      break
    case 'ram':
      push('Type', part.ramType)
      push('Capacity', part.capacityGb ? `${part.capacityGb} GB` : null)
      push('Speed', part.speedMhz ? `${part.speedMhz} MHz` : null)
      push('Modules', part.modules)
      break
    case 'storage':
      push('Capacity', part.capacityGb ? `${part.capacityGb} GB` : null)
      push('Interface', storageLabel(part.storageInterface))
      break
    case 'psu':
      push('Rated output', part.ratedWatts ? `${part.ratedWatts} W` : null)
      push('Efficiency', part.efficiencyRating ? `80+ ${part.efficiencyRating}` : null)
      push(
        'PCIe connectors',
        part.connectors?.length
          ? part.connectors.map((c) => connectorLabel(c)).join(', ')
          : null,
      )
      break
    case 'case':
      push('Largest board', part.formFactor)
      break
  }

  return out
}

/** One line of specs, for a table cell or a meta description. */
export function specSummary(part: SpecSource, max = 3): string {
  return specLines(part)
    .slice(0, max)
    .map((s) => s.value)
    .join(' · ')
}

function connectorLabel(c: BuildPart['powerConnector'] | undefined): string | null {
  switch (c) {
    case '8pin':
      return '1x 8-pin'
    case '2x8pin':
      return '2x 8-pin'
    case '12vhpwr':
      return '12VHPWR'
    case '12v-2x6':
      return '12V-2x6 (16-pin)'
    default:
      return null
  }
}

function storageLabel(s: BuildPart['storageInterface'] | undefined): string | null {
  switch (s) {
    case 'm2-nvme':
      return 'M.2 NVMe'
    case 'm2-sata':
      return 'M.2 SATA'
    case 'sata':
      return 'SATA'
    default:
      return null
  }
}

/**
 * What this part constrains in a build, in plain words.
 *
 * This is the sentence the site can write that a shop's listing cannot, because
 * it comes from the compatibility model rather than the product copy.
 */
export function fitNote(part: SpecSource): string | null {
  switch (part.category) {
    case 'cpu':
      return part.socket
        ? `Needs a ${part.socket} motherboard${part.ramType ? `, and ${part.ramType} memory` : ''}.`
        : null
    case 'motherboard':
      return part.socket
        ? `Takes ${part.socket} processors${part.ramType ? ` and ${part.ramType} memory` : ''}${
            part.formFactor ? `, and needs a case that fits ${part.formFactor}` : ''
          }.`
        : null
    case 'ram':
      return part.ramType ? `Needs a ${part.ramType} motherboard.` : null
    case 'gpu':
      if (part.recommendedPsuWatts) {
        return `The manufacturer recommends at least a ${part.recommendedPsuWatts}W power supply.`
      }
      return part.tdpWatts
        ? `Draws about ${part.tdpWatts}W, so budget for it when sizing a power supply.`
        : null
    case 'psu':
      return part.ratedWatts
        ? `Rated for ${part.ratedWatts}W, which our checker sizes against the card and processor you pick.`
        : null
    case 'case':
      return part.formFactor
        ? `Accepts ${part.formFactor} motherboards and anything smaller.`
        : null
    default:
      return null
  }
}

/**
 * Specs as a readable phrase for a meta description.
 *
 * `specSummary` is for a table cell, where the column implies the label; a
 * search snippet has no column, and "12 GB · 250 W · 750 W" reads as noise
 * there. This puts the label back: "12 GB memory, 250 W board power".
 */
export function specPhrase(part: SpecSource, max = 2): string {
  return specLines(part)
    .slice(0, max)
    .map((s) => `${s.value} ${s.label.toLowerCase()}`)
    .join(', ')
}
