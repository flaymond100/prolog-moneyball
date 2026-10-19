import { PalettePage } from '@/pages/dev/palette.tsx'

// Temporary hash check; TanStack Router replaces this in 1.6.
export default function App() {
  if (window.location.hash === '#/dev/palette') return <PalettePage />
  return <main aria-label="PROLOG Moneyball" />
}
