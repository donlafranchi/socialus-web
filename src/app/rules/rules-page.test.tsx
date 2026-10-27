import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import RulesPage from './page'
import { COPY } from '@/lib/copy'
import { CREATOR_RULES } from '@/lib/creator-rules'

describe('Rules page', () => {
  // Only the necessary (the PM, 2026-10-27): the headline, the four rule lines, the thanks. No intro, no reasons.
  it('is the headline, the four rule lines and the decency thanks, nothing else', () => {
    const { getByTestId, queryByTestId, getAllByRole } = render(<RulesPage />)
    expect(getByTestId('rules-headline').textContent).toBe("Be cool. Don't be a jerk.")
    expect(queryByTestId('rules-intro')).toBeNull()
    expect(getAllByRole('listitem').map((li) => li.textContent)).toEqual(CREATOR_RULES.map((r) => r.rule))
    expect(getByTestId('rules-thanks').textContent).toBe(COPY.decencyThanks)
  })
})
