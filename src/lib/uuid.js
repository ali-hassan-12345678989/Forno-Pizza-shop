/**
 * What a Postgres uuid looks like.
 *
 * Used wherever an identifier arrives from outside the app — a pasted tracking
 * link, a route parameter, a stale bookmark. Checking the shape first is not
 * validation for its own sake: `select ... where id = 'not-a-uuid'` raises a
 * cast error, which surfaces as a generic failure with a retry button that can
 * never succeed. Knowing the id is malformed lets the screen say so instead.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value) {
  return UUID.test(String(value ?? ''))
}
