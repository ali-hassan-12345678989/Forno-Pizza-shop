import { useId } from 'react'
import { COPY } from '../content/copy'
import { MAX_RANGE_DAYS, PRESET_RANGES, RANGE_IDS, isValidRange } from '../lib/dateRanges'
import './RangePicker.css'

/**
 * Which window a report covers.
 *
 * The presets are the accounting periods somebody actually reconciles against —
 * this week so far, the whole of last week, the last seven or thirty days — and
 * `custom` is the escape hatch for the ones nobody could anticipate.
 *
 * WHY THE CUSTOM FIELDS ARE ALWAYS PRESENT rather than appearing when "Custom"
 * is chosen: a pair of date boxes that materialise on click moves everything
 * below them down the page at the moment the reader is looking at it. They are
 * disabled instead, which says the same thing without the jump, and choosing a
 * preset fills them in — so the escape hatch starts from wherever you already
 * were rather than from blank.
 */
export default function RangePicker({ value, from, to, onPreset, onCustom, max = MAX_RANGE_DAYS }) {
  const t = COPY.staff.ranges
  const fromId = useId()
  const toId = useId()

  const custom = value === RANGE_IDS.custom
  const valid = isValidRange(from, to)

  return (
    <div className="range">
      <div className="range-presets" role="group" aria-label={t.label}>
        {PRESET_RANGES.map((id) => (
          <button
            key={id}
            type="button"
            className="chip"
            aria-pressed={value === id}
            onClick={() => onPreset(id)}
          >
            {t.presets[id]}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={custom}
          onClick={() => onPreset(RANGE_IDS.custom)}
        >
          {t.presets.custom}
        </button>
      </div>

      <div className="range-custom">
        <label className="range-label" htmlFor={fromId}>
          {t.fromLabel}
        </label>
        <input
          id={fromId}
          type="date"
          className="range-date"
          value={from ?? ''}
          disabled={!custom}
          onChange={(event) => onCustom(event.target.value, to)}
        />

        <label className="range-label" htmlFor={toId}>
          {t.toLabel}
        </label>
        <input
          id={toId}
          type="date"
          className="range-date"
          value={to ?? ''}
          disabled={!custom}
          onChange={(event) => onCustom(from, event.target.value)}
        />
      </div>

      {/* Answered here rather than after a round trip. The database checks the
          same three things — see the guards in staff_usage_between() — because
          the browser is not what enforces them. */}
      {custom && !valid && (
        <p className="range-invalid" role="alert">
          {t.invalid(max)}
        </p>
      )}
    </div>
  )
}
