// T114 — kind-filter pill row (F045 § "Kind-filter pills anchor above bottom nav").

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { NavVisibilityContext } from '../NavVisibilityProvider'
import { KindFilterPills } from './KindFilterPills'
import type { ItemKindFilter } from '@/lib/explore/kinds'

afterEach(cleanup)

function renderPills(opts: { selected?: ItemKindFilter; navVisible?: boolean } = {}) {
  const onSelect = vi.fn()
  render(
    <NavVisibilityContext.Provider value={opts.navVisible ?? true}>
      <KindFilterPills selected={opts.selected ?? null} onSelect={onSelect} />
    </NavVisibilityContext.Provider>,
  )
  return { onSelect, row: screen.getByTestId('kind-filter-pills') }
}

describe('KindFilterPills', () => {
  it('renders one tab per kind, All first', () => {
    renderPills()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'All',
      'Events',
      'Products',
      'Services',
      'Ideas',
      'Offers',
      'Asks',
    ])
  })

  it('is a labelled tablist', () => {
    const { row } = renderPills()
    expect(row).toHaveAttribute('role', 'tablist')
    expect(row).toHaveAccessibleName()
  })

  it('selects All by default', () => {
    renderPills()
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'false')
  })

  it('reflects the current selection', () => {
    renderPills({ selected: 'gathering' })
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'false')
  })

  it('emits the schema kind on tap — no sheet, no confirmation', () => {
    const { onSelect } = renderPills()
    fireEvent.click(screen.getByRole('tab', { name: 'Events' }))
    expect(onSelect).toHaveBeenCalledWith('gathering')
    fireEvent.click(screen.getByRole('tab', { name: 'Ideas' }))
    expect(onSelect).toHaveBeenCalledWith('wonder')
  })

  it('emits null for All', () => {
    const { onSelect } = renderPills({ selected: 'product' })
    fireEvent.click(screen.getByRole('tab', { name: 'All' }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('sits above the nav when the nav is visible', () => {
    const { row } = renderPills({ navVisible: true })
    expect(row).toHaveAttribute('data-nav-visible', 'true')
    expect(row.className).toContain('-translate-y-[var(--nav-height)]')
  })

  it('drops to the safe area when the nav hides — the pills stay put', () => {
    const { row } = renderPills({ navVisible: false })
    expect(row).toHaveAttribute('data-nav-visible', 'false')
    expect(row.className).toContain('translate-y-0')
    expect(row.className).toContain('fixed')
  })

  it('animates on the same 200ms ease-out as the nav, and not at all under reduced motion', () => {
    const { row } = renderPills()
    expect(row.className).toContain('duration-200')
    expect(row.className).toContain('ease-out')
    expect(row.className).toContain('motion-reduce:transition-none')
  })

  it('moves DOM focus onto the newly selected tab so the ring follows selection', () => {
    renderPills({ selected: 'gathering' })
    const tabs = screen.getAllByRole('tab')
    tabs[1].focus()
    fireEvent.keyDown(tabs[1], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Products' }))
  })

  it('scrolls the selected pill into view — a shared ?kind= link must show its state', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderPills({ selected: 'ask' })
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('keeps a single tab stop and moves selection with the arrow keys', () => {
    const { onSelect } = renderPills({ selected: 'gathering' })
    const tabs = screen.getAllByRole('tab')
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1)
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(tabs[1], { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('product')

    fireEvent.keyDown(tabs[1], { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('wraps at the ends and supports Home/End', () => {
    const { onSelect } = renderPills({ selected: null })
    const tabs = screen.getAllByRole('tab')
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenCalledWith('ask')

    fireEvent.keyDown(tabs[0], { key: 'End' })
    expect(onSelect).toHaveBeenCalledWith('ask')

    fireEvent.keyDown(tabs[0], { key: 'Home' })
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('extends each pill hit area to the full 44px row — the thumb zone is the point', () => {
    renderPills()
    const cls = screen.getByRole('tab', { name: 'All' }).className
    expect(cls).toContain('before:absolute')
    expect(cls).toContain('before:-top-1.5')
    expect(cls).toContain('before:-bottom-1.5')
  })

  it('links each tab to the results panel', () => {
    renderPills()
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute(
      'aria-controls',
      'explore-results',
    )
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('id', 'kind-tab-all')
  })
})
