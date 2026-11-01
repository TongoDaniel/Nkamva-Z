import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { prefs } from './prefs'

const KEY = 'onboarding.done'

interface OnboardingValue {
  /** `null` tant que la préférence n'est pas lue. */
  done: boolean | null
  complete: () => Promise<void>
}

const OnboardingContext = createContext<OnboardingValue | null>(null)

/** L'onboarding ne se montre qu'au premier lancement, connecté ou non ensuite. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [done, setDone] = useState<boolean | null>(null)

  useEffect(() => {
    prefs.get(KEY).then((v) => setDone(v === '1')).catch(() => setDone(false))
  }, [])

  const complete = useCallback(async () => {
    await prefs.set(KEY, '1').catch(() => {})
    setDone(true)
  }, [])

  const value = useMemo(() => ({ done, complete }), [done, complete])
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding(): OnboardingValue {
  const value = useContext(OnboardingContext)
  if (!value) throw new Error('useOnboarding hors de OnboardingProvider')
  return value
}
