function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export const prefs = {
  get: async (key: string) => storage()?.getItem(`nkamva.${key}`) ?? null,
  set: async (key: string, value: string) => { storage()?.setItem(`nkamva.${key}`, value) },
}
