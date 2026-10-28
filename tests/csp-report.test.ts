// ==========================================================================
// Rapports de violation CSP — /api/csp-report
// ==========================================================================
// La route est publique (le navigateur poste sans session) : elle ne doit rien
// écrire en base, borner ce qu'elle lit, et lire les deux formats de rapport.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { POST } from '@/app/api/csp-report/route'
import { clearRateLimit } from '@/lib/rate-limit'

const IP = '203.0.113.7'

function post(body: string, ip = IP) {
  return POST(new Request('http://localhost/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report', 'x-forwarded-for': ip },
    body,
  }))
}

describe('/api/csp-report', () => {
  afterEach(() => {
    clearRateLimit(IP, 'csp-report')
    vi.restoreAllMocks()
  })

  it('lit l\'ancien format report-uri et journalise une ligne', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await post(JSON.stringify({
      'csp-report': {
        'document-uri': 'https://staging.nkamva.com/ressources',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.example/x.js',
      },
    }))
    expect(res.status).toBe(204)
    expect(warn).toHaveBeenCalledWith(
      '[csp] script-src-elem a bloqué https://evil.example/x.js sur https://staging.nkamva.com/ressources',
    )
  })

  it('lit le format de l\'API Reporting', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await post(JSON.stringify([
      { type: 'csp-violation', body: { documentURL: 'https://a/p', effectiveDirective: 'img-src', blockedURL: 'http://b/i.png' } },
    ]))
    expect(res.status).toBe(204)
    expect(warn).toHaveBeenCalledWith('[csp] img-src a bloqué http://b/i.png sur https://a/p')
  })

  it('refuse un corps illisible ou trop gros, sans journaliser', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await post('pas du json')).status).toBe(400)
    expect((await post('x'.repeat(17 * 1024))).status).toBe(413)
    expect(warn).not.toHaveBeenCalled()
  })

  it('borne le débit par adresse', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const body = JSON.stringify({ 'csp-report': { 'effective-directive': 'img-src' } })
    for (let i = 0; i < 30; i++) expect((await post(body)).status).toBe(204)
    expect((await post(body)).status).toBe(429)
  })
})
