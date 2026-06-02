import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { APP_NAME } from './app-brand'
import App from './App.tsx'

describe('App', () => {
  test('renders title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: APP_NAME })).toBeInTheDocument()
  })
})
