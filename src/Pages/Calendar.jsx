import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, startOfWeek, addDays, isSameMonth, isToday, isSameDay } from 'date-fns'
import { el } from 'date-fns/locale'

const TLDM = 13.20
const LDM_FACTORS = { E: 0.40, B: 0.50, P: 0.60, M: 1.00 }
const STATUSES = ['Open', 'Ανατεθειμένη', 'Μεταφορά', 'Παράδοση', 'Delivered']
const PAL_TYPES = ['E', 'B', 'P', 'M', 'χύμα']
const ORDER_EMPTY = {
  client:'', firm:'', from:'', to:'', recip:'',
  pal:'E', qty:'', ldm:'', wgt:'', tmp:'',
  rdy:'', load_date:'', delivery_date:'', price:'', notes:'', status:'Open', truck:'',
}
function calcLdmVal(pal, qty) {
  if (!qty || pal === 'χύμα') return ''
  const f = LDM_FACTORS[pal]
  return f ? (parseFloat(qty) * f).toFixed(2) : ''
}

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

function OField({ label, name, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input type={type} name={name} value={value ?? ''} onChange={onChange}
        className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
    </div>
  )
}

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
  const [truckSearch, setTruckSearch] = useState('')
  const [truckOpen, setTruckOpen]     = useState(false)

  // Order edit modal (inline from calendar)
  const [orderModal, setOrderModal] = useState(null) // order object or 'new'
  const [orderForm, setOrderForm]   = useState(ORDER_EMPTY)
  const [orderSaving, setOrderSaving] = useState(false)
  const [clients, setClients]       = useState([])
  const [firms, setFirms]           = useState([])
  const [orderErrors, setOrderErrors] = useState({})

  // Banner: trucks delivering today
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const navigate = useNavigate()

  useEffect(() => { loadAll() }, [])
  useEffect(() => {
    supabase.from('clients').select('id,name,city,address').order('name').then(({ data }) => setClients(data || []))
    supabase.from('firms').select('id,name,street,num,city,country').order('name').then(({ data }) => setFirms(data || []))
  }, [])

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

  // Trucks delivering today (delivery_date = today, not yet Delivered)
  const deliveringToday = trucks.filter(t =>
    orders.some(o => o.truck === t.tr && o.delivery_date?.substring(0,10) === todayStr && o.status !== 'Delivered')
  )

  async function markAvailTomorrow(trList) {
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
    for (const t of trList) {
      const exists = availRecords.find(a => a.tr === t.tr && a.fr === tomorrow)
      if (!exists) {
        await supabase.from('avail').insert([{ tr: t.tr, fr: tomorrow, nt: 'Διαθέσιμο', ct: '', co: 'Αυτόματο από παράδοση' }])
      }
    }
    loadAll()
  }

  // Order modal helpers
  function openOrderEdit(o) {
    setOrderForm({ ...o })
    setOrderErrors({})
    setOrderModal(o)
  }

  function handleOrderChange(e) {
    const { name, value } = e.target
    setOrderForm(f => {
      const next = { ...f, [name]: value }
      if (name === 'qty' || name === 'pal') next.ldm = calcLdmVal(next.pal, next.qty)
      return next
    })
  }

  async function saveOrder() {
    if (!orderForm.client?.trim()) { setOrderErrors({ client: 'Υποχρεωτικό' }); return }
    setOrderSaving(true)
    const { id: _id, ...rest } = orderForm
    const payload = {
      ...rest,
      qty: parseFloat(orderForm.qty)||0,
      ldm: parseFloat(orderForm.ldm)||0,
      wgt: parseFloat(orderForm.wgt)||0,
      price: parseFloat(orderForm.price)||0,
      load_date: orderForm.load_date || null,
      delivery_date: orderForm.delivery_date || null,
      rdy: orderForm.rdy || null,
    }
    await supabase.from('orders').update(payload).eq('id', orderModal.id)
    setOrderSaving(false)
    setOrderModal(null)
    loadAll()
  }

  // Open add avail modal for a date
  function openAddModal(date) {
    setAddModal(date)
    setAddForm({ truck: '', status: 'Διαθέσιμο', location: '', notes: '' })
    setTruckSearch('')
    setTruckOpen(false)
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
    <div className="p-4 md:p-6 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
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

      {/* Banner: trucks delivering today */}
      {deliveringToday.length > 0 && (
        <div className="bg-green-900/30 border border-green-700/50 rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-green-300 text-sm font-medium">🏁 Παραδίδουν σήμερα:</span>
          <div className="flex gap-2 flex-wrap flex-1">
            {deliveringToday.map(t => (
              <span key={t.tr} className="bg-green-800/50 text-green-200 text-xs px-2 py-1 rounded-lg border border-green-700">
                🚚 {t.tr}
              </span>
            ))}
          </div>
          <button
            onClick={() => markAvailTomorrow(deliveringToday)}
            className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-xl transition-colors shrink-0"
          >
            ✅ Διαθέσιμα αύριο
          </button>
        </div>
      )}

      {/* Main area: calendar + sidebar */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Calendar grid */}
        <div className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-3xl p-4">
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

        {/* Right sidebar — selected day details */}
        <div className={`flex-shrink-0 transition-all duration-200 ${selected ? 'w-80' : 'w-0 overflow-hidden'}`}>
          {selected && (
            <div className="w-80 bg-slate-800 border border-slate-700 rounded-3xl p-4 space-y-4 h-full overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-bold text-sm">
                    {format(selected, 'd MMMM yyyy', { locale: el })}
                  </h2>
                  <p className="text-slate-400 text-xs">
                    {selectedOrders.length + selectedPayments.length + selectedAvail.length} εγγραφές
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {showAvail && (
                    <button
                      onClick={() => openAddModal(selected)}
                      className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-1.5 rounded-xl transition-colors"
                    >
                      + Διαθ.
                    </button>
                  )}
                  <button
                    onClick={() => setSelected(null)}
                    className="text-slate-500 hover:text-white text-lg leading-none px-1"
                  >×</button>
                </div>
              </div>

              {/* Available trucks */}
              {showAvail && selectedAvail.length > 0 && (
                <div>
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">🚛 Φορτηγά</p>
                  <div className="space-y-2">
                    {selectedAvail.map(a => {
                      const ds = format(selected, 'yyyy-MM-dd')
                      const { chip, label } = truckDayStatus(a.tr, ds)
                      return (
                        <div key={a.id} className={`border rounded-xl px-3 py-2 ${chip}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm">{a.tr}</span>
                            <button
                              onClick={() => navigate(`/fleet?truck=${encodeURIComponent(a.tr)}`)}
                              className="px-2 py-0.5 rounded-lg bg-black/20 hover:bg-black/40 text-xs transition-colors"
                            >🚚 →</button>
                          </div>
                          <div className="text-xs opacity-70 mt-0.5 flex gap-2 flex-wrap">
                            <span>{a.nt}</span>
                            {a.ct && <span>📍 {a.ct}</span>}
                            {label && <span className="font-medium">{label}</span>}
                          </div>
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
                      <button key={o.id} onClick={() => openOrderEdit(o)}
                        className="w-full text-left bg-slate-700 hover:bg-slate-600 rounded-xl px-3 py-2 transition-colors group">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-lg text-white shrink-0 ${STATUS_COLORS[o.status] || 'bg-slate-600'}`}>
                            {o.status}
                          </span>
                          {o.truck && <span className="text-slate-500 text-xs">🚛 {o.truck}</span>}
                          <span className="ml-auto text-slate-600 group-hover:text-slate-400 text-xs">✏️</span>
                        </div>
                        <p className="text-white text-sm font-medium truncate">{o.client}</p>
                        <p className="text-slate-400 text-xs">{o.from} → {o.to}</p>
                      </button>
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
                      <div key={p.id} className="bg-purple-900/30 border border-purple-800/50 rounded-xl px-3 py-2">
                        <p className="text-white text-sm font-medium">{p.client_name}</p>
                        {p.notes && <p className="text-slate-400 text-xs mt-0.5">{p.notes}</p>}
                        <p className="text-purple-300 font-bold text-sm mt-1">
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
        </div>

      </div>

      {/* ── ORDER EDIT MODAL ── */}
      {orderModal && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-2 md:p-4 md:items-center"
          onClick={e => { if (e.target === e.currentTarget) setOrderModal(null) }}>
          <div className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-2xl max-h-[95vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">✏️ Επεξεργασία Παραγγελίας</h2>
                <button onClick={() => setOrderModal(null)} className="text-slate-400 hover:text-white text-xl">×</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Πελάτης */}
                <div className="col-span-2">
                  <label className={`block text-xs mb-1 ${orderErrors.client ? 'text-red-400' : 'text-slate-400'}`}>Πελάτης *</label>
                  <input name="client" value={orderForm.client} onChange={handleOrderChange}
                    className={`w-full bg-slate-700 border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 ${orderErrors.client ? 'border-red-500' : 'border-slate-600'}`} />
                </div>
                <OField label="Από" name="from" value={orderForm.from} onChange={handleOrderChange} />
                <OField label="Προς" name="to" value={orderForm.to} onChange={handleOrderChange} />
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Τύπος</label>
                  <select name="pal" value={orderForm.pal} onChange={handleOrderChange}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    {PAL_TYPES.map(p => <option key={p} value={p}>{p === 'E' ? 'EPAL' : p === 'B' ? 'Βιομ.' : p === 'P' ? 'Μισή' : p === 'M' ? 'Μέτρο' : 'Χύμα'}</option>)}
                  </select>
                </div>
                <OField label="Τεμάχια" name="qty" type="number" value={orderForm.qty} onChange={handleOrderChange} />
                <OField label="LDM" name="ldm" type="number" value={orderForm.ldm} onChange={handleOrderChange} />
                <OField label="Βάρος (kg)" name="wgt" type="number" value={orderForm.wgt} onChange={handleOrderChange} />
                <OField label="Ημ. Φόρτωσης" name="load_date" type="date" value={orderForm.load_date} onChange={handleOrderChange} />
                <OField label="Ημ. Παράδοσης" name="delivery_date" type="date" value={orderForm.delivery_date} onChange={handleOrderChange} />
                <OField label="Τιμή (€)" name="price" type="number" value={orderForm.price} onChange={handleOrderChange} />
                <div className="relative">
                  <label className="block text-xs text-slate-400 mb-1">Φορτηγό</label>
                  <button
                    type="button"
                    onClick={() => setTruckOpen(o => !o)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-sm transition-colors ${
                      orderForm.truck ? 'bg-slate-700 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'
                    }`}
                  >
                    <span>{orderForm.truck || 'Επιλογή φορτηγού...'}</span>
                    <span className="text-slate-500">{truckOpen ? '▲' : '▼'}</span>
                  </button>
                  {truckOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-600 rounded-xl shadow-xl overflow-hidden">
                      <div className="p-2 border-b border-slate-700">
                        <input
                          autoFocus
                          value={truckSearch}
                          onChange={e => setTruckSearch(e.target.value)}
                          placeholder="Αναζήτηση..."
                          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        <button
                          type="button"
                          onClick={() => { setOrderForm(f => ({ ...f, truck: '' })); setTruckOpen(false); setTruckSearch('') }}
                          className="w-full text-left px-3 py-2 text-slate-400 text-sm hover:bg-slate-700"
                        >— Χωρίς φορτηγό</button>
                        {trucks
                          .filter(t => t.tr.toLowerCase().includes(truckSearch.toLowerCase()) || (t.driver || '').toLowerCase().includes(truckSearch.toLowerCase()))
                          .map(t => (
                            <button key={t.tr} type="button"
                              onClick={() => { setOrderForm(f => ({ ...f, truck: t.tr })); setTruckOpen(false); setTruckSearch('') }}
                              className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-slate-700 transition-colors ${orderForm.truck === t.tr ? 'bg-blue-900/40' : ''}`}
                            >
                              <span className="text-white text-sm font-medium">{t.tr}</span>
                              {t.driver && <span className="text-slate-400 text-xs">{t.driver}</span>}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Status</label>
                  <select name="status" value={orderForm.status} onChange={handleOrderChange}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Σημειώσεις</label>
                  <textarea name="notes" value={orderForm.notes || ''} onChange={handleOrderChange} rows={2}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setOrderModal(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm">Ακύρωση</button>
                <button onClick={saveOrder} disabled={orderSaving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium">
                  {orderSaving ? 'Αποθήκευση...' : '💾 Αποθήκευση'}
                </button>
              </div>
            </div>
          </div>
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

            {/* Truck selector — searchable dropdown */}
            <div className="relative">
              <label className="block text-xs text-slate-400 mb-2">Φορτηγό</label>
              <button
                type="button"
                onClick={() => { setTruckOpen(o => !o); setTruckSearch('') }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-sm transition-colors ${
                  addForm.truck ? 'bg-slate-700 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'
                }`}
              >
                <span>{addForm.truck || 'Επιλογή φορτηγού...'}</span>
                <span className="text-slate-500">{truckOpen ? '▲' : '▼'}</span>
              </button>
              {truckOpen && (
                <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-600 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-slate-700">
                    <input
                      autoFocus
                      value={truckSearch}
                      onChange={e => setTruckSearch(e.target.value)}
                      placeholder="Αναζήτηση..."
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {trucks
                      .filter(t => t.tr.toLowerCase().includes(truckSearch.toLowerCase()) || (t.driver || '').toLowerCase().includes(truckSearch.toLowerCase()))
                      .map(t => {
                        const ds = format(addModal, 'yyyy-MM-dd')
                        const { chip } = truckDayStatus(t.tr, ds)
                        return (
                          <button key={t.tr}
                            onClick={() => { setAddForm(f => ({ ...f, truck: t.tr })); setTruckOpen(false) }}
                            className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-slate-700 transition-colors ${addForm.truck === t.tr ? 'bg-blue-900/40' : ''}`}
                          >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${chip.includes('green') ? 'bg-green-400' : chip.includes('red') ? 'bg-red-400' : chip.includes('orange') ? 'bg-orange-400' : 'bg-slate-400'}`} />
                            <div>
                              <div className="text-white text-sm font-medium">{t.tr}</div>
                              {t.driver && <div className="text-slate-400 text-xs">{t.driver}</div>}
                            </div>
                          </button>
                        )
                      })}
                    {trucks.filter(t => t.tr.toLowerCase().includes(truckSearch.toLowerCase()) || (t.driver || '').toLowerCase().includes(truckSearch.toLowerCase())).length === 0 && (
                      <div className="px-3 py-4 text-slate-500 text-sm text-center">Δεν βρέθηκαν</div>
                    )}
                  </div>
                </div>
              )}
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
