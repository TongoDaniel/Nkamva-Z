import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
// Import statique : en dynamique, le bundler isole un chunk dont le nom porte
// « node:crypto ». Le deux-points est un caractère interdit dans un nom de
// fichier Windows, et la copie vers la sortie standalone échoue.
import { createHash } from 'node:crypto'

let client: S3Client | null = null

function getClient(): S3Client | null {
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY || !process.env.R2_SECRET_KEY) return null
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY!, secretAccessKey: process.env.R2_SECRET_KEY! },
    })
  }
  return client
}

function getBucket(): string { return process.env.R2_BUCKET || 'nkamva-dev' }
export const SIGNED_URL_TTL = 300

/**
 * Le stockage objet est-il réellement branché ?
 * Sans identifiants, les fonctions ci-dessous renvoient des valeurs de repli
 * qui permettent au reste de l'application de tourner en développement. Les
 * parcours qui dépendent d'un fichier réellement déposé doivent le savoir et
 * le dire, au lieu de faire comme si l'envoi avait eu lieu.
 */
export function isS3Configured(): boolean {
  return getClient() !== null
}

/** Au-delà, on ne relit pas l'objet entier pour en calculer l'empreinte. */
export const SHA256_MAX_BYTES = 16 * 1024 * 1024

export async function presignUpload(s3Key: string, mimeType: string, sizeBytes: number): Promise<{ uploadUrl: string; expiresAt: Date }> {
  const s3 = getClient()
  if (!s3) return { uploadUrl: `data:placeholder-upload/${encodeURIComponent(s3Key)}`, expiresAt: new Date(Date.now() + SIGNED_URL_TTL * 1000) }
  const command = new PutObjectCommand({ Bucket: getBucket(), Key: s3Key, ContentType: mimeType, ContentLength: sizeBytes })
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: SIGNED_URL_TTL })
  return { uploadUrl, expiresAt: new Date(Date.now() + SIGNED_URL_TTL * 1000) }
}

export async function presignDownload(s3Key: string): Promise<string> {
  const s3 = getClient()
  if (!s3) return `data:placeholder-download/${encodeURIComponent(s3Key)}`
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: s3Key })
  return getSignedUrl(s3, command, { expiresIn: SIGNED_URL_TTL })
}

export async function headObject(s3Key: string): Promise<{ contentLength: number; contentType?: string; etag?: string } | null> {
  const s3 = getClient()
  if (!s3) return null
  try { const resp = await s3.send(new HeadObjectCommand({ Bucket: getBucket(), Key: s3Key })); return { contentLength: resp.ContentLength ?? 0, contentType: resp.ContentType, etag: resp.ETag?.replace(/"/g, '') } } catch { return null }
}

/**
 * Empreinte d'intégrité de l'objet déposé.
 * En deçà de SHA256_MAX_BYTES, l'objet est relu en flux et hashé réellement.
 * Au-delà — une vidéo peut peser 2 Go — relire coûterait autant de trafic que
 * l'envoi : on retombe alors sur l'ETag fourni par le stockage, préfixé pour
 * qu'aucun appelant ne puisse le confondre avec un SHA-256.
 */
export async function computeObjectDigest(s3Key: string, sizeBytes: number): Promise<string> {
  const s3 = getClient()
  if (!s3) throw new Error('STORAGE_NOT_CONFIGURED')

  if (sizeBytes > SHA256_MAX_BYTES) {
    const head = await headObject(s3Key)
    if (!head?.etag) throw new Error('CANNOT_READ_FILE')
    return `etag:${head.etag}`
  }

  const hash = createHash('sha256')
  const resp = await s3.send(new GetObjectCommand({ Bucket: getBucket(), Key: s3Key }))
  if (!resp.Body) throw new Error('CANNOT_READ_FILE')
  for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) hash.update(chunk)
  return `sha256:${hash.digest('hex')}`
}

export async function getRange(s3Key: string, start: number, end: number): Promise<Buffer | null> {
  const s3 = getClient()
  if (!s3) return null
  try { const resp = await s3.send(new GetObjectCommand({ Bucket: getBucket(), Key: s3Key, Range: `bytes=${start}-${end}` })); if (!resp.Body) return null; const chunks: Uint8Array[] = []; for await (const chunk of resp.Body as any) chunks.push(chunk); return Buffer.concat(chunks) } catch { return null }
}

/**
 * Supprime un objet. Renvoie `true` lorsque l'objet n'existe plus côté
 * stockage — la suppression S3 est idempotente, un objet déjà absent compte
 * comme supprimé. Renvoie `false` si l'opération a échoué ou si le stockage
 * n'est pas configuré : un appelant qui efface la référence en base doit
 * pouvoir s'abstenir plutôt que d'orpheliner le fichier.
 */
export async function deleteObject(s3Key: string): Promise<boolean> {
  const s3 = getClient()
  if (!s3) return false
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: s3Key }))
    return true
  } catch (err) {
    console.error('[S3:DELETE_ERROR]', { s3Key, error: String(err) })
    return false
  }
}

const MAGIC_NUMBERS: Record<string, { offset: number; bytes: number[] }> = {
  'application/pdf': { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  'image/png': { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  'image/jpeg': { offset: 0, bytes: [0xff, 0xd8, 0xff] },
  'image/webp': { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
  'video/mp4': { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
}

export async function validateMagicNumber(s3Key: string, expectedMime: string): Promise<void> {
  const head = await headObject(s3Key)
  if (!head) throw new Error('UPLOAD_NOT_FOUND')
  if (head.contentLength === 0) throw new Error('EMPTY_FILE')
  const headBytes = await getRange(s3Key, 0, 4095)
  if (!headBytes) throw new Error('CANNOT_READ_FILE')
  const signature = MAGIC_NUMBERS[expectedMime]
  if (!signature) return
  for (let i = 0; i < signature.bytes.length; i++) { if (headBytes[signature.offset + i] !== signature.bytes[i]) throw new Error('MAGIC_NUMBER_MISMATCH') }
  if (expectedMime === 'image/webp') { if (headBytes.slice(8, 12).toString('ascii') !== 'WEBP') throw new Error('MAGIC_NUMBER_MISMATCH') }
}
