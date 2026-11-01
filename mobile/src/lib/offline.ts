import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import { onlineManager, type Query } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'

/**
 * Hors ligne d'abord, pour un public en 3G facturée au mégaoctet
 * (`docs/mobile-first-analyse.md` § 2) : les données déjà vues sont gardées sur
 * le téléphone et réaffichées à l'ouverture, avant même la réponse du serveur.
 */

const STORAGE_KEY = 'nkamva.query-cache'

/** Une semaine : au-delà, mieux vaut un écran de chargement qu'un écran périmé. */
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: STORAGE_KEY,
  throttleTime: 2000,
})

/**
 * Ce qui part sur le disque. Jamais les URL signées de contenu (elles
 * expirent en cinq minutes), ni une requête en erreur ou encore en cours.
 */
export function shouldPersist(query: Query): boolean {
  if (query.state.status !== 'success') return false
  return query.queryKey[0] !== 'content'
}

/** À la déconnexion : rien de l'ancien compte ne doit rester sur l'appareil. */
export function clearPersistedCache() {
  return AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
}

/** React Query suit l'état réseau du téléphone, et non celui du navigateur. */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false)
  }),
)
