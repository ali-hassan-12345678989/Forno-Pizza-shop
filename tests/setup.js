import dotenv from 'dotenv'
import { afterAll } from 'vitest'
import { releasePlacedOrders } from './helpers/supabase.js'

dotenv.config()

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'TEST_USER_A_EMAIL',
  'TEST_USER_B_EMAIL',
  'TEST_USER_PASSWORD',
]

const missing = required.filter((key) => !process.env[key])

if (missing.length > 0) {
  throw new Error(
    `Missing env vars: ${missing.join(', ')}\nCopy .env.example to .env and fill it in.`,
  )
}

/**
 * Hand the stock back at the end of every test file.
 *
 * Orders now consume real ingredients, so a suite that placed a hundred of them
 * and walked away would drain the shop in two runs — and then every later run
 * would fail with out_of_stock for reasons that have nothing to do with the
 * code under test. Cancelling each order restores what it took, through the
 * real refund path.
 */
afterAll(releasePlacedOrders)
