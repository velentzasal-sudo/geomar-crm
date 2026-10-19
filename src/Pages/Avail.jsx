import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { el } from 'date-fns/locale'

// Status options — auto-derived show as info, manual-only for Ρεπό/Service
const AUTO_STATUSES = ['Διαθέσιμο', 'Φορτωμένο', 'Εν κινήσει', 'Παράδοση']
const MANUAL_STATUSES = ['Ρεπό', 'Service']
const ALL_STATUSES = [...AUTO_STATUSES, ...MANUAL_STATUSES]

// Map order status → avail status
const ORDER_TO_AVAIL = {
  'Ανατεθειμένη': 'Φορτωμένο',
  'Μεταφορά':      'Εν κινήσει',
  'Παράδοση':      'Παράδοση',
}

const STATUS_COLORS = {
  'Διαθέσιμο': 'bg-green-900/50 text-green-300 border-green-700',
  'Φορτωμένο':  'bg-blue-900/50 text-blue-300 border-blue-700',
  'Εν κινήσει': 'bg-cyan-900/50 text-cyan-300 border-cyan-700',
  'Παράδοση':   'bg-purple-900/50 text-purple-300 border-purple-700',
  'Ρεπό':       'bg-slate-700 text-slate-400 border-slate-600',
  'Service':    'bg-red-900/50 text-red-300 border-red-700',
}

