import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { PalettePage } from '@/pages/dev/palette.tsx'
import { HomePage } from '@/pages/home.tsx'
import { NotFoundPage } from '@/pages/not-found.tsx'

// Hash history: GitHub Pages has no server-side rewrites, so every deep link
// (`/#/compare?a=…`) must resolve to index.html and survive a hard refresh.
const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundPage,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const paletteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev/palette',
  component: PalettePage,
})

const routeTree = rootRoute.addChildren([indexRoute, paletteRoute])

export function createAppRouter() {
  return createRouter({ routeTree, history: createHashHistory() })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
