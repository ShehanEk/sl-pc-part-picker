/**
 * Compatibility rules.
 *
 * Pure functions over plain objects: no database, no network, and deliberately
 * no AI. A wrong "your PSU is fine" is a build that does not boot or a part that
 * burns, not a bad recommendation, so every answer here has to be reproducible
 * and explainable. The model's only job in this codebase is matching listing
 * titles at ingest time.
 *
 * Four outcomes, and the fourth matters as much as the others:
 *
 *   pass    — the rule is satisfied
 *   fail    — the rule is violated
 *   warn    — works, but not as the buyer might expect (soft, never blocking)
 *   unknown — a required spec is missing
 *
 * `unknown` exists because most PSUs in the catalog have no published connector
 * list. Silence is honest; a green tick we cannot justify is not.
 */

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'unknown'

export type CheckResult = {
  /** Stable id so the UI can key off it. */
  id: string
  status: CheckStatus
  /** One line, written for a buyer rather than a developer. */
  message: string
  /** The arithmetic, shown so the answer can be argued with. */
  detail?: string
}

export type Gpu = {
  model: string
  tdpWatts: number | null
  recommendedPsuWatts: number | null
  powerConnector: '8pin' | '2x8pin' | '12vhpwr' | '12v-2x6' | null
  lengthMm?: number | null
}

export type Cpu = {
  model: string
  socket: string | null
  tdpWatts: number | null
  ramType: 'DDR4' | 'DDR5' | null
}

export type Motherboard = {
  model: string
  socket: string | null
  ramType: 'DDR4' | 'DDR5' | null
  ramSlots: number | null
  maxRamGb: number | null
  maxSupportedSpeedMhz: number | null
}

export type Ram = {
  model: string
  ramType: 'DDR4' | 'DDR5' | null
  speedMhz: number | null
  capacityGb: number | null
  modules: number | null
}

export type Psu = {
  model: string
  ratedWatts: number | null
  connectors: ('8pin' | '2x8pin' | '12vhpwr' | '12v-2x6')[] | null
}

/**
 * Fraction added on top of summed component draw.
 *
 * Covers the rest of the system (board, drives, fans) and the transient spikes
 * modern GPUs pull well above their rated TDP, which are what actually trip a
 * marginal supply. 1.3 is the low end of common guidance; raising it makes the
 * tool stricter, never less safe.
 */
export const PSU_HEADROOM_MULTIPLIER = 1.3

/** Assumed CPU draw when no CPU has been picked yet, so the GPU page can still answer. */
export const ASSUMED_CPU_WATTS = 95

/**
 * Watts a build needs.
 *
 * Takes the larger of the manufacturer's recommendation and the computed
 * figure. The manufacturer number assumes a typical CPU, so it under-reads for
 * a heavy one; the computed number ignores platform draw the manufacturer
 * accounted for. The maximum is the only choice that is wrong in the safe
 * direction.
 */
export function requiredPsuWatts(
  gpu: Pick<Gpu, 'tdpWatts' | 'recommendedPsuWatts'>,
  cpuWatts: number | null,
): { watts: number; basis: string } | null {
  const cpu = cpuWatts ?? ASSUMED_CPU_WATTS
  const computed =
    gpu.tdpWatts !== null
      ? Math.ceil(((gpu.tdpWatts + cpu) * PSU_HEADROOM_MULTIPLIER) / 10) * 10
      : null

  if (computed === null && gpu.recommendedPsuWatts === null) return null
  if (computed === null) {
    return { watts: gpu.recommendedPsuWatts!, basis: "manufacturer's recommendation" }
  }
  if (gpu.recommendedPsuWatts === null) {
    return {
      watts: computed,
      basis: `${gpu.tdpWatts}W GPU + ${cpu}W CPU, +${Math.round((PSU_HEADROOM_MULTIPLIER - 1) * 100)}% headroom`,
    }
  }
  return gpu.recommendedPsuWatts >= computed
    ? { watts: gpu.recommendedPsuWatts, basis: "manufacturer's recommendation" }
    : {
        watts: computed,
        basis: `${gpu.tdpWatts}W GPU + ${cpu}W CPU, +${Math.round((PSU_HEADROOM_MULTIPLIER - 1) * 100)}% headroom`,
      }
}

