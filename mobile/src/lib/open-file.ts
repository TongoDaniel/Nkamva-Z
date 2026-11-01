import { Directory, File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'video/mp4': 'mp4',
}

/** « Contrats commerciaux : les dix clauses » → « contrats-commerciaux-les-dix-clauses ». */
function fileStem(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'ressource'
}

/**
 * Télécharge le fichier d'une ressource dans le cache de l'app, puis l'ouvre
 * dans la visionneuse du système (Aperçu rapide sur iOS, l'app associée sur
 * Android). Ce qui ne s'ouvre pas, une archive par exemple, part dans la
 * feuille de partage pour être enregistré.
 */
export async function downloadAndOpen(url: string, title: string, mimeType?: string | null) {
  const ext = (mimeType && EXTENSIONS[mimeType]) || url.split('?')[0].split('.').pop() || 'bin'
  const dir = new Directory(Paths.cache, 'ressources')
  if (!dir.exists) dir.create({ intermediates: true })
  // Le nom du fichier est celui que la visionneuse affiche : le titre, pas un identifiant.
  const target = new File(dir, `${fileStem(title)}.${ext}`)
  if (target.exists) target.delete()
  const file = await File.downloadFileAsync(url, target)

  if (await File.canPreview(file).catch(() => false)) {
    await File.preview(file)
    return
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: mimeType ?? undefined })
    return
  }
  throw new Error('Aucune application de ce téléphone ne sait ouvrir ce fichier.')
}

/**
 * Efface les fichiers de ressources téléchargés : à la déconnexion, la
 * personne suivante sur ce téléphone ne doit pas retrouver les ressources
 * payées par la précédente dans le cache de l'app.
 */
export async function clearDownloads() {
  try {
    const dir = new Directory(Paths.cache, 'ressources')
    if (dir.exists) dir.delete()
  } catch {
    // Un cache que le système a déjà vidé n'a rien à effacer.
  }
}
