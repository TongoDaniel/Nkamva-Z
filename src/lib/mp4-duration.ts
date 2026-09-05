// ==========================================================================
// Durée d'une vidéo — mesurée sur l'objet, jamais déclarée (F3.8)
// ==========================================================================
// Le formateur saisissait la durée de sa vidéo à la main. Ce chiffre
// n'engageait rien : il alimentait pourtant la progression affichée à
// l'apprenant *et* le seuil de consommation qui décide d'un litige (F8.1).
// Une vidéo de vingt minutes annoncée à quatre heures rendait le
// remboursement automatique.
//
// La durée d'un MP4 est écrite dans le fichier. On la lit — par **intervalles
// d'octets**, sans rapatrier les deux gigaoctets que le format autorise.
//
// ## Ce qu'on va chercher
//
// Un MP4 est une suite de « boîtes » : quatre octets de taille, quatre de
// type, puis le contenu. Au premier niveau on trouve `ftyp`, `mdat` (les
// images, l'essentiel du poids) et `moov` (les métadonnées). `moov` n'est pas
// toujours au début : un encodeur qui n'a pas fait de passe *faststart* le
// pose à la fin, une fois qu'il sait ce qu'il a produit.
//
// On saute donc de boîte en boîte par arithmétique — la taille de `mdat` se
// lit dans son en-tête, on ne traverse pas ses octets — jusqu'à `moov`, puis
// on descend chercher `mvhd`, son premier enfant, qui porte une échelle de
// temps et un nombre de tics. La durée en secondes est leur quotient.
//
// Une poignée de lectures de seize octets suffit, quelle que soit la taille
// du fichier.
//
// ## Ce qui se passe quand ça rate
//
// Rien. La durée reste vide et **la publication n'est pas bloquée** : une
// métadonnée illisible ne vaut pas une vente refusée. Aucune fonction d'ici
// ne lève — elles rendent `null`, et l'appelant continue.

import { getRange } from './s3'

/**
 * Lit `[start, end]` **inclus**, comme un en-tête HTTP `Range`. Rend `null`
 * quand la plage n'est pas servie — objet absent, stockage non configuré.
 *
 * Le paramétrage existe pour les tests, qui n'ont pas de seau : ils passent un
 * lecteur sur un `Buffer` en mémoire.
 */
export type RangeReader = (start: number, end: number) => Promise<Buffer | null>

/** Un en-tête de boîte tient en 8 octets, 16 avec une taille étendue. */
const HEADER_BYTES = 16

/**
 * Garde-fou de boucle. Un MP4 sain a moins de dix boîtes au premier niveau ;
 * au-delà, on lit un fichier qui n'en est pas un, et on arrête plutôt que de
 * grignoter l'objet seize octets à la fois.
 */
const MAX_BOXES = 32

/**
 * Vingt-quatre heures. Au-delà, on tient le résultat pour une mauvaise
 * lecture plutôt que pour une vidéo : mieux vaut aucune durée qu'une durée
 * fausse, puisque c'est elle qui arbitre les litiges.
 */
const MAX_PLAUSIBLE_SECONDS = 86_400

interface BoxHeader {
  /** Taille totale, en-tête compris. */
  size: number
  /** Les quatre caractères du type — `moov`, `mdat`, `mvhd`… */
  type: string
  /** 8, ou 16 quand la taille est étendue sur 64 bits. */
  headerSize: number
}

/**
 * Décode l'en-tête d'une boîte. `null` dès qu'un octet manque ou qu'une taille
 * est impossible — le format est assez régulier pour qu'une anomalie signifie
 * « ce n'est pas ce que je crois », pas « je vais m'arranger ».
 */
