import { describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import { courseJsonLd, jsonLdScript } from '@/lib/structured-data'

/** Comme un robot : une règle ferme un chemin si elle en est le préfixe, `$` ancrant la fin. */
function blocked(path: string, rules: string[]): boolean {
  return rules.some((rule) => (rule.endsWith('$') ? path === rule.slice(0, -1) : path.startsWith(rule)))
}

describe('robots.txt', () => {
  const rules = robots().rules
  const disallow = (Array.isArray(rules) ? rules[0].disallow : rules.disallow) as string[]

  it('laisse ouvertes les pages publiques, annuaire des formateurs compris', () => {
    for (const path of ['/', '/ressources', '/ressources/un-cours', '/communautes/x', '/formateurs', '/formateurs/abc', '/devenir-formateur', '/tarifs']) {
      expect(blocked(path, disallow), path).toBe(false)
    }
  })

  it('ferme les espaces connectés, l’administration et l’API', () => {
    for (const path of ['/formateur', '/formateur/ressources', '/admin', '/api/me/profile', '/catalogue', '/mes-ressources', '/achat/x']) {
      expect(blocked(path, disallow), path).toBe(true)
    }
  })

  it('désigne le plan du site', () => {
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/)
  })
})

describe('données structurées', () => {
  it('n’invente ni note ni prix', () => {
    const data = courseJsonLd({ slug: 's', title: 'T', blurb: 'B', durationSeconds: 5400 })
    expect(data).not.toHaveProperty('aggregateRating')
    expect(data).not.toHaveProperty('offers')
    expect(data.timeRequired).toBe('PT1H30M')
  })

  it('un titre piégé ne referme pas la balise script', () => {
    const html = jsonLdScript(courseJsonLd({ slug: 's', title: '</script><script>alert(1)</script>', blurb: 'B' }))
    expect(html).not.toContain('</script>')
    expect(JSON.parse(html).name).toBe('</script><script>alert(1)</script>')
  })
})
