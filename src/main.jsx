import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SettingsProvider } from './context/SettingsContext'
import { OrderProvider } from './context/OrderContext'
import { CartProvider } from './context/CartContext'
import { AuthProvider } from './context/AuthContext'
import { StaffProvider } from './context/StaffContext'
import SettingsGate from './components/SettingsGate'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
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
    </BrowserRouter>
  </StrictMode>,
)
