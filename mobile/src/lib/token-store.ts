import * as SecureStore from 'expo-secure-store'

import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'nkamva.session'
const INSTALLED = 'nkamva.installed'

/**
 * Le jeton ne quitte pas cet appareil : ni sauvegarde iCloud, ni transfert vers
 * un nouveau téléphone, et il n'est lisible que téléphone déverrouillé.
 */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }

/**
 * Sur iOS, le trousseau survit à la désinstallation : réinstaller l'app (ou
 * revendre le téléphone sans l'effacer) rouvrait la session de l'ancien
 * utilisateur. AsyncStorage, lui, disparaît avec l'app : son absence signale
 * une installation neuve, et on oublie alors tout jeton resté au trousseau.
 */
async function forgetAfterReinstall() {
  const installed = await AsyncStorage.getItem(INSTALLED).catch(() => '1')
  if (installed) return
  await SecureStore.deleteItemAsync(KEY, OPTIONS).catch(() => {})
  await AsyncStorage.setItem(INSTALLED, '1').catch(() => {})
}

/** Trousseau iOS / Keystore Android. */
export const tokenStore = {
  get: async () => {
    await forgetAfterReinstall()
    return SecureStore.getItemAsync(KEY, OPTIONS)
  },
  set: (token: string) => SecureStore.setItemAsync(KEY, token, OPTIONS),
  clear: () => SecureStore.deleteItemAsync(KEY, OPTIONS),
}
