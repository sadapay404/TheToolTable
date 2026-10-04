import React from 'react'
import { assetUrl } from '../lib/utils.js'

/**
 * TheToolTable logo.
 * Renders the generated brand mark (/logo.png — creamy background, toolbox outline, wordmark).
 * Falls back to an inline SVG toolbox-outline monogram if the asset is missing.
 */
export function Logo({ className = 'w-9 h-9', shadow = false, big = false }) {
  const [failed, setFailed] = React.useState(false)
  return (
    <div
      className={`${className} relative shrink-0 overflow-hidden`}
      style={shadow ? { boxShadow: big ? 'var(--shadow-lg)' : 'var(--shadow)', borderRadius: 12 } : undefined}
    >
      {!failed ? (
        <img src={assetUrl('logo.png')} alt="TheToolTable" className="w-full h-full object-cover rounded-[inherit]" onError={() => setFailed(true)} draggable={false} />
      ) : (
        <svg viewBox="0 0 64 64" className="w-full h-full rounded-[inherit]">
          <rect width="64" height="64" fill="#FDFBF7" />
          {/* toolbox outline */}
          <rect x="12" y="28" width="40" height="22" rx="4" fill="none" stroke="#1A1817" strokeWidth="2.5" />
          <path d="M25 28 v-5 a3 3 0 0 1 3-3 h8 a3 3 0 0 1 3 3 v5" fill="none" stroke="#1A1817" strokeWidth="2.5" />
          <line x1="12" y1="37" x2="52" y2="37" stroke="#1A1817" strokeWidth="2.5" />
          <rect x="28" y="33.5" width="8" height="7" rx="1.5" fill="#C87941" />
        </svg>
      )}
    </div>
  )
}
