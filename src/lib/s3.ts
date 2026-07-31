import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

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

export function isS3Configured(): boolean {
  return !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY && process.env.R2_SECRET_KEY)
}

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
