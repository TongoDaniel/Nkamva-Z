// ==========================================================================
// Contenus déposés dans le stockage objet
// ==========================================================================
// `publishCourse` refuse une ressource sans `contentS3Key`, et `confirmCourseUpload`
// relit la taille sur l'objet réellement déposé pour alimenter le quota du
// formateur. Écrire la clé à la main produirait donc deux mensonges : une
// ressource publiée dont le fichier n'existe pas, et un quota calculé sur du
// vide. Le seed passe par la vraie chaîne — présignature, PUT, confirmation —
// avec des fichiers qu'il fabrique lui-même.
//
// Ce que valent ces fichiers, en toute franchise :
//
//   · Le PDF est un vrai PDF, complet et ouvrable : l'apprenant qui télécharge
//     « Grille de revue de code » obtient un document qui s'affiche, titré.
//   · L'archive est un vrai ZIP, ouvrable, contenant ce même PDF.
//   · Le MP4 est un conteneur minimal, valide pour l'entête, pour le contrôle
//     de nombre magique **et pour la lecture de durée** (F3.8) — il porte un
//     `moov`/`mvhd` renseigné —, mais **sans piste encodée** : le lecteur ne le
//     décodera pas. Fabriquer une vidéo réellement lisible demanderait un
//     encodeur, que cet environnement n'a pas.
//
//     Depuis le lot 6, la durée du catalogue de démonstration n'est donc plus
//     écrite en base par le seed : elle est **mesurée sur le fichier déposé**,
//     par le même chemin que celui d'un formateur. Ce qui est vérifiable dans
//     le produit doit l'être aussi dans sa démonstration, sans quoi le seed
//     masque exactement la panne qu'il devrait révéler.
// ==========================================================================

import { deflateRawSync, crc32 } from 'node:zlib'
import { presignCourseUpload, confirmCourseUpload } from '../../src/lib/courses'
import { isS3Configured } from '../../src/lib/s3'

/**
 * Un PDF d'une page, valide et autonome.
 *
 * Construit à la main plutôt qu'avec une bibliothèque : le seed n'a besoin que
 * d'un objet ouvrable, et une dépendance de plus pour trois cents octets se
 * paierait à chaque installation. Le tableau `xref` est calculé sur les
 * décalages réels — un PDF dont l'index ment ne s'ouvre pas.
 */
