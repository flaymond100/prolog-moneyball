import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { BODY_RANGES, LAB_RANGES, rangeMessage, type RangeField } from '@/data/lab-ranges.ts'
import { CP_EFFORTS, POWER_TEST_LABELS, powerTestResult } from '@/data/power-tests.ts'
import {
  useAddAnthropometric,
  useAddLabTest,
  useAddPowerTest,
  useFtpFactor,
} from '@/data/queries.ts'
import type { LabTest, LabTestMethod, PowerTest, PowerTestMethod, Rider } from '@/data/types.ts'
import { formatNumber } from '@/lib/format.ts'
import { supabase } from '@/lib/supabase.ts'
import { cn } from '@/lib/utils.ts'

const control =
  'h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:border-destructive'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function rangeSchema(f: RangeField) {
  return z
    .number({ error: `${f.label} must be a number.` })
    .min(f.min, { error: rangeMessage(f) })
    .max(f.max, { error: rangeMessage(f) })
    .nullable()
}

function dateSchema(label: string) {
  return z
    .string()
    .min(1, { error: `${label} is required.` })
    .refine((d) => d <= today(), { error: `${label} cannot be in the future.` })
}

const labSchema = z.object({
  athleteId: z.string().min(1, { error: 'Choose a rider.' }),
  date: dateSchema('Test date'),
  method: z.enum(['inscyd_lab', 'inscyd_ppd_field'], { error: 'Choose a method.' }),
  ...Object.fromEntries(LAB_RANGES.map((f) => [f.key, rangeSchema(f)])),
  tester: z.string().nullable(),
  notes: z.string().nullable(),
})

const bodySchema = z.object({
  athleteId: z.string().min(1, { error: 'Choose a rider.' }),
  date: dateSchema('Date'),
  ...Object.fromEntries(BODY_RANGES.map((f) => [f.key, rangeSchema(f)])),
  notes: z.string().nullable(),
})

type Values = Record<string, string>
type Errors = Record<string, string>

function toNumberOrNull(text: string | undefined): number | null {
  if (text === undefined || text.trim() === '') return null
  const n = Number(text)
  return Number.isNaN(n) ? Number.NaN : n
}

function textOrNull(text: string | undefined): string | null {
  return text && text.trim() !== '' ? text.trim() : null
}

