import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildPowerDraw,
  evaluateBuild,
  rankCandidates,
  suggestNextSlot,
  type Build,
  type BuildPart,
} from './build'

/**
 * The behaviour that matters here is partial builds. A configurator spends
 * almost all of its life incomplete, so "not decided yet" has to stay clearly
 * separate from "incompatible" and from "we don't know".
 */

const cpu = (over: Partial<BuildPart> = {}): BuildPart => ({
  partId: 'r5-7600',
  category: 'cpu',
  brand: 'AMD',
  model: 'Ryzen 5 7600',
  socket: 'AM5',
  ramType: 'DDR5',
  tdpWatts: 65,
  ...over,
})

const board = (over: Partial<BuildPart> = {}): BuildPart => ({
  partId: 'b650m',
  category: 'motherboard',
  brand: 'MSI',
  model: 'B650M',
  socket: 'AM5',
  ramType: 'DDR5',
  ramSlots: 4,
  maxRamGb: 128,
  maxSupportedSpeedMhz: 6000,
  ...over,
})

const ram = (over: Partial<BuildPart> = {}): BuildPart => ({
  partId: 'ddr5-32-6000',
  category: 'ram',
  brand: 'Corsair',
  model: '32GB DDR5 6000',
  ramType: 'DDR5',
  speedMhz: 6000,
  capacityGb: 32,
  modules: 2,
  ...over,
})

const gpu = (over: Partial<BuildPart> = {}): BuildPart => ({
  partId: 'rtx-5070-12gb',
  category: 'gpu',
  brand: 'Nvidia',
  model: 'RTX 5070 12GB',
  tdpWatts: 250,
  powerConnector: '12v-2x6',
  ...over,
})

const psu = (over: Partial<BuildPart> = {}): BuildPart => ({
  partId: 'psu-750',
  category: 'psu',
  brand: 'Corsair',
  model: 'RM750e',
  ratedWatts: 750,
  connectors: ['8pin', '8pin', '8pin', '12v-2x6'],
  ...over,
})

describe('evaluateBuild on partial builds', () => {
  it('reports nothing as wrong when the build is empty', () => {
    const r = evaluateBuild({})
    assert.equal(r.checks.length, 0)
    assert.equal(r.pending.length, 0)
    assert.equal(r.status, 'pass')
    assert.deepEqual(r.empty.length, 5)
  })

  it('treats a missing counterpart as pending, not as a failure', () => {
    const r = evaluateBuild({ cpu: cpu() })
    assert.equal(r.checks.filter((c) => c.status === 'fail').length, 0)
    const socket = r.pending.find((p) => p.id === 'cpu-socket')
    assert.ok(socket, 'socket check should be pending')
    assert.deepEqual(socket!.needs, ['motherboard'])
  })

  it('runs the socket check once both parts are present', () => {
    assert.equal(
      evaluateBuild({ cpu: cpu(), motherboard: board() }).checks.find((c) => c.id === 'cpu-socket')
        ?.status,
      'pass',
    )
    assert.equal(
      evaluateBuild({ cpu: cpu(), motherboard: board({ socket: 'LGA1700' }) }).checks.find(
        (c) => c.id === 'cpu-socket',
      )?.status,
      'fail',
    )
  })

  it('catches a memory generation mismatch across the build', () => {
    const r = evaluateBuild({ cpu: cpu(), motherboard: board(), ram: ram({ ramType: 'DDR4' }) })
    assert.equal(r.status, 'fail')
    assert.ok(r.checks.some((c) => c.id === 'ram-type' && c.status === 'fail'))
  })

  it('sums the chosen listings and counts what is still unpriced', () => {
    const r = evaluateBuild({
      cpu: cpu({ shop: 'nanotek.lk', priceLkr: 80_000 }),
      gpu: gpu({ shop: 'gamestreet.lk', priceLkr: 297_000 }),
      psu: psu(),
    })
    assert.equal(r.totalLkr, 377_000)
    assert.equal(r.pricedSlots, 2)
    assert.deepEqual(r.awaitingShop, ['psu'])
  })
})

