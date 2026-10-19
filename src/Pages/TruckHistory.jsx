import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { el } from 'date-fns/locale'

const STATUS_COLORS = {
  'Open':          'bg-blue-900/50 text-blue-300 border-blue-700',
  'Ανατεθειμένη': 'bg-orange-900/50 text-orange-300 border-orange-700',
  'Μεταφορά':      'bg-green-900/50 text-green-300 border-green-700',
  'Παράδοση':      'bg-purple-900/50 text-purple-300 border-purple-700',
  'Delivered':     'bg-slate-700 text-slate-400 border-slate-600',
}

const LDM_FACTORS = { E: 0.40, B: 0.50, P: 0.60, M: 1.00 }

function calcLdm(o) {
  return parseFloat(o.ldm) || (o.pal && o.qty ? (LDM_FACTORS[o.pal] || 0) * parseFloat(o.qty) : 0)
}

function fmtDate(d) {
  if (!d) return '—'
  try { return format(parseISO(d.substring(0, 10)), 'd MMM yyyy', { locale: el }) }
  catch { return d }
}

export default function TruckHistory() {
  const [trucks, setTrucks]   = useState([])
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // truck.tr
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: t }, { data: o }] = await Promise.all([
      supabase.from('trucks').select('*').order('tr'),
      supabase.from('orders')
        .select('id,client,from,to,status,rdy,load_date,delivery_date,truck,ldm,qty,pal,notes')
        .order('rdy', { ascending: false }),
    ])
    setTrucks(t || [])
    setOrders(o || [])
    setLoading(false)
    // auto-select first truck
    if (t && t.length > 0 && !selected) setSelected(t[0].tr)
  }

  const truckOrders = orders.filter(o => o.truck === selected)

  const filtered = truckOrders.filter(o => {
    const matchSearch = !search ||
      o.client?.toLowerCase().includes(search.toLowerCase()) ||
      o.from?.toLowerCase().includes(search.toLowerCase()) ||
      o.to?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || o.status === statusFilter
    return matchSearch && matchStatus
  })

  // Stats for selected truck
  const totalOrders    = truckOrders.length
  const deliveredCount = truckOrders.filter(o => o.status === 'Delivered').length
  const activeCount    = truckOrders.filter(o => o.status !== 'Delivered').length
  const totalLdm       = truckOrders.reduce((s, o) => s + calcLdm(o), 0)

  const selectedTruck = trucks.find(t => t.tr === selected)

  const filteredTrucks = trucks.filter(t =>
    t.tr.toLowerCase().includes(search.toLowerCase()) ||
    (t.driver || '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="p-6 text-slate-400">Φόρτωση...</div>

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-2xl md:text-3xl font-bold text-white">🚛 Ιστορικό Φορτηγών</h1>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Truck list — left panel */}
        <div className="md:w-56 shrink-0 space-y-2">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-3 space-y-1">
            {trucks.map(t => {
              const count = orders.filter(o => o.truck === t.tr).length
              const active = orders.filter(o => o.truck === t.tr && o.status !== 'Delivered').length
              return (
                <button
                  key={t.id}
                  onClick={() => { setSelected(t.tr); setSearch(''); setStatusFilter('all') }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                    selected === t.tr
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <p className="font-bold text-sm">{t.tr}</p>
                  <p className={`text-xs mt-0.5 ${selected === t.tr ? 'text-blue-200' : 'text-slate-500'}`}>
                    {t.driver || '—'} · {count} παρ.
                    {active > 0 && <span className={`ml-1 ${selected === t.tr ? 'text-blue-200' : 'text-green-400'}`}>({active} ενεργές)</span>}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Main content — right panel */}
        <div className="flex-1 space-y-4">
          {selected && selectedTruck && (
            <>
              {/* Truck header */}
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedTruck.tr}</h2>
                    <p className="text-slate-400 text-sm mt-0.5">
                      {selectedTruck.driver || '—'}
                      {selectedTruck.phone && <> · {selectedTruck.phone}</>}
                    </p>
                  </div>
                  {/* Stats */}
                  <div className="flex gap-3 flex-wrap">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-white">{totalOrders}</p>
                      <p className="text-xs text-slate-500">Σύνολο</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-400">{activeCount}</p>
                      <p className="text-xs text-slate-500">Ενεργές</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-400">{deliveredCount}</p>
                      <p className="text-xs text-slate-500">Delivered</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-400">{totalLdm.toFixed(1)}</p>
                      <p className="text-xs text-slate-500">LDM σύνολο</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="flex gap-2 flex-wrap">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Αναζήτηση πελάτη, προορισμός..."
                  className="flex-1 min-w-[180px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
                />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="all">Όλα ({truckOrders.length})</option>
                  {['Open','Ανατεθειμένη','Μεταφορά','Παράδοση','Delivered'].map(s => {
                    const cnt = truckOrders.filter(o => o.status === s).length
                    return cnt > 0 ? <option key={s} value={s}>{s} ({cnt})</option> : null
                  })}
                </select>
              </div>

              {/* Orders list */}
              {filtered.length === 0 ? (
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center text-slate-500">
                  Δεν βρέθηκαν παραγγελίες
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(o => {
                    const ldm = calcLdm(o)
                    return (
                      <div key={o.id} className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex items-start gap-3">
                        <span className={`text-xs px-2 py-1 rounded-lg border shrink-0 mt-0.5 ${STATUS_COLORS[o.status] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                          {o.status}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white font-medium text-sm">{o.client}</p>
                            {ldm > 0 && (
                              <span className="text-xs text-blue-400 font-mono">{ldm.toFixed(2)} LDM</span>
                            )}
                          </div>
                          <p className="text-slate-400 text-xs mt-0.5">{o.from || '—'} → {o.to || '—'}</p>
                          <div className="flex gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                            {o.rdy && <span>Έτοιμο: {fmtDate(o.rdy)}</span>}
                            {o.load_date && <span>Φόρτωση: {fmtDate(o.load_date)}</span>}
                            {o.delivery_date && <span>Παράδοση: {fmtDate(o.delivery_date)}</span>}
                          </div>
                          {o.notes && <p className="text-slate-500 text-xs mt-1 italic truncate">{o.notes}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
