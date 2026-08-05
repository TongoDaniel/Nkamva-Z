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
//   · Le MP4 est un conteneur minimal, valide pour l'entête et pour le contrôle
//     de nombre magique, mais **sans piste encodée** : le lecteur ne le décodera
//     pas. Fabriquer une vidéo réellement lisible demanderait un encodeur, que
//     cet environnement n'a pas. La durée affichée vient de `Course.durationSeconds`,
//     pas du fichier — l'écran reste juste, seule la lecture ne donne rien.
// ==========================================================================

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

/**
 * Conteneur MP4 minimal : `ftyp`, puis un `mdat` de remplissage.
 *
 * `validateMagicNumber` cherche « ftyp » au décalage 4 — c'est exactement la
 * structure d'une boîte MP4 : quatre octets de taille, puis le type. Le fichier
 * est donc reconnu pour ce qu'il est, et sa taille alimente honnêtement le
 * quota du formateur. Il ne contient aucune piste : voir l'avertissement en
 * tête de module.
 */
export function buildMp4(sizeBytes = 96 * 1024): Buffer {
  const box = (type: string, payload: Buffer) => {
    const header = Buffer.alloc(8)
    header.writeUInt32BE(payload.length + 8, 0)
    header.write(type, 4, 'latin1')
    return Buffer.concat([header, payload])
  }

  const ftyp = box('ftyp', Buffer.concat([
    Buffer.from('isom', 'latin1'),          // major brand
    Buffer.from([0, 0, 2, 0]),              // minor version
    Buffer.from('isomiso2mp41', 'latin1'),  // compatible brands
  ]))

  const padding = Math.max(0, sizeBytes - ftyp.length - 8)
  return Buffer.concat([ftyp, box('mdat', Buffer.alloc(padding))])
}

export type ContentKind = 'video' | 'pdf'

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

  const mimeType = kind === 'pdf' ? 'application/pdf' : 'video/mp4'
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
