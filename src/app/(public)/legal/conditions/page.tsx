import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Metadata } from 'next'
import { LegalPage } from '../legal-page'

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation — NkamVa",
  description: "Les conditions générales d'utilisation de la plateforme NkamVa.",
}

export default async function TermsPage() {
  const content = await readFile(path.join(process.cwd(), 'src/content/legal/conditions.md'), 'utf-8')
  return <LegalPage title="Conditions générales d'utilisation" content={content} />
}
