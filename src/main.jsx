import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SettingsProvider } from './context/SettingsContext'
import { OrderProvider } from './context/OrderContext'
import { CartProvider } from './context/CartContext'
import { AuthProvider } from './context/AuthContext'
import { StaffProvider } from './context/StaffContext'
import SettingsGate from './components/SettingsGate'
import ErrorBoundary from './components/ErrorBoundary'
import { primeMenu } from './lib/primeMenu'
import { isStaffPath } from './config/routes'
import './index.css'
import App from './App.jsx'

/**
 * The menu request leaves before React does.
 *
 * SettingsGate holds the app back only until the shop details are KNOWN, which
 * for a returning customer is immediate. The Menu page still could not fetch
 * until that gate opened, so priming here puts both calls in flight at the
 * same moment — the earliest either can go.
 *
 * Staff routes are skipped: a Manager checking stock has no use for the
 * customer menu, and two requests nobody reads still cost the shop's quota.
 */
if (!isStaffPath(window.location.pathname)) primeMenu()

/**
 * The outermost boundary is the backstop, not the main event.
 *
 * The boundaries that matter are the ones inside CustomerLayout and
 * StaffLayout, because they keep the header and the navigation alive. This one
 * only catches what those cannot: a provider or the gate itself throwing, at
 * which point there is no chrome to preserve anyway.
 *
 * It sits inside BrowserRouter so the retry button re-renders into a working
 * router rather than a tree with no location.
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <SettingsProvider>
          <SettingsGate>
            <AuthProvider>
              <StaffProvider>
                <OrderProvider>
                  <CartProvider>
                    <App />
                  </CartProvider>
                </OrderProvider>
              </StaffProvider>
            </AuthProvider>
          </SettingsGate>
        </SettingsProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
