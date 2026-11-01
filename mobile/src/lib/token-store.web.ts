/**
 * Le trousseau n'existe pas dans un navigateur. La version web de l'app ne sert
 * qu'à l'aperçu de développement : le stockage local suffit.
 */
const KEY = 'nkamva.session'

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export const tokenStore = {
  get: async () => storage()?.getItem(KEY) ?? null,
  set: async (token: string) => { storage()?.setItem(KEY, token) },
  clear: async () => { storage()?.removeItem(KEY) },
}
