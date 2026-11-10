import { defineConfig, configDefaults } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: [{ find: 'npm:zod@^4.3.6', replacement: 'zod' }, { find: /^\.\/db$/, replacement: fileURLToPath(new URL('./src/db/testDatabase.js', import.meta.url)) }],
  },
  test: {
    exclude: [...configDefaults.exclude, '.test-tmp/**'],
    environment: 'node',
    setupFiles: ['./src/test/setup.js'],
  },
})
