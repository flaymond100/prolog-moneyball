import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderAt } from '@/test/render-app.tsx'

describe('AppShell', () => {
  afterEach(() => {
    window.location.hash = ''
  })

  it('redirects the home route to Squad', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: 'Squad', level: 1 })).toBeInTheDocument()
  })

  it('links the logo home, then lists the six views in KB order, Roster 2027 and Live Data', async () => {
    renderAt('/squad')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    const [logo, ...views] = within(nav).getAllByRole('link')
    expect(logo).toHaveAccessibleName('PROLOG Audare Cycling Team, Home')
    expect(logo).toHaveAttribute('href', '/#/')
    expect(views.map((l) => l.textContent)).toEqual([
      'Squad',
      'Form',
      'Compare',
      'Scatter',
      'Tests',
      'Settings',
      'Roster 2027',
      'Live Data',
    ])
  })

  it('marks the current view in the navigation', async () => {
    renderAt('/compare')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Compare' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows the mock-data badge and the as-of date', async () => {
    renderAt('/squad')
    expect(await screen.findByText('Mock Data')).toBeInTheDocument()
    expect(screen.getByText('As of 19 October 2026')).toBeInTheDocument()
  })
})