describe('power across a build rather than one card', () => {
  it('assumes a processor when none is chosen yet, rather than ignoring it', () => {
    const withAssumed = buildPowerDraw({ gpu: gpu({ recommendedPsuWatts: null }) })
    assert.match(withAssumed!.basis, /assumed processor/)
    // (250 + 95) * 1.3 = 448.5 -> 450
    assert.equal(withAssumed!.watts, 450)
  })

  it('uses the real processor once one is chosen', () => {
    const r = buildPowerDraw({ gpu: gpu({ recommendedPsuWatts: null }), cpu: cpu({ tdpWatts: 170 }) })
    // (250 + 170) * 1.3 = 546 -> 550
    assert.equal(r!.watts, 550)
    assert.match(r!.basis, /170W processor/)
  })

  it('answers for a processor-only build', () => {
    const r = buildPowerDraw({ cpu: cpu({ tdpWatts: 65 }) })
    assert.equal(r!.watts, 90)
  })

  it('returns null when nothing has a published draw', () => {
    assert.equal(buildPowerDraw({ gpu: gpu({ tdpWatts: null, recommendedPsuWatts: null }) }), null)
  })

  it('fails a supply that cannot carry the whole build', () => {
    const r = evaluateBuild({
      gpu: gpu({ recommendedPsuWatts: null }),
      cpu: cpu({ tdpWatts: 250 }),
      psu: psu({ ratedWatts: 600 }),
    })
    assert.equal(r.checks.find((c) => c.id === 'psu-wattage')?.status, 'fail')
  })
})

describe('rankCandidates', () => {
  const boards = [board({ partId: 'am5', socket: 'AM5' }), board({ partId: 'lga', socket: 'LGA1700' })]

  it('separates what fits from what does not, with a reason', () => {
    const ranked = rankCandidates({ cpu: cpu() }, 'motherboard', boards)
    const am5 = ranked.find((r) => r.part.partId === 'am5')!
    const lga = ranked.find((r) => r.part.partId === 'lga')!

    assert.equal(am5.status, 'pass')
    assert.equal(am5.blockedBy, null)
    assert.equal(lga.status, 'fail')
    assert.match(lga.blockedBy!, /socket/i)
  })

  it('does not condemn candidates for a conflict elsewhere in the build', () => {
    // The memory is wrong for the board, but that must not make every power
    // supply look broken.
    const broken: Build = { cpu: cpu(), motherboard: board(), ram: ram({ ramType: 'DDR4' }) }
    const ranked = rankCandidates(broken, 'psu', [psu()])
    assert.notEqual(ranked[0].status, 'fail')
  })

  it('judges against everything chosen so far, not just one part', () => {
    // The same 500W supply has to change verdict as the build grows around it.
    const card = gpu({ recommendedPsuWatts: null })
    const supply = psu({ ratedWatts: 500 })

    // Card alone: (250 + 95 assumed) * 1.3 = 450W, so 500W is enough.
    assert.equal(rankCandidates({ gpu: card }, 'psu', [supply])[0].status, 'pass')

    // Add a 250W processor: (250 + 250) * 1.3 = 650W, and it no longer is.
    const withCpu = rankCandidates({ gpu: card, cpu: cpu({ tdpWatts: 250 }) }, 'psu', [supply])
    assert.equal(withCpu[0].status, 'fail')
    assert.match(withCpu[0].blockedBy!, /650W/)
  })
})

describe('suggestNextSlot', () => {
  it('asks for a power supply after a card is chosen — the prompt the product promises', () => {
    const s = suggestNextSlot({ gpu: gpu() })
    assert.equal(s?.slot, 'psu')
    assert.match(s!.message, /RTX 5070/)
  })

  it('asks for the card before the supply, since the supply depends on it', () => {
    // A supply chosen against a bare processor is sized for a draw that is
    // about to change, and will usually be too small once a card goes in.
    const partial: Build = { cpu: cpu(), motherboard: board(), ram: ram() }
    assert.equal(suggestNextSlot(partial)?.slot, 'gpu')
    assert.equal(suggestNextSlot({ ...partial, gpu: gpu() })?.slot, 'psu')
  })

  it('opens on the processor for an empty build', () => {
    assert.equal(suggestNextSlot({})?.slot, 'cpu')
  })

  it('asks for a board after a processor', () => {
    assert.equal(suggestNextSlot({ cpu: cpu() })?.slot, 'motherboard')
  })

  it('asks for memory once a board is chosen', () => {
    assert.equal(suggestNextSlot({ cpu: cpu(), motherboard: board() })?.slot, 'ram')
  })

  it('returns null when every slot is filled', () => {
    assert.equal(
      suggestNextSlot({ cpu: cpu(), motherboard: board(), ram: ram(), gpu: gpu(), psu: psu() }),
      null,
    )
  })
})
