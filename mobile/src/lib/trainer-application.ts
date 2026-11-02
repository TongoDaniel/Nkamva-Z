import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { File } from 'expo-file-system'
import { createUploadTask, FileSystemUploadType } from 'expo-file-system/legacy'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { api, ApiError } from './api'

/**
 * Candidature formateur depuis l'app. Mêmes routes que le parcours
 * `/candidature` du site (`/api/trainer-applications/*`), qui ne fait pas
 * choisir la formule : l'abonnement n'est jamais montré dans l'app (règle
 * 3.1.1 de l'App Store). La cadence reste nulle, et le serveur retombe sur la
 * formule mensuelle à l'approbation, comme pour ce parcours du site.
 */

export type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'RESUBMISSION_PENDING'
export type DocumentType = 'ID_CARD' | 'DIPLOMA' | 'VIDEO'

export interface ApplicationDocument {
  id: string
  type: DocumentType
  status: string
  rejectionReason: string | null
  originalFileName: string | null
  sizeBytes: string | number | null
}

export interface TrainerApplication {
  id: string
  status: ApplicationStatus
  slogan: string | null
  description: string | null
  websiteUrl: string | null
  domains: string[]
  experienceYears: number | null
  finalRejectionReason: string | null
  documents: ApplicationDocument[]
}

export interface ApplicationInput {
  slogan?: string
  description?: string
  websiteUrl?: string
  domains?: string[]
  experienceYears?: number
}

/** Les trois pièces exigées à l'envoi (`REQUIRED_DOCUMENT_TYPES` côté site). */
export const DOCUMENTS: { type: DocumentType; label: string; hint: string; mimes: string[]; maxBytes: number }[] = [
  { type: 'ID_CARD', label: 'Pièce d’identité', hint: 'Photo ou PDF, 10 Mo au plus', mimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], maxBytes: 10_485_760 },
  { type: 'DIPLOMA', label: 'Diplôme ou attestation', hint: 'Photo ou PDF, 10 Mo au plus', mimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], maxBytes: 10_485_760 },
  { type: 'VIDEO', label: 'Vidéo de présentation', hint: 'MP4, quelques minutes suffisent', mimes: ['video/mp4'], maxBytes: 2_147_483_648 },
]

/** Une pièce est en place quand son dépôt est confirmé (`CONFIRMED_DOCUMENT_STATUSES`). */
export function documentReady(doc: ApplicationDocument | undefined): boolean {
  return !!doc && ['PENDING', 'RESUBMITTED', 'APPROVED'].includes(doc.status)
}

const KEY = ['trainer-application'] as const

/** Le dossier en cours, ou `null` s'il n'y en a pas encore. */
export function useMyApplication(enabled = true) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async ({ signal }) => {
      try {
        return await api.get<TrainerApplication>('trainer-applications/me', signal)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: KEY })
    // Le rôle change à l'envoi (PENDING_TRAINER) : le profil est relu.
    void queryClient.invalidateQueries({ queryKey: ['profile'] })
  }
}

export function useSaveApplication(exists: boolean) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: ApplicationInput) =>
      exists ? api.patch<TrainerApplication>('trainer-applications/me', input) : api.post<TrainerApplication>('trainer-applications', input),
    onSuccess: invalidate,
  })
}

export function useSubmitApplication() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: () => api.post('trainer-applications/me/submit'), onSuccess: invalidate })
}

/**
 * Empreinte SHA-256 du fichier, lue par morceaux : une vidéo ne tient pas en
 * mémoire d'un bloc. Le serveur la conserve avec la pièce.
 */
async function fileSha256(uri: string): Promise<string> {
  const handle = new File(uri).open()
  const hash = sha256.create()
  try {
    for (;;) {
      const chunk = await handle.readBytes(1024 * 1024)
      if (chunk.length === 0) break
      hash.update(chunk)
    }
  } finally {
    handle.close()
  }
  return bytesToHex(hash.digest())
}

export interface PickedFile {
  uri: string
  name: string
  mimeType: string
  size: number
}

/**
 * Dépose une pièce : demande d'URL présignée, envoi direct au stockage avec la
 * progression, puis confirmation, qui fait vérifier le fichier par le serveur.
 * Même enchaînement que `wizard-documents.tsx` sur le site.
 */
export async function uploadDocument(type: DocumentType, file: PickedFile, onProgress: (ratio: number) => void) {
  const sha = await fileSha256(file.uri)
  const ticket = await api.post<{ documentId: string; uploadUrl: string }>('trainer-applications/me/documents/upload', {
    type,
    mimeType: file.mimeType,
    sizeBytes: file.size,
    sha256: sha,
    originalFileName: file.name,
  })
  const task = createUploadTask(
    ticket.uploadUrl,
    file.uri,
    { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { 'content-type': file.mimeType } },
    ({ totalBytesSent, totalBytesExpectedToSend }) => onProgress(totalBytesExpectedToSend ? totalBytesSent / totalBytesExpectedToSend : 0),
  )
  const result = await task.uploadAsync()
  if (!result || result.status < 200 || result.status >= 300) {
    throw new ApiError('UPLOAD_FAILED', 'L’envoi du fichier a échoué. Vérifie ta connexion et réessaie.', result?.status ?? 0)
  }
  await api.post(`trainer-applications/me/documents/${ticket.documentId}/confirm`)
}
