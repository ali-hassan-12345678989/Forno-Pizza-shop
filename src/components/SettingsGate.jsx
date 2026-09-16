import { useSettingsStatus } from '../context/SettingsContext'
import { COPY } from '../content/copy'
import './SettingsGate.css'

/**
 * Header, footer and cart all need the shop's details before anything can
 * render meaningfully. Holding the first paint until they arrive keeps the
 * database as the only source of truth — the alternative is shipping default
 * values in code, which is exactly the duplication this table removes.
 */
export default function SettingsGate({ children }) {
  const { settings, error, reload } = useSettingsStatus()

  if (error) {
    return (
      <div className="gate">
        <div className="gate-box">
          <strong>{COPY.common.settingsErrorTitle}</strong>
          <p>{COPY.common.settingsErrorBody}</p>
          <button type="button" className="btn-solid" onClick={reload}>
            {COPY.common.retry}
          </button>
        </div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="gate" aria-busy="true">
        <span className="gate-spinner" aria-hidden="true" />
        <span className="gate-loading">{COPY.common.loading}</span>
      </div>
    )
  }

  return children
}
