// Readiness priors from KB §9 ("Readiness traffic light [prior]"). A mock
// stand-in: read these from model_priors once 2.7 seeds them.
export const MOCK_READINESS_PRIORS = {
  /** 7-day ln rMSSD is in band within baseline ± this many SD. */
  lnRmssdBandSd: 0.5,
  /** A readiness marker needs this many readings in 7 days to count (KB §9). */
  minHrvReadings7d: 3,
} as const

// The power-test prior from KB §10, for the mock build; the live build reads
// model_priors (ftp.factor_20min).
export const MOCK_FTP_FACTOR_20MIN = 0.95
