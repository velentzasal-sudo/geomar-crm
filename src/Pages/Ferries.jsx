import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { el } from 'date-fns/locale'

const ROUTES = [
  'Πάτρα → Μπάρι',
  'Πάτρα → Ανκόνα',
  'Πάτρα → Βενετία',
  'Ηγουμενίτσα → Μπάρι',
  'Ηγουμενίτσα → Ανκόνα',
  'Ηγουμενίτσα → Βενετία',
  'Μπάρι → Πάτρα',
  'Ανκόνα → Πάτρα',
  'Βενετία → Πάτρα',
  'Μπάρι → Ηγουμενίτσα',
  'Ανκόνα → Ηγουμενίτσα',
  'Βενετία → Ηγουμενίτσα',
]

// Τιμοκατάλογος €/μέτρο ανά δρομολόγιο και ημέρα (0=Δευτέρα, ..., 6=Κυριακή)
const PRICE_TABLE = {
  'Πάτρα → Μπάρι':           [59.8, 63.8, 59.8, 59.8, 59.8, 59.8, 59.8],
  'Πάτρα → Ανκόνα':          [103.1,103.1,103.1,103.1,107.1,103.1,103.1],
  'Πάτρα → Βενετία':         [102.5,102.5,102.5,102.5,108.5,102.5,102.5],
  'Ηγουμενίτσα → Μπάρι':     [50,   56,   50,   50,   50,   50,   50  ],
  'Ηγουμενίτσα → Ανκόνα':    [76,   77,   76,   76,   77,   77,   76  ],
  'Ηγουμενίτσα → Βενετία':   [100,  100,  100,  100,  106,  100,  100 ],
  'Μπάρι → Πάτρα':           [60.8, 60.8, 60.8, 60.8, 68.8, 68.8, 60.8],
  'Ανκόνα → Πάτρα':          [109.1,109.1,109.1,109.1,114.1,114,  109.1],
  'Βενετία → Πάτρα':         [115.5,115.5,115.5,115.5,115.5,129.5,115.5],
  'Μπάρι → Ηγουμενίτσα':     [53,   53,   53,   53,   57,   57,   53  ],
  'Ανκόνα → Ηγουμενίτσα':    [80,   80,   80,   87,   87,   93,   80  ],
  'Βενετία → Ηγουμενίτσα':   [113,  113,  113,  113,  113,  127,  113 ],
}

function getPricePerM(route, dateStr) {
  if (!route || !dateStr) return null
  const prices = PRICE_TABLE[route]
  if (!prices) return null
  const d = new Date(dateStr)
  const dow = (d.getDay() + 6) % 7 // 0=Δευτέρα
  return prices[dow]
}

const EMPTY = {
  route: '', departure: '', truck: '', meters: 16.5,
  price_per_m: '', total_cost: '', company: '', booking_ref: '', notes: ''
}

