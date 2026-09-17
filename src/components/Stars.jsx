import { COPY } from '../content/copy'
import { RATING_SCALE } from '../config/reviews'
import './Stars.css'

/**
 * A rating, either as something to read or something to set.
 *
 * Read-only it is a picture, so the number goes to a screen reader in words.
 * Interactive it is a radio group, not five buttons: a rating is one choice out
 * of five, which is exactly what radios are, and it brings arrow-key selection
 * and "4 out of 5, radio button, 4 of 5" for free rather than reimplemented.
 */
export default function Stars({ value = 0, count = null, onChange = null, name }) {
  const t = COPY.reviews

  if (!onChange) {
    return (
      <span className="stars" role="img" aria-label={t.starsLabel(value || 0, count ?? 0)}>
        {RATING_SCALE.map((n) => (
          <Star key={n} filled={n <= Math.round(value)} />
        ))}
      </span>
    )
  }

  return (
    <fieldset className="stars stars-input">
      <legend className="sr-only">{t.ratingLegend}</legend>
      {RATING_SCALE.map((n) => (
        <label key={n} className={n <= value ? 'is-on' : ''}>
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="sr-only"
          />
          <span className="sr-only">{t.ratingLabel(n)}</span>
          <Star filled={n <= value} />
        </label>
      ))}
    </fieldset>
  )
}

function Star({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? 'is-filled' : ''}>
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z" />
    </svg>
  )
}
