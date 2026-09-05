// Smoke test du panneau « Inviter » (F5, constat 10), contre le serveur de dev.
//
//   bun scripts/smoke-invitations.ts
//   KEEP=1 bun scripts/smoke-invitations.ts   (laisse le jeu de données)
//
// Crée un formateur, une communauté et quatre invitations qui se lisent
// différemment — un lien de parrainage entamé, un lien épuisé, un nominatif en
// attente, un nominatif accepté — puis demande la page avec une session forgée.
//
// Ce que le test cherche vraiment : que le lien entamé **ne dise plus « En
// attente »**. C'était le constat de l'audit — un formateur voyait des membres
// entrer et son écran affirmer que rien ne s'était passé.
//
// Les assertions portent sur le HTML rendu par le serveur. Le panneau est un
// composant client, mais il reçoit ses lignes du serveur et le premier rendu
// les porte déjà — et les quatre rubriques sont dans le DOM, masquées par
// `hidden`, donc pas besoin de cliquer sur l'onglet.
import { config } from 'dotenv'
import { encode } from 'next-auth/jwt'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const KEEP = process.env.KEEP === '1'
const JOUR = 86_400_000

let echecs = 0
function verifier(intitule: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${intitule}`)
  else {
    echecs++
    console.log(`  ÉCHEC ${intitule}${detail ? `\n         ${detail}` : ''}`)
  }
}

/** Le texte visible, débarrassé des balises et des marqueurs RSC. */
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

/**
 * Un jeton bidon : le smoke test ne passe par aucun chemin d'acceptation.
 *
 * Le clair n'est stocké que pour un lien partageable — un nominatif ne se
 * réaffiche jamais (arbitrage 82), et c'est ce qui décide de la présence du
 * bouton « copier » sur la ligne.
 */
function jeton(suffixe: string, garderLeClair: boolean) {
  const clair = `smk${suffixe}${Math.random().toString(36).slice(2, 10)}`
  return {
    token: garderLeClair ? clair : null,
    tokenHash: `hash-${clair}`,
    tokenPrefix: clair.slice(0, 8),
  }
}

async function main() {
  const marque = `smoke-invit-${Date.now()}`

  const trainerUser = await db.user.create({
    data: { email: `${marque}@nkamva.test`, role: 'TRAINER', fullName: 'Formatrice Invitations' },
  })
  const profile = await db.trainerProfile.create({
    data: { userId: trainerUser.id, verifiedLegalName: 'Formatrice Invitations', approvedAt: new Date() },
  })
  const community = await db.community.create({
    data: {
      trainerId: profile.id, name: 'Cercle des semeurs', slug: marque,
      priceFcfa: 5000, status: 'active', visibility: 'PUBLIC',
    },
  })

  const dansUnMois = new Date(Date.now() + 30 * JOUR)

  // 1. Le cas de l'audit : un lien qui sert, et qui le disait mal.
  const lienEntame = await db.communityInvitation.create({
    data: {
      communityId: community.id, issuerId: trainerUser.id, issuerRole: 'TRAINER',
      kind: 'SHARE_LINK', grant: 'PAID', email: null, giftMonths: null,
      ...jeton('a', true), usesCount: 7, maxUses: 25, expiresAt: dansUnMois,
    },
  })
  // 2. Un second lien, arrivé au bout : là, un libellé reprend la main.
  //
  // Il est émis par un membre, et pas par le formateur : l'index partiel ne
  // laisse qu'un seul lien ouvert par émetteur et par communauté, et c'est
  // aussi le seul moyen de vérifier la mention « partagé par ».
  const parrain = await db.user.create({
    data: { email: `${marque}-parrain@nkamva.test`, role: 'LEARNER', fullName: 'Membre Parrain' },
  })
  await db.communityInvitation.create({
    data: {
      communityId: community.id, issuerId: parrain.id, issuerRole: 'MEMBER',
      kind: 'SHARE_LINK', grant: 'PAID', email: null, giftMonths: null,
      ...jeton('b', true), usesCount: 25, maxUses: 25, expiresAt: dansUnMois,
    },
  })
  // 3 et 4. Les nominatifs, où la pastille binaire est juste et le reste.
  await db.communityInvitation.create({
    data: {
      communityId: community.id, issuerId: trainerUser.id, issuerRole: 'TRAINER',
      kind: 'NOMINATIVE', grant: 'PAID', email: `${marque}-attente@nkamva.test`,
      giftMonths: null, ...jeton('c', false), usesCount: 0, maxUses: 1, expiresAt: dansUnMois,
    },
  })
  const invitee = await db.user.create({
    data: { email: `${marque}-entree@nkamva.test`, role: 'LEARNER', fullName: 'Membre Entré' },
  })
  await db.communityInvitation.create({
    data: {
      communityId: community.id, issuerId: trainerUser.id, issuerRole: 'TRAINER',
      kind: 'NOMINATIVE', grant: 'PAID', email: invitee.email,
      giftMonths: null, ...jeton('d', false), usesCount: 1, maxUses: 1, expiresAt: dansUnMois,
      acceptedAt: new Date(), acceptedById: invitee.id,
    },
  })

  const token = await encode({
    token: {
      userId: trainerUser.id, email: trainerUser.email, role: 'TRAINER',
      adminRole: null, trainerId: profile.id,
      sessionsValidAfter: new Date(0).toISOString(),
      issuedAt: Math.floor(Date.now() / 1000),
    },
    secret: process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production',
  })
  const cookie = `next-auth.session-token=${token}`

  try {
    console.log(`\nPanneau « Inviter » — ${BASE}/formateur/communaute?onglet=invitations\n`)

    const res = await fetch(`${BASE}/formateur/communaute?onglet=invitations`, {
      headers: { cookie },
    })
    const html = await res.text()
    const texte = texteDe(html)

    console.log('1. La page se rend, et rend les quatre invitations')
    verifier('statut 200', res.status === 200, `statut ${res.status}`)
    verifier('le panneau est là', texte.includes('Invitations émises'))
    verifier('les deux adresses figurent',
      texte.includes(`${marque}-attente@nkamva.test`) && texte.includes(`${marque}-entree@nkamva.test`))
    verifier('les deux liens de parrainage figurent',
      (texte.match(/Lien de parrainage/g) ?? []).length >= 2,
      `${(texte.match(/Lien de parrainage/g) ?? []).length} occurrence(s)`)

    console.log('\n2. Le constat 10 : un lien entamé porte son compteur')
    verifier('la pastille affiche « 7 / 25 entrés »', texte.includes('7 / 25 entrés'))
    verifier('le compteur ne fait pas doublon dans le titre de ligne',
      !texte.includes('7/25 utilisations'))

    console.log('\n3. Les autres formes gardent leur libellé')
    verifier('le lien au plafond est « Épuisée »', texte.includes('Épuisée'))
    verifier("le lien d'un membre dit de qui il vient", texte.includes('partagé par Membre Parrain'))
    verifier('le nominatif non consommé est « En attente »', texte.includes('En attente'))
    verifier('le nominatif consommé est « Acceptée »', texte.includes('Acceptée'))

    console.log('\n4. Le vocabulaire du filtre suit')
    // « En attente » comme filtre recouvrait un lien qui, lui, sert déjà.
    verifier('le filtre s\'appelle « Actives »', texte.includes('Actives'))

    console.log('\n5. Le compte de l\'onglet ne sonne que pour ce qui peut servir')
    // Deux actives : le lien entamé et le nominatif en attente. Ni l'épuisé ni
    // l'accepté n'appellent quoi que ce soit.
    verifier('l\'onglet Invitations compte 2', /Invitations\s*2\b/.test(texte),
      texte.match(/Invitations\s*\d+/)?.[0] ?? 'aucun compte trouvé')

    console.log('\n6. L\'API rend de quoi construire la pastille')
    const api = await fetch(`${BASE}/api/trainer/communities/${community.id}/invitations`, {
      headers: { cookie },
    })
    // L'enveloppe : `success()` range les lignes sous `data`, et c'est ce que
    // `api.get()` déballe côté navigateur.
    const enveloppe = (await api.json()) as { data?: Array<Record<string, unknown>> }
    const lignes = enveloppe.data ?? []
    const entame = lignes.find((l) => l.id === lienEntame.id)
    verifier('statut 200', api.status === 200, `statut ${api.status}`)
    verifier('le lien entamé y est encore actif', entame?.status === 'PENDING', String(entame?.status))
    verifier('avec son compteur', entame?.usesCount === 7 && entame?.maxUses === 25)
    verifier('et sa forme', entame?.kind === 'SHARE_LINK')
  } finally {
    if (KEEP) {
      console.log(`\n(KEEP=1 — jeu de données conservé, formateur ${trainerUser.email})`)
      console.log(`cookie: ${cookie}`)
    } else {
      await db.communityInvitation.deleteMany({ where: { communityId: community.id } })
      await db.community.delete({ where: { id: community.id } })
      await db.trainerProfile.delete({ where: { id: profile.id } })
      await db.user.deleteMany({
        where: { id: { in: [trainerUser.id, invitee.id, parrain.id] } },
      })
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
