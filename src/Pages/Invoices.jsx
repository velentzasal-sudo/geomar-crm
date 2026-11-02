import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'

const MONTHS_ORDER = [
  'Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος',
  'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος',
  'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'
]

function fmt(n) {
  if (n == null) return ''
  return Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2 })
}

// ── Autocomplete component ────────────────────────────────────────
function Autocomplete({ value, onChange, options, placeholder, className }) {
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
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Stats tab ─────────────────────────────────────────────────────
function StatsTab({ rows }) {
  const [statMonth, setStatMonth] = useState('')

  const months = useMemo(() => {
    const seen = new Map()
    rows.forEach(r => { if (r.month_sort) seen.set(r.month_sort, r.month) })
    return Array.from(seen.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows])

  const data = useMemo(() => {
    return statMonth ? rows.filter(r => r.month_sort === statMonth) : rows
  }, [rows, statMonth])

  const totals = useMemo(() => ({
    charge:  data.reduce((s, r) => s + (r.charge  || 0), 0),
    freight: data.reduce((s, r) => s + (r.freight || 0), 0),
    count:   data.length,
  }), [data])

  const diff = totals.charge - totals.freight
  const pct  = totals.charge ? ((diff / totals.charge) * 100).toFixed(1) : 0

  // ανά πελάτη
  const byClient = useMemo(() => {
    const map = {}
    data.forEach(r => {
      const k = r.client || '—'
      if (!map[k]) map[k] = { charge: 0, freight: 0, count: 0 }
      map[k].charge  += r.charge  || 0
      map[k].freight += r.freight || 0
      map[k].count   += 1
    })
    return Object.entries(map).sort((a, b) => b[1].charge - a[1].charge)
  }, [data])

  // ανά φορτηγό
  const byTruck = useMemo(() => {
    const map = {}
    data.forEach(r => {
      const k = r.truck || '—'
      if (!map[k]) map[k] = { charge: 0, freight: 0, count: 0 }
      map[k].charge  += r.charge  || 0
      map[k].freight += r.freight || 0
      map[k].count   += 1
    })
    return Object.entries(map).sort((a, b) => b[1].charge - a[1].charge)
  }, [data])

  // ανά μήνα
  const byMonth = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      const k = r.month_sort || '—'
      const label = r.month || k
      if (!map[k]) map[k] = { label, charge: 0, freight: 0, count: 0 }
      map[k].charge  += r.charge  || 0
      map[k].freight += r.freight || 0
      map[k].count   += 1
    })
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows])

  const maxCharge = byMonth.length ? Math.max(...byMonth.map(([, v]) => v.charge)) : 1

  return (
    <div className="space-y-5">
      {/* Φίλτρο μήνα */}
      <div className="flex items-center gap-3">
        <select
          value={statMonth}
          onChange={e => setStatMonth(e.target.value)}
          className="bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">Όλοι οι μήνες</option>
          {months.map(([sort, label]) => (
            <option key={sort} value={sort}>{label}</option>
          ))}
        </select>
        <span className="text-slate-500 text-sm">{data.length} εγγραφές</span>
      </div>

      {/* Κάρτες συνόλων */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800 border border-slate-600 rounded-2xl px-4 py-3">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Χρέωση</p>
          <p className="text-white text-xl font-bold font-mono">{fmt(totals.charge)}</p>
          <p className="text-slate-500 text-xs mt-0.5">ευρώ</p>
        </div>
        <div className="bg-slate-800 border border-slate-600 rounded-2xl px-4 py-3">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Φορτωτικές</p>
          <p className="text-blue-300 text-xl font-bold font-mono">{fmt(totals.freight)}</p>
          <p className="text-slate-500 text-xs mt-0.5">ευρώ</p>
        </div>
        <div className="bg-slate-800 border border-slate-600 rounded-2xl px-4 py-3">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Διαφορά</p>
          <p className={`text-xl font-bold font-mono ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(diff)}</p>
          <p className="text-slate-500 text-xs mt-0.5">{pct}% margin</p>
        </div>
        <div className="bg-slate-800 border border-slate-600 rounded-2xl px-4 py-3">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Παραστατικά</p>
          <p className="text-white text-xl font-bold">{totals.count}</p>
          <p className="text-slate-500 text-xs mt-0.5">εγγραφές</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Ανά πελάτη */}
        <div className="bg-slate-800 border border-slate-600 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h3 className="text-white font-semibold text-sm">Ανά Πελάτη</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="px-3 py-2 text-left">Πελάτης</th>
                  <th className="px-3 py-2 text-right">Χρέωση</th>
                  <th className="px-3 py-2 text-right">Φορτ/κές</th>
                  <th className="px-3 py-2 text-right w-10">Τμχ</th>
                </tr>
              </thead>
              <tbody>
                {byClient.map(([name, v]) => (
                  <tr key={name} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-3 py-1.5 text-white font-medium truncate max-w-[130px]">{name}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-white">{fmt(v.charge)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-blue-300">{fmt(v.freight)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-400">{v.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ανά φορτηγό */}
        <div className="bg-slate-800 border border-slate-600 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h3 className="text-white font-semibold text-sm">Ανά Φορτηγό</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="px-3 py-2 text-left">Πινακίδα</th>
                  <th className="px-3 py-2 text-right">Χρέωση</th>
                  <th className="px-3 py-2 text-right">Φορτ/κές</th>
                  <th className="px-3 py-2 text-right w-10">Τμχ</th>
                </tr>
              </thead>
              <tbody>
                {byTruck.map(([name, v]) => (
                  <tr key={name} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                    <td className="px-3 py-1.5 text-white font-mono text-xs">{name}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-white">{fmt(v.charge)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-blue-300">{fmt(v.freight)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-400">{v.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Ανά μήνα με bar chart */}
      {!statMonth && (
        <div className="bg-slate-800 border border-slate-600 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h3 className="text-white font-semibold text-sm">Εξέλιξη ανά Μήνα</h3>
          </div>
          <div className="p-4 space-y-2">
            {byMonth.map(([sort, v]) => (
              <div key={sort} className="flex items-center gap-3">
                <span className="text-slate-400 text-xs w-28 shrink-0">{(v.label || '').replace(/\s+\d{4}$/, m => ` ${m.trim().slice(-2)}`)}</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 bg-slate-700 rounded-full h-4 relative overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${maxCharge ? (v.charge / maxCharge) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-white font-mono text-xs w-24 text-right shrink-0">{fmt(v.charge)}</span>
                </div>
                <span className="text-slate-500 text-xs w-8 text-right shrink-0">{v.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function Invoices() {
  const [rows, setRows]                     = useState([])
  const [loading, setLoading]               = useState(true)
  const [selectedMonth, setSelectedMonth]   = useState('')
  const [searchClient, setSearchClient]     = useState('')
  const [searchTruck, setSearchTruck]       = useState('')
  const [activeTab, setActiveTab]           = useState('list') // 'list' | 'stats'

  // Λίστες για autocomplete
  const [clientOptions, setClientOptions] = useState([])
  const [truckOptions,  setTruckOptions]  = useState([])

  // Import modal
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importing, setImporting]   = useState(false)
  const [importDone, setImportDone] = useState(null)

  // Edit / Add modal
  const [editOpen, setEditOpen] = useState(false)
  const [editRow, setEditRow]   = useState(null)
  const [form, setForm]         = useState({})
  const [saving, setSaving]     = useState(false)

  async function loadAll() {
    setLoading(true)
    const [{ data: inv }, { data: clients }, { data: trucks }] = await Promise.all([
      supabase.from('invoices').select('*').order('month_sort', { ascending: false }).order('doc_num', { ascending: true }),
      supabase.from('clients').select('name').order('name'),
      supabase.from('trucks').select('plate').order('plate'),
    ])
    setRows(inv || [])
    setClientOptions((clients || []).map(c => c.name).filter(Boolean))
    setTruckOptions((trucks || []).map(t => t.plate).filter(Boolean))
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  // Μοναδικοί μήνες για φίλτρο
  const months = useMemo(() => {
    const seen = new Map()
    rows.forEach(r => { if (r.month_sort) seen.set(r.month_sort, r.month) })
    return Array.from(seen.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows])

  // Φιλτραρισμένες εγγραφές
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (selectedMonth && r.month_sort !== selectedMonth) return false
      if (searchClient && !(r.client || '').toLowerCase().includes(searchClient.toLowerCase())) return false
      if (searchTruck && !(r.truck || '').toLowerCase().includes(searchTruck.toLowerCase())) return false
      return true
    })
  }, [rows, selectedMonth, searchClient, searchTruck])

  // Σύνολα τρέχουσας προβολής
  const totals = useMemo(() => ({
    charge:  filtered.reduce((s, r) => s + (r.charge  || 0), 0),
    freight: filtered.reduce((s, r) => s + (r.freight || 0), 0),
    count:   filtered.length,
  }), [filtered])

  // ── Import Excel ──────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImportDone(null)

    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs')
    const buf  = await file.arrayBuffer()
    const wb   = XLSX.read(buf, { type: 'array' })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 })

    const sheetName  = wb.SheetNames[0]
    const monthMatch = sheetName.match(/(Ιανουάριος|Φεβρουάριος|Μάρτιος|Απρίλιος|Μάιος|Ιούνιος|Ιούλιος|Αύγουστος|Σεπτέμβριος|Οκτώβριος|Νοέμβριος|Δεκέμβριος)\s+(\d{4})/i)
    let month = sheetName, monthSort = ''
    if (monthMatch) {
      const mIdx = MONTHS_ORDER.findIndex(m => m.toLowerCase() === monthMatch[1].toLowerCase())
      monthSort = `${monthMatch[2]}-${String(mIdx + 1).padStart(2, '0')}`
    }

    const parsed = []
    for (const row of data) {
      if (!row[0] || typeof row[0] !== 'number') continue
      const docNum = Math.round(row[0])
      if (docNum <= 0) continue
      parsed.push({
        doc_num:    docNum,
        month,
        month_sort: monthSort,
        client:     row[1] ? String(row[1]).trim() : null,
        truck:      row[2] ? String(row[2]).trim() : null,
        charge:     typeof row[3] === 'number' ? row[3] : null,
        freight:    typeof row[4] === 'number' ? row[4] : null,
        note:       row[5] ? String(row[5]).trim() : null,
      })
    }
    setImportRows(parsed)
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
    const ms = importRows[0].month_sort
    const { data: existing } = await supabase.from('invoices').select('doc_num').eq('month_sort', ms)
    const existingSet = new Set((existing || []).map(r => r.doc_num))
    let inserted = 0, skipped = 0
    for (const row of importRows) {
      if (existingSet.has(row.doc_num)) { skipped++; continue }
      const { error } = await supabase.from('invoices').insert([row])
      if (error) skipped++
      else { inserted++; existingSet.add(row.doc_num) }
    }
    setImporting(false)
    setImportDone({ inserted, skipped })
    loadAll()
  }

  // ── Edit / Add ────────────────────────────────────────────────
  function openAdd() {
    const maxDoc = rows.reduce((m, r) => Math.max(m, r.doc_num || 0), 0)
    const nextDoc = maxDoc + 1

    const now = new Date()
    const mIdx = now.getMonth()
    const year = now.getFullYear()
    const monthSort  = `${year}-${String(mIdx + 1).padStart(2, '0')}`
    const monthLabel = `${MONTHS_ORDER[mIdx]} ${year}`

    setEditRow(null)
    setForm({
      doc_num:    nextDoc,
      month:      monthLabel,
      month_sort: monthSort,
      client:     '',
      truck:      '',
      charge:     '',
      freight:    '',
      note:       '',
      order_num:  '',
    })
    setEditOpen(true)
  }

  function openEdit(r) {
    setEditRow(r)
    setForm({ ...r })
    setEditOpen(true)
  }

  async function handleSave(andNew = false) {
    setSaving(true)
    const payload = {
      doc_num:    parseInt(form.doc_num) || 0,
      month:      form.month,
      month_sort: form.month_sort,
      client:     form.client || null,
      truck:      form.truck || null,
      charge:     form.charge !== '' && form.charge != null ? parseFloat(form.charge) : null,
      freight:    form.freight !== '' && form.freight != null ? parseFloat(form.freight) : null,
      note:       form.note || null,
      order_num:  form.order_num ? parseInt(form.order_num) : null,
    }
    if (editRow) {
      await supabase.from('invoices').update(payload).eq('id', editRow.id)
    } else {
      await supabase.from('invoices').insert([payload])
    }
    setSaving(false)
    if (andNew) {
      // «Αποθήκευση & νέο» — ίδιος μήνας, επόμενος αριθμός, ίδια πινακίδα
      const newRows = [...rows, payload]
      const maxDoc = newRows.reduce((m, r) => Math.max(m, r.doc_num || 0), 0)
      setEditRow(null)
      setForm(f => ({
        ...f,
        doc_num:   maxDoc + 1,
        client:    '',
        charge:    '',
        freight:   '',
        note:      '',
        order_num: '',
        // truck μένει ίδια — χρήσιμο για γεμάτο φορτηγό με πολλούς πελάτες
      }))
      loadAll()
    } else {
      setEditOpen(false)
      loadAll()
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Διαγραφή εγγραφής;')) return
    await supabase.from('invoices').delete().eq('id', id)
    loadAll()
  }

  // Μήνας label από month_sort
  function monthLabel(sort) {
    if (!sort) return ''
    const found = months.find(([s]) => s === sort)
    return found ? found[1] : sort
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-white text-2xl font-bold">📄 Παραστατικά</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setImportOpen(true); setImportRows([]); setImportDone(null) }}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm transition-colors"
          >📥 Import Excel</button>
          <button
            onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          >+ Νέο</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/60 rounded-xl p-1 w-fit">
        {[['list', '📋 Παραστατικά'], ['stats', '📊 Στατιστικά']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >{label}</button>
        ))}
      </div>

      {activeTab === 'stats' ? (
        <StatsTab rows={rows} />
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
              {months.map(([sort, label]) => (
                <option key={sort} value={sort}>{label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="🔍 Πελάτης..."
              value={searchClient}
              onChange={e => setSearchClient(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-44"
            />
            <input
              type="text"
              placeholder="🔍 Πινακίδα..."
              value={searchTruck}
              onChange={e => setSearchTruck(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 w-36"
            />
            {(selectedMonth || searchClient || searchTruck) && (
              <button
                onClick={() => { setSelectedMonth(''); setSearchClient(''); setSearchTruck('') }}
                className="text-slate-400 hover:text-white text-sm px-2"
              >✕ Καθαρισμός</button>
            )}
            <span className="text-slate-500 text-sm ml-auto">{totals.count} εγγραφές</span>
          </div>

          {/* Πίνακας Excel-style */}
          {loading ? (
            <p className="text-slate-400 text-center py-12">Φόρτωση...</p>
          ) : filtered.length === 0 ? (
            <p className="text-slate-500 text-center py-12">Δεν βρέθηκαν εγγραφές</p>
          ) : (
            <div className="rounded-xl overflow-hidden border border-slate-600">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-700 text-slate-300 text-xs uppercase tracking-wide">
                    <th className="px-3 py-2.5 text-left border-r border-slate-600 w-20">Αρ.</th>
                    <th className="px-3 py-2.5 text-left border-r border-slate-600">Πελάτης</th>
                    <th className="px-3 py-2.5 text-left border-r border-slate-600 w-28">Πινακίδα</th>
                    <th className="px-3 py-2.5 text-right border-r border-slate-600 w-28">Χρέωση</th>
                    <th className="px-3 py-2.5 text-right border-r border-slate-600 w-28">Φορτωτικές</th>
                    <th className="px-3 py-2.5 text-left border-r border-slate-600 w-20">Παρ.</th>
                    <th className="px-3 py-2.5 text-left border-r border-slate-600 w-32">Μήνας</th>
                    <th className="px-3 py-2.5 text-left w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr
                      key={r.id}
                      onClick={() => openEdit(r)}
                      className={`border-t border-slate-700 cursor-pointer transition-colors hover:bg-blue-900/20
                        ${i % 2 === 0 ? 'bg-slate-800/40' : 'bg-slate-800/80'}`}
                    >
                      <td className="px-3 py-2 border-r border-slate-700 font-mono text-slate-300">{r.doc_num}</td>
                      <td className="px-3 py-2 border-r border-slate-700 text-white font-medium">{r.client || '—'}</td>
                      <td className="px-3 py-2 border-r border-slate-700 font-mono text-slate-300 text-xs">{r.truck || '—'}</td>
                      <td className={`px-3 py-2 border-r border-slate-700 text-right font-mono ${r.charge < 0 ? 'text-red-400' : 'text-white'}`}>
                        {fmt(r.charge)}
                      </td>
                      <td className="px-3 py-2 border-r border-slate-700 text-right font-mono text-blue-300">
                        {fmt(r.freight)}
                      </td>
                      <td className="px-3 py-2 border-r border-slate-700 font-mono text-slate-400 text-xs">
                        {r.order_num ? `#${r.order_num}` : '—'}
                      </td>
                      <td className="px-3 py-2 border-r border-slate-700 text-slate-400 text-xs">
                        {(r.month || '').replace(' 2026', '')}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(r.id) }}
                          className="text-slate-600 hover:text-red-400 text-xs transition-colors"
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                  {/* Γραμμή συνόλων */}
                  <tr className="border-t-2 border-slate-500 bg-slate-700/60 font-semibold">
                    <td className="px-3 py-2 border-r border-slate-600 text-slate-400 text-xs" colSpan={3}>
                      Σύνολο ({totals.count})
                    </td>
                    <td className="px-3 py-2 border-r border-slate-600 text-right font-mono text-white">
                      {fmt(totals.charge)}
                    </td>
                    <td className="px-3 py-2 border-r border-slate-600 text-right font-mono text-blue-300">
                      {fmt(totals.freight)}
                    </td>
                    <td className="px-3 py-2 border-r border-slate-600" colSpan={3}></td>
                  </tr>
                </tbody>
              </table>
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
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="w-full text-slate-300 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-600 file:text-white file:text-sm hover:file:bg-slate-500"
            />
            {importRows.length > 0 && !importDone && (
              <div className="bg-slate-700/50 rounded-xl p-3">
                <p className="text-white text-sm font-semibold">{importRows[0].month}</p>
                <p className="text-slate-300 text-sm mt-1">{importRows.length} εγγραφές έτοιμες</p>
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                  {importRows.slice(0, 5).map((r, i) => (
                    <p key={i} className="text-slate-400 text-xs font-mono">
                      #{r.doc_num} {r.client} {r.truck} {r.charge}€
                    </p>
                  ))}
                  {importRows.length > 5 && <p className="text-slate-500 text-xs">... και {importRows.length - 5} ακόμα</p>}
                </div>
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
                  <button
                    onClick={handleDeleteMonth}
                    disabled={importing || importRows.length === 0}
                    className="bg-red-900/60 hover:bg-red-800 disabled:opacity-50 text-red-300 px-4 py-2 rounded-xl text-sm transition-colors"
                  >🗑️ Εκκαθάριση μηνός</button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setImportOpen(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-xl text-sm">Κλείσιμο</button>
                {!importDone && (
                  <button
                    onClick={handleImportConfirm}
                    disabled={importing || importRows.length === 0}
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

            <div className="grid grid-cols-2 gap-3">
              {/* Αρ. Παραστατικού */}
              <div>
                <label className="block text-slate-400 text-xs mb-1">Αρ. Παραστατικού</label>
                <input
                  type="number"
                  value={form.doc_num || ''}
                  onChange={e => setForm(f => ({ ...f, doc_num: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Μήνας */}
              <div>
                <label className="block text-slate-400 text-xs mb-1">Μήνας</label>
                <select
                  value={form.month_sort || ''}
                  onChange={e => {
                    const found = months.find(([s]) => s === e.target.value)
                    setForm(f => ({ ...f, month_sort: e.target.value, month: found ? found[1] : e.target.value }))
                  }}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                >
                  {months.map(([sort, label]) => <option key={sort} value={sort}>{label}</option>)}
                </select>
              </div>

              {/* Πελάτης με autocomplete */}
              <div className="col-span-2">
                <label className="block text-slate-400 text-xs mb-1">Πελάτης</label>
                <Autocomplete
                  value={form.client || ''}
                  onChange={v => setForm(f => ({ ...f, client: v }))}
                  options={clientOptions}
                  placeholder="Αναζήτηση πελάτη..."
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Πινακίδα με autocomplete */}
              <div className="col-span-2">
                <label className="block text-slate-400 text-xs mb-1">Πινακίδα</label>
                <Autocomplete
                  value={form.truck || ''}
                  onChange={v => setForm(f => ({ ...f, truck: v }))}
                  options={truckOptions}
                  placeholder="Αναζήτηση πινακίδας..."
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Χρέωση */}
              <div>
                <label className="block text-slate-400 text-xs mb-1">Χρέωση (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.charge ?? ''}
                  onChange={e => setForm(f => ({ ...f, charge: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Φορτωτικές */}
              <div>
                <label className="block text-slate-400 text-xs mb-1">Φορτωτικές (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.freight ?? ''}
                  onChange={e => setForm(f => ({ ...f, freight: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Αρ. Παραγγελίας */}
              <div>
                <label className="block text-slate-400 text-xs mb-1">Αρ. Παραγγελίας</label>
                <input
                  type="number"
                  value={form.order_num || ''}
                  onChange={e => setForm(f => ({ ...f, order_num: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="π.χ. 42"
                />
              </div>

              {/* Σημείωση */}
              <div className="col-span-2">
                <label className="block text-slate-400 text-xs mb-1">Σημείωση</label>
                <input
                  type="text"
                  value={form.note || ''}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-xl text-sm">Άκυρο</button>
              <div className="flex gap-2">
                {!editRow && (
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm transition-colors"
                  >💾 + Νέο</button>
                )}
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
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
