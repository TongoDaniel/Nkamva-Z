import Constants from 'expo-constants'

/**
 * Adresse du serveur NKAMVA. `EXPO_PUBLIC_API_URL` l'emporte (développement
 * local, staging) ; à défaut, la valeur d'`app.json` (`extra.apiUrl`), soit la
 * production.
 */
const configured = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  'https://nkamva.com'
).replace(/\/+$/, '')

/**
 * Hors développement, le jeton et les données ne transitent qu'en HTTPS : une
 * adresse en clair glissée par erreur dans une version publiée exposerait
 * chaque requête à qui partage le même Wi-Fi. On refuse de démarrer plutôt.
 */
if (!__DEV__ && !configured.startsWith('https://')) {
  throw new Error(`Adresse du serveur non sécurisée : ${configured}`)
}

export const API_URL: string = configured
