// Réconcilie `Community.membersCount` avec les adhésions réelles.
//
// Le compteur est dénormalisé : il évite une jointure sur chaque carte, chaque
// fiche, chaque résultat de recherche. Il était tenu à coups de `increment: 1`
// depuis trois endroits, et il a dérivé — une base de développement affichait
// **3 membres d'un côté, 0 de l'autre** pour la même communauté.
//
// Les chemins d'écriture recomptent désormais au lieu d'incrémenter
// (`recountCommunityMembers`), donc la dérive ne peut plus naître. Reste à
// réparer les lignes déjà fausses : c'est ce que fait ce script, et il est à
// passer **une fois par environnement**. Le relancer ne coûte rien — il ne
// touche que ce qui diverge.
//
//   bun scripts/recompte-membres.ts            (montre ce qui diverge)
//   bun scripts/recompte-membres.ts --ecrire   (corrige)
import { config } from 'dotenv'
import { db } from '../src/lib/db'
import { OPEN_STATUSES } from '../src/lib/communities'

config()

const ECRIRE = process.argv.includes('--ecrire')

async function main() {
  const communities = await db.community.findMany({
    select: { id: true, name: true, slug: true, status: true, membersCount: true },
    orderBy: { createdAt: 'asc' },
  })

  if (communities.length === 0) {
    console.log('\nAucune communauté en base.\n')
    return
  }

  let divergentes = 0

  for (const community of communities) {
    // La seule définition de « membre » du produit : une adhésion dont la
    // période court encore. Un banni en fait partie — écarté de la parole, pas
    // de l'accès (arbitrage 40).
    const reel = await db.communitySubscription.count({
      where: { communityId: community.id, status: { in: [...OPEN_STATUSES] } },
    })
    if (reel === community.membersCount) continue

    divergentes++
    const ecart = reel - community.membersCount
    console.log(
      `  ${community.name} (${community.slug}${community.status !== 'active' ? `, ${community.status}` : ''}) : ` +
        `colonne ${community.membersCount}, réel ${reel} (${ecart > 0 ? '+' : ''}${ecart})`,
    )
    if (ECRIRE) {
      await db.community.update({ where: { id: community.id }, data: { membersCount: reel } })
    }
  }

  console.log(
    divergentes === 0
      ? `\n${communities.length} communauté(s), aucune divergence.\n`
      : ECRIRE
        ? `\n${divergentes} ligne(s) corrigée(s) sur ${communities.length}.\n`
        : `\n${divergentes} ligne(s) divergente(s) sur ${communities.length}. Relancer avec --ecrire pour corriger.\n`,
  )
  process.exitCode = divergentes > 0 && !ECRIRE ? 1 : 0
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
