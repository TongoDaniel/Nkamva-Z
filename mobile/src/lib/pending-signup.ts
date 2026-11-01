/**
 * Ce que l'inscription transmet à l'écran du code : l'adresse et le mot de
 * passe, pour ouvrir la session dès que l'adresse est vérifiée. Gardé en
 * mémoire seulement, jamais dans les paramètres de navigation ni sur disque.
 */
let pending: { email: string; password: string } | null = null

export const pendingSignup = {
  set: (value: { email: string; password: string }) => { pending = value },
  take: () => { const value = pending; pending = null; return value },
  peek: () => pending,
}
