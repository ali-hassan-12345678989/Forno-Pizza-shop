import { COPY } from '../content/copy'
import './CheckoutSteps.css'

/**
 * Three stages from the approved design. Everything before "Confirm" happens on
 * this one page, so this orients rather than navigates — hence no links.
 */
export default function CheckoutSteps({ current = 'details' }) {
  const t = COPY.checkout
  const order = ['order', 'details', 'confirm']
  const currentIndex = order.indexOf(current)

  return (
    <ol className="steps-bar" aria-label={t.stepsLabel}>
      {order.map((key, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'on' : 'todo'

        return (
          <li
            key={key}
            className={`stp ${state}`}
            aria-current={state === 'on' ? 'step' : undefined}
          >
            <span className="stp-n" aria-hidden="true">
              {state === 'done' ? '✓' : index + 1}
            </span>
            <span className="stp-l">{t.steps[key]}</span>
          </li>
        )
      })}
    </ol>
  )
}
