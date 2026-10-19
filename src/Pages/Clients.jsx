import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO, addMonths, isToday, isPast } from 'date-fns'
import { el } from 'date-fns/locale'
import * as XLSX from 'xlsx'

const EMPTY = { name: '', afm: '', city: '', tk: '', address: '', phone: '', pricelist: '', notes: '', total_debt: '', next_card_date: '', monthly_card_repeat: '' }

export default function Clients() {
  const [clients, setClients] = useState([])
  const [orders, setOrders] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [showDebt, setShowDebt] = useState(false)

  // Import state
  const [importPreview, setImportPreview] = useState(null) // {matched, unmatched}
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  // Client detail modal
  const [detailClient, setDetailClient] = useState(null)
  const [newPayment, setNewPayment] = useState({ amount: '', due_date: '', notes: '' })
  const [savingPayment, setSavingPayment] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: cl }, { data: ord }, { data: pay }] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('orders').select('id,client,status,rdy,qty,pal,ldm,from,to').order('created_at', { ascending: false }),
      supabase.from('payments').select('*').order('due_date'),
    ])
    setClients(cl || [])
    setOrders(ord || [])
    setPayments(pay || [])
    setLoading(false)
  }

  function openNew() { setEditing(null); setForm(EMPTY); setShowModal(true) }
  function openEdit(c) {
    setEditing(c.id)
    setForm({ ...c, total_debt: c.total_debt ?? '', next_card_date: c.next_card_date ?? '', monthly_card_repeat: c.monthly_card_repeat ?? '' })
    setShowModal(true)
  }

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
    loadAll()
  }

  async function handleDelete(id) {
    if (!confirm('Διαγραφή πελάτη;')) return
    await supabase.from('clients').delete().eq('id', id)
    loadAll()
  }

  async function markCardSent(c) {
    let next = null
    if (c.monthly_card_repeat && c.next_card_date) {
      next = format(addMonths(parseISO(c.next_card_date), c.monthly_card_repeat), 'yyyy-MM-dd')
    }
    await supabase.from('clients').update({ next_card_date: next }).eq('id', c.id)
    loadAll()
  }

  // ── EXCEL IMPORT ──────────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

      const matched = []
      const unmatched = []

      rows.forEach(row => {
        // Normalize: find columns flexibly
        const name = (row['Επωνυμία'] || row['ΕΠΩΝΥΜΙΑ'] || row['name'] || '').toString().trim()
        const afm  = (row['Α.Φ.Μ.'] || row['ΑΦΜ'] || row['afm'] || row['Α.Φ.Μ'] || '').toString().trim()
        const debt = parseFloat((row['Υπόλοιπο'] || row['ΥΠΟΛΟΙΠΟ'] || row['debt'] || 0).toString().replace(',', '.')) || 0
        const notes = (row['Παρατηρήσεις'] || row['ΠΑΡΑΤΗΡΗΣΕΙΣ'] || row['notes'] || '').toString().trim()

        if (!name && !afm) return

        // Match: first by AFM, then by name
        let found = null
        if (afm) found = clients.find(c => c.afm?.toString().trim() === afm)
        if (!found && name) found = clients.find(c => c.name?.trim().toLowerCase() === name.toLowerCase())

        if (found) {
          matched.push({ client: found, newDebt: debt, newNotes: notes, name, afm })
        } else {
          unmatched.push({ name, afm, debt })
        }
      })

      setImportPreview({ matched, unmatched })
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function confirmImport() {
    if (!importPreview) return
    setImporting(true)
    for (const item of importPreview.matched) {
      await supabase.from('clients').update({
        total_debt: item.newDebt,
        notes: item.newNotes || item.client.notes,
      }).eq('id', item.client.id)
    }
    setImporting(false)
    setImportPreview(null)
    loadAll()
    alert(`✅ Ενημερώθηκαν ${importPreview.matched.length} πελάτες`)
  }

  // ── PAYMENTS ──────────────────────────────────────────────────
  async function addPayment() {
    if (!newPayment.amount || !detailClient) return
    setSavingPayment(true)
    await supabase.from('payments').insert([{
      client_id: detailClient.id,
      client_name: detailClient.name,
      amount: parseFloat(newPayment.amount) || 0,
      due_date: newPayment.due_date || null,
      notes: newPayment.notes || '',
      paid: false,
    }])
    setNewPayment({ amount: '', due_date: '', notes: '' })
    setSavingPayment(false)
    const { data } = await supabase.from('payments').select('*').order('due_date')
    setPayments(data || [])
  }

  async function togglePaid(pay) {
    await supabase.from('payments').update({ paid: !pay.paid }).eq('id', pay.id)
    const { data } = await supabase.from('payments').select('*').order('due_date')
    setPayments(data || [])
  }

  async function deletePayment(id) {
    if (!confirm('Διαγραφή πληρωμής;')) return
    await supabase.from('payments').delete().eq('id', id)
    const { data } = await supabase.from('payments').select('*').order('due_date')
    setPayments(data || [])
  }

  // ── FILTERS ───────────────────────────────────────────────────
  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || [c.name, c.city, c.afm, c.phone].some(v => v?.toLowerCase().includes(q))
    const matchDebt = !showDebt || (parseFloat(c.total_debt) > 0)
    return matchSearch && matchDebt
  }).sort((a, b) => (parseFloat(b.total_debt) || 0) - (parseFloat(a.total_debt) || 0))

  const totalDebt = clients.reduce((s, c) => s + (parseFloat(c.total_debt) || 0), 0)

  // Detail data
  const clientOrders = detailClient ? orders.filter(o => o.client?.toLowerCase() === detailClient.name?.toLowerCase()) : []
  const clientPayments = detailClient ? payments.filter(p => p.client_id === detailClient.id) : []
  const pendingPayments = clientPayments.filter(p => !p.paid)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">👥 Πελάτες</h1>
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()}
            className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-xl font-medium text-sm">
            📥 Import Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
          <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium text-sm">
            + Νέος Πελάτης
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-400">{clients.length}</p>
          <p className="text-slate-400 text-sm mt-1">Σύνολο</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold text-red-400">€{totalDebt.toLocaleString('el-GR', { minimumFractionDigits: 2 })}</p>
          <p className="text-slate-400 text-sm mt-1">Συνολικό Υπόλοιπο</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-orange-400">{payments.filter(p => !p.paid).length}</p>
          <p className="text-slate-400 text-sm mt-1">Εκκρεμείς Πληρωμές</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Αναζήτηση..."
          className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm w-56 focus:outline-none focus:border-blue-500" />
        <label className="flex items-center gap-2 text-slate-400 text-sm cursor-pointer">
          <input type="checkbox" checked={showDebt} onChange={e => setShowDebt(e.target.checked)} className="rounded" />
          Μόνο με υπόλοιπο
        </label>
        <div className="ml-auto text-slate-400 text-sm">{filtered.length} πελάτες</div>
      </div>

      {/* Client list */}
      {loading ? <p className="text-slate-400">Φόρτωση...</p> : (
        <div className="space-y-2">
          {filtered.map(c => {
            const debt = parseFloat(c.total_debt) || 0
            const hasCard = !!c.next_card_date
            const cardDate = hasCard ? parseISO(c.next_card_date) : null
            const cardOverdue = cardDate && (isToday(cardDate) || isPast(cardDate))
            const clientPending = payments.filter(p => p.client_id === c.id && !p.paid).length
            return (
              <div key={c.id} className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex items-center gap-3">
                {/* Click name → detail */}
                <button className="flex-1 min-w-0 text-left" onClick={() => setDetailClient(c)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-medium text-sm hover:text-blue-400 transition-colors">{c.name}</p>
                    {hasCard && (
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 border ${cardOverdue ? 'bg-red-900/50 text-red-300 border-red-700' : 'bg-orange-900/50 text-orange-300 border-orange-700'}`}>
                        📅 {format(cardDate, 'd MMM', { locale: el })}
                      </span>
                    )}
                    {clientPending > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-300 border border-purple-700 shrink-0">
                        💰 {clientPending} εκκρ.
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs truncate">{c.afm ? `ΑΦΜ: ${c.afm}` : ''} {c.city ? `· ${c.city}` : ''}</p>
                </button>

                {debt > 0 && (
                  <div className="text-red-400 text-sm font-bold shrink-0">
                    €{debt.toLocaleString('el-GR', { minimumFractionDigits: 2 })}
                  </div>
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

      {/* ── IMPORT PREVIEW MODAL ── */}
      {importPreview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-2">📥 Προεπισκόπηση Import</h2>
              <p className="text-slate-400 text-sm mb-5">Έλεγξε τα δεδομένα πριν αποθηκευτούν.</p>

              <div className="space-y-4">
                <div>
                  <h3 className="text-green-400 font-medium mb-2">✅ Αναγνωρίστηκαν ({importPreview.matched.length})</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {importPreview.matched.map((item, i) => (
                      <div key={i} className="bg-slate-700 rounded-xl px-3 py-2 flex justify-between items-center text-sm">
                        <span className="text-white truncate">{item.client.name}</span>
                        <span className="text-green-400 font-medium shrink-0 ml-2">€{item.newDebt.toLocaleString('el-GR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {importPreview.unmatched.length > 0 && (
                  <div>
                    <h3 className="text-orange-400 font-medium mb-2">⚠️ Δεν αναγνωρίστηκαν ({importPreview.unmatched.length}) — δεν θα ενημερωθούν</h3>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {importPreview.unmatched.map((item, i) => (
                        <div key={i} className="bg-slate-700/50 rounded-xl px-3 py-2 flex justify-between text-sm">
                          <span className="text-slate-300 truncate">{item.name || '—'}</span>
                          <span className="text-slate-400 shrink-0 ml-2">ΑΦΜ: {item.afm || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setImportPreview(null)}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-xl text-sm">
                  Ακύρωση
                </button>
                <button onClick={confirmImport} disabled={importing}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-medium">
                  {importing ? 'Ενημέρωση...' : `✅ Ενημέρωση ${importPreview.matched.length} πελατών`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CLIENT DETAIL MODAL ── */}
      {detailClient && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-3xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">{detailClient.name}</h2>
                  <p className="text-slate-400 text-sm">{detailClient.afm ? `ΑΦΜ: ${detailClient.afm}` : ''} {detailClient.city ? `· ${detailClient.city}` : ''}</p>
                </div>
                <button onClick={() => setDetailClient(null)} className="text-slate-400 hover:text-white text-xl p-1">✕</button>
              </div>

              {/* Debt + card info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-700 rounded-2xl p-4">
                  <p className="text-slate-400 text-xs mb-1">Υπόλοιπο</p>
                  <p className="text-red-400 text-2xl font-bold">
                    €{(parseFloat(detailClient.total_debt) || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-slate-700 rounded-2xl p-4">
                  <p className="text-slate-400 text-xs mb-1">Επόμενη Καρτέλα</p>
                  <p className="text-orange-300 font-medium">
                    {detailClient.next_card_date
                      ? format(parseISO(detailClient.next_card_date), 'd MMMM yyyy', { locale: el })
                      : '—'}
                  </p>
                  {detailClient.monthly_card_repeat && (
                    <p className="text-slate-500 text-xs mt-1">Κάθε {detailClient.monthly_card_repeat} μήνες</p>
                  )}
                </div>
              </div>

              {detailClient.notes && (
                <div className="bg-slate-700/50 rounded-xl px-4 py-3 text-slate-300 text-sm">
                  📝 {detailClient.notes}
                </div>
              )}

              {/* Pending payments */}
              <div>
                <h3 className="text-white font-bold mb-3">💰 Επερχόμενες Πληρωμές</h3>
                {pendingPayments.length === 0 ? (
                  <p className="text-slate-500 text-sm mb-3">Δεν υπάρχουν εκκρεμείς</p>
                ) : (
                  <div className="space-y-2 mb-3">
                    {pendingPayments.map(p => {
                      const overdue = p.due_date && isPast(parseISO(p.due_date)) && !isToday(parseISO(p.due_date))
                      return (
                        <div key={p.id} className="bg-slate-700 rounded-xl px-3 py-2 flex items-center gap-3">
                          <button onClick={() => togglePaid(p)} title="Σήμανση ως πληρωμένο"
                            className="text-slate-400 hover:text-green-400 text-lg shrink-0">☐</button>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium">€{(parseFloat(p.amount) || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 })}</p>
                            {p.due_date && (
                              <p className={`text-xs ${overdue ? 'text-red-400' : 'text-slate-400'}`}>
                                {overdue ? '⚠️ ' : ''}Λήξη: {format(parseISO(p.due_date), 'd MMM yyyy', { locale: el })}
                              </p>
                            )}
                            {p.notes && <p className="text-slate-500 text-xs">{p.notes}</p>}
                          </div>
                          <button onClick={() => deletePayment(p.id)} className="text-slate-600 hover:text-red-400 text-sm shrink-0">🗑️</button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Add payment */}
                <div className="bg-slate-700/50 rounded-2xl p-4 space-y-2">
                  <p className="text-slate-400 text-xs font-medium">Νέα Πληρωμή</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" placeholder="Ποσό (€)" value={newPayment.amount}
                      onChange={e => setNewPayment(p => ({ ...p, amount: e.target.value }))}
                      className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                    <input type="date" value={newPayment.due_date}
                      onChange={e => setNewPayment(p => ({ ...p, due_date: e.target.value }))}
                      className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <input type="text" placeholder="Σημείωση (προαιρετικό)" value={newPayment.notes}
                    onChange={e => setNewPayment(p => ({ ...p, notes: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                  <button onClick={addPayment} disabled={savingPayment || !newPayment.amount}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white py-2 rounded-xl text-sm font-medium">
                    {savingPayment ? 'Αποθήκευση...' : '+ Προσθήκη Πληρωμής'}
                  </button>
                </div>

                {/* Paid payments (collapsed) */}
                {clientPayments.filter(p => p.paid).length > 0 && (
                  <details className="mt-3">
                    <summary className="text-slate-500 text-sm cursor-pointer hover:text-slate-300">
                      ✅ Πληρωμένες ({clientPayments.filter(p => p.paid).length})
                    </summary>
                    <div className="mt-2 space-y-1">
                      {clientPayments.filter(p => p.paid).map(p => (
                        <div key={p.id} className="bg-slate-700/40 rounded-xl px-3 py-2 flex items-center gap-3 opacity-60">
                          <button onClick={() => togglePaid(p)} className="text-green-400 text-lg shrink-0">☑</button>
                          <p className="text-slate-400 text-sm flex-1">€{(parseFloat(p.amount) || 0).toLocaleString('el-GR', { minimumFractionDigits: 2 })} {p.notes ? `· ${p.notes}` : ''}</p>
                          <button onClick={() => deletePayment(p.id)} className="text-slate-600 hover:text-red-400 text-sm">🗑️</button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {/* Order history */}
              <div>
                <h3 className="text-white font-bold mb-3">📦 Ιστορικό Παραγγελιών ({clientOrders.length})</h3>
                {clientOrders.length === 0 ? (
                  <p className="text-slate-500 text-sm">Δεν υπάρχουν παραγγελίες</p>
                ) : (
                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {clientOrders.map(o => (
                      <div key={o.id} className="bg-slate-700 rounded-xl px-3 py-2 flex items-center gap-3 text-sm">
                        <StatusDot status={o.status} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs truncate">{o.from} → {o.to}</p>
                          <p className="text-slate-400 text-xs">{o.qty} {o.pal} · {parseFloat(o.ldm || 0).toFixed(2)} LDM</p>
                        </div>
                        <p className="text-slate-500 text-xs shrink-0">{o.rdy || ''}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT / NEW MODAL ── */}
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

function StatusDot({ status }) {
  const map = {
    'Open': 'bg-blue-500', 'Ανατεθειμένη': 'bg-orange-500',
    'Μεταφορά': 'bg-green-500', 'Παράδοση': 'bg-purple-500', 'Delivered': 'bg-slate-500'
  }
  return <span className={`w-2 h-2 rounded-full shrink-0 ${map[status] || 'bg-slate-500'}`} />
}