function parseHeader(buf: Buffer, limit: number): BoxHeader | null {
  if (buf.length < 8) return null

  let size = buf.readUInt32BE(0)
  const type = buf.toString('latin1', 4, 8)
  let headerSize = 8

  if (size === 1) {
    // Taille étendue : les 64 bits qui suivent le type font foi.
    if (buf.length < 16) return null
    const large = buf.readBigUInt64BE(8)
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null
    size = Number(large)
    headerSize = 16
  } else if (size === 0) {
    // « Jusqu'à la fin du fichier » — la dernière boîte a le droit de le dire.
    size = limit
  }

  if (size < headerSize || size > limit) return null
  // Les quatre caractères d'un type sont imprimables : c'est le contrôle le
  // moins cher pour savoir qu'on lit une structure et pas des octets d'image.
  if (!/^[\x20-\x7e]{4}$/.test(type)) return null

  return { size, type, headerSize }
}

/**
 * Parcourt les boîtes d'un intervalle et rend la première du type demandé,
 * avec la position de son contenu. Ne descend pas : chaque niveau s'appelle
 * pour lui-même.
 */
async function findBox(
  read: RangeReader,
  type: string,
  from: number,
  to: number,
): Promise<{ start: number; end: number } | null> {
  let offset = from

  for (let seen = 0; seen < MAX_BOXES && offset < to; seen++) {
    const buf = await read(offset, offset + HEADER_BYTES - 1)
    if (!buf) return null

    const header = parseHeader(buf, to - offset)
    if (!header) return null

    if (header.type === type) {
      return { start: offset + header.headerSize, end: offset + header.size }
    }
    offset += header.size
  }

  return null
}

/**
 * L'en-tête de film : une échelle de temps et un nombre de tics. Deux
 * dispositions selon la version — la version 1 est apparue pour les dates,
 * pas pour les durées, mais elle déplace tout ce qui suit.
 */
function parseMvhd(body: Buffer): number | null {
  if (body.length < 4) return null
  const version = body.readUInt8(0)

  let timescale: number
  let duration: number

  if (version === 0) {
    // version+flags (4) · création (4) · modification (4) · échelle (4) · durée (4)
    if (body.length < 20) return null
    timescale = body.readUInt32BE(12)
    duration = body.readUInt32BE(16)
    // 0xFFFFFFFF = durée inconnue, déclarée telle par le format.
    if (duration === 0xffffffff) return null
  } else if (version === 1) {
    // Les deux dates passent à 64 bits, l'échelle et la durée se décalent.
    if (body.length < 32) return null
    timescale = body.readUInt32BE(20)
    const large = body.readBigUInt64BE(24)
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null
    duration = Number(large)
  } else {
    return null
  }

  if (timescale <= 0 || duration <= 0) return null

  const seconds = Math.round(duration / timescale)
  if (seconds <= 0 || seconds > MAX_PLAUSIBLE_SECONDS) return null
  return seconds
}

/**
 * La durée en secondes, ou `null` si elle ne se lit pas.
 *
 * `fileSize` borne le parcours : sans elle, une taille aberrante lue dans un
 * en-tête corrompu enverrait chercher des octets qui n'existent pas.
 */
export async function readMp4Duration(read: RangeReader, fileSize: number): Promise<number | null> {
  if (!Number.isFinite(fileSize) || fileSize < 8) return null

  const moov = await findBox(read, 'moov', 0, fileSize)
  if (!moov) return null

  // `mvhd` est le premier enfant de `moov` — la spécification l'impose, mais
  // on le cherche quand même : un encodeur qui glisse un `free` devant ne
  // produit pas pour autant un fichier illisible.
  const mvhd = await findBox(read, 'mvhd', moov.start, moov.end)
  if (!mvhd) return null

  const body = await read(mvhd.start, Math.min(mvhd.end, mvhd.start + 32) - 1)
  if (!body) return null

  return parseMvhd(body)
}

/**
 * La même chose sur un objet du stockage. Appelée à la confirmation du
 * téléversement, juste après la relecture de la taille — au même endroit et
 * pour la même raison : ce qui est vérifiable ne se déclare pas.
 *
 * Ne lève jamais. Sans identifiants de stockage, `getRange` rend `null` et la
 * durée reste vide, comme en développement.
 */
export async function readMp4DurationFromStorage(
  s3Key: string,
  fileSize: number,
): Promise<number | null> {
  try {
    return await readMp4Duration((start, end) => getRange(s3Key, start, end), fileSize)
  } catch {
    return null
  }
}