export function buildPdf(title: string, subtitle: string): Buffer {
  const escape = (s: string) => s.replace(/([\\()])/g, '\\$1')
  const stream =
    `BT /F1 20 Tf 62 720 Td (${escape(title)}) Tj ET\n` +
    `BT /F1 11 Tf 62 694 Td (${escape(subtitle)}) Tj ET\n` +
    `BT /F1 9 Tf 62 60 Td (NkamVa — document de demonstration) Tj ET\n`

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((content, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${content}\nendobj\n`
  })

  const xrefAt = body.length
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`

  return Buffer.from(body + xref + trailer, 'latin1')
}

function box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(payload.length + 8, 0)
  header.write(type, 4, 'latin1')
  return Buffer.concat([header, payload])
}

/**
 * Conteneur MP4 minimal : `ftyp`, un `mdat` de remplissage, puis un `moov`
 * portant la durée demandée.
 *
 * `validateMagicNumber` cherche « ftyp » au décalage 4 — c'est exactement la
 * structure d'une boîte MP4 : quatre octets de taille, puis le type. Le fichier
 * est donc reconnu pour ce qu'il est, et sa taille alimente honnêtement le
 * quota du formateur. Il ne contient aucune piste : voir l'avertissement en
 * tête de module.
 *
 * **`moov` est posé après `mdat`**, à dessein : c'est ce que produit un
 * encodeur qui n'a pas fait de passe *faststart*, donc le cas le plus fréquent
 * et celui qui casse une lecture naïve des premiers kilo-octets. Le seed doit
 * exercer le chemin difficile, pas le chemin commode.
 */
export function buildMp4(sizeBytes = 96 * 1024, durationSeconds = 0): Buffer {
  const ftyp = box('ftyp', Buffer.concat([
    Buffer.from('isom', 'latin1'),          // major brand
    Buffer.from([0, 0, 2, 0]),              // minor version
    Buffer.from('isomiso2mp41', 'latin1'),  // compatible brands
  ]))

  // Échelle de temps classique d'un conteneur MP4 : 600 tics par seconde.
  const timescale = 600
  const mvhd = Buffer.alloc(100)
  mvhd.writeUInt8(0, 0)                                    // version 0
  mvhd.writeUInt32BE(timescale, 12)
  mvhd.writeUInt32BE(Math.max(0, Math.round(durationSeconds)) * timescale, 16)
  const moov = box('moov', box('mvhd', mvhd))

  const padding = Math.max(0, sizeBytes - ftyp.length - moov.length - 8)
  return Buffer.concat([ftyp, box('mdat', Buffer.alloc(padding)), moov])
}

/**
 * Une archive ZIP contenant un unique fichier stocké tel quel.
 *
 * Les trois formats téléchargeables — kit, modèle, tableur — se livrent en
 * archive (F3.9) : le seed déposait un PDF sous ces trois formats, ce que la
 * confirmation refuse désormais parce que l'annonce et le fichier se
 * contredisaient. Écrite à la main pour la même raison que le PDF : trois cents
 * octets ne valent pas une dépendance.
 */
export function buildZip(entryName: string, content: Buffer): Buffer {
  const name = Buffer.from(entryName, 'latin1')
  const deflated = deflateRawSync(content)
  const somme = crc32(content)

  const champsCommuns = (buf: Buffer, offset: number) => {
    buf.writeUInt16LE(20, offset)             // version minimale — 2.0
    buf.writeUInt16LE(0, offset + 2)          // aucun drapeau
    buf.writeUInt16LE(8, offset + 4)          // méthode : deflate
    buf.writeUInt16LE(0, offset + 6)          // heure
    buf.writeUInt16LE(0x21, offset + 8)       // date : 1er janvier 1996
    buf.writeUInt32LE(somme, offset + 10)      // CRC-32 du contenu d'origine
    buf.writeUInt32LE(deflated.length, offset + 14)
    buf.writeUInt32LE(content.length, offset + 18)
    buf.writeUInt16LE(name.length, offset + 22)
  }

  const local = Buffer.alloc(30)
  local.write('PK\x03\x04', 0, 'latin1')
  champsCommuns(local, 4)
  local.writeUInt16LE(0, 28) // pas de champ additionnel

  const central = Buffer.alloc(46)
  central.write('PK\x01\x02', 0, 'latin1')
  central.writeUInt16LE(20, 4) // version d'écriture
  champsCommuns(central, 6)
  // Décalage du fichier local : zéro, il est le premier et le seul.

  const centralAt = local.length + name.length + deflated.length
  const fin = Buffer.alloc(22)
  fin.write('PK\x05\x06', 0, 'latin1')
  fin.writeUInt16LE(1, 8)  // entrées sur ce volume
  fin.writeUInt16LE(1, 10) // entrées au total
  fin.writeUInt32LE(central.length + name.length, 12)
  fin.writeUInt32LE(centralAt, 16)

  return Buffer.concat([local, name, deflated, central, name, fin])
}

export type ContentKind = 'video' | 'pdf' | 'archive'

/**
 * Dépose le contenu d'une ressource et l'y rattache, par le chemin du produit.
 *
 * Rend `false` quand le stockage n'est pas configuré : le seed continue alors
 * sans contenu, et les ressources concernées restent en brouillon plutôt que
 * d'être publiées sans fichier. Mieux vaut un catalogue plus court qu'un
 * catalogue qui vend du vide.
 */
export async function uploadCourseContent(
  courseId: string,
  trainerProfileId: string,
  userId: string,
  kind: ContentKind,
  file: Buffer,
): Promise<boolean> {
  if (!isS3Configured()) return false

  const mimeType =
    kind === 'pdf' ? 'application/pdf' : kind === 'archive' ? 'application/zip' : 'video/mp4'
  const { uploadUrl, s3Key } = await presignCourseUpload(courseId, trainerProfileId, {
    mimeType,
    sizeBytes: file.length,
    kind,
  })

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': mimeType, 'content-length': String(file.length) },
    body: new Uint8Array(file),
  })
  if (!response.ok) {
    throw new Error(`Téléversement refusé (${response.status}) pour ${s3Key}`)
  }

  await confirmCourseUpload(courseId, trainerProfileId, userId, { s3Key, kind, mimeType })
  return true
}
