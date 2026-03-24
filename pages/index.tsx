import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'
import Head from 'next/head'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Sku = {
  id: string; name: string; category: string; price: number
  current_stock: number; safety_reserve: number; free_to_fulfill: number
  net_available: number; expected_restock_date: string | null
  expected_restock_qty: number; status: 'ok' | 'critical' | 'out'
  backlog_on_hold: number; backlog_priority: number; units_on_hold: number
}

type OrderItem = {
  id: string; shopify_order_id: string; customer_name: string
  customer_email: string; sku_id: string; sku_name: string; category: string
  qty: number; order_date: string
  hold_status: 'on_hold' | 'priority' | 'fulfilled' | 'cancelled' | 'not_affected'
  priority_reason: string | null; original_sku: string; product_name: string
}

type WeeklyRow = {
  week_starting: string; sku_id: string; sku_name: string; sku_status: string
  orders_count: number; units_ordered: number
  priority_items: number; hold_items: number; fulfilled_items: number
}

async function parseAndImport(
  file: File,
  onProgress: (msg: string) => void
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  onProgress('Loading mapping tables...')
  const [{ data: mappings }, { data: bundles }, { data: skuData }] = await Promise.all([
    supabase.from('sku_mapping').select('*'),
    supabase.from('bundle_components').select('*'),
    supabase.from('skus').select('id, status'),
  ])

  const mappingMap: Record<string, string | null> = {}
  mappings?.forEach((m: any) => { mappingMap[m.shopify_sku] = m.canonical_id })

  const bundleMap: Record<string, Array<{ component_sku: string; qty: number }>> = {}
  bundles?.forEach((b: any) => {
    if (!bundleMap[b.bundle_sku]) bundleMap[b.bundle_sku] = []
    bundleMap[b.bundle_sku].push({ component_sku: b.component_sku, qty: b.qty })
  })

  const allSkus = new Set(skuData?.map((s: any) => s.id) || [])
  const atRiskSkus = new Set(
    skuData?.filter((s: any) => s.status !== 'ok').map((s: any) => s.id) || []
  )

  onProgress('Parsing CSV...')
  const text = await file.text()
  const { data: rows } = Papa.parse<Record<string, string>>(text, {
    header: true, skipEmptyLines: true,
  })

  const orderMap = new Map<string, { header: Record<string, string>; items: Record<string, string>[] }>()
  for (const row of rows) {
    const orderId = row['Name']?.trim()
    if (!orderId) continue
    if (!orderMap.has(orderId)) orderMap.set(orderId, { header: row, items: [] })
    const entry = orderMap.get(orderId)!
    if (row['Financial Status']) entry.header = row
    if (row['Lineitem sku']?.trim()) entry.items.push(row)
  }

  onProgress(`Found ${orderMap.size} orders — processing...`)

  const { data: batchData } = await supabase
    .from('import_batches')
    .insert({ filename: file.name, orders_found: orderMap.size })
    .select().single()
  const batchId = batchData?.id

  let imported = 0, skipped = 0
  const errors: string[] = []

  for (const [orderId, { header, items }] of orderMap) {
    const financial = header['Financial Status']?.toLowerCase()
    if (financial && financial !== 'paid') { skipped++; continue }

    const expanded: Array<{ shopify_sku: string; canonical_id: string; product_name: string; qty: number; unit_price: number }> = []

    for (const item of items) {
      const shopifySku = item['Lineitem sku']?.trim()
      if (!shopifySku || item['Lineitem requires shipping']?.trim() === 'false') continue
      const qty = parseInt(item['Lineitem quantity']) || 1
      const price = parseFloat(item['Lineitem price']) || 0
      const name = item['Lineitem name']?.trim() || ''

      if (bundleMap[shopifySku]) {
        for (const comp of bundleMap[shopifySku]) {
          if (allSkus.has(comp.component_sku)) {
            expanded.push({ shopify_sku: shopifySku, canonical_id: comp.component_sku, product_name: `${name} [${comp.component_sku}]`, qty: qty * comp.qty, unit_price: 0 })
          }
        }
        continue
      }
      const canonicalId = mappingMap[shopifySku]
      if (canonicalId && allSkus.has(canonicalId)) {
        expanded.push({ shopify_sku: shopifySku, canonical_id: canonicalId, product_name: name, qty, unit_price: price })
      }
    }

    if (expanded.length === 0) { skipped++; continue }

    const orderDate = header['Created at'] ? new Date(header['Created at']).toISOString() : new Date().toISOString()

    const { data: orderRow, error: orderErr } = await supabase
      .from('orders')
      .upsert({
        shopify_order_id: orderId,
        customer_name: header['Billing Name']?.trim() || header['Shipping Name']?.trim() || '',
        customer_email: header['Email']?.trim() || '',
        order_date: orderDate,
        financial_status: financial || 'paid',
        fulfillment_status: header['Fulfillment Status']?.trim() || 'unfulfilled',
        order_total: parseFloat(header['Total']) || 0,
        import_batch_id: batchId,
      }, { onConflict: 'shopify_order_id' })
      .select().single()

    if (orderErr) { errors.push(`${orderId}: ${orderErr.message}`); continue }

    for (const item of expanded) {
      const skuStatus = skuData?.find((s: any) => s.id === item.canonical_id)?.status
      const holdStatus = (skuStatus === 'out' || skuStatus === 'critical') ? 'on_hold' : 'not_affected'
      await supabase.from('order_items').upsert({
        order_id: orderRow.id, shopify_order_id: orderId,
        sku_id: item.canonical_id, shopify_sku: item.shopify_sku,
        product_name: item.product_name, qty: item.qty,
        unit_price: item.unit_price, hold_status: holdStatus,
      }, { onConflict: 'order_id,sku_id', ignoreDuplicates: true })
    }
    imported++
  }

  await supabase.from('import_batches').update({ orders_new: imported, orders_skipped: skipped }).eq('id', batchId)
  return { imported, skipped, errors }
}

