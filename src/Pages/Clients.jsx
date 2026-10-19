import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO, addMonths } from 'date-fns'
import { el } from 'date-fns/locale'

const EMPTY = { name: '', afm: '', city: '', tk: '', address: '', phone: '', pricelist: '', notes: '', total_debt: '', next_card_date: '', monthly_card_repeat: '' }

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [showDebt, setShowDebt] = useState(false)

  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('name')
    setClients(data || [])
    setLoading(false)
  }

  function openNew() { setEditing(null); setForm(EMPTY); setShowModal(true) }
  function openEdit(c) { setEditing(c.id); setForm({ ...c, total_debt: c.total_debt ?? '', next_card_date: c.next_card_date ?? '', monthly_card_repeat: c.monthly_card_repeat ?? '' }); setShowModal(true) }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const { id: _id, ...rest } = form
    const payload = {
      ...rest,
      total_debt: parseFloat(form.total_debt) || 0,
      monthly_card_repeat: parseInt(form.monthly_card_repeat) || null,
      next_card_date: form.next_card_date || null,
    }
    if (editing) {
      await supabase.from('clients').update(payload).eq('id', editing)
    } else {
      await supabase.from('clients').insert([payload])
    }
    setSaving(false)
    setShowModal(false)
    loadClients()
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή πελάτη;')) return
    await supabase.from('clients').delete().eq('id', id)
    loadClients()
  }

  async function markCardSent(c) {
    let next = null
    if (c.monthly_card_repeat && c.next_card_date) {
      next = format(addMonths(parseISO(c.next_card_date), c.monthly_card_repeat), 'yyyy-MM-dd')
    }
    await supabase.from('clients').update({ next_card_date: next }).eq('id', c.id)
    loadClients()
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || [c.name, c.city, c.afm, c.phone].some(v => v?.toLowerCase().includes(q))
    const matchDebt = !showDebt || (parseFloat(c.total_debt) > 0)
    return matchSearch && matchDebt
  })

  const totalDebt = clients.reduce((s, c) => s + (parseFloat(c.total_debt) || 0), 0)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">👥 Πελάτες</h1>
        <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm">
          + Νέος Πελάτης
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-400">{clients.length}</p>
          <p className="text-slate-400 text-sm mt-1">Σύνολο</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-red-400">€{totalDebt.toLocaleString('el-GR', { minimumFractionDigits: 2 })}</p>
          <p className="text-slate-400 text-sm mt-1">Συνολικό Χρέος</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-orange-400">{clients.filter(c => c.next_card_date).length}</p>
          <p className="text-slate-400 text-sm mt-1">Με Καρτέλα</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Αναζήτηση..."
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm w-56 focus:outline-none focus:border-blue-500"
        />
        <label className="flex items-center gap-2 text-slate-400 text-sm cursor-pointer">
          <input type="checkbox" checked={showDebt} onChange={e => setShowDebt(e.target.checked)} className="rounded" />
          Μόνο με χρέος
        </label>
        <div className="ml-auto text-slate-400 text-sm">{filtered.length} πελάτες</div>
      </div>

      {loading ? (
        <p className="text-slate-400">Φόρτωση...</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const debt = parseFloat(c.total_debt) || 0
            const hasCard = !!c.next_card_date
            return (
              <div key={c.id} className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium text-sm truncate">{c.name}</p>
                    {hasCard && (
                      <span className="text-xs bg-orange-900/50 text-orange-300 border border-orange-700 px-2 py-0.5 rounded-full shrink-0">
                        📅 {format(parseISO(c.next_card_date), 'd MMM', { locale: el })}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs truncate">{c.city} {c.phone ? `· 📞 ${c.phone}` : ''}</p>
                </div>

                {debt > 0 && (
                  <div className="text-red-400 text-sm font-medium shrink-0">€{debt.toLocaleString('el-GR', { minimumFractionDigits: 2 })}</div>
                )}

                <div className="flex gap-1 shrink-0">
                  {hasCard && (
                    <button onClick={() => markCardSent(c)} title="Καρτέλα εστάλη"
                      className="p-1.5 rounded-lg hover:bg-orange-900/30 text-orange-400 text-sm">✉️</button>
                  )}
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white text-sm">✏️</button>
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-900/40 text-slate-400 hover:text-red-400 text-sm">🗑️</button>
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
              <h2 className="text-xl font-bold text-white mb-6">{editing ? '✏️ Επεξεργασία' : '➕ Νέος Πελάτης'}</h2>
              <div className="grid grid-cols-2 gap-4">
                <CField label="Επωνυμία" name="name" value={form.name} onChange={handleChange} className="col-span-2" />
                <CField label="ΑΦΜ" name="afm" value={form.afm} onChange={handleChange} />
                <CField label="Πόλη" name="city" value={form.city} onChange={handleChange} />
                <CField label="ΤΚ" name="tk" value={form.tk} onChange={handleChange} />
                <CField label="Τηλέφωνο" name="phone" value={form.phone} onChange={handleChange} />
                <CField label="Διεύθυνση" name="address" value={form.address} onChange={handleChange} className="col-span-2" />
                <CField label="Τιμοκατάλογος" name="pricelist" value={form.pricelist} onChange={handleChange} />
                <CField label="Χρέος (€)" name="total_debt" type="number" value={form.total_debt} onChange={handleChange} />
                <CField label="Επόμενη Καρτέλα" name="next_card_date" type="date" value={form.next_card_date} onChange={handleChange} />
                <CField label="Επανάληψη (μήνες)" name="monthly_card_repeat" type="number" value={form.monthly_card_repeat} onChange={handleChange} />
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

function CField({ label, name, value, onChange, type = 'text', className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input type={type} name={name} value={value ?? ''} onChange={onChange}
        className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
    </div>
  )
}
