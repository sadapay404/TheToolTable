import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Btn, Drop, Bar, KIco, SPRING, Chips, Empty, Seg, useToast, save, fmtSize, uid } from './kit/ui.jsx'
import { Peer, MAX_BEAM_FILE_SIZE, MAX_BEAM_CHAT_CHARS } from '../lib/beam/peer.js'
import { CodeOut, CodeIn, Step } from './beam/parts.jsx'

const percent = (got, size) => size > 0 ? Math.min(100, Math.max(0, (got / size) * 100)) : 100

function Choose({ onPick, mode, setMode }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        {[['host', 'Start a beam', 'Create an invitation code and send it to the other device.', 'send'], ['join', 'Join a beam', 'Paste or scan an invitation you received.', 'link']].map(([k, t, d, ic], i) => (
          <motion.button key={k} type="button" onClick={() => onPick(k)} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.08 }} whileHover={{ y: -6, rotate: i ? 0.6 : -0.6 }} whileTap={{ scale: 0.97 }} className="text-left rounded-[28px] border border-line p-7 relative overflow-hidden" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
            <motion.div className="absolute -right-8 -top-8 w-36 h-36 rounded-full" style={{ background: 'color-mix(in srgb, var(--copper) 12%, transparent)' }} animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 4 + i }} />
            <div className="relative w-14 h-14 rounded-2xl grid place-items-center mb-5" style={{ background: 'var(--ink)', color: 'var(--bg)' }}><KIco n={ic} s={26} /></div>
            <div className="display font-semibold text-[24px] relative">{t}</div><div className="text-[13.5px] mt-1.5 relative" style={{ color: 'var(--muted)' }}>{d}</div>
          </motion.button>))}
      </div>
      <Panel delay={0.15}>
        <Label>Connection</Label>
        <Seg value={mode} onChange={setMode} options={[['auto', 'Anywhere'], ['lan', 'Same Wi-Fi only']]} />
        <div className="text-[12.5px] mt-3" style={{ color: 'var(--muted)' }}>{mode === 'auto' ? 'Tries a direct connection across networks using public STUN. Some routers or firewalls block peer-to-peer links; if that happens, try the same Wi-Fi option. Files never pass through STUN.' : 'No outside server is contacted. Both devices must be on the same Wi-Fi or hotspot.'} Both people must pick the same option.</div>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-3 text-[13px]">
        {[['lock', 'End-to-end encrypted', 'WebRTC encrypts every byte.'], ['zap', 'No upload, no limits', 'Straight between devices.'], ['wifi', 'No accounts', 'Just two codes, copied once.']].map(([ic, t, d], i) => <motion.div key={t} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.25 + i * 0.06 }} className="flex gap-3 p-4 rounded-2xl border border-line" style={{ background: 'var(--surface)' }}><span style={{ color: 'var(--copper)' }}><KIco n={ic} s={20} /></span><div><div className="font-semibold">{t}</div><div style={{ color: 'var(--muted)' }}>{d}</div></div></motion.div>)}
      </div>
    </div>
  )
}

