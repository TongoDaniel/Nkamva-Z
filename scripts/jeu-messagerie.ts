// ==========================================================================
// Jeu d'essai de la messagerie — à créer, à essayer, à effacer
// ==========================================================================
//
//   bun scripts/jeu-messagerie.ts              crée le jeu (efface l'ancien)
//   bun scripts/jeu-messagerie.ts --nettoyer   l'efface, et rien d'autre
//   bun scripts/jeu-messagerie.ts --rappel     réaffiche les identifiants
//
// ## Ce qu'il pose, et pourquoi
//
// De quoi éprouver **toutes** les règles de la messagerie unifiée à la main,
// depuis un navigateur, avec de vrais comptes et de vrais mots de passe :
//
//   · deux communautés, donc **deux groupes** — pour voir l'épinglage du sien
//     et le classement des autres au dernier message ;
//   · un membre présent dans les deux, qui verra ses deux groupes plus ses
//     fils privés dans une seule liste ;
//   · une **ancienne membre**, qui doit lire sans écrire ;
//   · une membre **bannie de la communauté**, même règle par un autre chemin ;
//   · des messages déjà là, dont une **annonce**, et des non-lues pour que le
//     filtre « Non lues » ait quelque chose à montrer.
//
// ## Effacer sans laisser de trace
//
// Tout porte une marque unique — le domaine `@essai.nkamva.test` et le préfixe
// de slug `essai-` — et rien d'autre dans la base ne la porte. Le nettoyage
// suit les dépendances dans l'ordre : messages, conversations, adhésions,
// communautés, profils, comptes. Aucune ligne d'un autre jeu n'est touchée.
//
// Les identités sont **fixes**, pas horodatées : on peut noter ses accès une
// fois et les réutiliser. Relancer le script efface et refait le même jeu.

import { config } from 'dotenv'
import { recountCommunityMembers } from '../src/lib/communities'

config()

// Les services de messagerie ne touchent ni au stockage ni au paiement, mais
// `notify` peut expédier un courriel — et la clé Resend du `.env` de
// développement est active. On la coupe : ces comptes ont des adresses en
// `.test`, qui rebondiraient.
process.env.RESEND_API_KEY = ''

const { PrismaClient } = await import('@prisma/client')
const { hashPassword } = await import('../src/lib/password')
const { ensureCommunityGroup, sendMessage, openConversationWithMember, markConversationRead } =
  await import('../src/lib/messaging')

const db = new PrismaClient()

/** La marque. Rien d'autre dans la base ne la porte. */
const DOMAINE = '@essai.nkamva.test'
const PREFIXE_SLUG = 'essai-'

/** Un seul mot de passe pour tout le monde : dix caractères, une majuscule, un chiffre. */
const MOT_DE_PASSE = 'Messagerie1'

/**
 * Des photos pour quatre des sept comptes.
 *
 * Servies depuis `public/`, jamais depuis R2 : le `.env` de développement
 * pointe le seau de **production**, et une photo d'essai n'a rien à y faire.
 * Une simple URL relative suffit — `User.avatarUrl` porte une adresse, pas une
 * clé de stockage.
 *
 * Trois comptes restent sans photo, exprès : la liste doit montrer les deux
 * rendus côte à côte — le portrait et les initiales sur leur dégradé — sinon
 * on ne voit pas que le second existe encore.
 */
const PHOTOS = {
  awa: '/Img-test/mangue-1024x681.jpg',
  yao: '/Img-test/5075_MANGUE_KEITT.webp',
  koffi: '/Img-test/l-intro-1669862484.jpg',
  fatou: '/Img-test/30france-baguette-1-72e2-superJumbo.webp',
} as const

const JOUR = 86_400_000
const MINUTE = 60_000

// --- Effacement -----------------------------------------------------------

