// ==========================================================================
// Octets de contrôle dans l'URL
// ==========================================================================
// PostgreSQL refuse l'octet nul dans un texte : un slug qui en porte un faisait
// lever Prisma avant le `try` de la route, d'où un 500 vide (rapport de test
// d'intrusion, § 3.7). Le middleware les refuse désormais en 400, à l'entrée.

import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { hasForbiddenUrlBytes, middleware } from '@/middleware'

describe("Octets de contrôle dans l'URL", () => {
  it("repère l'octet nul dans le chemin et dans la requête", () => {
    expect(hasForbiddenUrlBytes('/api/communities/eveil%00/adhesion', '')).toBe(true)
    expect(hasForbiddenUrlBytes('/recherche', '?q=a%00b')).toBe(true)
    expect(hasForbiddenUrlBytes('/communautes/x%0A', '')).toBe(true)
  })

  it('laisse passer les URL ordinaires, accents et espaces encodés compris', () => {
    expect(hasForbiddenUrlBytes('/communautes/eveil-de-conscience', '')).toBe(false)
    expect(hasForbiddenUrlBytes('/recherche', '?q=%C3%A9veil%20de%20conscience')).toBe(false)
    expect(hasForbiddenUrlBytes('/api/communities', '?page=2')).toBe(false)
  })

  it("répond 400 en JSON sur l'API, sans atteindre la route", async () => {
    const res = await middleware(new NextRequest('https://staging.nkamva.com/api/communities/eveil%00/adhesion', { method: 'POST' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('BAD_REQUEST')
  })

  it('ne touche pas aux pages publiques hors du périmètre des gardes', async () => {
    const res = await middleware(new NextRequest('https://staging.nkamva.com/communautes/eveil-de-conscience'))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })
})
