/**
 * Setup for the CI run — the tests that need no database.
 *
 * tests/setup.js cannot be used here: it asserts that the real Supabase
 * credentials are present, and registers an afterAll that cancels every order
 * the run placed. Neither makes sense for a run that never places one, and the
 * first would fail CI for the wrong reason.
 *
 * WHY ANY VALUES AT ALL. Some of these tests import a module that imports
 * src/supabaseClient.js, which calls createClient() at module load and throws
 * if the URL is missing. tests/contracts.test.js reaches it that way, through
 * src/api/orders.js, just to read the ORDER_ERRORS map.
 *
 * So a placeholder is supplied. It is a stand-in, not a credential: the host
 * does not exist, the key is not a key, and nothing in this run makes a
 * request. That is the point — CI needs no secrets, which means no secret can
 * leak from it.
 */
process.env.VITE_SUPABASE_URL ||= 'https://placeholder.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY ||= 'placeholder-anon-key-not-a-credential'