export default function Ferries() {
  const [bookings, setBookings] = useState([])
  const [trucks, setTrucks]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [editing, setEditing]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [filter, setFilter]     = useState('')

  useEffect(() => {
    loadAll()
    supabase.from('trucks').select('tr,driver').order('tr').then(({ data }) => setTrucks(data || []))
  }, [])

  async function loadAll() {
    setLoading(true)
    const { data } = await supabase.from('ferries').select('*').order('departure', { ascending: false })
    setBookings(data || [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setModal(true)
  }

  function openEdit(b) {
    setEditing(b.id)
    setForm({
      route: b.route || '',
      departure: b.departure || '',
      truck: b.truck || '',
      meters: b.meters ?? 16.5,
      price_per_m: b.price_per_m ?? '',
      total_cost: b.total_cost ?? '',
      company: b.company || '',
      booking_ref: b.booking_ref || '',
      notes: b.notes || '',
    })
    setModal(true)
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => {
      const next = { ...f, [name]: value }
      // Αυτόματος υπολογισμός τιμής από τιμοκατάλογο
      if (name === 'route' || name === 'departure') {
        const route = name === 'route' ? value : f.route
        const dep   = name === 'departure' ? value : f.departure
        const ppm   = getPricePerM(route, dep)
        if (ppm !== null) {
          next.price_per_m = ppm
          next.total_cost  = +(ppm * (parseFloat(next.meters) || 16.5)).toFixed(2)
        }
      }
      if (name === 'price_per_m' || name === 'meters') {
        const ppm = parseFloat(name === 'price_per_m' ? value : f.price_per_m) || 0
        const m   = parseFloat(name === 'meters' ? value : f.meters) || 16.5
        next.total_cost = ppm ? +(ppm * m).toFixed(2) : ''
      }
      return next
    })
  }

  async function handleSave() {
    if (!form.route || !form.departure) return
    setSaving(true)
    const payload = {
      route:       form.route,
      departure:   form.departure,
      truck:       form.truck || null,
      meters:      parseFloat(form.meters) || 16.5,
      price_per_m: parseFloat(form.price_per_m) || null,
      total_cost:  parseFloat(form.total_cost) || null,
      company:     form.company || null,
      booking_ref: form.booking_ref || null,
      notes:       form.notes || null,
    }
    if (editing) {
      await supabase.from('ferries').update(payload).eq('id', editing)
    } else {
      await supabase.from('ferries').insert([payload])
    }
    setSaving(false)
    setModal(false)
    loadAll()
  }

  async function handleDelete(id) {
    if (!window.confirm('Διαγραφή κράτησης;')) return
    await supabase.from('ferries').delete().eq('id', id)
    loadAll()
  }

  const filtered = bookings.filter(b =>
    !filter ||
    b.route?.toLowerCase().includes(filter.toLowerCase()) ||
    b.truck?.toLowerCase().includes(filter.toLowerCase()) ||
    b.company?.toLowerCase().includes(filter.toLowerCase()) ||
    b.booking_ref?.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">⛴️ Καράβια</h1>
          <p className="text-slate-400 text-sm mt-0.5">{bookings.length} κρατήσεις</p>
        </div>
        <button onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          + Κράτηση
        </button>
      </div>

      {/* Search */}
      <input
        value={filter} onChange={e => setFilter(e.target.value)}
        placeholder="Αναζήτηση δρομολογίου, φορτηγού, εταιρείας..."
        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500"
      />

      {/* Table */}
      {loading ? (
        <div className="text-slate-400 py-8 text-center">Φόρτωση...</div>
      ) : filtered.length === 0 ? (
        <div className="text-slate-500 py-8 text-center">Δεν βρέθηκαν κρατήσεις</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(b => {
            const dep = b.departure ? parseISO(b.departure) : null
            const dow = dep ? format(dep, 'EEEE', { locale: el }) : ''
            return (
              <div key={b.id}
                className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 hover:border-slate-600 transition-colors">
                {/* Δρομολόγιο + ημερομηνία */}
                <div className="flex-1 min-w-48">
                  <p className="text-white font-semibold text-sm">{b.route}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {dep ? format(dep, 'd MMM yyyy', { locale: el }) : '—'}
                    {dow && <span className="text-slate-500"> · {dow}</span>}
                  </p>
                </div>
                {/* Φορτηγό */}
                <div className="min-w-24">
                  <p className="text-slate-400 text-xs">Φορτηγό</p>
                  <p className="text-white text-sm font-medium">{b.truck || '—'}</p>
                </div>
                {/* Μέτρα */}
                <div className="min-w-16 text-center">
                  <p className="text-slate-400 text-xs">Μέτρα</p>
                  <p className="text-white text-sm font-medium">{b.meters ?? 16.5}</p>
                </div>
                {/* €/μ */}
                <div className="min-w-20 text-center">
                  <p className="text-slate-400 text-xs">€/μ</p>
                  <p className="text-white text-sm font-medium">{b.price_per_m ? `${b.price_per_m}` : '—'}</p>
                </div>
                {/* Σύνολο */}
                <div className="min-w-24 text-right">
                  <p className="text-slate-400 text-xs">Σύνολο</p>
                  <p className="text-green-400 text-sm font-bold">{b.total_cost ? `${b.total_cost.toLocaleString('el-GR')} €` : '—'}</p>
                </div>
                {/* Εταιρεία / ref */}
                {(b.company || b.booking_ref) && (
                  <div className="min-w-32">
                    <p className="text-slate-400 text-xs">{b.company || ''}</p>
                    {b.booking_ref && <p className="text-slate-500 text-xs">#{b.booking_ref}</p>}
                  </div>
                )}
                {/* Actions */}
                <div className="flex gap-2 ml-auto">
                  <button onClick={() => openEdit(b)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs transition-colors">✏️</button>
                  <button onClick={() => handleDelete(b.id)}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-red-900/60 text-white rounded-xl text-xs transition-colors">🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-800 rounded-t-3xl sm:rounded-3xl border border-slate-700 w-full sm:max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editing ? '✏️ Επεξεργασία Κράτησης' : '+ Νέα Κράτηση'}</h2>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-white text-xl">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Δρομολόγιο */}
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Δρομολόγιο *</label>
                <select name="route" value={form.route} onChange={handleChange}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                  <option value="">— Επιλογή —</option>
                  {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Ημερομηνία */}
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Ημερομηνία Αναχώρησης *</label>
                <input type="date" name="departure" value={form.departure} onChange={handleChange}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                {form.departure && (
                  <p className="text-slate-500 text-xs mt-1">
                    {format(new Date(form.departure), 'EEEE d MMMM yyyy', { locale: el })}
                  </p>
                )}
              </div>

              {/* Φορτηγό */}
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Φορτηγό</label>
                <select name="truck" value={form.truck} onChange={handleChange}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                  <option value="">— Χωρίς φορτηγό —</option>
                  {trucks.map(t => <option key={t.tr} value={t.tr}>{t.tr}{t.driver ? ` · ${t.driver}` : ''}</option>)}
                </select>
              </div>

              {/* Μέτρα */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Μέτρα (LDM)</label>
                <input type="number" name="meters" value={form.meters} onChange={handleChange} step="0.5"
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>

              {/* €/μ */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  €/μέτρο
                  {form.route && form.departure && (
                    <span className="text-blue-400 ml-1">(αυτόματο)</span>
                  )}
                </label>
                <input type="number" name="price_per_m" value={form.price_per_m} onChange={handleChange} step="0.1"
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>

              {/* Σύνολο */}
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Σύνολο (€)</label>
                <input type="number" name="total_cost" value={form.total_cost} onChange={handleChange}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>

              {/* Εταιρεία */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Εταιρεία</label>
                <input name="company" value={form.company} onChange={handleChange}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>

              {/* Αρ. Κράτησης */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Αρ. Κράτησης</label>
                <input name="booking_ref" value={form.booking_ref} onChange={handleChange}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>

              {/* Σημειώσεις */}
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Σημειώσεις</label>
                <textarea name="notes" value={form.notes} onChange={handleChange} rows={2}
                  className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm transition-colors">
                Ακύρωση
              </button>
              <button onClick={handleSave} disabled={saving || !form.route || !form.departure}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium transition-colors">
                {saving ? 'Αποθήκευση...' : '💾 Αποθήκευση'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
