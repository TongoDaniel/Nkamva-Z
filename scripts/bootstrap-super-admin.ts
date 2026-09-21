/**
 * Amorçage : crée le tout premier super-administrateur.
 *
 *   bun scripts/bootstrap-super-admin.ts "prenom.nom@exemple.com" "Prénom Nom"
 *
 * ── Pourquoi un script, et pas un UPDATE en base ────────────────────────────
 *
 * Il y a un œuf et une poule : seul un `SUPER_ADMIN` peut créer un
 * administrateur (`/admin/administrateurs`, réservé à ce sous-rôle), et
 * `changeAdminRole` refuse d'entrer dans `SUPER_ADMIN` comme d'en sortir. Le
 * premier ne peut donc naître d'aucun geste ordinaire.
 *
 * Un `UPDATE` manuel sur la base de production ferait le travail, mais sans
 * trace au journal d'audit, sans envoi du courriel d'activation, et avec une
 * faute de frappe possible sur le rôle. Ce script fait les trois correctement.
 *
 * ── Usage unique, garanti par le script lui-même ────────────────────────────
 *
 * Il refuse de s'exécuter s'il existe déjà un super-administrateur. Le rejouer
 * par mégarde ne crée donc pas de seconde porte d'entrée : une fois le premier
 * compte né, ce fichier est inerte. C'est ce qui permet de le laisser dans le
 * dépôt sans en faire une faiblesse permanente.
 *
 * ── Le compte naît sans mot de passe ────────────────────────────────────────
 *
 * Exactement comme ceux créés depuis l'interface : la personne le choisit
 * elle-même via « Mot de passe oublié ». Le script n'écrit jamais de mot de
 * passe, et n'en affiche donc aucun qui traînerait dans un historique de shell.
 */
import { db } from '../src/lib/db'
import { auditStandalone } from '../src/lib/audit'
import { sendEmail, renderSimpleEmail } from '../src/lib/email'
import { absoluteUrl } from '../src/lib/notification'

function echouer(message: string): never {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

async function main() {
  const [emailBrut, ...resteDuNom] = process.argv.slice(2)
  const email = (emailBrut ?? '').trim().toLowerCase()
  const fullName = resteDuNom.join(' ').trim()

  if (!email || !fullName) {
    echouer('usage : bun scripts/bootstrap-super-admin.ts "<email>" "<Nom Complet>"')
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    echouer(`« ${email} » n'est pas une adresse e-mail valide.`)
  }
  if (fullName.length < 2) echouer('Le nom complet est trop court.')

  // La garantie d'usage unique. Volontairement large : n'importe quel
  // super-administrateur, même désactivé, ferme cette porte. Un compte
  // désactivé se réactive par les voies normales — il n'a pas besoin de
  // celle-ci, et la rouvrir serait précisément le trou à ne pas laisser.
  const existant = await db.user.findFirst({
    where: { role: 'ADMIN', adminRole: 'SUPER_ADMIN' },
    select: { email: true, createdAt: true },
  })
  if (existant) {
    echouer(
      `Un super-administrateur existe déjà (${existant.email}, depuis le ` +
        `${existant.createdAt.toISOString().slice(0, 10)}).\n` +
        "  Les administrateurs suivants se créent depuis /admin/administrateurs.",
    )
  }

  // Même refus que `createAdmin` : on ne promeut jamais un compte existant en
  // administrateur. La frontière ne se franchit dans aucun sens.
  const adresseConnue = await db.user.findUnique({ where: { email }, select: { role: true } })
  if (adresseConnue) {
    echouer(
      `L'adresse ${email} est déjà utilisée par un compte ${adresseConnue.role}.\n` +
        "  Un administrateur ne se crée jamais à partir d'un compte existant :\n" +
        '  utilisez une adresse dédiée à ce rôle.',
    )
  }

  const user = await db.user.create({
    data: {
      email,
      fullName,
      role: 'ADMIN',
      adminRole: 'SUPER_ADMIN',
      passwordHash: null,
    },
    select: { id: true, email: true, fullName: true },
  })

  await auditStandalone({
    actorId: user.id,
    actorRole: 'SUPER_ADMIN',
    action: 'ADMIN_ACCOUNT_CREATED',
    targetType: 'User',
    targetId: user.id,
    // `bootstrap` distingue cette création de toutes les suivantes : c'est la
    // seule qui n'a pas d'auteur humain, et le journal doit pouvoir le dire.
    meta: { email, adminRole: 'SUPER_ADMIN', bootstrap: true },
  })

  const { html, text } = renderSimpleEmail({
    title: 'Votre accès super-administrateur',
    paragraphs: [
      'Bonjour,',
      'Le compte super-administrateur de NKAMVA vous a été ouvert.',
      'Pour l’activer, choisissez votre mot de passe depuis « Mot de passe oublié », avec cette adresse e-mail.',
    ],
    cta: { label: 'Choisir mon mot de passe', url: absoluteUrl('/auth/mot-de-passe-oublie') },
    footnote: 'Le compte reste inactif tant qu’aucun mot de passe n’est défini.',
  })
  await sendEmail({
    to: email,
    subject: 'NKAMVA — votre accès super-administrateur',
    html, text,
    tags: ['admin-invitation'],
  })

  console.log(`
✓ Super-administrateur créé.

  ${user.fullName} <${user.email}>

  Le compte n'a pas de mot de passe : un e-mail vient d'être envoyé pour en
  choisir un. Sans clé Resend configurée, cet envoi n'est que journalisé —
  passez alors directement par /auth/mot-de-passe-oublie.

  Ce script est désormais inerte : il refusera de s'exécuter à nouveau.
`)
}

main()
  .catch((err) => {
    console.error('\n✗ Échec de l’amorçage :', err instanceof Error ? err.message : err, '\n')
    process.exit(1)
  })
  .finally(() => db.$disconnect())
