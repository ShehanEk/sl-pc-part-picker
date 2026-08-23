import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ASSUMED_CPU_WATTS,
  checkCpuSocket,
  checkGpuAgainstPsu,
  checkGpuPowerConnector,
  checkPsuWattage,
  checkRamFits,
  checkRamSpeed,
  checkRamType,
  overallStatus,
  requiredPsuWatts,
  type Cpu,
  type Gpu,
  type Motherboard,
  type Psu,
  type Ram,
} from './rules'

/**
 * These rules answer a question with real-world consequences, so the cases that
 * matter most are the ones where a spec is missing: the answer must be
 * `unknown`, never a confident pass.
 */

const gpu = (over: Partial<Gpu> = {}): Gpu => ({
  model: 'RTX 5070 12GB',
  tdpWatts: 250,
  recommendedPsuWatts: null,
  powerConnector: '12v-2x6',
  ...over,
})

const psu = (over: Partial<Psu> = {}): Psu => ({
  model: 'Test 750W',
  ratedWatts: 750,
  connectors: ['8pin', '8pin'],
  ...over,
})

const mb = (over: Partial<Motherboard> = {}): Motherboard => ({
  model: 'Test B650',
  socket: 'AM5',
  ramType: 'DDR5',
  ramSlots: 4,
  maxRamGb: 128,
  maxSupportedSpeedMhz: 6000,
  ...over,
})

describe('requiredPsuWatts', () => {
  it('adds headroom to summed draw', () => {
    // (250 + 95) * 1.3 = 448.5 -> rounded up to the next 10
    assert.equal(requiredPsuWatts({ tdpWatts: 250, recommendedPsuWatts: null }, null)?.watts, 450)
  })

  it('prefers the manufacturer figure when it is higher', () => {
    const r = requiredPsuWatts({ tdpWatts: 250, recommendedPsuWatts: 650 }, null)
    assert.equal(r?.watts, 650)
    assert.match(r!.basis, /manufacturer/)
  })

  it('ignores the manufacturer figure when the computed one is higher', () => {
    // A heavy CPU pushes past what the card's maker assumed.
    const r = requiredPsuWatts({ tdpWatts: 450, recommendedPsuWatts: 850 }, 250)
    assert.equal(r?.watts, 910)
    assert.match(r!.basis, /headroom/)
  })

  it('returns null when it has nothing to work from', () => {
    assert.equal(requiredPsuWatts({ tdpWatts: null, recommendedPsuWatts: null }, null), null)
  })
})

describe('checkPsuWattage', () => {
  it('passes an ample supply', () => {
    assert.equal(checkPsuWattage(gpu(), psu()).status, 'pass')
  })

  it('fails an undersized supply', () => {
    assert.equal(checkPsuWattage(gpu(), psu({ ratedWatts: 400 })).status, 'fail')
  })

  it('is unknown when the GPU draw is missing, never a pass', () => {
    const r = checkPsuWattage(gpu({ tdpWatts: null, recommendedPsuWatts: null }), psu())
    assert.equal(r.status, 'unknown')
  })

  it('is unknown when the PSU rating is missing', () => {
    assert.equal(checkPsuWattage(gpu(), psu({ ratedWatts: null })).status, 'unknown')
  })

  it('uses the real CPU draw when one is supplied', () => {
    const heavy: Cpu = { model: 'Test', socket: 'AM5', tdpWatts: 250, ramType: 'DDR5' }
    // With the heavy CPU: (250 + 250) * 1.3 = 650W needed, so 600W is short.
    assert.equal(checkPsuWattage(gpu(), psu({ ratedWatts: 600 }), heavy).status, 'fail')
    // The same PSU is ample against the lighter assumed CPU: (250 + 95) * 1.3 = 450W.
    assert.equal(checkPsuWattage(gpu(), psu({ ratedWatts: 600 })).status, 'pass')
    assert.ok(ASSUMED_CPU_WATTS < 250)
  })

  it('passes exactly at the boundary', () => {
    const heavy: Cpu = { model: 'Test', socket: 'AM5', tdpWatts: 250, ramType: 'DDR5' }
    assert.equal(requiredPsuWatts({ tdpWatts: 250, recommendedPsuWatts: null }, 250)?.watts, 650)
    assert.equal(checkPsuWattage(gpu(), psu({ ratedWatts: 650 }), heavy).status, 'pass')
  })
})

