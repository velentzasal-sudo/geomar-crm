import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { el } from 'date-fns/locale'

const STATUS_OPTIONS = ['Διαθέσιμο', 'Φορτωμένο', 'Επιστροφή', 'Ρεπό', 'Service']
const STATUS_COLORS = {
  'Διαθέσιμο': 'bg-green-900/50 text-green-300 border-green-700',
  'Φορτωμένο':  'bg-blue-900/50 text-blue-300 border-blue-700',
  'Επιστροφή':  'bg-orange-900/50 text-orange-300 border-orange-700',
  'Ρεπό':       'bg-slate-700 text-slate-400 border-slate-600',
  'Service':    'bg-red-900/50 text-red-300 border-red-700',
}

export default function Avail() {
  const [trucks, setTrucks] = useState([])
  const [avail, setAvail]   = useState([]) // today's avail records
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // truck.tr
  const [form, setForm] = useState({ status: 'Διαθέσιμο', location: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from('trucks').select('*').order('tr'),
      supabase.from('avail').select('*').eq('fr', today),
    ])
    setTrucks(t || [])
    setAvail(a || [])
    setLoading(false)
  }

  function getAvail(tr) {
    return avail.find(a => a.tr === tr)
  }

  function openEdit(truck) {
    const existing = getAvail(truck.tr)
    setEditing(truck.tr)
    setForm({
      status:   existing?.nt?.split('|')[0]?.trim() || 'Διαθέσιμο',
      location: existing?.ct || '',
      notes:    existing?.co || '',
    })
  }

  async function saveAvail() {
    if (!editing) return
    setSaving(true)
    const existing = getAvail(editing)
    const payload = {
      tr: editing,
      fr: today,
      ct: form.location,
      co: form.notes,
      nt: form.status,
    }
    if (existing) {
      const { id: _id, ...rest } = existing
      await supabase.from('avail').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('avail').insert([payload])
    }
    setSaving(false)
    setEditing(null)
    loadAll()
  }

  async function clearAvail(tr) {
    const existing = getAvail(tr)
    if (existing) await supabase.from('avail').delete().eq('id', existing.id)
    loadAll()
  }

  if (loading) return <div className="p-6 text-slate-400">Φόρτωση...</div>

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">🚛 Διαθεσιμότητα Στόλου</h1>
          <p className="text-slate-400 text-sm mt-1">{format(new Date(), 'EEEE d MMMM yyyy', { locale: el })}</p>
        </div>
        <button onClick={loadAll} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-xl text-sm">
          🔄 Ανανέωση
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-5 gap-2">
        {STATUS_OPTIONS.map(s => {
          const count = trucks.filter(t => {
            const a = getAvail(t.tr)
            return a ? a.nt === s : s === 'Διαθέσιμο'
          }).length
          return (
            <div key={s} className={`rounded-2xl p-3 border text-center ${STATUS_COLORS[s]}`}>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs mt-0.5 opacity-80">{s}</p>
            </div>
          )
        })}
      </div>

      {/* Truck cards */}
      <div className="grid grid-cols-2 gap-3">
        {trucks.map(t => {
          const a = getAvail(t.tr)
          const status = a?.nt || 'Διαθέσιμο'
          const colorClass = STATUS_COLORS[status] || STATUS_COLORS['Διαθέσιμο']
          return (
            <div key={t.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-bold">{t.tr}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${colorClass}`}>{status}</span>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {t.driver || '—'}
                    {a?.ct ? ` · 📍 ${a.ct}` : ''}
                  </p>
                  {a?.co && <p className="text-slate-500 text-xs mt-1 italic">{a.co}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(t)}
                    className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white text-sm">✏️</button>
                  {a && (
                    <button onClick={() => clearAvail(t.tr)}
                      className="p-1.5 rounded-lg hover:bg-red-900/30 text-slate-500 hover:text-red-400 text-sm">✕</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">🚛 {editing}</h2>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Κατάσταση</label>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button key={s}
                    onClick={() => setForm(f => ({ ...f, status: s }))}
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