function issuesToErrors(error: z.ZodError): Errors {
  const errors: Errors = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    errors[key] ??= issue.message
  }
  return errors
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function RiderSelect({
  id,
  riders,
  value,
  error,
  onChange,
}: {
  id: string
  riders: Rider[]
  value: string
  error?: string
  onChange: (v: string) => void
}) {
  return (
    <Field id={id} label="Rider" error={error}>
      <select
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        className={control}
      >
        <option value="">Choose a rider…</option>
        {riders.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </Field>
  )
}

function NumberInputs({
  prefix,
  fields,
  values,
  errors,
  set,
}: {
  prefix: string
  fields: readonly RangeField[]
  values: Values
  errors: Errors
  set: (key: string, v: string) => void
}) {
  return (
    <>
      {fields.map((f) => (
        <Field key={f.key} id={`${prefix}-${f.key}`} label={f.label} error={errors[f.key]}>
          <input
            id={`${prefix}-${f.key}`}
            type="number"
            inputMode="decimal"
            step={f.step}
            placeholder={`${String(f.min)}–${String(f.max)}`}
            value={values[f.key] ?? ''}
            aria-invalid={errors[f.key] ? true : undefined}
            aria-describedby={errors[f.key] ? `${prefix}-${f.key}-error` : undefined}
            onChange={(e) => {
              set(f.key, e.target.value)
            }}
            className={control}
          />
        </Field>
      ))}
    </>
  )
}

function Status({ saved, error }: { saved: string | null; error: string | null }) {
  if (error)
    return (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    )
  if (saved)
    return (
      <p className="text-sm text-rating-band-3" role="status">
        {saved}
      </p>
    )
  return null
}

export function LabTestForm({ riders }: { riders: Rider[] }) {
  const add = useAddLabTest()
  const [values, setValues] = useState<Values>({ date: today(), method: 'inscyd_lab' })
  const [errors, setErrors] = useState<Errors>({})
  const [saved, setSaved] = useState<string | null>(null)
  const set = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const parsed = labSchema.safeParse({
      athleteId: values.athleteId ?? '',
      date: values.date ?? '',
      method: values.method,
      ...Object.fromEntries(LAB_RANGES.map((f) => [f.key, toNumberOrNull(values[f.key])])),
      tester: textOrNull(values.tester),
      notes: textOrNull(values.notes),
    })
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error))
      return
    }
    setErrors({})
    const d = parsed.data as Record<string, unknown>
    const test: LabTest = {
      date: d.date as string,
      method: d.method as LabTestMethod,
      vo2maxMlKgMin: d.vo2maxMlKgMin as number | null,
      vo2maxLMin: d.vo2maxLMin as number | null,
      vlamaxMmolLS: d.vlamaxMmolLS as number | null,
      fatmaxW: d.fatmaxW as number | null,
      fatmaxGH: d.fatmaxGH as number | null,
      carbmaxGH: d.carbmaxGH as number | null,
      atW: d.atW as number | null,
      weightKg: d.weightKg as number | null,
      heightCm: d.heightCm as number | null,
      bodyFatPct: d.bodyFatPct as number | null,
      tester: d.tester as string | null,
      notes: d.notes as string | null,
    }
    add.mutate(
      { athleteId: d.athleteId as string, test },
      {
        onSuccess: () => {
          const name = riders.find((r) => r.id === d.athleteId)?.name ?? 'the rider'
          setSaved(`Lab test saved for ${name} (mock data, this session only).`)
          setValues({ athleteId: values.athleteId ?? '', date: today(), method: 'inscyd_lab' })
        },
      },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="New Lab Test">
      <div className="grid gap-3 sm:grid-cols-3">
        <RiderSelect
          id="lab-rider"
          riders={riders}
          value={values.athleteId ?? ''}
          error={errors.athleteId}
          onChange={(v) => {
            set('athleteId', v)
          }}
        />
        <Field id="lab-date" label="Test Date" error={errors.date}>
          <input
            id="lab-date"
            type="date"
            max={today()}
            value={values.date ?? ''}
            aria-invalid={errors.date ? true : undefined}
            onChange={(e) => {
              set('date', e.target.value)
            }}
            className={control}
          />
        </Field>
        <Field id="lab-method" label="Method" error={errors.method}>
          <select
            id="lab-method"
            value={values.method ?? ''}
            onChange={(e) => {
              set('method', e.target.value)
            }}
            className={control}
          >
            <option value="inscyd_lab">INSCYD Lab</option>
            <option value="inscyd_ppd_field">INSCYD Field (Modelled)</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <NumberInputs prefix="lab" fields={LAB_RANGES} values={values} errors={errors} set={set} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="lab-tester" label="Tester">
          <input
            id="lab-tester"
            value={values.tester ?? ''}
            onChange={(e) => {
              set('tester', e.target.value)
            }}
            className={control}
          />
        </Field>
        <Field id="lab-notes" label="Notes">
          <input
            id="lab-notes"
            value={values.notes ?? ''}
            onChange={(e) => {
              set('notes', e.target.value)
            }}
            className={control}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={add.isPending}>
          Save Lab Test
        </Button>
        <Status saved={saved} error={add.error?.message ?? null} />
      </div>
    </form>
  )
}

export function AnthropometricsForm({ riders }: { riders: Rider[] }) {
  const add = useAddAnthropometric()
  const [values, setValues] = useState<Values>({ date: today() })
  const [errors, setErrors] = useState<Errors>({})
  const [saved, setSaved] = useState<string | null>(null)
  const set = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const parsed = bodySchema.safeParse({
      athleteId: values.athleteId ?? '',
      date: values.date ?? '',
      ...Object.fromEntries(BODY_RANGES.map((f) => [f.key, toNumberOrNull(values[f.key])])),
      notes: textOrNull(values.notes),
    })
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error))
      return
    }
    setErrors({})
    const d = parsed.data as Record<string, unknown>
    add.mutate(
      {
        athleteId: d.athleteId as string,
        date: d.date as string,
        heightCm: d.heightCm as number | null,
        weightKg: d.weightKg as number | null,
        bodyFatPct: d.bodyFatPct as number | null,
        notes: d.notes as string | null,
      },
      {
        onSuccess: () => {
          setSaved('Measurements saved (mock data, this session only).')
          setValues({ athleteId: values.athleteId ?? '', date: today() })
        },
      },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="New Measurements">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <RiderSelect
          id="body-rider"
          riders={riders}
          value={values.athleteId ?? ''}
          error={errors.athleteId}
          onChange={(v) => {
            set('athleteId', v)
          }}
        />
        <Field id="body-date" label="Date" error={errors.date}>
          <input
            id="body-date"
            type="date"
            max={today()}
            value={values.date ?? ''}
            aria-invalid={errors.date ? true : undefined}
            onChange={(e) => {
              set('date', e.target.value)
            }}
            className={control}
          />
        </Field>
        <NumberInputs
          prefix="body"
          fields={BODY_RANGES}
          values={values}
          errors={errors}
          set={set}
        />
      </div>
      <Field id="body-notes" label="Notes">
        <input
          id="body-notes"
          value={values.notes ?? ''}
          onChange={(e) => {
            set('notes', e.target.value)
          }}
          className={cn(control, 'max-w-xl')}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={add.isPending}>
          Save Measurements
        </Button>
        <Status saved={saved} error={add.error?.message ?? null} />
      </div>
    </form>
  )
}

