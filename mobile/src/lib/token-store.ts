import * as SecureStore from 'expo-secure-store'

const KEY = 'nkamva.session'

/** Trousseau iOS / Keystore Android. */
export const tokenStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token: string) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
}
