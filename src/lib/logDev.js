/**
 * Developer-only logging.
 *
 * The two places that used console.error passed the raw Supabase error object
 * straight to the browser console, which put PostgREST messages, Postgres error
 * codes and internal function names in front of any customer who opened
 * developer tools. Menu.jsx even carried a comment about not leaking the schema
 * to the customer, directly above the line that leaked it to the console.
 *
 * `import.meta.env.DEV` is a literal Vite replaces at build time, so in the
 * production bundle this collapses to `if (false)` and the call — along with
 * the message and everything it would have printed — is removed entirely.
 * Nothing is lost while developing, and nothing ships.
 */
export function logDev(...args) {
  if (import.meta.env.DEV) console.error(...args)
}
