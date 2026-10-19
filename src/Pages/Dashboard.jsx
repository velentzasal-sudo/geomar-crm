import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, isToday, isFuture, isPast, parseISO, addDays } from 'date-fns'
import { el } from 'date-fns/locale'

export default function Dashboard() {
  const [orders, setOrders] = useState([])
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [memo, setMemo] = useState('')
  const [memoId, setMemoId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ord }, { data: cli }, { data: mem }, { data: pay }] = await Promise.all([
      supabase.from('orders').select('*').not('status', 'eq', 'Delivered'),
      supabase.from('clients').select('id,name,next_card_date,total_debt'),
      supabase.from('memos').select('*').limit(1).maybeSingle(),
      supabase.from('payments').select('*').eq('paid', false).order('due_date'),
    ])
    setOrders(ord || [])
    setClients(cli || [])
    setPayments(pay || [])
    if (mem) { setMemo(mem.content || ''); setMemoId(mem.id) }
    setLoading(false)
  }

  async function saveMemo() {
    if (memoId) {
      await supabase.from('memos').update({ content: memo }).eq('id', memoId)
    } else {
      const { data } = await supabase.from('memos').insert([{ content: memo }]).select().single()
      setMemoId(data?.id)
    }
  }

  const today = new Date()
  const in7days = addDays(today, 7)

  const open     = orders.filter(o => o.status === 'Open').length
  const transit  = orders.filter(o => o.status === 'Μεταφορά').length
  const assigned = orders.filter(o => o.status === 'Ανατεθειμένη').length

  const cardsOverdue = clients.filter(c => {
    if (!c.next_card_date) return false
    const d = parseISO(c.next_card_date)
    return isToday(d) || isPast(d)
  }).sort((a, b) => parseISO(a.next_card_date) - parseISO(b.next_card_date))

  const cardsSoon = clients.filter(c => {
    if (!c.next_card_date) return false
    const d = parseISO(c.next_card_date)
    return isFuture(d) && d <= in7days
  }).sort((a, b) => parseISO(a.next_card_date) - parseISO(b.next_card_date))

  const overduePayments = payments.filter(p =>
    p.due_date && isPast(parseISO(p.due_date)) && !isToday(parseISO(p.due_date))
  )
  const soonPayments = payments.filter(p => {
    if (!p.due_date) return false
    const d = parseISO(p.due_date)
    return (isToday(d) || isFuture(d)) && d <= in7days
  })

  const hasAlerts = cardsOverdue.length > 0 || overduePayments.length > 0

  return (
    <div className="p-5 space-y-4 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-500 text-sm">{format(today, 'EEEE d MMMM yyyy', { locale: el })}</p>
      </div>

      {/* ── RED ALERTS ── */}
      {hasAlerts && (
        <div className="bg-red-950/60 border border-red-700/70 rounded-2xl p-4">
          <p className="text-red-300 font-bold text-xs uppercase tracking-wide mb-2">🚨 Απαιτείται ενέργεια</p>
          <div className="space-y-1.5">
            {cardsOverdue.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-red-900/30 rounded-xl px-3 py-2">
                <span className="text-white text-sm">📅 Καρτέλα — <span className="font-semibold">{c.name}</span></span>
                <span className="text-red-400 text-xs font-medium">{format(parseISO(c.next_card_date), 'd MMM', { locale: el })}</span>
              </div>
            ))}
            {overduePayments.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-red-900/30 rounded-xl px-3 py-2">
                <span className="text-white text-sm">💰 Πληρωμή — <span className="font-semibold">{p.client_name}</span></span>
                <span className="text-red-400 text-xs font-medium">€{(parseFloat(p.amount)||0).toLocaleString('el-GR')} · {format(parseISO(p.due_date), 'd MMM', { locale: el })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STATS ── */}
      <div className="grid grid-cols-3 gap-3">
        <Stat icon="📦" label="Ανοιχτές" value={open} color="blue" />
        <Stat icon="🔗" label="Ανατεθ." value={assigned} color="orange" />
        <Stat icon="🚚" label="Μεταφορά" value={transit} color="green" />
      </div>

      {/* ── AMBER: UPCOMING 7 DAYS ── */}
      {(cardsSoon.length > 0 || soonPayments.length > 0) && (
        <div className="bg-amber-950/40 border border-amber-700/40 rounded-2xl p-4">
          <p className="text-amber-400 font-semibold text-xs uppercase tracking-wide mb-2">⏰ Επόμενες 7 ημέρες</p>
          <div className="space-y-1.5">
            {cardsSoon.map(c => (
              <div key={c.id} className="flex justify-between bg-slate-800 rounded-xl px-3 py-2">
                <span className="text-slate-200 text-sm">📅 {c.name}</span>
                <span className="text-amber-400 text-xs">{format(parseISO(c.next_card_date), 'EEE d MMM', { locale: el })}</span>
              </div>
            ))}
            {soonPayments.map(p => (
              <div key={p.id} className="flex justify-between bg-slate-800 rounded-xl px-3 py-2">
                <span className="text-slate-200 text-sm">💰 {p.client_name}</span>
                <span className="text-amber-400 text-xs">€{(parseFloat(p.amount)||0).toLocaleString('el-GR')} · {format(parseISO(p.due_date), 'EEE d MMM', { locale: el })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BOTTOM: MEMO + ORDERS ── */}
      <div className="grid grid-cols-5 gap-4">
        {/* Memo */}
        <div className="col-span-2 bg-slate-800 rounded-2xl p-4 border border-slate-700 flex flex-col">
          <h2 className="text-sm font-bold text-white mb-2">📌 Σημείωμα</h2>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={6}
            placeholder="Σημειώσεις ημέρας..."
            className="flex-1 w-full bg-slate-700 rounded-xl p-3 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
          />
          <button onClick={saveMemo}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-medium">
            💾 Αποθήκευση
          </button>
        </div>

        {/* Recent orders */}
        <div className="col-span-3 bg-slate-800 rounded-2xl p-4 border border-slate-700">
          <h2 className="text-sm font-bold text-white mb-2">📦 Ανοιχτές Παραγγελίες</h2>
          {loading ? (
            <p className="text-slate-500 text-sm">Φόρτωση...</p>
          ) : orders.length === 0 ? (
            <p className="text-slate-500 text-sm">Δεν υπάρχουν</p>
          ) : (
            <div className="space-y-1.5 overflow-y-auto max-h-64">
              {orders.slice(0, 10).map(o => (
                <div key={o.id} className="bg-slate-700 rounded-xl px-3 py-2 flex items-center gap-2">
                  <StatusBadge status={o.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{o.client}</p>
                    <p className="text-slate-400 text-xs truncate">{o.from} → {o.to}</p>
                  </div>
                  <p className="text-slate-400 text-xs shrink-0">{o.qty} {o.pal === 'E' ? 'EPAL' : o.pal}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, label, value, color }) {
  const ring = { blue: 'border-blue-700/50', orange: 'border-orange-700/50', green: 'border-green-700/50' }
  const num  = { blue: 'text-blue-400',      orange: 'text-orange-400',      green: 'text-green-400' }
  return (
    <div className={`bg-slate-800 border ${ring[color]} rounded-2xl px-4 py-3 flex items-center gap-3`}>
      <span className="text-xl">{icon}</span>
      <div>
        <p className={`text-2xl font-bold leading-none ${num[color]}`}>{value}</p>
        <p className="text-slate-500 text-xs mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    'Open':           'bg-blue-900/60 text-blue-300',
    'Ανατεθειμένη':  'bg-orange-900/60 text-orange-300',
    'Μεταφορά':       'bg-green-900/60 text-green-300',
    'Παράδοση':       'bg-purple-900/60 text-purple-300',
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-md shrink-0 ${map[status] || 'bg-slate-600 text-slate-300'}`}>
      {status}
    </span>
  )
}
