import * as SecureStore from 'expo-secure-store'

/** Petites préférences de l'appareil (pas de secret ici, mais le même magasin). */
export const prefs = {
  get: (key: string) => SecureStore.getItemAsync(`nkamva.${key}`),
  set: (key: string, value: string) => SecureStore.setItemAsync(`nkamva.${key}`, value),
}
