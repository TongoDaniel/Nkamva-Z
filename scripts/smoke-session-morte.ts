/**
 * Éprouve le cas qui produisait une boucle de redirection : un cookie de session
 * que le middleware juge bon, mais dont l'utilisateur n'existe plus en base.
 *
 *   bun scripts/smoke-session-morte.ts [http://localhost:3000]
 *
 * Il n'écrit rien en base — le cookie est forgé pour un identifiant volontairement
 * absent, ce qui rejoue exactement ce que voit un compte supprimé ou suspendu :
 * `session()` relit l'utilisateur au-delà de cinq minutes de jeton et rend une
 * session vide, alors que le middleware, lui, n'a que le JWT.
 *
 * Attendu : la chaîne de redirections se termine sur la page de connexion, le
 * cookie mort est effacé en route, et l'API répond 401.
 */
import { encode } from 'next-auth/jwt'

const SECRET = process.env.NEXTAUTH_SECRET || 'nkamva-dev-secret-change-in-production'
const BASE = process.argv[2] ?? 'http://localhost:3000'
const MAX_HOPS = 12

async function main() {
  const cookie = `next-auth.session-token=${await encode({
    token: {
      // Identifiant absent de la base : `findUnique` rendra `null`, comme pour
      // un compte supprimé entre-temps.
      userId: 'utilisateur-supprime-000000',
      sub: 'utilisateur-supprime-000000',
      email: 'fantome@nkamva.test',
      role: 'LEARNER',
      adminRole: null,
      trainerId: null,
      // Antérieure au jeton : ce n'est PAS une révocation ciblée, sinon le
      // middleware refuserait de lui-même et le scénario ne se jouerait pas.
      sessionsValidAfter: new Date(Date.now() - 86_400_000).toISOString(),
      // Plus de 300 s : c'est ce qui déclenche la relecture en base.
      issuedAt: Math.floor(Date.now() / 1000) - 600,
    },
    secret: SECRET,
  })}`

  // Bac à cookies minimal. Sans lui, le script réenverrait le cookie effacé à
  // chaque saut et verrait une boucle là où un navigateur n'en voit pas : le
  // scénario testé porte précisément sur l'effacement d'un cookie.
  const jar = new Map<string, string>()
  for (const pair of cookie.split('; ')) {
    const [name, ...rest] = pair.split('=')
    jar.set(name, rest.join('='))
  }
  const header = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')

  function applySetCookie(res: Response) {
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split('; ')
      const [name, ...rest] = pair.split('=')
      const value = rest.join('=')
      const expired =
        /^max-age=0$/i.test(attrs.find(a => /^max-age=/i.test(a)) ?? '') || value === ''
      if (expired) jar.delete(name)
      else jar.set(name, value)
    }
  }

  let url = `${BASE}/accueil`
  const chain: string[] = []
  let cleared = false

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const res = await fetch(url, { headers: { cookie: header() }, redirect: 'manual' })
    const location = res.headers.get('location')
    chain.push(`${res.status} ${url.replace(BASE, '')}${location ? ` → ${location.replace(BASE, '')}` : ''}`)

    applySetCookie(res)
    if (!jar.has('next-auth.session-token')) cleared = true

    if (!location) break
    url = new URL(location, BASE).toString()
  }

  const api = await fetch(`${BASE}/api/lives`, { headers: { cookie } })

  const boucle = chain.length >= MAX_HOPS
  console.log(chain.map((l, i) => `  ${i + 1}. ${l}`).join('\n'))
  console.log('')
  console.log(`boucle de redirection ....... ${boucle ? 'OUI — le correctif ne tient pas' : 'non'}`)
  console.log(`cookie mort effacé .......... ${cleared ? 'oui' : 'NON — le middleware rebouclera'}`)
  console.log(`arrivée ..................... ${url.replace(BASE, '')}`)
  console.log(`API protégée (/api/lives) ... ${api.status} ${api.status === 401 ? '(session bien morte côté base)' : ''}`)

  process.exit(boucle || !cleared ? 1 : 0)
}

main()
