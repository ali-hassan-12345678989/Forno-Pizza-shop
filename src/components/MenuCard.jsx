import Stars from './Stars'
import { COPY } from '../content/copy'
import { sizedImage, IMAGE_SIZES } from '../content/images'
import { formatPrice } from '../lib/format'
import './MenuCard.css'

/**
 * A preview, not a form.
 *
 * Sizes and extras are chosen in ItemModal, so the card advertises the cheapest
 * way in ("From Rs. 1050") and opens the item when tapped. The clickable area
 * is the whole card, but the accessible name is just the item — the button
 * stretches over the card with a pseudo-element rather than wrapping the
 * heading, which would flatten it out of the page outline.
 */
export default function MenuCard({ item, rating = null, onOpen }) {
  const t = COPY.menu
  const sizes = item.sizes ?? []
  const soldOut = item.isSoldOut || sizes.length === 0
  const from = sizes.length ? Math.min(...sizes.map((s) => s.price)) : null
  const image = sizedImage(item.imageUrl, IMAGE_SIZES.menuCard)

  return (
    <article className={`pcard${soldOut ? ' out' : ''}`}>
      <div className="pcard-pic">
        {soldOut && <span className="badge-out">{t.soldOut}</span>}
        {!soldOut && item.badge && t.badges[item.badge] && (
          <span className={`tag tag-${item.badge}`}>{t.badges[item.badge]}</span>
        )}
        {image ? (
          <img src={image} alt={item.name} loading="lazy" width="600" height="375" />
        ) : (
          <div className="pcard-noimg" aria-hidden="true" />
        )}
      </div>

      <div className="pcard-body">
        <h2 className="pcard-name">
          {soldOut ? (
            item.name
          ) : (
            <button
              type="button"
              className="pcard-open"
              onClick={() => onOpen(item)}
              aria-label={COPY.item.openLabel(item.name)}
            >
              {item.name}
            </button>
          )}
        </h2>

        {item.description && <p className="pcard-desc">{item.description}</p>}

        {/* Only shown once somebody has actually rated it. "No reviews yet" on
            every card would be seventeen apologies and no information. */}
        {rating && rating.count > 0 && (
          <span className="pcard-rating">
            <Stars value={rating.average} count={rating.count} />
            <span aria-hidden="true">{COPY.reviews.summary(rating.average, rating.count)}</span>
          </span>
        )}

        <div className="pcard-foot">
          {from !== null && <span className="price">{t.fromPrice(formatPrice(from))}</span>}
          <span className={soldOut ? 'btn-out' : 'btn-add'} aria-hidden="true">
            {soldOut ? t.unavailable : t.addToCart}
          </span>
        </div>
      </div>
    </article>
  )
}
