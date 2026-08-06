import type { Metadata } from 'next'
import { TrainerScreen } from '@/components/screens/trainer-screen'
import { getPublicTrainer } from '@/lib/trainers'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ trainerId: string }>
}): Promise<Metadata> {
  const { trainerId } = await params
  const trainer = await getPublicTrainer(trainerId)
  if (!trainer) return { title: 'Formateur introuvable' }

  const name = trainer.fullName ?? 'Formateur NkamVa'
  return {
    title: name,
    description: trainer.slogan ?? trainer.description ?? `Les ressources de ${name} sur NkamVa.`,
    robots: { index: false },
  }
}

/** Fiche formateur côté connecté. Jumeau visiteur : `/formateurs/…`. */
export default async function FormateurConnectePage({
  params,
}: {
  params: Promise<{ trainerId: string }>
}) {
  const { trainerId } = await params
  return <TrainerScreen trainerId={trainerId} space="app" />
}
