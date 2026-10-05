// #297 part 2 — Button and form fields.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { Button } from './Button'
import { Field } from './Field'

afterEach(cleanup)

describe('#297 — Button', () => {
  it('md is 44 tall, sm is 36, both weight 600', () => {
    render(
      <>
        <Button>Save</Button>
        <Button size="sm" variant="secondary">
          Discard
        </Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Save' }).className).toMatch(/min-h-tap.*font-semibold|font-semibold.*min-h-tap/)
    expect(screen.getByRole('button', { name: 'Discard' }).className).toMatch(/\bh-9\b/)
  })

  it('renders a link when given an href', () => {
    render(<Button href="/explore">Go to Explore</Button>)
    expect(screen.getByRole('link', { name: 'Go to Explore' })).toHaveAttribute('href', '/explore')
  })

  it('danger is only for a confirm', () => {
    render(<Button variant="danger">Remove</Button>)
    expect(screen.getByRole('button', { name: 'Remove' }).dataset.variant).toBe('danger')
  })
})

describe('#297 — Field', () => {
  it('labels its control, with a hint and an inline error tied to it', () => {
    render(
      <Field label="Page name" hint="Shown on your Page and in Explore." error="Add a name.">
        {(props) => <input {...props} />}
      </Field>,
    )
    const input = screen.getByLabelText('Page name')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/Shown on your Page.*Add a name\./)
    expect(screen.getByRole('alert')).toHaveTextContent('Add a name.')
  })

  it('carries no error state when there is none', () => {
    render(<Field label="Email">{(props) => <input {...props} />}</Field>)
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
