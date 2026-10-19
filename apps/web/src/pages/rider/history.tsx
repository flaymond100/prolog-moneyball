import { Badge } from '@/components/ui/badge.tsx'
import type { LabTest, Rider } from '@/data/types.ts'
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
                className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-gold"
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
