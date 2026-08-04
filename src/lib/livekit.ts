// ==========================================================================
// Transport temps réel — adaptateur LiveKit
// ==========================================================================
// Tout ce qui touche au fournisseur vit ici, et rien d'autre. `lives.ts` ne
// connaît que les quatre verbes de ce module ; changer de fournisseur ne
// toucherait ni les règles d'accès, ni les écrans, ni la base.
//
// **Sans clés configurées, ce module ne lève pas** : il rend `null` ou un
// résultat vide, et l'écran le dit. C'est le patron de `sendEmail()`, qui
// journalise au lieu d'échouer quand `RESEND_API_KEY` est absente. La différence
// compte : un agenda de sessions et une liste de replays doivent rester
// consultables même si personne n'a encore ouvert de compte LiveKit.
//
// Deux correspondances méritent d'être signalées, parce qu'elles ne sont pas
// des détails d'implémentation mais la traduction exacte d'un arbitrage :
//
//   · Arbitrage 35/41 — « couper le micro » est un **verrou**, pas un
//     interrupteur : le lever rend au participant la commande de son micro sans
//     le rallumer. C'est très précisément `canPublish` côté LiveKit, et c'est
//     pourquoi on ne touche jamais à la piste elle-même.
//   · Arbitrage 31 — le live est une visioconférence, pas une diffusion : tout
//     participant émet par défaut. Le dimensionnement — et la facture — s'en
//     déduisent.
// ==========================================================================

import {
  AccessToken, EgressClient, RoomServiceClient,
  EncodedFileOutput, EncodedFileType, S3Upload, StreamOutput, StreamProtocol,
} from 'livekit-server-sdk'
import { storageConfig } from './s3'

export interface LiveKitJoinGrant {
  roomName: string
  identity: string
  name: string
  /** Faux pour un participant dont l'animateur a coupé le micro (arbitrage 35). */
  canPublish: boolean
  /** Vrai pour l'animateur : lui seul pilote la salle. */
  isHost: boolean
}

/** Durée d'un jeton de session. Au-delà, le client en redemande un. */
const TOKEN_TTL = '4h'

export function isLiveKitConfigured(): boolean {
  return Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
  )
}

function credentials(): { url: string; key: string; secret: string } | null {
  if (!isLiveKitConfigured()) return null
  return {
    url: process.env.LIVEKIT_URL!,
    key: process.env.LIVEKIT_API_KEY!,
    secret: process.env.LIVEKIT_API_SECRET!,
  }
}

/** L'URL que le navigateur doit ouvrir. Nulle quand rien n'est configuré. */
export function livekitUrl(): string | null {
  return process.env.LIVEKIT_URL ?? null
}

function rooms(): RoomServiceClient | null {
  const creds = credentials()
  return creds ? new RoomServiceClient(creds.url, creds.key, creds.secret) : null
}

function egress(): EgressClient | null {
  const creds = credentials()
  return creds ? new EgressClient(creds.url, creds.key, creds.secret) : null
}

// --- Jeton de participation ---

/**
 * Fabrique le jeton d'entrée en salle. Rend `null` si le transport n'est pas
 * configuré : l'appelant affiche alors la salle en mode dégradé plutôt que de
 * planter.
 *
 * Le jeton porte les droits, et c'est volontaire : les recalculer côté client
 * serait les rendre négociables.
 */
export async function mintJoinToken(grant: LiveKitJoinGrant): Promise<string | null> {
  const creds = credentials()
  if (!creds) return null

  const token = new AccessToken(creds.key, creds.secret, {
    identity: grant.identity,
    name: grant.name,
    ttl: TOKEN_TTL,
  })

  token.addGrant({
    roomJoin: true,
    room: grant.roomName,
    canPublish: grant.canPublish,
    canSubscribe: true,
    // La donnée reste ouverte même micro coupé : c'est par elle que passent la
    // main levée et le salon. Couper la parole ne coupe pas la demande de
    // parole — ce serait retirer au participant son seul recours (arbitrage 41).
    canPublishData: true,
    roomAdmin: grant.isHost,
  })

  return token.toJwt()
}

// --- Salle ---

export async function ensureRoom(roomName: string): Promise<void> {
  const client = rooms()
  if (!client) return
  try {
    await client.createRoom({
      name: roomName,
      // La salle survit dix minutes à son dernier participant : une coupure
      // réseau de l'animateur ne doit pas détruire la session en cours.
      emptyTimeout: 600,
      departureTimeout: 120,
    })
  } catch (err) {
    // `createRoom` sur une salle existante n'est pas une erreur pour nous : le
    // verbe est « s'assurer que », pas « créer ».
    if (!String(err).includes('already exists')) throw err
  }
}

