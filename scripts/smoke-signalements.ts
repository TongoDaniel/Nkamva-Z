/**
 * Vérification du signalement, de bout en bout.
 *
 *   bun run dev                        # dans un autre terminal
 *   bun scripts/smoke-signalements.ts
 *
 * Ce script existe parce que chaque maillon de cette chaîne était vert
 * séparément — `createReport` testé, la route testée, la file d'instruction
 * rendue — et que la chaîne, elle, était coupée : aucun écran ne postait. Il
 * contrôle donc les jointures, pas les pièces :
 *
 *   1. le bouton est bien **rendu** sur les surfaces annoncées ;
 *   2. un signalement posté par un apprenant **arrive** en modération ;
 *   3. les refus attendus refusent (doublon, anonyme).
 *
 * Le signalement créé est supprimé à la fin, y compris en cas d'échec. Son
 * entrée au journal d'audit, elle, reste : le journal est en ajout seul, et
 * c'est très bien ainsi — mieux vaut une trace orpheline qu'un journal qu'on
 * sait retoucher.
 *
 * `SMOKE_BASE_URL` pointe ailleurs que sur le port 3000 quand un autre serveur
 * de développement l'occupe déjà.
 *
 * **Deux exécutions rapprochées donnent des 429**, et ce n'est pas une
 * régression : `RATE_LIMITS.REPORT_CREATE` autorise dix signalements par heure
 * et par compte, ce contrôle en poste quatre. Le compteur vit en mémoire —
 * redémarrer le serveur le remet à zéro.
 */
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'
const mail = (key: string) => `tongodanielfo+${key}@gmail.com`

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}`)
  else {
    failures++
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function cookieFor(email: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    select: {
      id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true,
      trainerProfile: { select: { id: true } },
    },
  })
  const token = await encode({
    token: {
      userId: user.id,
      role: user.role,
      adminRole: user.adminRole,
      trainerId: user.trainerProfile?.id ?? null,
      sessionsValidAfter: user.sessionsValidAfter.toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
      sub: user.id,
      email: user.email,
    },
    secret: SECRET,
  })
  return `next-auth.session-token=${token}`
}

/** React coupe les textes interpolés par un commentaire vide. */
const readable = (page: string) => page.replaceAll('<!-- -->', '').replaceAll('&#x27;', "'")

async function main() {
  const course = await db.course.findFirstOrThrow({
    where: { status: 'published' },
    select: { id: true, slug: true, title: true },
  })
  const community = await db.community.findFirst({ select: { id: true, slug: true, name: true } })
  const learner = await db.user.findUniqueOrThrow({
    where: { email: mail('aminata') },
    select: { id: true },
  })
  const created: string[] = []
  /** Billet retiré par le contrôle 4, à rétablir quoi qu'il arrive. */
  let restorePostId: string | null = null

  try {
    // ---- 1. Le bouton est rendu ----------------------------------------
    //
    // Les deux espaces partagent le même corps de page (`CourseScreen`), mais
    // ce sont deux URLs : les vérifier tous les deux est le seul moyen de
    // savoir que la coquille connectée n'avale pas le composant.
    for (const path of [`/ressources/${course.slug}`, `/catalogue/ressource/${course.slug}`]) {
      const html = readable(await (await fetch(`${BASE}${path}`, {
        headers: { cookie: await cookieFor(mail('aminata')) },
      })).text())
      check(
        `${path} affiche « Signaler cette ressource »`,
        html.includes('Signaler cette ressource') && !html.includes('Une erreur est survenue'),
      )
    }

    if (community) {
      const html = readable(
        await (await fetch(`${BASE}/communautes/${community.slug}`)).text(),
      )
      check(
        `/communautes/${community.slug} affiche « Signaler cette communauté »`,
        html.includes('Signaler cette communauté'),
      )
    }

    // La fiche formateur : le compte se signale depuis son profil public, et
    // seulement quand on n'est pas soi-même.
    const trainerProfile = await db.trainerProfile.findFirst({
      where: { approvedAt: { not: null }, suspendedAt: null, courses: { some: { status: 'published' } } },
      select: { id: true, userId: true, user: { select: { email: true } } },
    })
    if (trainerProfile) {
      const seenByOther = readable(
        await (await fetch(`${BASE}/formateurs/${trainerProfile.id}`, {
          headers: { cookie: await cookieFor(mail('aminata')) },
        })).text(),
      )
      check(
        `/formateurs/${trainerProfile.id} affiche « Signaler ce compte »`,
        seenByOther.includes('Signaler ce compte'),
      )
      const seenBySelf = readable(
        await (await fetch(`${BASE}/formateurs/${trainerProfile.id}`, {
          headers: { cookie: await cookieFor(trainerProfile.user.email) },
        })).text(),
      )
      check(
        'le formateur ne se voit pas proposer de se signaler lui-même',
        !seenBySelf.includes('Signaler ce compte'),
      )
    }

    // ---- 1 bis. Les surfaces conversationnelles ------------------------
    //
    // Ce sont celles où le harcèlement se joue, et elles n'avaient aucune
    // issue : le fil ne portait que l'épingle et la corbeille.
    //
    // Le fil de la communauté est devenu son **groupe**, dans la messagerie
    // (arbitrage 126) : c'est là que ce contrôle a désormais lieu, et un message
    // de groupe se signale comme n'importe quel message. Le détour par
    // `/mes-communautes` n'a plus lieu d'être — cette page ne porte plus de
    // conversation.
    const groupMessage = await db.message.findFirst({
      where: { deletedAt: null, conversation: { kind: 'GROUP' } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, senderId: true,
        conversation: { select: { id: true, communityId: true } },
      },
    })
    // Le lecteur doit être un **membre** qui n'a pas écrit le message : on ne se
    // signale pas soi-même, et un non-membre ne voit pas le groupe.
    const groupViewer = groupMessage
      ? await db.communitySubscription.findFirst({
          where: {
            communityId: groupMessage.conversation.communityId,
            status: 'ACTIVE',
            learnerId: { not: groupMessage.senderId },
          },
          select: { learner: { select: { email: true } } },
        })
      : null
    if (groupMessage && groupViewer) {
      // `?fil=` est indispensable : sans lui la page rend la liste et un
      // « Choisissez une conversation », donc aucune bulle à signaler.
      const groupe = readable(
        await (await fetch(`${BASE}/messagerie?fil=${groupMessage.conversation.id}`, {
          headers: { cookie: await cookieFor(groupViewer.learner.email) },
        })).text(),
      )
      check(
        '/messagerie pose le signalement sur les bulles du groupe',
        groupe.includes('Signaler ce message') && !groupe.includes('Une erreur est survenue'),
      )
    } else {
      console.log('· aucun message de groupe lisible par un membre tiers : contrôle ignoré')
    }

    const peerMessage = await db.message.findFirst({
      where: { deletedAt: null },
      select: {
        id: true,
        conversationId: true,
        conversation: { select: { learner: { select: { email: true } }, trainerProfile: { select: { user: { select: { email: true } } } } } },
        senderId: true,
      },
    })
    if (peerMessage) {
      // Ouvrir le fil du côté qui n'a pas écrit le message : c'est là que le
      // bouton doit apparaître.
      // `learner` est nul sur un groupe (arbitrage 126) ; ce chemin ne traite que
      // les fils privés, d'où la garde plutôt qu'un accès direct.
      const learnerEmail = peerMessage.conversation.learner?.email ?? null
      const trainerEmail = peerMessage.conversation.trainerProfile.user.email
      const sender = await db.user.findUniqueOrThrow({
        where: { id: peerMessage.senderId }, select: { email: true },
      })
      const viewerEmail = sender.email === learnerEmail ? trainerEmail : (learnerEmail ?? trainerEmail)
      // `?fil=` est indispensable : sans lui la page rend la liste et un
      // « Choisissez une conversation », donc aucune bulle à signaler.
      const pane = readable(
        await (await fetch(`${BASE}/messagerie?fil=${peerMessage.conversationId}`, {
          headers: { cookie: await cookieFor(viewerEmail) },
        })).text(),
      )
      check(
        '/messagerie pose le signalement sur les bulles de l\'interlocuteur',
        pane.includes('Signaler ce message') && !pane.includes('Une erreur est survenue'),
      )
    }

    const supportMessage = await db.disputeMessage.findFirst({
      where: { authorRole: 'SUPPORT' },
      select: { id: true, dispute: { select: { id: true, purchase: { select: { learner: { select: { email: true } } } } } } },
    })
    if (supportMessage) {
      const page = readable(
        await (await fetch(`${BASE}/mes-litiges/${supportMessage.dispute.id}`, {
          headers: { cookie: await cookieFor(supportMessage.dispute.purchase.learner.email) },
        })).text(),
      )
      check(
        '/mes-litiges/… pose le signalement sur les messages du support',
        page.includes('Signaler ce message de litige'),
      )
    } else {
      console.log('· aucun message de support en base : contrôle du litige ignoré')
    }

    // ---- 2. Un signalement arrive en modération ------------------------
    const learnerCookie = await cookieFor(mail('aminata'))
    const post = (body: unknown, cookie?: string) =>
      fetch(`${BASE}/api/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      })

    const payload = {
      targetType: 'COURSE',
      targetId: course.id,
      reason: 'MISLEADING',
      detail: 'Contrôle automatique — smoke-signalements.',
    }

    const res = await post(payload, learnerCookie)
    const created201 = (await res.json()) as { data?: { id?: string } }
    if (created201.data?.id) created.push(created201.data.id)
    check(
      'POST /api/reports — 201 pour un apprenant connecté',
      res.status === 201 && Boolean(created201.data?.id),
      `reçu ${res.status}`,
    )

    // C'est le contrôle qui manquait : le signalement doit être **instruisible**,
    // pas seulement enregistré.
    const inQueue = await db.report.findFirst({
      where: { reporterId: learner.id, targetId: course.id, status: 'OPEN' },
      select: { id: true, reason: true, detail: true },
    })
    check(
      'le signalement est en base, ouvert, avec son motif et sa précision',
      inQueue?.reason === 'MISLEADING' && inQueue.detail?.includes('smoke-signalements') === true,
    )

    const moderation = await cookieFor(mail('moderation'))
    const queue = readable(
      await (await fetch(`${BASE}/admin/signalements`, { headers: { cookie: moderation } })).text(),
    )
    check(
      '/admin/signalements liste le signalement à instruire',
      inQueue !== null && queue.includes(inQueue.id.slice(0, 8)),
      'la file ne montre pas le signalement fraîchement créé',
    )
    if (inQueue) {
      const detailPage = readable(
        await (
          await fetch(`${BASE}/admin/signalements/${inQueue.id}`, { headers: { cookie: moderation } })
        ).text(),
      )
      check(
        "l'écran d'instruction rend le signalement et sa cible",
        detailPage.includes('smoke-signalements') && detailPage.includes(course.title),
      )
    }

    // ---- 3. Les refus attendus refusent -------------------------------
    const duplicate = await post(payload, learnerCookie)
    const duplicateBody = (await duplicate.json()) as { error?: { code?: string; message?: string } }
    check(
      'un second signalement du même objet est refusé en 409',
      duplicate.status === 409 && duplicateBody.error?.code === 'REPORT_ALREADY_OPEN',
      `reçu ${duplicate.status} ${JSON.stringify(duplicateBody)}`,
    )
    check(
      'le refus porte un message affichable tel quel par le bouton',
      (duplicateBody.error?.message ?? '').includes('déjà signalé'),
      `message reçu : ${duplicateBody.error?.message}`,
    )

    const anonymous = await post(payload)
    check(
      'un visiteur non connecté est refusé en 401',
      anonymous.status === 401,
      `reçu ${anonymous.status}`,
    )

    const badTarget = await post({ ...payload, targetId: 'pas-un-uuid' }, learnerCookie)
    check(
      'un identifiant de cible malformé est refusé en 422',
      badTarget.status === 422 || badTarget.status === 400,
      `reçu ${badTarget.status}`,
    )

    // ---- 4. Retenir un signalement retire vraiment la cible ------------
    //
    // Le contrôle qui manquait au précédent : la clôture ne savait qu'archiver
    // une ressource. Sur un billet de fil, elle rédigeait une note et rien de
    // plus. On vérifie donc l'effet, pas seulement le statut.
    if (groupMessage) {
      const reported = await post(
        {
          targetType: 'MESSAGE',
          targetId: groupMessage.id,
          reason: 'HARASSMENT',
          detail: 'Contrôle automatique — smoke-signalements (billet).',
        },
        learnerCookie,
      )
      const body = (await reported.json()) as { data?: { id?: string } }
      if (body.data?.id) created.push(body.data.id)
      check(
        'POST /api/reports accepte un message de groupe',
        reported.status === 201,
        `reçu ${reported.status}`,
      )

      if (body.data?.id) {
        restorePostId = groupMessage.id
        const row = await db.report.findUniqueOrThrow({
          where: { id: body.data.id },
          select: { updatedAt: true },
        })
        const resolve = await fetch(`${BASE}/api/admin/reports/${body.data.id}/resolve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: await cookieFor(mail('moderation')) },
          body: JSON.stringify({
            status: 'UPHELD',
            decisionNote: 'Contrôle automatique — retrait du message signalé.',
            hideTarget: true,
            expectedUpdatedAt: row.updatedAt.toISOString(),
          }),
        })
        check(
          'la Modération peut retenir le signalement en retirant le message',
          resolve.status === 200,
          `reçu ${resolve.status} ${await resolve.clone().text()}`,
        )
        const after = await db.message.findUniqueOrThrow({
          where: { id: groupMessage.id },
          select: { deletedAt: true, deletedById: true },
        })
        check(
          'le message est retiré du groupe, pas supprimé de la base',
          after.deletedAt !== null && after.deletedById !== null,
        )
        const feedAfter = readable(
          await (await fetch(`${BASE}/messagerie?fil=${groupMessage.conversation.id}`, {
            headers: { cookie: learnerCookie },
          })).text(),
        )
        check(
          'le groupe affiche « Ce message a été retiré. » à sa place',
          feedAfter.includes('Ce message a été retiré.'),
        )
      }
    }
  } finally {
    // Le message appartient au jeu de démonstration : on le remet en état,
    // sinon chaque exécution du contrôle amputerait le groupe d'un message.
    if (restorePostId) {
      await db.message.update({
        where: { id: restorePostId },
        data: { deletedAt: null, deletedById: null },
      })
      console.log('Message de démonstration rétabli.')
    }
    for (const id of created) {
      await db.report.deleteMany({ where: { id } })
    }
    // Le doublon n'a rien créé, mais un contrôle interrompu au mauvais endroit
    // peut laisser une trace : on nettoie sur le motif, pas sur la seule liste.
    await db.report.deleteMany({
      where: { detail: { contains: 'smoke-signalements' } },
    })
    console.log('\nSignalements de contrôle supprimés.')
  }

  console.log(failures ? `\n${failures} contrôle(s) en échec.` : '\nChaîne du signalement complète.')
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
