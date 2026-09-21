import type { Metadata } from 'next'
import { TrainerScreen } from '@/components/screens/trainer-screen'
import { getPublicTrainer } from '@/lib/trainers'

// Rendu à la demande : la liste des formateurs publics change à chaque
// approbation et à chaque publication.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ trainerId: string }>
}): Promise<Metadata> {
  const { trainerId } = await params
  const trainer = await getPublicTrainer(trainerId)
  if (!trainer) return { title: 'Formateur introuvable' }

  const name = trainer.fullName ?? 'Formateur NKAMVA'
  return {
    title: name,
    description: trainer.slogan ?? trainer.description ?? `Les ressources de ${name} sur NKAMVA.`,
  }
}

/** Fiche formateur côté visiteur — l'URL partageable et indexable. */
export default async function TrainerPage({ params }: { params: Promise<{ trainerId: string }> }) {
  const { trainerId } = await params
  return <TrainerScreen trainerId={trainerId} space="public" />
}
