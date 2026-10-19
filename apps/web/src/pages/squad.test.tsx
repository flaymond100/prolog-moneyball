import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderAt } from '@/test/render-app.tsx'

describe('SquadPage', () => {
  afterEach(() => {
    window.location.hash = ''
  })

  it('lists both mock riders with type, age and CA', async () => {
    renderAt('/squad')
    const list = await screen.findByRole('list', { name: 'Riders' })
    const items = await within(list).findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Erika Mustermann')
    expect(items[0]).toHaveTextContent('Climber · 26 years')
    expect(items[0]).toHaveTextContent('13.9')
    expect(items[1]).toHaveTextContent('Lena Beispiel')
    expect(items[1]).toHaveTextContent('Sprinter · 21 years')
  })

  it('links each rider to their profile', async () => {
    renderAt('/squad')
    const link = await screen.findByRole('link', { name: 'Erika Mustermann' })
    expect(link).toHaveAttribute('href', '/#/riders/i900001')
  })
})

describe('RiderPage', () => {
  afterEach(() => {
    window.location.hash = ''
  })

  it('shows the rider name', async () => {
    renderAt('/riders/i900002')
    expect(
      await screen.findByRole('heading', { name: 'Lena Beispiel', level: 1 }),
    ).toBeInTheDocument()
  })

  it('handles an unknown rider', async () => {
    renderAt('/riders/nobody')
    expect(await screen.findByRole('heading', { name: 'Rider Not Found' })).toBeInTheDocument()
  })
})
