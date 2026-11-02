// La fiche publique d'un formateur : présentation, ressources, communauté.
// Même source et mêmes règles de visibilité que la page `/formateurs/[id]`.
import { success, error } from '@/lib/api'
import { getPublicTrainer } from '@/lib/trainers'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trainer = await getPublicTrainer(id)
  // Un profil suspendu ne se distingue pas d'un identifiant inconnu.
  if (!trainer) return error('NOT_FOUND', 'Formateur introuvable.', 404)
  // L'identifiant du compte ne sert qu'au signalement sur le site.
  const { userId: _userId, ...publicTrainer } = trainer
  return success(publicTrainer)
}
