import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx'
import { useAnthropometrics, useSquad } from '@/data/queries.ts'
import { formatDate, formatNumber } from '@/lib/format.ts'
import { LabTimeline } from '@/pages/rider/history.tsx'
import { Panel } from '@/pages/rider/panels.tsx'
import { DeltaTable, SlopeChart, Vo2VlaQuadrant } from '@/pages/tests/analysis.tsx'
import { AnthropometricsForm, LabTestForm } from '@/pages/tests/forms.tsx'

export function TestsPage() {
  const { data: riders = [] } = useSquad()
  const { data: measurements = [] } = useAnthropometrics()
  const [riderId, setRiderId] = useState('')
  const rider = riders.find((r) => r.id === riderId) ?? riders[0]

  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <h1 id="page-title" className="text-2xl font-semibold">
        Tests
      </h1>

      <Panel title="New Entry">
        <Tabs defaultValue="lab">
          <TabsList>
            <TabsTrigger value="lab">Lab Test</TabsTrigger>
            <TabsTrigger value="body">Measurements</TabsTrigger>
          </TabsList>
          <TabsContent value="lab" className="pt-3">
            <LabTestForm riders={riders} />
          </TabsContent>
          <TabsContent value="body" className="space-y-4 pt-3">
            <AnthropometricsForm riders={riders} />
            {measurements.length > 0 && (
              <table className="text-sm">
                <caption className="pb-1 text-left text-xs text-muted-foreground">
                  Measurements entered this session
                </caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    {['Rider', 'Date', 'Height (cm)', 'Weight (kg)', 'Body Fat (%)'].map((h) => (
                      <th key={h} scope="col" className="pr-6 text-left font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((m) => (
                    <tr key={`${m.athleteId}-${m.date}`}>
                      <td className="pr-6">{riders.find((r) => r.id === m.athleteId)?.name}</td>
                      <td className="pr-6">{formatDate(m.date)}</td>
                      <td className="pr-6">
                        {m.heightCm === null ? '–' : formatNumber(m.heightCm, 1)}
                      </td>
                      <td className="pr-6">
                        {m.weightKg === null ? '–' : formatNumber(m.weightKg, 1)}
                      </td>
                      <td className="pr-6">
                        {m.bodyFatPct === null ? '–' : formatNumber(m.bodyFatPct, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>
        </Tabs>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            Rider
            <select
              value={rider?.id ?? ''}
              onChange={(e) => {
                setRiderId(e.target.value)
              }}
              className="h-8 rounded-md border bg-transparent px-2 text-sm"
            >
              {riders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {rider && <LabTimeline rider={rider} />}
        </div>
        <Vo2VlaQuadrant riders={riders} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SlopeChart riders={riders} />
        <DeltaTable riders={riders} />
      </div>
    </section>
  )
}
