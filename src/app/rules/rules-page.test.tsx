import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import RulesPage from './page'
import { COPY } from '@/lib/copy'

describe('Rules page', () => {
  // [guards ethos-decency] the rules open by assuming the best and close with the thanks.
  it('opens with the ethos line and closes with the decency thanks', () => {
    const { getByTestId } = render(<RulesPage />)
    expect(getByTestId('rules-intro').textContent).toBe(COPY.rulesIntro)
    expect(getByTestId('rules-thanks').textContent).toBe(COPY.decencyThanks)
  })
})
