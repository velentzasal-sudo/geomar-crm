import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Searchable dropdown component
function SearchableSelect({ label, value, onChange, options, placeholder = '— Αναζήτηση —' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Sync query with value when modal opens/closes
  useEffect(() => {
    setQuery(value || '')
  }, [value])

  const filtered = options.filter(o =>
    o.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50)

  function select(val) {
    onChange(val)
    setQuery(val)
    setOpen(false)
  }

  function clear() {
    onChange('')
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      {label && <label className="block text-xs text-slate-400 mb-1">{label}</label>}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 pr-8 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
          >✕</button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-slate-700 border border-slate-600 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={() => select(opt)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-600 transition-colors ${opt === value ? 'text-blue-300 font-medium' : 'text-white'}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const STATUSES = ['Open', 'Ανατεθειμένη', 'Μεταφορά', 'Παράδοση', 'Delivered']
const PAL_TYPES = ['E', 'B', 'P', 'M', 'χύμα']
const LDM_FACTORS = { E: 0.40, B: 0.50, P: 0.60, M: 1.00 }
const TLDM = 13.20

const STATUS_COLORS = {
  'Open':          'bg-blue-900/50 text-blue-300 border-blue-700',
  'Ανατεθειμένη': 'bg-orange-900/50 text-orange-300 border-orange-700',
  'Μεταφορά':      'bg-green-900/50 text-green-300 border-green-700',
  'Παράδοση':      'bg-purple-900/50 text-purple-300 border-purple-700',
  'Delivered':     'bg-slate-700 text-slate-400 border-slate-600',
}

const EMPTY = {
  client:'', firm:'', from:'', to:'', recip:'',
  pal:'E', qty:'', ldm:'', wgt:'', tmp:'',
  rdy:'', price:'', notes:'', status:'Open', truck:'',
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [firms, setFirms] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [saving, setSaving] = useState(false)
  const [showDelivered, setShowDelivered] = useState(false)

  useEffect(() => { loadAll() }, [])
  useEffect(() => { loadOrders() }, [showDelivered])

  async function loadAll() {
    const [{ data: f }, { data: c }] = await Promise.all([
      supabase.from('firms').select('id,name,street,num,city,country').order('name'),
      supabase.from('clients').select('id,name,city,address').order('name'),
    ])
    setFirms(f || [])
    setClients(c || [])
  }

  async function loadOrders() {
    setLoading(true)
    let q = supabase.from('orders').select('*').order('created_at', { ascending: false })
    if (!showDelivered) q = q.not('status', 'eq', 'Delivered')
    const { data } = await q
    setOrders(data || [])
    setLoading(false)
  }

  function calcLdm(pal, qty) {
    if (!qty || pal === 'χύμα') return ''
    const f = LDM_FACTORS[pal]
    if (!f) return ''
    return (parseFloat(qty) * f).toFixed(2)
  }

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setShowModal(true)
  }

  function openEdit(o) {
    setEditing(o.id)
    setForm({ ...o })
    setShowModal(true)
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => {
      const next = { ...f, [name]: value }
      if (name === 'qty' || name === 'pal') {
        next.ldm = calcLdm(next.pal, next.qty)
      }
      return next
    })
  }

  function handleSelectClient(value) {
    setForm(f => {
      const client = clients.find(c => c.name === value)
      const addr = client ? [client.address, client.city].filter(Boolean).join(', ') : f.to
      return { ...f, client: value, to: client ? addr : f.to }
    })
  }

  function handleSelectFirm(value) {
    setForm(f => {
      const firm = firms.find(fi => fi.name === value)
      if (firm) {
        const addr = [firm.street, firm.num].filter(Boolean).join(' ')
        const full = [addr, firm.city, firm.country].filter(Boolean).join(', ')
        return { ...f, firm: value, from: full }
      }
      return { ...f, firm: value }
    })
  }

  async function handleSave() {
    setSaving(true)
    const { id: _id, ...rest } = form
    const payload = { ...rest, qty: parseFloat(form.qty)||0, ldm: parseFloat(form.ldm)||0, wgt: parseFloat(form.wgt)||0, price: parseFloat(form.price)||0 }
    if (editing) {
      await supabase.from('orders').update(payload).eq('id', editing)
    } else {
      await supabase.from('orders').insert([payload])
    }
    setSaving(false)
    setShowModal(false)
    loadOrders()
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή παραγγελίας;')) return
    await supabase.from('orders').delete().eq('id', id)
    loadOrders()
  }

  async function cycleStatus(o) {
    const idx = STATUSES.indexOf(o.status)
    const next = STATUSES[(idx + 1) % STATUSES.length]
    await supabase.from('orders').update({ status: next }).eq('id', o.id)
    setOrders(prev => prev.map(x => x.id === o.id ? { ...x, status: next } : x))
  }

  const filtered = orders.filter(o => {
    const matchStatus = filterStatus === 'all' || o.status === filterStatus
    const q = search.toLowerCase()
    const matchSearch = !q || [o.client, o.firm, o.from, o.to, o.truck].some(v => v?.toLowerCase().includes(q))
    return matchStatus && matchSearch
  })

  const totalLdm = filtered.reduce((s, o) => s + (parseFloat(o.ldm) || 0), 0)
  const ldmPct = Math.min(100, (totalLdm / TLDM) * 100)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">📦 Παραγγελίες</h1>
        <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm">
          + Νέα Παραγγελία
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Αναζήτηση..."
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm w-56 focus:outline-none focus:border-blue-500"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="all">Όλες</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-slate-400 text-sm cursor-pointer">
          <input type="checkbox" checked={showDelivered} onChange={e => setShowDelivered(e.target.checked)} className="rounded" />
          Παραδομένες
        </label>
        <div className="ml-auto text-slate-400 text-sm">{filtered.length} παραγγελίες</div>
      </div>

      {filtered.length > 0 && (
        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-400">Σύνολο LDM</span>
            <span className={totalLdm > TLDM ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>
              {totalLdm.toFixed(2)} / {TLDM} LDM {totalLdm > TLDM ? '⚠️ ΥΠΕΡΒΑΣΗ' : ''}
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${ldmPct >= 100 ? 'bg-red-500' : ldmPct >= 80 ? 'bg-orange-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(100, ldmPct)}%` }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Φόρτωση...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500">Δεν βρέθηκαν παραγγελίες</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(o => {
            const ldm = parseFloat(o.ldm) || 0
            return (
              <div key={o.id} className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex items-center gap-3">
                <button
                  onClick={() => cycleStatus(o)}
                  className={`text-xs px-2 py-1 rounded-lg border shrink-0 transition-opacity hover:opacity-70 ${STATUS_COLORS[o.status] || 'bg-slate-700 text-slate-300 border-slate-600'}`}
                  title="Κλικ για αλλαγή status"
                >
                  {o.status}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{o.client}</p>
                  <p className="text-slate-400 text-xs">{o.firm} · {o.from} → {o.to}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-slate-300 text-sm">{o.qty} {o.pal} · <span className={ldm > TLDM ? 'text-red-400' : 'text-slate-300'}>{ldm.toFixed(2)} LDM</span></p>
                  <p className="text-slate-500 text-xs">{o.rdy} {o.truck ? `· 🚚 ${o.truck}` : ''}</p>
                </div>
                {o.price > 0 && (
                  <div className="text-green-400 text-sm font-medium shrink-0">€{o.price}</div>
                )}
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(o)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white text-sm">✏️</button>
                  <button onClick={() => handleDelete(o.id)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400 text-sm">🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-6">{editing ? '✏️ Επεξεργασία' : '➕ Νέα Παραγγελία'}</h2>

              <div className="grid grid-cols-2 gap-4">

                {/* Πελάτης searchable dropdown */}
                <div className="col-span-2">
                  <SearchableSelect
                    label="Πελάτης"
                    value={form.client}
                    onChange={handleSelectClient}
                    options={clients.map(c => c.name)}
                    placeholder="Αναζήτηση πελάτη..."
                  />
                </div>

                {/* Φίρμα searchable dropdown */}
                <div>
                  <SearchableSelect
                    label="Φίρμα (αποστολή)"
                    value={form.firm}
                    onChange={handleSelectFirm}
                    options={firms.map(f => f.name)}
                    placeholder="Αναζήτηση φίρμας..."
                  />
                </div>

                <Field label="Παραλήπτης" name="recip" value={form.recip} onChange={handleChange} />

                {/* Από — αυτόματο από φίρμα */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Από (διεύθυνση)</label>
                  <input name="from" value={form.from} onChange={handleChange}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>

                {/* Προς — αυτόματο από πελάτη */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Προς (διεύθυνση)</label>
                  <input name="to" value={form.to} onChange={handleChange}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Τύπος</label>
                  <select name="pal" value={form.pal} onChange={handleChange}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    {PAL_TYPES.map(p => <option key={p} value={p}>{p === 'E' ? 'EPAL' : p === 'B' ? 'Βιομ.' : p === 'P' ? 'Μισή' : p === 'M' ? 'Μέτρο' : 'Χύμα'}</option>)}
                  </select>
                </div>

                <Field label="Τεμάχια" name="qty" type="number" value={form.qty} onChange={handleChange} />
                <Field label="LDM" name="ldm" type="number" value={form.ldm} onChange={handleChange} />
                <Field label="Βάρος (kg)" name="wgt" type="number" value={form.wgt} onChange={handleChange} />
                <Field label="Θερμοκρασία" name="tmp" value={form.tmp} onChange={handleChange} />
                <Field label="Έτοιμο" name="rdy" type="date" value={form.rdy} onChange={handleChange} />
                <Field label="Τιμή (€)" name="price" type="number" value={form.price} onChange={handleChange} />
                <Field label="Φορτηγό" name="truck" value={form.truck} onChange={handleChange} />

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Status</label>
                  <select name="status" value={form.status} onChange={handleChange}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Σημειώσεις</label>
                  <textarea name="notes" value={form.notes} onChange={handleChange} rows={2}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
                </div>
              </div>

              {form.ldm && (
                <div className={`mt-3 px-4 py-2 rounded-xl text-sm ${parseFloat(form.ldm) > TLDM ? 'bg-red-900/30 text-red-300' : 'bg-slate-700 text-slate-300'}`}>
                  LDM: {parseFloat(form.ldm).toFixed(2)} / {TLDM} {parseFloat(form.ldm) > TLDM ? '⚠️ Υπέρβαση!' : '✓'}
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm">
                  Ακύρωση
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium">
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

function Field({ label, name, value, onChange, type = 'text', className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={value ?? ''}
        onChange={onChange}
        className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
      />
    </div>
  )
}
