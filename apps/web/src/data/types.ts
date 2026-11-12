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
  /** 1–20 rating from the active benchmark set; null when the rider has none for the attribute. */
  rating: number | null
  confidence: Confidence
  /** Rating change over the last 28 days; null without a rating 28 days ago. */
  change28d: number | null
  /** Underlying value in the attribute's unit (W/kg, retained %, mL/kg/min); null when not measured. */
  value: number | null
}

export interface CaPa {
  ca: number
  /** PA band; null until PA is calculated (TODO 7.4). */
  paP10: number | null
  paP50: number | null
  paP90: number | null
  /** CA one year ahead, without the PA floor (KB §8); null until PA is calculated. */
  ca12mP50: number | null
  typeProbs: Record<RiderType, number>
  modelVersion: string
}

export type PowerWindow = 'season' | '84d' | '42d'

export interface PowerCurve {
  window: PowerWindow
  secs: number[]
  watts: number[]
  /** Null when intervals.icu knew no weight for the window. */
  wkg: number[] | null
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
  // Null until there is data: load comes from wellness, compliance from planned workouts (TODO 5.5).
  ctl: number | null
  atl: number | null
  tsb: number | null
  rampRate: number | null
  compliance12wPct: number | null
  indoorPct: number | null
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
  /** Null until the load projection exists (TODO 7.5). */
  projectedTsb: number | null
}

export interface FormSeries {
  /** 7-day rolling ln rMSSD, one value per day. */
  lnRmssd7d: DatedValue[]
  /** 60-day baseline of ln rMSSD. */
  /** Null without HRV data (not collected until legal sign-off, KB §11). */
  baselineMean: number | null
  baselineSd: number | null
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
  // From rider_profiles; null until the coach enters them.
  dateOfBirth: string | null
  trainingAgeYears: number | null
  trainingAgeEnteredOn: string | null
  background: string | null
  primaryTypeOverride: RiderType | null
  cohort: RiderCohort
  /** HRV app and strap (KB §10). */
  hrvSource?: string | null
  contractEnd?: string | null
  /** Date the ratings and model outputs refer to. */
  asOf: string
  attributes: Record<AttributeId, AttributeRating>
  /** Null until the rider has all six power ratings (KB §7); PA inside it comes with TODO 7.4. */
  caPa: CaPa | null
  powerCurves: PowerCurve[]
  durability: DurabilityPoint[]
  labTests: LabTest[]
  training: TrainingSummary
  readiness: ReadinessSummary
  form: FormSeries
  notes: RiderNote[]
}

/** Outcome of a nightly sync run (v_sync_last_run.outcome). */
export type SyncOutcome = 'running' | 'succeeded' | 'partial' | 'failed' | 'stalled'

/** The latest nightly sync run, shaped after v_sync_last_run. */
export interface SyncRun {
  id: number
  outcome: SyncOutcome
  /** ISO timestamps. */
  startedAt: string
  finishedAt: string | null
  apiCalls: number | null
  errorCount: number
  errors: { athleteId: string | null; step: string; message: string }[]
}

/** One active rider's sync state, shaped after v_sync_health. */
export interface RiderSyncHealth {
  athleteId: string
  name: string
  /** ISO timestamp of the last nightly run that synced this rider without an error. */
  lastSuccessAt: string | null
  /** No clean sync in the last 48 hours. */
  stale: boolean
}

export interface SyncHealth {
  lastRun: SyncRun | null
  riders: RiderSyncHealth[]
}
