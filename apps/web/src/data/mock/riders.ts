import type { PowerCurve, PowerWindow, Rider } from '@/data/types.ts'

// Two synthetic riders for building views before sync and models exist.
// Names are placeholders. Values are plausible for the squad (KB §2); the
// ratings, rider type and CA were worked out by hand from the KB formulas so
// the views show consistent numbers:
//   ratings  KB §6 "Female Pro + Coggan provisional" (z-score or anchors)
//   type     KB §7 shape prototypes, softmax with τ = 4
//   CA       KB §7 weight matrix, low-confidence attributes at 50%
// PA bands are illustrative, not simulated. Replace with Supabase reads once
// rider_ratings and rider_ca_pa are populated (Phase 7).

export const MOCK_AS_OF = '2026-10-19'

const CURVE_SECS = [1, 5, 10, 15, 30, 60, 120, 180, 300, 600, 1200, 1800, 3600]

function curve(
  window: PowerWindow,
  wkg84d: number[],
  factor: number,
  weightKg: number,
): PowerCurve {
  const wkg = wkg84d.map((v) => Math.round(v * factor * 100) / 100)
  return { window, secs: CURVE_SECS, wkg, watts: wkg.map((v) => Math.round(v * weightKg)) }
}

function curves(wkg84d: number[], seasonFactor: number, factor42d: number, weightKg: number) {
  return [
    curve('season', wkg84d, seasonFactor, weightKg),
    curve('84d', wkg84d, 1, weightKg),
    curve('42d', wkg84d, factor42d, weightKg),
  ]
}

// Climber with a long-effort profile.
const ERIKA_84D = [12.6, 11.5, 10.6, 9.9, 8.2, 7.0, 6.3, 6.05, 5.75, 5.35, 5.0, 4.7, 4.1]
// Sprinter with a track background.
const LENA_84D = [18.2, 16.4, 14.6, 13.4, 11.0, 8.6, 6.7, 5.9, 5.0, 4.55, 4.05, 3.9, 3.7]