function Room({ peer, onLeave, toast }) {
  const [items, setItems] = useState([]), [chat, setChat] = useState([]), [msg, setMsg] = useState(''), [state, setState] = useState(peer.state), endRef = useRef(null)
  const patch = useCallback((id, p) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x))), [])
  useEffect(() => {
    const handlers = {
      state: setState,
      chat: (t) => setChat((c) => [...c, { me: false, t, at: Date.now() }].slice(-500)),
      incoming: (m) => setItems((l) => [{ id: 'r' + m.id, name: m.name, size: m.size, dir: 'in', pct: m.size === 0 ? 100 : 0, at: Date.now() }, ...l].slice(0, 250)),
      recv: (id, got, size) => patch('r' + id, { pct: percent(got, size) }),
      received: (id, blob, name) => { patch('r' + id, { pct: 100, blob, done: true }); toast(`Received ${name}`) },
      sent: (id, off, size, done) => patch('s' + id, { pct: percent(off, size), done: !!done }),
      fail: (id, e) => { patch('s' + id, { err: e }); toast(e, 'err') },
      transferError: (id, e) => { if (id) patch('r' + id, { err: e }); toast(e, 'err') },
      error: (e) => toast(e, 'err'),
    }
    Object.entries(handlers).forEach(([event, handler]) => peer.on(event, handler))
    return () => Object.keys(handlers).forEach((event) => peer.off(event))
  }, [peer, patch, toast])
  useEffect(() => { endRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }) }, [chat])
  const send = (files) => files.forEach((f) => { const id = uid(); setItems((l) => [{ id: 's' + id, name: f.name, size: f.size, dir: 'out', pct: 0, at: Date.now() }, ...l]); peer.sendFile(f, id) })
  const live = state === 'connected'
  const say = () => { const t = msg.trim(); if (!t || !live) return; try { peer.sendText(t); setChat((c) => [...c, { me: true, t, at: Date.now() }].slice(-500)); setMsg('') } catch (e) { toast(e.message || 'Could not send that message.', 'err') } }
  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="rounded-[22px] p-4 flex items-center gap-4 flex-wrap" style={{ background: live ? 'color-mix(in srgb, #2F9E6B 14%, var(--surface))' : 'color-mix(in srgb, #C3423F 12%, var(--surface))', border: '1px solid var(--border)' }}>
        <div className="relative w-4 h-4"><motion.span className="absolute inset-0 rounded-full" style={{ background: live ? '#2F9E6B' : '#C3423F' }} animate={live ? { scale: [1, 2.4], opacity: [0.6, 0] } : {}} transition={{ repeat: Infinity, duration: 1.6 }} /><span className="absolute inset-0 rounded-full" style={{ background: live ? '#2F9E6B' : '#C3423F' }} /></div>
        <div className="flex-1 min-w-0"><div className="display font-semibold text-[17px]">{live ? 'Connected — beam away' : state === 'lost' ? 'Connection lost' : 'Connection closed'}</div><div className="text-[12.5px]" style={{ color: 'var(--muted)' }}>{live ? 'Files and messages go directly to the other device.' : 'Start a new beam to reconnect.'}</div></div>
        <Btn small icon="x" danger onClick={onLeave}>{live ? 'Disconnect' : 'Start over'}</Btn>
      </motion.div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start">
        <Panel>
          <Label>Send files</Label>
          <Drop onFiles={send} compact title="Drop files to beam them" sub={`Files up to ${fmtSize(MAX_BEAM_FILE_SIZE)} — sent one after another`} icon="send" />
          <div className="mt-5"><Label right={<div className="flex items-center gap-2"><span className="text-[12px] font-semibold tabular-nums">{items.length}</span>{items.some((i) => i.done || i.err) && <Btn small icon="trash" onClick={() => setItems((l) => l.filter((i) => !i.done && !i.err))}>Clear done</Btn>}</div>}>Transfers</Label>
            {!items.length ? <Empty icon="send" title="No transfers yet" sub="Files you send or receive show up here." /> : (
              <div className="space-y-2.5 max-h-[420px] overflow-auto pr-1">
                <AnimatePresence initial={false}>{items.map((it) => (
                  <motion.div key={it.id} layout="position" initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING} className="rounded-2xl border border-line p-3.5" style={{ background: 'var(--surface2)' }}>
                    <div className="flex items-center gap-3"><span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--surface)', color: it.dir === 'in' ? '#2F9E6B' : 'var(--copper)' }}><KIco n={it.dir === 'in' ? 'arrowDown' : 'arrowUp'} s={18} /></span>
                      <div className="min-w-0 flex-1"><div className="font-semibold text-[13.5px] truncate">{it.name}</div><div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{fmtSize(it.size)} · {it.err ? it.err : it.pct >= 100 ? (it.dir === 'in' ? 'Received' : 'Sent') : it.dir === 'in' ? 'Receiving…' : it.pct ? 'Sending…' : 'Waiting in queue'}</div></div>
                      {it.dir === 'in' && it.blob && <Btn small primary icon="download" onClick={() => save(it.blob, it.name)}>Save</Btn>}
                    </div>
                    {it.pct < 100 && !it.err && <div className="mt-2.5"><Bar value={it.pct} label="" /></div>}
                  </motion.div>))}</AnimatePresence>
              </div>)}
          </div>
          {items.some((i) => i.dir === 'in' && i.done && i.size > 500e6) && <div className="text-[12px] mt-3" style={{ color: 'var(--muted)' }}>Very large files are held in memory until you save them.</div>}
        </Panel>
        <Panel delay={0.08}>
          <Label>Messages</Label>
          <div ref={endRef} className="h-[300px] overflow-auto space-y-2 pr-1">
            {!chat.length && <Empty icon="text" title="Say hello" sub="Paste links or notes — they travel the same private pipe." />}
            <AnimatePresence initial={false}>{chat.map((c, i) => <motion.div key={i} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING} className={`flex ${c.me ? 'justify-end' : 'justify-start'}`}><div dir="auto" className="rounded-2xl px-3.5 py-2 text-[13.5px] max-w-[85%] break-words whitespace-pre-wrap" style={{ background: c.me ? 'var(--ink)' : 'var(--surface2)', color: c.me ? 'var(--bg)' : 'var(--ink)' }}>{/^https?:\/\/\S+$/.test(c.t) ? <a href={c.t} target="_blank" rel="noreferrer" className="underline">{c.t}</a> : c.t}</div></motion.div>)}</AnimatePresence>
          </div>
          <div className="flex gap-2 mt-3"><input className="input flex-1" dir="auto" maxLength={MAX_BEAM_CHAT_CHARS} value={msg} placeholder={live ? 'Type a message' : 'Not connected'} disabled={!live} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && say()} /><Btn primary icon="send" disabled={!live || !msg.trim()} onClick={say}>Send</Btn></div>
        </Panel>
      </div>
    </div>
  )
}

