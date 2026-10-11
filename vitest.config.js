import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: [{ find: /^\.\/db$/, replacement: fileURLToPath(new URL('./src/db/testDatabase.js', import.meta.url)) }],
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.js'],
  },
})
