import { ArrowDown, ArrowUp } from 'lucide-react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { mean } from '@prolog/metrics'
import { RatingChip } from '@/components/rating-chip.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx'
import {
  DATA_QUALITY_LABELS,
  ROSTER_EFFORTS,
  ROSTER_SEASON,
  TIER_LABELS,
  useRoster,
  type RosterEffortId,
  type RosterEntry,
  type RosterTier,
} from '@/data/roster.ts'
import { useRole } from '@/data/role-store.ts'
import { formatNumber } from '@/lib/format.ts'
import { supabase } from '@/lib/supabase.ts'
import { cn } from '@/lib/utils.ts'

// Roster 2027: the signed riders with the numbers they reported when they
// applied, their race and team scores, and the staff's notes. A stop-gap for
// analysis until the riders sync from intervals.icu and appear in Squad.

const TIER_ORDER: Record<RosterTier, number> = { ambassador: 0, core: 1, development: 2 }

type TierFilter = 'all' | RosterTier
type SortValue = number | string | null

interface Column {
  id: string
  header: string
  /** Full name for the header tooltip. */
  title: string
  numeric?: boolean
  /** Decimals of the footer mean; no mean without it. */
  decimals?: number
  sortValue: (r: RosterEntry) => SortValue
  cell: (r: RosterEntry) => ReactNode
}

interface Sort {
  id: string
  desc: boolean
}

function wattsColumn(id: RosterEffortId, label: string): Column {
  return {
    id: `${id}-w`,
    header: `${label} W`,
    title: `${label} power (W)`,
    numeric: true,
    decimals: 0,
    sortValue: (r) => r.efforts[id].watts,
    cell: (r) => formatNumber(r.efforts[id].watts),
  }
}

function wkgColumn(id: RosterEffortId, label: string): Column {
  return {
    id: `${id}-wkg`,
    header: `${label} W/kg`,
    title: `${label} W/kg, with its 1–20 rating against the active benchmark set`,
    numeric: true,
    decimals: 2,
    sortValue: (r) => r.efforts[id].wkg,
    cell: (r) => {
      const { wkg, rating } = r.efforts[id]
      return (
        <span className="inline-flex items-center justify-end gap-2">
          {formatNumber(wkg, 2)}
          <RatingChip rating={rating === null ? null : Math.round(rating)} />
        </span>
      )
    },
  }
}

function scoreColumn(
  id: string,
  header: string,
  title: string,
  value: (r: RosterEntry) => number | null,
): Column {
  return {
    id,
    header,
    title,
    numeric: true,
    decimals: 1,
    sortValue: value,
    cell: (r) => formatNumber(value(r)),
  }
}

function columnsFor(showWeight: boolean): Column[] {
  return [
    {
      id: 'name',
      header: 'Rider',
      title: 'Rider',
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      id: 'tier',
      header: 'Tier',
      title: 'Squad tier',
      sortValue: (r) => TIER_ORDER[r.tier],
      cell: (r) => TIER_LABELS[r.tier],
    },
    {
      id: 'base',
      header: 'Base',
      title: 'Where the rider lives',
      sortValue: (r) => r.base,
      cell: (r) => r.base ?? '–',
    },
    ...(showWeight
      ? [
          {
            id: 'weight',
            header: 'kg',
            title: 'Body weight (kg), coach and medical only',
            numeric: true,
            decimals: 1,
            sortValue: (r: RosterEntry) => r.weightKg,
            cell: (r: RosterEntry) =>
              formatNumber(r.weightKg, Number.isInteger(r.weightKg ?? 0) ? 0 : 1),
          },
        ]
      : []),
    ...ROSTER_EFFORTS.flatMap(({ id, label }) => [wattsColumn(id, label), wkgColumn(id, label)]),
    {
      id: 'quality',
      header: 'Data Quality',
      title: 'How the numbers were obtained, when not a clean maximal test',
      sortValue: (r) => (r.dataQuality ? DATA_QUALITY_LABELS[r.dataQuality] : null),
      cell: (r) =>
        r.dataQuality ? (
          <Badge variant="outline">{DATA_QUALITY_LABELS[r.dataQuality]}</Badge>
        ) : (
          <span className="text-muted-foreground">–</span>
        ),
    },
    scoreColumn('race', 'Race', 'Race score (1–5)', (r) => r.raceScore),
    scoreColumn('team', 'Team', 'Team score (1–5)', (r) => r.teamScore),
    scoreColumn('total', 'Total', 'Race plus team score', (r) => r.totalScore),
  ]
}

