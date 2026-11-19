import { Link, Outlet } from '@tanstack/react-router'
import {
  Activity,
  ChartScatter,
  ClipboardList,
  Database,
  FlaskConical,
  GitCompareArrows,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/auth/auth-context.ts'
import { SyncBanner } from '@/components/sync-banner.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { MOCK_AS_OF } from '@/data/mock/riders.ts'
import { supabase } from '@/lib/supabase.ts'
import { ROLE_LABELS, setRole, useRole, type StaffRole } from '@/data/role-store.ts'
import { formatDate } from '@/lib/format.ts'

interface NavItem {
  to: '/squad' | '/form' | '/compare' | '/scatter' | '/tests' | '/settings' | '/roster' | '/live'
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
  // Signed riders with their reported numbers, until they sync from intervals.icu.
  { to: '/roster', label: 'Roster 2027', icon: ClipboardList },
  // Stored sync data, until the views above read it (TODO 4.3).
  { to: '/live', label: 'Live Data', icon: Database },
]

export function AppShell() {
  const role = useRole()
  const { state, signOut } = useAuth()
  const mock = state.status === 'staff' && state.mock
  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="Main"
        className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground"
          >
            P
          </span>
          <span className="text-sm font-semibold whitespace-nowrap text-foreground">
            PROLOG <span className="text-sidebar-primary">Moneyball</span>
          </span>
        </div>
        <p className="px-5 pt-2 pb-2 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
          Views
        </p>
        <ul className="space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeProps={{
                  className:
                    'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:bg-sidebar-primary hover:text-sidebar-primary-foreground',
                }}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/90 px-6 text-sm backdrop-blur">
          <span className="text-muted-foreground">
            As of {formatDate(supabase ? new Date().toISOString().slice(0, 10) : MOCK_AS_OF)}
          </span>
          <div className="flex items-center gap-3">
            {mock ? (
              // Dev build on mock data: preview what each role sees.
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
            ) : (
              <>
                <span className="text-muted-foreground">
                  {state.status === 'staff' && state.email} · {ROLE_LABELS[role]}
                </span>
                <Button variant="outline" size="xs" onClick={() => void signOut()}>
                  Sign Out
                </Button>
              </>
            )}
            {!supabase && (
              <Badge
                variant="outline"
                title="Synthetic riders; ratings and models are fixed values"
              >
                Mock Data
              </Badge>
            )}
          </div>
        </header>
        <SyncBanner />
        <main aria-label="PROLOG Moneyball" className="flex-1 px-6 py-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
