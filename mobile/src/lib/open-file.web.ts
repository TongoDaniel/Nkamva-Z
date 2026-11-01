/** Aperçu web : le navigateur ouvre le fichier lui-même. */
export async function downloadAndOpen(url: string) {
  globalThis.open?.(url, '_blank')
}
