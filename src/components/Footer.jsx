import React from 'react'
import { motion } from 'framer-motion'
import { TOOLS } from '../toolsRegistry.jsx'
import { Logo } from './Logo.jsx'
import { useScroll, useTransform } from 'framer-motion'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }
const EASE = [0.22, 1, 0.36, 1]
const ROLES = [['Idea by', '01'], ['Designed by', '02'], ['Created by', '03']]
const TICKER = 'IDEA BY MUBASHIR · DESIGNED WITH CARE · CREATED FOR EVERYDAY WORK · THE TOOLTABLE · '
const RISE = { hidden: { y: '105%' }, show: (i) => ({ y: 0, transition: { duration: 0.7, ease: EASE, delay: 0.05 + i * 0.045 } }) }
const scrollToTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth' })

/** One glyph of the wordmark: slides up out of a mask, then lifts on hover. */
function Glyph({ c, i }) {
  return (
    <motion.span
      className="block overflow-hidden footer-glyph"
      style={{ lineHeight: 0.8, paddingBottom: '0.02em', paddingInline: '0.05em', marginInline: '-0.05em' }}
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 380, damping: 16, mass: 0.4 }}
    >
      <motion.span className="block" custom={i} variants={RISE}>{c}</motion.span>
    </motion.span>
  )
}

function MobileFooter() {
  return (
    <div className="mobile-footer sm:hidden" aria-label="TheToolTable credits">
      <div className="mobile-footer-glow" aria-hidden="true" />
      <div className="mobile-footer-content">
        <motion.div className="mobile-footer-brand" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} transition={SPRING}>
          <div className="mobile-footer-brandline"><Logo className="w-10 h-10 rounded-xl" shadow /><span><span className="eyebrow block">TheToolTable</span><span className="text-[11px] block mt-1" style={{ color: 'var(--muted)' }}>A workbench by Mubashir</span></span></div>
          <div role="img" aria-label="the TOOL TABLE" className="mobile-footer-wordmark">
            <span className="mobile-footer-the">the</span>
            <span className="mobile-footer-word">TOOL<span>TABLE</span><i aria-hidden="true" /></span>
          </div>
        </motion.div>

        <div className="mobile-footer-credits">
          {ROLES.map(([role, number], index) => (
            <motion.div key={role} className="mobile-credit" initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ...SPRING, delay: index * 0.06 }}>
              <span className="mobile-credit-index">{number}</span><span><span className="mobile-credit-role">{role}</span><strong>Mubashir</strong></span>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mobile-footer-ticker" aria-label="Ideas, designed with care, and made for everyday work">
        <div className="mobile-footer-marquee-track" aria-hidden="true">
          {[0, 1].map((copy) => <span className="mobile-footer-marquee-copy" key={copy}>{TICKER.split(' · ').filter(Boolean).map((word, i) => <React.Fragment key={`${copy}-${i}`}><span>{word}</span><i>✦</i></React.Fragment>)}</span>)}
        </div>
      </div>

      <div className="mobile-footer-bottom">
        <span>© {new Date().getFullYear()} · {TOOLS.length} tools and growing</span>
        <button type="button" onClick={scrollToTop}>Back to top <span aria-hidden="true">↑</span></button>
      </div>
    </div>
  )
}

/**
 * Wide desktop lockup and a purpose-built phone footer. The mobile ticker remains
 * continuously animated unless the operating system requests reduced motion.
 */
