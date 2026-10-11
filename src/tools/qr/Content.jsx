import { motion, AnimatePresence } from 'framer-motion'
import { QIco, Tabs, Choice, TextIn, Select, Switch, Seg, SPRING, Label } from './ui.jsx'
import { TYPES, GROUPS, typeById } from '../../lib/qr/payloads.js'
import { useQR } from './store.js'

function FieldView({ f, v, set }) {
  const val = v[f.k]
  if (f.show && !f.show(v)) return null
  const span = f.half ? '' : 'col-span-2'
  const wrap = (child) => <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className={span}>{child}</motion.div>
  if (f.type === 'check') return wrap(<Switch on={!!val} onChange={(x) => set(f.k, x)} label={f.label} />)
  if (f.type === 'seg') return wrap(<div><span className="block text-[12.5px] font-semibold mb-1.5">{f.label}</span><Seg small value={val} onChange={(x) => set(f.k, x)} options={f.opts} /></div>)
  if (f.type === 'select') return wrap(<Select label={f.label} value={val} onChange={(x) => set(f.k, x)} options={f.opts} />)
  if (f.type === 'area') return wrap(<TextIn label={f.label} area value={val} onChange={(x) => set(f.k, x)} ph={f.ph} rows={3} />)
  if (f.type === 'datetime') return wrap(<TextIn label={f.label} type={v.allday ? 'date' : 'datetime-local'} value={v.allday ? String(val || '').slice(0, 10) : val} onChange={(x) => set(f.k, x)} />)
  return wrap(<TextIn label={f.label + (f.req ? ' *' : '')} type={f.type === 'password' ? 'text' : 'text'} value={val} onChange={(x) => set(f.k, x)} ph={f.ph} />)
}

export default function Content() {
  const { content, setContent, payload } = useQR()
  const T = typeById(content.type)
  const vals = content.vals[T.id] || T.def
  const set = (k, x) => setContent((c) => ({ ...c, vals: { ...c.vals, [T.id]: { ...(c.vals[T.id] || T.def), [k]: x } } }))
  const group = T.g
  const useLoc = () => navigator.geolocation?.getCurrentPosition((p) => { set('lat', p.coords.latitude.toFixed(6)); setTimeout(() => set('lon', p.coords.longitude.toFixed(6)), 0) })
  const missing = T.fields.filter((f) => f.req && !String(vals[f.k] ?? '').trim())
  return (
    <div className="space-y-5">
      <div>
        <Label>What should it open?</Label>
        <Tabs small value={group} onChange={(g) => setContent((c) => ({ ...c, type: TYPES.find((t) => t.g === g).id }))} tabs={GROUPS.map(([k, l]) => [k, l])} />
        <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {TYPES.filter((t) => t.g === group).map((t, i) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ ...SPRING, delay: i * 0.03 }}>
                <Choice active={t.id === T.id} onClick={() => setContent((c) => ({ ...c, type: t.id }))} className="w-full px-3 py-3 flex items-center gap-2.5 text-left">
                  <span className="w-8 h-8 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><QIco n={t.icon} s={17} /></span><span className="leading-tight">{t.label}</span>
                </Choice>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={T.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
          <Label right={T.id === 'geo' ? <button type="button" className="text-[11.5px] font-semibold" style={{ color: 'var(--copper)' }} onClick={useLoc}>Use my location</button> : null}>{T.label} details</Label>
          {T.hint && <div className="text-[12px] mb-3 flex gap-2" style={{ color: 'var(--muted)' }}><span style={{ color: 'var(--copper)' }}><QIco n="bulb" s={14} /></span>{T.hint}</div>}
          <div className="grid grid-cols-2 gap-3">{T.fields.map((f) => <FieldView key={f.k} f={f} v={vals} set={set} />)}</div>
          <AnimatePresence>{missing.length > 0 && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-[12px] mt-3 font-semibold overflow-hidden" style={{ color: 'var(--copper)' }}>Fill in {missing.map((f) => f.label).join(', ')} to generate your code.</motion.div>}</AnimatePresence>
          <div className="mt-4 rounded-xl border border-line px-3.5 py-2.5 mono text-[11.5px] break-all max-h-24 overflow-auto" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}><span className="eyebrow block mb-1">Encoded text · {payload.length} chars</span>{payload || '—'}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
