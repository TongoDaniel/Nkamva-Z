// Webhook LiveKit — la salle s'est fermée, ou un enregistrement est prêt.
//
// Deux trous que ce webhook rebouche (arbitrage 38) :
//
//   · `room_finished` — une séance restée `LIVE` dont la salle s'est vidée. Sans
//     cet événement, rien ne clôturait une session qu'un animateur avait quittée
//     sans cliquer « terminer » : elle restait `LIVE` pour toujours, et comme le
//     replay n'est créé qu'à la clôture, **aucun replay n'existait jamais**.
//   · `egress_ended` — l'enregistrement fichier (R2) n'a aucun autre webhook. On
//     faisait aboutir son replay par un job toutes les dix minutes ; ici on le
//     résout dès la fin de l'egress.
//
// La signature est vérifiée dans `receiveLiveKitWebhook` (pas de repli : sans
// secret ou signature, on refuse en 401 et on n'écrit rien).
import { db } from '@/lib/db'
import { auditStandalone } from '@/lib/audit'
import { receiveLiveKitWebhook } from '@/lib/livekit'
import { endLiveSessionBySystem, reconcileProcessingReplays } from '@/lib/lives'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const event = await receiveLiveKitWebhook(rawBody, request.headers.get('authorization'))
  if (!event) {
    await auditStandalone({ action: 'LIVEKIT_WEBHOOK_REJECTED', meta: { reason: 'signature_or_config' } })
    return new Response('Invalid signature', { status: 401 })
  }

  switch (event.event) {
    case 'room_finished': {
      const roomName = event.room?.name
      if (!roomName) break

      // Seule une session encore ouverte nous intéresse : la clôture est
      // idempotente, mais inutile de la tenter sur une séance déjà terminée.
      const session = await db.liveSession.findFirst({
        where: { roomName, status: 'LIVE' },
        select: { id: true },
      })
      if (session) {
        await endLiveSessionBySystem(session.id)
        // L'egress s'est arrêté en même temps que la salle : le fichier est là,
        // on résout le replay tout de suite plutôt que d'attendre le job.
        await reconcileProcessingReplays()
      }
      break
    }

    case 'egress_ended': {
      // Un enregistrement fichier vient de se terminer (fin manuelle de
      // l'animateur, ou fin système ci-dessus) : on fait aboutir le replay sans
      // attendre la passe planifiée. La réconciliation ne touche que les replays
      // `PROCESSING` issus d'un egress fichier — exactement ce cas.
      await reconcileProcessingReplays()
      break
    }

    default:
      // room_started, participant_*, track_*, egress_started/updated,
      // ingress_* : rien à faire ici.
      await auditStandalone({ action: 'LIVEKIT_WEBHOOK_IGNORED', meta: { type: event.event } })
  }

  return new Response(null, { status: 200 })
}
