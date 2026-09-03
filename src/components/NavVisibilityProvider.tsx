'use client'

import { createContext, useContext } from 'react'
import { usePathname } from 'next/navigation'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { useOverlayOpen } from '@/hooks/useOverlayOpen'
import { useKeyboardOpen } from '@/hooks/useKeyboardOpen'

export const NavVisibilityContext = createContext(true)

/** Read whether the bottom nav is on screen — the F045 pill row consumes this. */
export function useNavVisible(): boolean {
  return useContext(NavVisibilityContext)
}

export function NavVisibilityProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const overlayOpen = useOverlayOpen()
  const keyboardOpen = useKeyboardOpen()
  const scrollVisible = useScrollDirection({ paused: overlayOpen, resetKey: pathname })

  // The keyboard wins over the freeze: a nav floating above the keyboard is the
  // failure this guards against, overlay or not.
  return (
    <NavVisibilityContext.Provider value={keyboardOpen ? false : scrollVisible}>
      {children}
    </NavVisibilityContext.Provider>
  )
}
