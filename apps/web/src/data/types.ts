import type { Enums } from '@prolog/types'

// View models the dashboard reads. Shaped after the tables of KB §5 and the
// Phase 7 outputs (rider_ratings, rider_ca_pa), so mock fixtures and the
// future Supabase queries return the same thing.

export type RiderType = Enums<'rider_type'>
export type LabTestMethod = Enums<'lab_test_method'>
export type RiderCohort = Enums<'rider_cohort'>

export type PowerAttributeId = 'p5s' | 'p30s' | 'p1m' | 'p5m' | 'p20m' | 'p60m'
export type AttributeId = PowerAttributeId | 'durability' | 'vo2max'

export type Confidence = 'high' | 'low'

export interface AttributeRating {
  /** 1–20 rating from the active benchmark set. */
  rating: number
  confidence: Confidence
  /** Rating change over the last 28 days. */
  change28d: number
  /** Underlying value in the attribute's unit (W/kg, retained %, mL/kg/min). */
  value: number
}

export interface CaPa {
  ca: number
  paP10: number
  paP50: number
  paP90: number
  /** CA one year ahead, without the PA floor (KB §8). */
  ca12mP50: number
  typeProbs: Record<RiderType, number>
  modelVersion: string
}

export type PowerWindow = 'season' | '84d' | '42d'

export interface PowerCurve {
  window: PowerWindow
  secs: number[]
  watts: number[]
  wkg: number[]
}

/** Best 5-min and 20-min W/kg, fresh (0) and after accumulated work. */
export interface DurabilityPoint {
  kjPerKg: 0 | 10 | 20 | 30
  p5mWkg: number
  p20mWkg: number
}

export interface LabTest {
  date: string
  method: LabTestMethod
  vo2maxMlKgMin: number | null
  vlamaxMmolLS: number | null
  fatmaxW: number | null
  carbmaxGH: number | null
  atW: number | null
  vo2maxLMin?: number | null
  fatmaxGH?: number | null
  weightKg?: number | null
  heightCm?: number | null
  bodyFatPct?: number | null
  tester?: string | null
  notes?: string | null
}

export interface Anthropometric {
  athleteId: string
  date: string
  heightCm: number | null
  weightKg: number | null
  bodyFatPct: number | null
  notes: string | null
}

export interface TrainingSummary {
  ctl: number
  atl: number
  tsb: number
  rampRate: number
  compliance12wPct: number
  indoorPct: number
  rides84d: number
}

export type ReadinessLight = 'green' | 'amber' | 'red' | 'grey'

export interface ReadinessSummary {
  light: ReadinessLight
  reasons: string[]
  /** z-score of 7-day ln rMSSD against the rider's 60-day baseline. */
  lnRmssdZ: number | null
  restingHrDeltaBpm: number | null
  sleepHours: number | null
}

export interface DatedValue {
  date: string
  value: number
}

export interface UpcomingRace {
  name: string
  date: string
  /** Projected TSB on race day at planned load (KB §9 load projection). */
  projectedTsb: number
}

export interface FormSeries {
  /** 7-day rolling ln rMSSD, one value per day. */
  lnRmssd7d: DatedValue[]
  /** 60-day baseline of ln rMSSD. */
  baselineMean: number
  baselineSd: number
  /** HRV readings in the last 7 days; fewer than 3 means insufficient data (KB §9). */
  hrvReadings7d: number
  /** Weekly eFTP in W/kg. */
  eftpWkg: DatedValue[]
  nextRace: UpcomingRace | null
}

export interface RiderNote {
  date: string
  author: string
  text: string
}

export interface Rider {
  id: string
  name: string
  dateOfBirth: string
  trainingAgeYears: number
  trainingAgeEnteredOn: string
  background: string
  primaryTypeOverride: RiderType | null
  cohort: RiderCohort
  /** HRV app and strap (KB §10). */
  hrvSource?: string | null
  contractEnd?: string | null
  /** Date the ratings and model outputs refer to. */
  asOf: string
  attributes: Record<AttributeId, AttributeRating>
  caPa: CaPa
  powerCurves: PowerCurve[]
  durability: DurabilityPoint[]
  labTests: LabTest[]
  training: TrainingSummary
  readiness: ReadinessSummary
  form: FormSeries
  notes: RiderNote[]
}
