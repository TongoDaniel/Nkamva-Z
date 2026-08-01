import type { Metadata } from 'next'
import { PageHead } from '@/components/nk/page-head'
import { DemoNotice } from '@/components/nk/demo-notice'
import { TrainerDirectory } from './trainer-directory'

export const metadata: Metadata = {
  title: 'Les formateurs — NkamVa',
  description: 'Découvrez les formateurs vérifiés qui publient sur NkamVa.',
}

export default function TrainersPage() {
  return (
    <div className="wrap">
      <PageHead
        crumbs={[{ label: 'Accueil', href: '/' }, { label: 'Formateurs' }]}
        title="Les formateurs"
        lead="Chaque formateur est vérifié avant de pouvoir publier : pièce d'identité, diplôme et présentation vidéo sont contrôlés."
      />
      <DemoNotice className="mt-4" />
      <TrainerDirectory />
    </div>
  )
}
