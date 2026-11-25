import { Link, Outlet } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Activity,
  ChartScatter,
  ClipboardList,
  Database,
  FlaskConical,
  GitCompareArrows,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/auth/auth-context.ts'
import prologLogo from '@/assets/prolog-logo.svg'
import prologMark from '@/assets/prolog-mark.svg'
import { SyncBanner } from '@/components/sync-banner.tsx'
import { SquadGate } from '@/components/view-state.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { MOCK_AS_OF } from '@/data/mock/riders.ts'
import { supabase } from '@/lib/supabase.ts'
import { useRatingMode } from '@/data/rating-mode-store.ts'
import { ROLE_LABELS, setRole, useRole, type StaffRole } from '@/data/role-store.ts'
import { formatDate } from '@/lib/format.ts'
import { cn } from '@/lib/utils.ts'

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
  // What the nightly sync stored per athlete, as a check on the sync.
  { to: '/live', label: 'Live Data', icon: Database },
]

// The menu's collapsed state is a per-browser convenience; storage may be unavailable.
const COLLAPSED_KEY = 'prolog-moneyball-sidebar-collapsed'

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function storeCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // Not remembered; the menu still works for this visit.
  }
}

export function AppShell() {
  const role = useRole()
  const { state, signOut } = useAuth()
  const mock = state.status === 'staff' && state.mock
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const ratingMode = useRatingMode()

  function toggle() {
    setCollapsed((c) => {
      storeCollapsed(!c)
      return !c
    })
  }

  return (
    <div className="flex min-h-screen">
      <nav
        id="main-nav"
        aria-label="Main"
        className={cn(
          'sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
          collapsed ? 'w-16' : 'w-56',
        )}
      >
        <div className={cn('flex items-center py-5', collapsed ? 'justify-center' : 'px-5')}>
          <Link
            to="/"
            title="Home"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {collapsed ? (
              <img src={prologMark} alt="PROLOG Audare Cycling Team, Home" className="h-7 w-auto" />
            ) : (
              <img src={prologLogo} alt="PROLOG Audare Cycling Team, Home" className="h-8 w-auto" />
            )}
          </Link>
        </div>
        <p
          className={cn(
            'px-5 pt-2 pb-2 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase',
            collapsed && 'sr-only',
          )}
        >
          Views
        </p>
        <ul className={cn('space-y-1', collapsed ? 'px-2' : 'px-3')}>
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                // Collapsed: icon only, the label stays for screen readers and as a tooltip.
                title={collapsed ? label : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  collapsed ? 'justify-center px-0' : 'px-3',
                )}
                activeProps={{
                  className:
                    'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:bg-sidebar-primary hover:text-sidebar-primary-foreground',
                }}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className={cn('whitespace-nowrap', collapsed && 'sr-only')}>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div
          className={cn('mt-auto border-t border-sidebar-border py-3', collapsed ? 'px-2' : 'px-3')}
        >
          <button
            type="button"
            onClick={toggle}
            aria-controls="main-nav"
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand Menu' : undefined}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              collapsed ? 'justify-center px-0' : 'px-3',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span className={cn('whitespace-nowrap', collapsed && 'sr-only')}>
              {collapsed ? 'Expand Menu' : 'Collapse Menu'}
            </span>
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/90 px-6 text-sm backdrop-blur">
          <span className="text-muted-foreground">
            As of {formatDate(supabase ? new Date().toISOString().slice(0, 10) : MOCK_AS_OF)}
          </span>
          <div className="flex items-center gap-3">
            {ratingMode === 'squad' && (
              <Link to="/settings" title="Change in Settings → Benchmark Set">
                <Badge variant="secondary">Squad-Relative Ratings</Badge>
              </Link>
            )}
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
          <SquadGate>
            <Outlet />
          </SquadGate>
        </main>
      </div>
    </div>
  )
}