export default function App() {
  const [tab, setTab] = useState<'dashboard' | 'backlog' | 'weekly' | 'import'>('dashboard')
  const [skus, setSkus] = useState<Sku[]>([])
  const [items, setItems] = useState<OrderItem[]>([])
  const [weekly, setWeekly] = useState<WeeklyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importLog, setImportLog] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [skuFilter, setSkuFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: s }, { data: q }, { data: w }] = await Promise.all([
      supabase.from('sku_dashboard').select('*'),
      supabase.from('fulfillment_queue').select('*').limit(1000),
      supabase.from('weekly_backlog').select('*'),
    ])
    if (s) setSkus(s); if (q) setItems(q); if (w) setWeekly(w)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const escalate = async (id: string, reason: string) => {
    await supabase.from('order_items').update({ hold_status: 'priority', priority_reason: reason }).eq('id', id)
    showToast('Escalated to priority ★'); load()
  }
  const deescalate = async (id: string) => {
    await supabase.from('order_items').update({ hold_status: 'on_hold', priority_reason: null }).eq('id', id)
    showToast('Removed priority'); load()
  }
  const fulfill = async (id: string, fromReserve: boolean) => {
    await supabase.from('order_items').update({
      hold_status: 'fulfilled', fulfilled_at: new Date().toISOString(),
      fulfilled_from: fromReserve ? 'reserve' : 'regular',
    }).eq('id', id)
    showToast('Marked as fulfilled ✓'); load()
  }
  const updateReserve = async (skuId: string, val: number) => {
    await supabase.from('skus').update({ safety_reserve: val }).eq('id', skuId)
    showToast(`Reserve updated`); load()
  }

  const handleFile = async (file: File) => {
    setImporting(true); setImportLog(['Starting import...'])
    try {
      const { imported, skipped, errors } = await parseAndImport(file, (msg) =>
        setImportLog(prev => [...prev, msg])
      )
      setImportLog(prev => [
        ...prev,
        `✓ ${imported} orders imported, ${skipped} skipped`,
        ...(errors.length ? [`⚠ ${errors.length} errors`] : []),
      ])
      showToast(`Imported ${imported} orders`); load()
    } catch (e: any) {
      setImportLog(prev => [...prev, `✗ ${e.message}`])
    }
    setImporting(false)
  }

  const filteredItems = items.filter(i => {
    if (skuFilter && i.sku_id !== skuFilter) return false
    if (statusFilter === 'active' && !['on_hold', 'priority'].includes(i.hold_status)) return false
    if (statusFilter === 'priority' && i.hold_status !== 'priority') return false
    if (statusFilter === 'on_hold' && i.hold_status !== 'on_hold') return false
    if (search) {
      const q = search.toLowerCase()
      return i.shopify_order_id.toLowerCase().includes(q) || (i.customer_name || '').toLowerCase().includes(q)
    }
    return true
  })

  const weeklySkus = [...new Set(weekly.map(r => r.sku_id))].sort()
  const weeklyWeeks = [...new Set(weekly.map(r => r.week_starting))].sort()
  const weeklyCell = (week: string, sku: string) => weekly.find(r => r.week_starting === week && r.sku_id === sku)

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
  const activeBacklog = items.filter(i => ['on_hold', 'priority'].includes(i.hold_status))

  const badge = (s: string) => {
    const styles: Record<string, string> = {
      out: 'bg-red-100 text-red-800', critical: 'bg-amber-100 text-amber-800',
      ok: 'bg-emerald-100 text-emerald-700', on_hold: 'bg-slate-100 text-slate-600',
      priority: 'bg-amber-100 text-amber-800', fulfilled: 'bg-emerald-100 text-emerald-700',
    }
    const labels: Record<string, string> = {
      out: 'Out of stock', critical: 'Critical', ok: 'In stock',
      on_hold: 'On hold', priority: '★ Priority', fulfilled: 'Fulfilled',
    }
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[s] || 'bg-slate-100 text-slate-500'}`}>{labels[s] || s}</span>
  }

  return (
    <>
      <Head><title>Plateful · Stockout Manager</title></Head>
      <div className="min-h-screen bg-slate-50 font-sans">

        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-xl">
            {toast}
          </div>
        )}

        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-900 text-base tracking-tight">Plateful</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500 text-sm">Stockout Manager</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="inline-block w-2 h-2 rounded-full bg-red-400"></span>
                {skus.filter(s => s.status === 'out').length} out
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 ml-1"></span>
                {skus.filter(s => s.status === 'critical').length} critical
                <span className="inline-block w-2 h-2 rounded-full bg-blue-400 ml-1"></span>
                {activeBacklog.length} on hold
              </div>
              <button onClick={load} className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded px-2.5 py-1.5 hover:bg-slate-50 transition-colors">
                ↻ Refresh
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Tabs */}
          <div className="flex gap-0 border-b border-slate-200 mb-6">
            {(['dashboard', 'backlog', 'weekly', 'import'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors capitalize ${
                  tab === t ? 'border-slate-900 text-slate-900 font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                {t}
                {t === 'backlog' && activeBacklog.length > 0 && (
                  <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full font-medium">
                    {activeBacklog.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading && <div className="text-slate-400 text-sm py-20 text-center">Loading...</div>}

          {/* ── DASHBOARD ── */}
          {!loading && tab === 'dashboard' && (
            <div>
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'On hold', value: items.filter(i => i.hold_status === 'on_hold').length, sub: 'order items' },
                  { label: 'Priority', value: items.filter(i => i.hold_status === 'priority').length, sub: 'escalated', amber: true },
                  { label: 'Out of stock', value: skus.filter(s => s.status === 'out').length, sub: 'SKUs' },
                  { label: 'Critical stock', value: skus.filter(s => s.status === 'critical').length, sub: 'SKUs' },
                ].map(m => (
                  <div key={m.label} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">{m.label}</div>
                    <div className={`text-3xl font-semibold tabular-nums ${m.amber ? 'text-amber-600' : 'text-slate-900'}`}>{m.value}</div>
                    <div className="text-xs text-slate-400 mt-1">{m.sub}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4">
                {skus.map(s => (
                  <SkuCard key={s.id} sku={s} badge={badge} fmt={fmt}
                    onViewBacklog={() => { setTab('backlog'); setSkuFilter(s.id) }}
                    onSaveReserve={updateReserve} />
                ))}
              </div>
            </div>
          )}

          {/* ── BACKLOG ── */}
          {!loading && tab === 'backlog' && (
            <div>
              <div className="flex gap-2.5 mb-4 flex-wrap items-center">
                <input type="text" placeholder="Order # or customer..." value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-56 focus:outline-none focus:ring-1 focus:ring-slate-400" />
                <select value={skuFilter} onChange={e => setSkuFilter(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400">
                  <option value="">All SKUs</option>
                  {skus.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
                </select>
                <div className="flex gap-1.5">
                  {[['active', 'Active'], ['priority', '★ Priority'], ['on_hold', 'On hold'], ['all', 'All']].map(([v, l]) => (
                    <button key={v} onClick={() => setStatusFilter(v)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        statusFilter === v
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}>{l}</button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Order', 'Customer', 'SKU', 'Qty', 'Date', 'Status', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(i => (
                      <tr key={i.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${i.hold_status === 'priority' ? 'bg-amber-50/50' : ''}`}>
                        <td className="px-4 py-3 font-medium text-slate-900">{i.shopify_order_id}</td>
                        <td className="px-4 py-3">
                          <div className="text-slate-900">{i.customer_name}</div>
                          <div className="text-xs text-slate-400">{i.customer_email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{i.sku_id}</code>
                          {i.original_sku !== i.sku_id && <div className="text-xs text-slate-400 mt-0.5">via {i.original_sku}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{i.qty}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmt(i.order_date)}</td>
                        <td className="px-4 py-3">
                          {badge(i.hold_status)}
                          {i.priority_reason && <div className="text-xs text-amber-700 mt-1">{i.priority_reason}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 flex-wrap">
                            {i.hold_status === 'on_hold' && (
                              <button onClick={() => {
                                const r = window.prompt('Reason (e.g. "threatening to cancel"):') || 'Customer escalated'
                                escalate(i.id, r)
                              }} className="text-xs border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded px-2 py-1 transition-colors">
                                ★ Escalate
                              </button>
                            )}
                            {i.hold_status === 'priority' && (
                              <button onClick={() => deescalate(i.id)} className="text-xs border border-slate-200 text-slate-500 hover:bg-slate-50 rounded px-2 py-1 transition-colors">
                                Remove priority
                              </button>
                            )}
                            {['on_hold', 'priority'].includes(i.hold_status) && (
                              <button onClick={() => fulfill(i.id, i.hold_status === 'priority')} className="text-xs border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded px-2 py-1 transition-colors">
                                Fulfill ✓
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredItems.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">No orders match filters</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-slate-400 mt-2 ml-1">
                {filteredItems.length} items · priority first, then oldest order date
              </div>
            </div>
          )}

          {/* ── WEEKLY ── */}
          {!loading && tab === 'weekly' && (
            <div>
              <p className="text-sm text-slate-500 mb-4">Backlog units per SKU by order week. Numbers show units — amber = on hold, amber★ = priority, green = fulfilled.</p>
              <div className="bg-white rounded-xl border border-slate-200 overflow-auto mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Week of</th>
                      {weeklySkus.map(skuId => {
                        const sku = skus.find(s => s.id === skuId)
                        return (
                          <th key={skuId} className="px-4 py-3 text-center">
                            <div className="text-xs font-semibold text-slate-600">{skuId}</div>
                            {sku && <div className="mt-1">{badge(sku.status)}</div>}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyWeeks.map(week => (
                      <tr key={week} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap text-xs">
                          {new Date(week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </td>
                        {weeklySkus.map(skuId => {
                          const cell = weeklyCell(week, skuId)
                          if (!cell) return <td key={skuId} className="px-4 py-3 text-center text-slate-200 text-xs">—</td>
                          return (
                            <td key={skuId} className="px-4 py-3 text-center">
                              <div className="font-semibold text-slate-900 tabular-nums">{cell.units_ordered}</div>
                              <div className="text-xs mt-0.5 space-x-1">
                                {cell.hold_items > 0 && <span className="text-amber-600">{cell.hold_items} hold</span>}
                                {cell.priority_items > 0 && <span className="text-amber-700 font-medium">{cell.priority_items}★</span>}
                                {cell.fulfilled_items > 0 && <span className="text-emerald-600">{cell.fulfilled_items} ✓</span>}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* SKU totals */}
              <div className="grid grid-cols-4 gap-3">
                {skus.filter(s => s.backlog_on_hold + s.backlog_priority > 0).map(s => (
                  <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="text-xs text-slate-400 mb-1 font-mono">{s.id}</div>
                    <div className="text-2xl font-semibold tabular-nums text-slate-900">{s.units_on_hold}</div>
                    <div className="text-xs text-slate-400 mt-0.5">units on hold</div>
                    <div className="text-xs mt-2 flex gap-2">
                      <span className="text-emerald-600">free: {s.free_to_fulfill}</span>
                      <span className={s.net_available < 0 ? 'text-red-500' : 'text-emerald-600'}>net: {s.net_available}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── IMPORT ── */}
          {!loading && tab === 'import' && (
            <div className="max-w-xl">
              <div className="bg-white rounded-xl border border-slate-200 p-6 mb-4">
                <h2 className="font-medium text-slate-900 mb-1">Daily Shopify CSV import</h2>
                <p className="text-sm text-slate-500 mb-5">
                  Shopify Admin → Orders → Export → CSV. Re-importing the same file is safe — duplicate orders are skipped automatically.
                </p>
                <label
                  className="block border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-slate-300 transition-colors group"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                >
                  <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">↑</div>
                  <div className="font-medium text-slate-700 mb-1">Drop Shopify CSV here</div>
                  <div className="text-xs text-slate-400">or click to browse</div>
                  <input ref={fileRef} type="file" accept=".csv" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                </label>

                {importLog.length > 0 && (
                  <div className="mt-4 bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-1">
                    {importLog.map((line, i) => (
                      <div key={i} className={`text-xs font-mono ${
                        line.startsWith('✓') ? 'text-emerald-700' :
                        line.startsWith('✗') ? 'text-red-600' : 'text-slate-500'
                      }`}>{line}</div>
                    ))}
                    {importing && <div className="text-xs text-slate-400 animate-pulse">Processing...</div>}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-medium text-slate-900 mb-3 text-sm">Import rules</h3>
                <div className="space-y-2 text-xs text-slate-600">
                  {[
                    ['Financial status ≠ paid', 'Skipped'],
                    ['Lineitem requires shipping = false', 'Skipped (digital / virtual)'],
                    ['SKU in mapping table (e.g. TI_PAN_LID2)', 'Resolved to canonical SKU'],
                    ['Bundle SKU (e.g. TI_3SET)', 'Expanded to component SKUs'],
                    ['SKU status: out or critical', '→ placed on_hold'],
                    ['SKU status: ok', 'Tracked as not_affected'],
                    ['Duplicate order ID', 'Skipped (idempotent)'],
                  ].map(([condition, action]) => (
                    <div key={condition} className="flex justify-between gap-4">
                      <span className="text-slate-400">{condition}</span>
                      <span className="font-medium text-right">{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function SkuCard({ sku, badge, fmt, onViewBacklog, onSaveReserve }: {
  sku: Sku; badge: (s: string) => JSX.Element; fmt: (d: string | null) => string
  onViewBacklog: () => void; onSaveReserve: (id: string, v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(sku.safety_reserve)

  const pct = (n: number, total: number) => total > 0 ? Math.min(100, (n / total) * 100) : 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-medium text-slate-900 text-sm">{sku.name}</div>
          <div className="text-xs text-slate-400 mt-0.5 font-mono">{sku.id}</div>
        </div>
        {badge(sku.status)}
      </div>

      <div className="space-y-2.5 mb-3">
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Free to fulfill</span>
            <span className="font-medium tabular-nums">{sku.free_to_fulfill.toLocaleString()}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{
              background: sku.status === 'out' ? '#f87171' : sku.status === 'critical' ? '#fbbf24' : '#34d399',
              width: `${pct(sku.free_to_fulfill, sku.current_stock)}%`
            }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Safety reserve</span>
            <span className="font-medium tabular-nums">{sku.safety_reserve}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-indigo-400 transition-all" style={{
              width: `${pct(sku.safety_reserve, sku.current_stock)}%`
            }} />
          </div>
        </div>
      </div>

      <div className="flex justify-between text-xs text-slate-400 border-t border-slate-100 pt-3 mb-3">
        <span>{sku.backlog_on_hold + sku.backlog_priority} orders backlog ({sku.units_on_hold} units)</span>
        <span>{sku.expected_restock_date ? `Restock ${fmt(sku.expected_restock_date)}` : 'No restock'}</span>
      </div>

      <div className="flex gap-2">
        <button onClick={onViewBacklog} className="flex-1 text-xs border border-slate-200 rounded-lg py-1.5 hover:bg-slate-50 transition-colors text-slate-600">
          View backlog
        </button>
        {editing ? (
          <div className="flex gap-1.5 items-center">
            <input type="number" min={0} max={sku.current_stock} value={val}
              onChange={e => setVal(parseInt(e.target.value) || 0)}
              className="w-16 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-400" />
            <button onClick={() => { onSaveReserve(sku.id, val); setEditing(false) }}
              className="text-xs bg-slate-900 text-white rounded px-2.5 py-1.5 hover:bg-slate-700 transition-colors">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="flex-1 text-xs border border-slate-200 rounded-lg py-1.5 hover:bg-slate-50 transition-colors text-slate-600">
            Set reserve
          </button>
        )}
      </div>
    </div>
  )
}
