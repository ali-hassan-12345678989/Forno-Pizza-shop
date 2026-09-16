import { useShop } from '../context/SettingsContext'
import { COPY } from '../content/copy'
import './Footer.css'

export default function Footer() {
  const { footer } = COPY
  const shop = useShop()

  return (
    <footer className="site-footer">
      <div className="wrap footer-in">
        <div>
          <div className="footer-brand">{shop.name}</div>
          <p className="footer-note">{footer.note(shop.tagline, shop.hours)}</p>
        </div>
        <div className="footer-col">
          <span className="footer-label">{footer.findUs}</span>
          {shop.address}
        </div>
        <div className="footer-col">
          <span className="footer-label">{footer.orderByPhone}</span>
          <a href={shop.phoneHref}>{shop.phone}</a>
        </div>
      </div>
    </footer>
  )
}
