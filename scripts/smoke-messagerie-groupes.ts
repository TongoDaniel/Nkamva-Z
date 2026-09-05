// Smoke test de la messagerie unifiée, temps 1 (arbitrages 126 à 130), contre
// le serveur de dev.
//
//   bun scripts/smoke-messagerie-groupes.ts
//   KEEP=1 bun scripts/smoke-messagerie-groupes.ts   (laisse le jeu de données)
//
// Monte une communauté, son formateur, deux membres et un ancien membre, puis
// demande `/messagerie` avec chaque session pour vérifier ce qui en sort.
//
// Les assertions portent sur le HTML **rendu par le serveur** : la liste est
// rendue par un composant serveur, elle est déjà complète. On y cherche des
// libellés et des `href`, pas un code HTTP — une page qui plante au rendu peut
// répondre 200 si une frontière d'erreur l'absorbe (§12.2).
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const KEEP = process.env.KEEP === '1'

let echecs = 0
function verifier(intitule: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${intitule}`)
  else {
    echecs++
    console.log(`  ÉCHEC ${intitule}${detail ? `\n         ${detail}` : ''}`)
  }
}

function texteDe(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;| | /g, ' ')
    .replace(/\s+/g, ' ')
}

async function cookieFor(userId: string, email: string, trainerId: string | null) {
  const token = await encode({
    token: {
      userId, email, role: trainerId ? 'TRAINER' : 'LEARNER', adminRole: null, trainerId,
      sessionsValidAfter: new Date(0).toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  return `next-auth.session-token=${token}`
}

async function main() {
  const marque = `smoke-groupes-${Date.now()}`

  const trainerUser = await db.user.create({
    data: { email: `${marque}-form@nkamva.test`, role: 'TRAINER', fullName: 'Awa Sarr' },
  })
  const trainer = await db.trainerProfile.create({
    data: { userId: trainerUser.id, verifiedLegalName: 'Awa Sarr', approvedAt: new Date() },
  })
  const community = await db.community.create({
    data: { trainerId: trainer.id, name: `Finance ${marque}`, slug: marque, priceFcfa: 5000 },
  })

  async function membre(nom: string, status = 'ACTIVE') {
    const user = await db.user.create({
      data: { email: `${marque}-${nom.toLowerCase()}@nkamva.test`, role: 'LEARNER', fullName: nom },
    })
    await db.communitySubscription.create({
      data: {
        communityId: community.id, learnerId: user.id, status: status as never,
        periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    })
    return user
  }

  const koffi = await membre('Koffi')
  const fatou = await membre('Fatou')
  const parti = await membre('Parti', 'EXPIRED')

  const users = [trainerUser.id, koffi.id, fatou.id, parti.id]

  try {
    const { ensureCommunityGroup, sendMessage, openConversation } = await import('@/lib/messaging')
    const group = await ensureCommunityGroup(community.id)
    await sendMessage(group.id, trainerUser.id, trainer.id, { body: 'Bienvenue à toutes et tous' })
    await sendMessage(group.id, koffi.id, null, { body: 'Rendez-vous à Douala' })
    const direct = await openConversation(community.slug, fatou.id)
    await sendMessage(direct.id, fatou.id, null, { body: 'Une question en privé' })

    console.log(`\nMessagerie unifiée — ${BASE}/messagerie\n`)

    const vueFormateur = texteDe(
      await (await fetch(`${BASE}/messagerie`, {
        headers: { cookie: await cookieFor(trainerUser.id, trainerUser.email, trainer.id) },
      })).text(),
    )

    console.log('1. Le formateur voit son groupe et ses fils privés au même endroit')
    verifier('le groupe est listé', vueFormateur.includes(`Finance ${marque}`))
    verifier('le fil privé du membre est listé', vueFormateur.includes('Fatou'))
    verifier('le groupe est marqué comme tel', vueFormateur.includes('groupe'))
    verifier('les trois filtres sont là',
      vueFormateur.includes('Toutes') && vueFormateur.includes('Non lues') && vueFormateur.includes('Groupes'))
    verifier('la recherche est là', vueFormateur.includes('Rechercher'))

    console.log('\n2. Un membre voit le groupe, et qui parle dedans')
    const vueMembre = texteDe(
      await (await fetch(`${BASE}/messagerie?fil=${group.id}`, {
        headers: { cookie: await cookieFor(fatou.id, fatou.email, null) },
      })).text(),
    )
    verifier('le groupe est ouvert', vueMembre.includes(`Finance ${marque}`))
    verifier("l'auteur est nommé sur les bulles", vueMembre.includes('Awa Sarr') && vueMembre.includes('Koffi'))
    verifier('le message est là', vueMembre.includes('Rendez-vous à Douala'))

    console.log('\n3. Un ancien membre lit, sans saisie (arbitrage 129)')
    const vueParti = texteDe(
      await (await fetch(`${BASE}/messagerie?fil=${group.id}`, {
        headers: { cookie: await cookieFor(parti.id, parti.email, null) },
      })).text(),
    )
    verifier('il lit le groupe', vueParti.includes('Rendez-vous à Douala'))
    verifier('la saisie est remplacée par son motif',
      vueParti.includes('adhésion à cette communauté est terminée'),
      'motif de lecture seule absent')

    console.log("\n4. La page communauté renvoie vers le groupe au lieu d'ouvrir une saisie")
    const vueCommunaute = texteDe(
      await (await fetch(`${BASE}/mes-communautes/${community.slug}`, {
        headers: { cookie: await cookieFor(koffi.id, koffi.email, null) },
      })).text(),
    )
    verifier('le renvoi est affiché', vueCommunaute.includes('se passent dans'))
    verifier('la saisie a disparu', !vueCommunaute.includes('Lancer une discussion'))
  } finally {
    if (KEEP) {
      console.log(`\n(KEEP=1 — jeu conservé, communauté ${community.slug})`)
      console.log(`cookie formateur: ${await cookieFor(trainerUser.id, trainerUser.email, trainer.id)}`)
    } else {
      await db.message.deleteMany({ where: { conversation: { communityId: community.id } } })
      await db.conversationRead.deleteMany({ where: { conversation: { communityId: community.id } } })
      await db.conversation.deleteMany({ where: { communityId: community.id } })
      await db.communitySubscription.deleteMany({ where: { communityId: community.id } })
      await db.notification.deleteMany({ where: { userId: { in: users } } })
      await db.auditLog.deleteMany({ where: { actorId: { in: users } } })
      await db.community.delete({ where: { id: community.id } })
      await db.trainerProfile.delete({ where: { id: trainer.id } })
      await db.user.deleteMany({ where: { id: { in: users } } })
    }
  }

  console.log(echecs === 0 ? '\nTout passe.\n' : `\n${echecs} échec(s).\n`)
  await db.$disconnect()
  process.exit(echecs === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
