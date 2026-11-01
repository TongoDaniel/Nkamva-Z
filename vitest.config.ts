import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    // Les fichiers de test partagent la même base et la nettoient par TRUNCATE :
    // les exécuter en parallèle provoque des violations de FK inter-fichiers.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // `fileURLToPath` et non `.pathname` : ce dernier garde les espaces
      // encodés (`%20`) et le `/` de tête devant la lettre de lecteur Windows,
      // et l'alias ne résout plus rien dès que le chemin du dépôt en contient.
      '@': fileURLToPath(new URL('./src/', import.meta.url)),
    },
  },
})
