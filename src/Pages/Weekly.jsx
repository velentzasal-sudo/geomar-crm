import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfWeek, addDays, isToday, parseISO } from 'date-fns'
import { el } from 'date-fns/locale'

const DAYS = ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ']
const TLDM = 13.20
const LDM_FACTORS = { E: 0.40, B: 0.50, P: 0.60, M: 1.00 }

const STATUSES = [
  { key: 'Διαθέσιμο',  label: 'Διαθέσιμο',  color: 'bg-green-900/60 text-green-300 border-green-700' },
  { key: 'Φορτωμένο',  label: 'Φορτωμένο',  color: 'bg-blue-900/60 text-blue-300 border-blue-700' },
  { key: 'Εν κινήσει', label: 'Εν κινήσει', color: 'bg-cyan-900/60 text-cyan-300 border-cyan-700' },
  { key: 'Ρεπό',       label: 'Ρεπό',        color: 'bg-slate-700 text-slate-400 border-slate-600' },
  { key: 'Service',    label: 'Service',     color: 'bg-red-900/60 text-red-300 border-red-700' },
]

const STATUS_STYLE = Object.fromEntries(STATUSES.map(s => [s.key, s.color]))

function cellStyle(status) {
  return STATUS_STYLE[status] || 'bg-slate-800 text-slate-600 border-slate-700'
}

