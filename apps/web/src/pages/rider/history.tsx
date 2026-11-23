import { isMeaningfulChange } from '@prolog/metrics'
import { Badge } from '@/components/ui/badge.tsx'
import {
  POWER_TEST_LABELS,
  formatEffortDuration,
  powerTestResult,
  type PowerTestResult,
} from '@/data/power-tests.ts'
import { useFtpFactor } from '@/data/queries.ts'
import { useTypicalErrors } from '@/data/typical-error-store.ts'
import type { LabTest, PowerTest, Rider } from '@/data/types.ts'
import { formatDate, formatNumber } from '@/lib/format.ts'
import { Panel } from '@/pages/rider/panels.tsx'

const LAB_FIELDS: [string, (t: LabTest) => number | null, string, number][] = [
  ['VO2max', (t) => t.vo2maxMlKgMin, 'mL/kg/min', 1],
  ['VLamax', (t) => t.vlamaxMmolLS, 'mmol/L/s', 2],
  ['FatMax', (t) => t.fatmaxW, 'W', 0],
  ['CarbMax', (t) => t.carbmaxGH, 'g/h', 0],
  ['AT', (t) => t.atW, 'W', 0],
]

export function LabTimeline({ rider }: { rider: Rider }) {
  const tests = [...rider.labTests].reverse()
  return (
    <Panel title="Lab Tests">
      {tests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lab tests yet.</p>
      ) : (
        <ol className="space-y-3 border-l pl-4">
          {tests.map((test) => (
            <li key={`${test.date}-${test.method}`} className="relative space-y-1">
              <span
                className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary"
                aria-hidden="true"
              />
              <p className="flex items-center gap-2 text-sm font-medium">
                {formatDate(test.date)}
                <Badge variant="outline">
                  {test.method === 'inscyd_lab' ? 'INSCYD Lab' : 'INSCYD Field'}
                </Badge>
                {test.method === 'inscyd_ppd_field' && <Badge variant="secondary">Modelled</Badge>}
              </p>
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {LAB_FIELDS.map(([label, get, unit, decimals]) => {
                  const v = get(test)
                  return (
                    <div key={label} className="flex gap-1.5">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd>{v === null ? '–' : `${formatNumber(v, decimals)} ${unit}`}</dd>
                    </div>
                  )
                })}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

/** Change since the previous test of the same kind, judged against the typical error (KB §10). */
function ChangeNote({ change, typicalError }: { change: number; typicalError: number | null }) {
  const meaningful = isMeaningfulChange(change, typicalError)
  return (
    <span className="text-xs text-muted-foreground">
      {formatNumber(change, 0, true)} W since the last test
      {meaningful === null ? '' : meaningful ? ' · meaningful' : ' · within typical error'}
    </span>
  )
}

function ResultLine({ result }: { result: PowerTestResult }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      <div className="flex gap-1.5">
        <dt className="text-muted-foreground">{result.label}</dt>
        <dd className="font-medium">
          {formatNumber(result.watts, 0)} W
          {result.wkg !== null && ` · ${formatNumber(result.wkg, 2)} W/kg`}
        </dd>
      </div>
      {result.wPrimeKj !== null && (
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">W′</dt>
          <dd>{formatNumber(result.wPrimeKj, 1)} kJ</dd>
        </div>
      )}
      {result.r2 !== null && (
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">R²</dt>
          <dd>{formatNumber(result.r2, 3)}</dd>
        </div>
      )}
    </dl>
  )
}

/** FTP and CP tests, newest first, each with its change since the previous test of its kind. */
export function PowerTestTimeline({ rider }: { rider: Rider }) {
  const ftpFactor = useFtpFactor()
  const typicalErrors = useTypicalErrors()
  const tests = [...rider.powerTests].reverse()
  const previous = (test: PowerTest, index: number) =>
    tests.slice(index + 1).find((t) => t.method === test.method)

  return (
    <Panel title="Power Tests">
      {tests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No FTP or CP tests yet.</p>
      ) : (
        <ol className="space-y-3 border-l pl-4">
          {tests.map((test, index) => {
            const result = ftpFactor === undefined ? null : powerTestResult(test, ftpFactor)
            const before = previous(test, index)
            const beforeResult =
              before && ftpFactor !== undefined ? powerTestResult(before, ftpFactor) : null
            return (
              <li key={`${test.date}-${test.method}`} className="relative space-y-1">
                <span
                  className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary"
                  aria-hidden="true"
                />
                <p className="flex items-center gap-2 text-sm font-medium">
                  {formatDate(test.date)}
                  <Badge variant="outline">{POWER_TEST_LABELS[test.method]}</Badge>
                </p>
                {result ? (
                  <ResultLine result={result} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {ftpFactor === undefined ? 'Calculating…' : 'These efforts give no valid CP.'}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {test.efforts
                    .map(
                      (e) =>
                        `${formatEffortDuration(e.durationS)} at ${formatNumber(e.watts, 0)} W`,
                    )
                    .join(' · ')}
                  {test.notes && ` · ${test.notes}`}
                </p>
                {result && beforeResult && (
                  <ChangeNote
                    change={result.watts - beforeResult.watts}
                    typicalError={typicalErrors[result.metricKey] ?? null}
                  />
                )}
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}

export function NotesPanel({ rider }: { rider: Rider }) {
  return (
    <Panel title="Notes">
      {rider.notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {rider.notes.map((note) => (
            <li key={`${note.date}-${note.author}`} className="space-y-0.5 text-sm">
              <p className="text-xs text-muted-foreground">
                {formatDate(note.date)} · {note.author}
              </p>
              <p>{note.text}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