async function nettoyer(): Promise<{ comptes: number; communautes: number }> {
  const comptes = await db.user.findMany({
    where: { email: { endsWith: DOMAINE } },
    select: { id: true, trainerProfile: { select: { id: true } } },
  })
  const ids = comptes.map((u) => u.id)
  const profils = comptes.map((u) => u.trainerProfile?.id).filter(Boolean) as string[]

  const communautes = await db.community.findMany({
    where: { slug: { startsWith: PREFIXE_SLUG } },
    select: { id: true },
  })
  const communauteIds = communautes.map((c) => c.id)

  if (communauteIds.length > 0) {
    // Les messages tiennent aux conversations, qui tiennent aux communautés :
    // on remonte la chaîne à l'envers.
    await db.message.deleteMany({ where: { conversation: { communityId: { in: communauteIds } } } })
    await db.conversationRead.deleteMany({
      where: { conversation: { communityId: { in: communauteIds } } },
    })
    await db.conversation.deleteMany({ where: { communityId: { in: communauteIds } } })
    await db.communitySubscription.deleteMany({ where: { communityId: { in: communauteIds } } })
    await db.communityInvitation.deleteMany({ where: { communityId: { in: communauteIds } } })
    await db.communityCourse.deleteMany({ where: { communityId: { in: communauteIds } } })
    await db.community.deleteMany({ where: { id: { in: communauteIds } } })
  }

  if (profils.length > 0) {
    await db.wallet.deleteMany({ where: { trainerId: { in: profils } } })
    await db.trainerProfile.deleteMany({ where: { id: { in: profils } } })
  }

  if (ids.length > 0) {
    await db.notification.deleteMany({ where: { userId: { in: ids } } })
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  }

  return { comptes: ids.length, communautes: communauteIds.length }
}

// --- Création -------------------------------------------------------------

interface Personne {
  id: string
  email: string
  nom: string
  role: string
}

async function creerCompte(
  prenom: string,
  nom: string,
  identifiant: string,
  role: 'LEARNER' | 'TRAINER',
  motDePasse: string,
): Promise<Personne> {
  const email = `${identifiant}${DOMAINE}`
  const user = await db.user.create({
    data: {
      email,
      fullName: `${prenom} ${nom}`,
      role,
      passwordHash: motDePasse,
      avatarUrl: PHOTOS[identifiant as keyof typeof PHOTOS] ?? null,
      // Vérifiée d'office : sans cela, la connexion réclamerait un code reçu
      // par courriel, et ces adresses n'en reçoivent aucun.
      emailVerifiedAt: new Date(),
      countryCode: 'CM',
    },
  })
  return { id: user.id, email, nom: `${prenom} ${nom}`, role }
}

