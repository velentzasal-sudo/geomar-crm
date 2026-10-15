import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, startOfWeek, addDays, isSameMonth, isToday, parseISO, isSameDay } from 'date-fns'
import { el } from 'date-fns/locale'

const STATUS_COLORS = {
  'Open':          'bg-blue-600',
  'Ανατεθειμένη': 'bg-orange-500',
  'Μεταφορά':      'bg-green-600',
  'Παράδοση':      'bg-purple-600',
  'Delivered':     'bg-slate-600',
}

export default function Calendar() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(new Date())
  const [selected, setSelected] = useState(null)

  useEffect(() => { loadOrders() }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabase.from('orders').select('id,client,from,to,status,rdy,load_date,delivery_date').order('rdy')
    setOrders(data || [])
    setLoading(false)
  }

  // Build calendar grid
  const monthStart = startOfMonth(current)
  const monthEnd = endOfMonth(current)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
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
      const rdy = o.rdy ? o.rdy.substring(0, 10) : null
      const ld = o.load_date ? o.load_date.substring(0, 10) : null
      const dd = o.delivery_date ? o.delivery_date.substring(0, 10) : null
      return rdy === ds || ld === ds || dd === ds
    })
  }

  const selectedOrders = selected ? ordersForDay(selected) : []

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">📅 Ημερολόγιο</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">◀</button>
          <span className="text-white font-medium">
            {format(current, 'MMMM yyyy', { locale: el })}
          </span>
          <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">▶</button>
          <button onClick={() => setCurrent(new Date())}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm">Σήμερα</button>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-3xl p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'].map(d => (
            <div key={d} className="text-center text-slate-500 text-xs font-medium py-2">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            const dayOrders = ordersForDay(day)
            const inMonth = isSameMonth(day, current)
            const isSelected = selected && isSameDay(day, selected)
            const todayClass = isToday(day) ? 'ring-2 ring-blue-500' : ''

            return (
              <button
                key={i}
                onClick={() => setSelected(isSelected ? null : day)}
                className={`min-h-[72px] p-1.5 rounded-xl text-left transition-colors ${
                  isSelected ? 'bg-blue-900/50' : 'hover:bg-slate-700'
                } ${!inMonth ? 'opacity-30' : ''} ${todayClass}`}
              >
                <p className={`text-xs font-medium mb-1 ${isToday(day) ? 'text-blue-400' : 'text-slate-300'}`}>
                  {format(day, 'd')}
                </p>
                <div className="space-y-0.5">
                  {dayOrders.slice(0, 3).map(o => (
                    <div key={o.id} className={`text-xs px-1 py-0.5 rounded text-white truncate ${STATUS_COLORS[o.status] || 'bg-slate-600'}`}>
                      {o.client}
                    </div>
                  ))}
                  {dayOrders.length > 3 && (
                    <div className="text-xs text-slate-500 pl-1">+{dayOrders.length - 3}</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day orders */}
      {selected && (
        <div className="bg-slate-800 border border-slate-700 rounded-3xl p-5">
          <h2 className="text-white font-bold mb-4">
            {format(selected, 'd MMMM yyyy', { locale: el })}
            <span className="ml-2 text-slate-400 text-sm font-normal">({selectedOrders.length} παραγγελίες)</span>
          </h2>
          {selectedOrders.length === 0 ? (
            <p className="text-slate-500 text-sm">Δεν υπάρχουν παραγγελίες</p>
          ) : (
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
