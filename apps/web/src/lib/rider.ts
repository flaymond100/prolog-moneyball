import { ageInYears, mostLikely, trainingAgeYears } from '@prolog/metrics'
import type { Rider, RiderType } from '@/data/types.ts'

/** The override when set, otherwise the most probable computed type (KB §7). */
export function primaryType(rider: Rider): RiderType {
  return rider.primaryTypeOverride ?? mostLikely(rider.caPa.typeProbs) ?? 'all_rounder'
}

export function riderAge(rider: Rider): number {
  return ageInYears(rider.dateOfBirth, rider.asOf)
}

export function riderTrainingAge(rider: Rider): number {
  return trainingAgeYears(rider.trainingAgeYears, rider.trainingAgeEnteredOn, rider.asOf)
}
