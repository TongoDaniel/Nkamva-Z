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
      '@': new URL('./src/', import.meta.url).pathname,
    },
  },
})
