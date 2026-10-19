import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, Columns3, Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx'
import { MOCK_AS_OF } from '@/data/mock/riders.ts'
import { useSquad } from '@/data/queries.ts'
import { downloadCsv, toCsv } from '@/lib/csv.ts'
import { loadLayouts, storeLayouts, type SquadLayout } from '@/lib/saved-layouts.ts'
import { cn } from '@/lib/utils.ts'
import { COLUMN_GROUPS, squadColumns, type ColumnGroupId } from '@/pages/squad/columns.tsx'

const inputClass =
  'h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

export function SquadPage() {
  const { data: riders = [] } = useSquad()

  const [group, setGroup] = useState<ColumnGroupId>('general')
  const [hidden, setHidden] = useState<VisibilityState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [minRides, setMinRides] = useState(0)
  const [layouts, setLayouts] = useState<SquadLayout[]>(loadLayouts)
  const [layoutName, setLayoutName] = useState('')

  // Min-data filter: rides in the last 84 days (KB §12).
  const rows = useMemo(
    () => riders.filter((r) => r.training.rides84d >= minRides),
    [riders, minRides],
  )

  // A column shows when it belongs to the active tab and the chooser has not hidden it.
  const columnVisibility = useMemo<VisibilityState>(() => {
    const visibility: VisibilityState = {}
    for (const c of squadColumns) {
      const id = c.id ?? ''
      const g = c.meta?.group
      visibility[id] = g === undefined || (g === group && hidden[id] !== false)
    }
    return visibility
  }, [group, hidden])

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table v8 returns unstable functions; the compiler skips this component
  const table = useReactTable({
    data: rows,
    columns: squadColumns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const groupColumns = table.getAllLeafColumns().filter((c) => c.columnDef.meta?.group === group)

  function exportCsv() {
    const columns = table.getVisibleLeafColumns()
    const header = columns.map((c) => c.columnDef.meta?.label ?? c.id)
    const body = table
      .getRowModel()
      .rows.map((row) => columns.map((c) => c.columnDef.meta?.csv(row.original) ?? null))
    downloadCsv(`squad-${group}-${MOCK_AS_OF}.csv`, toCsv(header, body))
  }

  function saveLayout() {
    const name = layoutName.trim()
    if (!name) return
    const next = [
      ...layouts.filter((l) => l.name !== name),
      { name, group, hidden, sorting, minRides },
    ]
    setLayouts(next)
    storeLayouts(next)
    setLayoutName('')
  }

  function applyLayout(name: string) {
    const layout = layouts.find((l) => l.name === name)
    if (!layout) return
    setGroup(layout.group as ColumnGroupId)
    setHidden(layout.hidden)
    setSorting(layout.sorting)
    setMinRides(layout.minRides)
  }

  return (
    <section aria-labelledby="page-title" className="space-y-4">
      <h1 id="page-title" className="text-2xl font-semibold">
        Squad
      </h1>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={group}
          onValueChange={(v) => {
            setGroup(v as ColumnGroupId)
          }}
        >
          <TabsList aria-label="Column Groups">
            {COLUMN_GROUPS.map((g) => (
              <TabsTrigger key={g.id} value={g.id}>
                {g.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 aria-hidden="true" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Show Columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {groupColumns.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={hidden[c.id] !== false}
                onSelect={(e) => {
                  e.preventDefault()
                }}
                onCheckedChange={(checked) => {
                  setHidden((h) => ({ ...h, [c.id]: checked }))
                }}
              >
                {c.columnDef.meta?.label ?? c.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <label className="flex items-center gap-2 text-sm">
          Min. Rides (84 Days)
          <input
            type="number"
            min={0}
            value={minRides}
            onChange={(e) => {
              setMinRides(Math.max(0, Number(e.target.value)))
            }}
            className={cn(inputClass, 'w-16')}
          />
        </label>

        <Button variant="outline" size="sm" onClick={exportCsv} className="ml-auto">
          <Download aria-hidden="true" />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          Layout
          <select
            aria-label="Saved Layouts"
            value=""
            onChange={(e) => {
              applyLayout(e.target.value)
            }}
            className={inputClass}
            disabled={layouts.length === 0}
          >
            <option value="">{layouts.length === 0 ? 'No Saved Layouts' : 'Load a Layout…'}</option>
            {layouts.map((l) => (
              <option key={l.name} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <input
          aria-label="Layout Name"
          placeholder="Layout name"
          value={layoutName}
          onChange={(e) => {
            setLayoutName(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveLayout()
          }}
          className={cn(inputClass, 'w-40')}
        />
        <Button variant="secondary" size="sm" onClick={saveLayout} disabled={!layoutName.trim()}>
          Save Layout
        </Button>
        <span className="text-xs text-muted-foreground">Saved in this browser only.</span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-card">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b">
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const pinned = header.column.id === 'name'
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : undefined
                      }
                      title={header.column.columnDef.meta?.label}
                      className={cn(
                        'px-3 py-2 font-medium whitespace-nowrap text-muted-foreground',
                        header.column.columnDef.meta?.numeric ? 'text-right' : 'text-left',
                        pinned && 'sticky left-0 z-10 bg-card',
                      )}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' && <ArrowUp className="size-3" aria-hidden="true" />}
                        {sorted === 'desc' && <ArrowDown className="size-3" aria-hidden="true" />}
                      </button>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b last:border-b-0 hover:bg-accent/40">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      'px-3 py-2 whitespace-nowrap',
                      cell.column.columnDef.meta?.numeric && 'text-right',
                      cell.column.id === 'name' && 'sticky left-0 z-10 bg-background',
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={table.getVisibleLeafColumns().length}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No riders match the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
