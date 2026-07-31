import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    // Les suites adossées à la base partagent la même instance et la vident
    // par TRUNCATE CASCADE entre chaque test : exécutées en parallèle, elles
    // s'effacent mutuellement. Un fichier à la fois.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': new URL('./src/', import.meta.url).pathname,
    },
  },
})
