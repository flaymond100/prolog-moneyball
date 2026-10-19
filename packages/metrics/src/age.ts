// Age and training age (KB §8). Dates are ISO `YYYY-MM-DD` strings, read as UTC days.

const MS_PER_DAY = 86_400_000
const DAYS_PER_YEAR = 365.25

function parseIsoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid ISO date: ${value}`)
  return date
}

/** Whole years of age on `asOf`. */
export function ageInYears(dateOfBirth: string, asOf: string): number {
  const dob = parseIsoDate(dateOfBirth)
  const on = parseIsoDate(asOf)
  let years = on.getUTCFullYear() - dob.getUTCFullYear()
  const birthdayPassed =
    on.getUTCMonth() > dob.getUTCMonth() ||
    (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() >= dob.getUTCDate())
  if (!birthdayPassed) years -= 1
  return years
}

/** Training age on `asOf`: the years entered at `enteredOn` plus the years since then. */
export function trainingAgeYears(atEntry: number, enteredOn: string, asOf: string): number {
  const elapsedDays =
    (parseIsoDate(asOf).getTime() - parseIsoDate(enteredOn).getTime()) / MS_PER_DAY
  return atEntry + elapsedDays / DAYS_PER_YEAR
}
