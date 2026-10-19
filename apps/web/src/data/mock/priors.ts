// Readiness priors from KB §9 ("Readiness traffic light [prior]"). A mock
// stand-in: read these from model_priors once 2.7 seeds them.
export const MOCK_READINESS_PRIORS = {
  /** 7-day ln rMSSD is in band within baseline ± this many SD. */
  lnRmssdBandSd: 0.5,
  /** Fewer HRV readings than this in 7 days shows "insufficient HRV data". */
  minHrvReadings7d: 3,
} as const
