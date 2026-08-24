import {
  ASSUMED_CPU_WATTS,
  PSU_HEADROOM_MULTIPLIER,
  checkCpuSocket,
  checkGpuPowerConnector,
  checkRamFits,
  checkRamSpeed,
  checkRamType,
  overallStatus,
  type CheckResult,
  type CheckStatus,
  type Cpu,
  type Gpu,
  type Motherboard,
  type Psu,
  type Ram,
} from './rules'

/**
 * Build-level compatibility.
 *
 * The pairwise checks in rules.ts answer "do these two work together". A build
 * is a different question: given a partial set of choices, what still fits, and
 * what is not yet decided. Compatibility is a network rather than a pair — a CPU
 * constrains the board, the board constrains the memory, and CPU and GPU
 * together constrain the supply — so the checks have to be evaluated over
 * whatever is present rather than two parts at a time.
 *
 * Everything here is pure and deterministic. Nothing queries, nothing calls a
 * model. Given the same build it always returns the same verdict, which is the
 * only defensible way to tell someone their parts will work.
 */

export type BuildSlot = 'cpu' | 'motherboard' | 'ram' | 'gpu' | 'psu'

export const BUILD_SLOTS: BuildSlot[] = ['cpu', 'motherboard', 'ram', 'gpu', 'psu']

export const SLOT_LABEL: Record<BuildSlot, string> = {
  cpu: 'processor',
  motherboard: 'motherboard',
  ram: 'memory',
  gpu: 'graphics card',
  psu: 'power supply',
}

/**
 * A part in a build, together with where it is being bought.
 *
 * The shop belongs here rather than alongside: the point of the product is that
 * you can take each part from whichever shop is cheapest, so a slot is only
 * fully decided once both the part and the seller are.
 */
export type BuildPart = {
  partId: string
  category: BuildSlot
  brand: string
  model: string

  /** Chosen seller. Absent means a part is picked but no shop yet. */
  shop?: string | null
  priceLkr?: number | null

  // Specs, mirroring the parts table. Which apply depends on the category.
  tdpWatts?: number | null
  recommendedPsuWatts?: number | null
  powerConnector?: Gpu['powerConnector']
  socket?: string | null
  ramType?: 'DDR4' | 'DDR5' | null
  ramSlots?: number | null
  maxRamGb?: number | null
  maxSupportedSpeedMhz?: number | null
  speedMhz?: number | null
  capacityGb?: number | null
  modules?: number | null
  ratedWatts?: number | null
  connectors?: Psu['connectors']
}

export type Build = Partial<Record<BuildSlot, BuildPart>>

/**
 * A check that cannot run yet because a part is missing.
 *
 * Deliberately distinct from an `unknown` result. "Add a motherboard and we
 * will check the socket" is a step the buyer can take; "we don't have this
 * PSU's connector list" is a gap in our data they can do nothing about.
 * Collapsing the two would make the app look broken when it is merely waiting.
 */
export type PendingCheck = {
  id: string
  /** What to add to unblock it. */
  needs: BuildSlot[]
  message: string
}

export type BuildReport = {
  status: CheckStatus
  checks: CheckResult[]
  pending: PendingCheck[]
  /** Slots with a part but no shop chosen yet. */
  awaitingShop: BuildSlot[]
  filled: BuildSlot[]
  empty: BuildSlot[]
  /** Sum of the chosen listings, and how much of the build it covers. */
  totalLkr: number
  pricedSlots: number
}

// --- adapters: a build part is a database row shape, the rules want narrow ones

const asCpu = (p: BuildPart): Cpu => ({
  model: p.model,
  socket: p.socket ?? null,
  tdpWatts: p.tdpWatts ?? null,
  ramType: p.ramType ?? null,
})

const asMotherboard = (p: BuildPart): Motherboard => ({
  model: p.model,
  socket: p.socket ?? null,
  ramType: p.ramType ?? null,
  ramSlots: p.ramSlots ?? null,
  maxRamGb: p.maxRamGb ?? null,
  maxSupportedSpeedMhz: p.maxSupportedSpeedMhz ?? null,
})

const asRam = (p: BuildPart): Ram => ({
  model: p.model,
  ramType: p.ramType ?? null,
  speedMhz: p.speedMhz ?? null,
  capacityGb: p.capacityGb ?? null,
  modules: p.modules ?? null,
})

const asGpu = (p: BuildPart): Gpu => ({
  model: p.model,
  tdpWatts: p.tdpWatts ?? null,
  recommendedPsuWatts: p.recommendedPsuWatts ?? null,
  powerConnector: p.powerConnector ?? null,
})

