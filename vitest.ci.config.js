import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * The tests a continuous-integration run can safely execute.
 *
 * WHY THERE ARE TWO CONFIGS. Most of this suite talks to the real Supabase
 * project, because that is the only way to prove RLS holds, that two orders
 * cannot oversell the last item, or that a Manager cannot reach an Admin
 * function. Those tests place real orders and consume real stock. Running them
 * on every push would put a hundred orders into a live shop and need a reset
 * afterwards, so CI runs the ones that need no database and the rest are run
 * deliberately before a release.
 *
 * THE LIST MAINTAINS ITSELF. A hand-written list of "safe" files is a list
 * somebody forgets to update, and the failure is silent — a new database test
 * quietly runs in CI and starts writing to the shop. So the split is derived
 * from the only thing that actually decides it: whether the file reaches for
 * the Supabase helpers. Add a test tomorrow and it lands on the correct side
 * without anybody choosing.
 *
 * Long term the better answer is a second Supabase project and `.env.test`, so
 * the whole suite runs in CI and nothing ever touches the live shop.
 * docs/OPERATIONS.md records that as the next step.
 */
const TEST_DIRS = ['tests', join('tests', 'ui')]

function databaseFreeTests() {
  const safe = []

  for (const dir of TEST_DIRS) {
    for (const entry of readdirSync(dir)) {
      if (!/\.test\.jsx?$/.test(entry)) continue

      const path = join(dir, entry)
      // The one signal that a file needs a live database. Every test that talks
      // to Supabase goes through these helpers; nothing constructs a client of
      // its own.
      if (!readFileSync(path, 'utf8').includes('helpers/supabase')) safe.push(path)
    }
  }

  return safe
}

export default defineConfig({
  test: {
    environment: 'node',
    include: databaseFreeTests(),
    // Deliberately NOT tests/setup.js: that one asserts the real Supabase
    // credentials are present and cancels orders afterwards, neither of which
    // makes sense for a run that never places one.
    setupFiles: ['tests/setup.ci.js'],
    testTimeout: 20000,
  },
})
