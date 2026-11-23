import { describe, expect, it } from 'vitest'
import { criticalPower, ftpFrom20Min } from './power-test.ts'

describe('ftpFrom20Min', () => {
  it('takes 95% of 20-min power with the KB §10 factor', () => {
    expect(ftpFrom20Min(260, 0.95)).toBeCloseTo(247, 10)
  })
})

describe('criticalPower', () => {
  it('fits two efforts exactly: 3 min at 330 W and 12 min at 250 W', () => {
    // Work: 59,400 J and 180,000 J. CP = 120,600 / 540 = 223.33 W; W′ = 59,400 − 223.33 × 180.
    const fit = criticalPower([
      { durationS: 180, power: 330 },
      { durationS: 720, power: 250 },
    ])
    expect(fit?.cp).toBeCloseTo(223.333, 3)
    expect(fit?.wPrime).toBeCloseTo(19_200, 6)
    expect(fit?.r2).toBeNull()
  })

  it('recovers CP and W′ from efforts on the model line, with R² 1', () => {
    // CP 240 W, W′ 18 kJ: power = 240 + 18,000 / t.
    const efforts = [180, 420, 720, 1200].map((t) => ({ durationS: t, power: 240 + 18_000 / t }))
    const fit = criticalPower(efforts)
    expect(fit?.cp).toBeCloseTo(240, 8)
    expect(fit?.wPrime).toBeCloseTo(18_000, 6)
    expect(fit?.r2).toBeCloseTo(1, 10)
  })

  it('reports a lower R² for noisy efforts', () => {
    const fit = criticalPower([
      { durationS: 180, power: 345 },
      { durationS: 420, power: 270 },
      { durationS: 720, power: 268 },
    ])
    expect(fit?.r2).toBeGreaterThan(0.99)
    expect(fit?.r2).toBeLessThan(1)
  })

  it('works on W/kg as well: CP in W/kg, W′ in J/kg', () => {
    const fit = criticalPower([
      { durationS: 180, power: 5.5 },
      { durationS: 720, power: 4.2 },
    ])
    expect(fit?.cp).toBeCloseTo((4.2 * 720 - 5.5 * 180) / 540, 10)
  })

  it('gives no model for fewer than two lengths or an impossible fit', () => {
    expect(criticalPower([{ durationS: 180, power: 330 }])).toBeNull()
    expect(
      criticalPower([
        { durationS: 180, power: 330 },
        { durationS: 180, power: 320 },
      ]),
    ).toBeNull()
    // Longer effort at higher power: W′ would be negative.
    expect(
      criticalPower([
        { durationS: 180, power: 250 },
        { durationS: 720, power: 300 },
      ]),
    ).toBeNull()
    // Work falling with time: CP would be negative.
    expect(
      criticalPower([
        { durationS: 180, power: 900 },
        { durationS: 720, power: 100 },
      ]),
    ).toBeNull()
  })
})
