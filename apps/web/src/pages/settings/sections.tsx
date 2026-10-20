import { useState, type FormEvent, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { TRACKED_LAB_METRICS } from '@/data/lab-ranges.ts'
import { RIDER_TYPE_LABELS, RIDER_TYPES } from '@/data/labels.ts'
import {
  MOCK_BENCHMARK_SETS,
  MOCK_CA_WEIGHTS,
  MOCK_PA_PRIORS,
  type CaWeightAttribute,
  type PaPrior,
} from '@/data/mock/model-settings.ts'
import { useUpdateRiderProfile, type RiderProfilePatch } from '@/data/queries.ts'
import { ROLE_LABELS, type StaffRole } from '@/data/role-store.ts'
import { setTypicalError, useTypicalErrors } from '@/data/typical-error-store.ts'
import type { Rider, RiderCohort, RiderType } from '@/data/types.ts'
import { formatDate, formatNumber } from '@/lib/format.ts'
import { cn } from '@/lib/utils.ts'
import { Panel } from '@/pages/rider/panels.tsx'

const control =
  'h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60 aria-invalid:border-destructive'

function ReadOnlyNote({ role, who }: { role: StaffRole; who: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Lock className="size-3" aria-hidden="true" />
      Read-only for {ROLE_LABELS[role]}. {who} can edit.
    </p>
  )
}

function Labelled({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

// Rider profiles ---------------------------------------------------------------

export function RiderProfilesSection({ riders, role }: { riders: Rider[]; role: StaffRole }) {
  const canEdit = role === 'coach'
  const update = useUpdateRiderProfile()
  const [riderId, setRiderId] = useState('')
  const rider = riders.find((r) => r.id === riderId) ?? riders[0]
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  if (!rider) return null
  const value = (key: string, fallback: string | number | null | undefined) =>
    draft[key] ?? (fallback === null || fallback === undefined ? '' : String(fallback))
  const set = (key: string, v: string) => {
    setSaved(false)
    setDraft((d) => ({ ...d, [key]: v }))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!rider) return
    const patch: RiderProfilePatch = {}
    if (draft.dateOfBirth !== undefined) patch.dateOfBirth = draft.dateOfBirth
    if (draft.trainingAgeYears !== undefined && draft.trainingAgeYears !== '') {
      patch.trainingAgeYears = Math.max(0, Number(draft.trainingAgeYears))
      patch.trainingAgeEnteredOn = new Date().toISOString().slice(0, 10)
    }
    if (draft.background !== undefined) patch.background = draft.background
    if (draft.primaryTypeOverride !== undefined) {
      patch.primaryTypeOverride = (draft.primaryTypeOverride || null) as RiderType | null
    }
    if (draft.hrvSource !== undefined) patch.hrvSource = draft.hrvSource || null
    if (draft.cohort !== undefined) patch.cohort = draft.cohort as RiderCohort
    if (draft.contractEnd !== undefined) patch.contractEnd = draft.contractEnd || null
    update.mutate(
      { id: rider.id, patch },
      {
        onSuccess: () => {
          setDraft({})
          setSaved(true)
        },
      },
    )
  }

  return (
    <Panel title="Rider Profiles">
      <form onSubmit={submit} className="space-y-3" aria-label="Rider Profile">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Labelled id="profile-rider" label="Rider">
            <select
              id="profile-rider"
              value={rider.id}
              onChange={(e) => {
                setRiderId(e.target.value)
                setDraft({})
                setSaved(false)
              }}
              className={control}
            >
              {riders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled id="profile-dob" label="Date of Birth">
            <input
              id="profile-dob"
              type="date"
              disabled={!canEdit}
              value={value('dateOfBirth', rider.dateOfBirth)}
              onChange={(e) => {
                set('dateOfBirth', e.target.value)
              }}
              className={control}
            />
          </Labelled>
          <Labelled id="profile-training-age" label="Training Age at Entry (Years)">
            <input
              id="profile-training-age"
              type="number"
              min={0}
              step={0.5}
              disabled={!canEdit}
              value={value('trainingAgeYears', rider.trainingAgeYears)}
              onChange={(e) => {
                set('trainingAgeYears', e.target.value)
              }}
              className={control}
            />
          </Labelled>
          <Labelled id="profile-type" label="Rider Type Override">
            <select
              id="profile-type"
              disabled={!canEdit}
              value={value('primaryTypeOverride', rider.primaryTypeOverride)}
              onChange={(e) => {
                set('primaryTypeOverride', e.target.value)
              }}
              className={control}
            >
              <option value="">None (computed)</option>
              {RIDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RIDER_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled id="profile-cohort" label="Cohort">
            <select
              id="profile-cohort"
              disabled={!canEdit}
              value={value('cohort', rider.cohort)}
              onChange={(e) => {
                set('cohort', e.target.value)
              }}
              className={control}
            >
              <option value="squad">Squad</option>
              <option value="prospect">Prospect</option>
              <option value="alumni">Alumni</option>
            </select>
          </Labelled>
          <Labelled id="profile-hrv" label="HRV Source (App and Strap)">
            <input
              id="profile-hrv"
              disabled={!canEdit}
              value={value('hrvSource', rider.hrvSource)}
              onChange={(e) => {
                set('hrvSource', e.target.value)
              }}
              className={control}
            />
          </Labelled>
          <Labelled id="profile-contract" label="Contract End">
            <input
              id="profile-contract"
              type="date"
              disabled={!canEdit}
              value={value('contractEnd', rider.contractEnd)}
              onChange={(e) => {
                set('contractEnd', e.target.value)
              }}
              className={control}
            />
          </Labelled>
          <Labelled id="profile-background" label="Background">
            <input
              id="profile-background"
              disabled={!canEdit}
              value={value('background', rider.background)}
              onChange={(e) => {
                set('background', e.target.value)
              }}
              className={control}
            />
          </Labelled>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={Object.keys(draft).length === 0 || update.isPending}
            >
              Save Profile
            </Button>
            {saved && (
              <p role="status" className="text-sm text-rating-band-3">
                Profile saved (mock data, this session only).
              </p>
            )}
          </div>
        ) : (
          <ReadOnlyNote role={role} who="Coach" />
        )}
      </form>
    </Panel>
  )
}

// Benchmark set ------------------------------------------------------------------

export function BenchmarkSection({ role }: { role: StaffRole }) {
  const [set, setSet] = useState<string>(MOCK_BENCHMARK_SETS[0].id)
  return (
    <Panel title="Benchmark Set">
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled id="benchmark-set" label="Active Set">
          <select
            id="benchmark-set"
            disabled={role !== 'coach'}
            value={set}
            onChange={(e) => {
              setSet(e.target.value)
            }}
            className={control}
          >
            {MOCK_BENCHMARK_SETS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Labelled>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" disabled className="accent-gold" />
            Squad-Relative Mode
          </label>
          <p className="text-xs text-muted-foreground">
            Not available yet: the KB maps squad percentile to 1–20 but does not define the
            percentile method.
          </p>
        </div>
      </div>
      {role !== 'coach' && <ReadOnlyNote role={role} who="Coach" />}
    </Panel>
  )
}

// CA weights ---------------------------------------------------------------------

const CA_ROWS: { key: CaWeightAttribute; label: string }[] = [
  { key: 'p5s', label: '5 s' },
  { key: 'p30s', label: '30 s' },
  { key: 'p1m', label: '1 min' },
  { key: 'p5m', label: '5 min' },
  { key: 'p20m', label: '20 min' },
  { key: 'p60m', label: '60 min' },
  { key: 'durability', label: 'Durability (Fixed)' },
  { key: 'vo2max', label: 'VO2max (Lab)' },
]

export function CaWeightsSection({ role }: { role: StaffRole }) {
  const canEdit = role === 'coach'
  const [weights, setWeights] = useState(MOCK_CA_WEIGHTS)
  const [saved, setSaved] = useState(false)
  const totals = Object.fromEntries(
    RIDER_TYPES.map((t) => [t, CA_ROWS.reduce((sum, r) => sum + weights[r.key][t], 0)]),
  ) as Record<RiderType, number>
  const valid = RIDER_TYPES.every((t) => totals[t] === 100)

  return (
    <Panel title="CA Weights">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="pb-2 text-left text-xs text-muted-foreground">
            Per cent of CA by rider type (KB §7). Each column must sum to 100; durability is fixed
            at 25. Rouleur/TT uses absolute W for 20 and 60 min.
          </caption>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th scope="col" className="py-2 text-left font-normal">
                Attribute
              </th>
              {RIDER_TYPES.map((t) => (
                <th key={t} scope="col" className="py-2 text-right font-normal">
                  {RIDER_TYPE_LABELS[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CA_ROWS.map((row) => (
              <tr key={row.key} className="border-b">
                <th scope="row" className="py-1 text-left font-normal">
                  {row.label}
                </th>
                {RIDER_TYPES.map((t) => (
                  <td key={t} className="py-1 text-right">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      aria-label={`${row.label}, ${RIDER_TYPE_LABELS[t]}`}
                      disabled={!canEdit || row.key === 'durability'}
                      value={weights[row.key][t]}
                      onChange={(e) => {
                        setSaved(false)
                        const v = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                        setWeights((w) => ({ ...w, [row.key]: { ...w[row.key], [t]: v } }))
                      }}
                      className={cn(control, 'ml-auto w-16 text-right')}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="py-2 text-left font-medium">
                Total
              </th>
              {RIDER_TYPES.map((t) => (
                <td
                  key={t}
                  className={cn(
                    'py-2 text-right font-medium',
                    totals[t] !== 100 && 'text-destructive',
                  )}
                >
                  {totals[t]}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={!valid}
            onClick={() => {
              setSaved(true)
            }}
          >
            Save Weights
          </Button>
          {!valid && (
            <p role="alert" className="text-sm text-destructive">
              Every rider type must sum to 100 before saving.
            </p>
          )}
          {saved && valid && (
            <p role="status" className="text-sm text-rating-band-3">
              Weights saved (mock data, this session only).
            </p>
          )}
        </div>
      ) : (
        <ReadOnlyNote role={role} who="Coach" />
      )}
    </Panel>
  )
}

// PA priors (coach only) ---------------------------------------------------------

interface PriorChange {
  at: string
  key: string
  label: string
  from: number
  to: number
}

export function PaPriorsSection() {
  const [priors, setPriors] = useState<PaPrior[]>(MOCK_PA_PRIORS)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<PriorChange[]>([])

  function save() {
    const at = new Date().toISOString().slice(0, 10)
    const changes: PriorChange[] = []
    const next = priors.map((p) => {
      const text = draft[p.key]
      const v = text === undefined || text.trim() === '' ? p.value : Number(text)
      if (Number.isNaN(v) || v === p.value) return p
      changes.push({ at, key: p.key, label: p.label, from: p.value, to: v })
      return { ...p, value: v }
    })
    setPriors(next)
    setHistory((h) => [...changes, ...h])
    setDraft({})
  }

  return (
    <Panel title="PA Priors">
      <p className="text-xs text-muted-foreground">
        KB §8 v1 values. Changes are logged; the model recalibrates g0 after each season.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {priors.map((p) => (
          <Labelled
            key={p.key}
            id={`prior-${p.key}`}
            label={`${p.label}${p.unit ? ` (${p.unit})` : ''}`}
          >
            <div className="flex items-center gap-2">
              <input
                id={`prior-${p.key}`}
                type="number"
                step="any"
                value={draft[p.key] ?? String(p.value)}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, [p.key]: e.target.value }))
                }}
                className={control}
              />
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {p.source === 'source' ? 'Published' : 'Prior'}
              </span>
            </div>
          </Labelled>
        ))}
      </div>
      <Button size="sm" onClick={save} disabled={Object.keys(draft).length === 0}>
        Save Priors
      </Button>
      <section aria-label="Prior History" className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">History</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes this session.</p>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {history.map((h, i) => (
              <li key={`${h.key}-${String(i)}`}>
                {formatDate(h.at)} · {h.label}: {formatNumber(h.from, 2)} → {formatNumber(h.to, 2)}{' '}
                <span className="text-muted-foreground">(Coach)</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Panel>
  )
}

// Typical error ------------------------------------------------------------------

export function TypicalErrorSection({ role }: { role: StaffRole }) {
  const canEdit = role === 'coach'
  const typicalErrors = useTypicalErrors()
  return (
    <Panel title="Typical Error per Lab Metric">
      <p className="text-xs text-muted-foreground">
        A change between tests counts as meaningful only above this value (KB §10). Leave empty
        until known; there are no defaults.
      </p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TRACKED_LAB_METRICS.map((m) => (
          <Labelled key={m.key} id={`te-${m.key}`} label={m.label}>
            <input
              id={`te-${m.key}`}
              type="number"
              min={0}
              step={m.step}
              disabled={!canEdit}
              value={typicalErrors[m.key] ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim()
                setTypicalError(m.key, v === '' ? null : Math.max(0, Number(v)))
              }}
              className={control}
            />
          </Labelled>
        ))}
      </div>
      {canEdit ? (
        <p className="text-xs text-muted-foreground">Saved in this browser as you type.</p>
      ) : (
        <ReadOnlyNote role={role} who="Coach" />
      )}
    </Panel>
  )
}

// Consents (medical only) --------------------------------------------------------

type Scope = 'cycle_data' | 'medical_markers'
const SCOPES: { id: Scope; label: string }[] = [
  { id: 'cycle_data', label: 'Cycle Data' },
  { id: 'medical_markers', label: 'Medical Markers' },
]

export function ConsentsSection({ riders }: { riders: Rider[] }) {
  // Mock ledger: nobody has consented yet.
  const [granted, setGranted] = useState<Record<string, string | undefined>>({})
  return (
    <Panel title="Consents">
      <p className="text-xs text-muted-foreground">
        Voluntary extras only (KB §11). Withdrawing deletes the related data within 24 hours and
        logs the deletion.
      </p>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-2 text-left font-normal">
              Rider
            </th>
            {SCOPES.map((s) => (
              <th key={s.id} scope="col" className="py-2 text-left font-normal">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {riders.map((r) => (
            <tr key={r.id} className="border-b last:border-b-0">
              <th scope="row" className="py-2 text-left font-normal">
                {r.name}
              </th>
              {SCOPES.map((s) => {
                const key = `${r.id}:${s.id}`
                const since = granted[key]
                return (
                  <td key={s.id} className="py-2">
                    <span className="mr-3 text-muted-foreground">
                      {since ? `Granted ${formatDate(since)}` : 'Not granted'}
                    </span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        setGranted((g) => ({
                          ...g,
                          [key]: since ? undefined : new Date().toISOString().slice(0, 10),
                        }))
                      }}
                    >
                      {since ? 'Record Withdrawal' : 'Record Consent'}
                    </Button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

// Sync health --------------------------------------------------------------------

export function SyncHealthSection() {
  return (
    <Panel title="Sync Health">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Nightly Sync</dt>
          <dd>02:30 UTC from intervals.icu</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Derived Refresh</dt>
          <dd>03:15 UTC (views, ratings, CA/PA, forecasts)</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Last Run</dt>
          <dd className="text-muted-foreground">None yet: the sync arrives in Phase 3.</dd>
        </div>
      </dl>
    </Panel>
  )
}
