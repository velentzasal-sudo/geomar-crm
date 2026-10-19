import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO, startOfWeek, endOfWeek } from 'date-fns'
import { el } from 'date-fns/locale'

const EMPTY_TRUCK = { tr: '', driver: '', phone: '', tare: '', payload: '', ldm: '', tmp: '', notes: '' }

const LDM_FACTORS = { E: 0.40, B: 0.50, P: 0.60, M: 1.00 }

const STATUS_COLORS = {
  'Open':          'bg-blue-900/50 text-blue-300 border-blue-700',
  'Ανατεθειμένη': 'bg-orange-900/50 text-orange-300 border-orange-700',
  'Μεταφορά':      'bg-green-900/50 text-green-300 border-green-700',
  'Παράδοση':      'bg-purple-900/50 text-purple-300 border-purple-700',
  'Delivered':     'bg-slate-700 text-slate-400 border-slate-600',
}

function calcLdm(o) {
  return parseFloat(o.ldm) || (o.pal && o.qty ? (LDM_FACTORS[o.pal] || 0) * parseFloat(o.qty) : 0)
}

function fmtDate(d) {
  if (!d) return '—'
  try { return format(parseISO(d.substring(0, 10)), 'd MMM yyyy', { locale: el }) }
  catch { return d }
}

// Group orders by ISO week (Mon–Sun)
function groupByWeek(orders) {
  const groups = {}
  orders.forEach(o => {
    const ref = o.load_date || o.rdy || o.delivery_date
    if (!ref) { (groups['—'] = groups['—'] || []).push(o); return }
    try {
      const d = parseISO(ref.substring(0, 10))
      const mon = startOfWeek(d, { weekStartsOn: 1 })
      const sun = endOfWeek(d, { weekStartsOn: 1 })
      const key = format(mon, 'yyyy-MM-dd')
      const label = `${format(mon, 'd MMM', { locale: el })} – ${format(sun, 'd MMM yyyy', { locale: el })}`
      if (!groups[key]) groups[key] = { label, orders: [] }
      groups[key].orders.push(o)
    } catch {
      (groups['—'] = groups['—'] || []).push(o)
    }
  })
  // sort descending by week key
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, v]) => v)
}

