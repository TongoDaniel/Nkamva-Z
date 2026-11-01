import Constants from 'expo-constants'

/**
 * Adresse du serveur NKAMVA. `EXPO_PUBLIC_API_URL` l'emporte (développement
 * local, staging) ; à défaut, la valeur d'`app.json` (`extra.apiUrl`), soit la
 * production.
 */
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  'https://nkamva.com'
).replace(/\/+$/, '')
