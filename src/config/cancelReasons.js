/**
 * Why a customer called their order off.
 *
 * These mirror the check constraint on `orders.cancelled_reason` in
 * supabase/manager_insights.sql. A browser cannot read a Postgres constraint,
 * so the duplication is unavoidable — what is avoidable is it drifting
 * unnoticed, which is what tests/manager-insights.test.js is for: it sends each
 * of these to the real database and checks it is accepted, and sends one that
 * is not in this list and checks it is refused.
 *
 * A FIXED VOCABULARY RATHER THAN A TEXT BOX. Free text would produce thirty
 * spellings of "changed my mind" and nothing a Manager could group, which is
 * the entire reason the column exists. Five options is also about the most
 * anybody reads before picking whichever is nearest — hence "Another reason",
 * which is honest about being the shrug rather than pretending the list is
 * complete.
 */
/* Not exported. The named keys read well here, but nothing outside this file
   has a use for them — call sites want the list, not one member of it. */
const CANCEL_REASONS = {
  changedMind: 'changed_mind',
  orderedByMistake: 'ordered_by_mistake',
  wrongDetails: 'wrong_details',
  tooSlow: 'too_slow',
  other: 'other',
}

/** In the order they are offered. Commonest first, "other" last. */
export const ALL_CANCEL_REASONS = [
  CANCEL_REASONS.changedMind,
  CANCEL_REASONS.orderedByMistake,
  CANCEL_REASONS.wrongDetails,
  CANCEL_REASONS.tooSlow,
  CANCEL_REASONS.other,
]

/* There is deliberately no isCancelReason() helper. The radio group can only
   emit a value from the list above, and cancel_order() validates the word
   against its own check constraint before storing it — a third opinion in the
   browser would be one more place for the vocabulary to drift. */
