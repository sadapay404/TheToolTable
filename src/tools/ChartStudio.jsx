// Tool 20 — Chart & Data Studio. Drop a spreadsheet, get a chart that animates, and take it out as
// SVG (vector, editable), PNG or a printable sheet.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { recentAction, download, fmtBytes, baseName } from '../lib/utils.js'
import { parseDelimited, toTable, autoChart, buildSpec, CHART_TYPES, PALETTES, PALETTE_NAMES, fmtNum } from '../lib/chart.js'
import { Ico, Btn, Chips, Slider, Toggle, Panel, Label, Seg, Drop, Stat, Toast, useToast, SPRING } from './kit.jsx'

export default function ChartStudio() {
  const [table, setTable] = useState(null)
  const [source, setSource] = useState('')
  const [type, setType] = useState('bar')
  const [x, setX] = useState(0)
  const [series, setSeries] = useState([])
  const [palette, setPalette] = useState('copper')
  const [title, setTitle] = useState('')
  const [showGrid, setShowGrid] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [stack, setStack] = useState(false)
  const [view, setView] = useState('chart')
  const [busy, setBusy] = useState('')
  const [msg, toast] = useToast()
  const pickerRef = useRef(null)
  const svgRef = useRef(null)

  const load = useCallback(async (files) => {
    const f = files[0]
    if (!f) return
    setBusy('reading')
    try {
      let rows = []
      let name = f.name
      if (/\.(xlsx|xls|ods)$/i.test(f.name)) {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: true }).map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))))
        name += ` · ${wb.SheetNames[0]}`
      } else if (/\.json$/i.test(f.name)) {
        const data = JSON.parse(await f.text())
        const arr = Array.isArray(data) ? data : (Object.values(data).find((v) => Array.isArray(v)) || [])
        const keys = [...new Set(arr.flatMap((o) => (o && typeof o === 'object' ? Object.keys(o) : [])))]
        rows = [keys, ...arr.map((o) => keys.map((k) => (o?.[k] === undefined || o?.[k] === null ? '' : String(o[k]))))]
        name += ' · JSON'
      } else {
        rows = parseDelimited(await f.text())
      }
      if (rows.length < 2) throw new Error('not enough rows to chart')
      const t = toTable(rows, { header: /\.json$/i.test(f.name) ? false : true })
      const guess = autoChart(t)
      setTable(t); setSource(name); setTitle(baseName(f.name))
      setType(guess.type); setX(guess.x); setSeries(guess.series)
      setView('chart')
      recentAction(`Charted ${f.name} · ${t.rows.length} rows`)
      toast(`${t.rows.length} rows × ${t.headers.length} columns`)
    } catch (e) { toast(`Could not read that: ${e.message}`, 'err') }
    setBusy('')
  }, [toast])

  const spec = useMemo(() => (table ? buildSpec({ type, table, x, series, palette, stack, showGrid, showLabels, title }) : null), [table, type, x, series, palette, stack, showGrid, showLabels, title])

  const svgString = useCallback(() => {
    const el = svgRef.current
    if (!el) return ''
    const clone = el.cloneNode(true)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(spec.width))
    clone.setAttribute('height', String(spec.height))
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#ffffff')
    clone.insertBefore(bg, clone.firstChild)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone)
  }, [spec])

  const saveSvg = async () => {
    await download(new Blob([svgString()], { type: 'image/svg+xml' }), `${baseName(source || 'chart')}.svg`)
    recentAction('Exported a chart as SVG')
    toast('SVG saved — vector, editable')
  }
  const savePng = async () => {
    setBusy('rendering PNG')
    try {
      const svg = svgString()
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
      const scale = 2
      const cv = document.createElement('canvas')
      cv.width = spec.width * scale; cv.height = spec.height * scale
      const g = cv.getContext('2d')
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height)
      g.drawImage(img, 0, 0, cv.width, cv.height)
      URL.revokeObjectURL(url)
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
      await download(blob, `${baseName(source || 'chart')}.png`)
      toast(`PNG saved · ${spec.width * scale}×${spec.height * scale}`)
    } catch (e) { toast(`PNG failed: ${e.message}`, 'err') }
    setBusy('')
  }
  const saveCsv = async () => {
    const rows = [table.headers, ...table.rows]
    const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    await download(new Blob([body], { type: 'text/csv' }), `${baseName(source || 'data')}.csv`)
    toast('Data saved as CSV')
  }

  const numericCols = table ? table.numeric.map((n, i) => (n ? i : -1)).filter((i) => i >= 0) : []
  const catCols = table ? table.headers.map((_, i) => i) : []

  return (
    <div className="space-y-6">
      <input ref={pickerRef} type="file" hidden accept=".csv,.tsv,.txt,.json,.xlsx,.xls,.ods" onChange={(e) => { load([...e.target.files]); e.target.value = '' }} />
      {!table ? (
        <Panel>
          <Drop onFiles={load} accept=".csv,.tsv,.txt,.json,.xlsx,.xls,.ods" label="Drop a CSV, TSV, JSON or spreadsheet" sub="Parsed in this tab · nothing is uploaded" />
          <div className="grid sm:grid-cols-3 gap-3 mt-5">
            {[['chart', 'Six chart types', 'Bars, line, area, pie, donut and scatter — switch any time.'],
              ['palette', 'Your colours', 'Five palettes, and the preview animates as you change things.'],
              ['download', 'Real exports', 'Vector SVG, 2× PNG, or the cleaned-up data as CSV.']].map(([ic, t, d], i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.08 * i }} className="rounded-2xl border border-line p-4" style={{ background: 'var(--surface)' }}>
                <div className="w-9 h-9 rounded-xl grid place-items-center mb-2" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n={ic} s={18} /></div>
                <div className="font-bold text-[13px]">{t}</div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{d}</div>
              </motion.div>
            ))}
          </div>
        </Panel>
      ) : (
        <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_330px] items-start">
          <div className="space-y-4">
            <Panel pad={false} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-line">
                <input className="input !py-1.5 flex-1 min-w-[200px] display font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chart title" />
                <Seg value={view} onChange={setView} options={[['chart', 'Chart'], ['data', 'Data']]} small />
                <div className="flex gap-1.5">
                  <Btn small icon="download" onClick={saveSvg}>SVG</Btn>
                  <Btn small icon="image" disabled={!!busy} onClick={savePng}>PNG</Btn>
                  <Btn small icon="grid" onClick={saveCsv}>CSV</Btn>
                  <Btn small icon="plus" onClick={() => pickerRef.current?.click()} title="Another file" />
                </div>
              </div>
              {view === 'chart' ? (
                <div className="p-4 sm:p-6" style={{ background: 'var(--surface2)' }}>
                  <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', boxShadow: 'var(--shadow)' }}>
                    <svg ref={svgRef} viewBox={`0 0 ${spec.width} ${spec.height}`} className="w-full block" role="img" aria-label={title || 'chart'}>
                      {title && <text x={spec.width / 2} y={26} textAnchor="middle" fontSize="19" fontWeight="700" fill="#22201d">{title}</text>}
                      {/* grid + axis labels */}
                      {spec.grid?.map((v) => (
                        <g key={`g${v}`}>
                          <line x1={spec.plot.x} x2={spec.plot.x + spec.plot.w} y1={spec.y.at(v)} y2={spec.y.at(v)} stroke="#eceae6" strokeWidth="1" />
                          <text x={spec.plot.x - 10} y={spec.y.at(v) + 4} textAnchor="end" fontSize="11.5" fill="#8d857a">{fmtNum(v)}</text>
                        </g>
                      ))}
                      {spec.type !== 'pie' && spec.type !== 'donut' && <>
                        <line x1={spec.plot.x} x2={spec.plot.x} y1={spec.plot.y} y2={spec.plot.y + spec.plot.h} stroke="#d8d4cd" strokeWidth="1.2" />
                        <line x1={spec.plot.x} x2={spec.plot.x + spec.plot.w} y1={spec.plot.y + spec.plot.h} y2={spec.plot.y + spec.plot.h} stroke="#d8d4cd" strokeWidth="1.2" />
                      </>}
                      {/* bars */}
                      {spec.bars?.map((b, i) => (
                        <motion.rect key={`b${i}`} initial={{ y: spec.y.at(0), height: 0, opacity: 0 }} animate={{ y: b.y, height: Math.max(0, b.h), opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 160, damping: 22, delay: Math.min(i * 0.012, 0.5) }} x={b.x} width={b.w} rx={Math.min(4, b.w / 3)} fill={b.color}>
                          <title>{`${b.label} · ${b.name}: ${fmtNum(b.v)}`}</title>
                        </motion.rect>
                      ))}
                      {/* lines & areas */}
                      {spec.lines?.map((l) => (
                        <g key={`l${l.si}`}>
                          {l.area && <motion.path d={l.area} fill={l.color} opacity={0.16} initial={{ opacity: 0 }} animate={{ opacity: 0.16 }} transition={{ delay: 0.25 }} />}
                          <motion.path d={l.path} fill="none" stroke={l.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
                          {spec.type === 'scatter' && l.pts.map((p, i) => (
                            <motion.circle key={i} cx={p[0]} cy={p[1]} r={5} fill={l.color} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...SPRING, delay: Math.min(i * 0.02, 0.6) }} style={{ transformOrigin: `${p[0]}px ${p[1]}px` }}>
                              <title>{`${p[3]}: ${fmtNum(p[2])}`}</title>
                            </motion.circle>
                          ))}
                        </g>
                      ))}
                      {/* pie / donut */}
                      {spec.arcs?.map((a, i) => (
                        <motion.path key={`a${i}`} d={a.path} fill={a.color} stroke="#fff" strokeWidth="2" style={{ transformOrigin: 'center' }}
                          initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: i * 0.05 }}>
                          <title>{`${a.label}: ${fmtNum(a.v)} (${a.pct.toFixed(1)}%)`}</title>
                        </motion.path>
                      ))}
                      {/* x labels — thinned out when there are many */}
                      {spec.type !== 'pie' && spec.type !== 'donut' && spec.x.labels.map((l, i) => {
                        const every = Math.ceil(spec.x.labels.length / 18)
                        if (i % every) return null
                        return <text key={`x${i}`} x={spec.x.at(i)} y={spec.plot.y + spec.plot.h + 20} textAnchor="middle" fontSize="11.5" fill="#8d857a">{String(l).slice(0, 14)}</text>
                      })}
                      {/* legend */}
                      {spec.series.length > 1 && spec.legend !== undefined && null}
                      {(spec.series.length > 1 || spec.legend) && (
                        <g>
                          {(spec.legend || spec.series).slice(0, 8).map((s, i) => (
                            <g key={`k${i}`} transform={`translate(${spec.plot.x + i * Math.min(150, spec.plot.w / Math.max(1, Math.min(8, (spec.legend || spec.series).length)))},${spec.height - 16})`}>
                              <rect width="10" height="10" rx="2" fill={s.color} />
                              <text x="15" y="9.5" fontSize="11.5" fill="#6f675e">{String(s.name).slice(0, 16)}</text>
                            </g>
                          ))}
                        </g>
                      )}
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-auto">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0" style={{ background: 'var(--surface2)' }}>
                      <tr>{table.headers.map((h, i) => <th key={i} className="text-left px-3 py-2 font-bold" style={{ color: table.numeric[i] ? 'var(--copper)' : 'var(--ink)' }}>{h}{table.numeric[i] ? ' #' : ''}</th>)}</tr>
                    </thead>
                    <tbody>
                      {table.rows.slice(0, 300).map((r, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          {r.map((c, j) => <td key={j} className="px-3 py-1.5 mono" style={{ color: table.numeric[j] ? 'var(--muted)' : 'var(--ink)' }}>{String(c).slice(0, 40)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {table.rows.length > 300 && <div className="p-3 text-[11.5px] text-center" style={{ color: 'var(--muted)' }}>Showing the first 300 of {table.rows.length} rows — exports always use all of them.</div>}
                </div>
              )}
            </Panel>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat k="Rows" v={table.rows.length} />
              <Stat k="Columns" v={table.headers.length} />
              <Stat k="Numeric" v={numericCols.length} />
              <Stat k="Source" v={fmtBytes(source.length * 2)} />
            </div>
          </div>

          <div className="space-y-4">
            <Panel>
              <Label right={<span className="text-[11.5px] truncate max-w-[140px]" style={{ color: 'var(--muted)' }}>{source}</span>}>Chart</Label>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {CHART_TYPES.map(([id, name]) => {
                  const on = type === id
                  return (
                    <motion.button key={id} whileHover={{ y: -3 }} whileTap={{ scale: 0.95 }} onClick={() => setType(id)}
                      className="rounded-xl border py-2.5 flex flex-col items-center gap-1" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: on ? 'var(--surface2)' : 'var(--surface)', color: on ? 'var(--copper)' : 'var(--muted)' }}>
                      <Ico n={id === 'pie' || id === 'donut' ? 'pie' : id === 'line' || id === 'area' || id === 'scatter' ? 'line' : 'chart'} s={16} />
                      <span className="text-[10.5px] font-bold">{name}</span>
                    </motion.button>
                  )
                })}
              </div>

              <div className="space-y-3">
                <div><span className="label mb-1.5 block">Labels come from</span>
                  <Chips value={x} onChange={setX} options={catCols.slice(0, 10).map((i) => [i, table.headers[i].slice(0, 14)])} /></div>
                <div><span className="label mb-1.5 block">Values</span>
                  <Chips value={null} onChange={(c) => setSeries((s) => (s.includes(c) ? (s.length > 1 ? s.filter((v) => v !== c) : s) : [...s, c].sort((a, b) => a - b)))} options={(numericCols.length ? numericCols : catCols).slice(0, 10).map((i) => [i, table.headers[i].slice(0, 14)])} />
                  <div className="text-[11px] mt-1.5" style={{ color: 'var(--muted)' }}>{series.length} shown — tap to add or remove</div>
                </div>
                <div><span className="label mb-1.5 block">Palette</span>
                  <Chips value={palette} onChange={setPalette} options={PALETTE_NAMES.map((p) => [p, p])} />
                  <div className="flex gap-1 mt-2">
                    {PALETTES[palette].map((c) => <motion.span key={c} layout className="h-4 flex-1 rounded-full" style={{ background: c }} />)}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel delay={0.05}>
              <Label>Options</Label>
              <div className="space-y-1">
                <Toggle on={showGrid} onChange={setShowGrid} label="Gridlines" />
                <Toggle on={showLabels} onChange={setShowLabels} label="Axis labels" />
                {(type === 'bar' || type === 'area') && <Toggle on={stack} onChange={setStack} label="Stack the series" hint="Adds each series on top of the last." />}
              </div>
            </Panel>
            <Panel delay={0.08}>
              <Label>Exports</Label>
              <div className="space-y-2">
                <Btn icon="download" className="w-full" onClick={saveSvg}>SVG · vector</Btn>
                <Btn icon="image" className="w-full" disabled={!!busy} busy={busy === 'rendering PNG'} onClick={savePng}>PNG · 2× ({spec.width * 2}×{spec.height * 2})</Btn>
                <Btn icon="grid" className="w-full" onClick={saveCsv}>Data as CSV</Btn>
              </div>
            </Panel>
          </div>
        </div>
      )}
      <Toast msg={msg} />
    </div>
  )
}
