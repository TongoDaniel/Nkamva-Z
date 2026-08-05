// Démarre le serveur de production.
//
// La commande était `NODE_ENV=production bun .next/standalone/server.js`. Ce
// préfixe d'affectation est une syntaxe de shell POSIX : `cmd.exe` le lit comme
// un nom de programme et refuse de démarrer. On pose la variable ici, où les
// trois systèmes la comprennent.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const entry = '.next/standalone/server.js'
if (!existsSync(entry)) {
  console.error(`✗ ${entry} est introuvable — lancez d'abord « npm run build ».`)
  process.exit(1)
}

// `bun` s'il est là, `node` sinon : le serveur standalone tourne sous les deux,
// et tout le monde n'a pas bun installé.
const runtime = process.env.NKAMVA_RUNTIME ?? 'bun'

const child = spawn(runtime, [entry], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
  // Sur Windows, `bun`/`node` sont des `.cmd` que seul le shell sait résoudre.
  shell: process.platform === 'win32',
})

child.on('error', (error) => {
  console.error(`✗ Impossible de lancer « ${runtime} » : ${error.message}`)
  console.error('  Définissez NKAMVA_RUNTIME=node pour utiliser Node.')
  process.exit(1)
})
child.on('exit', (code) => process.exit(code ?? 0))
