import React from 'react'
import { motion } from 'framer-motion'
import { TOOLS } from '../toolsRegistry.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }
const EASE = [0.22, 1, 0.36, 1]
const ROLES = [['Idea by', '01'], ['Designed by', '02'], ['Created by', '03']]

const RISE = { hidden: { y: '105%' }, show: (i) => ({ y: 0, transition: { duration: 0.7, ease: EASE, delay: 0.05 + i * 0.045 } }) }

/** One glyph of the wordmark: slides up out of a mask. */
function Glyph({ c, i }) {
  return (
    <span className="block overflow-hidden" style={{ lineHeight: 0.8, paddingBottom: '0.02em', paddingInline: '0.05em', marginInline: '-0.05em' }}>
      <motion.span className="block" custom={i} variants={RISE}>{c}</motion.span>
    </span>
  )
}

/**
 * Ultra-wide footer lockup of the TheToolTable logo (Swiss grotesque wordmark, rotated "the",
 * copper full stop, mono credit line). Everything is drawn from theme variables so it re-colours
 * itself whenever the theme changes.
 */
export default function Footer() {
  const word = [...'TOOL'], word2 = [...'TABLE']
  return (
    <footer className="relative mt-4 border-t border-line overflow-hidden" style={{ background: 'var(--surface2)' }} aria-label="TheToolTable credits">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(60% 80% at 85% 110%, var(--glow), transparent 70%)' }} />
      <div className="relative max-w-6xl mx-auto px-6 pt-14 pb-8">
        {/* ── the wordmark, one ultra-wide line ── */}
        <div role="img" aria-label="the TOOLTABLE by Mubashir" style={{ containerType: 'inline-size' }}>
          <motion.div className="flex items-end justify-between select-none" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', fontWeight: 800, fontSize: '15.3cqw', letterSpacing: '-0.045em', color: 'var(--ink)', lineHeight: 0.8, fontFeatureSettings: '"ss01","cv11"' }}>
            <motion.span className="block shrink-0" initial={{ opacity: 0, x: -14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ ...SPRING, delay: 0.05 }}
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '0.3em', letterSpacing: '-0.01em', lineHeight: 1, paddingBlock: '0.04em', marginRight: '0.06em' }}>the</motion.span>
            <span className="flex">{word.map((c, i) => <Glyph key={'a' + i} c={c} i={i} />)}</span>
            
            <span className="shrink-0" style={{ width: '0.2em' }} />
            <span className="flex">{word2.map((c, i) => <Glyph key={'b' + i} c={c} i={i + 4} />)}</span>
            <motion.span className="block shrink-0 relative" initial={{ scale: 0, rotate: -90 }} whileInView={{ scale: 1, rotate: 0 }} viewport={{ once: true }} transition={{ ...SPRING, delay: 0.6 }}
              style={{ width: '0.16em', height: '0.16em', background: 'var(--accent)', marginLeft: '0.05em', marginBottom: '0.02em' }}>
              <motion.span className="absolute inset-0" style={{ background: 'var(--accent)' }} animate={{ scale: [1, 2.4], opacity: [0.5, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut', repeatDelay: 1.4 }} />
            </motion.span>
          </motion.div>
        </div>

        {/* ── rule ── */}
        <motion.div className="h-px mt-9 origin-left" style={{ background: 'var(--ink)', opacity: 0.85 }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1, ease: EASE, delay: 0.3 }} />

        {/* ── credits, mono like the logo's "by Mubashir" ── */}
        <div className="mt-6 flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
          <div className="flex flex-wrap gap-x-12 gap-y-5">
            {ROLES.map(([role, n], i) => (
              <motion.div key={role} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ...SPRING, delay: 0.5 + i * 0.1 }} className="group">
                <div className="mono text-[10.5px] uppercase tracking-[0.2em] flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                  <span style={{ color: 'var(--accent)' }}>{n}</span>{role}
                </div>
                <div className="relative mt-1.5 inline-block">
                  <span className="mono text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>Mubashir</span>
                  <span className="absolute left-0 -bottom-0.5 h-[2px] w-full origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" style={{ background: 'var(--accent)' }} />
                </div>
              </motion.div>
            ))}
          </div>
          <motion.div className="mono text-[11px] leading-relaxed sm:text-right" style={{ color: 'var(--muted)' }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.9 }}>
            <div>{TOOLS.length} tools · local-first · zero compression</div>
            <div className="flex items-center gap-3 sm:justify-end mt-1.5">
              <span>© {new Date().getFullYear()} TheToolTable</span>
              <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="font-semibold hover:underline" style={{ color: 'var(--ink)' }}>Back to top ↑</button>
            </div>
          </motion.div>
        </div>
      </div>
    </footer>
  )
}