/** PSU can supply enough total power. */
export function checkPsuWattage(gpu: Gpu, psu: Psu, cpu?: Cpu | null): CheckResult {
  const id = 'psu-wattage'
  if (psu.ratedWatts === null) {
    return { id, status: 'unknown', message: "This PSU's wattage isn't listed." }
  }

  const need = requiredPsuWatts(gpu, cpu?.tdpWatts ?? null)
  if (!need) {
    return {
      id,
      status: 'unknown',
      message: `Power draw for the ${gpu.model} isn't in our data yet, so we can't check this.`,
    }
  }

  const assumed = !cpu ? ` Assumes a ${ASSUMED_CPU_WATTS}W CPU.` : ''
  const detail = `Needs about ${need.watts}W (${need.basis}); this PSU supplies ${psu.ratedWatts}W.${assumed}`

  return psu.ratedWatts >= need.watts
    ? { id, status: 'pass', message: `Enough power for the ${gpu.model}.`, detail }
    : {
        id,
        status: 'fail',
        message: `Not enough power — the ${gpu.model} needs about ${need.watts}W.`,
        detail,
      }
}

/** How many 8-pin PCIe leads a PSU offers. */
function countEightPin(connectors: Psu['connectors']): number {
  if (!connectors) return 0
  return connectors.reduce((n, c) => n + (c === '8pin' ? 1 : c === '2x8pin' ? 2 : 0), 0)
}

/**
 * PSU can physically drive the card.
 *
 * A 12VHPWR / 12V-2x6 card counts as satisfied when the PSU has enough 8-pin
 * leads, because those cards ship with an adapter in the box. The result says
 * so rather than quietly passing.
 */
export function checkGpuPowerConnector(gpu: Gpu, psu: Psu): CheckResult {
  const id = 'gpu-connector'

  if (gpu.powerConnector === null) {
    return {
      id,
      status: 'unknown',
      message: `We don't have the power connector for the ${gpu.model} yet.`,
    }
  }
  if (psu.connectors === null || psu.connectors.length === 0) {
    return {
      id,
      status: 'unknown',
      message: "This PSU's connectors aren't listed, so we can't verify the fit.",
      detail: `The ${gpu.model} needs ${describeConnector(gpu.powerConnector)}.`,
    }
  }

  const eightPin = countEightPin(psu.connectors)
  const hasNative = psu.connectors.includes(gpu.powerConnector)
  const need = describeConnector(gpu.powerConnector)

  if (hasNative) {
    return { id, status: 'pass', message: `Connector fits — this PSU has ${need} natively.` }
  }

  switch (gpu.powerConnector) {
    case '8pin':
      return eightPin >= 1
        ? { id, status: 'pass', message: 'Connector fits.' }
        : { id, status: 'fail', message: 'This PSU has no 8-pin PCIe connector.' }
    case '2x8pin':
      return eightPin >= 2
        ? { id, status: 'pass', message: 'Connector fits.' }
        : {
            id,
            status: 'fail',
            message: `The ${gpu.model} needs two 8-pin connectors; this PSU has ${eightPin}.`,
          }
    case '12vhpwr':
    case '12v-2x6':
      // Cards using these ship with an 8-pin adapter; three leads is the usual
      // requirement for the higher-power ones, but two is the documented floor.
      return eightPin >= 2
        ? {
            id,
            status: 'warn',
            message: 'Fits using the adapter supplied with the card.',
            detail: `No native ${need} on this PSU, but it has ${eightPin}x 8-pin, which the bundled adapter uses.`,
          }
        : {
            id,
            status: 'fail',
            message: `The ${gpu.model} needs ${need}, and this PSU cannot supply it.`,
            detail: `No native ${need} and only ${eightPin}x 8-pin, too few for the bundled adapter.`,
          }
  }
}

