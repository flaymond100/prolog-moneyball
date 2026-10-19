import type { AttributeId, PowerAttributeId, PowerWindow, RiderType } from '@/data/types.ts'

export interface AttributeMeta {
  id: AttributeId
  label: string
  shortLabel: string
  unit: string
  group: 'power' | 'durability' | 'physiology'
  /** Duration in seconds for power attributes. */
  secs?: number
}

export const POWER_ATTRIBUTES: readonly PowerAttributeId[] = [
  'p5s',
  'p30s',
  'p1m',
  'p5m',
  'p20m',
  'p60m',
]

export const ATTRIBUTES: readonly AttributeMeta[] = [
  { id: 'p5s', label: 'Sprint 5 s', shortLabel: '5 s', unit: 'W/kg', group: 'power', secs: 5 },
  {
    id: 'p30s',
    label: 'Anaerobic 30 s',
    shortLabel: '30 s',
    unit: 'W/kg',
    group: 'power',
    secs: 30,
  },
  { id: 'p1m', label: 'Punch 1 min', shortLabel: '1 min', unit: 'W/kg', group: 'power', secs: 60 },
  { id: 'p5m', label: 'VO2 5 min', shortLabel: '5 min', unit: 'W/kg', group: 'power', secs: 300 },
  {
    id: 'p20m',
    label: 'Threshold 20 min',
    shortLabel: '20 min',
    unit: 'W/kg',
    group: 'power',
    secs: 1200,
  },
  {
    id: 'p60m',
    label: 'Endurance 60 min',
    shortLabel: '60 min',
    unit: 'W/kg',
    group: 'power',
    secs: 3600,
  },
  {
    id: 'durability',
    label: 'Durability',
    shortLabel: 'Durability',
    unit: '% retained',
    group: 'durability',
  },
  {
    id: 'vo2max',
    label: 'VO2max (Lab)',
    shortLabel: 'VO2max',
    unit: 'mL/kg/min',
    group: 'physiology',
  },
]

export function attributeMeta(id: AttributeId): AttributeMeta {
  const meta = ATTRIBUTES.find((a) => a.id === id)
  if (!meta) throw new Error(`Unknown attribute: ${id}`)
  return meta
}

export const RIDER_TYPES: readonly RiderType[] = [
  'sprinter',
  'puncheur',
  'climber',
  'rouleur_tt',
  'all_rounder',
]

export const RIDER_TYPE_LABELS: Record<RiderType, string> = {
  sprinter: 'Sprinter',
  puncheur: 'Puncheur',
  climber: 'Climber',
  rouleur_tt: 'Rouleur/TT',
  all_rounder: 'All-Rounder',
}

/** Terrain each rider type suits best, for the terrain position map (KB §12). */
export const RIDER_TYPE_TERRAIN: Record<RiderType, string> = {
  sprinter: 'Flat Sprint',
  all_rounder: 'Rolling',
  puncheur: 'Punchy Finish',
  climber: 'Long Climb',
  rouleur_tt: 'Time Trial',
}

export const POWER_WINDOW_LABELS: Record<PowerWindow, string> = {
  season: 'Season',
  '84d': '84 Days',
  '42d': '42 Days',
}
