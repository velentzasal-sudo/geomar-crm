import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { el } from 'date-fns/locale'
import { TLDM, LDM_FACTORS, AVAIL_STATUS_COLORS as STATUS_COLORS } from '../lib/constants'

const MANUAL_STATUSES = ['Ρεπό', 'Service']

const ALL_STATUSES = ['Διαθέσιμο', 'Μερικώς Φορτωμένο', 'Πλήρως Φορτωμένο', 'Ρεπό', 'Service']

export default function Avail() {
  const [trucks, setTrucks]   = useState([])
  const [avail, setAvail]     = useState([])   // manual records per date
  const [orders, setOrders]   = useState([])   // active orders with ldm
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // truck.tr
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [form, setForm] = useState({ status: 'Διαθέσιμο', location: '', notes: '' })
  const [saving, setSaving]   = useState(false)

  useEffect(() => { loadAll() }, [selectedDate])

  async function loadAll() {
    setLoading(true)
    const [{ data: t }, { data: a }, { data: o }] = await Promise.all([
      supabase.from('trucks').select('*').order('tr'),
      supabase.from('avail').select('*').eq('fr', selectedDate),
      supabase.from('orders').select('id,truck,status,ldm,qty,pal')
        .not('status', 'eq', 'Delivered'),
    ])
    setTrucks(t || [])
    setAvail(a || [])
    setOrders(o || [])
    setLoading(false)
  }

  // Calculate total LDM for a truck from active orders
  function getTruckLdm(tr) {
    return orders
      .filter(o => o.truck === tr && o.status !== 'Open')
      .reduce((sum, o) => {
        const ldm = parseFloat(o.ldm) || (o.pal && o.qty ? (LDM_FACTORS[o.pal] || 0) * parseFloat(o.qty) : 0)
        return sum + ldm
      }, 0)
  }

  // Get manual avail record for this truck/date
  function getManualAvail(tr) {
    return avail.find(a => a.tr === tr)
  }

  // Derive status: manual overrides, else auto from LDM
  function getStatus(tr) {
    const manual = getManualAvail(tr)
    if (manual && MANUAL_STATUSES.includes(manual.nt)) return manual.nt
    const ldm = getTruckLdm(tr)
    if (ldm >= TLDM) return 'Πλήρως Φορτωμένο'
    if (ldm > 0) return 'Μερικώς Φορτωμένο'
    return 'Διαθέσιμο'
  }

  function isManual(tr) {
    const m = getManualAvail(tr)
    return m && MANUAL_STATUSES.includes(m.nt)
  }

  function openEdit(truck) {
    const existing = getManualAvail(truck.tr)
    setEditing(truck.tr)
    setForm({
      status:   existing?.nt || getStatus(truck.tr),
      location: existing?.ct || '',
      notes:    existing?.co || '',
    })
  }

  async function saveAvail() {
    if (!editing) return
    setSaving(true)
    const existing = getManualAvail(editing)
    // Only save if manual status (Ρεπό/Service) — location/notes always save
    const payload = {
      tr: editing,
      fr: selectedDate,
      ct: form.location,
      co: form.notes,
      nt: MANUAL_STATUSES.includes(form.status) ? form.status : null,
    }
    if (existing) {
      await supabase.from('avail').update(payload).eq('id', existing.id)
    } else {
      // Only insert if there's something to save
      if (payload.ct || payload.co || payload.nt) {
        await supabase.from('avail').insert([{ ...payload, nt: payload.nt || 'Διαθέσιμο' }])
      }
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

  const statusCounts = {}
  ALL_STATUSES.forEach(s => {
    statusCounts[s] = trucks.filter(t => getStatus(t.tr) === s).length
  })

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">🚛 Διαθεσιμότητα Στόλου</h1>
          <p className="text-slate-400 text-sm mt-1">{format(new Date(), 'EEEE d MMMM yyyy', { locale: el })}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
          <button onClick={loadAll} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm">
            🔄
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {ALL_STATUSES.map(s => (
          <div key={s} className={`rounded-2xl p-3 border text-center ${STATUS_COLORS[s]}`}>
            <p className="text-2xl font-bold">{statusCounts[s]}</p>
            <p className="text-xs mt-0.5 opacity-80">{s}</p>
          </div>
        ))}
      </div>

      {/* Truck cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {trucks.map(t => {
          const status    = getStatus(t.tr)
          const manual    = isManual(t.tr)
          const manualRec = getManualAvail(t.tr)
          const ldm       = getTruckLdm(t.tr)
          const remaining = Math.max(0, TLDM - ldm)
          const pct       = Math.min(100, (ldm / TLDM) * 100)
          const overloaded = ldm > TLDM
          const colorClass = STATUS_COLORS[status] || STATUS_COLORS['Διαθέσιμο']

          return (
            <div key={t.id} className={`bg-slate-800 border rounded-2xl p-4 ${overloaded ? 'border-red-600' : 'border-slate-700'}`}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-bold">{t.tr}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${colorClass}`}>
                      {status}
                    </span>
                    {manual && <span className="text-xs text-amber-400 opacity-70">manual</span>}
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {t.driver || '—'}
                    {manualRec?.ct ? ` · 📍 ${manualRec.ct}` : ''}
                  </p>
                  {manualRec?.co && <p className="text-slate-500 text-xs mt-1 italic">{manualRec.co}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(t)}
                    className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white text-sm">✏️</button>
                  {manual && (
                    <button onClick={() => clearManual(t.tr)}
                      className="p-1.5 rounded-lg hover:bg-red-900/30 text-slate-500 hover:text-red-400 text-sm"
                      title="Καθαρισμός">✕</button>
                  )}
                </div>
              </div>

              {/* LDM bar */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className={overloaded ? 'text-red-400 font-bold' : 'text-slate-400'}>
                    {overloaded ? '⚠️ ' : ''}{ldm.toFixed(2)} / {TLDM} LDM
                  </span>
                  <span className={overloaded ? 'text-red-400' : 'text-green-400'}>
                    {overloaded ? `+${(ldm - TLDM).toFixed(2)} υπέρβαση` : `${remaining.toFixed(2)} ελεύθερο`}
                  </span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${overloaded ? 'bg-red-500' : pct >= 80 ? 'bg-orange-500' : pct > 0 ? 'bg-blue-500' : 'bg-slate-600'}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-slate-800 rounded-t-3xl sm:rounded-3xl border border-slate-700 w-full sm:max-w-sm p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white">🚛 {editing}</h2>
              <p className="text-slate-400 text-xs mt-1">
                LDM: <span className="text-white">{getTruckLdm(editing).toFixed(2)}</span> / {TLDM} ·
                Ελεύθερο: <span className="text-green-400">{Math.max(0, TLDM - getTruckLdm(editing)).toFixed(2)}</span>
              </p>
            </div>

            {/* Manual status — only Ρεπό/Service */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">Κατάσταση (μόνο για Ρεπό/Service)</label>
              <div className="grid grid-cols-2 gap-2">
                {MANUAL_STATUSES.map(s => (
                  <button key={s}
                    onClick={() => setForm(f => ({ ...f, status: f.status === s ? 'Διαθέσιμο' : s }))}
                    className={`py-2 px-3 rounded-xl text-sm border transition-colors ${
                      form.status === s
                        ? STATUS_COLORS[s] + ' font-bold'
                        : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'
                    }`}
                  >{s}</button>
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