export default function Beam() {
  const [role, setRole] = useState(null), [mode, setMode] = useState('auto'), [peer, setPeer] = useState(null), [code, setCode] = useState(''), [inp, setInp] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [state, setState] = useState('new')
  const [toast, toastNode] = useToast(), pr = useRef(null)
  useEffect(() => () => pr.current?.close(), [])
  const reset = () => { pr.current?.close(); pr.current = null; setPeer(null); setRole(null); setCode(''); setInp(''); setErr(''); setState('new'); setBusy(false) }
  const mk = () => { const p = new Peer(mode); pr.current = p; setPeer(p); p.on('state', setState); return p }
  const start = async (k) => {
    setRole(k); setErr('')
    if (k === 'host') { setBusy(true); try { setCode(await mk().host()) } catch (e) { setErr(e.message) } setBusy(false) }
  }
  const submitHost = async () => { setBusy(true); setErr(''); try { await peer.accept(inp) } catch (e) { setErr(e.message) } setBusy(false) }
  const submitJoin = async () => { setBusy(true); setErr(''); try { setCode(await mk().join(inp)) } catch (e) { setErr(e.message); pr.current?.close(); pr.current = null } setBusy(false) }
  if (peer && (state === 'connected' || state === 'lost' || state === 'closed') && role && (state !== 'closed' || peer.dc)) return <><Room peer={peer} onLeave={reset} toast={toast} />{toastNode}</>
  return (
    <div className="max-w-3xl mx-auto">
      <AnimatePresence mode="wait" initial={false}>
        {!role ? <motion.div key="c" exit={{ opacity: 0, y: -10 }}><Choose onPick={start} mode={mode} setMode={setMode} /></motion.div> : (
          <motion.div key={role} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
            <Panel>
              <div className="flex items-center justify-between mb-6"><span className="eyebrow">{role === 'host' ? 'Starting a beam' : 'Joining a beam'} · {mode === 'lan' ? 'Same Wi-Fi' : 'Anywhere'}</span><Btn small icon="x" onClick={reset}>Cancel</Btn></div>
              {role === 'host' ? (
                <>
                  <Step n={1} title="Send this invitation" done={!!code && !!inp} active={!!code || busy}>{busy && !code ? <div className="text-[13px]" style={{ color: 'var(--muted)' }}>Preparing a secure channel…</div> : code && <CodeOut code={code} label="Invitation code" hint="Send it over any chat app, email, or let the other person scan the QR." />}</Step>
                  <Step n={2} title="Paste the reply you get back" active={!!code} done={state === 'connecting'}><CodeIn value={inp} onChange={(v) => { setInp(v); setErr('') }} label="Reply code" submitLabel={state === 'connecting' ? 'Connecting…' : 'Connect'} busy={busy || state === 'connecting'} onSubmit={submitHost} error={err} />{state === 'connecting' && <div className="text-[12.5px] mt-3" style={{ color: 'var(--muted)' }}>Negotiating… this takes a few seconds. If it never connects, try “Same Wi-Fi only” on both devices.</div>}</Step>
                </>
              ) : (
                <>
                  <Step n={1} title="Paste the invitation" active done={!!code}><CodeIn value={inp} onChange={(v) => { setInp(v); setErr('') }} label="Invitation code" submitLabel="Create reply" busy={busy} onSubmit={submitJoin} error={err} /></Step>
                  <Step n={2} title="Send your reply back" active={!!code} done={state === 'connected'}>{code && <><CodeOut code={code} label="Reply code" hint="Give this to the person who invited you. They paste it and the beam opens on both screens." /><div className="flex items-center gap-2 mt-4 text-[13px] font-semibold" style={{ color: 'var(--copper)' }}><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }} className="inline-flex"><KIco n="refresh" s={16} /></motion.span>Waiting for the other device…</div></>}</Step>
                </>
              )}
              {state === 'failed' && <div className="text-[13px] font-semibold mt-2" style={{ color: '#C3423F' }}>The devices could not reach each other. Switch both to the same Wi-Fi, or check that a firewall is not blocking WebRTC.</div>}
            </Panel>
          </motion.div>)}
      </AnimatePresence>
      {toastNode}
    </div>
  )
}
