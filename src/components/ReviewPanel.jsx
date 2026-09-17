import { useCallback, useEffect, useState } from 'react'
import Stars from './Stars'
import { COPY } from '../content/copy'
import { ORDER_STATUS } from '../config/orderStatus'
import { COMMENT_ROWS, MAX_COMMENT_LENGTH } from '../config/reviews'
import { fetchOrderReviews, submitReview } from '../api/reviews'
import './ReviewPanel.css'

const CAN_REVIEW = [ORDER_STATUS.delivered, ORDER_STATUS.pickedUp]

/**
 * FR-4.1 and FR-4.2: rating the order as a whole, and each dish on it.
 *
 * It lives on the tracking page rather than anywhere else because that page is
 * already the one place a customer returns to with proof the order is theirs —
 * the token in the URL. Nothing else has to be built to decide who is allowed
 * to review what; the same credential that shows them the order lets them rate
 * it, and submit_review() checks it server-side regardless.
 *
 * Only appears once the food has actually arrived.
 */
export default function ReviewPanel({ order, token }) {
  const t = COPY.reviews
  const [existing, setExisting] = useState(null)

  const reviewable = CAN_REVIEW.includes(order.status)

  const load = useCallback(async () => {
    try {
      setExisting(await fetchOrderReviews(token))
    } catch {
      // A review panel that will not load is not worth an error screen over an
      // order the customer can otherwise read perfectly well.
      setExisting([])
    }
  }, [token])

  useEffect(() => {
    if (reviewable) load()
  }, [reviewable, load])

  if (!reviewable || existing === null) return null

  // One row per dish, deduplicated: two Larges and a Medium of the same pizza
  // are one thing to have an opinion about.
  const dishes = []
  for (const item of order.items) {
    if (!dishes.some((d) => d.menuItemId === item.menuItemId)) {
      dishes.push({ menuItemId: item.menuItemId, name: item.name })
    }
  }

  const reviewFor = (menuItemId) => existing.find((r) => r.menuItemId === menuItemId) ?? null

  return (
    <section className="panel reviewpanel" aria-label={t.heading}>
      <h2>{t.heading}</h2>
      <p className="panel-sub">{t.sub}</p>

      <ReviewRow
        token={token}
        menuItemId={null}
        label={t.experienceLabel}
        hint={t.experienceHint}
        existing={reviewFor(null)}
        onPosted={load}
      />

      {dishes.map((dish) => (
        <ReviewRow
          key={dish.menuItemId}
          token={token}
          menuItemId={dish.menuItemId}
          label={dish.name}
          hint={t.itemHint}
          existing={reviewFor(dish.menuItemId)}
          onPosted={load}
        />
      ))}
    </section>
  )
}

function ReviewRow({ token, menuItemId, label, hint, existing, onPosted }) {
  const t = COPY.reviews
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Already said their piece. Show it rather than inviting a duplicate the
  // database would refuse.
  if (existing) {
    return (
      <div className="reviewrow is-done">
        <div className="reviewrow-head">
          <strong>{label}</strong>
          <Stars value={existing.rating} count={1} />
        </div>
        {existing.comment && <p className="reviewrow-said">{existing.comment}</p>}
        <span className="reviewrow-note">{t.yours}</span>
      </div>
    )
  }

  async function post() {
    setBusy(true)
    setError(null)
    try {
      await submitReview(token, menuItemId, rating, comment)
      await onPosted()
    } catch (thrown) {
      setError(t.errors[thrown.code] ?? t.errors.unknown)
      setBusy(false)
    }
  }

  return (
    <div className="reviewrow">
      <div className="reviewrow-head">
        <strong>{label}</strong>
        <span className="reviewrow-hint">{hint}</span>
      </div>

      <Stars value={rating} onChange={setRating} name={`rating-${menuItemId ?? 'experience'}`} />

      {/* The comment box only appears once they have picked a rating. Showing a
          textarea first asks for the harder thing before the easy one, and most
          people leave a rating and no words. */}
      {rating > 0 && (
        <>
          <label className="sr-only" htmlFor={`comment-${menuItemId ?? 'experience'}`}>
            {t.commentLabel}
          </label>
          <textarea
            id={`comment-${menuItemId ?? 'experience'}`}
            className="reviewrow-comment"
            rows={COMMENT_ROWS}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder={t.commentPlaceholder}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          {error && (
            <p className="reviewrow-error" role="alert">
              {error}
            </p>
          )}

          <button type="button" className="btn-solid reviewrow-post" onClick={post} disabled={busy}>
            {busy ? t.submitting : t.submit}
          </button>
        </>
      )}
    </div>
  )
}