describe('checkGpuPowerConnector', () => {
  it('passes on a native match', () => {
    const r = checkGpuPowerConnector(gpu({ powerConnector: '8pin' }), psu({ connectors: ['8pin'] }))
    assert.equal(r.status, 'pass')
  })

  it('fails when there are too few 8-pin leads', () => {
    const r = checkGpuPowerConnector(gpu({ powerConnector: '2x8pin' }), psu({ connectors: ['8pin'] }))
    assert.equal(r.status, 'fail')
  })

  it('warns rather than passes when a 16-pin card needs the bundled adapter', () => {
    const r = checkGpuPowerConnector(gpu({ powerConnector: '12v-2x6' }), psu({ connectors: ['8pin', '8pin'] }))
    assert.equal(r.status, 'warn')
    assert.match(r.detail ?? '', /adapter/)
  })

  it('passes a 16-pin card on a PSU with the native lead', () => {
    const r = checkGpuPowerConnector(gpu({ powerConnector: '12v-2x6' }), psu({ connectors: ['12v-2x6'] }))
    assert.equal(r.status, 'pass')
  })

  it('fails a 16-pin card when the PSU cannot even feed the adapter', () => {
    const r = checkGpuPowerConnector(gpu({ powerConnector: '12v-2x6' }), psu({ connectors: ['8pin'] }))
    assert.equal(r.status, 'fail')
  })

  it('is unknown — not pass — when the PSU has no connector list', () => {
    // This is the common case today: no PSU in the catalog has connector data.
    for (const connectors of [null, []] as Psu['connectors'][]) {
      const r = checkGpuPowerConnector(gpu(), psu({ connectors }))
      assert.equal(r.status, 'unknown')
    }
  })

  it('counts a 2x8pin entry as two leads', () => {
    const r = checkGpuPowerConnector(gpu({ powerConnector: '2x8pin' }), psu({ connectors: ['2x8pin'] }))
    assert.equal(r.status, 'pass')
  })
})

describe('overallStatus', () => {
  const r = (status: 'pass' | 'fail' | 'warn' | 'unknown') => ({ id: 'x', status, message: '' })

  it('lets a failure dominate', () => {
    assert.equal(overallStatus([r('pass'), r('fail'), r('unknown')]), 'fail')
  })

  it('ranks unknown above pass so unverified never reads as verified', () => {
    assert.equal(overallStatus([r('pass'), r('unknown')]), 'unknown')
  })

  it('reports warn only when everything else passed', () => {
    assert.equal(overallStatus([r('pass'), r('warn')]), 'warn')
  })

  it('passes when all checks pass', () => {
    assert.equal(overallStatus([r('pass'), r('pass')]), 'pass')
  })
})

describe('the current catalog state', () => {
  it('yields unknown overall for a real GPU against a PSU with no connector data', () => {
    // Every PSU in the catalog is in this state right now: wattage is known,
    // connectors are not. The pairing must not present as fully verified.
    const results = checkGpuAgainstPsu(gpu(), psu({ connectors: null }))
    assert.equal(results[0].status, 'pass')
    assert.equal(results[1].status, 'unknown')
    assert.equal(overallStatus(results), 'unknown')
  })
})

describe('cpu, board and memory rules', () => {
  const cpu: Cpu = { model: 'R5 7600', socket: 'AM5', tdpWatts: 65, ramType: 'DDR5' }
  const ram: Ram = { model: 'Kit', ramType: 'DDR5', speedMhz: 6000, capacityGb: 32, modules: 2 }

  it('matches sockets case-insensitively', () => {
    assert.equal(checkCpuSocket(cpu, mb({ socket: 'am5' })).status, 'pass')
    assert.equal(checkCpuSocket(cpu, mb({ socket: 'LGA1700' })).status, 'fail')
  })

  it('rejects the wrong memory generation', () => {
    assert.equal(checkRamType(ram, mb({ ramType: 'DDR4' })).status, 'fail')
    assert.equal(checkRamType(ram, mb()).status, 'pass')
  })

  it('rejects a kit with more sticks than slots, or over the capacity ceiling', () => {
    assert.equal(checkRamFits({ ...ram, modules: 4 }, mb({ ramSlots: 2 })).status, 'fail')
    assert.equal(checkRamFits({ ...ram, capacityGb: 256 }, mb({ maxRamGb: 128 })).status, 'fail')
    assert.equal(checkRamFits(ram, mb()).status, 'pass')
  })

  it('treats memory faster than the board as a warning, not a failure', () => {
    const r = checkRamSpeed({ ...ram, speedMhz: 7200 }, mb({ maxSupportedSpeedMhz: 6000 }))
    assert.equal(r.status, 'warn')
    assert.match(r.message, /XMP|EXPO/)
  })

  it('is unknown when a spec is missing', () => {
    assert.equal(checkCpuSocket({ ...cpu, socket: null }, mb()).status, 'unknown')
    assert.equal(checkRamSpeed({ ...ram, speedMhz: null }, mb()).status, 'unknown')
  })
})
