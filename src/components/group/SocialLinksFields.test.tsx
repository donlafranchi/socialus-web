import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SocialLinksFields } from './SocialLinksFields'

afterEach(cleanup)

describe('SocialLinksFields — the control belongs to the kind', () => {
  it('renders for a kind that carries links', () => {
    render(<SocialLinksFields kind="business" value={{}} onChange={vi.fn()} />)
    expect(screen.getByTestId('social-links-fields')).toBeInTheDocument()
  })

  // family is the community set with privacy on. Nothing it publishes is
  // visible outside it, so a links-out control is meaningless there.
  it('renders nothing at all for family', () => {
    const { container } = render(<SocialLinksFields kind="family" value={{}} onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a kind it does not recognise', () => {
    const { container } = render(<SocialLinksFields kind="whatever" value={{}} onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('reports what was typed', () => {
    const onChange = vi.fn()
    render(<SocialLinksFields kind="business" value={{}} onChange={onChange} />)
    fireEvent.change(screen.getByTestId('social-instagram'), {
      target: { value: 'https://instagram.com/claras' },
    })
    expect(onChange).toHaveBeenCalledWith({ instagram: 'https://instagram.com/claras' })
  })

  it('clearing a field removes the platform rather than storing an empty string', () => {
    const onChange = vi.fn()
    render(
      <SocialLinksFields kind="business" value={{ instagram: 'https://x.example' }} onChange={onChange} />,
    )
    fireEvent.change(screen.getByTestId('social-instagram'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({})
  })

  it('says so before submit when a link is not https', () => {
    render(<SocialLinksFields kind="business" value={{ instagram: 'instagram.com/claras' }} onChange={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/https/i)
    expect(screen.getByTestId('social-instagram')).toHaveAttribute('aria-invalid', 'true')
  })

  it('stays quiet about an empty field', () => {
    render(<SocialLinksFields kind="business" value={{}} onChange={vi.fn()} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