export default function Footer() {
  const word = [...'TOOL'], word2 = [...'TABLE']
  /* The lockup drifts a little as the footer arrives — depth, not decoration. */
  const { scrollY } = useScroll()
  const lockupY = useTransform(scrollY, [0, 6000], [0, -46])
  const lockupScale = useTransform(scrollY, [0, 6000], [1, 1.015])
  return (
    <footer className="relative mt-4 border-t border-line overflow-hidden" style={{ background: 'var(--surface2)' }} aria-label="TheToolTable credits">
      <div className="desktop-footer-aura" aria-hidden="true">
        <span className="footer-aura-blob footer-aura-blob--a" />
        <span className="footer-aura-blob footer-aura-blob--b" />
        <span className="footer-aura-blob footer-aura-blob--c" />
        <span className="footer-aura-scan" />
      </div>
      <MobileFooter />
      <div className="desktop-footer hidden sm:block">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(60% 80% at 85% 110%, var(--glow), transparent 70%)' }} />
        <div className="relative max-w-6xl mx-auto px-6 pt-14 pb-8">
          <div role="img" aria-label="the TOOLTABLE by Mubashir" style={{ containerType: 'inline-size' }}>
            <motion.div className="flex items-end justify-between select-none" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} style={{ y: lockupY, scale: lockupScale, fontFamily: 'Roboto, "Noto Sans", Arial, sans-serif', fontWeight: 800, fontSize: '15.3cqw', letterSpacing: '-0.045em', color: 'var(--ink)', lineHeight: 0.8, fontFeatureSettings: '"kern"' }}>
              <motion.span className="block shrink-0" initial={{ opacity: 0, x: -14 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ ...SPRING, delay: 0.05 }} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '0.3em', letterSpacing: '-0.01em', lineHeight: 1, paddingBlock: '0.04em', marginRight: '0.06em' }}>the</motion.span>
              <span className="flex">{word.map((c, i) => <Glyph key={'a' + i} c={c} i={i} />)}</span>
              <span className="shrink-0" style={{ width: '0.2em' }} />
              <span className="flex">{word2.map((c, i) => <Glyph key={'b' + i} c={c} i={i + 4} />)}</span>
              <motion.span className="block shrink-0 relative" initial={{ scale: 0, rotate: -90 }} whileInView={{ scale: 1, rotate: 0 }} viewport={{ once: true }} transition={{ ...SPRING, delay: 0.6 }} style={{ width: '0.16em', height: '0.16em', background: 'var(--accent)', marginLeft: '0.05em', marginBottom: '0.02em' }}>
                <motion.span className="absolute inset-0" style={{ background: 'var(--accent)' }} animate={{ scale: [1, 2.4], opacity: [0.5, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut', repeatDelay: 1.4 }} />
              </motion.span>
            </motion.div>
          </div>
          <motion.div className="h-px mt-9 origin-left" style={{ background: 'var(--ink)', opacity: 0.85 }} initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1, ease: EASE, delay: 0.3 }} />
          <div className="mt-6 flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
            <div className="flex flex-wrap gap-x-12 gap-y-5">
              {ROLES.map(([role, number], index) => (
                <motion.div key={role} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ ...SPRING, delay: 0.5 + index * 0.1 }} className="group">
                  <div className="mono text-[10.5px] uppercase tracking-[0.2em] flex items-center gap-2" style={{ color: 'var(--muted)' }}><span style={{ color: 'var(--accent)' }}>{number}</span>{role}</div>
                  <div className="relative mt-1.5 inline-block"><span className="mono text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>Mubashir</span><span className="absolute left-0 -bottom-0.5 h-[2px] w-full origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" style={{ background: 'var(--accent)' }} /></div>
                </motion.div>
              ))}
            </div>
            <motion.div className="mono text-[11px] leading-relaxed sm:text-right" style={{ color: 'var(--muted)' }} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.9 }}>
              <div>{TOOLS.length} tools · local-first · zero compression</div>
              <div className="flex items-center gap-3 sm:justify-end mt-1.5"><span>© {new Date().getFullYear()} TheToolTable</span><button type="button" onClick={scrollToTop} className="font-semibold hover:underline footer-top-link" style={{ color: 'var(--ink)' }}>Back to top ↑</button></div>
            </motion.div>
          </div>
        </div>
      </div>
    </footer>
  )
}
