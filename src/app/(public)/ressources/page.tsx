import type { Metadata } from 'next'
import { PageHead } from '@/components/nk/page-head'
import { CatalogBrowser } from './catalog-browser'

export const metadata: Metadata = {
  title: 'Le catalogue — NkamVa',
  description:
    'Cours vidéo, guides et modèles créés par des formateurs africains. Payez à l’unité, en FCFA.',
}

export default function CatalogPage() {
  return (
    <div className="wrap">
      <PageHead
        crumbs={[{ label: 'Accueil', href: '/' }, { label: 'Ressources' }]}
        title="Le catalogue"
        lead="Cours vidéo, guides et modèles créés par des formateurs africains. Payez à l'unité, en FCFA — la ressource reste à vous, à vie."
      />
      <CatalogBrowser />
    </div>
  )
}
