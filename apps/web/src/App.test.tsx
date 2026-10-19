import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '@/App.tsx'

describe('App', () => {
  afterEach(() => {
    window.location.hash = ''
  })

  it('renders the main landmark', async () => {
    render(<App />)
    expect(await screen.findByRole('main', { name: 'PROLOG Moneyball' })).toBeInTheDocument()
  })
})
