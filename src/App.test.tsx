import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App.tsx'

describe('App', () => {
  test('renders title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Wirer' })).toBeInTheDocument()
  })
})
