import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY = { name: '', street: '', num: '', tk: '', city: '', country: 'Ιταλία', contact: '', phone: '', email: '', notes: '' }

export default function Firms() {
  const [firms, setFirms] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadFirms() }, [])

  async function loadFirms() {
    setLoading(true)
    const { data } = await supabase.from('firms').select('*').order('name')
    setFirms(data || [])
    setLoading(false)
  }

  function openNew() { setEditing(null); setForm(EMPTY); setShowModal(true) }
  function openEdit(f) { setEditing(f.id); setForm({ ...f }); setShowModal(true) }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const { id: _id, ...payload } = form
    if (editing) {
      await supabase.from('firms').update(payload).eq('id', editing)
    } else {
      await supabase.from('firms').insert([payload])
    }
    setSaving(false)
    setShowModal(false)
    loadFirms()
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή φίρμας;')) return
    await supabase.from('firms').delete().eq('id', id)
    loadFirms()
  }

  function mapsUrl(f) {
    const addr = [f.street, f.num, f.tk, f.city, f.country].filter(Boolean).join(' ')
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
  }

  const filtered = firms.filter(f => {
    const q = search.toLowerCase()
    return !q || [f.name, f.city, f.country, f.contact].some(v => v?.toLowerCase().includes(q))
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">🏭 Φίρμες</h1>
        <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm">
          + Νέα Φίρμα
        </button>
      </div>

      <div className="flex gap-3 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Αναζήτηση..."
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm w-56 focus:outline-none focus:border-blue-500"
        />
        <div className="ml-auto text-slate-400 text-sm">{filtered.length} φίρμες</div>
      </div>

      {loading ? (
        <p className="text-slate-400">Φόρτωση...</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(f => (
            <div key={f.id} className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{f.name}</p>
                <p className="text-slate-400 text-xs truncate">
                  {[f.street, f.num, f.tk, f.city, f.country].filter(Boolean).join(', ')}
                  {f.contact ? ` · ${f.contact}` : ''}
                  {f.phone ? ` · 📞 ${f.phone}` : ''}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <a href={mapsUrl(f)} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400 text-sm">🗺️</a>
                {f.email && (
                  <a href={`mailto:${f.email}`}
                    className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-blue-400 text-sm">✉️</a>
                )}
                <button onClick={() => openEdit(f)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white text-sm">✏️</button>
                <button onClick={() => handleDelete(f.id)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400 text-sm">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-6">{editing ? '✏️ Επεξεργασία' : '➕ Νέα Φίρμα'}</h2>
              <div className="grid grid-cols-2 gap-4">
                <FF label="Επωνυμία" name="name" value={form.name} onChange={handleChange} className="col-span-2" />
                <FF label="Οδός" name="street" value={form.street} onChange={handleChange} />
                <FF label="Αριθμός" name="num" value={form.num} onChange={handleChange} />
                <FF label="ΤΚ" name="tk" value={form.tk} onChange={handleChange} />
                <FF label="Πόλη" name="city" value={form.city} onChange={handleChange} />
                <FF label="Χώρα" name="country" value={form.country} onChange={handleChange} />
                <FF label="Επαφή" name="contact" value={form.contact} onChange={handleChange} />
                <FF label="Τηλέφωνο" name="phone" value={form.phone} onChange={handleChange} />
                <FF label="Email" name="email" type="email" value={form.email} onChange={handleChange} />
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Σημειώσεις</label>
                  <textarea name="notes" value={form.notes || ''} onChange={handleChange} rows={2}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm">Ακύρωση</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium">
                  {saving ? 'Αποθήκευση...' : '💾 Αποθήκευση'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FF({ label, name, value, onChange, type = 'text', className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input type={type} name={name} value={value ?? ''} onChange={onChange}
        className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
    </div>
  )
}