const asPsu = (p: BuildPart): Psu => ({
  model: p.model,
  ratedWatts: p.ratedWatts ?? null,
  connectors: p.connectors ?? null,
})

/**
 * Power the chosen components need.
 *
 * Unlike the pairwise version this sums whatever is actually in the build, so a
 * CPU-only build still gets an answer. A missing CPU is assumed rather than
 * ignored — leaving it out entirely would understate the requirement, and this
 * rule is only allowed to err strict.
 */
export function buildPowerDraw(build: Build): {
  watts: number
  basis: string
} | null {
  const gpu = build.gpu
  const cpu = build.cpu

  const gpuWatts = gpu?.tdpWatts ?? null
  const cpuWatts = cpu?.tdpWatts ?? null
  if (gpuWatts === null && cpuWatts === null) return null

  const assumedCpu = cpuWatts === null && gpu !== undefined
  const cpuPart = cpuWatts ?? (assumedCpu ? ASSUMED_CPU_WATTS : 0)
  const summed = (gpuWatts ?? 0) + cpuPart

  const computed = Math.ceil((summed * PSU_HEADROOM_MULTIPLIER) / 10) * 10
  const parts = [
    gpuWatts !== null ? `${gpuWatts}W graphics card` : null,
    cpuWatts !== null ? `${cpuWatts}W processor` : assumedCpu ? `${ASSUMED_CPU_WATTS}W assumed processor` : null,
  ].filter(Boolean)

  const headroomPct = Math.round((PSU_HEADROOM_MULTIPLIER - 1) * 100)
  const computedBasis = `${parts.join(' + ')}, +${headroomPct}% headroom`

  // A manufacturer figure only covers its own card, so it wins only when it is
  // the larger number.
  const recommended = gpu?.recommendedPsuWatts ?? null
  if (recommended !== null && recommended >= computed) {
    return { watts: recommended, basis: "the card maker's recommendation" }
  }
  return { watts: computed, basis: computedBasis }
}

/** Power-supply check across the whole build rather than one card. */
export function checkBuildPower(build: Build): CheckResult | null {
  const psu = build.psu
  if (!psu) return null

  const id = 'psu-wattage'
  if (psu.ratedWatts == null) {
    return { id, status: 'unknown', message: "This supply's wattage isn't listed." }
  }

  const need = buildPowerDraw(build)
  if (!need) {
    return {
      id,
      status: 'unknown',
      message: "Power draw for the chosen parts isn't in our data yet.",
    }
  }

  const detail = `Needs about ${need.watts}W (${need.basis}); this supply provides ${psu.ratedWatts}W.`
  return psu.ratedWatts >= need.watts
    ? { id, status: 'pass', message: 'Enough power for this build.', detail }
    : {
        id,
        status: 'fail',
        message: `Not enough power — this build needs about ${need.watts}W.`,
        detail,
      }
}

/**
 * Every check that can run against the current build, plus what is still
 * waiting on a part.
 */
export function evaluateBuild(build: Build): BuildReport {
  const checks: CheckResult[] = []
  const pending: PendingCheck[] = []

  const { cpu, motherboard, ram, gpu, psu } = build

  // CPU ↔ motherboard
  if (cpu && motherboard) checks.push(checkCpuSocket(asCpu(cpu), asMotherboard(motherboard)))
  else if (cpu || motherboard) {
    pending.push({
      id: 'cpu-socket',
      needs: cpu ? ['motherboard'] : ['cpu'],
      message: cpu
        ? 'Add a motherboard and we’ll check the socket matches.'
        : 'Add a processor and we’ll check the socket matches.',
    })
  }

  // RAM ↔ motherboard
  if (ram && motherboard) {
    checks.push(
      checkRamType(asRam(ram), asMotherboard(motherboard)),
      checkRamFits(asRam(ram), asMotherboard(motherboard)),
      checkRamSpeed(asRam(ram), asMotherboard(motherboard)),
    )
  } else if (ram || motherboard) {
    pending.push({
      id: 'ram-fit',
      needs: ram ? ['motherboard'] : ['ram'],
      message: ram
        ? 'Add a motherboard and we’ll check the memory fits.'
        : 'Add memory and we’ll check it fits the board.',
    })
  }

  // Power
  const power = checkBuildPower(build)
  if (power) checks.push(power)
  else if (gpu || cpu) {
    pending.push({
      id: 'psu-wattage',
      needs: ['psu'],
      message: 'Add a power supply and we’ll work out whether it can run this.',
    })
  }

  // GPU ↔ PSU connector
  if (gpu && psu) checks.push(checkGpuPowerConnector(asGpu(gpu), asPsu(psu)))

  const filled = BUILD_SLOTS.filter((s) => build[s])
  const empty = BUILD_SLOTS.filter((s) => !build[s])
  const awaitingShop = filled.filter((s) => !build[s]?.shop)

  const priced = filled.filter((s) => (build[s]?.priceLkr ?? 0) > 0)
  const totalLkr = priced.reduce((sum, s) => sum + (build[s]?.priceLkr ?? 0), 0)

  return {
    status: overallStatus(checks),
    checks,
    pending,
    awaitingShop,
    filled,
    empty,
    totalLkr,
    pricedSlots: priced.length,
  }
}

