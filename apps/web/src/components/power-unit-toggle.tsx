import { setPowerUnit, usePowerUnit, type PowerUnit } from '@/data/power-unit-store.ts'
import { cn } from '@/lib/utils.ts'

const OPTIONS: { unit: PowerUnit; label: string }[] = [
  { unit: 'wkg', label: 'W/kg' },
  { unit: 'w', label: 'W' },
]

/** Switches power values between W/kg and absolute watts; ratings stay on W/kg (KB §6). */
export function PowerUnitToggle() {
  const current = usePowerUnit()
  return (
    <div
      role="group"
      aria-label="Power Unit"
      title="Ratings always use W/kg"
      className="inline-flex rounded-lg bg-muted p-0.5 text-sm"
    >
      {OPTIONS.map(({ unit, label }) => (
        <button
          key={unit}
          type="button"
          aria-pressed={current === unit}
          onClick={() => {
            setPowerUnit(unit)
          }}
          className={cn(
            'rounded-md px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground',
            current === unit && 'bg-card text-foreground shadow-sm',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
