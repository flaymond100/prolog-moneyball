import { Link } from '@tanstack/react-router'

export function NotFoundPage() {
  return (
    <main aria-label="PROLOG Moneyball" className="space-y-2 p-6">
      <h1 className="text-2xl font-semibold">Page Not Found</h1>
      <Link to="/" className="text-primary underline-offset-4 hover:underline">
        Back to Home
      </Link>
    </main>
  )
}