/** Nulls last in either direction; the default order is tier, then total, then name. */
function sortRows(rows: RosterEntry[], columns: Column[], sort: Sort | null): RosterEntry[] {
  const column = sort ? columns.find((c) => c.id === sort.id) : undefined
  return [...rows].sort((a, b) => {
    if (!column || !sort) {
      return (
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        (b.totalScore ?? -1) - (a.totalScore ?? -1) ||
        a.name.localeCompare(b.name)
      )
    }
    const x = column.sortValue(a)
    const y = column.sortValue(b)
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
    const order =
      typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
    return sort.desc ? -order : order
  })
}

export function RosterPage() {
  const role = useRole()
  const { data: riders = [], error, isPending } = useRoster()
  const [tier, setTier] = useState<TierFilter>('all')
  const [sort, setSort] = useState<Sort | null>(null)
  const [showNotes, setShowNotes] = useState(true)

  const showWeight = role === 'coach' || role === 'medical'
  const columns = useMemo(() => columnsFor(showWeight), [showWeight])
  const rows = useMemo(
    () =>
      sortRows(
        riders.filter((r) => tier === 'all' || r.tier === tier),
        columns,
        sort,
      ),
    [riders, tier, columns, sort],
  )

  // Numbers first: the first click on a numeric column puts the highest on top.
  function toggleSort(column: Column) {
    const firstDesc = column.numeric === true
    setSort((s) =>
      s?.id !== column.id
        ? { id: column.id, desc: firstDesc }
        : s.desc === firstDesc
          ? { id: column.id, desc: !firstDesc }
          : null,
    )
  }

  const tierCounts = (Object.keys(TIER_LABELS) as RosterTier[])
    .map((t) => ({ t, n: riders.filter((r) => r.tier === t).length }))
    .filter(({ n }) => n > 0)

  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <header className="space-y-1">
        <h1 id="page-title" className="text-2xl font-semibold">
          Roster {ROSTER_SEASON}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The signed riders for the {ROSTER_SEASON} season with the power they reported when they
          applied. Ratings put the reported W/kg on the active benchmark set; they are not ratings
          from synced power curves, so check the data quality before you compare them with the
          squad.
        </p>
      </header>

      {!supabase && (
        <p className="text-sm text-muted-foreground">
          This build is not connected to Supabase, and the roster has no mock data. Set{' '}
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in{' '}
          <code>apps/web/.env.local</code>.
        </p>
      )}
      {supabase && isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          The roster could not be loaded: {error.message}
        </p>
      )}

      {riders.length > 0 && (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat
              label="Riders"
              value={String(riders.length)}
              detail={tierCounts
                .map(({ t, n }) => `${n} ${TIER_LABELS[t].toLowerCase()}`)
                .join(' · ')}
            />
            {ROSTER_EFFORTS.map(({ id, label }) => (
              <Stat
                key={id}
                label={`Mean ${label} W/kg`}
                value={formatNumber(mean(rows.map((r) => r.efforts[id].wkg)), 2)}
                detail={tier === 'all' ? 'All tiers' : TIER_LABELS[tier]}
              />
            ))}
            <Stat
              label="Mean Total Score"
              value={formatNumber(mean(rows.map((r) => r.totalScore)), 1)}
              detail="Race plus team, out of 10"
            />
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <Tabs
              value={tier}
              onValueChange={(v) => {
                setTier(v as TierFilter)
              }}
            >
              <TabsList aria-label="Tiers">
                <TabsTrigger value="all">All</TabsTrigger>
                {tierCounts.map(({ t }) => (
                  <TabsTrigger key={t} value={t}>
                    {TIER_LABELS[t]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showNotes}
                onChange={(e) => {
                  setShowNotes(e.target.checked)
                }}
              />
              Show Notes
            </label>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-card">
                <tr className="border-b">
                  {columns.map((c) => {
                    const sorted = sort?.id === c.id ? (sort.desc ? 'desc' : 'asc') : null
                    return (
                      <th
                        key={c.id}
                        scope="col"
                        title={c.title}
                        aria-sort={
                          sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : undefined
                        }
                        className={cn(
                          'px-3 py-2 font-medium whitespace-nowrap text-muted-foreground',
                          c.numeric ? 'text-right' : 'text-left',
                          c.id === 'name' && 'sticky left-0 z-10 bg-card',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            toggleSort(c)
                          }}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          {c.header}
                          {sorted === 'asc' && <ArrowUp className="size-3" aria-hidden="true" />}
                          {sorted === 'desc' && <ArrowDown className="size-3" aria-hidden="true" />}
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const notes = showNotes && (Boolean(r.scoutingNotes) || Boolean(r.staffNotes))
                  return (
                    <Fragment key={r.id}>
                      <tr className={cn('hover:bg-accent/40', !notes && 'border-b')}>
                        {columns.map((c) => (
                          <td
                            key={c.id}
                            className={cn(
                              'px-3 py-2 whitespace-nowrap',
                              c.numeric && 'text-right',
                              c.id === 'name' && 'sticky left-0 z-10 bg-background',
                            )}
                          >
                            {c.cell(r)}
                          </td>
                        ))}
                      </tr>
                      {notes && (
                        <tr className="border-b">
                          <td colSpan={columns.length} className="px-3 pt-0 pb-3">
                            <div className="grid max-w-5xl gap-2 text-xs leading-relaxed md:grid-cols-2">
                              {r.scoutingNotes && (
                                <Note label="Scouting Notes">{r.scoutingNotes}</Note>
                              )}
                              {r.staffNotes && <Note label="Call Notes">{r.staffNotes}</Note>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-3 py-6 text-center text-muted-foreground"
                    >
                      No riders in this tier.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 1 && (
                <tfoot className="bg-card text-muted-foreground">
                  <tr className="border-t">
                    {columns.map((c) => (
                      <td
                        key={c.id}
                        className={cn(
                          'px-3 py-2 whitespace-nowrap',
                          c.numeric && 'text-right',
                          c.id === 'name' && 'sticky left-0 z-10 bg-card font-medium',
                        )}
                      >
                        {c.id === 'name'
                          ? 'Mean'
                          : c.decimals !== undefined
                            ? formatNumber(
                                mean(
                                  rows.map((r) => {
                                    const v = c.sortValue(r)
                                    return typeof v === 'number' ? v : null
                                  }),
                                ),
                                c.decimals,
                              )
                            : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Body weight shows for coach and medical only, call notes for the coach only. Riders
            appear in Squad once they connect intervals.icu.
          </p>
        </>
      )}

      {riders.length === 0 && !isPending && !error && supabase && (
        <p className="text-sm text-muted-foreground">
          No riders on the {ROSTER_SEASON} roster yet.
        </p>
      )}
    </section>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{detail}</dd>
    </div>
  )
}

function Note({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-sm bg-muted/40 px-2.5 py-1.5 whitespace-pre-line">
      <span className="font-medium text-foreground">{label}: </span>
      <span className="text-muted-foreground">{children}</span>
    </div>
  )
}
