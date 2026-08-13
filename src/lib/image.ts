// ==========================================================================
// Réduction des images **avant** le dépôt
// ==========================================================================
// Le chantier mobile first a trouvé le défaut le plus cher du produit ici :
// une couverture était acceptée jusqu'à 5 Mo et servie telle quelle, sans
// redimensionnement ni `srcset`, à des téléphones sur des forfaits 3G facturés
// au mégaoctet. Une page de catalogue de douze cartes pouvait tirer plusieurs
// dizaines de mégaoctets pour afficher des vignettes de 262 px de large.
//
// La correction se fait à la source plutôt qu'au service, pour trois raisons :
//
//   · c'est le seul endroit qui règle aussi le **dépôt** — un formateur qui
//     publie depuis son téléphone envoyait 5 Mo sur le même forfait ;
//   · l'objet stocké est borné, donc le quota de stockage de l'arbitrage 54
//     cesse d'être consommé par des pixels que personne n'affichera ;
//   · aucune dépendance nouvelle, aucun octet qui transite par le serveur Next
//     — la route de couverture redirige toujours vers R2 (voir
//     `api/media/courses/[courseId]/cover/route.ts`, qui explique pourquoi).
//
// Ce que ça ne fait pas : produire plusieurs largeurs. La carte de catalogue et
// la fiche reçoivent le même objet. `Cover` compense par un `image-set()` sur
// la densité d'écran ; la vraie déclinaison par largeur reste à faire.
// ==========================================================================

/** Largeur maximale conservée. Au-delà, aucun écran du produit n'en profite. */
export const IMAGE_MAX_WIDTH = 1200

/**
 * Qualité WebP. 0,82 est le point où l'artefact cesse d'être visible sur une
 * photo ; monter à 0,9 double le poids sans gain perceptible à cette taille.
 */
export const IMAGE_QUALITY = 0.82

/** Ce que le navigateur doit savoir décoder pour que la réduction soit tentée. */
const DECODABLE = ['image/png', 'image/jpeg', 'image/webp']

export interface ShrinkResult {
  file: File
  /** Vrai si l'image a effectivement été réencodée. */
  changed: boolean
  originalBytes: number
}

/**
 * Réduit une image à `IMAGE_MAX_WIDTH` et la réencode en WebP.
 *
 * Ne lève jamais : une image qu'on ne sait pas décoder — format exotique, canvas
 * indisponible, image corrompue — est renvoyée telle quelle. Bloquer le dépôt
 * d'une couverture parce que la réduction a échoué serait un défaut plus grave
 * que celui qu'on corrige ; la borne de 5 Mo côté appelant reste le garde-fou.
 *
 * Le résultat n'est gardé que s'il est **plus léger** que l'original. Une image
 * déjà petite et déjà optimisée peut grossir au réencodage : dans ce cas on
 * garde l'original.
 */
export async function shrinkImage(file: File): Promise<ShrinkResult> {
  const untouched: ShrinkResult = { file, changed: false, originalBytes: file.size }

  if (!DECODABLE.includes(file.type)) return untouched
  if (typeof createImageBitmap !== 'function') return untouched

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, IMAGE_MAX_WIDTH / bitmap.width)

    // Déjà sous la borne **et** déjà en WebP : rien à gagner.
    if (scale === 1 && file.type === 'image/webp') {
      bitmap.close()
      return untouched
    }

    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return untouched
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', IMAGE_QUALITY),
    )
    if (!blob || blob.size >= file.size) return untouched

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp'
    return {
      file: new File([blob], name, { type: 'image/webp', lastModified: Date.now() }),
      changed: true,
      originalBytes: file.size,
    }
  } catch {
    // Décodage impossible : on laisse passer l'original.
    return untouched
  }
}

/** « 4,7 Mo » — pour dire à la personne ce que la réduction lui a épargné. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}
