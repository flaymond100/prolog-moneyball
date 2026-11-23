import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { useSquad } from '@/data/queries.ts'

// Loading and error states shared by the views (TODO 4.3).

/** Placeholder blocks in the shape of a view while its data loads. */
export function ViewSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="h-24 rounded-xl bg-card shadow-card" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-xl bg-card shadow-card" />
        <div className="h-64 rounded-xl bg-card shadow-card" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  )
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="max-w-xl space-y-3 rounded-xl border bg-card p-6 shadow-card">
      <h1 className="text-lg font-semibold">Something Went Wrong</h1>
      <p className="text-sm text-muted-foreground">
        The data could not be loaded. Check the connection and try again; if it keeps failing, send
        this message to Kosta:
      </p>
      <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-words">{message}</p>
      <Button onClick={onRetry}>
        <RotateCw aria-hidden="true" />
        Try Again
      </Button>
    </div>
  )
}

/** The router's error boundary for every view: the sidebar stays, the view shows this. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const queryReset = useQueryErrorResetBoundary()
  return (
    <ErrorCard
      message={error instanceof Error ? error.message : String(error)}
      onRetry={() => {
        queryReset.reset()
        reset()
        void router.invalidate()
      }}
    />
  )
}

/** Renders the views once the riders have loaded; a skeleton before, an error card on failure. */
export function SquadGate({ children }: { children: ReactNode }) {
  const squad = useSquad()
  if (squad.isPending) return <ViewSkeleton />
  if (squad.isError) {
    return (
      <ErrorCard
        message={squad.error.message}
        onRetry={() => {
          void squad.refetch()
        }}
      />
    )
  }
  return children
}