export async function closeRoom(roomName: string): Promise<void> {
  const client = rooms()
  if (!client) return
  try {
    await client.deleteRoom(roomName)
  } catch (err) {
    // La salle a pu se fermer seule sur `emptyTimeout`. Terminer une session
    // déjà vide n'est pas un échec.
    console.warn('[LIVEKIT:CLOSE_ROOM]', { roomName, error: String(err) })
  }
}

/**
 * Pose ou lève le verrou de micro d'un participant (arbitrages 35 et 41).
 *
 * `canPublish: true` **ne rallume pas** le micro : LiveKit rend au client le
 * droit de publier, et c'est le participant qui décide d'en user. C'est
 * exactement ce que l'arbitrage 41 demande, sans effort supplémentaire.
 */
export async function setParticipantCanPublish(
  roomName: string,
  identity: string,
  canPublish: boolean,
): Promise<void> {
  const client = rooms()
  if (!client) return
  try {
    await client.updateParticipant(roomName, identity, undefined, {
      canPublish,
      canSubscribe: true,
      canPublishData: true,
    })
  } catch (err) {
    // Le participant peut avoir quitté entre la décision et son application.
    // Le verrou reste posé en base : il s'appliquera à sa prochaine entrée.
    console.warn('[LIVEKIT:UPDATE_PARTICIPANT]', { roomName, identity, error: String(err) })
  }
}

/** Nombre de personnes réellement connectées, pour le pic de fréquentation. */
export async function countConnected(roomName: string): Promise<number> {
  const client = rooms()
  if (!client) return 0
  try {
    return (await client.listParticipants(roomName)).length
  } catch {
    return 0
  }
}

// --- Enregistrement (arbitrage 38) ---

/**
 * Tout live est enregistré, sans décision au lancement (arbitrage 38) : cette
 * fonction est donc appelée au démarrage de **chaque** session, jamais sur
 * option.
 *
 * Rend `null` si l'egress ne peut pas démarrer — transport absent, ou stockage
 * R2 non configuré. Un enregistrement manquant ne doit pas empêcher la séance :
 * la session part quand même, et son replay restera `FAILED`.
 */
export async function startRecording(
  roomName: string,
  s3Key: string,
): Promise<string | null> {
  const client = egress()
  if (!client) return null

  // La même configuration que le reste du stockage, lue au même endroit :
  // l'egress dépose dans le seau où l'application ira chercher le replay.
  const storage = storageConfig()
  if (!storage) {
    console.warn('[LIVEKIT:EGRESS] stockage non configuré, aucun enregistrement')
    return null
  }

  try {
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: s3Key,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: storage.accessKeyId,
          secret: storage.secretAccessKey,
          bucket: storage.bucket,
          endpoint: storage.endpoint,
          region: storage.region,
          forcePathStyle: true,
        }),
      },
    })

    const info = await client.startRoomCompositeEgress(roomName, output)
    return info.egressId
  } catch (err) {
    console.error('[LIVEKIT:EGRESS_START]', { roomName, error: String(err) })
    return null
  }
}

/**
 * Pousse la composition de la salle vers une ingestion RTMP — celle de Mux.
 *
 * Préféré au dépôt de fichier quand Mux est configuré : l'enregistrement, son
 * encodage et sa diffusion adaptative deviennent son affaire, et le replay ne
 * pèse pas sur le quota du formateur.
 */
export async function startStreamRecording(
  roomName: string,
  rtmpUrl: string,
): Promise<string | null> {
  const client = egress()
  if (!client) return null

  try {
    const output = new StreamOutput({
      protocol: StreamProtocol.RTMP,
      urls: [rtmpUrl],
    })
    const info = await client.startRoomCompositeEgress(roomName, output)
    return info.egressId
  } catch (err) {
    console.error('[LIVEKIT:EGRESS_STREAM]', { roomName, error: String(err) })
    return null
  }
}

export async function stopRecording(egressId: string): Promise<void> {
  const client = egress()
  if (!client) return
  try {
    await client.stopEgress(egressId)
  } catch (err) {
    // L'egress s'arrête seul quand la salle se vide : le trouver déjà terminé
    // est le cas courant, pas une anomalie.
    console.warn('[LIVEKIT:EGRESS_STOP]', { egressId, error: String(err) })
  }
}
