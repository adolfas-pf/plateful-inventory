import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type SKU = {
  id: string
  name: string
  category: string
  current_stock: number
  safety_reserve: number
  status: string
  expected_restock_date: string | null
  expected_restock_qty: number | null
}

type BacklogOrder = {
  id: string
  order_id: string
  customer_name: string
  sku_id: string
  qty: number
  order_date: string
  status: string
  priority: boolean
}

type TransferOrder = {
  id: string
  to_number: string
  destination: string
  sku: string
  qty: number
  pick_up_date: string
  eta_destination: string
  shipping_method: string
  status: string
}

type ChangelogEntry = {
  id: string
  sku: string
  previous_qty: number
  new_qty: number
  comment: string
  changed_at: string
}

type Tab = 'dashboard' | 'backlog' | 'weekly' | 'import' | 'transfers'

export default function Home() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [skus, setSkus] = useState<SKU[]>([])
  const [orders, setOrders] = useState<BacklogOrder[]>([])
  const [transfers, setTransfers] = useState<TransferOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [editingSku, setEditingSku] = useState<SKU | null>(null)
  const [editQty, setEditQty] = useState<number>(0)
  const [editComment, setEditComment] = useState<string>('')
  const [editSaving, setEditSaving] = useState(false)
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([])
  const [showChangelog, setShowChangelog] = useState(false)
  const [filterSku, setFilterSku] = useState('all')
  const [filterStatus, setFilterStatus] = useState('active')
  const [searchOrder, setSearchOrder] = useState('')

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: skuData }, { data: orderData }, { data: transferData }] = await Promise.all([
      supabase.from('skus').select('*').order('name'),
      supabase.from('backlog_orders').select('*').order('order_date'),
      supabase.from('transfer_orders').select('*').order('eta_destination'),
    ])
    if (skuData) setSkus(skuData)
    if (orderData) setOrders(orderData)
    if (transferData) setTransfers(transferData)
    setLoading(false)
  }

  async function fetchChangelog() {
    const { data } = await supabase
      .from('stock_changelog')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(100)
    if (data) setChangelog(data)
  }

  async function saveStockEdit() {
    if (!editingSku) return
    setEditSaving(true)
    await supabase.from('stock_changelog').insert({
      sku: editingSku.id,
      previous_qty: editingSku.current_stock,
      new_qty: editQty,
      comment: editComment,
    })
    await supabase.from('skus').update({
      current_stock: editQty,
      status: editQty === 0 ? 'out' : editQty <= (editingSku.safety_reserve || 0) ? 'critical' : 'ok',
    }).eq('id', editingSku.id)
    setEditingSku(null)
    setEditComment('')
    setEditSaving(false)
    fetchAll()
  }

  async function handleCSV(file: File) {
    setImportStatus('Parsing CSV...')
    const text = await file.text()
    const lines = text.split('\n').filter(Boolean)
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())

    const nameIdx = headers.findIndex(h => h.toLowerCase().includes('name'))
    const orderIdx = headers.findIndex(h => h.toLowerCase().includes('name') && h.toLowerCase().includes('order')) !== -1
      ? headers.findIndex(h => h.toLowerCase().includes('name') && h.toLowerCase().includes('order'))
      : headers.findIndex(h => h.toLowerCase() === 'name')
    const skuIdx = headers.findIndex(h => h.toLowerCase() === 'sku' || h.toLowerCase().includes('lineitem sku'))
    const qtyIdx = headers.findIndex(h => h.toLowerCase().includes('lineitem quantity'))
    const idIdx = headers.findIndex(h => h.toLowerCase() === 'name' || h.toLowerCase() === 'order id')
    const dateIdx = headers.findIndex(h => h.toLowerCase().includes('created at') || h.toLowerCase().includes('date'))
    const finIdx = headers.findIndex(h => h.toLowerCase().includes('financial status'))
    const shipIdx = headers.findIndex(h => h.toLowerCase().includes('requires shipping'))

    let inserted = 0
    let skipped = 0

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim())
      if (!cols[skuIdx]) { skipped++; continue }
      if (cols[finIdx]?.toLowerCase() !== 'paid') { skipped++; continue }
      if (cols[shipIdx]?.toLowerCase() === 'false') { skipped++; continue }

      const skuStatus = skus.find(s => s.id === cols[skuIdx])?.status
      const { error } = await supabase.from('backlog_orders').insert({
        order_id: cols[idIdx],
        customer_name: cols[nameIdx] || '',
        sku_id: cols[skuIdx],
        qty: parseInt(cols[qtyIdx]) || 1,
        order_date: cols[dateIdx] || new Date().toISOString(),
        status: skuStatus === 'out' || skuStatus === 'critical' ? 'on_hold' : 'active',
        priority: false,
      })
      if (!error) inserted++; else skipped++
    }

    setImportStatus(`Done — ${inserted} orders imported, ${skipped} skipped`)
    fetchAll()
  }

  const outCount = skus.filter(s => s.status === 'out').length
  const criticalCount = skus.filter(s => s.status === 'critical').length
  const onHoldCount = orders.filter(o => o.status === 'on_hold').length

  const filteredOrders = orders.filter(o => {
    if (filterStatus === 'active' && o.status !== 'active') return false
    if (filterStatus === 'on_hold' && o.status !== 'on_hold') return false
    if (filterStatus === 'priority' && !o.priority) return false
    if (filterSku !== 'all' && o.sku_id !== filterSku) return false
    if (searchOrder && !o.order_id.toLowerCase().includes(searchOrder.toLowerCase()) && !o.customer_name.toLowerCase().includes(searchOrder.toLowerCase())) return false
    return true
  })

  const weeklyData = (() => {
    const weeks: Record<string, Record<string, number>> = {}
    orders.forEach(o => {
      const d = new Date(o.order_date)
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = monday.toISOString().split('T')[0]
      if (!weeks[key]) weeks[key] = {}
      weeks[key][o.sku_id] = (weeks[key][o.sku_id] || 0) + o.qty
    })
    return Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b))
  })()

  const skuIds = [...new Set(orders.map(o => o.sku_id))]

  const groupedTransfers = transfers.reduce((acc, t) => {
    const dest = t.destination || 'Unknown'
    if (!acc[dest]) acc[dest] = []
    acc[dest].push(t)
    return acc
  }, {} as Record<string, TransferOrder[]>)

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: '#f9fafb', color: '#111' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Plateful</span>
          <span style={{ color: '#6b7280', fontSize: 14 }}>Stockout Manager</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13 }}>
          <span style={{ color: '#ef4444' }}>● {outCount} out</span>
          <span style={{ color: '#f59e0b' }}>● {criticalCount} critical</span>
          <span style={{ color: '#3b82f6' }}>● {onHoldCount} on hold</span>
          <button onClick={fetchAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 13 }}>↻ Refresh</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px', display: 'flex', gap: 24 }}>
        {(['dashboard', 'backlog', 'weekly', 'transfers', 'import'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t ? '2px solid #111' : '2px solid transparent',
            fontWeight: tab === t ? 600 : 400, fontSize: 14, color: tab === t ? '#111' : '#6b7280',
            textTransform: 'capitalize'
          }}>{t === 'transfers' ? 'Transfer Orders' : t}</button>
        ))}
      </div>

      <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
        {loading && <div style={{ color: '#6b7280', padding: 40, textAlign: 'center' }}>Loading...</div>}

        {/* Dashboard */}
        {!loading && tab === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Stock Levels</h2>
              <button onClick={() => { setShowChangelog(true); fetchChangelog() }} style={{ fontSize: 12, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>View Change Log</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {skus.map(s => {
                const pct = s.safety_reserve > 0 ? Math.min(100, (s.current_stock / (s.safety_reserve * 3)) * 100) : Math.min(100, s.current_stock / 200 * 100)
                const isOut = s.status === 'out' || s.current_stock === 0
                const isCrit = s.status === 'critical'
                return (
                  <div key={s.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{s.id}</div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                        background: isOut ? '#fee2e2' : isCrit ? '#fef3c7' : '#dcfce7',
                        color: isOut ? '#dc2626' : isCrit ? '#d97706' : '#16a34a'
                      }}>{isOut ? 'Out of stock' : isCrit ? 'Critical' : 'In stock'}</span>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>Stock: <strong>{s.current_stock.toLocaleString()}</strong></div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>Safety reserve: {s.safety_reserve || 0}</div>
                    <div style={{ background: '#f3f4f6', borderRadius: 4, height: 6, marginBottom: 12 }}>
                      <div style={{ background: isOut ? '#ef4444' : isCrit ? '#f59e0b' : '#22c55e', height: 6, borderRadius: 4, width: `${pct}%` }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setEditingSku(s); setEditQty(s.current_stock) }} style={{ flex: 1, fontSize: 12, padding: '6px 0', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', background: '#fff' }}>Edit Stock</button>
                      <button onClick={() => setTab('backlog')} style={{ flex: 1, fontSize: 12, padding: '6px 0', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', background: '#fff' }}>View Backlog</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Backlog */}
        {!loading && tab === 'backlog' && (
          <div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={searchOrder} onChange={e => setSearchOrder(e.target.value)} placeholder="Order # or customer..." style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, width: 200 }} />
              <select value={filterSku} onChange={e => setFilterSku(e.target.value)} style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
                <option value="all">All SKUs</option>
                {skus.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
              </select>
              {(['active', 'priority', 'on_hold', 'all'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, background: filterStatus === s ? '#111' : '#f3f4f6', color: filterStatus === s ? '#fff' : '#374151', fontWeight: filterStatus === s ? 600 : 400 }}>
                  {s === 'on_hold' ? 'On hold' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['Order', 'Customer', 'SKU', 'Qty', 'Date', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No orders match filters</td></tr>
                  ) : filteredOrders.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{o.order_id}</td>
                      <td style={{ padding: '10px 16px', color: '#374151' }}>{o.customer_name}</td>
                      <td style={{ padding: '10px 16px' }}><span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{o.sku_id}</span></td>
                      <td style={{ padding: '10px 16px' }}>{o.qty}</td>
                      <td style={{ padding: '10px 16px', color: '#6b7280' }}>{new Date(o.order_date).toLocaleDateString('en-GB')}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: o.status === 'on_hold' ? '#fef3c7' : o.priority ? '#dbeafe' : '#f3f4f6', color: o.status === 'on_hold' ? '#d97706' : o.priority ? '#1d4ed8' : '#374151', fontWeight: 500 }}>
                          {o.status === 'on_hold' ? 'On Hold' : o.priority ? '★ Priority' : 'Active'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', display: 'flex', gap: 6 }}>
                        <button onClick={async () => { await supabase.from('backlog_orders').update({ priority: !o.priority }).eq('id', o.id); fetchAll() }} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', background: '#fff' }}>
                          {o.priority ? 'Unprioritise' : 'Prioritise'}
                        </button>
                        <button onClick={async () => { await supabase.from('backlog_orders').update({ status: o.status === 'on_hold' ? 'active' : 'on_hold' }).eq('id', o.id); fetchAll() }} style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer', background: '#fff' }}>
                          {o.status === 'on_hold' ? 'Activate' : 'Hold'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '8px 16px', fontSize: 12, color: '#9ca3af', borderTop: '1px solid #f3f4f6' }}>{filteredOrders.length} items · priority first, then oldest order date</div>
            </div>
          </div>
        )}

        {/* Weekly */}
        {!loading && tab === 'weekly' && (
          <div>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Backlog units per SKU by order week. Numbers show units — amber = on hold, amber★ = priority, green = fulfilled.</p>
            {weeklyData.length === 0 ? (
              <div style={{ color: '#9ca3af', padding: 40, textAlign: 'center' }}>No order data yet. Import a CSV first.</div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>WEEK OF</th>
                      {skuIds.map(s => <th key={s} style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyData.map(([week, data]) => (
                      <tr key={week} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 500 }}>{new Date(week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                        {skuIds.map(s => (
                          <td key={s} style={{ padding: '10px 12px', textAlign: 'center' }}>
                            {data[s] ? <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>{data[s]}</span> : <span style={{ color: '#d1d5db' }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Transfer Orders */}
        {!loading && tab === 'transfers' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Inbound Transfer Orders</h2>
            </div>
            {Object.keys(groupedTransfers).length === 0 ? (
              <div style={{ color: '#9ca3af', padding: 40, textAlign: 'center' }}>No transfer orders in database yet.</div>
            ) : (
              Object.entries(groupedTransfers).sort(([a], [b]) => a.localeCompare(b)).map(([dest, tos]) => (
                <div key={dest} style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, padding: '6px 12px', background: '#f3f4f6', borderRadius: 6, display: 'inline-block' }}>📦 {dest}</div>
                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          {['TO Number', 'SKU', 'Qty', 'Pick Up', 'ETA', 'Method', 'Status'].map(h => (
                            <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tos.sort((a, b) => (a.eta_destination || '').localeCompare(b.eta_destination || '')).map(t => {
                          const daysOut = t.eta_destination ? Math.ceil((new Date(t.eta_destination).getTime() - Date.now()) / 86400000) : null
                          return (
                            <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '10px 16px', fontWeight: 500, color: '#374151' }}>{t.to_number || '—'}</td>
                              <td style={{ padding: '10px 16px' }}><span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{t.sku}</span></td>
                              <td style={{ padding: '10px 16px', fontWeight: 600 }}>{t.qty?.toLocaleString()}</td>
                              <td style={{ padding: '10px 16px', color: '#6b7280' }}>{t.pick_up_date ? new Date(t.pick_up_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</td>
                              <td style={{ padding: '10px 16px' }}>
                                {t.eta_destination ? (
                                  <span style={{ color: daysOut !== null && daysOut <= 7 ? '#16a34a' : daysOut !== null && daysOut <= 21 ? '#d97706' : '#374151' }}>
                                    {new Date(t.eta_destination).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                    {daysOut !== null && <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>({daysOut}d)</span>}
                                  </span>
                                ) : '—'}
                              </td>
                              <td style={{ padding: '10px 16px', color: '#6b7280' }}>{t.shipping_method || '—'}</td>
                              <td style={{ padding: '10px 16px' }}>
                                <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: t.status === 'TO Pending' ? '#fef3c7' : '#dcfce7', color: t.status === 'TO Pending' ? '#d97706' : '#15803d', fontWeight: 500 }}>{t.status}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Import */}
        {!loading && tab === 'import' && (
          <div style={{ maxWidth: 640 }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Daily Shopify CSV import</h3>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Shopify Admin → Orders → Export → CSV. Re-importing the same file is safe — duplicate orders are skipped automatically.</p>
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCSV(f) }}
                onClick={() => document.getElementById('csvInput')?.click()}
                style={{ border: '2px dashed #e5e7eb', borderRadius: 8, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>↑</div>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Drop Shopify CSV here</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>or click to browse</div>
                <input id="csvInput" type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCSV(f) }} />
              </div>
              {importStatus && <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#15803d' }}>{importStatus}</div>}
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Import rules</h3>
              {[
                ['Financial status ≠ paid', 'Skipped'],
                ['Line item requires shipping = false', 'Skipped (digital/virtual)'],
                ['SKU in mapping table', 'Resolved to canonical SKU'],
                ['Bundle SKU', 'Expanded to component SKUs'],
                ['SKU status: out or critical', '→ placed on_hold'],
                ['SKU status: ok', 'Tracked as not_affected'],
                ['Duplicate order ID', 'Skipped (idempotent)'],
              ].map(([rule, result]) => (
                <div key={rule} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                  <span style={{ color: '#6b7280' }}>{rule}</span>
                  <span style={{ fontWeight: 500 }}>{result}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Stock Modal */}
      {editingSku && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Edit Stock — {editingSku.name}</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Current stock: {editingSku.current_stock.toLocaleString()}</p>
            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>New Quantity</label>
            <input type="number" value={editQty} onChange={e => setEditQty(parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />
            <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}>Comment <span style={{ color: '#9ca3af', fontWeight: 400 }}>(required)</span></label>
            <textarea value={editComment} onChange={e => setEditComment(e.target.value)} placeholder="e.g. Stock count 24 Mar — matched warehouse report" rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, resize: 'vertical', marginBottom: 20, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditingSku(null)} style={{ flex: 1, padding: '9px 0', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', background: '#fff', fontSize: 14 }}>Cancel</button>
              <button onClick={saveStockEdit} disabled={!editComment.trim() || editSaving} style={{ flex: 1, padding: '9px 0', border: 'none', borderRadius: 8, cursor: 'pointer', background: editComment.trim() ? '#111' : '#d1d5db', color: '#fff', fontSize: 14, fontWeight: 600 }}>
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Changelog Modal */}
      {showChangelog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 600, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Stock Change Log</h3>
              <button onClick={() => setShowChangelog(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            {changelog.length === 0 ? (
              <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>No changes recorded yet.</div>
            ) : changelog.map(c => (
              <div key={c.id} style={{ padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.sku}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{new Date(c.changed_at).toLocaleString('en-GB')}</span>
                </div>
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
                  {c.previous_qty?.toLocaleString()} → <strong>{c.new_qty?.toLocaleString()}</strong>
                  <span style={{ marginLeft: 8, color: c.new_qty > c.previous_qty ? '#16a34a' : '#dc2626', fontSize: 12 }}>
                    ({c.new_qty > c.previous_qty ? '+' : ''}{(c.new_qty - c.previous_qty).toLocaleString()})
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>{c.comment}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
