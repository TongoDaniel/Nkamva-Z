import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ==========================================================================
// Stockage objet — S3 et compatibles
// ==========================================================================
// ⚠️ Ces variables s'appelaient `R2_*` dans le code alors que l'environnement
// fournit les noms standard `AWS_*`. Rien ne correspondait, donc
// `isS3Configured()` rendait faux en permanence — et comme le repli est
// silencieux (une URL `data:placeholder-…` au lieu d'une erreur), **aucun
// fichier n'a jamais été stocké et rien ne le disait**. Corrigé le 4 août 2026.
//
// Les noms retenus sont ceux du SDK AWS (`AWS_ACCESS_KEY_ID`,
// `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_ENDPOINT_URL`) : ce sont ceux que
// la chaîne de credentials par défaut reconnaît, donc ceux qu'on a le moins de
// chances de retaper de travers.
// ==========================================================================

export interface StorageConfig {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
}

/**
 * Configuration du stockage, ou `null` si elle est incomplète. Exportée parce
 * que l'enregistrement des lives en a besoin : l'egress LiveKit dépose
 * directement dans le même seau, et doit lire la même configuration — deux
 * lectures divergentes, c'est le défaut qu'on vient de corriger.
 */
export function storageConfig(): StorageConfig | null {
  const {
    AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
    AWS_REGION, AWS_BUCKET_NAME,
  } = process.env
  if (!AWS_ENDPOINT_URL || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) return null
  return {
    endpoint: AWS_ENDPOINT_URL,
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    // `auto` reste le défaut : c'est ce qu'attendent les compatibles S3 qui
    // n'ont pas de régions, R2 en tête.
    region: AWS_REGION || 'auto',
    bucket: AWS_BUCKET_NAME || 'nkamva-dev',
  }
}

let client: S3Client | null = null

function getClient(): S3Client | null {
  const config = storageConfig()
  if (!config) return null
  if (!client) {
    client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }
  return client
}

function getBucket(): string { return storageConfig()?.bucket ?? 'nkamva-dev' }
export const SIGNED_URL_TTL = 300

// Permet aux appelants de basculer sur un repli dev explicite plutôt que de
// traiter un objet absent comme une erreur (aucun fichier n'est réellement
// téléversé quand le stockage n'est pas configuré).
export function isS3Configured(): boolean { return getClient() !== null }

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

export async function headObject(s3Key: string): Promise<{ contentLength: number; contentType?: string } | null> {
  const s3 = getClient()
  if (!s3) return null
  try { const resp = await s3.send(new HeadObjectCommand({ Bucket: getBucket(), Key: s3Key })); return { contentLength: resp.ContentLength ?? 0, contentType: resp.ContentType } } catch { return null }
}

export async function getRange(s3Key: string, start: number, end: number): Promise<Buffer | null> {
  const s3 = getClient()
  if (!s3) return null
  try { const resp = await s3.send(new GetObjectCommand({ Bucket: getBucket(), Key: s3Key, Range: `bytes=${start}-${end}` })); if (!resp.Body) return null; const chunks: Uint8Array[] = []; for await (const chunk of resp.Body as any) chunks.push(chunk); return Buffer.concat(chunks) } catch { return null }
}

export async function deleteObject(s3Key: string): Promise<void> {
  const s3 = getClient()
  if (!s3) return
  try { await s3.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: s3Key })) } catch (err) { console.error('[S3:DELETE_ERROR]', { s3Key, error: String(err) }) }
}

/**
 * Un type **absent de cette table n'est pas contrôlé du tout** : `validateMagicNumber`
 * sort en silence. C'est délibéré pour les archives, dont le contenu n'est pas
 * inspecté (voir `confirmCourseUpload`) ; ça devient un trou pour tout genre
 * qu'on ajouterait ici sans y penser.
 */
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
