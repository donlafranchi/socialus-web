// #806 — after a save, the claim card and the header badge show what the save
// returned, with no router refresh: a refresh could be dropped and leave the
// Page showing the claim as it was before the save.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LocallyOwnedClaim } from './LocallyOwnedClaim'
import { LocalOwnerClaimProvider, LocalOwnerBadgeChip } from './LocalOwnerClaimState'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }))
afterEach(cleanup)

function page(onSet = vi.fn(), onRemove = vi.fn(), claim = { zip: null as string | null, isProximal: false }, badge: { label: string } | null = null) {
  return render(
    <LocalOwnerClaimProvider claim={claim} badge={badge}>
      <LocalOwnerBadgeChip />
      <LocallyOwnedClaim groupId="g-1" onSet={onSet} onRemove={onRemove} />
    </LocalOwnerClaimProvider>,
  )
}

describe('the claim card and badge follow the save', () => {
  it('adding a ZIP shows it and the badge at once, without a refresh', async () => {
    const onSet = vi.fn().mockResolvedValue({ claim: { zip: '95817', isProximal: true }, badge: { label: 'Claimed local owner' } })
    page(onSet)
    expect(screen.queryByTestId('local-owner-badge')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('claim-add'))
    fireEvent.change(screen.getByTestId('claim-zip-input'), { target: { value: '95817' } })
    fireEvent.click(screen.getByTestId('claim-submit'))
    expect(await screen.findByText(/ZIP on file: 95817/)).toBeInTheDocument()
    expect(screen.getByTestId('local-owner-badge')).toHaveTextContent('Claimed local owner')
    expect(refresh).not.toHaveBeenCalled()
  })
  it('removing the claim takes the badge away', async () => {
    const onRemove = vi.fn().mockResolvedValue({ claim: { zip: null, isProximal: false }, badge: null })
    page(vi.fn(), onRemove, { zip: '95817', isProximal: true }, { label: 'Claimed local owner' })
    expect(screen.getByTestId('local-owner-badge')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('claim-remove'))
    fireEvent.click(screen.getByTestId('claim-remove-confirm'))
    expect(await screen.findByTestId('claim-add')).toBeInTheDocument()
    expect(screen.queryByTestId('local-owner-badge')).not.toBeInTheDocument()
  })
  it('a new render from the server replaces what the save set', () => {
    const { rerender } = page()
    rerender(
      <LocalOwnerClaimProvider claim={{ zip: '95819', isProximal: true }} badge={{ label: 'Claimed local owner' }}>
        <LocalOwnerBadgeChip />
        <LocallyOwnedClaim groupId="g-1" onSet={vi.fn()} onRemove={vi.fn()} />
      </LocalOwnerClaimProvider>,
    )
    expect(screen.getByText(/ZIP on file: 95819/)).toBeInTheDocument()
    expect(screen.getByTestId('local-owner-badge')).toBeInTheDocument()
  })
})
