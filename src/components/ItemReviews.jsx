import { useEffect, useState } from 'react'
import Stars from './Stars'
import { COPY } from '../content/copy'
import { fetchItemReviews } from '../api/reviews'
import { formatDateTime } from '../lib/format'
import './ItemReviews.css'

/**
 * FR-4.3: what people said about this dish.
 *
 * Loaded when the dish is opened rather than with the menu, because the menu
 * shows seventeen cards and almost nobody opens more than one or two. The card
 * itself carries the average, which is the part that helps someone choose.
 */
export default function ItemReviews({ menuItemId, summary }) {
  const t = COPY.reviews
  const [reviews, setReviews] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setReviews(null)
    setFailed(false)

    fetchItemReviews(menuItemId)
      .then((rows) => live && setReviews(rows))
      .catch(() => live && setFailed(true))

    // A modal can be closed before the request lands; without this the state
    // update would fire against a component nobody is looking at.
    return () => {
      live = false
    }
  }, [menuItemId])

  if (failed) return <p className="itemreviews-msg">{t.loadError}</p>
  if (reviews === null) return <p className="itemreviews-msg">{COPY.common.loading}</p>
  if (reviews.length === 0) return <p className="itemreviews-msg">{t.none}</p>

  return (
    <section className="itemreviews" aria-label={t.listHeading}>
      <h3>
        {t.listHeading}
        {summary && (
          <span className="itemreviews-avg">
            <Stars value={summary.average} count={summary.count} />
            {t.countLabel(summary.count)}
          </span>
        )}
      </h3>

      <ul>
        {reviews.map((review, index) => (
          <li key={`${review.at}-${index}`}>
            <div className="itemreviews-head">
              <Stars value={review.rating} count={1} />
              <span className="itemreviews-who">{review.reviewer ?? t.anonymous}</span>
              <time className="itemreviews-when">{formatDateTime(review.at)}</time>
            </div>
            {review.comment && <p>{review.comment}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}
