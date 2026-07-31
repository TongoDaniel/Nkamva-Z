import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    // Chaque fichier de test truncate les mêmes tables Postgres (cleanDatabase
    // dans tests/setup.ts) : exécuter les fichiers en parallèle provoque des
    // violations de FK entre fichiers. Un seul worker, fichiers séquentiels.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': new URL('./src/', import.meta.url).pathname,
    },
  },
})
