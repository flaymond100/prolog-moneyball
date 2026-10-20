import { Link, Outlet } from '@tanstack/react-router'
import {
  Activity,
  ChartScatter,
  FlaskConical,
  GitCompareArrows,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge.tsx'
import { MOCK_AS_OF } from '@/data/mock/riders.ts'
import { ROLE_LABELS, setRole, useRole, type StaffRole } from '@/data/role-store.ts'
import { formatDate } from '@/lib/format.ts'

interface NavItem {
  to: '/squad' | '/form' | '/compare' | '/scatter' | '/tests' | '/settings'
  label: string
  icon: LucideIcon
}

// Navigation order from KB §12.
const NAV: readonly NavItem[] = [
  { to: '/squad', label: 'Squad', icon: Users },
  { to: '/form', label: 'Form', icon: Activity },
  { to: '/compare', label: 'Compare', icon: GitCompareArrows },
  { to: '/scatter', label: 'Scatter', icon: ChartScatter },
  { to: '/tests', label: 'Tests', icon: FlaskConical },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  const role = useRole()
  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="Main"
        className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      >
        <div className="px-4 py-4 text-sm font-semibold tracking-wide">
          PROLOG <span className="text-sidebar-primary">Moneyball</span>
        </div>
        <ul className="space-y-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm hover:bg-sidebar-accent"
                activeProps={{ className: 'bg-sidebar-accent text-sidebar-primary' }}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 items-center justify-between border-b px-6 text-sm">
          <span className="text-muted-foreground">As of {formatDate(MOCK_AS_OF)}</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-muted-foreground">
              Viewing As
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as StaffRole)
                }}
                className="h-7 rounded-md border bg-transparent px-1.5 text-sm text-foreground"
              >
                {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <Badge
              variant="outline"
              title="Two synthetic riders; ratings and models are fixed values"
            >
              Mock Data
            </Badge>
          </div>
        </header>
        <main aria-label="PROLOG Moneyball" className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
