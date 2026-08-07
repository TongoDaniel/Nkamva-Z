/**
 * Vérification des factures, de l'écran au PDF.
 *
 *   bun run dev                        # dans un autre terminal
 *   bun scripts/smoke-factures.ts
 *
 * `issueInvoiceQuietly()` numérote des factures depuis le Lot 0 et
 * `renderInvoicePdf()` sait les rendre : aucun écran n'y menait. Des pièces
 * comptables étaient donc émises, sans trou dans la suite, pour personne.
 *
 * Ce script contrôle les jointures — l'écran, le lien, l'octet, et la porte :
 *
 *   1. `/mes-factures` liste les factures du compte, avec leur numéro ;
 *   2. le lien PDF rend un **vrai** PDF, nommé, en pièce jointe ;
 *   3. `/mes-achats` propose la facture de l'achat sur sa ligne ;
 *   4. la facture d'autrui rend 404 — et non 403, qui confirmerait qu'elle existe.
 *
 * Aucune écriture : tout est en lecture.
 */
import { encode } from 'next-auth/jwt'
import { db } from '../src/lib/db'

const BASE = 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}`)
  else {
    failures++
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function cookieForUser(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
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

const readable = (page: string) =>
  page.replaceAll('<!-- -->', '').replaceAll('&#x27;', "'").replaceAll('&amp;', '&')

async function main() {
  const invoice = await db.invoice.findFirst({
    orderBy: { issuedAt: 'desc' },
    select: { id: true, number: true, userId: true, label: true, amountFcfa: true, purchaseId: true },
  })
  if (!invoice) {
    console.log('Aucune facture en base — lancer le seed, ou un achat. Contrôle impossible.')
    process.exitCode = 1
    return
  }
  const owner = await cookieForUser(invoice.userId)
  const count = await db.invoice.count({ where: { userId: invoice.userId } })
  console.log(`Facture ${invoice.number} — ${count} facture(s) sur ce compte\n`)

  // ---- 1. L'écran liste ------------------------------------------------
  const page = readable(
    await (await fetch(`${BASE}/mes-factures`, { headers: { cookie: owner } })).text(),
  )
  check(
    '/mes-factures rend sans page d’erreur',
    !page.includes('Une erreur est survenue') && !page.includes('Aucune facture'),
  )
  check(`la facture ${invoice.number} y figure`, page.includes(invoice.number))
  check("l'objet de la facture y figure", page.includes(invoice.label.slice(0, 30)))
  check(
    'le lien de téléchargement pointe la bonne route',
    page.includes(`/api/me/invoices/${invoice.id}?pdf=1`),
  )

  // ---- 2. Le PDF est un PDF -------------------------------------------
  const pdf = await fetch(`${BASE}/api/me/invoices/${invoice.id}?pdf=1`, {
    headers: { cookie: owner },
  })
  const bytes = new Uint8Array(await pdf.arrayBuffer())
  check(
    'le téléchargement répond 200 en application/pdf',
    pdf.status === 200 && (pdf.headers.get('content-type') ?? '').includes('application/pdf'),
    `reçu ${pdf.status} ${pdf.headers.get('content-type')}`,
  )
  // La signature du format, pas seulement l'en-tête : un serveur peut annoncer
  // `application/pdf` et renvoyer une page d'erreur HTML.
  check(
    'les octets commencent bien par %PDF',
    new TextDecoder().decode(bytes.slice(0, 4)) === '%PDF',
    `premiers octets : ${new TextDecoder().decode(bytes.slice(0, 16))}`,
  )
  check(
    'la pièce est nommée par son numéro et servie en pièce jointe',
    (pdf.headers.get('content-disposition') ?? '').includes(`facture-${invoice.number}.pdf`),
    pdf.headers.get('content-disposition') ?? '(aucun en-tête)',
  )
  check('le PDF n’est pas vide', bytes.byteLength > 800, `${bytes.byteLength} octets`)

  // Deux rendus donnent la même pièce : c'est ce qui justifie de ne pas la
  // stocker. Le contrôle vaut la promesse écrite dans `renderInvoicePdf`.
  const again = new Uint8Array(
    await (
      await fetch(`${BASE}/api/me/invoices/${invoice.id}?pdf=1`, { headers: { cookie: owner } })
    ).arrayBuffer(),
  )
  check(
    'deux rendus donnent une pièce de taille identique',
    again.byteLength === bytes.byteLength,
    `${bytes.byteLength} puis ${again.byteLength} octets`,
  )

  // ---- 3. La ligne d'achat propose sa facture -------------------------
  if (invoice.purchaseId) {
    const achats = readable(
      await (await fetch(`${BASE}/mes-achats`, { headers: { cookie: owner } })).text(),
    )
    check(
      '/mes-achats propose le PDF sur la ligne de l’achat',
      achats.includes(`/api/me/invoices/${invoice.id}?pdf=1`),
      "l'achat facturé n'affiche pas son lien (première page seulement)",
    )
    check('/mes-achats mène à l’écran des factures', achats.includes('/mes-factures'))
  }

  // ---- 4. La porte -----------------------------------------------------
  const other = await db.user.findFirst({
    where: { id: { not: invoice.userId }, role: 'LEARNER' },
    select: { id: true },
  })
  if (other) {
    const stolen = await fetch(`${BASE}/api/me/invoices/${invoice.id}?pdf=1`, {
      headers: { cookie: await cookieForUser(other.id) },
    })
    check(
      'la facture d’un autre compte rend 404, pas 403',
      stolen.status === 404,
      `reçu ${stolen.status} : un 403 confirmerait que la facture existe`,
    )
  }

  const anonymous = await fetch(`${BASE}/api/me/invoices/${invoice.id}?pdf=1`, {
    redirect: 'manual',
  })
  check('un visiteur non connecté est refusé en 401', anonymous.status === 401, `reçu ${anonymous.status}`)

  const screenAnonymous = await fetch(`${BASE}/mes-factures`, { redirect: 'manual' })
  check(
    "l'écran des factures n'est pas accessible sans session",
    screenAnonymous.status === 307 || screenAnonymous.status === 302,
    `reçu ${screenAnonymous.status}`,
  )

  console.log(failures ? `\n${failures} contrôle(s) en échec.` : '\nChaîne des factures complète.')
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
