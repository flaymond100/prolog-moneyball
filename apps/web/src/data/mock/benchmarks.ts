// Pro-mean reference points (rating 15) of the "Female Pro + Coggan
// provisional" set, KB §6, for the power-duration overlay. A mock stand-in:
// read these from benchmark_points once 2.7 seeds them.
export const MOCK_PRO_MEAN_WKG: readonly { secs: number; wkg: number }[] = [
  { secs: 5, wkg: 15.3 },
  { secs: 30, wkg: 10.3 },
  { secs: 60, wkg: 8.4 },
  { secs: 300, wkg: 5.8 },
  { secs: 1200, wkg: 5.11 },
  { secs: 3600, wkg: 4.2 },
]

/** Pro mean on the 1–20 scale, by definition of the rating (KB §6). */
export const PRO_MEAN_RATING = 15
