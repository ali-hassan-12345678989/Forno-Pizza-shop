import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // .jsx files are the UI smoke tests in tests/ui/. They opt into jsdom with
    // a `@vitest-environment` docblock of their own rather than switching the
    // default, because the other 37 files are integration tests against a real
    // Supabase project and have no use for a DOM.
    include: ['tests/**/*.test.js', 'tests/**/*.test.jsx'],
    setupFiles: ['tests/setup.js'],
    // These hit a real Supabase project over the network, and several assert on
    // a denial. Running them in parallel makes row counts race each other.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