// Power tests (KB §10) ------------------------------------------------------------

/** Watts accepted for an effort, as the power_tests check allows. */
const WATTS = { min: 1, max: 2500 } as const

interface EffortRow {
  minutes: string
  watts: string
}

const DEFAULT_CP_EFFORTS: EffortRow[] = [
  { minutes: '3', watts: '' },
  { minutes: '12', watts: '' },
]

/** The efforts of the form as a test, or the first problem with them. */
function readPowerTest(
  method: PowerTestMethod,
  ftpWatts: string,
  rows: readonly EffortRow[],
): { efforts: PowerTest['efforts'] } | { error: string; field: string } {
  const watts = (text: string, field: string) => {
    const n = toNumberOrNull(text)
    if (n === null || Number.isNaN(n) || n < WATTS.min || n > WATTS.max) {
      return {
        error: `Power must be between ${String(WATTS.min)} and ${String(WATTS.max)} W.`,
        field,
      }
    }
    return n
  }
  if (method === 'ftp_20min') {
    const w = watts(ftpWatts, 'ftpWatts')
    if (typeof w !== 'number') return w
    return { efforts: [{ durationS: 1200, watts: w, wkg: null }] }
  }
  const efforts: PowerTest['efforts'] = []
  for (const [i, row] of rows.entries()) {
    const minutes = toNumberOrNull(row.minutes)
    const durationS = minutes === null ? Number.NaN : Math.round(minutes * 60)
    if (!(durationS >= CP_EFFORTS.minS && durationS <= CP_EFFORTS.maxS)) {
      return { error: 'Each effort lasts 2 to 20 minutes.', field: `effort${String(i)}` }
    }
    const w = watts(row.watts, `effort${String(i)}`)
    if (typeof w !== 'number') return w
    efforts.push({ durationS, watts: w, wkg: null })
  }
  efforts.sort((a, b) => a.durationS - b.durationS)
  if (efforts.some((e, i) => i > 0 && e.durationS === efforts[i - 1]?.durationS)) {
    return { error: 'Each effort needs a different length.', field: 'efforts' }
  }
  return { efforts }
}

