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

  it('lists the six views in KB order', async () => {
    renderAt('/squad')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Squad', 'Form', 'Compare', 'Scatter', 'Tests', 'Settings'])
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

  it.each([
    ['/form', 'Form', '6.6'],
    ['/scatter', 'Scatter', '6.5'],
    ['/tests', 'Tests', '6.7'],
    ['/settings', 'Settings', '6.8'],
  ])('shows a placeholder at %s', async (path, title, task) => {
    renderAt(path)
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(`This view arrives with task ${task}.`)).toBeInTheDocument()
  })
})
