import { motion } from 'framer-motion'
import { EASE, DURATION, t } from '../lib/motion.js'

/**
 * Material 3 navigation bar (phone only).
 *
 * The active destination gets a 64×32dp pill that *slides* between items via a
 * shared `layoutId`, which is the detail that makes M3 navigation feel like
 * Android rather than a web tab bar.
 */

const ICONS = {
  grid: (p) => (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={p} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="2.2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2.2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2.2" />
    </svg>
  ),
  search: (p) => (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={p} strokeWidth={2} strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6" />
    </svg>
  ),
  sliders: (p) => (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={p} strokeWidth={1.9} strokeLinecap="round">
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="16" cy="8" r="2.3" /><circle cx="10" cy="16" r="2.3" />
    </svg>
  ),
}

const DESTINATIONS = [
  { id: 'home', label: 'All tools', icon: 'grid' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'personalize', label: 'Personalize', icon: 'sliders' },
]

function NavItem({ dest, active, onClick, onOpen }) {
  const paint = active ? 'var(--on-secondary-container)' : 'var(--on-surface-variant)'
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      transition={t(DURATION.short3, EASE.emphasizedAccelerate)}
      onPointerEnter={onOpen}
      onClick={onClick}
      aria-label={dest.label}
      aria-current={active ? 'page' : undefined}
      data-active={active}
      className="md3-nav-item"
    >
      <span className="md3-nav-indicator" aria-hidden="true">
        {active && <motion.span className="md3-nav-pill" layoutId="md3-nav-pill" transition={t(DURATION.long2, EASE.emphasized)} />}
        <motion.span className="md3-nav-icon" transition={t(DURATION.medium2, EASE.emphasized)}>{ICONS[dest.icon](paint)}</motion.span>
      </span>
      <span className="md3-nav-label">{dest.label}</span>
    </motion.button>
  )
}

export default function MobileNavBar({ destination = 'home', onHome, onSearch, onPersonalize, onPreload }) {
  const handlers = { home: onHome, search: onSearch, personalize: onPersonalize }
  return (
    <nav className="md3-nav-bar" aria-label="Main navigation">
      {DESTINATIONS.map((dest) => (
        <NavItem
          key={dest.id}
          dest={dest}
          active={destination === dest.id}
          onClick={handlers[dest.id]}
          onOpen={onPreload?.(dest.id)}
        />
      ))}
    </nav>
  )
}

export { DESTINATIONS }