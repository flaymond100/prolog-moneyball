import { ageInYears, mostLikely, trainingAgeYears } from '@prolog/metrics'
import { attributeMeta } from '@/data/labels.ts'
import type { PowerUnit } from '@/data/power-unit-store.ts'
import type { AttributeId, Rider, RiderType } from '@/data/types.ts'

/**
 * The override when set, otherwise the most probable computed type (KB §7);
 * null until the type is calculated (TODO 7.2) and no override is set.
 */
export function primaryType(rider: Rider): RiderType | null {
  return rider.primaryTypeOverride ?? (rider.caPa ? mostLikely(rider.caPa.typeProbs) : null)
}

/** Null until the date of birth is entered. */
export function riderAge(rider: Rider): number | null {
  return rider.dateOfBirth ? ageInYears(rider.dateOfBirth, rider.asOf) : null
}

/** Null until the training age and its entry date are entered. */
export function riderTrainingAge(rider: Rider): number | null {
  if (rider.trainingAgeYears === null || !rider.trainingAgeEnteredOn) return null
  return trainingAgeYears(rider.trainingAgeYears, rider.trainingAgeEnteredOn, rider.asOf)
}

/**
 * Absolute 84-day best power in watts for a power attribute, from the rider's
 * 84-day power curve; null for other attributes or without a curve point.
 */
export function powerWatts(rider: Rider, id: AttributeId): number | null {
  const secs = attributeMeta(id).secs
  if (secs === undefined) return null
  const curve = rider.powerCurves.find((c) => c.window === '84d')
  const i = curve?.secs.indexOf(secs) ?? -1
  return i >= 0 ? (curve?.watts[i] ?? null) : null
}

/** A power attribute's value in the chosen unit; other attributes keep their own unit. */
export function attributeValue(rider: Rider, id: AttributeId, unit: PowerUnit): number | null {
  return unit === 'w' && attributeMeta(id).secs !== undefined
    ? powerWatts(rider, id)
    : rider.attributes[id].value
}

/** The unit and decimals an attribute's value shows in, for the chosen power unit. */
export function attributeUnit(
  id: AttributeId,
  unit: PowerUnit,
): { unit: string; decimals: number } {
  const meta = attributeMeta(id)
  if (meta.secs === undefined) return { unit: meta.unit, decimals: 0 }
  return unit === 'w' ? { unit: 'W', decimals: 0 } : { unit: 'W/kg', decimals: 2 }
}