async function main() {
  const arg = process.argv[2]

  if (arg === '--nettoyer') {
    const { comptes, communautes } = await nettoyer()
    console.log(`\nEffacé : ${comptes} compte(s), ${communautes} communauté(s).\n`)
    await db.$disconnect()
    return
  }

  if (arg === '--rappel') {
    const comptes = await db.user.findMany({
      where: { email: { endsWith: DOMAINE } },
      select: { email: true, fullName: true, role: true },
      orderBy: { createdAt: 'asc' },
    })
    if (comptes.length === 0) {
      console.log('\nAucun jeu en place. Lancez le script sans argument pour le créer.\n')
    } else {
      console.log(`\nMot de passe commun : ${MOT_DE_PASSE}\n`)
      for (const c of comptes) {
        console.log(`  ${c.email.padEnd(34)} ${(c.fullName ?? '').padEnd(18)} ${c.role}`)
      }
      console.log()
    }
    await db.$disconnect()
    return
  }

  // Un jeu à la fois : on efface le précédent pour que les adresses restent
  // libres et que le résultat soit toujours le même.
  const efface = await nettoyer()
  if (efface.comptes > 0) {
    console.log(`(jeu précédent effacé : ${efface.comptes} comptes)`)
  }

  const hash = await hashPassword(MOT_DE_PASSE)

  console.log('\nCréation du jeu d\'essai de la messagerie…\n')

  // --- Les gens -----------------------------------------------------------
  const awa = await creerCompte('Awa', 'Sarr', 'awa', 'TRAINER', hash)
  const yao = await creerCompte('Yao', 'Kouadio', 'yao', 'TRAINER', hash)
  const koffi = await creerCompte('Koffi', "N'Da", 'koffi', 'LEARNER', hash)
  const fatou = await creerCompte('Fatou', 'Diop', 'fatou', 'LEARNER', hash)
  const moussa = await creerCompte('Moussa', 'Traoré', 'moussa', 'LEARNER', hash)
  const ines = await creerCompte('Inès', 'Kouassi', 'ines', 'LEARNER', hash)
  const bintou = await creerCompte('Bintou', 'Camara', 'bintou', 'LEARNER', hash)

  async function profil(personne: Personne, nomLegal: string) {
    const p = await db.trainerProfile.create({
      data: {
        userId: personne.id,
        verifiedLegalName: nomLegal,
        approvedAt: new Date(Date.now() - 90 * JOUR),
        slogan: 'Compte d\'essai',
      },
    })
    await db.wallet.create({ data: { trainerId: p.id, balance: 0 } })
    return p
  }

  const profilAwa = await profil(awa, 'Awa Sarr')
  const profilYao = await profil(yao, 'Yao Kouadio')

  // --- Les communautés ----------------------------------------------------
  async function communaute(trainerId: string, nom: string, slug: string, description: string) {
    return db.community.create({
      data: {
        trainerId,
        name: nom,
        slug: `${PREFIXE_SLUG}${slug}`,
        description,
        priceFcfa: 5_000,
        status: 'active',
        visibility: 'PUBLIC',
        forumEnabled: true,
        messagingEnabled: true,
        resourcesEnabled: true,
        eventsEnabled: true,
      },
    })
  }

  const atelier = await communaute(
    profilAwa.id,
    'Atelier Montage',
    'atelier-montage',
    'Le suivi des montages, semaine après semaine.',
  )
  const cercle = await communaute(
    profilYao.id,
    'Cercle Finance',
    'cercle-finance',
    'Comprendre ses chiffres avant de les commenter.',
  )

  // --- Les adhésions ------------------------------------------------------
  async function adherer(
    communityId: string,
    learnerId: string,
    opts: { statut?: 'ACTIVE' | 'EXPIRED' | 'BANNED'; depuis?: number } = {},
  ) {
    const statut = opts.statut ?? 'ACTIVE'
    const depuis = opts.depuis ?? 60
    const sub = await db.communitySubscription.create({
      data: {
        communityId,
        learnerId,
        status: statut,
        periodStart: new Date(Date.now() - depuis * JOUR),
        periodEnd:
          statut === 'EXPIRED'
            ? new Date(Date.now() - 5 * JOUR)
            : new Date(Date.now() + 25 * JOUR),
      },
    })
    // Ce script écrit les adhésions **directement**, sans passer par le service
    // qui les vend : c'est lui qui a fait dériver `membersCount`, resté à zéro
    // pendant que la communauté comptait quatre membres. Le recompte rétablit
    // l'invariant à chaque appel.
    await recountCommunityMembers(db, communityId)
    return sub
  }

  await adherer(atelier.id, koffi.id)
  await adherer(atelier.id, fatou.id)
  await adherer(atelier.id, moussa.id)
  // Ancienne membre : sa période est close. Elle lit le groupe, elle n'y écrit
  // plus (arbitrage 129).
  await adherer(atelier.id, ines.id, { statut: 'EXPIRED', depuis: 120 })
  // Bannie de la communauté : elle assiste sans prendre la parole. Même
  // conséquence, autre chemin (arbitrage 40).
  await adherer(atelier.id, bintou.id, { statut: 'BANNED' })
  // Koffi est dans les deux : c'est lui qui verra deux groupes.
  await adherer(cercle.id, koffi.id, { depuis: 30 })
  await adherer(cercle.id, fatou.id, { depuis: 20 })

  // --- Les groupes et leurs messages --------------------------------------
  const groupeAtelier = await ensureCommunityGroup(atelier.id)
  const groupeCercle = await ensureCommunityGroup(cercle.id)

  /** Envoie, puis recule la date : un fil daté d'aujourd'hui à la seconde près se lit mal. */
  async function dire(
    conversationId: string,
    auteur: Personne,
    trainerProfileId: string | null,
    corps: string,
    ilYAMinutes: number,
    annonce = false,
  ) {
    const { id } = await sendMessage(conversationId, auteur.id, trainerProfileId, {
      body: corps,
      announcement: annonce,
    })
    const quand = new Date(Date.now() - ilYAMinutes * MINUTE)
    await db.message.update({ where: { id }, data: { createdAt: quand } })
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: quand },
    })
    return id
  }

  await dire(groupeAtelier.id, awa, profilAwa.id,
    'Bienvenue à toutes et tous. On se retrouve ici entre les séances.', 4_320)
  await dire(groupeAtelier.id, koffi, null,
    'Merci ! J\'ai une question sur le rythme de montage, je la pose ce soir.', 4_180)
  await dire(groupeAtelier.id, fatou, null,
    'Pareil de mon côté, surtout sur les transitions.', 4_100)
  await dire(groupeAtelier.id, awa, profilAwa.id,
    'Séance de correction collective jeudi 18 h. Apportez un rush de deux minutes.',
    2_880, true)
  await dire(groupeAtelier.id, moussa, null,
    'Noté pour jeudi. Est-ce qu\'on peut envoyer le rush à l\'avance ?', 1_440)
  await dire(groupeAtelier.id, awa, profilAwa.id,
    'Oui, déposez-le dans le fil privé, je regarde avant la séance.', 120)

  await dire(groupeCercle.id, yao, profilYao.id,
    'On démarre lundi par la lecture d\'un compte de résultat.', 2_000)
  await dire(groupeCercle.id, koffi, null,
    'Je prends. Faut-il apporter ses propres chiffres ?', 90)

  // --- Les fils privés ----------------------------------------------------
  const filAwaKoffi = await openConversationWithMember(atelier.id, koffi.id, awa.id)
  await dire(filAwaKoffi.id, koffi, null,
    'Bonjour Awa, voici mon rush de la semaine dernière.', 1_500)
  await dire(filAwaKoffi.id, awa, profilAwa.id,
    'Reçu. Le rythme est bon, c\'est la fin qui traîne un peu.', 1_400)
  await dire(filAwaKoffi.id, koffi, null,
    'Je retente une version plus courte ce soir.', 60)

  const filAwaFatou = await openConversationWithMember(atelier.id, fatou.id, awa.id)
  await dire(filAwaFatou.id, awa, profilAwa.id,
    'Fatou, ta question de jeudi mérite qu\'on la reprenne à deux.', 300)

  const filYaoKoffi = await openConversationWithMember(cercle.id, koffi.id, yao.id)
  await dire(filYaoKoffi.id, yao, profilYao.id,
    'Koffi, ton bilan est prêt ? On peut le regarder avant lundi.', 45)

  // --- Ce qui est lu, et ce qui ne l'est pas ------------------------------
  // Awa a tout lu de son groupe et du fil de Fatou : sa pastille de non-lues
  // ne portera donc que ce que Koffi vient d'écrire.
  await markConversationRead(groupeAtelier.id, awa.id, profilAwa.id)
  await markConversationRead(filAwaFatou.id, awa.id, profilAwa.id)
  // Koffi a lu le groupe de l'atelier mais pas celui du cercle, ni le fil de
  // Yao : deux non-lues à son ouverture.
  await markConversationRead(groupeAtelier.id, koffi.id, null)

  // --- Le récapitulatif ---------------------------------------------------
  console.log('Comptes créés — mot de passe commun : ' + MOT_DE_PASSE + '\n')
  const table = [
    [awa.email, 'Awa Sarr', 'formatrice', 'Anime « Atelier Montage »'],
    [yao.email, 'Yao Kouadio', 'formateur', 'Anime « Cercle Finance »'],
    [koffi.email, "Koffi N'Da", 'membre', 'Des DEUX communautés — deux groupes'],
    [fatou.email, 'Fatou Diop', 'membre', 'Des deux, fil privé avec Awa'],
    [moussa.email, 'Moussa Traoré', 'membre', 'Atelier seulement'],
    [ines.email, 'Inès Kouassi', 'ancienne', 'Adhésion close — lit sans écrire'],
    [bintou.email, 'Bintou Camara', 'bannie', 'Bannie du salon — lit sans écrire'],
  ]
  for (const [email, nom, role, note] of table) {
    console.log(`  ${email.padEnd(32)} ${nom.padEnd(15)} ${role.padEnd(11)} ${note}`)
  }

  console.log(`
Ce qu'il y a à voir
  · /messagerie — deux groupes chez Koffi, un seul chez les autres
  · le groupe de son propre salon est épinglé chez la formatrice
  · une annonce dans « Atelier Montage » (le message de jeudi 18 h)
  · des non-lues : Awa en a une, Koffi en a deux
  · Inès et Bintou ouvrent le groupe, la zone de saisie leur est fermée
  · filtres « Toutes / Non lues / Groupes » et recherche dans le corps des messages

Pour tout effacer
  bun scripts/jeu-messagerie.ts --nettoyer
`)

  await db.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
