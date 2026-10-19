import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { el } from 'date-fns/locale'

// Searchable dropdown component
function SearchableSelect({ label, value, onChange, options, placeholder = '— Αναζήτηση —', error = false }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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
      {label && <label className={`block text-xs mb-1 ${error ? 'text-red-400' : 'text-slate-400'}`}>{label}</label>}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={`w-full bg-slate-700 border rounded-xl px-3 py-2 pr-8 text-white text-sm focus:outline-none focus:border-blue-500 ${error ? 'border-red-500' : 'border-slate-600'}`}
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
  rdy:'', load_date:'', delivery_date:'', price:'', notes:'', status:'Open', truck:'',
}

function validate(form) {
  const errors = {}
  if (!form.client?.trim())   errors.client = 'Υποχρεωτικό'
  if (!form.load_date)        errors.load_date = 'Υποχρεωτικό'
  if (!form.ldm && !form.qty) errors.ldm = 'Βάλε LDM ή τεμάχια'
  return errors
}

export default function Orders() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [orders, setOrders] = useState([])
  const [trucks, setTrucks] = useState([])
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
  const [showDispatch, setShowDispatch] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (!loading) loadOrders() }, [showDelivered])

  async function loadAll() {
    const [{ data: f }, { data: c }, { data: t }] = await Promise.all([
      supabase.from('firms').select('id,name,street,num,city,country').order('name'),
      supabase.from('clients').select('id,name,city,address').order('name'),
      supabase.from('trucks').select('*').order('tr'),
    ])
    setFirms(f || [])
    setClients(c || [])
    setTrucks(t || [])
    loadOrders()
  }

  async function loadOrders() {
    setLoading(true)
    let q = supabase.from('orders').select('*').order('created_at', { ascending: false })
    if (!showDelivered) q = q.not('status', 'eq', 'Delivered')
    const { data, error } = await q
    if (error) { console.error('loadOrders error:', error); setLoading(false); return }
    const loaded = data || []
    setOrders(loaded)
    setLoading(false)
    // If ?open=<id> in URL, open that order's modal
    const openId = searchParams.get('open')
    if (openId) {
      const target = loaded.find(o => String(o.id) === String(openId))
      if (target) {
        openEdit(target)
        setSearchParams({})
      }
    }
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
    setErrors({})
    setShowModal(true)
  }

  function openEdit(o) {
    setEditing(o.id)
    setForm({ ...o })
    setErrors({})
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

  function handleSelectTruck(value) {
    // store only the tr code (before ' · ')
    const tr = value.split(' · ')[0].trim()
    setForm(f => ({ ...f, truck: tr }))
  }

  async function handleSave() {
    const errs = validate(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setSaving(true)
    const { id: _id, ...rest } = form
    const payload = {
      ...rest,
      qty: parseFloat(form.qty)||0,
      ldm: parseFloat(form.ldm)||0,
      wgt: parseFloat(form.wgt)||0,
      price: parseFloat(form.price)||0,
      load_date: form.load_date || null,
      delivery_date: form.delivery_date || null,
      rdy: form.rdy || null,
    }
    // auto-set status if truck assigned and status is Open
    if (payload.truck && payload.status === 'Open') {
      payload.status = 'Ανατεθειμένη'
    }
    if (editing) {
      const { error } = await supabase.from('orders').update(payload).eq('id', editing)
      if (error) { console.error('Update error:', error); setSaving(false); return }
    } else {
      const { error } = await supabase.from('orders').insert([payload])
      if (error) { console.error('Insert error:', error); setSaving(false); return }
    }
    setSaving(false)
    setShowModal(false)
    await loadOrders()
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

  async function unassignTruck(o) {
    await supabase.from('orders').update({ truck: '', status: 'Open' }).eq('id', o.id)
    loadOrders()
  }

  function openWhatsApp(o) {
    const truck = trucks.find(t => t.tr === o.truck)
    const firm = firms.find(f => f.name?.toLowerCase() === o.firm?.toLowerCase())
    const phone = truck?.phone?.replace(/\D/g, '') || ''
    const addr = firm ? [firm.street, firm.num].filter(Boolean).join(' ') : ''
    const city = firm?.city || ''
    const country = firm?.country || ''
    const mapsQuery = [addr, city, country].filter(Boolean).join(', ')
    const mapsUrl = firm?.maps_link
      ? firm.maps_link
      : mapsQuery ? `https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}` : ''
    const rdy = o.rdy ? format(new Date(o.rdy), 'd MMM yyyy', { locale: el }) : '—'
    const msg = [
      '📦 *Ανάθεση Φορτίου*', '',
      '🏭 *Φίρμα:* ' + (o.firm || '—'),
      addr ? '🏠 *Οδός:* ' + addr : null,
      city ? '🏙 *Πόλη:* ' + city : null,
      country ? '🌍 *Χώρα:* ' + country : null,
      mapsUrl ? '📍 *Maps:* ' + mapsUrl : null, '',
      '📋 *Φορτίο*',
      '📬 *Παραλήπτης:* ' + (o.to || '—'),
      '📅 *Ετοιμότητα:* ' + rdy,
      '🔢 *Παλέτες:* ' + (o.qty || '—') + ' ' + (o.pal || ''),
      '📐 *LDM:* ' + (parseFloat(o.ldm) || 0).toFixed(2),
      o.wgt ? '⚖️ *Βάρος:* ' + o.wgt + ' kg' : null,
      o.tmp ? '🌡 *Θερμοκρασία:* ' + o.tmp + '°C' : null,
    ].filter(Boolean).join('\n')
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  // LDM per truck (for active non-Delivered orders)
  function truckLdm(truckName) {
    return orders
      .filter(o => o.truck === truckName && o.status !== 'Delivered')
      .reduce((s, o) => s + (parseFloat(o.ldm) || 0), 0)
  }

  const filtered = orders.filter(o => {
    const matchStatus = filterStatus === 'all' || o.status === filterStatus
    const q = search.toLowerCase()
    const matchSearch = !q || [o.client, o.firm, o.from, o.to, o.truck].some(v => v?.toLowerCase().includes(q))
    return matchStatus && matchSearch
  })

  const totalLdm = filtered.reduce((s, o) => s + (parseFloat(o.ldm) || 0), 0)
  const ldmPct = Math.min(100, (totalLdm / TLDM) * 100)

  // Trucks with active orders for dispatch view
  const activeTrucks = trucks.filter(t =>
    orders.some(o => o.truck === t.tr && o.status !== 'Delivered')
  )
  const unassignedOrders = orders.filter(o => !o.truck || o.status === 'Open')

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-white">📦 Παραγγελίες</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDispatch(v => !v)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${showDispatch ? 'bg-orange-600 border-orange-500 text-white' : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white'}`}
          >
            🗂 Dispatch {showDispatch ? '▲' : '▼'}
          </button>
          <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm">
            + Νέα Παραγγελία
          </button>
        </div>
      </div>

      {/* ── DISPATCH PANEL ── */}
      {showDispatch && (
        <div className="bg-slate-800 border border-orange-700/40 rounded-3xl p-5 space-y-4">
          <h2 className="text-orange-300 font-bold text-sm uppercase tracking-wide">🗂 Dispatch — Ανάθεση & Στόλος</h2>

          {/* Unassigned orders */}
          {unassignedOrders.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs font-medium mb-2">Αναθέτεσαι ({unassignedOrders.length})</p>
              <div className="space-y-1.5">
                {unassignedOrders.map(o => (
                  <div key={o.id} className="bg-slate-700 rounded-xl px-3 py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{o.client}</p>
                      <p className="text-slate-400 text-xs">{o.from} → {o.to} · {o.qty} {o.pal} · {(parseFloat(o.ldm)||0).toFixed(2)} LDM</p>
                    </div>
                    <button
                      onClick={() => openEdit(o)}
                      className="shrink-0 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl"
                    >
                      Ανάθεση →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Truck LDM summary */}
          {trucks.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs font-medium mb-2">Στόλος — LDM</p>
              <div className="grid grid-cols-1 gap-2">
                {trucks.map(t => {
                  const ldm = truckLdm(t.tr)
                  const cap = parseFloat(t.ldm) || TLDM
                  const pct = Math.min(100, (ldm / cap) * 100)
                  const over = ldm > cap
                  const tOrders = orders.filter(o => o.truck === t.tr && o.status !== 'Delivered')
                  return (
                    <div key={t.id} className={`bg-slate-700 rounded-2xl px-4 py-3 border ${over ? 'border-red-700' : 'border-slate-600'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-white font-bold text-sm">🚚 {t.tr}</span>
                        <span className="text-slate-400 text-xs">{t.driver}</span>
                        <span className={`ml-auto text-xs font-bold ${over ? 'text-red-400' : 'text-green-400'}`}>
                          {ldm.toFixed(2)} / {cap} LDM {over ? '⚠️' : ''}
                        </span>
                        {t.phone && (
                          <span className="text-slate-500 text-xs">{t.phone}</span>
                        )}
                      </div>
                      <div className="w-full bg-slate-600 rounded-full h-1.5 mb-2">
                        <div
                          className={`h-1.5 rounded-full transition-all ${over ? 'bg-red-500' : pct >= 80 ? 'bg-orange-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      {tOrders.length > 0 && (
                        <div className="space-y-1">
                          {tOrders.map(o => (
                            <div key={o.id} className="flex items-center gap-2 bg-slate-600/50 rounded-lg px-2 py-1">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[o.status] || ''}`}>{o.status}</span>
                              <span className="text-white text-xs flex-1 truncate">{o.client}</span>
                              <span className="text-slate-400 text-xs">{(parseFloat(o.ldm)||0).toFixed(2)} LDM</span>
                              <button onClick={() => openWhatsApp(o)} className="text-green-400 hover:text-green-300 text-xs" title="WhatsApp">📲</button>
                              <button onClick={() => unassignTruck(o)} className="text-slate-500 hover:text-red-400 text-xs" title="Αφαίρεση">✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Αναζήτηση..."
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm w-full sm:w-56 focus:outline-none focus:border-blue-500"
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
                  <p className="text-slate-500 text-xs">
                    {o.load_date ? `📦 ${o.load_date.substring(0,10)}` : o.rdy ? `🗓 ${o.rdy.substring(0,10)}` : ''}
                    {o.delivery_date ? ` → 🏁 ${o.delivery_date.substring(0,10)}` : ''}
                    {o.truck ? ` · 🚚 ${o.truck}` : ''}
                  </p>
                </div>
                {o.price > 0 && (
                  <div className="text-green-400 text-sm font-medium shrink-0">€{o.price}</div>
                )}
                <div className="flex gap-1 shrink-0">
                  {o.truck && (
                    <button onClick={() => openWhatsApp(o)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-green-400 text-sm" title="WhatsApp">📲</button>
                  )}
                  <button onClick={() => openEdit(o)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white text-sm">✏️</button>
                  <button onClick={() => handleDelete(o.id)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400 text-sm">🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-2 md:p-4 md:items-center">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-2xl max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-6">{editing ? '✏️ Επεξεργασία' : '➕ Νέα Παραγγελία'}</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Πελάτης */}
                <div className="col-span-2">
                  <SearchableSelect
                    label={errors.client ? `Πελάτης · ${errors.client}` : 'Πελάτης *'}
                    value={form.client}
                    onChange={handleSelectClient}
                    options={clients.map(c => c.name)}
                    placeholder="Αναζήτηση πελάτη..."
                    error={!!errors.client}
                  />
                </div>

                {/* Φίρμα */}
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

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Από (διεύθυνση)</label>
                  <input name="from" value={form.from} onChange={handleChange}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>

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

                <Field label="Τεμάχια" name="qty" type="number" value={form.qty} onChange={handleChange} error={errors.ldm || ''} />
                <Field label="LDM" name="ldm" type="number" value={form.ldm} onChange={handleChange} error={errors.ldm ? '↑ ή τεμάχια' : ''} />
                <Field label="Βάρος (kg)" name="wgt" type="number" value={form.wgt} onChange={handleChange} />
                <Field label="Θερμοκρασία" name="tmp" value={form.tmp} onChange={handleChange} />
                <Field label="Ημ. Φόρτωσης *" name="load_date" type="date" value={form.load_date} onChange={handleChange} error={errors.load_date} />
                <Field label="Ημ. Παράδοσης" name="delivery_date" type="date" value={form.delivery_date} onChange={handleChange} />
                <Field label="Τιμή (€)" name="price" type="number" value={form.price} onChange={handleChange} />

                {/* Φορτηγό — searchable */}
                <div>
                  <SearchableSelect
                    label="🚚 Φορτηγό"
                    value={form.truck}
                    onChange={handleSelectTruck}
                    options={trucks.map(t => t.tr + (t.driver ? ' · ' + t.driver : ''))}
                    placeholder="Επιλογή φορτηγού..."
                  />
                  {form.truck && (() => {
                    const trName = form.truck.split(' · ')[0]
                    const ldm = truckLdm(trName)
                    const cap = parseFloat(trucks.find(t => t.tr === trName)?.ldm) || TLDM
                    const rem = cap - ldm
                    const fits = rem >= (parseFloat(form.ldm) || 0)
                    return (
                      <p className={`text-xs mt-1 ${fits ? 'text-green-400' : 'text-red-400'}`}>
                        Διαθέσιμο: {rem.toFixed(2)} LDM {fits ? '✓' : '⚠️ Δεν χωράει'}
                      </p>
                    )
                  })()}
                </div>

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

function Field({ label, name, value, onChange, type = 'text', className = '', error = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs mb-1 flex items-center gap-1">
        <span className={error ? 'text-red-400' : 'text-slate-400'}>{label}</span>
        {error && <span className="text-red-400 text-xs">· {error}</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value ?? ''}
        onChange={onChange}
        className={`w-full bg-slate-700 border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 ${error ? 'border-red-500' : 'border-slate-600'}`}
      />
    </div>
  )
}
