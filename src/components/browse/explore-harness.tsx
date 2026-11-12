// Test harness: Explore as the layout shows it, with the header's search pill lent the live box.
import type { ReactElement } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExploreSearchProvider } from '@/components/shell/explore-search'
import { HeaderSearch } from '@/components/shell/HeaderSearch'
import { CreateMenu } from '@/components/create/CreateMenu'

/** `create` adds the ➕, which needs useAuth mocked. */
export const renderExplore = (ui: ReactElement, { create = false } = {}) =>
  render(
    <ExploreSearchProvider>
      <HeaderSearch />
      {create && <CreateMenu />}
      {ui}
    </ExploreSearchProvider>,
  )

const openPanel = () => {
  if (!screen.queryByTestId('search-panel')) fireEvent.click(screen.getByTestId('search-pill'))
}

export function searchBox(): HTMLInputElement {
  openPanel()
  return screen.getByTestId('search-input') as HTMLInputElement
}

export function openArea() {
  openPanel()
  fireEvent.click(screen.getByTestId('search-where'))
}

export function openFilters() {
  openPanel()
  fireEvent.click(screen.getByTestId('search-filters'))
}

/** The List/Map switch, in the ➕ menu. */
export function switchView() {
  fireEvent.click(screen.getByTestId('create-menu'))
  fireEvent.click(screen.getByTestId('create-menu-view'))
}
