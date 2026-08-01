import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Metadata } from 'next'
import { LegalPage } from '../legal-page'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — NkamVa',
  description: 'Comment NkamVa collecte, utilise et protège vos données personnelles.',
}

export default async function PrivacyPage() {
  const content = await readFile(path.join(process.cwd(), 'src/content/legal/confidentialite.md'), 'utf-8')
  return <LegalPage title="Politique de confidentialité" content={content} />
}
