import { CheckIcon, CloseIcon } from './icons'
import { COPY } from '../content/copy'
import {
  ORDER_STATUS,
  TRAIL_STATE,
  isCancelled,
  stageIndexOf,
  stageStateOf,
  stagesFor,
} from '../config/orderStatus'
import { formatTime } from '../lib/format'
import './OrderStatusTrail.css'

/**
 * FR-3.2: where the order has got to, and when each stage happened.
 *
 * The four stages come from the ladder in config/orderStatus.js; the times come
 * from order_status_history. Those are two different things on purpose — the
 * ladder is what *should* happen, the history is what *did*. A kitchen that
 * jumps straight from "placed" to "out for delivery" leaves a stage with no
 * timestamp, and the trail shows it as passed rather than pretending it has a
 * time it never had.
 */
export default function OrderStatusTrail({ status, fulfillmentType, history = [] }) {
  const t = COPY.track.trail
  const stages = stagesFor(fulfillmentType)
  const cancelled = isCancelled(status)
  const reached = stageIndexOf(status, fulfillmentType)
  const times = firstTimePerStatus(history)

  return (
    <section className="panel trail" aria-label={t.heading}>
      <h2>{t.heading}</h2>

      <ol className={`trail-list${cancelled ? ' is-cancelled' : ''}`}>
        {stages.map((stage, index) => (
          <Step
            key={stage}
            label={COPY.track.statuses[stage]}
            /* The note describes where the order is, so it belongs to the stage
               the order is on — including the last one, which reads as done
               rather than in progress but is still where the order sits. */
            note={index === reached ? t.notes[stage] : null}
            time={times[stage]}
            state={stageStateOf({ index, reached, status, reachedInHistory: stage in times })}
          />
        ))}

        {cancelled && (
          <Step
            label={COPY.track.statuses[ORDER_STATUS.cancelled]}
            note={t.cancelledBody}
            time={times[ORDER_STATUS.cancelled]}
            state={TRAIL_STATE.cancelled}
          />
        )}
      </ol>
    </section>
  )
}

function Step({ label, note, time, state }) {
  const t = COPY.track.trail
  const stateLabel = {
    [TRAIL_STATE.done]: t.stateDone,
    [TRAIL_STATE.current]: t.stateCurrent,
    [TRAIL_STATE.pending]: t.statePending,
    [TRAIL_STATE.cancelled]: t.cancelledTitle,
  }[state]

  return (
    <li
      className={`trail-step is-${state}`}
      aria-current={state === TRAIL_STATE.current ? 'step' : undefined}
    >
      <span className="trail-marker" aria-hidden="true">
        {state === TRAIL_STATE.done && <CheckIcon />}
        {state === TRAIL_STATE.cancelled && <CloseIcon />}
      </span>

      <span className="trail-body">
        <span className="trail-label">
          {label}
          {/* The marker shape is the only visual cue for state, so the same
              information has to reach a screen reader as words. */}
          <span className="sr-only"> — {stateLabel}</span>
        </span>
        {note && <span className="trail-note">{note}</span>}
      </span>

      {time && <time className="trail-time">{formatTime(time)}</time>}
    </li>
  )
}

/**
 * The first time each status was recorded.
 *
 * First rather than last: if an order were ever set back to a stage it had
 * already been through, the honest answer to "when did the kitchen start on
 * this" is the original time. Forward-only transitions make that hypothetical,
 * but the reader should not be the thing relying on it.
 */
function firstTimePerStatus(history) {
  const times = {}
  for (const entry of history) {
    if (!(entry.status in times)) times[entry.status] = entry.at
  }
  return times
}
