import type { RiderType } from '@/data/types.ts'

// Mock stand-ins for the 2.7 seed tables, values exactly as in the KB. Read
// these from benchmark_sets, ca_weights and model_priors once they are seeded.

export const MOCK_BENCHMARK_SETS = [
  { id: 'female-pro-coggan-v1', name: 'Female Pro + Coggan Provisional (v1)' },
] as const

export type CaWeightAttribute =
  'p5s' | 'p30s' | 'p1m' | 'p5m' | 'p20m' | 'p60m' | 'durability' | 'vo2max'

/** KB §7 CA weights in per cent; each type's column sums to 100. Durability is fixed at 25. */
export const MOCK_CA_WEIGHTS: Record<CaWeightAttribute, Record<RiderType, number>> = {
  p5s: { sprinter: 25, puncheur: 10, climber: 0, rouleur_tt: 5, all_rounder: 8 },
  p30s: { sprinter: 15, puncheur: 10, climber: 5, rouleur_tt: 5, all_rounder: 8 },
  p1m: { sprinter: 15, puncheur: 20, climber: 5, rouleur_tt: 5, all_rounder: 12 },
  p5m: { sprinter: 5, puncheur: 20, climber: 20, rouleur_tt: 10, all_rounder: 15 },
  p20m: { sprinter: 5, puncheur: 5, climber: 25, rouleur_tt: 25, all_rounder: 15 },
  p60m: { sprinter: 5, puncheur: 5, climber: 15, rouleur_tt: 20, all_rounder: 12 },
  durability: { sprinter: 25, puncheur: 25, climber: 25, rouleur_tt: 25, all_rounder: 25 },
  vo2max: { sprinter: 5, puncheur: 5, climber: 5, rouleur_tt: 5, all_rounder: 5 },
}

export interface PaPrior {
  key: string
  label: string
  value: number
  unit: string
  source: 'prior' | 'source'
}

/** KB §8 PA priors (v1). Scalars only; the age-taper shape and caps live with the model. */
export const MOCK_PA_PRIORS: PaPrior[] = [
  {
    key: 'peak_age.sprinter',
    label: 'Peak Age: Sprinter',
    value: 28.7,
    unit: 'years',
    source: 'source',
  },
  {
    key: 'peak_age.all_rounder',
    label: 'Peak Age: All-Rounder',
    value: 27.0,
    unit: 'years',
    source: 'source',
  },
  {
    key: 'peak_age.climber',
    label: 'Peak Age: Climber',
    value: 27.0,
    unit: 'years',
    source: 'prior',
  },
  {
    key: 'peak_age.puncheur',
    label: 'Peak Age: Puncheur',
    value: 27.5,
    unit: 'years',
    source: 'prior',
  },
  {
    key: 'peak_age.rouleur_tt',
    label: 'Peak Age: Rouleur/TT',
    value: 28.5,
    unit: 'years',
    source: 'prior',
  },
  {
    key: 'peak_age.noise_sd',
    label: 'Peak Age Noise (SD)',
    value: 1.5,
    unit: 'years',
    source: 'prior',
  },
  {
    key: 'gain.g0_median',
    label: 'Annual Gain g0 (Median)',
    value: 0.1,
    unit: 'fraction',
    source: 'prior',
  },
  {
    key: 'gain.decay',
    label: 'Gain Decay per Training Year',
    value: 0.35,
    unit: '',
    source: 'prior',
  },
  {
    key: 'gain.g0_sigma_factor',
    label: 'g0 Lognormal Spread (×)',
    value: 1.5,
    unit: '',
    source: 'prior',
  },
  { key: 'cap.p5m_p60m', label: 'Gain Cap: 5–60 min', value: 20, unit: '%', source: 'prior' },
  { key: 'cap.p30s_p1m', label: 'Gain Cap: 30 s and 1 min', value: 12, unit: '%', source: 'prior' },
  { key: 'cap.p5s', label: 'Gain Cap: 5 s', value: 8, unit: '%', source: 'prior' },
  { key: 'cap.vo2max', label: 'Gain Cap: VO2max', value: 10, unit: '%', source: 'prior' },
]
