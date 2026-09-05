// Recette de la bascule de l'historique (temps 2 de la messagerie unifiée).
//
//   bun scripts/smoke-bascule-historique.ts --semer      avant la migration
//   bun scripts/smoke-bascule-historique.ts --verifier   après la migration
//   bun scripts/smoke-bascule-historique.ts --nettoyer
//
// La migration est **irréversible** : des réponses aplaties ne se ré-imbriquent
// pas. On ne la lance donc pas à l'aveugle. Ce script sème un jeu qui couvre les
// cas qui se comportent différemment — annonce, discussion, réponse, billet
// retiré, billet épinglé, signalement — puis vérifie, après coup, que chacun a
// été traité comme la spécification le dit.
//
// Il écrit en SQL brut : au moment où on sème, le client Prisma décrit déjà le
// schéma **d'après** la migration, et ne connaît plus les colonnes qu'on veut
// remplir.
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'

config()

const db = new PrismaClient()
const MARQUE = 'bascule-temps2'

let echecs = 0
function verifier(intitule: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ok   ${intitule}`)
  else {
    echecs++
    console.log(`  ÉCHEC ${intitule}${detail ? `\n         ${detail}` : ''}`)
  }
}

async function sql<T = unknown>(query: string): Promise<T[]> {
  return db.$queryRawUnsafe<T[]>(query)
}

async function semer() {
  console.log(`\nSemis du jeu de bascule — ${MARQUE}\n`)

  // Tout en SQL : les colonnes visées disparaissent du client Prisma au moment
  // où la migration est appliquée, et ce script doit rester exécutable avant.
  await db.$executeRawUnsafe(`
    INSERT INTO users (id, email, role, "fullName", "createdAt", "updatedAt")
    VALUES
      ('${MARQUE}-trainer', '${MARQUE}-trainer@nkamva.test', 'TRAINER', 'Awa Sarr', now(), now()),
      ('${MARQUE}-m1', '${MARQUE}-m1@nkamva.test', 'LEARNER', 'Koffi N''Da', now(), now()),
      ('${MARQUE}-m2', '${MARQUE}-m2@nkamva.test', 'LEARNER', 'Fatou Ba', now(), now())
  `)
  await db.$executeRawUnsafe(`
    INSERT INTO trainer_profiles (id, "userId", "verifiedLegalName", "approvedAt", "createdAt", "updatedAt")
    VALUES ('${MARQUE}-tp', '${MARQUE}-trainer', 'Awa Sarr', now(), now(), now())
  `)
  await db.$executeRawUnsafe(`
    INSERT INTO communities (id, "trainerId", name, slug, "priceFcfa", "createdAt", "updatedAt")
    VALUES ('${MARQUE}-c', '${MARQUE}-tp', 'Communauté de bascule', '${MARQUE}', 5000, now(), now())
  `)
  await db.$executeRawUnsafe(`
    INSERT INTO community_subscriptions (id, "communityId", "learnerId", status, "periodStart", "periodEnd", "createdAt", "updatedAt")
    VALUES
      ('${MARQUE}-s1', '${MARQUE}-c', '${MARQUE}-m1', 'ACTIVE', now(), now() + interval '30 days', now(), now()),
      ('${MARQUE}-s2', '${MARQUE}-c', '${MARQUE}-m2', 'ACTIVE', now(), now() + interval '30 days', now(), now())
  `)

  // Cinq billets qui ne se traitent pas pareil.
  await db.$executeRawUnsafe(`
    INSERT INTO community_posts (id, "communityId", "authorId", kind, body, pinned, "repliesCount", "createdAt", "updatedAt", "deletedAt", "deletedById")
    VALUES
      ('${MARQUE}-p1', '${MARQUE}-c', '${MARQUE}-trainer', 'ANNOUNCEMENT', 'Séance jeudi à 18 h', true, 0, now() - interval '5 days', now(), null, null),
      ('${MARQUE}-p2', '${MARQUE}-c', '${MARQUE}-m1', 'DISCUSSION', 'Quelqu''un a le lien ?', false, 2, now() - interval '4 days', now(), null, null),
      ('${MARQUE}-p3', '${MARQUE}-c', '${MARQUE}-m2', 'DISCUSSION', 'Sujet épinglé par le formateur', true, 0, now() - interval '3 days', now(), null, null),
      ('${MARQUE}-p4', '${MARQUE}-c', '${MARQUE}-m1', 'DISCUSSION', 'Propos retiré par la modération', false, 0, now() - interval '2 days', now(), now(), '${MARQUE}-trainer'),
      ('${MARQUE}-p5', '${MARQUE}-c', '${MARQUE}-trainer', 'ANNOUNCEMENT', 'Annonce retirée', false, 0, now() - interval '1 days', now(), now(), '${MARQUE}-trainer')
  `)
  await db.$executeRawUnsafe(`
    INSERT INTO community_post_replies (id, "postId", "authorId", body, "createdAt", "deletedAt", "deletedById")
    VALUES
      ('${MARQUE}-r1', '${MARQUE}-p2', '${MARQUE}-trainer', 'Je vous l''envoie', now() - interval '4 days' + interval '1 hour', null, null),
      ('${MARQUE}-r2', '${MARQUE}-p2', '${MARQUE}-m2', 'Merci !', now() - interval '4 days' + interval '2 hours', null, null)
  `)

  // Deux signalements, un par surface, à réécrire vers les messages.
  await db.$executeRawUnsafe(`
    INSERT INTO reports (id, "reporterId", "targetType", "targetId", reason, status, "createdAt", "updatedAt")
    VALUES
      ('${MARQUE}-rep1', '${MARQUE}-m2', 'COMMUNITY_POST', '${MARQUE}-p4', 'HARASSMENT', 'OPEN', now(), now()),
      ('${MARQUE}-rep2', '${MARQUE}-m1', 'COMMUNITY_POST_REPLY', '${MARQUE}-r2', 'SPAM', 'OPEN', now(), now())
  `)

  console.log('  5 billets, 2 réponses, 2 signalements posés.')
  console.log('  Lancer maintenant : bun prisma migrate deploy\n')
}

async function verifierBascule() {
  console.log(`\nVérification de la bascule — ${MARQUE}\n`)

  const groupes = await sql<{ id: string }>(
    `select id from conversations where "communityId" = '${MARQUE}-c' and kind = 'GROUP'`,
  )
  console.log('1. Le groupe accueille tout')
  verifier('un groupe, et un seul', groupes.length === 1, `${groupes.length} groupe(s)`)
  if (groupes.length !== 1) return

  const messages = await sql<{
    id: string; body: string; announcement: boolean; senderId: string;
    deletedAt: Date | null; createdAt: Date;
  }>(
    `select id, body, announcement, "senderId", "deletedAt", "createdAt"
     from messages where "conversationId" = '${groupes[0].id}' order by "createdAt" asc`,
  )
  verifier('les sept billets et réponses sont devenus des messages',
    messages.length === 7, `${messages.length} message(s)`)

  console.log('\n2. Chaque forme est traitée comme annoncé')
  const annonce = messages.find((m) => m.body === 'Séance jeudi à 18 h')
  verifier("l'annonce est marquée comme telle", annonce?.announcement === true)
  const discussion = messages.find((m) => m.body === "Quelqu'un a le lien ?")
  verifier("une discussion ne l'est pas", discussion?.announcement === false)
  verifier("l'auteur du billet est conservé", discussion?.senderId === `${MARQUE}-m1`)

  console.log('\n3. Un retrait reste un retrait')
  const retire = messages.find((m) => m.body === 'Propos retiré par la modération')
  verifier('le billet retiré arrive retiré', retire?.deletedAt !== null && retire?.deletedAt !== undefined)

  console.log('\n4. Les réponses tombent à leur propre date, après leur billet')
  const ordre = messages.map((m) => m.body)
  const iPost = ordre.indexOf("Quelqu'un a le lien ?")
  const iR1 = ordre.indexOf('Je vous l’envoie') >= 0
    ? ordre.indexOf('Je vous l’envoie')
    : ordre.indexOf("Je vous l'envoie")
  const iR2 = ordre.indexOf('Merci !')
  verifier('la première réponse suit son billet', iPost >= 0 && iR1 > iPost, `ordre : ${ordre.join(' | ')}`)
  verifier('la seconde suit la première', iR2 > iR1)

  console.log('\n5. Les signalements pointent les nouveaux messages')
  const reps = await sql<{ id: string; targetType: string; targetId: string }>(
    `select id, "targetType", "targetId" from reports where id like '${MARQUE}-rep%' order by id`,
  )
  verifier('les deux sont devenus des signalements de message',
    reps.every((r) => r.targetType === 'MESSAGE'),
    reps.map((r) => `${r.id}=${r.targetType}`).join(', '))
  const idsMessages = new Set(messages.map((m) => m.id))
  verifier('et ils pointent un message qui existe',
    reps.every((r) => idsMessages.has(r.targetId)),
    reps.map((r) => r.targetId).join(', '))

  console.log('\n6. Les tables du forum sont vidées, pas supprimées')
  const restes = await sql<{ n: bigint }>(
    `select (select count(*) from community_posts) + (select count(*) from community_post_replies) as n`,
  )
  verifier('plus aucun billet ni réponse', Number(restes[0].n) === 0, `${restes[0].n} reste(s)`)

  const cols = await sql<{ column_name: string }>(
    `select column_name from information_schema.columns where table_name = 'communities' and column_name = 'broadcastEnabled'`,
  )
  verifier("l'interrupteur des annonces a disparu", cols.length === 0)

  console.log('\n7. La conversation porte la date du dernier message')
  const conv = await sql<{ lastMessageAt: Date | null }>(
    `select "lastMessageAt" from conversations where id = '${groupes[0].id}'`,
  )
  verifier('lastMessageAt est renseigné', conv[0].lastMessageAt !== null)
}

async function nettoyer() {
  for (const q of [
    `delete from reports where id like '${MARQUE}-%'`,
    `delete from messages where "conversationId" in (select id from conversations where "communityId" = '${MARQUE}-c')`,
    `delete from conversation_reads where "conversationId" in (select id from conversations where "communityId" = '${MARQUE}-c')`,
    `delete from conversations where "communityId" = '${MARQUE}-c'`,
    `delete from community_post_replies where "postId" like '${MARQUE}-%'`,
    `delete from community_posts where "communityId" = '${MARQUE}-c'`,
    `delete from community_subscriptions where "communityId" = '${MARQUE}-c'`,
    `delete from communities where id = '${MARQUE}-c'`,
    `delete from trainer_profiles where id = '${MARQUE}-tp'`,
    `delete from users where id like '${MARQUE}-%'`,
  ]) {
    await db.$executeRawUnsafe(q).catch(() => { /* table déjà vide ou absente */ })
  }
  console.log('Jeu de bascule retiré.')
}

async function main() {
  const mode = process.argv[2]
  if (mode === '--semer') await semer()
  else if (mode === '--verifier') await verifierBascule()
  else if (mode === '--nettoyer') await nettoyer()
  else {
    console.log('Usage : --semer | --verifier | --nettoyer')
    process.exit(2)
  }

  if (mode === '--verifier') console.log(echecs === 0 ? '\nTout passe.\n' : `\n${echecs} échec(s).\n`)
  await db.$disconnect()
  process.exit(echecs === 0 ? 0 : 1)
}

main().catch(async (err) => {
  console.error(err)
  await db.$disconnect()
  process.exit(1)
})
