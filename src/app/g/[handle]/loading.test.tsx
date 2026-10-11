// #555 — a Page route has its own loading boundary, so a tap on a card commits the outline at once.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import Loading from './loading'

describe('/g/[handle] loading boundary (#555)', () => {
  it('shows the Page outline while the server resolves the Page', () => {
    render(<Loading />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading this Page')
  })
})
