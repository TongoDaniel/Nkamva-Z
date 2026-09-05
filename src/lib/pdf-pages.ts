// ==========================================================================
// Nombre de pages d'un document — mesuré sur l'objet (F3.8, F3.1)
// ==========================================================================
// Le pendant documentaire de `mp4-duration.ts`, et pour la même raison : la
// position de lecture d'un PDF est **une page**, et un pourcentage n'a de sens
// que rapporté à un total. Ce total ne peut pas être déclaré — il serait
// invérifiable, et il alimente le résumé de consommation qu'un agent du
// support lit pour trancher un litige.
//
// ## Pourquoi le fichier entier, ici, et des intervalles là-bas
//
// Une vidéo pèse jusqu'à deux gigaoctets : on va y chercher seize octets à la
// fois. Un PDF est plafonné à dix mégaoctets (F3.4) et sa table des objets
// vit à la fin, souvent compressée dans un flux — la lire par morceaux
// reviendrait à réécrire un analyseur PDF. On rapatrie donc l'objet une fois,
// au dépôt, et `pdf-lib` — déjà présent pour les factures — s'en charge.
//
// ## Ce qui se passe quand ça rate
//
// Rien, exactement comme pour la durée : `null`, et la publication continue.
// Un document sans compte de pages se lit quand même ; c'est la progression
// qui s'affiche alors sans pourcentage plutôt qu'avec un zéro trompeur
// (F3.5).

import { PDFDocument } from 'pdf-lib'
import { getRange } from './s3'

/**
 * Plafond de lecture. Il double le plafond de dépôt d'un PDF (10 Mo, F3.4) :
 * la marge existe pour qu'un ancien fichier légèrement plus gros reste
 * mesurable, pas pour ouvrir la porte à autre chose.
 */
const MAX_BYTES = 20 * 1024 * 1024

/**
 * Le nombre de pages, ou `null` s'il ne se lit pas.
 *
 * Ne lève jamais. Un PDF chiffré, tronqué ou malformé rend `null` — c'est un
 * document qu'on servira quand même, faute d'une raison de refuser une vente
 * pour une métadonnée.
 */
export async function readPdfPageCountFromStorage(
  s3Key: string,
  sizeBytes: number,
): Promise<number | null> {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) return null

  try {
    const bytes = await getRange(s3Key, 0, sizeBytes - 1)
    if (!bytes || bytes.length === 0) return null

    // `ignoreEncryption` : un PDF protégé contre l'impression reste un PDF dont
    // on sait compter les pages. Refuser de le lire ferait perdre la mesure
    // pour une restriction qui ne nous concerne pas.
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const pages = doc.getPageCount()

    return Number.isInteger(pages) && pages > 0 ? pages : null
  } catch {
    return null
  }
}
