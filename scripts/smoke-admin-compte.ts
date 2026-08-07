/**
 * Vérification de `/admin/mon-compte`.
 *
 *   bun run dev                        # dans un autre terminal
 *   bun scripts/smoke-admin-compte.ts
 *
 * Ce que ce script surveille, c'est la contradiction qu'il vient de résoudre :
 * `twoFactorRequiredFor` déclare le second facteur obligatoire pour tout compte
 * ADMIN, et l'écran qui le portait leur était interdit. Un contrôle par
 * sous-rôle, donc — un écran ouvert au seul Super-admin ne boucherait le trou
 * qu'au tiers, et le compte Finances est celui qui approuve les retraits.
 *
 * L'enrôlement va jusqu'au bout, avec un vrai code TOTP calculé depuis le
 * secret rendu par la route : constater que le QR s'affiche ne prouverait pas
 * qu'activer fonctionne. Le compte est remis dans son état initial à la fin.
 */
import { encode } from 'next-auth/jwt'
import * as OTPAuth from 'otpauth'
import { db } from '../src/lib/db'

/** Mêmes paramètres que `src/lib/two-factor.ts` — SHA1, 6 chiffres, 30 s. */
function totpCode(base32: string): string {
  return new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32),
  }).generate()
}

const BASE = 'http://localhost:3000'
const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'
const mail = (key: string) => `tongodanielfo+${key}@gmail.com`

async function cookieFor(email: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, email: true, role: true, adminRole: true, sessionsValidAfter: true, trainerProfile: { select: { id: true } } },
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

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`✓ ${label}`)
  else {
    failures++
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** React coupe les textes interpolés par un commentaire vide. */
const readable = (page: string) => page.replaceAll('<!-- -->', '')

async function main() {
  // --- L'écran s'ouvre pour les trois sous-rôles -------------------------
  for (const [key, role] of [
    ['admin', 'SUPER_ADMIN'],
    ['finances', 'FINANCES'],
    ['moderation', 'MODERATION'],
  ] as const) {
    const res = await fetch(`${BASE}/admin/mon-compte`, {
      headers: { cookie: await cookieFor(mail(key)) },
      redirect: 'manual',
    })
    const body = readable(await res.text())
    check(
      `/admin/mon-compte s'ouvre pour ${role}`,
      res.status === 200 &&
        body.includes('Double authentification') &&
        body.includes('Mot de passe') &&
        !body.includes('Une erreur est survenue'),
      res.status === 307 || res.status === 302
        ? `redirigé vers ${res.headers.get('location')}`
        : `statut ${res.status}`,
    )
  }

  // --- Le cloisonnement n'est pas percé ----------------------------------
  // `/mon-compte` (sans préfixe admin) redirige vers `/profil`, que
  // `NON_ADMIN_PREFIXES` interdit aux admins : la nouvelle route ne doit pas
  // avoir rouvert cette porte-là.
  const leak = await fetch(`${BASE}/profil`, {
    headers: { cookie: await cookieFor(mail('admin')) },
    redirect: 'manual',
  })
  check(
    '/profil reste interdit aux administrateurs',
    leak.status === 307 && (leak.headers.get('location') ?? '').endsWith('/admin'),
    `statut ${leak.status}, cible ${leak.headers.get('location')}`,
  )

  // --- L'enrôlement aboutit vraiment -------------------------------------
  const finances = await db.user.findUniqueOrThrow({
    where: { email: mail('finances') },
    select: { id: true, twoFactorSecret: true, twoFactorEnabledAt: true },
  })
  const wasEnabled = Boolean(finances.twoFactorEnabledAt)
  const cookie = await cookieFor(mail('finances'))

  if (wasEnabled) {
    console.log('· Finances a déjà un second facteur : enrôlement non rejoué.')
  } else {
    const setup = await fetch(`${BASE}/api/me/2fa`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ action: 'setup' }),
    })
    const setupBody = (await setup.json()) as { data?: { secret?: string; qr?: string } }
    const secret = setupBody.data?.secret
    check(
      'POST /api/me/2fa setup — secret et QR rendus',
      setup.status === 200 && Boolean(secret) && Boolean(setupBody.data?.qr),
      `statut ${setup.status}`,
    )

    if (secret) {
      const enable = await fetch(`${BASE}/api/me/2fa`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ action: 'enable', code: totpCode(secret) }),
      })
      const enableBody = (await enable.json()) as { data?: { recoveryCodes?: string[] } }
      check(
        'POST /api/me/2fa enable — activation et dix codes de secours',
        enable.status === 200 && (enableBody.data?.recoveryCodes?.length ?? 0) === 10,
        `statut ${enable.status}`,
      )

      const status = await db.user.findUniqueOrThrow({
        where: { id: finances.id },
        select: { twoFactorEnabledAt: true },
      })
      check('la base porte bien le second facteur', Boolean(status.twoFactorEnabledAt))

      // Remise en l'état : ce compte de démo n'avait pas de second facteur.
      const disable = await fetch(`${BASE}/api/me/2fa`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ code: totpCode(secret) }),
      })
      check('désactivation — le compte de démo est remis en l’état', disable.status === 200)
    }
  }

  console.log(failures ? `\n${failures} contrôle(s) en échec.` : '\nÉcran de compte admin conforme.')
  if (failures) process.exitCode = 1
}

main().finally(() => db.$disconnect())
