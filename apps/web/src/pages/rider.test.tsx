import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderAt } from '@/test/render-app.tsx'

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
