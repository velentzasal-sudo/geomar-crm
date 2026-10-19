import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, startOfWeek, addDays, isSameMonth, isToday, isSameDay } from 'date-fns'
import { el } from 'date-fns/locale'

const STATUS_COLORS = {
  'Open':          'bg-blue-600',
  'Ανατεθειμένη': 'bg-orange-500',
  'Μεταφορά':      'bg-green-600',
  'Παράδοση':      'bg-purple-600',
  'Delivered':     'bg-slate-600',
}

export default function Calendar() {
  const [orders, setOrders]       = useState([])
  const [payments, setPayments]   = useState([])
  const [availRecords, setAvailRecords] = useState([])
  const [loading, setLoading]     = useState(true)
  const [current, setCurrent]     = useState(new Date())
  const [selected, setSelected]   = useState(null)
  const [showPayments, setShowPayments] = useState(true)
  const [showOrders, setShowOrders]     = useState(true)
  const [showAvail, setShowAvail]       = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ord }, { data: pay }, { data: av }] = await Promise.all([
      supabase.from('orders').select('id,client,from,to,status,rdy,load_date,delivery_date,truck').order('rdy'),
      supabase.from('payments').select('*').eq('paid', false).order('due_date'),
      supabase.from('avail').select('*'),
    ])
    setOrders(ord || [])
    setPayments(pay || [])
    setAvailRecords(av || [])
    setLoading(false)
  }

  // Available trucks for a day: avail record with nt = 'Διαθέσιμο' AND date matches
  function availForDay(date) {
    const ds = format(date, 'yyyy-MM-dd')
    return availRecords.filter(a => a.fr === ds && a.nt === 'Διαθέσιμο')
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

  if (loading) return <div className="p-6 text-slate-400">Φόρτωση...</div>

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-white">📅 Ημερολόγιο</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggles */}
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
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'].map(day => (
            <div key={day} className="text-center text-slate-500 text-xs font-medium py-2">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
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
                  {dayAvail.slice(0, 2).map(a => (
                    <div key={a.id} className="text-xs px-1 py-0.5 rounded bg-green-900/60 text-green-300 truncate">
                      🚛 {a.tr}
                    </div>
                  ))}
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
          <h2 className="text-white font-bold">
            {format(selected, 'd MMMM yyyy', { locale: el })}
            <span className="ml-2 text-slate-400 text-sm font-normal">
              {selectedOrders.length + selectedPayments.length + selectedAvail.length} εγγραφές
            </span>
          </h2>

          {/* Available trucks */}
          {showAvail && selectedAvail.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">🚛 Διαθέσιμα Φορτηγά</p>
              <div className="flex flex-wrap gap-2">
                {selectedAvail.map(a => (
                  <div key={a.id} className="bg-green-900/30 border border-green-700/50 rounded-xl px-3 py-2 flex items-center gap-2">
                    <span className="text-green-300 font-bold text-sm">{a.tr}</span>
                    {a.ct && <span className="text-slate-400 text-xs">📍 {a.ct}</span>}
                    {a.co && <span className="text-slate-500 text-xs italic">{a.co}</span>}
                  </div>
                ))}
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
    </div>
  )
}