export default function Fleet() {
  const [trucks, setTrucks]   = useState([])
  const [avail, setAvail]     = useState([])
  const [allOrders, setAllOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY_TRUCK)
  const [saving, setSaving]   = useState(false)
  const [search, setSearch]   = useState('')
  // History drawer
  const [historyTruck, setHistoryTruck] = useState(null) // truck object
  const [historySearch, setHistorySearch] = useState('')
  const [historyStatus, setHistoryStatus] = useState('all')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: t }, { data: a }, { data: o }] = await Promise.all([
      supabase.from('trucks').select('*').order('tr'),
      supabase.from('avail').select('*').order('created_at', { ascending: false }),
      supabase.from('orders')
        .select('id,client,from,to,status,rdy,load_date,delivery_date,truck,ldm,qty,pal,notes')
        .order('load_date', { ascending: false }),
    ])
    setTrucks(t || [])
    setAvail(a || [])
    setAllOrders(o || [])
    setLoading(false)
  }

  function openNew()   { setEditing(null); setForm(EMPTY_TRUCK); setShowModal(true) }
  function openEdit(t) { setEditing(t.id); setForm({ ...t }); setShowModal(true) }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const { id: _id, ...rest } = form
    const payload = { ...rest, tare: parseFloat(form.tare)||0, payload: parseFloat(form.payload)||0, ldm: parseFloat(form.ldm)||0 }
    let error
    if (editing) {
      const res = await supabase.from('trucks').update(payload).eq('id', editing)
      error = res.error
      if (res.error) alert('Σφάλμα: ' + res.error.message)
    } else {
      const res = await supabase.from('trucks').insert([payload])
      error = res.error
      if (res.error) alert('Σφάλμα: ' + res.error.message)
    }
    setSaving(false)
    if (!error) { setShowModal(false); loadAll() }
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή φορτηγού;')) return
    await supabase.from('trucks').delete().eq('id', id)
    loadAll()
  }

  const filtered = trucks.filter(t => {
    const q = search.toLowerCase()
    return !q || [t.tr, t.driver, t.phone].some(v => v?.toLowerCase().includes(q))
  })

  const availMap = {}
  avail.forEach(a => { if (!availMap[a.tr]) availMap[a.tr] = a })

  // History panel derived data
  const truckOrders = historyTruck
    ? allOrders.filter(o => {
        const matchTruck  = o.truck === historyTruck.tr
        const matchSearch = !historySearch ||
          o.client?.toLowerCase().includes(historySearch.toLowerCase()) ||
          o.from?.toLowerCase().includes(historySearch.toLowerCase()) ||
          o.to?.toLowerCase().includes(historySearch.toLowerCase())
        const matchStatus = historyStatus === 'all' || o.status === historyStatus
        return matchTruck && matchSearch && matchStatus
      })
    : []

  const weeks = groupByWeek(truckOrders)

  const totalOrders    = historyTruck ? allOrders.filter(o => o.truck === historyTruck.tr).length : 0
  const deliveredCount = historyTruck ? allOrders.filter(o => o.truck === historyTruck.tr && o.status === 'Delivered').length : 0
  const activeCount    = historyTruck ? allOrders.filter(o => o.truck === historyTruck.tr && o.status !== 'Delivered').length : 0

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">🚚 Στόλος</h1>
        <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm">
          + Νέο Φορτηγό
        </button>
      </div>

      <div className="flex gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Αναζήτηση..."
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm w-56 focus:outline-none focus:border-blue-500"
        />
        <div className="ml-auto text-slate-400 text-sm self-center">{filtered.length} φορτηγά</div>
      </div>

      {loading ? (
        <p className="text-slate-400">Φόρτωση...</p>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(t => {
            const av = availMap[t.tr]
            const orderCount = allOrders.filter(o => o.truck === t.tr).length
            return (
              <div key={t.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">🚚</div>
                    <div>
                      <p className="text-white font-bold text-lg">{t.tr}</p>
                      <p className="text-slate-400 text-sm">{t.driver} {t.phone ? `· 📞 ${t.phone}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 items-center">
                    <button
                      onClick={() => { setHistoryTruck(t); setHistorySearch(''); setHistoryStatus('all') }}
                      className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-xs font-medium transition-colors"
                    >
                      📋 Ιστορικό {orderCount > 0 && <span className="ml-1 text-slate-500">({orderCount})</span>}
                    </button>
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white text-sm">✏️</button>
                    <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400 text-sm">🗑️</button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div className="bg-slate-700 rounded-xl p-3 text-center">
                    <p className="text-slate-400 text-xs">Χωρητικότητα</p>
                    <p className="text-white font-bold">{t.ldm} LDM</p>
                  </div>
                  <div className="bg-slate-700 rounded-xl p-3 text-center">
                    <p className="text-slate-400 text-xs">Φορτίο</p>
                    <p className="text-white font-bold">{t.payload ? `${t.payload} kg` : '—'}</p>
                  </div>
                  <div className="bg-slate-700 rounded-xl p-3 text-center">
                    <p className="text-slate-400 text-xs">Θερμ/σία</p>
                    <p className="text-white font-bold">{t.tmp || '—'}</p>
                  </div>
                </div>

                {av && (
                  <div className="mt-3 bg-slate-700/50 rounded-xl px-3 py-2 text-xs text-slate-400">
                    📍 Τελευταία: <span className="text-white">{av.ct}</span>
                    {av.co && <> → <span className="text-blue-300">{av.co}</span></>}
                    {av.fr && <span className="ml-2 text-green-400">Ελεύθερο: {av.fr}</span>}
                    {av.nt && <span className="ml-2 text-slate-300">· {av.nt}</span>}
                  </div>
                )}

                {t.notes && <p className="mt-2 text-slate-500 text-xs">{t.notes}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── History Drawer ── */}
      {historyTruck && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end" onClick={() => setHistoryTruck(null)}>
          <div
            className="w-full max-w-xl h-full bg-slate-900 border-l border-slate-700 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="p-5 border-b border-slate-800 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-xl font-bold text-white">🚚 {historyTruck.tr}</h2>
                  <p className="text-slate-400 text-sm">{historyTruck.driver || '—'}</p>
                </div>
                <button onClick={() => setHistoryTruck(null)}
                  className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800">✕</button>
              </div>

              {/* Stats */}
              <div className="flex gap-4 mb-3">
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{totalOrders}</p>
                  <p className="text-xs text-slate-500">Σύνολο</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-green-400">{activeCount}</p>
                  <p className="text-xs text-slate-500">Ενεργές</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-slate-400">{deliveredCount}</p>
                  <p className="text-xs text-slate-500">Delivered</p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex gap-2">
                <input
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  placeholder="Αναζήτηση..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
                />
                <select
                  value={historyStatus}
                  onChange={e => setHistoryStatus(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="all">Όλα</option>
                  {['Open','Ανατεθειμένη','Μεταφορά','Παράδοση','Delivered'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Weekly grouped orders */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {weeks.length === 0 ? (
                <p className="text-slate-500 text-sm text-center pt-8">Δεν βρέθηκαν παραγγελίες</p>
              ) : (
                weeks.map((week, wi) => (
                  <div key={wi}>
                    {/* Week header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        📅 {week.label}
                      </span>
                      <span className="text-xs text-slate-600">({week.orders.length} παρ.)</span>
                      <div className="flex-1 h-px bg-slate-800" />
                    </div>

                    {/* Orders in this week */}
                    <div className="space-y-2">
                      {week.orders.map(o => {
                        const ldm = calcLdm(o)
                        return (
                          <div key={o.id} className="bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2.5 flex items-start gap-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-lg border shrink-0 mt-0.5 ${STATUS_COLORS[o.status] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                              {o.status}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-white text-sm font-medium truncate">{o.client}</p>
                                {ldm > 0 && <span className="text-xs text-blue-400 font-mono shrink-0">{ldm.toFixed(2)} LDM</span>}
                              </div>
                              <p className="text-slate-400 text-xs truncate">{o.from || '—'} → {o.to || '—'}</p>
                              <div className="flex gap-3 mt-0.5 text-xs text-slate-600 flex-wrap">
                                {o.load_date    && <span>Φόρτ: {fmtDate(o.load_date)}</span>}
                                {o.delivery_date && <span>Παρ: {fmtDate(o.delivery_date)}</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit/New Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-lg">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-6">{editing ? '✏️ Επεξεργασία' : '➕ Νέο Φορτηγό'}</h2>
              <div className="grid grid-cols-2 gap-4">
                <TField label="Αριθμός" name="tr" value={form.tr} onChange={handleChange} className="col-span-2" />
                <TField label="Οδηγός" name="driver" value={form.driver} onChange={handleChange} />
                <TField label="Τηλέφωνο" name="phone" value={form.phone} onChange={handleChange} />
                <TField label="Τάρα (kg)" name="tare" type="number" value={form.tare} onChange={handleChange} />
                <TField label="Φορτίο (kg)" name="payload" type="number" value={form.payload} onChange={handleChange} />
                <TField label="LDM" name="ldm" type="number" value={form.ldm} onChange={handleChange} />
                <TField label="Θερμοκρασία" name="tmp" value={form.tmp} onChange={handleChange} />
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Σημειώσεις</label>
                  <textarea name="notes" value={form.notes || ''} onChange={handleChange} rows={2}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm">Ακύρωση</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium">
                  {saving ? 'Αποθήκευση...' : '💾 Αποθήκευση'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TField({ label, name, value, onChange, type = 'text', className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input type={type} name={name} value={value ?? ''} onChange={onChange}
        className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
    </div>
  )
}
