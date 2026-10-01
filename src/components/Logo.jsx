import React from 'react'

/**
 * TheToolTab logo.
 * Renders the generated brand mark (/logo.png — creamy white theme).
 * Falls back to an inline SVG monogram if the asset is missing.
 */
export function Logo({ className = 'w-9 h-9', shadow = false, big = false }) {
  const [failed, setFailed] = React.useState(false)
  return (
    <div
      className={`${className} relative shrink-0 overflow-hidden`}
      style={shadow ? { boxShadow: big ? 'var(--shadow-lg)' : 'var(--shadow)', borderRadius: 12 } : undefined}
    >
      {!failed ? (
        <img src="/logo.png" alt="TheToolTab" className="w-full h-full object-cover rounded-[inherit]" onError={() => setFailed(true)} draggable={false} />
      ) : (
        <svg viewBox="0 0 64 64" className="w-full h-full rounded-[inherit]">
          <rect width="64" height="64" rx="14" fill="#FDFBF7" />
          <rect x="14" y="14" width="36" height="8" rx="4" fill="#1A1817" />
          <rect x="28" y="14" width="8" height="36" rx="4" fill="#C87941" />
        </svg>
      )}
    </div>
  )
}
