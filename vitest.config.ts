import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    // Tous les fichiers de test partagent la même base et la vident par TRUNCATE :
    // en parallèle, un fichier efface les données d'un autre en plein test.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': new URL('./src/', import.meta.url).pathname,
    },
  },
})
