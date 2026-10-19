import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { createElement } from 'react'
import { AppShell } from '@/components/app-shell.tsx'
import { PalettePage } from '@/pages/dev/palette.tsx'
import { NotFoundPage } from '@/pages/not-found.tsx'
import { PlaceholderPage } from '@/pages/placeholder.tsx'
import { RiderPage } from '@/pages/rider.tsx'
import { SquadPage } from '@/pages/squad.tsx'

// Hash history: GitHub Pages has no server-side rewrites, so every deep link
// (`/#/compare?a=…`) must resolve to index.html and survive a hard refresh.
const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundPage,
})

// Staff views share the sidebar shell; dev pages stand alone.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppShell,
})

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing
    throw redirect({ to: '/squad', replace: true })
  },
})

const squadRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/squad',
  component: SquadPage,
})

const riderRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/riders/$riderId',
  component: RiderPage,
})

function placeholder<TPath extends string>(path: TPath, title: string, task: string) {
  return createRoute({
    getParentRoute: () => appRoute,
    path,
    component: () => createElement(PlaceholderPage, { title, task }),
  })
}

const paletteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/palette',
  component: PalettePage,
})

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([
    indexRoute,
    squadRoute,
    riderRoute,
    placeholder('/form', 'Form', '6.6'),
    placeholder('/compare', 'Compare', '6.3'),
    placeholder('/scatter', 'Scatter', '6.5'),
    placeholder('/tests', 'Tests', '6.7'),
    placeholder('/settings', 'Settings', '6.8'),
  ]),
  paletteRoute,
])

export function createAppRouter() {
  return createRouter({ routeTree, history: createHashHistory() })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
