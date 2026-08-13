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
  AccessToken, EgressClient, RoomServiceClient, EgressStatus,
  EncodedFileOutput, EncodedFileType, EncodingOptions, S3Upload, StreamOutput, StreamProtocol,
  type EgressInfo,
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
  return startFileEgress(roomName, s3Key, false)
}

/**
 * Le second enregistrement, audio seul (arbitrage 94).
 *
 * Deux heures pèsent ~60 Mo contre ~1,3 Go pour la vidéo. Sur les connexions
 * que sert la plateforme, c'est la différence entre un replay qu'on écoute et
 * un replay qu'on ne charge jamais. Son échec n'a aucune conséquence : le
 * replay vidéo, lui, est déjà là.
 */
export async function startAudioRecording(
  roomName: string,
  s3Key: string,
): Promise<string | null> {
  return startFileEgress(roomName, s3Key, true)
}

/**
 * Une seule définition, volontairement modeste (arbitrage 94) : 1 280 × 720 à
 * 24 images et 1 200 kbit/s.
 *
 * Le défaut de LiveKit est 1080p à 4 500 kbit/s — trois fois plus d'octets pour
 * une séance qui est, l'essentiel du temps, des visages et des diapositives. Ce
 * sont ces octets-là qui remplissent le quota du formateur et qu'il faut
 * ensuite lui vendre : les produire par défaut reviendrait à lui facturer notre
 * propre réglage.
 */
function encodingOptions(audioOnly: boolean): EncodingOptions {
  return new EncodingOptions(
    audioOnly
      ? { audioBitrate: 64 }
      : { width: 1280, height: 720, framerate: 24, videoBitrate: 1200, audioBitrate: 96 },
  )
}

async function startFileEgress(
  roomName: string,
  s3Key: string,
  audioOnly: boolean,
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
      fileType: audioOnly ? EncodedFileType.OGG : EncodedFileType.MP4,
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

    const info = await client.startRoomCompositeEgress(roomName, output, {
      encodingOptions: encodingOptions(audioOnly),
      audioOnly,
    })
    return info.egressId
  } catch (err) {
    console.error('[LIVEKIT:EGRESS_START]', { roomName, audioOnly, error: String(err) })
    return null
  }
}

/**
 * Pousse la composition de la salle vers une ingestion RTMP — celle de Mux.
 *
 * **Ce n'est plus le chemin par défaut** (arbitrage 94) : à tarifs publics, deux
 * heures de séance coûtent ~3 700 FCFA sur 24 mois chez Mux contre ~290 FCFA
 * dans le seau, la sortie de données y étant gratuite. Mux reste appelable —
 * son encodage adaptatif n'a pas d'équivalent ici — mais il se demande
 * explicitement, par `REPLAY_RECORDER=MUX`.
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

export type EgressOutcome =
  | { done: false }
  | { done: true; ok: true; s3Key: string; sizeBytes: number; durationSeconds: number }
  | { done: true; ok: false; reason: string }

/**
 * État réel d'un enregistrement fichier, interrogé directement chez LiveKit.
 *
 * Contrepartie du webhook Mux côté enregistrement composé en salle : ce
 * chemin-ci — l'egress fichier vers R2, utilisé quand Mux n'est pas configuré
 * — n'a **aucun webhook**. `stopRecording` ne fait que demander l'arrêt, sans
 * attendre que le fichier soit réellement écrit ; sans ce module, un replay
 * parti par ce chemin reste `PROCESSING` pour toujours, une promesse que
 * l'arbitrage 38 tient à moitié. Voir `reconcileProcessingReplays` dans
 * `lives.ts`, qui appelle ceci depuis un job planifié.
 */
/**
 * Le fichier produit par un egress terminé, quelle que soit la façon dont le
 * serveur le range.
 *
 * `EgressInfo` porte **deux** emplacements pour le même résultat : le tableau
 * `fileResults`, et le `result` typé (`{case: 'file', value}`). Le serveur ne
 * remplit pas forcément les deux — celui qui sert cette instance ne renseigne
 * que `result`. Ne lire que `fileResults` faisait conclure « aucun fichier
 * produit » sur un enregistrement parfaitement réussi : le 8 août 2026, un
 * replay de 3 Mo déjà déposé dans le seau a été marqué `FAILED`, et le
 * formateur n'a jamais revu sa séance.
 */
function egressFile(info: EgressInfo): { filename: string; size: bigint; duration: bigint } | null {
  if (info.result?.case === 'file') return info.result.value
  return info.fileResults[0] ?? null
}

export async function getEgressOutcome(egressId: string): Promise<EgressOutcome> {
  const client = egress()
  if (!client) return { done: false }

  try {
    const [info] = await client.listEgress({ egressId })
    if (!info) return { done: false }

    switch (info.status) {
      case EgressStatus.EGRESS_COMPLETE:
      case EgressStatus.EGRESS_LIMIT_REACHED: {
        const file = egressFile(info)
        if (!file) return { done: true, ok: false, reason: 'aucun fichier produit' }
        return {
          done: true,
          ok: true,
          s3Key: file.filename,
          sizeBytes: Number(file.size),
          // Nanosecondes chez LiveKit (`FileInfo.duration`).
          durationSeconds: Math.round(Number(file.duration) / 1_000_000_000),
        }
      }
      case EgressStatus.EGRESS_FAILED:
      case EgressStatus.EGRESS_ABORTED:
        return { done: true, ok: false, reason: info.error || 'échec de l\'enregistrement' }
      default:
        // STARTING, ACTIVE, ENDING : le fichier n'est pas encore là.
        return { done: false }
    }
  } catch (err) {
    console.warn('[LIVEKIT:EGRESS_STATUS]', { egressId, error: String(err) })
    return { done: false }
  }
}