export default function Avail() {
  const [trucks, setTrucks] = useState([])
  const [avail, setAvail]   = useState([])   // manual overrides for today
  const [orders, setOrders] = useState([])   // active orders for auto-derive
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)  // truck.tr
  const [form, setForm] = useState({ status: 'Διαθέσιμο', location: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: t }, { data: a }, { data: o }] = await Promise.all([
      supabase.from('trucks').select('*').order('tr'),
      supabase.from('avail').select('*').eq('fr', today),
      supabase.from('orders').select('id,truck,status').not('status', 'eq', 'Delivered').not('status', 'eq', 'Open'),
    ])
    setTrucks(t || [])
    setAvail(a || [])
    setOrders(o || [])
    setLoading(false)
  }

  // Get manual override for truck (if any)
  function getManualAvail(tr) {
    return avail.find(a => a.tr === tr)
  }

  // Derive status from active orders (used when no manual override)
  function getDerivedStatus(tr) {
    // Find most advanced order status for this truck
    const priority = ['Παράδοση', 'Μεταφορά', 'Ανατεθειμένη']
    for (const s of priority) {
      if (orders.some(o => o.truck === tr && o.status === s)) {
        return ORDER_TO_AVAIL[s] || 'Φορτωμένο'
      }
    }
    return 'Διαθέσιμο'
  }

  // Get effective status (manual overrides auto)
  function getStatus(tr) {
    const manual = getManualAvail(tr)
    if (manual && MANUAL_STATUSES.includes(manual.nt)) return manual.nt
    return getDerivedStatus(tr)
  }

  function isManual(tr) {
    const m = getManualAvail(tr)
    return m && MANUAL_STATUSES.includes(m.nt)
  }

  function openEdit(truck) {
    const existing = getManualAvail(truck.tr)
    setEditing(truck.tr)
    setForm({
      status:   existing?.nt || getDerivedStatus(truck.tr),
      location: existing?.ct || '',
      notes:    existing?.co || '',
    })
  }

  async function saveAvail() {
    if (!editing) return
    setSaving(true)
    const existing = getManualAvail(editing)
    const payload = {
      tr: editing,
      fr: today,
      ct: form.location,
      co: form.notes,
      nt: form.status,
    }
    if (existing) {
      await supabase.from('avail').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('avail').insert([payload])
    }
    setSaving(false)
    setEditing(null)
    loadAll()
  }

  async function clearManual(tr) {
    const existing = getManualAvail(tr)
    if (existing) await supabase.from('avail').delete().eq('id', existing.id)
    loadAll()
  }

  if (loading) return <div className="p-6 text-slate-400">Φόρτωση...</div>

  // Count per status
  const statusCounts = {}
  ALL_STATUSES.forEach(s => {
    statusCounts[s] = trucks.filter(t => getStatus(t.tr) === s).length
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">🚛 Διαθεσιμότητα Στόλου</h1>
          <p className="text-slate-400 text-sm mt-1">{format(new Date(), 'EEEE d MMMM yyyy', { locale: el })}</p>
        </div>
        <button onClick={loadAll} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm">
          🔄 Ανανέωση
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {ALL_STATUSES.map(s => (
          <div key={s} className={`rounded-2xl p-3 border text-center ${STATUS_COLORS[s]}`}>
            <p className="text-2xl font-bold">{statusCounts[s]}</p>
            <p className="text-xs mt-0.5 opacity-80">{s}</p>
          </div>
        ))}
      </div>

      {/* Auto-populate notice */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 flex items-center gap-2 text-slate-400 text-xs">
        <span>⚡</span>
        <span>Η κατάσταση ενημερώνεται αυτόματα από τις παραγγελίες. Χρησιμοποιήστε ✏️ μόνο για <strong className="text-slate-300">Ρεπό</strong> ή <strong className="text-slate-300">Service</strong>.</span>
      </div>

      {/* Truck cards */}
      <div className="grid grid-cols-2 gap-3">
        {trucks.map(t => {
          const status = getStatus(t.tr)
          const manual = isManual(t.tr)
          const manualRec = getManualAvail(t.tr)
          const colorClass = STATUS_COLORS[status] || STATUS_COLORS['Διαθέσιμο']
          return (
            <div key={t.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-bold">{t.tr}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${colorClass}`}>
                      {status}
                    </span>
                    {manual && (
                      <span className="text-xs text-amber-400 opacity-70">manual</span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {t.driver || '—'}
                    {manualRec?.ct ? ` · 📍 ${manualRec.ct}` : ''}
                  </p>
                  {manualRec?.co && <p className="text-slate-500 text-xs mt-1 italic">{manualRec.co}</p>}
                  {/* Show which order drives the auto status */}
                  {!manual && status !== 'Διαθέσιμο' && (() => {
                    const activeOrd = orders.find(o => o.truck === t.tr && ORDER_TO_AVAIL[o.status] === status)
                    return activeOrd ? (
                      <p className="text-slate-600 text-xs mt-0.5">← {activeOrd.status}</p>
                    ) : null
                  })()}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(t)}
                    className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white text-sm">✏️</button>
                  {manual && (
                    <button onClick={() => clearManual(t.tr)}
                      className="p-1.5 rounded-lg hover:bg-red-900/30 text-slate-500 hover:text-red-400 text-sm"
                      title="Επαναφορά αυτόματης">✕</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit modal — for manual override only */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-sm p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">🚛 {editing}</h2>
              <p className="text-slate-400 text-xs mt-1">Αυτόματο: <span className="text-slate-300">{getDerivedStatus(editing)}</span> · Override μόνο για Ρεπό/Service</p>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Κατάσταση (manual)</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_STATUSES.map(s => {
                  const isManualOnly = MANUAL_STATUSES.includes(s)
                  return (
                    <button key={s}
                      onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={`py-2 px-3 rounded-xl text-sm border transition-colors ${
                        form.status === s
                          ? STATUS_COLORS[s] + ' font-bold'
                          : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                      } ${!isManualOnly ? 'opacity-50' : ''}`}
                      title={!isManualOnly ? 'Αυτόματο από παραγγελίες' : ''}
                    >{s}{!isManualOnly ? ' ⚡' : ''}</button>
                  )
                })}
              </div>
              <p className="text-slate-600 text-xs mt-1">⚡ = αυτόματο, δεν χρειάζεται manual</p>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Τοποθεσία</label>
              <input
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="π.χ. Μιλάνο, Θεσσαλονίκη..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Σημείωση</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="π.χ. Επιστρέφει Παρασκευή..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditing(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm">
                Ακύρωση
              </button>
              <button onClick={saveAvail} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium">
                {saving ? '...' : '💾 Αποθήκευση'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