export function PowerTestForm({ riders }: { riders: Rider[] }) {
  const add = useAddPowerTest()
  const ftpFactor = useFtpFactor()
  const [athleteId, setAthleteId] = useState('')
  const [date, setDate] = useState(today())
  const [method, setMethod] = useState<PowerTestMethod>('ftp_20min')
  const [ftpWatts, setFtpWatts] = useState('')
  const [rows, setRows] = useState<EffortRow[]>(DEFAULT_CP_EFFORTS)
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saved, setSaved] = useState<string | null>(null)

  const read = readPowerTest(method, ftpWatts, rows)
  const preview =
    'efforts' in read && ftpFactor !== undefined
      ? powerTestResult({ date, method, efforts: read.efforts, notes: null }, ftpFactor)
      : null

  function setRow(i: number, patch: Partial<EffortRow>) {
    setRows((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(null)
    const next: Errors = {}
    if (!athleteId) next.athleteId = 'Choose a rider.'
    if (!date) next.date = 'Test date is required.'
    else if (date > today()) next.date = 'Test date cannot be in the future.'
    if ('error' in read) next[read.field] = read.error
    else if (method === 'cp' && !preview) {
      next.efforts = 'These efforts give no valid CP: a longer effort needs a lower power.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || !('efforts' in read)) return
    add.mutate(
      { athleteId, test: { date, method, efforts: read.efforts, notes: textOrNull(notes) } },
      {
        onSuccess: () => {
          const name = riders.find((r) => r.id === athleteId)?.name ?? 'the rider'
          setSaved(
            supabase
              ? `${POWER_TEST_LABELS[method]} saved for ${name}.`
              : `${POWER_TEST_LABELS[method]} saved for ${name} (mock data, this session only).`,
          )
          setFtpWatts('')
          setRows(DEFAULT_CP_EFFORTS)
          setNotes('')
        },
      },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="New Power Test">
      <div className="grid gap-3 sm:grid-cols-3">
        <RiderSelect
          id="power-rider"
          riders={riders}
          value={athleteId}
          error={errors.athleteId}
          onChange={setAthleteId}
        />
        <Field id="power-date" label="Test Date" error={errors.date}>
          <input
            id="power-date"
            type="date"
            max={today()}
            value={date}
            aria-invalid={errors.date ? true : undefined}
            onChange={(e) => {
              setDate(e.target.value)
            }}
            className={control}
          />
        </Field>
        <Field id="power-method" label="Test">
          <select
            id="power-method"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as PowerTestMethod)
              setErrors({})
            }}
            className={control}
          >
            <option value="ftp_20min">{POWER_TEST_LABELS.ftp_20min}</option>
            <option value="cp">{POWER_TEST_LABELS.cp}</option>
          </select>
        </Field>
      </div>

      {method === 'ftp_20min' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="power-ftp" label="20-Min Average Power (W)" error={errors.ftpWatts}>
            <input
              id="power-ftp"
              type="number"
              inputMode="decimal"
              min={WATTS.min}
              max={WATTS.max}
              value={ftpWatts}
              aria-invalid={errors.ftpWatts ? true : undefined}
              onChange={(e) => {
                setFtpWatts(e.target.value)
              }}
              className={control}
            />
          </Field>
        </div>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-xs text-muted-foreground">
            Maximal efforts: 2 to 4, each 2–20 minutes and a different length (e.g. 3 and 12 min)
          </legend>
          {rows.map((row, i) => (
            <div key={i} className="grid max-w-xl grid-cols-[1fr_1fr_auto] items-end gap-3">
              <Field
                id={`power-effort-${String(i)}-min`}
                label={`Effort ${String(i + 1)}: Minutes`}
              >
                <input
                  id={`power-effort-${String(i)}-min`}
                  type="number"
                  inputMode="decimal"
                  step={0.5}
                  min={2}
                  max={20}
                  value={row.minutes}
                  aria-invalid={errors[`effort${String(i)}`] ? true : undefined}
                  onChange={(e) => {
                    setRow(i, { minutes: e.target.value })
                  }}
                  className={control}
                />
              </Field>
              <Field id={`power-effort-${String(i)}-w`} label="Average Power (W)">
                <input
                  id={`power-effort-${String(i)}-w`}
                  type="number"
                  inputMode="decimal"
                  min={WATTS.min}
                  max={WATTS.max}
                  value={row.watts}
                  aria-invalid={errors[`effort${String(i)}`] ? true : undefined}
                  onChange={(e) => {
                    setRow(i, { watts: e.target.value })
                  }}
                  className={control}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remove effort ${String(i + 1)}`}
                disabled={rows.length <= CP_EFFORTS.min}
                onClick={() => {
                  setRows((prev) => prev.filter((_, j) => j !== i))
                }}
              >
                <Minus aria-hidden="true" />
              </Button>
              {errors[`effort${String(i)}`] && (
                <p className="col-span-3 text-xs text-destructive">
                  {errors[`effort${String(i)}`]}
                </p>
              )}
            </div>
          ))}
          {errors.efforts && <p className="text-xs text-destructive">{errors.efforts}</p>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rows.length >= CP_EFFORTS.max}
            onClick={() => {
              setRows((prev) => [...prev, { minutes: '', watts: '' }])
            }}
          >
            <Plus aria-hidden="true" />
            Add Effort
          </Button>
        </fieldset>
      )}

      <p className="text-sm" aria-live="polite">
        {preview ? (
          <>
            <span className="text-muted-foreground">Result: </span>
            <span className="font-medium">
              {preview.label} {formatNumber(preview.watts, 0)} W
            </span>
            {preview.wPrimeKj !== null && ` · W′ ${formatNumber(preview.wPrimeKj, 1)} kJ`}
            {preview.r2 !== null && ` · R² ${formatNumber(preview.r2, 3)}`}
            <span className="text-muted-foreground">
              {method === 'ftp_20min'
                ? ` (${formatNumber((ftpFactor ?? 0) * 100, 0)}% of 20-min power)`
                : ' (linear work–time model)'}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {method === 'ftp_20min'
              ? 'Enter the 20-min average power to see FTP.'
              : 'Enter the efforts to see CP and W′.'}
          </span>
        )}
      </p>

      <Field id="power-notes" label="Notes">
        <input
          id="power-notes"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
          }}
          className={cn(control, 'max-w-xl')}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={add.isPending}>
          Save Power Test
        </Button>
        <Status saved={saved} error={add.error?.message ?? null} />
      </div>
    </form>
  )
}
