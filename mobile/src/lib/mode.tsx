import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { prefs } from './prefs'

export type Mode = 'learner' | 'trainer'

const KEY = 'mode'

interface ModeValue {
  /** `null` tant que la préférence n'est pas lue. */
  mode: Mode | null
  setMode: (mode: Mode) => Promise<void>
}

const ModeContext = createContext<ModeValue | null>(null)

/**
 * Mode apprenant ou formateur, comme le « mode hôte » d'Airbnb : un
 * formateur garde tout ce qu'a un apprenant, et bascule d'un geste vers son
 * espace de pilotage, qui a sa propre barre d'onglets. Le choix est retenu sur
 * l'appareil ; il revient à « apprenant » à la déconnexion et pour tout compte
 * qui n'est pas formateur.
 */
export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode | null>(null)

  useEffect(() => {
    prefs.get(KEY).then((v) => setModeState(v === 'trainer' ? 'trainer' : 'learner')).catch(() => setModeState('learner'))
  }, [])

  const setMode = useCallback(async (next: Mode) => {
    setModeState(next)
    await prefs.set(KEY, next).catch(() => {})
  }, [])

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode])
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export function useMode(): ModeValue {
  const value = useContext(ModeContext)
  if (!value) throw new Error('useMode hors de ModeProvider')
  return value
}
