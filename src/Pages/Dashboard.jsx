import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, isToday, isFuture, isPast, parseISO, addDays } from 'date-fns'
import { el } from 'date-fns/locale'

export default function Dashboard() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [memo, setMemo] = useState('')
  const [memoId, setMemoId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [trucks, setTrucks] = useState([])
  const [avail, setAvail] = useState([])
  const [editModal, setEditModal] = useState(null) // { tr, alias, availId? }
  const [editForm, setEditForm] = useState({ status: 'Εν κινήσει', location: '', notes: '' })
  const [editSaving, setEditSaving] = useState(false)

  const AVAIL_STATUSES = [
    { key: 'Διαθέσιμο',  color: 'bg-green-900/60 text-green-300 border-green-700' },
    { key: 'Εν κινήσει', color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700' },
    { key: 'Service',    color: 'bg-red-900/60 text-red-300 border-red-700' },
  ]

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const [{ data: ord }, { data: cli }, { data: mem }, { data: pay }, { data: trk }, { data: av }] = await Promise.all([
      supabase.from('orders').select('*').not('status', 'eq', 'Delivered'),
      supabase.from('clients').select('id,name,next_card_date,total_debt'),
      supabase.from('memos').select('*').limit(1).maybeSingle(),
      supabase.from('payments').select('*').eq('paid', false).order('due_date'),
      supabase.from('trucks').select('tr,alias'),
      supabase.from('avail').select('*').eq('fr', todayStr),
    ])
    setOrders(ord || [])
    setClients(cli || [])
    setPayments(pay || [])
    setTrucks(trk || [])
    setAvail(av || [])
    if (mem) { setMemo(mem.content || ''); setMemoId(mem.id) }
    setLoading(false)
  }

  function openEdit(truck) {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const rec = avail.find(a => a.tr === truck.tr)
    setEditForm({
      status:   rec?.nt || truck.status || 'Εν κινήσει',
      location: rec?.ct || truck.location || '',
      notes:    rec?.co || truck.notes || '',
    })
    setEditModal({ tr: truck.tr, alias: truck.alias, availId: rec?.id || null, todayStr })
  }

  async function saveEdit() {
    if (!editModal) return
    setEditSaving(true)
    const payload = { tr: editModal.tr, fr: editModal.todayStr, nt: editForm.status, ct: editForm.location, co: editForm.notes }
    if (editModal.availId) {
      await supabase.from('avail').update(payload).eq('id', editModal.availId)
    } else {
      await supabase.from('avail').insert([payload])
    }
    setEditSaving(false)
    setEditModal(null)
    // Reload avail
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase.from('avail').select('*').eq('fr', todayStr)
    setAvail(data || [])
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

  const todayStr = format(today, 'yyyy-MM-dd')

  // Φορτηγά από avail (manual)
  const availToday = avail.map(a => {
    const t = trucks.find(t => t.tr === a.tr)
    return { id: a.id, tr: a.tr, alias: t?.alias || a.tr, status: a.nt, location: a.ct, notes: a.co, source: 'avail' }
  })

  // Φορτηγά από παραγγελίες (αυτόματα) — status Μεταφορά ή Ανατεθειμένη με truck
  const ordersToday = orders
    .filter(o => o.truck && ['Μεταφορά','Ανατεθειμένη','Παράδοση'].includes(o.status))
    .map(o => {
      const t = trucks.find(t => t.tr === o.truck)
      return { id: `ord-${o.id}`, tr: o.truck, alias: t?.alias || o.truck, status: o.status, location: o.from + ' → ' + o.to, notes: o.client, source: 'order' }
    })

  // Merge: avail overrides order for same truck
  const availTrucks = new Set(availToday.map(a => a.tr))
  const mergedTrucks = [
    ...availToday,
    ...ordersToday.filter(o => !availTrucks.has(o.tr)),
  ]

  // Ομαδοποίηση: Ιταλία / Ελλάδα / Άλλο
  function detectCountry(loc = '') {
    const l = loc.toLowerCase()
    if (l.includes('ιταλ') || l.includes('ital') || l.includes('μπαρ') || l.includes('bari') ||
        l.includes('βενετ') || l.includes('venet') || l.includes('μιλαν') || l.includes('milan') ||
        l.includes('ανκον') || l.includes('ancona') || l.includes('τριεστ') || l.includes('tries') ||
        l.includes('πατρ') && l.includes('μπαρ')) return 'IT'
    if (l.includes('ελλ') || l.includes('αθην') || l.includes('θεσσαλ') || l.includes('πατρ') ||
        l.includes('athen') || l.includes('thess') || l.includes('patras') || l.includes('greece')) return 'GR'
    return 'OTHER'
  }

  const trIT    = mergedTrucks.filter(t => detectCountry(t.location) === 'IT')
  const trGR    = mergedTrucks.filter(t => detectCountry(t.location) === 'GR')
  const trOther = mergedTrucks.filter(t => detectCountry(t.location) === 'OTHER')

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
    <div className="p-4 md:p-5 space-y-4 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-500 text-xs md:text-sm">{format(today, 'EEE d MMM yyyy', { locale: el })}</p>
      </div>

      {/* ── RED ALERTS ── */}
      {hasAlerts && (
        <div className="bg-red-950/60 border border-red-700/70 rounded-2xl p-4">
          <p className="text-red-300 font-bold text-xs uppercase tracking-wide mb-2">🚨 Απαιτείται ενέργεια</p>
          <div className="space-y-1.5">
            {cardsOverdue.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-red-900/30 rounded-xl px-3 py-2">
                <span className="text-white text-sm">📅 <span className="font-semibold">{c.name}</span></span>
                <span className="text-red-400 text-xs font-medium shrink-0 ml-2">{format(parseISO(c.next_card_date), 'd MMM', { locale: el })}</span>
              </div>
            ))}
            {overduePayments.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-red-900/30 rounded-xl px-3 py-2">
                <span className="text-white text-sm">💰 <span className="font-semibold">{p.client_name}</span></span>
                <span className="text-red-400 text-xs font-medium shrink-0 ml-2">€{(parseFloat(p.amount)||0).toLocaleString('el-GR')} · {format(parseISO(p.due_date), 'd MMM', { locale: el })}</span>
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

      {/* ── FLEET LOCATION ── */}
      {mergedTrucks.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
          <p className="text-white font-bold text-sm mb-3">📍 Πού είναι τα φορτηγά σήμερα</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Ιταλία */}
            <div className="bg-slate-700/50 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-400 mb-2">🇮🇹 Ιταλία <span className="text-white ml-1">{trIT.length}</span></p>
              {trIT.length === 0 ? <p className="text-slate-500 text-xs">—</p> : (
                <div className="space-y-1.5">
                  {trIT.map(t => <TruckRow key={t.id} truck={t} onEdit={() => openEdit(t)} />)}
                </div>
              )}
            </div>
            {/* Ελλάδα */}
            <div className="bg-slate-700/50 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-400 mb-2">🇬🇷 Ελλάδα <span className="text-white ml-1">{trGR.length}</span></p>
              {trGR.length === 0 ? <p className="text-slate-500 text-xs">—</p> : (
                <div className="space-y-1.5">
                  {trGR.map(t => <TruckRow key={t.id} truck={t} onEdit={() => openEdit(t)} />)}
                </div>
              )}
            </div>
            {/* Άλλο / Άγνωστο */}
            <div className="bg-slate-700/50 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-400 mb-2">🔀 Άλλο <span className="text-white ml-1">{trOther.length}</span></p>
              {trOther.length === 0 ? <p className="text-slate-500 text-xs">—</p> : (
                <div className="space-y-1.5">
                  {trOther.map(t => <TruckRow key={t.id} truck={t} onEdit={() => openEdit(t)} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AMBER: UPCOMING 7 DAYS ── */}
      {(cardsSoon.length > 0 || soonPayments.length > 0) && (
        <div className="bg-amber-950/40 border border-amber-700/40 rounded-2xl p-4">
          <p className="text-amber-400 font-semibold text-xs uppercase tracking-wide mb-2">⏰ Επόμενες 7 ημέρες</p>
          <div className="space-y-1.5">
            {cardsSoon.map(c => (
              <div key={c.id} className="flex justify-between bg-slate-800 rounded-xl px-3 py-2">
                <span className="text-slate-200 text-sm truncate">📅 {c.name}</span>
                <span className="text-amber-400 text-xs shrink-0 ml-2">{format(parseISO(c.next_card_date), 'EEE d MMM', { locale: el })}</span>
              </div>
            ))}
            {soonPayments.map(p => (
              <div key={p.id} className="flex justify-between bg-slate-800 rounded-xl px-3 py-2">
                <span className="text-slate-200 text-sm truncate">💰 {p.client_name}</span>
                <span className="text-amber-400 text-xs shrink-0 ml-2">€{(parseFloat(p.amount)||0).toLocaleString('el-GR')} · {format(parseISO(p.due_date), 'EEE d MMM', { locale: el })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BOTTOM: MEMO + ORDERS ── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Memo */}
        <div className="md:col-span-2 bg-slate-800 rounded-2xl p-4 border border-slate-700 flex flex-col">
          <h2 className="text-sm font-bold text-white mb-2">📌 Σημείωμα</h2>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={5}
            placeholder="Σημειώσεις ημέρας..."
            className="flex-1 w-full bg-slate-700 rounded-xl p-3 text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
          />
          <button onClick={saveMemo}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-medium">
            💾 Αποθήκευση
          </button>
        </div>

        {/* Recent orders */}
        <div className="md:col-span-3 bg-slate-800 rounded-2xl p-4 border border-slate-700">
          <h2 className="text-sm font-bold text-white mb-2">📦 Ανοιχτές Παραγγελίες</h2>
          {loading ? (
            <p className="text-slate-500 text-sm">Φόρτωση...</p>
          ) : orders.length === 0 ? (
            <p className="text-slate-500 text-sm">Δεν υπάρχουν</p>
          ) : (
            <div className="space-y-1.5 overflow-y-auto max-h-64">
              {orders.slice(0, 10).map(o => (
                <button
                  key={o.id}
                  onClick={() => navigate(`/orders?open=${o.id}`)}
                  className="w-full bg-slate-700 hover:bg-slate-600 rounded-xl px-3 py-2 flex items-center gap-2 text-left transition-colors"
                >
                  <StatusBadge status={o.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{o.client}</p>
                    <p className="text-slate-400 text-xs truncate">{o.from} → {o.to}</p>
                  </div>
                  <p className="text-slate-400 text-xs shrink-0">{o.qty} {o.pal === 'E' ? 'EPAL' : o.pal}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── EDIT AVAIL MODAL ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) setEditModal(null) }}>
          <div className="bg-slate-800 rounded-t-3xl sm:rounded-3xl border border-slate-700 w-full sm:max-w-sm p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">🚛 {editModal.alias || editModal.tr}</h2>
                <p className="text-slate-400 text-sm">Τοποθεσία σήμερα</p>
              </div>
              <button onClick={() => setEditModal(null)} className="text-slate-500 hover:text-white text-xl leading-none">✕</button>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">Κατάσταση</label>
              <div className="grid grid-cols-3 gap-2">
                {AVAIL_STATUSES.map(s => (
                  <button key={s.key}
                    onClick={() => setEditForm(f => ({ ...f, status: s.key }))}
                    className={`py-2 px-2 rounded-xl text-xs border transition-colors ${
                      editForm.status === s.key ? s.color + ' font-bold' : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                    }`}
                  >{s.key}</button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Τοποθεσία</label>
              <input
                value={editForm.location}
                onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                placeholder="π.χ. Μπολόνια, Μιλάνο..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Σημειώσεις</label>
              <input
                value={editForm.notes}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="π.χ. Πελάτης, φορτίο..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditModal(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 rounded-xl text-sm transition-colors">
                Ακύρωση
              </button>
              <button onClick={saveEdit} disabled={editSaving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                {editSaving ? '...' : '💾 Αποθήκευση'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value, color }) {
  const ring = { blue: 'border-blue-700/50', orange: 'border-orange-700/50', green: 'border-green-700/50' }
  const num  = { blue: 'text-blue-400',      orange: 'text-orange-400',      green: 'text-green-400' }
  return (
    <div className={`bg-slate-800 border ${ring[color]} rounded-2xl px-3 py-3 flex items-center gap-2 md:gap-3`}>
      <span className="text-lg md:text-xl">{icon}</span>
      <div>
        <p className={`text-xl md:text-2xl font-bold leading-none ${num[color]}`}>{value}</p>
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

function TruckRow({ truck, onEdit }) {
  const statusColor = {
    'Διαθέσιμο':  'text-green-400',
    'Εν κινήσει': 'text-cyan-400',
    'Service':    'text-red-400',
    'Μεταφορά':   'text-green-400',
    'Ανατεθειμένη': 'text-orange-400',
    'Παράδοση':   'text-purple-400',
  }
  const sourceIcon = truck.source === 'avail' ? '✏️' : '📦'
  return (
    <div className="flex items-start gap-2 bg-slate-800 rounded-lg px-2.5 py-1.5 group">
      <span className="text-xs mt-0.5">{sourceIcon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-white text-xs font-semibold truncate">{truck.alias || truck.tr}</p>
        {truck.location && <p className="text-slate-400 text-xs truncate">{truck.location}</p>}
        {truck.notes && <p className="text-slate-500 text-xs truncate">{truck.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className={`text-xs font-medium ${statusColor[truck.status] || 'text-slate-400'}`}>
          {truck.status}
        </span>
        <button
          onClick={onEdit}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-md px-1.5 py-0.5 text-xs transition-all ml-1"
          title="Επεξεργασία"
        >✏️</button>
      </div>
    </div>
  )
}
