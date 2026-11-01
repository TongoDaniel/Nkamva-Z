import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, setApiToken, setUnauthorizedHandler } from './api'
import { tokenStore } from './token-store'
import { clearPersistedCache } from './offline'
import { clearDownloads } from './open-file'
import type { SessionUser } from './types'

type Status = 'loading' | 'signedOut' | 'signedIn'

interface LoginInput {
  email: string
  password: string
  totp?: string
}

interface AuthValue {
  status: Status
  user: SessionUser | null
  login: (input: LoginInput) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * Session de l'app : un jeton porteur émis par `POST /api/auth/mobile/token`,
 * rangé dans le trousseau. Il n'y a pas de déconnexion côté serveur : le jeton
 * est simplement oublié. Une révocation (mot de passe changé, compte suspendu)
 * fait répondre 401 au serveur, et la session se ferme d'elle-même.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<SessionUser | null>(null)

  // Rien de l'ancien compte ne reste sur l'appareil : jeton, cache des
  // requêtes, fichiers de ressources téléchargés.
  const signOutLocally = useCallback(async () => {
    setApiToken(null)
    setUser(null)
    setStatus('signedOut')
    queryClient.clear()
    await Promise.all([tokenStore.clear(), clearPersistedCache(), clearDownloads()])
  }, [queryClient])

  /**
   * Déconnexion voulue : le jeton est d'abord révoqué côté serveur, pour
   * qu'une copie éventuelle ne vaille plus rien. Sans réseau, la session se
   * ferme quand même sur le téléphone.
   */
  const logout = useCallback(async () => {
    await api.post('auth/mobile/logout').catch(() => {})
    await signOutLocally()
  }, [signOutLocally])

  useEffect(() => {
    setUnauthorizedHandler(() => { void signOutLocally() })
    return () => setUnauthorizedHandler(null)
  }, [signOutLocally])

  // Au démarrage : un jeton rangé est vérifié auprès du serveur avant d'ouvrir
  // l'app. Sans réseau, on l'ouvre quand même, l'app affichera ses états
  // hors ligne plutôt que de renvoyer à la connexion.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const token = await tokenStore.get()
      // Pas de session : rien d'un compte précédent ne doit s'afficher (cache
      // restauré du disque, badge de messages non lus).
      if (!token) {
        queryClient.clear()
        await clearPersistedCache()
        if (!cancelled) setStatus('signedOut')
        return
      }
      setApiToken(token)
      try {
        const profile = await api.get<{ id: string; email: string; role: SessionUser['role'] }>('me/profile')
        if (cancelled) return
        setUser({ id: profile.id, email: profile.email, role: profile.role, trainerId: null })
        setStatus('signedIn')
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) await signOutLocally()
        else setStatus('signedIn')
      }
    })()
    return () => { cancelled = true }
  }, [signOutLocally, queryClient])

  const login = useCallback(async (input: LoginInput) => {
    const result = await api.post<{ token: string; user: SessionUser }>('auth/mobile/token', input)
    await tokenStore.set(result.token)
    setApiToken(result.token)
    queryClient.clear()
    setUser(result.user)
    setStatus('signedIn')
  }, [queryClient])

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth hors de AuthProvider')
  return value
}
