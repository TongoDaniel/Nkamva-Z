import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Metadata } from 'next'
import { LegalPage } from '../legal-page'

export const metadata: Metadata = {
  title: 'Mentions légales — NkamVa',
  description: 'Éditeur, hébergeur et informations légales de la plateforme NkamVa.',
}

export default async function LegalNoticePage() {
  const content = await readFile(path.join(process.cwd(), 'src/content/legal/mentions.md'), 'utf-8')
  return <LegalPage title="Mentions légales" content={content} />
}
