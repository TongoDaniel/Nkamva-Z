// Assemble la sortie `standalone` de Next après le build.
//
// Next n'y recopie ni `.next/static` ni `public` : c'est documenté et à la
// charge du projet. Ces deux copies se faisaient en `cp -r`, qui n'existe pas
// sur Windows — `npm run build` s'arrêtait donc là, sans que rien n'indique
// que le serveur produit serait sans CSS ni images.
//
// `fs.cpSync` fait la même chose sur les trois systèmes, sans dépendance.

import { cpSync, existsSync } from 'node:fs'

const copies = [
  { from: '.next/static', to: '.next/standalone/.next/static' },
  { from: 'public', to: '.next/standalone/public' },
]

for (const { from, to } of copies) {
  if (!existsSync(from)) {
    console.error(`✗ ${from} est introuvable — le build Next a-t-il abouti ?`)
    process.exit(1)
  }
  cpSync(from, to, { recursive: true })
  console.log(`✓ ${from} → ${to}`)
}
