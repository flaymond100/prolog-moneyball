import { RatingChip } from '@/components/rating-chip.tsx'

const ratings = Array.from({ length: 20 }, (_, i) => i + 1)

const palettes = [
  { id: 'default', title: 'Default Palette' },
  { id: 'colour-blind', title: 'Colour-Blind-Safe Palette' },
] as const

const swatches = [
  { name: 'Espresso', className: 'bg-espresso' },
  { name: 'Deep Blue', className: 'bg-deep-blue' },
  { name: 'Champagne Gold', className: 'bg-gold' },
  { name: 'Cream', className: 'bg-cream' },
] as const

export function PalettePage() {
  return (
    <main aria-label="PROLOG Moneyball" className="mx-auto max-w-4xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Palette</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Brand Colours</h2>
        <ul className="flex flex-wrap gap-4">
          {swatches.map((s) => (
            <li key={s.name} className="flex items-center gap-2 text-sm">
              <span className={`size-8 rounded-sm border ${s.className}`} aria-hidden="true" />
              {s.name}
            </li>
          ))}
        </ul>
      </section>

      {palettes.map((p) => (
        <section
          key={p.id}
          data-palette={p.id}
          aria-labelledby={`palette-${p.id}`}
          className="space-y-3"
        >
          <h2 id={`palette-${p.id}`} className="text-lg font-medium">
            {p.title}
          </h2>
          <ul className="flex flex-wrap gap-2" aria-label={`Rating chips 1–20, ${p.title}`}>
            {ratings.map((r) => (
              <li key={r}>
                <RatingChip rating={r} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Tabular Numerals</h2>
        <table className="text-sm">
          <tbody>
            {['4.11', '11.18', '5.80', '15.30'].map((v) => (
              <tr key={v}>
                <td className="pr-4 text-right">{v} W/kg</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
