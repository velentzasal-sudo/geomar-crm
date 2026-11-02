import { useEffect, useState, useMemo } from 'react'
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

export default function Invoices() {
  const [rows, setRows]                     = useState([])
  const [loading, setLoading]               = useState(true)
  const [selectedMonth, setSelectedMonth]   = useState('')
  const [searchClient, setSearchClient]     = useState('')
  const [searchTruck, setSearchTruck]       = useState('')

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
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .order('month_sort', { ascending: false })
      .order('doc_num', { ascending: true })
    setRows(data || [])
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
    // Επόμενος αριθμός παραστατικού
    const maxDoc = rows.reduce((m, r) => Math.max(m, r.doc_num || 0), 0)
    const nextDoc = maxDoc + 1

    // Τρέχων μήνας
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

  async function handleSave() {
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
    setEditOpen(false)
    loadAll()
  }

  async function handleDelete(id) {
    if (!window.confirm('Διαγραφή εγγραφής;')) return
    await supabase.from('invoices').delete().eq('id', id)
    loadAll()
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
              <div>
                <label className="block text-slate-400 text-xs mb-1">Αρ. Παραστατικού</label>
                <input
                  type="number"
                  value={form.doc_num || ''}
                  onChange={e => setForm(f => ({ ...f, doc_num: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
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
              <div className="col-span-2">
                <label className="block text-slate-400 text-xs mb-1">Πελάτης</label>
                <input
                  type="text"
                  value={form.client || ''}
                  onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-400 text-xs mb-1">Πινακίδα</label>
                <input
                  type="text"
                  value={form.truck || ''}
                  onChange={e => setForm(f => ({ ...f, truck: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
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

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-white px-4 py-2 rounded-xl text-sm">Άκυρο</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              >{saving ? 'Αποθήκευση...' : '💾 Αποθήκευση'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
