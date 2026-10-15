import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, isToday, isFuture, isPast, parseISO } from 'date-fns'
import { el } from 'date-fns/locale'

export default function Dashboard() {
  const [orders, setOrders] = useState([])
  const [clients, setClients] = useState([])
  const [memo, setMemo] = useState('')
  const [memoId, setMemoId] = useState(null)
  const [openPay, setOpenPay] = useState(true)
  const [openOverdue, setOpenOverdue] = useState(false)
  const [openCards, setOpenCards] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: ord }, { data: cli }, { data: mem }] = await Promise.all([
      supabase.from('orders').select('*').not('status', 'eq', 'Delivered'),
      supabase.from('clients').select('id,name,next_card_date,total_debt'),
      supabase.from('memos').select('*').limit(1).maybeSingle(),
    ])
    setOrders(ord || [])
    setClients(cli || [])
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

  // Stats
  const open   = orders.filter(o => o.status === 'Open').length
  const transit= orders.filter(o => o.status === 'Μεταφορά').length
  const assigned=orders.filter(o => o.status === 'Ανατεθειμένη').length

  // Cards due
  const cardsDue = clients
    .filter(c => c.next_card_date && (isToday(parseISO(c.next_card_date)) || isFuture(parseISO(c.next_card_date))))
    .sort((a,b) => parseISO(a.next_card_date) - parseISO(b.next_card_date))

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-white">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon="📦" label="Ανοιχτές" value={open}    color="blue" />
        <StatCard icon="✅" label="Ανατεθ."  value={assigned} color="orange" />
        <StatCard icon="🚚" label="Μεταφορά" value={transit}  color="green" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Memo */}
        <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700">
          <h2 className="text-lg font-bold text-white mb-4">📌 Σημείωμα</h2>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={5}
            placeholder="Γράψε σημειώσεις για σήμερα..."
            className="w-full bg-slate-700 rounded-xl p-3 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
          />
          <button
            onClick={saveMemo}
            className="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            💾 Αποθήκευση
          </button>
        </div>

        {/* Upcoming cards */}
        <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700">
          <button
            className="w-full flex items-center justify-between text-left"
            onClick={() => setOpenCards(v => !v)}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🔔</span>
              <span className="text-white font-bold">Επερχόμενες Καρτέλες</span>
              {cardsDue.length > 0 && (
                <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">{cardsDue.length}</span>
              )}
            </div>
            <span className="text-slate-400">{openCards ? '▲' : '▼'}</span>
          </button>
          {openCards && (
            <div className="mt-4 space-y-2">
              {cardsDue.length === 0 ? (
                <p className="text-slate-500 text-sm">Δεν υπάρχουν</p>
              ) : cardsDue.map(c => (
                <div key={c.id} className="bg-slate-700 rounded-xl px-4 py-3 flex justify-between items-center">
                  <span className="text-white text-sm font-medium truncate">{c.name}</span>
                  <span className="text-orange-400 text-xs ml-2 shrink-0">
                    {format(parseISO(c.next_card_date), 'd MMM', { locale: el })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent orders */}
      <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700">
        <h2 className="text-lg font-bold text-white mb-4">📦 Τελευταίες Παραγγελίες</h2>
        {loading ? (
          <p className="text-slate-400 text-sm">Φόρτωση...</p>
        ) : orders.length === 0 ? (
          <p className="text-slate-500 text-sm">Δεν υπάρχουν ανοιχτές παραγγελίες</p>
        ) : (
          <div className="space-y-2">
            {orders.slice(0,8).map(o => (
              <div key={o.id} className="bg-slate-700 rounded-xl px-4 py-3 flex items-center gap-4">
                <StatusBadge status={o.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{o.client}</p>
                  <p className="text-slate-400 text-xs">{o.firm} · {o.from} → {o.to}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-slate-300 text-sm">{o.qty} {o.pal === 'E' ? 'EPAL' : o.pal === 'B' ? 'Βιομ.' : o.pal}</p>
                  <p className="text-slate-500 text-xs">{o.rdy}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }) {
  const colors = {
    blue:   'from-blue-900/50 to-blue-800/30 border-blue-700/50 text-blue-400',
    orange: 'from-orange-900/50 to-orange-800/30 border-orange-700/50 text-orange-400',
    green:  'from-green-900/50 to-green-800/30 border-green-700/50 text-green-400',
  }
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-3xl p-6`}>
      <div className="text-3xl mb-2">{icon}</div>
      <div className={`text-4xl font-bold ${colors[color].split(' ')[3]}`}>{value}</div>
      <div className="text-slate-400 text-sm mt-1">{label}</div>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    'Open':          'bg-blue-900/50 text-blue-300',
    'Ανατεθειμένη': 'bg-orange-900/50 text-orange-300',
    'Μεταφορά':      'bg-green-900/50 text-green-300',
    'Παράδοση':      'bg-purple-900/50 text-purple-300',
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-lg shrink-0 ${map[status] || 'bg-slate-700 text-slate-300'}`}>
      {status}
    </span>
  )
}