export const MOCK_RIDERS: Rider[] = [
  {
    id: 'i900001',
    name: 'Erika Mustermann',
    dateOfBirth: '2000-05-14',
    trainingAgeYears: 6,
    trainingAgeEnteredOn: '2026-01-01',
    background: 'Former runner; road racing since 2020.',
    primaryTypeOverride: null,
    cohort: 'squad',
    asOf: MOCK_AS_OF,
    attributes: {
      p5s: { value: 11.5, rating: 10, confidence: 'high', change28d: 0 }, // z (11.5−15.3)/1.8
      p30s: { value: 8.2, rating: 10, confidence: 'high', change28d: 0 }, // z (8.2−10.3)/1.1
      p1m: { value: 7.0, rating: 11, confidence: 'low', change28d: -1 }, // z (7.0−8.4)/0.8
      p5m: { value: 5.75, rating: 15, confidence: 'high', change28d: 1 }, // anchors 5.20→12, 5.80→15
      p20m: { value: 5.0, rating: 14, confidence: 'high', change28d: 1 }, // anchors 4.63→12, 5.11→15
      p60m: { value: 4.1, rating: 14, confidence: 'high', change28d: 0 }, // z (4.1−4.2)/0.4
      durability: { value: 93, rating: 14, confidence: 'high', change28d: 1 }, // anchors 90→12, 95→15
      vo2max: { value: 63, rating: 15, confidence: 'high', change28d: 1 }, // anchor 63→15
    },
    caPa: {
      ca: 13.9,
      paP10: 13.9,
      paP50: 14.3,
      paP90: 14.9,
      ca12mP50: 14.2,
      typeProbs: {
        climber: 0.837,
        rouleur_tt: 0.159,
        all_rounder: 0.004,
        puncheur: 0,
        sprinter: 0,
      },
      modelVersion: 'mock-v1',
    },
    powerCurves: curves(ERIKA_84D, 1.02, 0.98, 54),
    durability: [
      { kjPerKg: 0, p5mWkg: 5.75, p20mWkg: 5.0 },
      { kjPerKg: 10, p5mWkg: 5.62, p20mWkg: 4.91 },
      { kjPerKg: 20, p5mWkg: 5.46, p20mWkg: 4.8 },
      { kjPerKg: 30, p5mWkg: 5.35, p20mWkg: 4.65 },
    ],
    labTests: [
      {
        date: '2026-03-10',
        method: 'inscyd_lab',
        vo2maxMlKgMin: 61.5,
        vlamaxMmolLS: 0.4,
        fatmaxW: 182,
        carbmaxGH: 98,
        atW: 251,
      },
      {
        date: '2026-09-15',
        method: 'inscyd_lab',
        vo2maxMlKgMin: 63,
        vlamaxMmolLS: 0.38,
        fatmaxW: 195,
        carbmaxGH: 95,
        atW: 262,
      },
    ],
    training: {
      ctl: 78,
      atl: 85,
      tsb: -7,
      rampRate: 3.2,
      compliance12wPct: 92,
      indoorPct: 18,
      rides84d: 52,
    },
    readiness: {
      light: 'green',
      reasons: [],
      lnRmssdZ: 0.3,
      restingHrDeltaBpm: 1,
      sleepHours: 7.6,
    },
    notes: [
      {
        date: '2026-10-12',
        author: 'Kosta',
        text: 'Strong block at the altitude camp; 20-min power up.',
      },
    ],
  },
  {
    id: 'i900002',
    name: 'Lena Beispiel',
    dateOfBirth: '2005-03-02',
    trainingAgeYears: 3,
    trainingAgeEnteredOn: '2026-01-01',
    background: 'Track sprint background (U23).',
    primaryTypeOverride: null,
    cohort: 'squad',
    asOf: MOCK_AS_OF,
    attributes: {
      p5s: { value: 16.4, rating: 17, confidence: 'high', change28d: 1 },
      p30s: { value: 11.0, rating: 17, confidence: 'high', change28d: 0 },
      p1m: { value: 8.6, rating: 16, confidence: 'high', change28d: 1 },
      p5m: { value: 5.0, rating: 11, confidence: 'high', change28d: 0 }, // anchors 4.65→9, 5.20→12
      p20m: { value: 4.05, rating: 9, confidence: 'high', change28d: -1 }, // below 4.11→9, nearest slope
      p60m: { value: 3.7, rating: 12, confidence: 'low', change28d: 0 },
      durability: { value: 88, rating: 11, confidence: 'high', change28d: 0 }, // anchors 85→9, 90→12
      vo2max: { value: 55, rating: 11, confidence: 'high', change28d: 0 }, // anchors 50→9, 57→12
    },
    caPa: {
      ca: 14.2,
      paP10: 14.8,
      paP50: 16.3,
      paP90: 17.6,
      ca12mP50: 14.8,
      typeProbs: { sprinter: 0.999, puncheur: 0.001, climber: 0, rouleur_tt: 0, all_rounder: 0 },
      modelVersion: 'mock-v1',
    },
    powerCurves: curves(LENA_84D, 1.03, 0.97, 61),
    durability: [
      { kjPerKg: 0, p5mWkg: 5.0, p20mWkg: 4.05 },
      { kjPerKg: 10, p5mWkg: 4.75, p20mWkg: 3.85 },
      { kjPerKg: 20, p5mWkg: 4.55, p20mWkg: 3.72 },
      { kjPerKg: 30, p5mWkg: 4.4, p20mWkg: 3.56 },
    ],
    labTests: [
      {
        date: '2026-04-20',
        method: 'inscyd_ppd_field',
        vo2maxMlKgMin: 54,
        vlamaxMmolLS: 0.74,
        fatmaxW: null,
        carbmaxGH: null,
        atW: 221,
      },
      {
        date: '2026-09-22',
        method: 'inscyd_lab',
        vo2maxMlKgMin: 55,
        vlamaxMmolLS: 0.72,
        fatmaxW: 160,
        carbmaxGH: 120,
        atW: 228,
      },
    ],
    training: {
      ctl: 64,
      atl: 58,
      tsb: 6,
      rampRate: 1.8,
      compliance12wPct: 81,
      indoorPct: 35,
      rides84d: 47,
    },
    readiness: {
      light: 'amber',
      reasons: ['Soreness high 2 days'],
      lnRmssdZ: -0.2,
      restingHrDeltaBpm: 2,
      sleepHours: 7.1,
    },
    notes: [
      {
        date: '2026-10-05',
        author: 'Kosta',
        text: 'Work on sustained power: add threshold intervals twice a week.',
      },
    ],
  },
]
