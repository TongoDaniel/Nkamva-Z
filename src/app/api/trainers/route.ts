// L'annuaire public des formateurs, affiné à la frappe. Même source que la page
// `/formateurs` du site (`listPublicTrainers`) : un formateur que l'annuaire
// cache n'apparaît pas ici non plus.
import { success } from '@/lib/api'
import { listPublicTrainers } from '@/lib/trainers'
import { SEARCH_MIN_LENGTH } from '@/lib/search-limits'

export async function GET(request: Request) {
  const raw = (new URL(request.url).searchParams.get('search') ?? '').trim()
  // Sous le seuil, le terme est ignoré, comme sur `/api/communities`.
  const search = raw.length >= SEARCH_MIN_LENGTH ? raw : undefined
  return success(await listPublicTrainers(search))
}
