// Les choix des filtres du catalogue (thèmes, formats, niveaux) et le nombre de
// ressources derrière chacun. Public, comme le catalogue : l'application mobile
// en tire sa feuille de filtres, sans proposer un choix qui mènerait au vide.
import { success } from '@/lib/api'
import { getCatalogFacets } from '@/lib/catalog'

export async function GET() {
  return success(await getCatalogFacets())
}
