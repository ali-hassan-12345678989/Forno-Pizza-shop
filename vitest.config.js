import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    // These hit a real Supabase project over the network, and several assert on
    // a denial. Running them in parallel makes row counts race each other.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