export type CandidateVerdict<T extends BuildPart = BuildPart> = {
  part: T
  status: CheckStatus
  /** Only the checks this candidate participates in. */
  checks: CheckResult[]
  /** First hard conflict, for explaining why something was excluded. */
  blockedBy: string | null
}

/**
 * Judge each candidate for a slot against the rest of the build.
 *
 * This is the operation a configurator actually runs — not "are these two
 * compatible" but "given what I have chosen, what can I still buy". Candidates
 * are returned rather than filtered so the caller can decide whether to hide
 * conflicts or show them greyed out with a reason.
 */
export function rankCandidates<T extends BuildPart>(
  build: Build,
  slot: BuildSlot,
  candidates: T[],
): CandidateVerdict<T>[] {
  return candidates.map((candidate) => {
    const hypothetical: Build = { ...build, [slot]: candidate }
    const report = evaluateBuild(hypothetical)

    // Keep only the checks the candidate is actually involved in, so a broken
    // choice elsewhere in the build does not condemn every option here.
    const relevant = report.checks.filter((c) => CHECKS_BY_SLOT[slot].includes(c.id))
    const failed = relevant.find((c) => c.status === 'fail')

    return {
      part: candidate,
      status: overallStatus(relevant),
      checks: relevant,
      blockedBy: failed?.message ?? null,
    }
  })
}

/** Which checks a given slot participates in. */
const CHECKS_BY_SLOT: Record<BuildSlot, string[]> = {
  cpu: ['cpu-socket', 'psu-wattage'],
  motherboard: ['cpu-socket', 'ram-type', 'ram-fits', 'ram-speed'],
  ram: ['ram-type', 'ram-fits', 'ram-speed'],
  gpu: ['psu-wattage', 'gpu-connector'],
  psu: ['psu-wattage', 'gpu-connector'],
}

export type Suggestion = {
  slot: BuildSlot
  /** Written for the buyer, naming what prompted it. */
  message: string
}

/**
 * The most useful part to choose next.
 *
 * Ordered by how much the existing choices already constrain the answer: once
 * there is a processor the board is nearly determined, and once there is a card
 * the supply is. Suggesting the most-constrained slot means the next screen is
 * a short, relevant list rather than the whole catalogue.
 */
export function suggestNextSlot(build: Build): Suggestion | null {
  const has = (s: BuildSlot) => Boolean(build[s])

  if (has('cpu') && !has('motherboard')) {
    return {
      slot: 'motherboard',
      message: `Find a motherboard that fits the ${build.cpu!.model}.`,
    }
  }
  if (has('motherboard') && !has('ram')) {
    return {
      slot: 'ram',
      message: `Find memory that works with the ${build.motherboard!.model}.`,
    }
  }
  if ((has('gpu') || has('cpu')) && !has('psu')) {
    const driver = build.gpu ?? build.cpu!
    return {
      slot: 'psu',
      message: `Find a power supply that can run the ${driver.model}.`,
    }
  }
  if (has('motherboard') && !has('cpu')) {
    return {
      slot: 'cpu',
      message: `Find a processor for the ${build.motherboard!.model}.`,
    }
  }
  if (has('psu') && !has('gpu')) {
    return { slot: 'gpu', message: 'Add a graphics card to this build.' }
  }

  const next = BUILD_SLOTS.find((s) => !has(s))
  return next ? { slot: next, message: `Add a ${SLOT_LABEL[next]}.` } : null
}

/**
 * What the app cannot check, stated plainly.
 *
 * Physical fit is the most common way a real build fails, and none of it is
 * published in the listings we read. Saying so is the honest alternative to a
 * silence that reads as approval.
 */
export const UNCHECKED_BY_DESIGN = [
  'Case clearance — whether the card and cooler physically fit',
  'Cooler compatibility — socket support and height',
  'Storage — connector type and available slots',
] as const
