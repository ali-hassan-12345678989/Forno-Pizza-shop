import dotenv from 'dotenv'

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
