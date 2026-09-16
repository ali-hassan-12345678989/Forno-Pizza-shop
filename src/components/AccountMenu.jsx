import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthModal from './AuthModal'
import { AUTH_MODES } from './AuthForm'
import { UserIcon, ChevronDownIcon, ReceiptIcon, SignOutIcon } from './icons'
import { COPY } from '../content/copy'
import { ROUTES } from '../config/routes'
import './AccountMenu.css'

/**
 * The header's account control.
 *
 * Signed out it offers both routes side by side rather than a single "Login"
 * that makes creating an account feel like a detour — Pizza Hut PK surfaces
 * only Login, and signing up from there is genuinely hard to find. Signed in it
 * collapses to one button, because the account is then a place, not a decision.
 *
 * Guest checkout is untouched by any of this: nothing here ever blocks ordering.
 */
export default function AccountMenu() {
  const { isSignedIn, email, signOut, ready } = useAuth()
  const t = COPY.auth

  const [modalMode, setModalMode] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close the dropdown on an outside click or Escape — a menu that needs a
  // second click on the same button to dismiss feels stuck.
  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  // Render nothing until the session is known, so the buttons do not flip from
  // "Log in" to an account chip a beat after the page paints.
  if (!ready) return <span className="acctmenu-placeholder" aria-hidden="true" />

  if (!isSignedIn) {
    return (
      <>
        <div className="acctmenu-auth">
          {/* The label is hidden below 760px and the icon is aria-hidden, so
              without an explicit name this button is silent on a phone. */}
          <button
            type="button"
            className="acctmenu-login"
            onClick={() => setModalMode(AUTH_MODES.signIn)}
            aria-label={t.logIn}
          >
            <UserIcon />
            <span>{t.logIn}</span>
          </button>
          <button
            type="button"
            className="acctmenu-signup"
            onClick={() => setModalMode(AUTH_MODES.signUp)}
          >
            {t.signUp}
          </button>
        </div>

        <AuthModal
          open={modalMode !== null}
          initialMode={modalMode ?? AUTH_MODES.signIn}
          onClose={() => setModalMode(null)}
        />
      </>
    )
  }

  return (
    <div className="acctmenu" ref={menuRef}>
      <button
        type="button"
        className="acctmenu-trigger"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={t.accountMenuLabel}
      >
        <span className="acctmenu-avatar" aria-hidden="true">
          {email?.[0]?.toUpperCase() ?? '?'}
        </span>
        <ChevronDownIcon className="acctmenu-chev" />
      </button>

      {menuOpen && (
        <div className="acctmenu-pop" role="menu">
          <p className="acctmenu-who">
            <span>{t.signedInAs}</span>
            <strong>{email}</strong>
          </p>

          <Link to={ROUTES.orders} role="menuitem" onClick={() => setMenuOpen(false)}>
            <ReceiptIcon />
            {t.myOrders}
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              signOut()
            }}
          >
            <SignOutIcon />
            {t.signOut}
          </button>
        </div>
      )}
    </div>
  )
}