function describeConnector(c: NonNullable<Gpu['powerConnector']>): string {
  switch (c) {
    case '8pin':
      return 'one 8-pin'
    case '2x8pin':
      return 'two 8-pin'
    case '12vhpwr':
      return 'a 12VHPWR'
    case '12v-2x6':
      return 'a 12V-2x6 (16-pin)'
  }
}

/** CPU physically fits the board. */
export function checkCpuSocket(cpu: Cpu, mb: Motherboard): CheckResult {
  const id = 'cpu-socket'
  if (!cpu.socket || !mb.socket) {
    return { id, status: 'unknown', message: "Socket isn't listed for one of these parts." }
  }
  return cpu.socket.toUpperCase() === mb.socket.toUpperCase()
    ? { id, status: 'pass', message: `Both are ${cpu.socket}.` }
    : {
        id,
        status: 'fail',
        message: `Different sockets — the CPU is ${cpu.socket}, the board is ${mb.socket}.`,
      }
}

/** Memory generation matches the board. */
export function checkRamType(ram: Ram, mb: Motherboard): CheckResult {
  const id = 'ram-type'
  if (!ram.ramType || !mb.ramType) {
    return { id, status: 'unknown', message: "Memory type isn't listed for one of these parts." }
  }
  return ram.ramType === mb.ramType
    ? { id, status: 'pass', message: `Both are ${ram.ramType}.` }
    : {
        id,
        status: 'fail',
        message: `${ram.ramType} memory will not fit a ${mb.ramType} board.`,
      }
}

/** Kit fits the board's slots and capacity ceiling. */
export function checkRamFits(ram: Ram, mb: Motherboard): CheckResult {
  const id = 'ram-fits'
  if (ram.modules === null || mb.ramSlots === null) {
    return { id, status: 'unknown', message: "Slot count isn't listed for one of these parts." }
  }
  if (ram.modules > mb.ramSlots) {
    return {
      id,
      status: 'fail',
      message: `This kit has ${ram.modules} sticks but the board has ${mb.ramSlots} slots.`,
    }
  }
  if (ram.capacityGb !== null && mb.maxRamGb !== null && ram.capacityGb > mb.maxRamGb) {
    return {
      id,
      status: 'fail',
      message: `${ram.capacityGb}GB exceeds the board's ${mb.maxRamGb}GB maximum.`,
    }
  }
  return { id, status: 'pass', message: 'Fits the board.' }
}

/**
 * Memory speed against the board.
 *
 * Deliberately soft. Faster memory than the board rates still works — it runs
 * at the slower speed unless XMP/EXPO is enabled — so flagging it red would
 * steer buyers away from parts that are fine.
 */
export function checkRamSpeed(ram: Ram, mb: Motherboard): CheckResult {
  const id = 'ram-speed'
  if (ram.speedMhz === null || mb.maxSupportedSpeedMhz === null) {
    return { id, status: 'unknown', message: "Memory speed isn't listed for one of these parts." }
  }
  return ram.speedMhz > mb.maxSupportedSpeedMhz
    ? {
        id,
        status: 'warn',
        message: `Compatible — runs at the board's ${mb.maxSupportedSpeedMhz}MHz unless XMP/EXPO is enabled.`,
      }
    : { id, status: 'pass', message: `Runs at its rated ${ram.speedMhz}MHz.` }
}

/** Every GPU↔PSU check, in the order a buyer cares about. */
export function checkGpuAgainstPsu(gpu: Gpu, psu: Psu, cpu?: Cpu | null): CheckResult[] {
  return [checkPsuWattage(gpu, psu, cpu), checkGpuPowerConnector(gpu, psu)]
}

/**
 * Roll several checks into one verdict.
 *
 * `fail` beats everything, and `unknown` beats `pass`: a pairing we cannot fully
 * verify must not be presented as verified.
 */
export function overallStatus(results: CheckResult[]): CheckStatus {
  if (results.some((r) => r.status === 'fail')) return 'fail'
  if (results.some((r) => r.status === 'unknown')) return 'unknown'
  if (results.some((r) => r.status === 'warn')) return 'warn'
  return 'pass'
}
