import { ageInYears, mostLikely, trainingAgeYears } from '@prolog/metrics'
import type { Rider, RiderType } from '@/data/types.ts'

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
