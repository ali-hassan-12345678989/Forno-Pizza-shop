// Every icon in one place. All share a 24-grid and inherit currentColor, so a
// component sets size and colour in CSS and never ships its own SVG markup.
function Icon({ children, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}

export function SearchIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4.35-4.35" />
    </Icon>
  )
}

export function PhoneIcon(props) {
  return (
    <Icon {...props}>
      <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .3 1.9.6 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.1a2 2 0 012.1-.5c.9.3 1.8.5 2.8.6a2 2 0 011.7 2z" />
    </Icon>
  )
}

export function CartIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="20" r="1.6" />
      <circle cx="18" cy="20" r="1.6" />
      <path d="M2 3h3l2.6 12.4a2 2 0 002 1.6h7.8a2 2 0 002-1.6L21 7H6" />
    </Icon>
  )
}

export function CheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 6L9 17l-5-5" />
    </Icon>
  )
}

/** A banknote, not a "$" — this shop prices in rupees. */
export function CashIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </Icon>
  )
}

export function ClockIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 6v6l4 2M12 21a9 9 0 110-18 9 9 0 010 18z" />
    </Icon>
  )
}

export function HomeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </Icon>
  )
}

export function MenuIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </Icon>
  )
}

export function ArrowLeftIcon(props) {
  return (
    <Icon {...props}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </Icon>
  )
}

export function CopyIcon(props) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </Icon>
  )
}

export function PinIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1116 0z" />
      <circle cx="12" cy="10" r="3" />
    </Icon>
  )
}

export function ReceiptIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 3v18l2.5-1.8L10 21l2-1.8L14 21l2.5-1.8L19 21V3z" />
      <path d="M9 8h6M9 12h6" />
    </Icon>
  )
}

export function MailIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2.5 6.5L12 13l9.5-6.5" />
    </Icon>
  )
}

export function LockIcon(props) {
  return (
    <Icon {...props}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 118 0v3" />
    </Icon>
  )
}

export function EyeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M1.8 12S5.5 5.5 12 5.5 22.2 12 22.2 12 18.5 18.5 12 18.5 1.8 12 1.8 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

export function EyeOffIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9.9 5.7A9.9 9.9 0 0112 5.5c6.5 0 10.2 6.5 10.2 6.5a18 18 0 01-3.3 4.1M6.3 7.9A18 18 0 001.8 12S5.5 18.5 12 18.5a9.8 9.8 0 004-.8" />
      <path d="M9.9 9.9a3 3 0 004.2 4.2" />
      <path d="M3 3l18 18" />
    </Icon>
  )
}

export function UserIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0115 0" />
    </Icon>
  )
}

export function ChevronDownIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  )
}

export function SignOutIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </Icon>
  )
}

export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </Icon>
  )
}
