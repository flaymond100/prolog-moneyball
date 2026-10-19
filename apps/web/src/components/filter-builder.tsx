import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { filterActions, OPERATORS, useFilterState, type Operator } from '@/data/filter-store.ts'
import { METRICS, metricDef, metricLabel } from '@/data/metric-registry.ts'
import { formatNumber } from '@/lib/format.ts'
import { cn } from '@/lib/utils.ts'

const control =
  'h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

const GROUPS = [...new Set(METRICS.map((m) => m.group))]

/** AND conditions as chips, shared by the squad table and the scatter explorer (KB §12). */
export function FilterBuilder({ matched, total }: { matched: number; total: number }) {
  const { conditions, saved } = useFilterState()
  const [metric, setMetric] = useState('ca')
  const [op, setOp] = useState<Operator>('≥')
  const [value, setValue] = useState('')
  const [name, setName] = useState('')

  function add() {
    const v = Number(value)
    if (value.trim() === '' || Number.isNaN(v)) return
    filterActions.add({ metric, op, value: v })
    setValue('')
  }

  return (
    <section aria-label="Filter" className="space-y-2 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Filter</span>
        <select
          aria-label="Metric"
          value={metric}
          onChange={(e) => {
            setMetric(e.target.value)
          }}
          className={cn(control, 'max-w-64')}
        >
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {METRICS.filter((m) => m.group === g).map((m) => (
                <option key={m.id} value={m.id}>
                  {metricLabel(m)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          aria-label="Operator"
          value={op}
          onChange={(e) => {
            setOp(e.target.value as Operator)
          }}
          className={control}
        >
          {OPERATORS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <input
          aria-label="Value"
          type="number"
          step="any"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          className={cn(control, 'w-24')}
        />
        <Button size="sm" variant="secondary" onClick={add} disabled={value.trim() === ''}>
          <Plus aria-hidden="true" />
          Add Condition
        </Button>

        <span className="ml-auto text-xs text-muted-foreground">
          {matched} of {total} riders
        </span>
      </div>

      {conditions.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active conditions">
          {conditions.map((c, i) => {
            const def = metricDef(c.metric)
            const text = `${def?.label ?? c.metric} ${c.op} ${formatNumber(c.value, def?.decimals ?? 0)}${def?.unit && def.unit !== '1–20' ? ` ${def.unit}` : ''}`
            return (
              <li
                key={`${c.metric}-${String(i)}`}
                className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-gold/10 py-0.5 pr-1 pl-2.5 text-xs"
              >
                {text}
                <button
                  type="button"
                  aria-label={`Remove ${text}`}
                  onClick={() => {
                    filterActions.remove(i)
                  }}
                  className="rounded-full p-0.5 hover:bg-accent"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => {
                filterActions.clear()
              }}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear All
            </button>
          </li>
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          aria-label="Saved Filters"
          value=""
          onChange={(e) => {
            filterActions.load(e.target.value)
          }}
          className={control}
          disabled={saved.length === 0}
        >
          <option value="">{saved.length === 0 ? 'No Saved Filters' : 'Load a Filter…'}</option>
          {saved.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Filter Name"
          placeholder="Filter name"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
          }}
          className={cn(control, 'w-40')}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!name.trim() || conditions.length === 0}
          onClick={() => {
            filterActions.save(name.trim())
            setName('')
          }}
        >
          Save Filter
        </Button>
        <span className="text-xs text-muted-foreground">Saved in this browser only.</span>
      </div>
    </section>
  )
}
