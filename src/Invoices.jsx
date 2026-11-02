import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const MONTHS_ORDER = [
  'Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος',
  'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος',
  'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'
]

function fmt(n) {
  if (n == null || n === '') return '—'
  return Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2 })
}
function fmtSign(n) {
  if (n == null) return '—'
  const v = Number(n)
  return (v >= 0 ? '+' : '') + v.toLocaleString('el-GR', { minimumFractionDigits: 2 })
}

// ── Autocomplete ──────────────────────────────────────────────────
function Autocomplete({ value, onChange, options, placeholder, className, inputRef }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value || '')
  const ref = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const filtered = useMemo(() => {
    if (!query) return options.slice(0, 12)
    return options.filter(o => o.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
  }, [query, options])

  return (
    <div ref={ref} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className={className}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-slate-700 border border-slate-500 rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {filtered.map(opt => (
            <div
              key={opt}
              onMouseDown={e => { e.preventDefault(); onChange(opt); setQuery(opt); setOpen(false) }}
              className="px-3 py-2 text-sm text-white hover:bg-blue-600 cursor-pointer"
            >{opt}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Stats ─────────────────────────────────────────────────────────
function StatsTab({ rows }) {
  const [statMonth, setStatMonth] = useState('')

  const months = useMemo(() => {
    const seen = new Map()
    rows.forEach(r => { if (r.month_sort) seen.set(r.month_sort, r.month) })
    return Array.from(seen.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows])

  const data = useMemo(() =>
    statMonth ? rows.filter(r => r.month_sort === statMonth) : rows
  , [rows, statMonth])

  const totals = useMemo(() => ({
    charge:  data.reduce((s, r) => s + (r.charge  || 0), 0),
    freight: data.reduce((s, r) => s + (r.freight || 0), 0),
    count:   data.length,
  }), [data])

  const diff = totals.charge - totals.freight
  const pct  = totals.charge ? ((diff / totals.charge) * 100).toFixed(1) : 0

  const byClient = useMemo(() => {
    const map = {}
    data.forEach(r => {
      const k = r.client || '—'
      if (!map[k]) map[k] = { charge: 0, freight: 0, count: 0 }
      map[k].charge  += r.charge  || 0
      map[k].freight += r.freight || 0
      map[k].count++
    })
    return Object.entries(map).sort((a, b) => b[1].charge - a[1].charge)
  }, [data])

  const byTruck = useMemo(() => {
    const map = {}
    data.forEach(r => {
      const k = r.truck || '—'
      if (!map[k]) map[k] = { charge: 0, freight: 0, count: 0 }
      map[k].charge  += r.charge  || 0
      map[k].freight += r.freight || 0
      map[k].count++
    })
    return Object.entries(map).sort((a, b) => b[1].charge - a[1].charge)
  }, [data])

  const byMonth = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      const k = r.month_sort || '—'
      if (!map[k]) map[k] = { label: r.month || k, charge: 0, freight: 0, count: 0 }
      map[k].charge  += r.charge  || 0
      map[k].freight += r.freight || 0
      map[k].count++
    })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows])

  const maxCharge = byMonth.length ? Math.max(...byMonth.map(([, v]) => v.charge)) : 1

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <select
          value={statMonth}
          onChange={e => setStatMonth(e.target.value)}
          className="bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">Όλοι οι μήνες</option>
          {months.map(([sort, label]) => <option key={sort} value={sort}>{label}</option>)}
        </select>
        <span className="text-slate-500 text-sm">{data.length} εγγραφές</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Χρέωση', value: fmt(totals.charge), color: 'text-white', sub: 'ευρώ' },
          { label: 'Φορτωτικές', value: fmt(totals.freight), color: 'text-blue-300', sub: 'ευρώ' },
          { label: 'Διαφορά', value: fmtSign(diff), color: diff >= 0 ? 'text-green-400' : 'text-red-400', sub: `${pct}% margin` },
          { label: 'Παραστατικά', value: totals.count, color: 'text-white', sub: 'εγγραφές' },
        ].map(c => (
          <div key={c.label} className="bg-slate-800 border border-slate-600 rounded-2xl px-4 py-3">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">{c.label}</p>
            <p className={`text-xl font-bold font-mono ${c.color}`}>{c.value}</p>
            <p className="text-slate-500 text-xs mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { title: 'Ανά Πελάτη', data: byClient, keyLabel: 'Πελάτης', mono: false },
          { title: 'Ανά Φορτηγό', data: byTruck, keyLabel: 'Πινακίδα', mono: true },
        ].map(({ title, data: tdata, keyLabel, mono }) => (
          <div key={title} className="bg-slate-800 border border-slate-600 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="text-white font-semibold text-sm">{title}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="px-3 py-2 text-left">{keyLabel}</th>
                    <th className="px-3 py-2 text-right">Χρέωση</th>
                    <th className="px-3 py-2 text-right">Φορτ/κές</th>
                    <th className="px-3 py-2 text-right w-10">Τμχ</th>
                  </tr>
                </thead>
                <tbody>
                  {tdata.map(([name, v]) => (
                    <tr key={name} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                      <td className={`px-3 py-1.5 text-white font-medium truncate max-w-[130px] ${mono ? 'font-mono text-xs' : ''}`}>{name}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-white">{fmt(v.charge)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-blue-300">{fmt(v.freight)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-400">{v.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {!statMonth && (
        <div className="bg-slate-800 border border-slate-600 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h3 className="text-white font-semibold text-sm">Εξέλιξη ανά Μήνα</h3>
          </div>
          <div className="p-4 space-y-2">
            {byMonth.map(([sort, v]) => (
              <div key={sort} className="flex items-center gap-3">
                <span className="text-slate-400 text-xs w-28 shrink-0">{v.label}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 bg-slate-700 rounded-full h-4 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${maxCharge ? (v.charge / maxCharge) * 100 : 0}%` }} />
                  </div>
                  <span className="text-white font-mono text-xs w-24 text-right shrink-0">{fmt(v.charge)}</span>
                </div>
                <span className="text-slate-500 text-xs w-8 text-right shrink-0">{v.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* YoY Σύγκριση */}
      <YoYComparison rows={rows} />
    </div>
  )
}

function YoYComparison({ rows }) {
  // Χτίζουμε δεδομένα ανά έτος+μήνα
  const byYearMonth = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      if (!r.month_sort) return
      const [year, mo] = r.month_sort.split('-')
      if (!year || !mo) return
      const moInt = parseInt(mo)
      if (!map[year]) map[year] = {}
      if (!map[year][moInt]) map[year][moInt] = { charge: 0, count: 0 }
      map[year][moInt].charge += r.charge || 0
      map[year][moInt].count++
    })
    return map
  }, [rows])

  const years = Object.keys(byYearMonth).sort().reverse()
  if (years.length < 2) return null

  const MONTH_LABELS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']
  const [yearA, yearB] = years // yearA = πιο πρόσφατο

  const maxVal = Math.max(
    ...Object.values(byYearMonth[yearA] || {}).map(v => v.charge),
    ...Object.values(byYearMonth[yearB] || {}).map(v => v.charge),
    1
  )

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-3">
        <h3 className="text-white font-semibold text-sm">Σύγκριση Ετών</h3>
        <div className="flex items-center gap-3 text-xs ml-auto">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"/> {yearA}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-500 inline-block"/> {yearB}</span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => {
          const vA = byYearMonth[yearA]?.[mo]
          const vB = byYearMonth[yearB]?.[mo]
          if (!vA && !vB) return null
          const pctA = vA ? (vA.charge / maxVal) * 100 : 0
          const pctB = vB ? (vB.charge / maxVal) * 100 : 0
          const diff = vA && vB ? ((vA.charge - vB.charge) / vB.charge * 100) : null
          return (
            <div key={mo} className="flex items-center gap-2">
              <span className="text-slate-400 text-xs w-8 shrink-0">{MONTH_LABELS[mo-1]}</span>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-1">
                  <div className="flex-1 bg-slate-700 rounded-full h-2.5 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pctA}%` }} />
                  </div>
                  <span className="text-white font-mono text-xs w-20 text-right shrink-0">{vA ? fmt(vA.charge) : '—'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex-1 bg-slate-700 rounded-full h-2.5 overflow-hidden">
                    <div className="h-full bg-slate-500 rounded-full" style={{ width: `${pctB}%` }} />
                  </div>
                  <span className="text-slate-400 font-mono text-xs w-20 text-right shrink-0">{vB ? fmt(vB.charge) : '—'}</span>
                </div>
              </div>
              {diff !== null && (
                <span className={`text-xs font-mono w-14 text-right shrink-0 ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                </span>
              )}
            </div>
          )
        }).filter(Boolean)}
      </div>
    </div>
  )
}

// ── Export to Excel ───────────────────────────────────────────────
async function exportToExcel(rows, docType) {
  const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs')
  const data = [
    ['Αρ.', 'Μήνας', 'Πελάτης', 'Πινακίδα', 'Χρέωση', 'Φορτωτικές', 'Διαφορά', 'Σημείωση', 'Παρ.'],
    ...rows.map(r => [
      r.doc_num, r.month, r.client, r.truck,
      r.charge, r.freight,
      (r.charge || 0) - (r.freight || 0),
      r.note, r.order_num
    ])
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, docType)
  XLSX.writeFile(wb, `Παραστατικά_${docType}_${new Date().toISOString().slice(0,10)}.xlsx`)
}

// ── Main ──────────────────────────────────────────────────────────
export default function Invoices() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [docType, setDocType]     = useState('ΤΠΥ')
  const [activeTab, setActiveTab] = useState('list')

  // φίλτρα λίστας
  const [selectedMonth, setSelectedMonth] = useState('')
  const [searchClient, setSearchClient]   = useState('')
  const [searchTruck, setSearchTruck]     = useState('')
  const [searchDoc, setSearchDoc]         = useState('')

  // autocomplete options
  const [clientOptions, setClientOptions] = useState([])
  const [truckOptions, setTruckOptions]   = useState([])

  // import
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importing, setImporting]   = useState(false)
  const [importDone, setImportDone] = useState(null)

  // modal
  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow]   = useState(null)
  const [form, setForm]         = useState({})
  const [saving, setSaving]     = useState(false)
  const firstFieldRef = useRef(null)

  async function loadAll() {
    setLoading(true)
    const [{ data: inv }, { data: clients }, { data: trucks }] = await Promise.all([
      supabase.from('invoices').select('*').order('month_sort', { ascending: false }).order('doc_num', { ascending: true }),
      supabase.from('clients').select('name').order('name'),
      supabase.from('trucks').select('plate').order('plate'),
    ])
    const invRows = inv || []
    setRows(invRows)
    setClientOptions((clients || []).map(c => c.name).filter(Boolean))
    setTruckOptions((trucks || []).map(t => t.plate).filter(Boolean))
    setLoading(false)
    // Auto-open από παραγγελία
    if (searchParams.get('new_invoice') === '1') {
      const orderNum = searchParams.get('order_num')
      const client   = searchParams.get('client') || ''
      const truck    = searchParams.get('truck')  || ''
      const now = new Date()
      const mIdx = now.getMonth()
      const year = now.getFullYear()
      const monthSort  = `${year}-${String(mIdx + 1).padStart(2, '0')}`
      const monthLabel = `${MONTHS_ORDER[mIdx]} ${year}`
      const maxDoc = invRows.filter(r => (r.type || 'ΤΠΥ') === 'ΤΠΥ').reduce((m, r) => Math.max(m, r.doc_num || 0), 0)
      setForm({
        doc_num: maxDoc + 1, month: monthLabel, month_sort: monthSort,
        type: 'ΤΠΥ', client, truck,
        charge: '', freight: '', note: '',
        order_num: orderNum ? parseInt(orderNum) : '',
      })
      setEditRow(null)
      setEditOpen(true)
      setSearchParams({})
    }
  }

  useEffect(() => { loadAll() }, [])

  // focus πρώτο πεδίο όταν ανοίγει modal
  useEffect(() => {
    if (editOpen) setTimeout(() => firstFieldRef.current?.focus(), 50)
  }, [editOpen])

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (!editOpen) return
      if (e.key === 'Escape') setEditOpen(false)
      if ((e.key === 'Enter') && (e.ctrlKey || e.metaKey)) handleSave(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editOpen, form])

  const months = useMemo(() => {
    const seen = new Map()
    rows.filter(r => (r.type || 'ΤΠΥ') === docType).forEach(r => {
      if (r.month_sort) seen.set(r.month_sort, r.month)
    })
    return Array.from(seen.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows, docType])

  const filtered = useMemo(() => rows.filter(r => {
    if ((r.type || 'ΤΠΥ') !== docType) return false
    if (selectedMonth && r.month_sort !== selectedMonth) return false
    if (searchClient && !(r.client || '').toLowerCase().includes(searchClient.toLowerCase())) return false
    if (searchTruck  && !(r.truck  || '').toLowerCase().includes(searchTruck.toLowerCase()))  return false
    if (searchDoc    && !String(r.doc_num || '').includes(searchDoc)) return false
    return true
  }), [rows, docType, selectedMonth, searchClient, searchTruck, searchDoc])

  // ομαδοποίηση ανά μήνα
  const grouped = useMemo(() => {
    const map = new Map()
    filtered.forEach(r => {
      const k = r.month_sort || '—'
      if (!map.has(k)) map.set(k, { label: r.month || k, rows: [] })
      map.get(k).rows.push(r)
    })
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  const totals = useMemo(() => ({
    charge:  filtered.reduce((s, r) => s + (r.charge  || 0), 0),
    freight: filtered.reduce((s, r) => s + (r.freight || 0), 0),
    count:   filtered.length,
  }), [filtered])

  // ── Soft Delete (undo toast) ──────────────────────────────────
  const [pendingDelete, setPendingDelete] = useState(null) // { id, row, timer }

  async function handleDelete(id) {
    const row = rows.find(r => r.id === id)
    if (!row) return
    // Αφαίρεσε αμέσως από UI
    setRows(prev => prev.filter(r => r.id !== id))
    // Timer 5 δευτ. → πραγματική διαγραφή
    const timer = setTimeout(async () => {
      await supabase.from('invoices').delete().eq('id', id)
      setPendingDelete(null)
    }, 5000)
    setPendingDelete({ id, row, timer })
  }

  function undoDelete() {
    if (!pendingDelete) return
    clearTimeout(pendingDelete.timer)
    setRows(prev => {
      const next = [...prev, pendingDelete.row]
      next.sort((a, b) => (b.month_sort || '').localeCompare(a.month_sort || '') || (a.doc_num || 0) - (b.doc_num || 0))
      return next
    })
    setPendingDelete(null)
  }

  // ── Import ────────────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImportDone(null)

    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs')
    const buf  = await file.arrayBuffer()
    const wb   = XLSX.read(buf, { type: 'array' })

    const allParsed = []
    for (const sheetName of wb.SheetNames) {
      const ws   = wb.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 })

      const monthMatch = sheetName.match(/(Ιανουάριος|Φεβρουάριος|Μάρτιος|Απρίλιος|Μάιος|Ιούνιος|Ιούλιος|Αύγουστος|Σεπτέμβριος|Οκτώβριος|Νοέμβριος|Δεκέμβριος)\s+(\d{4})/i)
      let month = sheetName, monthSort = ''
      if (monthMatch) {
        const mIdx = MONTHS_ORDER.findIndex(m => m.toLowerCase() === monthMatch[1].toLowerCase())
        monthSort = `${monthMatch[2]}-${String(mIdx + 1).padStart(2, '0')}`
      }

      const sheetUpper   = sheetName.toUpperCase()
      const detectedType = sheetUpper.includes('INV') ? 'INV' : 'ΤΠΥ'

      for (const row of data) {
        if (!row[0] || typeof row[0] !== 'number') continue
        const docNum = Math.round(row[0])
        if (docNum <= 0) continue
        allParsed.push({
          doc_num:    docNum,
          month,
          month_sort: monthSort,
          type:       detectedType,
          client:     row[1] ? String(row[1]).trim() : null,
          truck:      row[2] ? String(row[2]).trim() : null,
          charge:     typeof row[3] === 'number' ? row[3] : null,
          freight:    typeof row[4] === 'number' ? row[4] : null,
          note:       row[5] ? String(row[5]).trim() : null,
        })
      }
    }
    setImportRows(allParsed)
  }

  async function handleDeleteMonth() {
    if (!importRows.length) return
    const ms = importRows[0].month_sort
    if (!ms) return
    if (!window.confirm(`Διαγραφή ΟΛΩΝ των εγγραφών του ${importRows[0].month};\nΘα ξαναμπούν με το Import.`)) return
    setImporting(true)
    await supabase.from('invoices').delete().eq('month_sort', ms)
    setImporting(false)
    setImportDone(null)
    loadAll()
  }

  async function handleImportConfirm() {
    if (!importRows.length) return
    setImporting(true)

    // ομαδοποίηση ανά month_sort+type για dedup
    const groups = {}
    importRows.forEach(r => {
      const k = `${r.month_sort}|${r.type}`
      if (!groups[k]) groups[k] = []
      groups[k].push(r)
    })

    let inserted = 0, skipped = 0
    for (const [key, grows] of Object.entries(groups)) {
      const [ms, tp] = key.split('|')
      const { data: existing } = await supabase.from('invoices').select('doc_num').eq('month_sort', ms).eq('type', tp)
      const existingSet = new Set((existing || []).map(r => r.doc_num))
      for (const row of grows) {
        if (existingSet.has(row.doc_num)) { skipped++; continue }
        const { error } = await supabase.from('invoices').insert([row])
        if (error) skipped++
        else { inserted++; existingSet.add(row.doc_num) }
      }
    }
    setImporting(false)
    setImportDone({ inserted, skipped })
    loadAll()
  }

  // ── Modal ─────────────────────────────────────────────────────
  function openAdd() {
    const typeRows = rows.filter(r => (r.type || 'ΤΠΥ') === docType)
    const maxDoc   = typeRows.reduce((m, r) => Math.max(m, r.doc_num || 0), 0)

    const now  = new Date()
    const mIdx = now.getMonth()
    const year = now.getFullYear()
    const monthSort  = `${year}-${String(mIdx + 1).padStart(2, '0')}`
    const monthLabel = `${MONTHS_ORDER[mIdx]} ${year}`

    setEditRow(null)
    setForm({ doc_num: maxDoc + 1, month: monthLabel, month_sort: monthSort, type: docType, client: '', truck: '', charge: '', freight: '', note: '', order_num: '' })
    setEditOpen(true)
  }

  function openEdit(r) {
    setEditRow(r)
    setForm({ ...r })
    setEditOpen(true)
  }

  const handleSave = useCallback(async (andNew = false) => {
    setSaving(true)
    const payload = {
      doc_num:    parseInt(form.doc_num)  || 0,
      month:      form.month,
      month_sort: form.month_sort,
      type:       form.type || 'ΤΠΥ',
      client:     form.client  || null,
      truck:      form.truck   || null,
      charge:     form.charge  !== '' && form.charge  != null ? parseFloat(form.charge)  : null,
      freight:    form.freight !== '' && form.freight != null ? parseFloat(form.freight) : null,
      note:       form.note    || null,
      order_num:  form.order_num ? parseInt(form.order_num) : null,
    }
    if (editRow) {
      await supabase.from('invoices').update(payload).eq('id', editRow.id)
    } else {
      await supabase.from('invoices').insert([payload])
    }
    setSaving(false)
    if (andNew) {
      const typeRows = rows.filter(r => (r.type || 'ΤΠΥ') === docType)
      const maxDoc   = Math.max(...typeRows.map(r => r.doc_num || 0), payload.doc_num)
      setEditRow(null)
      setForm(f => ({ ...f, doc_num: maxDoc + 1, client: '', charge: '', freight: '', note: '', order_num: '' }))
      // truck & month μένουν — χρήσιμο για ίδιο φορτηγό ή ίδιο πελάτη
      loadAll()
    } else {
      setEditOpen(false)
      loadAll()
    }
  }, [form, editRow, rows, docType])


  const clearFilters = () => { setSelectedMonth(''); setSearchClient(''); setSearchTruck(''); setSearchDoc('') }
  const hasFilters   = selectedMonth || searchClient || searchTruck || searchDoc

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-white text-2xl font-bold">📄 Παραστατικά</h1>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={() => exportToExcel(filtered, docType)}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm transition-colors"
            title="Εξαγωγή σε Excel"
          >📤 Excel</button>
          <button
            onClick={() => { setImportOpen(true); setImportRows([]); setImportDone(null) }}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm transition-colors"
          >📥 Import</button>
          <button
            onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          >+ Νέο</button>
        </div>
      </div>

      {/* Undo toast */}
      {pendingDelete && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-700 border border-slate-500 rounded-2xl px-5 py-3 flex items-center gap-4 shadow-xl">
          <span className="text-white text-sm">🗑️ Διαγράφηκε #{pendingDelete.row.doc_num}</span>
          <button onClick={undoDelete} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1 rounded-xl font-semibold transition-colors">↩ Αναίρεση</button>
        </div>
      )}

      {/* ΤΠΥ / INV + tabs σε μία γραμμή */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
          {['ΤΠΥ', 'INV'].map(t => (
            <button key={t}
              onClick={() => { setDocType(t); clearFilters() }}
              className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-colors ${docType === t ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >{t}</button>
          ))}
        </div>
        <div className="w-px h-6 bg-slate-700" />
        <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
          {[['list', '📋 Λίστα'], ['stats', '📊 Στατιστικά']].map(([id, label]) => (
            <button key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* ── Stats ── */}
      {activeTab === 'stats' ? (
        <StatsTab rows={rows.filter(r => (r.type || 'ΤΠΥ') === docType)} />
      ) : (
        <>
          {/* Φίλτρα */}
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">Όλοι οι μήνες</option>
              {months.map(([sort, label]) => <option key={sort} value={sort}>{label}</option>)}
            </select>
            <input type="text" placeholder="🔍 Πελάτης" value={searchClient}
              onChange={e => setSearchClient(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-40"
            />
            <input type="text" placeholder="🔍 Πινακίδα" value={searchTruck}
              onChange={e => setSearchTruck(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-32"
            />
            <input type="text" placeholder="🔍 Αρ." value={searchDoc}
              onChange={e => setSearchDoc(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-24 font-mono"
            />
            {hasFilters && (
              <button onClick={clearFilters} className="text-slate-500 hover:text-white text-lg leading-none px-1" title="Καθαρισμός φίλτρων">⊗</button>
            )}
            <span className="text-slate-500 text-sm ml-auto">{totals.count} εγγραφές</span>
          </div>

          {/* Πίνακας ομαδοποιημένος ανά μήνα */}
          {loading ? (
            <p className="text-slate-400 text-center py-12">Φόρτωση...</p>
          ) : filtered.length === 0 ? (
            <p className="text-slate-500 text-center py-12">Δεν βρέθηκαν εγγραφές</p>
          ) : (
            <div className="space-y-3">
              {grouped.map(([sort, group]) => {
                const gCharge  = group.rows.reduce((s, r) => s + (r.charge  || 0), 0)
                const gFreight = group.rows.reduce((s, r) => s + (r.freight || 0), 0)
                const gDiff    = gCharge - gFreight
                return (
                  <div key={sort} className="rounded-xl overflow-hidden border border-slate-600">
                    {/* Month header */}
                    <div className="bg-slate-700/80 px-4 py-2 flex items-center justify-between">
                      <span className="text-white font-semibold text-sm">{group.label}</span>
                      <div className="flex gap-4 text-xs font-mono">
                        <span className="text-slate-300">{fmt(gCharge)}</span>
                        <span className="text-blue-300">{fmt(gFreight)}</span>
                        <span className={gDiff >= 0 ? 'text-green-400' : 'text-red-400'}>{fmtSign(gDiff)}</span>
                        <span className="text-slate-500">{group.rows.length} τμχ</span>
                      </div>
                    </div>
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                          <th className="px-3 py-2 text-left border-r border-slate-700 w-16">Αρ.</th>
                          <th className="px-3 py-2 text-left border-r border-slate-700">Πελάτης</th>
                          <th className="px-3 py-2 text-left border-r border-slate-700 w-24">Πινακίδα</th>
                          <th className="px-3 py-2 text-right border-r border-slate-700 w-28">Χρέωση</th>
                          <th className="px-3 py-2 text-right border-r border-slate-700 w-28">Φορτωτικές</th>
                          <th className="px-3 py-2 text-right border-r border-slate-700 w-24">Διαφορά</th>
                          {group.rows.some(r => r.order_num) && (
                            <th className="px-3 py-2 text-left border-r border-slate-700 w-16">Παρ.</th>
                          )}
                          <th className="px-3 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((r, i) => {
                          const diff = (r.charge || 0) - (r.freight || 0)
                          const isLoss = r.charge != null && r.freight != null && diff < 0
                          return (
                            <tr
                              key={r.id}
                              onClick={() => openEdit(r)}
                              className={`border-t border-slate-700/60 cursor-pointer transition-colors hover:bg-blue-900/20
                                ${isLoss ? 'bg-red-900/10' : i % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-800/70'}`}
                            >
                              <td className="px-3 py-2 border-r border-slate-700/50 font-mono text-slate-300 text-xs">{r.doc_num}</td>
                              <td className="px-3 py-2 border-r border-slate-700/50 text-white font-medium">{r.client || '—'}</td>
                              <td className="px-3 py-2 border-r border-slate-700/50 font-mono text-slate-300 text-xs">{r.truck || '—'}</td>
                              <td className="px-3 py-2 border-r border-slate-700/50 text-right font-mono text-white">{fmt(r.charge)}</td>
                              <td className="px-3 py-2 border-r border-slate-700/50 text-right font-mono text-blue-300">{fmt(r.freight)}</td>
                              <td className={`px-3 py-2 border-r border-slate-700/50 text-right font-mono text-xs ${diff < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {r.charge != null && r.freight != null ? fmtSign(diff) : '—'}
                              </td>
                              {group.rows.some(rr => rr.order_num) && (
                                <td className="px-3 py-2 border-r border-slate-700/50 font-mono text-slate-400 text-xs">
                                  {r.order_num ? `#${r.order_num}` : ''}
                                </td>
                              )}
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={e => { e.stopPropagation(); handleDelete(r.id) }}
                                  className="text-slate-600 hover:text-red-400 text-xs transition-colors"
                                >✕</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}

              {/* Grand total */}
              {grouped.length > 1 && (
                <div className="bg-slate-700/40 border border-slate-600 rounded-xl px-4 py-2.5 flex items-center justify-between">
                  <span className="text-slate-300 text-sm font-semibold">Σύνολο ({totals.count})</span>
                  <div className="flex gap-4 text-sm font-mono">
                    <span className="text-white">{fmt(totals.charge)}</span>
                    <span className="text-blue-300">{fmt(totals.freight)}</span>
                    <span className={totals.charge - totals.freight >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {fmtSign(totals.charge - totals.freight)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Import Modal ── */}
      {importOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white text-lg font-bold">📥 Import Excel</h2>
              <button onClick={() => setImportOpen(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <p className="text-slate-400 text-xs">Διαβάζει όλα τα φύλλα — φύλλο με "INV" → τύπος INV, υπόλοιπα → ΤΠΥ</p>
            <input type="file" accept=".xlsx,.xls" onChange={handleFileChange}
              className="w-full text-slate-300 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-600 file:text-white file:text-sm hover:file:bg-slate-500"
            />
            {importRows.length > 0 && !importDone && (
              <div className="bg-slate-700/50 rounded-xl p-3 space-y-2">
                {/* ομαδοποίηση preview ανά τύπο */}
                {['ΤΠΥ', 'INV'].map(t => {
                  const trows = importRows.filter(r => r.type === t)
                  if (!trows.length) return null
                  return (
                    <div key={t}>
                      <p className="text-white text-sm font-semibold">{t} — {trows[0].month} <span className="text-slate-400 font-normal">({trows.length} εγγραφές)</span></p>
                      <div className="mt-1 space-y-0.5">
                        {trows.slice(0, 3).map((r, i) => (
                          <p key={i} className="text-slate-400 text-xs font-mono">#{r.doc_num} {r.client} {r.truck}</p>
                        ))}
                        {trows.length > 3 && <p className="text-slate-500 text-xs">...και {trows.length - 3} ακόμα</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {importDone && (
              <div className="bg-green-900/30 border border-green-600/50 rounded-xl p-3">
                <p className="text-green-300 font-semibold">✅ Ολοκληρώθηκε!</p>
                <p className="text-green-400 text-sm mt-1">Εισήχθησαν: {importDone.inserted} | Παραλείφθηκαν: {importDone.skipped}</p>
              </div>
            )}
            <div className="flex justify-between items-center pt-2">
              <div>
                {!importDone && (
                  <button onClick={handleDeleteMonth} disabled={importing || importRows.length === 0}
                    className="bg-red-900/60 hover:bg-red-800 disabled:opacity-50 text-red-300 px-4 py-2 rounded-xl text-sm transition-colors"
                  >🗑️ Εκκαθάριση μηνός</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setImportOpen(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-xl text-sm">Κλείσιμο</button>
                {!importDone && (
                  <button onClick={handleImportConfirm} disabled={importing || importRows.length === 0}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                  >{importing ? 'Εισαγωγή...' : `💾 Εισαγωγή ${importRows.length} εγγραφών`}</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit / Add Modal ── */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white text-lg font-bold">
                {editRow ? `✏️ Παραστατικό #${editRow.doc_num}` : '➕ Νέο Παραστατικό'}
              </h2>
              <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>

            {/* Τύπος — εμφανής επιλογή */}
            <div className="flex gap-2">
              {['ΤΠΥ', 'INV'].map(t => (
                <button key={t} type="button"
                  onClick={() => {
                    const maxDoc = rows.filter(r => (r.type || 'ΤΠΥ') === t).reduce((m, r) => Math.max(m, r.doc_num || 0), 0)
                    setForm(f => ({ ...f, type: t, doc_num: f._manualDoc ? f.doc_num : maxDoc + 1 }))
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${(form.type || 'ΤΠΥ') === t ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
                >{t}</button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 text-xs mb-1">Αρ. Παραστατικού</label>
                <input type="number" value={form.doc_num || ''} ref={firstFieldRef}
                  onChange={e => setForm(f => ({ ...f, doc_num: e.target.value, _manualDoc: true }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1">Μήνας</label>
                <select value={form.month_sort || ''}
                  onChange={e => {
                    const found = months.find(([s]) => s === e.target.value)
                    setForm(f => ({ ...f, month_sort: e.target.value, month: found ? found[1] : e.target.value }))
                  }}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                >
                  {months.map(([sort, label]) => <option key={sort} value={sort}>{label}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-slate-400 text-xs mb-1">Πελάτης</label>
                <Autocomplete value={form.client || ''} onChange={v => setForm(f => ({ ...f, client: v }))}
                  options={clientOptions} placeholder="Αναζήτηση πελάτη..."
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 text-xs">Πινακίδα</label>
                  {form.truck && !editRow && (
                    <span className="text-indigo-400 text-xs">✓ μένει για το επόμενο</span>
                  )}
                </div>
                <Autocomplete value={form.truck || ''} onChange={v => setForm(f => ({ ...f, truck: v }))}
                  options={truckOptions} placeholder="Αναζήτηση πινακίδας..."
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-xs mb-1">Χρέωση (€)</label>
                <input type="number" step="0.01" value={form.charge ?? ''}
                  onChange={e => setForm(f => ({ ...f, charge: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1">Φορτωτικές (€)</label>
                <input type="number" step="0.01" value={form.freight ?? ''}
                  onChange={e => setForm(f => ({ ...f, freight: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-xs mb-1">Αρ. Παραγγελίας</label>
                <input type="number" value={form.order_num || ''}
                  onChange={e => setForm(f => ({ ...f, order_num: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="π.χ. 42"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs mb-1">Σημείωση</label>
                <input type="text" value={form.note || ''}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Preview διαφοράς */}
            {form.charge !== '' && form.freight !== '' && form.charge != null && form.freight != null && (
              <div className={`rounded-xl px-4 py-2 text-sm font-mono text-center ${parseFloat(form.charge) - parseFloat(form.freight) >= 0 ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                Διαφορά: {fmtSign(parseFloat(form.charge) - parseFloat(form.freight))} €
              </div>
            )}

            <p className="text-slate-600 text-xs text-right">Ctrl+Enter αποθήκευση · Esc κλείσιμο</p>

            <div className="flex justify-between items-center pt-1">
              <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-xl text-sm">Άκυρο</button>
              <div className="flex gap-2">
                {!editRow && (
                  <button onClick={() => handleSave(true)} disabled={saving}
                    className="bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm transition-colors"
                  >💾 + Νέο</button>
                )}
                <button onClick={() => handleSave(false)} disabled={saving}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                >{saving ? 'Αποθήκευση...' : '💾 Αποθήκευση'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
