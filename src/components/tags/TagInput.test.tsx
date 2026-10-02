// #316 — the tag box behaves like a hashtag box.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { TagInput } from './TagInput'

afterEach(cleanup)
const setup = (tags: string[] = []) => {
  const onChange = vi.fn()
  render(<TagInput idPrefix="t" value={{ tags, draft: '' }} onChange={onChange} />)
  return { onChange, input: screen.getByTestId('t-input') }
}

describe('#316 — typing tags', () => {
  it('a typed # is ignored: #bread is the tag bread', () => {
    const { onChange, input } = setup()
    fireEvent.change(input, { target: { value: '#bread,' } })
    expect(onChange).toHaveBeenLastCalledWith({ tags: ['bread'], draft: '' })
  })

  it('a space commits the tag, as with hashtags', () => {
    const { onChange, input } = setup()
    fireEvent.change(input, { target: { value: 'sourdough ' } })
    expect(onChange).toHaveBeenLastCalledWith({ tags: ['sourdough'], draft: '' })
  })

  it('a lone # or space commits nothing', () => {
    const { onChange, input } = setup()
    fireEvent.change(input, { target: { value: '#' } })
    expect(onChange).toHaveBeenLastCalledWith({ tags: [], draft: '' })
    fireEvent.change(input, { target: { value: ' ' } })
    expect(onChange).toHaveBeenLastCalledWith({ tags: [], draft: '' })
  })

  it('shows the tags it has as #tags', () => {
    setup(['bread'])
    expect(screen.getByTestId('t-list')).toHaveTextContent('#bread')
  })
})
