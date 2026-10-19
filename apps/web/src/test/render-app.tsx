import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { createAppRouter } from '@/router.ts'

/** Render the whole app at a hash route, with a fresh router and query cache. */
export function renderAt(path: string) {
  window.location.hash = path
  const router = createAppRouter()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  }
}
