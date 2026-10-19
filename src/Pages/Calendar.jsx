import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, startOfWeek, addDays, isSameMonth, isToday, isSameDay } from 'date-fns'
import { el } from 'date-fns/locale'

const TLDM = 13.20
const LDM_FACTORS = { E: 0.40, B: 0.50, P: 0.60, M: 1.00 }

const STATUS_COLORS = {
  'Open':          'bg-blue-600',
  'Ανατεθειμένη': 'bg-orange-500',
  'Μεταφορά':      'bg-green-600',
  'Παράδοση':      'bg-purple-600',
  'Delivered':     'bg-slate-600',
}

const AVAIL_STATUSES = [
  { key: 'Διαθέσιμο',  label: 'Διαθέσιμο',  color: 'bg-green-900/60 text-green-300 border-green-700' },
  { key: 'Εν κινήσει', label: 'Εν κινήσει', color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700' },
  { key: 'Ρεπό',       label: 'Ρεπό',        color: 'bg-slate-700 text-slate-400 border-slate-600' },
  { key: 'Service',    label: 'Service',     color: 'bg-red-900/60 text-red-300 border-red-700' },
]

export default function Calendar() {
  const [orders, setOrders]             = useState([])
  const [payments, setPayments]         = useState([])
  const [availRecords, setAvailRecords] = useState([])
  const [trucks, setTrucks]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [current, setCurrent]           = useState(new Date())
  const [selected, setSelected]         = useState(null)
  const [showPayments, setShowPayments] = useState(true)
  const [showOrders, setShowOrders]     = useState(true)
  const [showAvail, setShowAvail]       = useState(true)

  // Add avail modal
  const [addModal, setAddModal]   = useState(null) // date
  const [addForm, setAddForm]     = useState({ truck: '', status: 'Διαθέσιμο', location: '', notes: '' })
  const [addSaving, setAddSaving] = useState(false)

  const navigate = useNavigate()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ord }, { data: pay }, { data: av }, { data: tr }] = await Promise.all([
      supabase.from('orders').select('id,client,from,to,status,rdy,load_date,delivery_date,truck,ldm,qty,pal').order('rdy'),
      supabase.from('payments').select('*').eq('paid', false).order('due_date'),
      supabase.from('avail').select('*'),
      supabase.from('trucks').select('tr,driver,ldm').order('tr'),
    ])
    setOrders(ord || [])
    setPayments(pay || [])
    setAvailRecords(av || [])
    setTrucks(tr || [])
    setLoading(false)
  }

  // LDM used by a truck on a specific day
  function truckDayLdm(trName, ds) {
    return orders.filter(o => {
      if (o.truck !== trName) return false
      const load = o.load_date?.substring(0, 10) || o.rdy?.substring(0, 10)
      const del  = o.delivery_date?.substring(0, 10)
      if (load && del) return ds >= load && ds <= del
      if (load) return ds >= load
      return false
    }).reduce((sum, o) => {
      const ldm = parseFloat(o.ldm) || (o.pal && o.qty ? (LDM_FACTORS[o.pal] || 0) * parseFloat(o.qty) : 0)
      return sum + ldm
    }, 0)
  }

  // Truck LDM status for a day: returns { ldmUsed, ldmFree, cap, pct, chip }
  function truckDayStatus(trName, ds) {
    const truckInfo = trucks.find(t => t.tr === trName)
    const cap     = parseFloat(truckInfo?.ldm) || TLDM
    const ldmUsed = truckDayLdm(trName, ds)
    const ldmFree = cap - ldmUsed
    const pct     = ldmUsed / cap
    // chip color based on LDM
    let chip, label
    if (ldmUsed === 0) {
      chip  = 'bg-green-900/60 border-green-700 text-green-300'
      label = null
    } else if (pct >= 0.95) {
      chip  = 'bg-red-900/70 border-red-700 text-red-300'
      label = '⚠️ Γεμάτο'
    } else {
      chip  = 'bg-orange-900/60 border-orange-700 text-orange-300'
      label = `${ldmFree.toFixed(1)} LDM διαθ. χώρος`
    }
    return { ldmUsed, ldmFree, cap, pct, chip, label }
  }

  // Avail records for a day (any status)
  function availForDay(date) {
    const ds = format(date, 'yyyy-MM-dd')
    return availRecords.filter(a => a.fr === ds)
  }

  const monthStart = startOfMonth(current)
  const monthEnd   = endOfMonth(current)
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 })
  const days = []
  let d = gridStart
  while (d <= monthEnd || days.length % 7 !== 0) {
    days.push(d)
    d = addDays(d, 1)
    if (days.length > 42) break
  }

  function ordersForDay(date) {
    const ds = format(date, 'yyyy-MM-dd')
    return orders.filter(o => {
      const rdy = o.rdy?.substring(0, 10)
      const ld  = o.load_date?.substring(0, 10)
      const dd  = o.delivery_date?.substring(0, 10)
      return rdy === ds || ld === ds || dd === ds
    })
  }

  function paymentsForDay(date) {
    const ds = format(date, 'yyyy-MM-dd')
    return payments.filter(p => p.due_date?.substring(0, 10) === ds)
  }

  const selectedOrders   = selected ? ordersForDay(selected) : []
  const selectedPayments = selected ? paymentsForDay(selected) : []
  const selectedAvail    = selected ? availForDay(selected) : []

  // Open add avail modal for a date
  function openAddModal(date) {
    setAddModal(date)
    setAddForm({ truck: trucks[0]?.tr || '', status: 'Διαθέσιμο', location: '', notes: '' })
  }

  async function saveAvail() {
    if (!addModal || !addForm.truck) return
    setAddSaving(true)
    const ds = format(addModal, 'yyyy-MM-dd')
    const existing = availRecords.find(a => a.tr === addForm.truck && a.fr === ds)
    const payload  = { tr: addForm.truck, fr: ds, nt: addForm.status, ct: addForm.location, co: addForm.notes }
    if (existing) {
      await supabase.from('avail').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('avail').insert([payload])
    }
    setAddSaving(false)
    setAddModal(null)
    loadAll()
  }

  if (loading) return <div className="p-6 text-slate-400">Φόρτωση...</div>

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-white">📅 Ημερολόγιο</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowOrders(v => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${showOrders ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
            📦 Παραγγελίες
          </button>
          <button onClick={() => setShowPayments(v => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${showPayments ? 'bg-purple-700 border-purple-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
            💰 Πληρωμές
          </button>
          <button onClick={() => setShowAvail(v => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${showAvail ? 'bg-green-700 border-green-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
            🚛 Διαθέσιμα
          </button>
          <div className="w-px h-5 bg-slate-700" />
          <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">◀</button>
          <span className="text-white font-medium min-w-[120px] text-center">
            {format(current, 'MMMM yyyy', { locale: el })}
          </span>
          <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">▶</button>
          <button onClick={() => setCurrent(new Date())}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm">Σήμερα</button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-slate-800 border border-slate-700 rounded-3xl p-4">
        <div className="grid grid-cols-7 mb-2">
          {['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'].map(day => (
            <div key={day} className="text-center text-slate-500 text-xs font-medium py-2">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            const ds          = format(day, 'yyyy-MM-dd')
            const dayOrders   = showOrders   ? ordersForDay(day)   : []
            const dayPayments = showPayments ? paymentsForDay(day) : []
            const dayAvail    = showAvail    ? availForDay(day)    : []
            const inMonth     = isSameMonth(day, current)
            const isSelected  = selected && isSameDay(day, selected)

            return (
              <button
                key={i}
                onClick={() => setSelected(isSelected ? null : day)}
                className={`min-h-[56px] md:min-h-[80px] p-1 md:p-1.5 rounded-xl text-left transition-colors ${
                  isSelected ? 'bg-blue-900/50' : 'hover:bg-slate-700'
                } ${!inMonth ? 'opacity-30' : ''} ${isToday(day) ? 'ring-2 ring-blue-500' : ''}`}
              >
                <p className={`text-xs font-medium mb-1 ${isToday(day) ? 'text-blue-400' : 'text-slate-300'}`}>
                  {format(day, 'd')}
                </p>
                <div className="space-y-0.5">
                  {dayOrders.slice(0, 2).map(o => (
                    <div key={o.id} className={`text-xs px-1 py-0.5 rounded text-white truncate ${STATUS_COLORS[o.status] || 'bg-slate-600'}`}>
                      {o.client}
                    </div>
                  ))}
                  {dayOrders.length > 2 && (
                    <div className="text-xs text-slate-500 pl-1">+{dayOrders.length - 2} παρ.</div>
                  )}
                  {dayPayments.slice(0, 1).map(p => (
                    <div key={p.id} className="text-xs px-1 py-0.5 rounded bg-purple-800/80 text-purple-200 truncate">
                      💰 {p.client_name}
                    </div>
                  ))}
                  {dayPayments.length > 1 && (
                    <div className="text-xs text-slate-500 pl-1">+{dayPayments.length - 1} πλ.</div>
                  )}
                  {dayAvail.slice(0, 2).map(a => {
                    const { chip } = truckDayStatus(a.tr, ds)
                    return (
                      <div key={a.id} className={`text-xs px-1 py-0.5 rounded border truncate ${chip}`}>
                        🚛 {a.tr}
                      </div>
                    )
                  })}
                  {dayAvail.length > 2 && (
                    <div className="text-xs text-slate-500 pl-1">+{dayAvail.length - 2} φορτ.</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day details */}
      {selected && (
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-bold">
              {format(selected, 'd MMMM yyyy', { locale: el })}
              <span className="ml-2 text-slate-400 text-sm font-normal">
                {selectedOrders.length + selectedPayments.length + selectedAvail.length} εγγραφές
              </span>
            </h2>
            {showAvail && (
              <button
                onClick={() => openAddModal(selected)}
                className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-xl transition-colors"
              >
                + Διαθεσιμότητα
              </button>
            )}
          </div>

          {/* Available trucks */}
          {showAvail && selectedAvail.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">🚛 Φορτηγά</p>
              <div className="flex flex-wrap gap-2">
                {selectedAvail.map(a => {
                  const ds = format(selected, 'yyyy-MM-dd')
                  const { chip, label, ldmFree } = truckDayStatus(a.tr, ds)
                  return (
                    <div key={a.id} className={`border rounded-xl px-3 py-2 flex items-center gap-2 ${chip}`}>
                      <span className="font-bold text-sm">{a.tr}</span>
                      <span className="text-xs opacity-70">{a.nt}</span>
                      {a.ct && <span className="text-xs opacity-60">📍 {a.ct}</span>}
                      {label && <span className="text-xs font-medium">{label}</span>}
                      <button
                        onClick={() => navigate(`/fleet?truck=${encodeURIComponent(a.tr)}`)}
                        className="ml-1 px-2 py-0.5 rounded-lg bg-black/20 hover:bg-black/40 text-xs transition-colors"
                        title="Άνοιγμα στον Στόλο"
                      >
                        🚚 Στόλος →
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Orders */}
          {showOrders && selectedOrders.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">📦 Παραγγελίες</p>
              <div className="space-y-2">
                {selectedOrders.map(o => (
                  <div key={o.id} className="bg-slate-700 rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-lg text-white shrink-0 ${STATUS_COLORS[o.status] || 'bg-slate-600'}`}>
                      {o.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{o.client}</p>
                      <p className="text-slate-400 text-xs">{o.from} → {o.to}</p>
                    </div>
                    {o.truck && (
                      <span className="text-slate-500 text-xs shrink-0">🚛 {o.truck}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payments */}
          {showPayments && selectedPayments.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">💰 Πληρωμές</p>
              <div className="space-y-2">
                {selectedPayments.map(p => (
                  <div key={p.id} className="bg-purple-900/30 border border-purple-800/50 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{p.client_name}</p>
                      {p.notes && <p className="text-slate-400 text-xs mt-0.5">{p.notes}</p>}
                    </div>
                    <p className="text-purple-300 font-bold text-sm shrink-0 ml-3">
                      €{(parseFloat(p.amount) || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedOrders.length === 0 && selectedPayments.length === 0 && selectedAvail.length === 0 && (
            <p className="text-slate-500 text-sm">Δεν υπάρχουν εγγραφές</p>
          )}
        </div>
      )}

      {/* ── ADD AVAIL MODAL ── */}
      {addModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setAddModal(null) }}>
          <div className="bg-slate-800 rounded-t-3xl sm:rounded-3xl border border-slate-700 w-full sm:max-w-sm p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">+ Διαθεσιμότητα Φορτηγού</h2>
              <p className="text-slate-400 text-sm">{format(addModal, 'EEEE d MMMM yyyy', { locale: el })}</p>
            </div>

            {/* Truck selector */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">Φορτηγό</label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {trucks.map(t => {
                  const ds = format(addModal, 'yyyy-MM-dd')
                  const { chip } = truckDayStatus(t.tr, ds)
                  return (
                    <button key={t.tr}
                      onClick={() => setAddForm(f => ({ ...f, truck: t.tr }))}
                      className={`py-2 px-3 rounded-xl text-sm border transition-colors text-left ${
                        addForm.truck === t.tr
                          ? 'bg-blue-600 border-blue-500 text-white font-bold'
                          : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                      }`}
                    >
                      <div className="font-medium">{t.tr}</div>
                      {t.driver && <div className="text-xs opacity-60 truncate">{t.driver}</div>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">Κατάσταση</label>
              <div className="grid grid-cols-2 gap-2">
                {AVAIL_STATUSES.map(s => (
                  <button key={s.key}
                    onClick={() => setAddForm(f => ({ ...f, status: s.key }))}
                    className={`py-2 px-3 rounded-xl text-sm border transition-colors ${
                      addForm.status === s.key ? s.color + ' font-bold' : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                    }`}
                  >{s.label}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Τοποθεσία</label>
              <input
                value={addForm.location}
                onChange={e => setAddForm(f => ({ ...f, location: e.target.value }))}
                placeholder="π.χ. Μιλάνο, Θεσσαλονίκη..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Σημείωση</label>
              <input
                value={addForm.notes}
                onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="π.χ. Επιστρέφει Δευτέρα..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setAddModal(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm">
                Ακύρωση
              </button>
              <button onClick={saveAvail} disabled={addSaving || !addForm.truck}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium">
                {addSaving ? '...' : '💾 Αποθήκευση'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
