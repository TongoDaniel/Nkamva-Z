// ==========================================================================
// Mots de passe déjà fuités (Have I Been Pwned, k-anonymat)
// ==========================================================================
// Aucun appel réseau : `fetch` est simulé. Ce qui compte ici, c'est que seul le
// préfixe de l'empreinte sorte, et qu'une panne du service n'empêche personne
// de s'inscrire.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { isBreachedPassword } from '@/lib/breached-password'

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase()

describe('Mots de passe déjà fuités', () => {
  beforeEach(() => { process.env.PASSWORD_BREACH_CHECK = 'on' })
  afterEach(() => {
    process.env.PASSWORD_BREACH_CHECK = 'off'
    vi.unstubAllGlobals()
  })

  it("n'envoie que les 5 premiers caractères de l'empreinte, et reconnaît un mot de passe publié", async () => {
    const digest = sha1('password1234')
    const fetchStub = vi.fn(async () => new Response(`0000000000000000000000000000000000A:0\n${digest.slice(5)}:2413\n`))
    vi.stubGlobal('fetch', fetchStub)

    expect(await isBreachedPassword('password1234')).toBe(true)
    const url = String((fetchStub.mock.calls[0] as unknown[])[0])
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`)
    expect(url).not.toContain(digest.slice(5))
  })

  it('laisse passer un mot de passe absent de la liste, et ignore les lignes de remplissage', async () => {
    const digest = sha1('Kz9#vT2q!mW7')
    // Ligne de remplissage portant le bon suffixe mais un compte nul.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`${digest.slice(5)}:0\n`)))
    expect(await isBreachedPassword('Kz9#vT2q!mW7')).toBe(false)
  })

  it("n'empêche personne de s'inscrire quand le service est injoignable", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    expect(await isBreachedPassword('password1234')).toBe(false)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    expect(await isBreachedPassword('password1234')).toBe(false)
  })

  it("n'appelle rien quand le contrôle est coupé", async () => {
    process.env.PASSWORD_BREACH_CHECK = 'off'
    const fetchStub = vi.fn()
    vi.stubGlobal('fetch', fetchStub)
    expect(await isBreachedPassword('password1234')).toBe(false)
    expect(fetchStub).not.toHaveBeenCalled()
  })
})