export default function Weekly() {
  const [trucks, setTrucks]   = useState([])
  const [avail, setAvail]     = useState([])
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [editing, setEditing] = useState(null) // { tr, date }
  const [form, setForm] = useState({ status: 'Διαθέσιμο', location: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [weekStart])

  async function loadAll() {
    setLoading(true)
    const from = format(weekStart, 'yyyy-MM-dd')
    const to   = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const [{ data: t }, { data: a }, { data: o }] = await Promise.all([
      supabase.from('trucks').select('*').order('tr'),
      supabase.from('avail').select('*').gte('fr', from).lte('fr', to),
      supabase.from('orders').select('id,truck,status,ldm,qty,pal,rdy,load_date,delivery_date')
        .not('status', 'eq', 'Delivered'),
    ])
    setTrucks(t || [])
    setAvail(a || [])
    setOrders(o || [])
    setLoading(false)
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  function getAvail(tr, date) {
    const d = format(date, 'yyyy-MM-dd')
    return avail.find(a => a.tr === tr && a.fr === d)
  }

  // LDM for truck on a specific date (orders active that day)
  function getDayLdm(tr, date) {
    const d = format(date, 'yyyy-MM-dd')
    return orders
      .filter(o => {
        if (o.truck !== tr) return false
        if (o.status === 'Open') return false
        // order is "active" on this day if load_date <= d <= delivery_date, or just assigned
        const load = o.load_date?.substring(0, 10) || o.rdy?.substring(0, 10)
        const del  = o.delivery_date?.substring(0, 10)
        if (load && del) return d >= load && d <= del
        if (load) return d >= load
        return false
      })
      .reduce((sum, o) => {
        const ldm = parseFloat(o.ldm) || (o.pal && o.qty ? (LDM_FACTORS[o.pal] || 0) * parseFloat(o.qty) : 0)
        return sum + ldm
      }, 0)
  }

  // Derive cell status: manual overrides, else from LDM
  function getCellStatus(tr, date) {
    const rec = getAvail(tr, date)
    if (rec) return rec.nt || 'Διαθέσιμο'
    const ldm = getDayLdm(tr, date)
    if (ldm >= TLDM) return 'Φορτωμένο'
    if (ldm > 0) return 'Φορτωμένο'
    return null // no info = empty
  }

  function openEdit(tr, date) {
    const rec = getAvail(tr, date)
    setEditing({ tr, date })
    setForm({
      status:   rec?.nt || 'Διαθέσιμο',
      location: rec?.ct || '',
      notes:    rec?.co || '',
    })
  }

  async function saveCell() {
    if (!editing) return
    setSaving(true)
    const { tr, date } = editing
    const d = format(date, 'yyyy-MM-dd')
    const existing = getAvail(tr, date)
    const payload = { tr, fr: d, nt: form.status, ct: form.location, co: form.notes }
    if (existing) {
      await supabase.from('avail').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('avail').insert([payload])
    }
    setSaving(false)
    setEditing(null)
    loadAll()
  }

  async function clearCell() {
    if (!editing) return
    const { tr, date } = editing
    const existing = getAvail(tr, date)
    if (existing) await supabase.from('avail').delete().eq('id', existing.id)
    setEditing(null)
    loadAll()
  }

  if (loading) return <div className="p-6 text-slate-400">Φόρτωση...</div>

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-white">📋 Εβδομαδιαίος Πλάνος</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(w => addDays(w, -7))}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">◀</button>
          <span className="text-slate-300 text-sm min-w-[160px] text-center">
            {format(weekStart, 'd MMM', { locale: el })} – {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: el })}
          </span>
          <button onClick={() => setWeekStart(w => addDays(w, 7))}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-xl text-sm">▶</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm">Σήμερα</button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {STATUSES.map(s => (
          <span key={s.key} className={`px-2 py-1 rounded-lg border ${s.color}`}>{s.label}</span>
        ))}
        <span className="px-2 py-1 rounded-lg border bg-slate-800 text-slate-600 border-slate-700">— Άγνωστο</span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[600px]">
          <thead>
            <tr>
              <th className="text-left text-slate-400 text-xs font-medium py-2 pr-3 w-28">Φορτηγό</th>
              {weekDays.map((d, i) => (
                <th key={i} className={`text-center text-xs font-medium py-2 px-1 min-w-[100px] ${isToday(d) ? 'text-blue-400' : 'text-slate-400'}`}>
                  <div>{DAYS[i]}</div>
                  <div className={`text-xs ${isToday(d) ? 'text-blue-500' : 'text-slate-500'}`}>{format(d, 'd/M')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trucks.map(t => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="py-2 pr-3">
                  <p className="text-white text-sm font-bold">{t.tr}</p>
                  <p className="text-slate-500 text-xs truncate max-w-[100px]">{t.driver}</p>
                </td>
                {weekDays.map((d, i) => {
                  const rec    = getAvail(t.tr, d)
                  const status = getCellStatus(t.tr, d)
                  const ldm    = getDayLdm(t.tr, d)
                  const isManual = !!rec
                  const today  = isToday(d)

                  return (
                    <td key={i} className={`py-1 px-1 ${today ? 'bg-blue-950/20' : ''}`}>
                      <button
                        onClick={() => openEdit(t.tr, d)}
                        className={`w-full rounded-xl px-2 py-2 text-xs border text-left transition-all min-h-[52px] ${
                          status ? cellStyle(status) : 'bg-slate-800/60 border-slate-700 text-slate-600 hover:bg-slate-700 hover:text-slate-400'
                        }`}
                      >
                        {status ? (
                          <div>
                            <div className="font-medium">{status}</div>
                            {rec?.ct && <div className="opacity-70 truncate">📍 {rec.ct}</div>}
                            {ldm > 0 && <div className="opacity-60">{ldm.toFixed(1)} LDM</div>}
                          </div>
                        ) : (
                          <span className="opacity-40">—</span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-slate-600 text-xs">Κλικ σε κελί για να ορίσεις κατάσταση · LDM υπολογίζεται αυτόματα από παραγγελίες</p>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-slate-800 rounded-t-3xl sm:rounded-3xl border border-slate-700 w-full sm:max-w-sm p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">🚛 {editing.tr}</h2>
              <p className="text-slate-400 text-sm">{format(editing.date, 'EEEE d MMMM yyyy', { locale: el })}</p>
              {getDayLdm(editing.tr, editing.date) > 0 && (
                <p className="text-blue-400 text-xs mt-1">
                  📦 {getDayLdm(editing.tr, editing.date).toFixed(2)} LDM από παραγγελίες
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Κατάσταση</label>
              <div className="grid grid-cols-2 gap-2">
                {STATUSES.map(s => (
                  <button key={s.key}
                    onClick={() => setForm(f => ({ ...f, status: s.key }))}
                    className={`py-2 px-3 rounded-xl text-sm border transition-colors ${
                      form.status === s.key ? s.color + ' font-bold' : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                    }`}
                  >{s.label}</button>
                ))}
              </div>
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
                placeholder="π.χ. Επιστρέφει Δευτέρα..."
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm">
                Ακύρωση
              </button>
              {getAvail(editing.tr, editing.date) && (
                <button onClick={clearCell}
                  className="bg-red-900/40 hover:bg-red-900/60 text-red-400 px-4 py-2 rounded-xl text-sm">
                  🗑️
                </button>
              )}
              <button onClick={saveCell} disabled={saving}
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
