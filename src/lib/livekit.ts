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
  AccessToken, EgressClient, RoomServiceClient, EgressStatus, TrackSource,
  EncodedFileOutput, EncodedFileType, EncodingOptions, S3Upload, StreamOutput, StreamProtocol,
  WebhookReceiver,
  type EgressInfo, type WebhookEvent,
} from 'livekit-server-sdk'
import { storageConfig } from './s3'

export interface LiveKitJoinGrant {
  roomName: string
  identity: string
  name: string
  /** Faux pour un participant dont l'animateur a coupé le micro (arbitrage 35). */
  canPublish: boolean
  /**
   * Arbitrage 144 — le droit de montrer son écran, accordé par l'animateur et
   * distinct du droit de parler. L'animateur l'a toujours.
   */
  canShareScreen: boolean
  /** Vrai pour l'animateur : lui seul pilote la salle. */
  isHost: boolean
}

/**
 * Les sources qu'un participant a le droit de publier (arbitrage 144).
 *
 * **`canPublishSources` supersède `canPublish`** côté LiveKit : dès qu'il est
 * renseigné, seules les sources listées passent. Une liste vide n'autorise
 * rien — c'est le verrou.
 *
 * Les deux droits sont **indépendants**, et c'est tout l'intérêt : un
 * participant dont l'animateur a coupé le micro peut parfaitement avoir à
 * montrer son écran, et c'est même le cas courant — une salle entièrement
 * coupée où quelqu'un vient exposer son travail. Les lier ferait de
 * « autoriser l'écran » une réouverture de micro déguisée, que personne n'a
 * demandée.
 */
function publishableSources(canSpeak: boolean, canShareScreen: boolean): TrackSource[] {
  const sources: TrackSource[] = []
  if (canSpeak) sources.push(TrackSource.CAMERA, TrackSource.MICROPHONE)
  if (canShareScreen) sources.push(TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO)
  return sources
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

let webhookReceiver: WebhookReceiver | null = null

/**
 * Vérifie et décode un webhook LiveKit (`room_finished`, `egress_ended`…).
 *
 * **Aucun repli**, à l'image du callback PawaPay : sans configuration ou sans
 * en-tête `Authorization` valide, on rend `null` et la route répond 401. Un
 * webhook non vérifiable vaut un webhook non authentifié — et celui-ci clôt des
 * séances et publie des replays. `WebhookReceiver` valide le jeton de l'en-tête,
 * qui porte le hachage du corps signé avec le secret d'API.
 */
export async function receiveLiveKitWebhook(
  rawBody: string,
  authHeader: string | null,
): Promise<WebhookEvent | null> {
  const creds = credentials()
  if (!creds || !authHeader) return null
  if (!webhookReceiver) webhookReceiver = new WebhookReceiver(creds.key, creds.secret)
  try {
    return await webhookReceiver.receive(rawBody, authHeader)
  } catch (err) {
    console.warn('[LIVEKIT:WEBHOOK]', String(err))
    return null
  }
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

  // Arbitrage 144 — le partage d'écran est une source à part, et c'est le
  // serveur qui l'ouvre. Un client qui appellerait `setScreenShareEnabled` sans
  // autorisation se voit refuser la piste, sans qu'aucun écran n'ait à deviner
  // l'état : la règle vit dans le jeton, comme le verrou de micro.
  const sources = publishableSources(grant.canPublish, grant.canShareScreen)

  token.addGrant({
    roomJoin: true,
    room: grant.roomName,
    // Qui n'a plus aucune source n'a plus rien à publier. Le garder à `true`
    // laisserait LiveKit accepter une piste que la liste refuse ensuite, avec
    // pour seul signe une erreur dans la console du navigateur.
    canPublish: sources.length > 0,
    canPublishSources: sources,
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
  /**
   * Arbitrage 144 — l'autorisation de partager son écran, poussée par le même
   * appel parce que LiveKit remplace **toute** la permission à chaque mise à
   * jour. L'oublier ici reviendrait à retirer silencieusement un partage en
   * cours au premier geste de modération sur le micro : elle est donc relue en
   * base par l'appelant, jamais déduite du verrou.
   */
  canShareScreen = false,
): Promise<void> {
  const client = rooms()
  if (!client) return
  const sources = publishableSources(canPublish, canShareScreen)
  try {
    await client.updateParticipant(roomName, identity, undefined, {
      canPublish: sources.length > 0,
      canPublishSources: sources,
      canSubscribe: true,
      canPublishData: true,
    })
  } catch (err) {
    // Le participant peut avoir quitté entre la décision et son application.
    // Le verrou reste posé en base : il s'appliquera à sa prochaine entrée.
    console.warn('[LIVEKIT:UPDATE_PARTICIPANT]', { roomName, identity, error: String(err) })
  }
}

/**
 * Nombre de personnes réellement connectées à la salle, selon LiveKit.
 * `null` quand on ne peut pas le savoir (LiveKit non configuré ou injoignable) :
 * afficher « 0 connecté » dans ce cas serait affirmer une salle vide.
 */
export async function countConnected(roomName: string): Promise<number | null> {
  const client = rooms()
  if (!client) return null
  try {
    return (await client.listParticipants(roomName)).length
  } catch {
    return null
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
