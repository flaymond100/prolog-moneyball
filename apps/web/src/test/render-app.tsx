import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { AuthState } from '@/auth/auth-context.ts'
import { StaticAuthProvider } from '@/auth/auth.tsx'
import { createAppRouter } from '@/router.ts'

const MOCK_COACH: AuthState = { status: 'staff', email: null, role: 'coach', mock: true }

/** Render the whole app at a hash route, with a fresh router and query cache, signed in as `auth`. */
export function renderAt(path: string, auth: AuthState = MOCK_COACH) {
  window.location.hash = path
  const router = createAppRouter()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <StaticAuthProvider state={auth}>
          <RouterProvider router={router} />
        </StaticAuthProvider>
      </QueryClientProvider>,
    ),
  }
}
