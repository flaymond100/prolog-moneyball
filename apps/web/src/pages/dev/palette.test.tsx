import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PalettePage } from '@/pages/dev/palette.tsx'

describe('PalettePage', () => {
  it.each(['Default Palette', 'Colour-Blind-Safe Palette'])(
    'renders rating chips 1–20 in the %s',
    (title) => {
      render(<PalettePage />)
      const list = screen.getByRole('list', { name: `Rating chips 1–20, ${title}` })
      const chips = within(list).getAllByRole('listitem')
      expect(chips.map((c) => c.textContent)).toEqual(
        Array.from({ length: 20 }, (_, i) => String(i + 1)),
      )
    },
  )

  it('scopes the colour-blind palette with a data attribute', () => {
    render(<PalettePage />)
    const section = screen.getByRole('region', { name: 'Colour-Blind-Safe Palette' })
    expect(section).toHaveAttribute('data-palette', 'colour-blind')
  })
})
