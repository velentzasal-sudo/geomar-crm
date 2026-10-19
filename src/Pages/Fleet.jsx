import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY_TRUCK = { tr: '', driver: '', phone: '', tare: '', payload: '', ldm: '', tmp: '', notes: '' }

export default function Fleet() {
  const [trucks, setTrucks] = useState([])
  const [avail, setAvail] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_TRUCK)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from('trucks').select('*').order('tr'),
      supabase.from('avail').select('*').order('created_at', { ascending: false }),
    ])
    setTrucks(t || [])
    setAvail(a || [])
    setLoading(false)
  }

  function openNew() { setEditing(null); setForm(EMPTY_TRUCK); setShowModal(true) }
  function openEdit(t) { setEditing(t.id); setForm({ ...t }); setShowModal(true) }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const { id: _id, ...rest } = form
    const payload = { ...rest, tare: parseFloat(form.tare)||0, payload: parseFloat(form.payload)||0, ldm: parseFloat(form.ldm)||0 }
    let error
    if (editing) {
      const res = await supabase.from('trucks').update(payload).eq('id', editing)
      error = res.error
      if (res.error) {
        alert('Σφάλμα αποθήκευσης: ' + res.error.message + '\nCode: ' + res.error.code)
        console.error('Supabase update error:', res.error)
      }
    } else {
      const res = await supabase.from('trucks').insert([payload])
      error = res.error
      if (res.error) {
        alert('Σφάλμα εισαγωγής: ' + res.error.message + '\nCode: ' + res.error.code)
        console.error('Supabase insert error:', res.error)
      }
    }
    setSaving(false)
    if (!error) {
      setShowModal(false)
      loadAll()
    }
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή φορτηγού;')) return
    await supabase.from('trucks').delete().eq('id', id)
    loadAll()
  }

  const filtered = trucks.filter(t => {
    const q = search.toLowerCase()
    return !q || [t.tr, t.driver, t.phone].some(v => v?.toLowerCase().includes(q))
  })

  // Get latest avail for each truck
  const availMap = {}
  avail.forEach(a => { if (!availMap[a.tr]) availMap[a.tr] = a })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">🚚 Στόλος</h1>
        <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm">
          + Νέο Φορτηγό
        </button>
      </div>

      <div className="flex gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Αναζήτηση..."
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm w-56 focus:outline-none focus:border-blue-500"
        />
        <div className="ml-auto text-slate-400 text-sm self-center">{filtered.length} φορτηγά</div>
      </div>

      {loading ? (
        <p className="text-slate-400">Φόρτωση...</p>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(t => {
            const av = availMap[t.tr]
            return (
              <div key={t.id} className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">🚚</div>
                    <div>
                      <p className="text-white font-bold text-lg">{t.tr}</p>
                      <p className="text-slate-400 text-sm">{t.driver} {t.phone ? `· 📞 ${t.phone}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white text-sm">✏️</button>
                    <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400 text-sm">🗑️</button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div className="bg-slate-700 rounded-xl p-3 text-center">
                    <p className="text-slate-400 text-xs">Χωρητικότητα</p>
                    <p className="text-white font-bold">{t.ldm} LDM</p>
                  </div>
                  <div className="bg-slate-700 rounded-xl p-3 text-center">
                    <p className="text-slate-400 text-xs">Φορτίο</p>
                    <p className="text-white font-bold">{t.payload ? `${t.payload} kg` : '—'}</p>
                  </div>
                  <div className="bg-slate-700 rounded-xl p-3 text-center">
                    <p className="text-slate-400 text-xs">Θερμ/σία</p>
                    <p className="text-white font-bold">{t.tmp || '—'}</p>
                  </div>
                </div>

                {av && (
                  <div className="mt-3 bg-slate-700/50 rounded-xl px-3 py-2 text-xs text-slate-400">
                    📍 Τελευταία: <span className="text-white">{av.ct}</span> → <span className="text-blue-300">{av.co}</span>
                    {av.fr && <span className="ml-2 text-green-400">Ελεύθερο: {av.fr}</span>}
                    {av.nt && <span className="ml-2 text-slate-300">· {av.nt}</span>}
                  </div>
                )}

                {t.notes && (
                  <p className="mt-2 text-slate-500 text-xs">{t.notes}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-lg">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-6">{editing ? '✏️ Επεξεργασία' : '➕ Νέο Φορτηγό'}</h2>
              <div className="grid grid-cols-2 gap-4">
                <TField label="Αριθμός" name="tr" value={form.tr} onChange={handleChange} className="col-span-2" />
                <TField label="Οδηγός" name="driver" value={form.driver} onChange={handleChange} />
                <TField label="Τηλέφωνο" name="phone" value={form.phone} onChange={handleChange} />
                <TField label="Τάρα (kg)" name="tare" type="number" value={form.tare} onChange={handleChange} />
                <TField label="Φορτίο (kg)" name="payload" type="number" value={form.payload} onChange={handleChange} />
                <TField label="LDM" name="ldm" type="number" value={form.ldm} onChange={handleChange} />
                <TField label="Θερμοκρασία" name="tmp" value={form.tmp} onChange={handleChange} />
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

function TField({ label, name, value, onChange, type = 'text', className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input type={type} name={name} value={value ?? ''} onChange={onChange}
        className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
    </div>
  )
}
