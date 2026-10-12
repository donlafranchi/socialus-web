import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { AiKeyCheck } from './AiKeyCheck'

afterEach(cleanup)

describe('AiKeyCheck', () => {
  it.each([
    ['connected', 'AI moderation: connected'],
    ['not_set', 'AI moderation: not set'],
    ['rejected', 'AI moderation: key rejected'],
    ['unreachable', 'AI moderation: could not reach Anthropic'],
  ] as const)('shows %s in plain words after the button is tapped', async (result, words) => {
    const check = vi.fn(async () => result)
    render(<AiKeyCheck check={check} />)
    expect(screen.queryByTestId('ai-key-result')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /check the ai key/i }))
    await waitFor(() => expect(screen.getByTestId('ai-key-result')).toHaveTextContent(words))
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('makes no call until it is tapped', () => {
    const check = vi.fn(async () => 'connected' as const)
    render(<AiKeyCheck check={check} />)
    expect(check).not.toHaveBeenCalled()
  })

  it('a failed check says so rather than showing nothing', async () => {
    render(<AiKeyCheck check={vi.fn(async () => { throw new Error('Not permitted.') })} />)
    fireEvent.click(screen.getByRole('button', { name: /check the ai key/i }))
    await waitFor(() => expect(screen.getByTestId('ai-key-result')).toHaveTextContent(/couldn.t check/i))
  })
})
