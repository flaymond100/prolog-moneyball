import { useQuery } from '@tanstack/react-query'
import { Panel } from '@/pages/rider/panels.tsx'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format.ts'
import { formatDuration } from '@/lib/duration.ts'
import { supabase } from '@/lib/supabase.ts'

// Live Data: what the nightly sync has stored, straight from the database.
// A stop-gap until the data layer (TODO 4.3) feeds the real views; columns are
// named explicitly because client roles have column grants (TODO 2.10).

const BEST_DURATIONS = [5, 60, 300, 1200, 3600] as const
const RECENT_ACTIVITIES = 10

async function fetchLiveData() {
  if (!supabase) throw new Error('This build is not connected to Supabase.')
  const [athletes, activities, wellness, curves] = await Promise.all([
    supabase.from('athletes').select('id, name, active, synced_at').order('name'),
    supabase
      .from('activities')
      .select(
        'id, athlete_id, start_date_local, type, trainer, race, moving_time, icu_distance, icu_training_load, icu_weighted_avg_watts, icu_intensity, average_heartrate',
      )
      .order('start_date_local', { ascending: false })
      .limit(200),
    // Wellness is health data: viewers get no rows (KB §11), which is fine here.
    supabase
      .from('wellness')
      .select('athlete_id, date, ctl, atl, ramp_rate')
      .order('date', { ascending: false })
      .limit(400),
    supabase
      .from('power_curves')
      .select('athlete_id, as_of, time_window, secs, watts, wkg')
      .eq('time_window', '84d')
      .order('as_of', { ascending: false })
      .limit(100),
  ])
  for (const result of [athletes, activities, wellness, curves]) {
    if (result.error) throw new Error(result.error.message)
  }
  return {
    athletes: athletes.data ?? [],
    activities: activities.data ?? [],
    wellness: wellness.data ?? [],
    curves: curves.data ?? [],
  }
}

type LiveData = Awaited<ReturnType<typeof fetchLiveData>>

export function LivePage() {
  const { data, error, isPending } = useQuery({
    queryKey: ['live-data'],
    queryFn: fetchLiveData,
    enabled: supabase !== null,
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Live Data</h1>
        <p className="text-sm text-muted-foreground">
          What the nightly sync has stored for each athlete. The other views still show mock riders
          until they are connected to this data.
        </p>
      </header>

      {!supabase && (
        <p className="text-sm text-muted-foreground">
          This build is not connected to Supabase. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>apps/web/.env.local</code>.
        </p>
      )}
      {supabase && isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          The data could not be loaded: {error.message}
        </p>
      )}
      {data?.athletes.length === 0 && (
        <p className="text-sm text-muted-foreground">No athletes synced yet.</p>
      )}
      {data?.athletes.map((athlete) => (
        <AthleteCard key={athlete.id} athlete={athlete} data={data} />
      ))}
    </div>
  )
}

function AthleteCard({ athlete, data }: { athlete: LiveData['athletes'][number]; data: LiveData }) {
  const activities = data.activities.filter((a) => a.athlete_id === athlete.id)
  const load = data.wellness.find((w) => w.athlete_id === athlete.id && w.ctl !== null)
  const curve = data.curves.find((c) => c.athlete_id === athlete.id)
  const tsb = load?.ctl != null && load.atl != null ? load.ctl - load.atl : null

  return (
    <Panel title={athlete.name}>
      <p className="mb-3 text-xs text-muted-foreground">
        intervals.icu {athlete.id} · {athlete.active ? 'coached' : 'no longer coached'} · synced{' '}
        {formatDateTime(athlete.synced_at)}
      </p>

      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <Stat label="Fitness (CTL)" value={load?.ctl} />
        <Stat label="Fatigue (ATL)" value={load?.atl} />
        <Stat label="Form (TSB)" value={tsb} signed />
        <Stat label="Ramp Rate" value={load?.ramp_rate} decimals={1} signed />
      </dl>
      {load && (
        <p className="mt-1 text-xs text-muted-foreground">Load as of {formatDate(load.date)}</p>
      )}

      <h3 className="mt-5 mb-2 text-sm font-medium">84-Day Best Power</h3>
      {curve ? (
        <table className="w-full max-w-xl text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-normal">Duration</th>
              <th className="py-1 font-normal">Watts</th>
              <th className="py-1 font-normal">W/kg</th>
            </tr>
          </thead>
          <tbody>
            {BEST_DURATIONS.map((secs) => {
              const i = curve.secs.indexOf(secs)
              const watts = i >= 0 ? curve.watts[i] : undefined
              const wkg = i >= 0 ? curve.wkg?.[i] : undefined
              return (
                <tr key={secs} className="border-t">
                  <td className="py-1">{formatDuration(secs)}</td>
                  <td className="py-1">{watts === undefined ? '—' : formatNumber(watts)}</td>
                  <td className="py-1">{wkg === undefined ? '—' : formatNumber(wkg, 2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">No power curve synced yet.</p>
      )}

      <h3 className="mt-5 mb-2 text-sm font-medium">Recent Workouts</h3>
      {activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No workouts stored yet. Workouts that come in via Strava are skipped: connect the device
          directly in intervals.icu.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 font-normal">Date</th>
                <th className="py-1 font-normal">Type</th>
                <th className="py-1 font-normal">Duration</th>
                <th className="py-1 font-normal">Distance</th>
                <th className="py-1 font-normal">Load</th>
                <th className="py-1 font-normal">NP</th>
                <th className="py-1 font-normal">IF</th>
                <th className="py-1 font-normal">Avg HR</th>
              </tr>
            </thead>
            <tbody>
              {activities.slice(0, RECENT_ACTIVITIES).map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="py-1">{formatDate(a.start_date_local.slice(0, 10))}</td>
                  <td className="py-1">
                    {a.type ?? '—'}
                    {a.trainer ? ' (indoor)' : ''}
                    {a.race ? ' · race' : ''}
                  </td>
                  <td className="py-1">{hoursMinutes(a.moving_time)}</td>
                  <td className="py-1">
                    {a.icu_distance == null ? '—' : `${formatNumber(a.icu_distance / 1000, 1)} km`}
                  </td>
                  <td className="py-1">{orDash(a.icu_training_load)}</td>
                  <td className="py-1">
                    {a.icu_weighted_avg_watts == null
                      ? '—'
                      : `${formatNumber(a.icu_weighted_avg_watts)} W`}
                  </td>
                  <td className="py-1">
                    {a.icu_intensity == null ? '—' : formatNumber(a.icu_intensity / 100, 2)}
                  </td>
                  <td className="py-1">{orDash(a.average_heartrate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function Stat({
  label,
  value,
  decimals = 0,
  signed = false,
}: {
  label: string
  value: number | null | undefined
  decimals?: number
  signed?: boolean
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg tabular-nums">
        {value == null ? '—' : formatNumber(value, decimals, signed)}
      </dd>
    </div>
  )
}

function orDash(value: number | null): string {
  return value == null ? '—' : formatNumber(value)
}

function hoursMinutes(secs: number | null): string {
  if (secs == null) return '—'
  const minutes = Math.round(secs / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} h`
}
