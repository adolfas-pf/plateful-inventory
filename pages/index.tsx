import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types ────────────────────────────────────────────────────────────────────
type SKU = { id: string; name: string; current_stock: number; safety_reserve: number; status: string; funnel: string; hidden: boolean; avg_weekly_sales: number }
type TransferOrder = { id: string; to_number: string; destination: string; sku: string; qty: number; pick_up_date: string; eta_destination: string; shipping_method: string; status: string }
type BacklogOrder = { id: string; order_id: string; customer_name: string; sku_id: string; qty: number; order_date: string; status: string; priority: boolean }
type UERow = { sku: string; status: string; product_name: string; hts_code: string; old_tariff_pct: number; new_tariff_pct: number; tariff_pct: number; manufacturer: string; manufacturer_country: string; production_lead_time_days: number; cbm: number; pkg_length_cm: number; pkg_width_cm: number; pkg_height_cm: number; cogs: number; inspection: number; commission: number; tariff_cost: number; placement_fees: number; shipping_to_us: number; inbound_3pl: number; storage_3pl: number; cn_landed_cost: number; us_landed_cost: number; amazon_landed_cogs: number; referral_fees: number; pick_pack_amazon: number; selling_price_amazon: number; profit_amazon: number; margin_amazon: number; selling_price_dtc: number; transaction_fees_dtc: number; pick_pack_dtc: number; shipping_dtc: number; profit_dtc: number; margin_dtc: number; selling_price: number; upc: string; asin: string; current_unit_cost: number; current_unit_cost_to: string; current_shipping_cost: number; current_shipping_cost_to: string }
type ForecastWeekly = { id: string; week_start: string; channel: string; funnel: string; sales_forecast: number | null; sales_actual: number | null; ad_spend_forecast: number | null; ad_spend_actual: number | null; mer_forecast: number | null; mer_actual: number | null }
type ForecastDaily = { id: string; date: string; channel: string; funnel: string; sales_actual: number | null; ad_spend_actual: number | null }
type SkuForecastConfig = { sku: string; asp_dtc: number; dtc_mix_pct: number; funnel: string }
type ForecastUnitsWeekly = { sku: string; channel: string; week_start: string; units_actual: number | null }
type Vendor = { id: string; vendor_name: string; full_name: string; type: string; description: string; country: string; address: string; contact_person: string; contact_number: string }
type VendorPaymentTerms = { id: string; sku: string; factory: string; terms_description: string; deposit_pct: number; at_pickup_pct: number; balance_pct: number; balance_days: number }
type Tab = 'dashboard' | 'forecast' | 'units' | 'transfers' | 'ue' | 'vendors' | 'backlog' | 'import'

// ─── Constants ────────────────────────────────────────────────────────────────
const FUNNELS_LIST = ['Food Warming Mat','Titanium Cutting Board','Titanium Pan','Jar Vacuum Sealer','Bag Vacuum Sealer']
const FUNNEL_MAP: Record<string,string[]> = {
  'Pans': ['TI_PAN_LID','TI_WOK_LID','TI_POT_LID','TI_SAUCE_LID','TI_UT_SPAT','TI_UT_SET'],
  'Cutting Boards': ['TI_BRD_S','TI_BRD_M','TI_BRD_L','BRD_STND'],
  'Jar Vacuum Sealer': ['MASON_VAC','MASON_LID_REG','MASON_LID_WIDE','MASON_FUNNEL','MASON_LABEL'],
  'Bag Vacuum Sealer': ['BAG_VAC','BAG_SML_15','BAG_S_10','BAG_M_10','BAG_L_10','BAG_XL_10','BAG_CONT_SML','BAG_VAC_SML_15','BAG_VAC_SML_30','BAG_VAC_SML_45'],
  'Food Warming Mat': ['FWM_M_GRY_US','FWM_M_CRM_US','FWM_M_BLU_US'],
}
const FUNNEL_ORDER = ['Pans','Cutting Boards','Jar Vacuum Sealer','Bag Vacuum Sealer','Food Warming Mat']
const DESTINATIONS = ['KSCA','KSNJ','AMAZON','Other']
const SHIPPING_METHODS = ['Express Sea','Regular Sea','PO','Air','LCL','FCL']
const STATUSES_TO = ['TO Pending','In Transfer','Delivered','Cancelled']
const CHANNELS = ['DTC','Amazon']
const TODAY = new Date('2026-03-25')

// UE column definitions — rows are SKUs, columns are these fields
const UE_COLS = [
  { key: 'manufacturer', label: 'Manufacturer', group: 'Identity', editable: false, fmt: 'text' },
  { key: 'manufacturer_country', label: 'Country', group: 'Identity', editable: false, fmt: 'text' },
  { key: 'hts_code', label: 'HTS Code', group: 'Identity', editable: false, fmt: 'text' },
  { key: 'upc', label: 'UPC', group: 'Identity', editable: false, fmt: 'text' },
  { key: 'asin', label: 'ASIN', group: 'Identity', editable: false, fmt: 'text' },
  { key: 'production_lead_time_days', label: 'Lead Time (d)', group: 'Manufacturing', editable: true, fmt: 'num' },
  { key: 'cogs', label: 'COGS', group: 'Manufacturing', editable: true, fmt: 'dollar' },
  { key: 'inspection', label: 'Inspection', group: 'Manufacturing', editable: true, fmt: 'dollar' },
  { key: 'commission', label: 'Commission', group: 'Manufacturing', editable: true, fmt: 'dollar' },
  { key: 'tariff_pct', label: 'Tariff %', group: 'Manufacturing', editable: true, fmt: 'pct' },
  { key: 'tariff_cost', label: 'Tariff Cost', group: 'Manufacturing', editable: false, fmt: 'dollar' },
  { key: 'cbm', label: 'CBM', group: 'Dimensions', editable: true, fmt: 'num4' },
  { key: 'pkg_length_cm', label: 'L (cm)', group: 'Dimensions', editable: true, fmt: 'num' },
  { key: 'pkg_width_cm', label: 'W (cm)', group: 'Dimensions', editable: true, fmt: 'num' },
  { key: 'pkg_height_cm', label: 'H (cm)', group: 'Dimensions', editable: true, fmt: 'num' },
  { key: 'placement_fees', label: 'Placement/Polybag', group: 'Shipping', editable: true, fmt: 'dollar' },
  { key: 'shipping_to_us', label: 'Shipping to US', group: 'Shipping', editable: true, fmt: 'dollar' },
  { key: 'inbound_3pl', label: 'Inbound 3PL', group: 'Shipping', editable: true, fmt: 'dollar' },
  { key: 'storage_3pl', label: 'Storage 3PL', group: 'Shipping', editable: true, fmt: 'dollar' },
  { key: 'cn_landed_cost', label: 'CN Landed', group: 'Landed Cost', editable: false, fmt: 'dollar' },
  { key: 'us_landed_cost', label: 'US Landed', group: 'Landed Cost', editable: false, fmt: 'dollar' },
  { key: 'amazon_landed_cogs', label: 'Amazon Landed', group: 'Landed Cost', editable: false, fmt: 'dollar' },
  { key: 'referral_fees', label: 'Referral Fees', group: 'Amazon', editable: true, fmt: 'dollar' },
  { key: 'pick_pack_amazon', label: 'Pick & Pack', group: 'Amazon', editable: true, fmt: 'dollar' },
  { key: 'selling_price_amazon', label: 'Selling Price', group: 'Amazon', editable: true, fmt: 'dollar' },
  { key: 'profit_amazon', label: 'Profit', group: 'Amazon', editable: false, fmt: 'dollar' },
  { key: 'margin_amazon', label: 'Margin', group: 'Amazon', editable: false, fmt: 'pct' },
  { key: 'selling_price_dtc', label: 'Selling Price', group: 'DTC', editable: true, fmt: 'dollar' },
  { key: 'transaction_fees_dtc', label: 'Transaction Fees', group: 'DTC', editable: true, fmt: 'dollar' },
  { key: 'pick_pack_dtc', label: 'Pick & Pack', group: 'DTC', editable: true, fmt: 'dollar' },
  { key: 'shipping_dtc', label: 'Shipping', group: 'DTC', editable: true, fmt: 'dollar' },
  { key: 'profit_dtc', label: 'Profit', group: 'DTC', editable: false, fmt: 'dollar' },
  { key: 'margin_dtc', label: 'Margin', group: 'DTC', editable: false, fmt: 'pct' },
  { key: 'current_unit_cost', label: 'Unit Cost (Current)', group: 'Batch Costs', editable: true, fmt: 'dollar' },
  { key: 'current_shipping_cost', label: 'Shipping Cost (Current)', group: 'Batch Costs', editable: true, fmt: 'dollar' },
]

const UE_GROUPS = ['Identity','Manufacturing','Dimensions','Shipping','Landed Cost','Amazon','DTC','Batch Costs']

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtK = (n: number|null|undefined) => { if (n==null) return '—'; if (Math.abs(n)>=1000000) return '$'+(n/1000000).toFixed(1)+'M'; if (Math.abs(n)>=1000) return '$'+(n/1000).toFixed(0)+'K'; return '$'+n.toFixed(0) }
const fmtPct = (n: number|null|undefined) => n==null ? '—' : (n*100).toFixed(1)+'%'
const fmtDollar = (n: number|null|undefined) => n==null ? '—' : '$'+n.toFixed(2)
const fmtNum = (n: number|null|undefined) => n==null ? '—' : n.toLocaleString()
const fmtNum4 = (n: number|null|undefined) => n==null ? '—' : n.toFixed(4)
const fmtField = (val: any, fmt: string) => { if (val==null) return '—'; switch(fmt) { case 'dollar': return fmtDollar(val); case 'pct': return fmtPct(val); case 'num4': return fmtNum4(val); case 'num': return fmtNum(val); default: return String(val) } }
const deltaColor = (a: number|null, f: number|null) => { if (a==null||f==null||f===0) return '#374151'; return a>=f ? '#16a34a' : '#dc2626' }
const deltaPct = (a: number|null, f: number|null) => { if (a==null||f==null||f===0) return null; return ((a-f)/f*100).toFixed(1) }
const isFuture = (w: string) => new Date(w) > TODAY
const daysColor = (d: number|null) => d==null ? '#6b7280' : d<=14 ? '#dc2626' : d<=28 ? '#d97706' : d>180 ? '#2563eb' : '#16a34a'

// Persist collapsed state in sessionStorage
const loadCollapsed = (key: string): Set<string> => {
  if (typeof window === 'undefined') return new Set()
  try { const v = sessionStorage.getItem(key); return v ? new Set(JSON.parse(v)) : new Set() } catch { return new Set() }
}
const saveCollapsed = (key: string, s: Set<string>) => {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(key, JSON.stringify([...s])) } catch {}
}

function useCollapsed(key: string): [Set<string>, (k: string) => void] {
  const [state, setState] = useState<Set<string>>(() => loadCollapsed(key))
  const toggle = useCallback((k: string) => {
    setState(prev => {
      const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k)
      saveCollapsed(key, next); return next
    })
  }, [key])
  return [state, toggle]
}

export default function Home() {
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('activeTab') as Tab) || 'dashboard')
  const [skus, setSkus] = useState<SKU[]>([])
  const [orders, setOrders] = useState<BacklogOrder[]>([])
  const [transfers, setTransfers] = useState<TransferOrder[]>([])
  const [ueData, setUeData] = useState<UERow[]>([])
  const [fwData, setFwData] = useState<ForecastWeekly[]>([])
  const [fdData, setFdData] = useState<ForecastDaily[]>([])
  const [skuConfig, setSkuConfig] = useState<SkuForecastConfig[]>([])
  const [unitsData, setUnitsData] = useState<ForecastUnitsWeekly[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [paymentTerms, setPaymentTerms] = useState<VendorPaymentTerms[]>([])
  const [loading, setLoading] = useState(true)
  const [showHidden, setShowHidden] = useState(false)
  const [importStatus, setImportStatus] = useState<string|null>(null)
  const [fcastChannel, setFcastChannel] = useState<'DTC'|'Amazon'>('DTC')

  // Collapsed state — persisted per section
  const [collDash, toggleCollDash] = useCollapsed('coll_dash')
  const [collWH, toggleCollWH] = useCollapsed('coll_wh')
  const [collTO, toggleCollTO] = useCollapsed('coll_to')
  const [collUE, toggleCollUE] = useCollapsed('coll_ue')
  const [collUEG, toggleCollUEG] = useCollapsed('coll_ueg')
  const [collFcast, toggleCollFcast] = useCollapsed('coll_fcast')
  const [collFcastW, toggleCollFcastW] = useCollapsed('coll_fcastw')
  const [collUnits, toggleCollUnits] = useCollapsed('coll_units')
  const [collVendors, toggleCollVendors] = useCollapsed('coll_vendors')

  // Modals
  const [editingSku, setEditingSku] = useState<SKU|null>(null)
  const [editQty, setEditQty] = useState(0)
  const [editComment, setEditComment] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [changelog, setChangelog] = useState<any[]>([])
  const [showChangelog, setShowChangelog] = useState(false)
  const [editingTO, setEditingTO] = useState<TransferOrder|null>(null)
  const [toEdits, setToEdits] = useState<Partial<TransferOrder>>({})
  const [toComment, setToComment] = useState('')
  const [toSaving, setToSaving] = useState(false)
  const [toChangelog, setToChangelog] = useState<any[]>([])
  const [showTOChangelog, setShowTOChangelog] = useState<string|null>(null)
  const [editingUE, setEditingUE] = useState<{row: UERow, field: string, label: string}|null>(null)
  const [ueNewValue, setUeNewValue] = useState('')
  const [ueToNumber, setUeToNumber] = useState('')
  const [uePONumber, setUePONumber] = useState('')
  const [ueReason, setUeReason] = useState('')
  const [ueSaving, setUeSaving] = useState(false)
  const [costChangelog, setCostChangelog] = useState<any[]>([])
  const [showCostChangelog, setShowCostChangelog] = useState<string|null>(null)
  const [editingFcast, setEditingFcast] = useState<{week:string,channel:string,funnel:string,field:string}|null>(null)
  const [fcastNewValue, setFcastNewValue] = useState('')
  const [fcastReason, setFcastReason] = useState('')
  const [fcastSaving, setFcastSaving] = useState(false)
  const [filterSku, setFilterSku] = useState('all')
  const [filterStatus, setFilterStatus] = useState('active')
  const [searchOrder, setSearchOrder] = useState('')

  const switchTab = (t: Tab) => { sessionStorage.setItem('activeTab', t); setTab(t) }

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: s },{ data: o },{ data: t },{ data: u },{ data: fw },{ data: fd },{ data: sc },{ data: uw },{ data: vd },{ data: pt }] = await Promise.all([
      supabase.from('skus').select('*').order('name'),
      supabase.from('backlog_orders').select('*').order('order_date'),
      supabase.from('transfer_orders').select('*').order('eta_destination'),
      supabase.from('sku_unit_economics').select('*').order('sku'),
      supabase.from('forecast_weekly').select('*').order('week_start'),
      supabase.from('forecast_daily').select('*').order('date'),
      supabase.from('sku_forecast_config').select('*'),
      supabase.from('forecast_units_weekly').select('*').order('week_start'),
      supabase.from('vendors').select('*').order('vendor_name'),
      supabase.from('vendor_payment_terms').select('*'),
    ])
    if (s) setSkus(s); if (o) setOrders(o); if (t) setTransfers(t)
    if (u) setUeData(u); if (fw) setFwData(fw); if (fd) setFdData(fd)
    if (sc) setSkuConfig(sc); if (uw) setUnitsData(uw); if (vd) setVendors(vd); if (pt) setPaymentTerms(pt)
    setLoading(false)
  }

  async function fetchChangelog() { const { data } = await supabase.from('stock_changelog').select('*').order('changed_at',{ascending:false}).limit(100); if (data) setChangelog(data) }
  async function fetchTOChangelog(id: string) { const { data } = await supabase.from('to_changelog').select('*').eq('to_id',id).order('changed_at',{ascending:false}); if (data) setToChangelog(data); setShowTOChangelog(id) }
  async function fetchCostChangelog(sku: string) { const { data } = await supabase.from('sku_cost_changelog').select('*').eq('sku',sku).order('changed_at',{ascending:false}); if (data) setCostChangelog(data); setShowCostChangelog(sku) }

  async function saveStockEdit() {
    if (!editingSku||!editComment.trim()) return; setEditSaving(true)
    await supabase.from('stock_changelog').insert({sku:editingSku.id,previous_qty:editingSku.current_stock,new_qty:editQty,comment:editComment})
    await supabase.from('skus').update({current_stock:editQty,status:editQty===0?'out':editQty<=(editingSku.safety_reserve||0)?'critical':'ok'}).eq('id',editingSku.id)
    setEditingSku(null); setEditComment(''); setEditSaving(false); fetchAll()
  }

  async function saveToEdit() {
    if (!editingTO||!toComment.trim()) return; setToSaving(true)
    const fields: (keyof TransferOrder)[] = ['sku','qty','pick_up_date','eta_destination','shipping_method','status','destination','to_number']
    const logs: any[] = []
    for (const f of fields) { if (toEdits[f]!==undefined && String(toEdits[f])!==String((editingTO as any)[f]??'')) { logs.push({to_id:editingTO.id,field_changed:f,previous_value:String((editingTO as any)[f]??''),new_value:String(toEdits[f]),comment:toComment}) } }
    if (logs.length>0) { await supabase.from('to_changelog').insert(logs); await supabase.from('transfer_orders').update(toEdits).eq('id',editingTO.id) }
    setEditingTO(null); setToEdits({}); setToComment(''); setToSaving(false); fetchAll()
  }

  async function saveUEEdit() {
    if (!editingUE||!ueReason.trim()) return; setUeSaving(true)
    const {row,field} = editingUE; const oldVal=(row as any)[field]; const newVal=parseFloat(ueNewValue)
    await supabase.from('sku_cost_changelog').insert({sku:row.sku,field_changed:field,previous_value:oldVal,new_value:newVal,to_number:ueToNumber||null,po_number:uePONumber||null,reason:ueReason})
    await supabase.from('sku_unit_economics').update({[field]:newVal,updated_at:new Date().toISOString()}).eq('sku',row.sku)
    setEditingUE(null); setUeNewValue(''); setUeToNumber(''); setUePONumber(''); setUeReason(''); setUeSaving(false); fetchAll()
  }

  async function saveFcastEdit() {
    if (!editingFcast||!fcastReason.trim()) return; setFcastSaving(true)
    const {week,channel,funnel,field}=editingFcast
    const existing=fwData.find(r=>r.week_start===week&&r.channel===channel&&r.funnel===funnel)
    const oldVal=existing?(existing as any)[field]:null; const newVal=parseFloat(fcastNewValue)
    await supabase.from('forecast_changelog').insert({week_start:week,channel,funnel,field_changed:field,previous_value:oldVal,new_value:newVal,reason:fcastReason})
    if (existing) { await supabase.from('forecast_weekly').update({[field]:newVal}).eq('id',existing.id) }
    else { await supabase.from('forecast_weekly').insert({week_start:week,channel,funnel,[field]:newVal}) }
    setEditingFcast(null); setFcastNewValue(''); setFcastReason(''); setFcastSaving(false); fetchAll()
  }

  async function toggleHideSku(s: SKU) { await supabase.from('skus').update({hidden:!s.hidden}).eq('id',s.id); fetchAll() }

  async function handleCSV(file: File) {
    setImportStatus('Parsing...')
    const text=await file.text(); const lines=text.split('\n').filter(Boolean)
    const headers=lines[0].split(',').map(h=>h.replace(/"/g,'').trim())
    const nameIdx=headers.findIndex(h=>h.toLowerCase()==='name')
    const skuIdx=headers.findIndex(h=>h.toLowerCase().includes('lineitem sku'))
    const qtyIdx=headers.findIndex(h=>h.toLowerCase().includes('lineitem quantity'))
    const dateIdx=headers.findIndex(h=>h.toLowerCase().includes('created at'))
    const finIdx=headers.findIndex(h=>h.toLowerCase().includes('financial status'))
    const shipIdx=headers.findIndex(h=>h.toLowerCase().includes('requires shipping'))
    let inserted=0; let skipped=0
    for (let i=1;i<lines.length;i++) {
      const cols=lines[i].split(',').map(c=>c.replace(/"/g,'').trim())
      if (!cols[skuIdx]){skipped++;continue} if (cols[finIdx]?.toLowerCase()!=='paid'){skipped++;continue} if (cols[shipIdx]?.toLowerCase()==='false'){skipped++;continue}
      const skuStatus=skus.find(s=>s.id===cols[skuIdx])?.status
      const {error}=await supabase.from('backlog_orders').insert({order_id:cols[nameIdx],customer_name:cols[nameIdx]||'',sku_id:cols[skuIdx],qty:parseInt(cols[qtyIdx])||1,order_date:cols[dateIdx]||new Date().toISOString(),status:skuStatus==='out'||skuStatus==='critical'?'on_hold':'active',priority:false})
      if (!error) inserted++; else skipped++
    }
    setImportStatus(`Done — ${inserted} imported, ${skipped} skipped`); fetchAll()
  }

  // ─── Derived ──────────────────────────────────────────────────────────────────
  const outCount=skus.filter(s=>s.status==='out').length
  const criticalCount=skus.filter(s=>s.status==='critical').length
  const onHoldCount=orders.filter(o=>o.status==='on_hold').length
  const visibleSkus=skus.filter(s=>showHidden?true:!s.hidden)
  const skusByFunnel=FUNNEL_ORDER.reduce((acc,f)=>{acc[f]=visibleSkus.filter(s=>FUNNEL_MAP[f]?.includes(s.id));return acc},{} as Record<string,SKU[]>)
  const groupedTransfers=transfers.reduce((acc,t)=>{const d=t.destination||'Unknown';if(!acc[d])acc[d]=[];acc[d].push(t);return acc},{} as Record<string,TransferOrder[]>)
  const groupTOs=(tos: TransferOrder[])=>{const g: Record<string,TransferOrder[]>={};tos.forEach(t=>{const k=t.to_number||`__no_${t.id}`;if(!g[k])g[k]=[];g[k].push(t)});return g}
  const filteredOrders=orders.filter(o=>{if (filterStatus==='active'&&o.status!=='active') return false; if (filterStatus==='on_hold'&&o.status!=='on_hold') return false; if (filterStatus==='priority'&&!o.priority) return false; if (filterSku!=='all'&&o.sku_id!==filterSku) return false; if (searchOrder&&!o.order_id?.toLowerCase().includes(searchOrder.toLowerCase())&&!o.customer_name?.toLowerCase().includes(searchOrder.toLowerCase())) return false; return true})
  const fcastWeeks=[...new Set(fwData.map(r=>r.week_start))].sort()
  const dailyByWeek=(ws:string,ch:string,fn:string)=>{const wd=new Date(ws);const we=new Date(wd);we.setDate(wd.getDate()+6);return fdData.filter(d=>{const dt=new Date(d.date);return d.channel===ch&&d.funnel===fn&&dt>=wd&&dt<=we}).sort((a,b)=>a.date.localeCompare(b.date))}
  const getFW=(w:string,ch:string,fn:string)=>fwData.find(r=>r.week_start===w&&r.channel===ch&&r.funnel===fn)
  const toNumbers=[...new Set(transfers.map(t=>t.to_number).filter(Boolean))]
  const mfrVendors=vendors.filter(v=>v.type==='Manufacturer'||v.type==='manufacturer')

  // ─── Styles ───────────────────────────────────────────────────────────────────
  const sticky: React.CSSProperties={position:'sticky',top:0,zIndex:50}
  const th: React.CSSProperties={padding:'7px 10px',textAlign:'left' as const,fontWeight:600,color:'#374151',fontSize:11,textTransform:'uppercase' as const,letterSpacing:'0.04em',whiteSpace:'nowrap' as const,background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}
  const td: React.CSSProperties={padding:'7px 10px',borderBottom:'1px solid #f3f4f6',fontSize:12}
  const groupBadge=(label: string, bg: string, color: string)=><span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:bg,color,fontWeight:500}}>{label}</span>

  const funnelBar=(collapsed:boolean,onToggle:()=>void,label:string,count:number,extra?: React.ReactNode)=>(
    <div onClick={onToggle} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',background:'#f3f4f6',borderRadius:collapsed?8:'8px 8px 0 0',cursor:'pointer',userSelect:'none',border:'1px solid #e5e7eb',marginBottom:collapsed?8:0}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontWeight:700,fontSize:14}}>{label}</span>{count>0&&<span style={{fontSize:12,color:'#9ca3af'}}>{count}</span>}{extra}</div>
      <span style={{color:'#9ca3af',transform:collapsed?'rotate(-90deg)':'none',transition:'transform 0.15s'}}>▾</span>
    </div>
  )

  const modal=(children: React.ReactNode)=>(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>{children}</div>
  )

  const modalBox=(children: React.ReactNode,width=440)=>(
    <div style={{background:'#fff',borderRadius:12,padding:28,width,boxShadow:'0 20px 60px rgba(0,0,0,0.15)',maxHeight:'90vh',overflow:'auto'}}>{children}</div>
  )

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:'Inter, sans-serif',minHeight:'100vh',background:'#f9fafb',color:'#111'}}>
      {/* Header */}
      <div style={{...sticky,background:'#fff',borderBottom:'1px solid #e5e7eb',padding:'11px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}><span style={{fontWeight:700,fontSize:16}}>Plateful</span><span style={{color:'#6b7280',fontSize:13}}>Operations</span></div>
        <div style={{display:'flex',alignItems:'center',gap:16,fontSize:13}}>
          <span style={{color:'#ef4444'}}>● {outCount} out</span><span style={{color:'#f59e0b'}}>● {criticalCount} critical</span><span style={{color:'#3b82f6'}}>● {onHoldCount} on hold</span>
          <button onClick={fetchAll} style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280',fontSize:13}}>↻ Refresh</button>
        </div>
      </div>
      {/* Tabs */}
      <div style={{...sticky,top:48,background:'#fff',borderBottom:'1px solid #e5e7eb',padding:'0 24px',display:'flex',gap:16,overflowX:'auto'}}>
        {([['dashboard','Dashboard'],['forecast','Forecast'],['units','Units'],['transfers','Transfer Orders'],['ue','Unit Economics'],['vendors','Vendors'],['backlog','Backlog'],['import','Import']] as [Tab,string][]).map(([t,label])=>(
          <button key={t} onClick={()=>switchTab(t)} style={{padding:'11px 0',background:'none',border:'none',cursor:'pointer',borderBottom:tab===t?'2px solid #111':'2px solid transparent',fontWeight:tab===t?600:400,fontSize:13,color:tab===t?'#111':'#6b7280',whiteSpace:'nowrap'}}>{label}</button>
        ))}
      </div>

      <div style={{padding:24,maxWidth:1600,margin:'0 auto'}}>
        {loading&&<div style={{color:'#6b7280',padding:40,textAlign:'center'}}>Loading...</div>}

        {/* ═══ DASHBOARD ═══ */}
        {!loading&&tab==='dashboard'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontSize:15,fontWeight:600,margin:0}}>Stock by Funnel</h2>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setShowHidden(h=>!h)} style={{fontSize:12,color:'#6b7280',background:'none',border:'1px solid #e5e7eb',borderRadius:6,padding:'4px 10px',cursor:'pointer'}}>{showHidden?'Hide deprecated':'Show deprecated'}</button>
                <button onClick={()=>{setShowChangelog(true);fetchChangelog()}} style={{fontSize:12,color:'#6b7280',background:'none',border:'1px solid #e5e7eb',borderRadius:6,padding:'4px 10px',cursor:'pointer'}}>Change Log</button>
              </div>
            </div>
            {FUNNEL_ORDER.map(funnel=>{
              const fskus=skusByFunnel[funnel]||[]; if (!fskus.length) return null
              const col=collDash.has(funnel)
              return (
                <div key={funnel} style={{marginBottom:12}}>
                  {funnelBar(col,()=>toggleCollDash(funnel),funnel,fskus.length)}
                  {!col&&(
                    <div style={{border:'1px solid #e5e7eb',borderTop:'none',borderRadius:'0 0 8px 8px',overflow:'hidden',background:'#fff'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                        <thead><tr>{['SKU','Name','Stock','Reserve','Avg/Wk','Days Left','Status',''].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>{fskus.map(s=>{
                          const days=s.avg_weekly_sales?Math.floor(s.current_stock/s.avg_weekly_sales*7):null
                          const isOut=s.status==='out'||s.current_stock===0; const isCrit=s.status==='critical'
                          return (
                            <tr key={s.id} style={{opacity:s.hidden?0.4:1}}>
                              <td style={td}><span style={{background:'#f3f4f6',padding:'2px 6px',borderRadius:4,fontSize:11,fontFamily:'monospace'}}>{s.id}</span></td>
                              <td style={td}>{s.name}</td>
                              <td style={{...td,fontWeight:600}}>{s.current_stock.toLocaleString()}</td>
                              <td style={{...td,color:'#6b7280'}}>{s.safety_reserve||0}</td>
                              <td style={{...td,color:'#6b7280'}}>{s.avg_weekly_sales?s.avg_weekly_sales.toLocaleString():'—'}</td>
                              <td style={td}><span style={{fontWeight:600,color:daysColor(days)}}>{days==null?'—':days<=0?'Stockout':days+'d'}</span></td>
                              <td style={td}><span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:12,background:isOut?'#fee2e2':isCrit?'#fef3c7':'#dcfce7',color:isOut?'#dc2626':isCrit?'#d97706':'#16a34a'}}>{isOut?'Out':isCrit?'Critical':'OK'}</span></td>
                              <td style={{...td,display:'flex',gap:6}}>
                                <button onClick={()=>{setEditingSku(s);setEditQty(s.current_stock)}} style={{fontSize:11,padding:'3px 8px',border:'1px solid #e5e7eb',borderRadius:5,cursor:'pointer',background:'#fff'}}>Edit</button>
                                <button onClick={()=>toggleHideSku(s)} style={{fontSize:11,padding:'3px 8px',border:'1px solid #e5e7eb',borderRadius:5,cursor:'pointer',background:'#fff'}}>{s.hidden?'Show':'Hide'}</button>
                              </td>
                            </tr>
                          )
                        })}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ FORECAST ═══ */}
        {!loading&&tab==='forecast'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div style={{display:'flex',gap:2,background:'#f3f4f6',borderRadius:8,padding:3}}>
                {CHANNELS.map(ch=>(
                  <button key={ch} onClick={()=>setFcastChannel(ch as any)} style={{padding:'6px 20px',borderRadius:6,border:'none',cursor:'pointer',background:fcastChannel===ch?'#fff':'transparent',fontWeight:fcastChannel===ch?600:400,fontSize:13,color:fcastChannel===ch?'#111':'#6b7280',boxShadow:fcastChannel===ch?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>{ch}</button>
                ))}
              </div>
              <span style={{fontSize:12,color:'#9ca3af'}}>Blue = forecast. Click to update.</span>
            </div>
            {FUNNELS_LIST.map(funnel=>{
              if (!fcastWeeks.length) return null
              const col=collFcast.has(funnel)
              const recentWeek=fcastWeeks.filter(w=>!isFuture(w)).slice(-1)[0]
              const recentFW=recentWeek?getFW(recentWeek,fcastChannel,funnel):null
              return (
                <div key={funnel} style={{marginBottom:16}}>
                  {funnelBar(col,()=>toggleCollFcast(funnel),funnel,0,recentFW?.sales_actual!=null?<span style={{fontSize:12,color:'#374151',fontWeight:500}}>Last week: {fmtK(recentFW.sales_actual)}</span>:null)}
                  {!col&&(
                    <div style={{border:'1px solid #e5e7eb',borderTop:'none',borderRadius:'0 0 8px 8px',background:'#fff',overflowX:'auto'}}>
                      <table style={{borderCollapse:'collapse',fontSize:12,minWidth:900}}>
                        <thead>
                          <tr style={{background:'#f9fafb'}}>
                            <th style={{...th,width:100,position:'sticky',left:0,background:'#f9fafb',zIndex:10}}>Metric</th>
                            {fcastWeeks.map(week=>{
                              const wk=funnel+week+fcastChannel; const future=isFuture(week)
                              const dailies=dailyByWeek(week,fcastChannel,funnel); const dc=collFcastW.has(wk)
                              const label=new Date(week).toLocaleDateString('en-GB',{day:'numeric',month:'short'})
                              const cs=(!dailies.length||dc)?3:dailies.length+3
                              return <th key={week} colSpan={cs} style={{...th,textAlign:'center',background:future?'#eff6ff':'#f9fafb',borderLeft:'2px solid #e5e7eb',cursor:dailies.length?'pointer':'default',minWidth:80}} onClick={()=>dailies.length&&toggleCollFcastW(wk)}>
                                <span style={{color:future?'#2563eb':'#374151'}}>{label}</span>
                                {dailies.length>0&&<span style={{fontSize:9,color:'#9ca3af',marginLeft:4,display:'inline-block',transform:dc?'rotate(-90deg)':'none'}}>▾</span>}
                              </th>
                            })}
                          </tr>
                          <tr style={{background:'#fafafa'}}>
                            <th style={{...th,position:'sticky',left:0,background:'#fafafa',zIndex:10}}></th>
                            {fcastWeeks.map(week=>{
                              const wk=funnel+week+fcastChannel; const future=isFuture(week)
                              const dailies=dailyByWeek(week,fcastChannel,funnel); const dc=collFcastW.has(wk)
                              const sub: React.CSSProperties={...th,background:'transparent',borderLeft:'1px solid #f3f4f6',fontWeight:400,fontSize:10,textTransform:'none' as const,letterSpacing:0,color:'#9ca3af',padding:'4px 7px'}
                              return (
                                <React.Fragment key={week}>
                                  {!dc&&dailies.map(d=><th key={d.date} style={{...sub,borderLeft:'2px solid #e5e7eb'}}>{new Date(d.date).toLocaleDateString('en-GB',{weekday:'short'})}</th>)}
                                  <th style={{...sub,borderLeft:(!dailies.length||dc)?'2px solid #e5e7eb':'1px solid #f3f4f6'}}>Actual</th>
                                  <th style={{...sub,color:future?'#2563eb':'#9ca3af'}}>Forecast</th>
                                  <th style={sub}>Δ%</th>
                                </React.Fragment>
                              )
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {([{label:'Sales ($)',ak:'sales_actual',fk:'sales_forecast',fmt:fmtK},{label:'Ad Spend',ak:'ad_spend_actual',fk:'ad_spend_forecast',fmt:fmtK},{label:'MER%',ak:'mer_actual',fk:'mer_forecast',fmt:fmtPct}] as any[]).map(({label,ak,fk,fmt})=>(
                            <tr key={label} style={{borderBottom:'1px solid #f3f4f6'}}>
                              <td style={{...td,fontWeight:500,position:'sticky',left:0,background:'#fff',zIndex:5,borderRight:'1px solid #e5e7eb',minWidth:85}}>{label}</td>
                              {fcastWeeks.map(week=>{
                                const wk=funnel+week+fcastChannel; const future=isFuture(week)
                                const fw=getFW(week,fcastChannel,funnel)
                                const actual=fw?(fw as any)[ak]:null; const forecast=fw?(fw as any)[fk]:null
                                const dp=deltaPct(actual,forecast); const dc2=deltaColor(actual,forecast)
                                const dailies=dailyByWeek(week,fcastChannel,funnel); const dc=collFcastW.has(wk)
                                return (
                                  <React.Fragment key={week}>
                                    {!dc&&dailies.map(d=>{
                                      const dv=ak==='sales_actual'?d.sales_actual:ak==='ad_spend_actual'?d.ad_spend_actual:null
                                      return <td key={d.date} style={{...td,textAlign:'right' as const,borderLeft:'2px solid #e5e7eb',minWidth:55}}>{dv!=null?fmt(dv):'—'}</td>
                                    })}
                                    <td style={{...td,textAlign:'right' as const,borderLeft:(!dailies.length||dc)?'2px solid #e5e7eb':'1px solid #f3f4f6',minWidth:60}}>{actual!=null?fmt(actual):'—'}</td>
                                    <td onClick={()=>future&&(setEditingFcast({week,channel:fcastChannel,funnel,field:fk}),setFcastNewValue(forecast!=null?String(forecast):''))} style={{...td,textAlign:'right' as const,color:'#2563eb',cursor:future?'pointer':'default',background:future?'#eff6ff':'transparent',fontWeight:future?500:400,minWidth:60}}>{forecast!=null?fmt(forecast):<span style={{color:'#9ca3af'}}>—</span>}</td>
                                    <td style={{...td,textAlign:'right' as const,color:dc2,fontWeight:dp?500:400,minWidth:50}}>{dp?(parseFloat(dp)>0?'+':'')+dp+'%':'—'}</td>
                                  </React.Fragment>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ UNITS ═══ */}
        {!loading&&tab==='units'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontSize:15,fontWeight:600,margin:0}}>Units Forecast</h2>
              <span style={{fontSize:12,color:'#9ca3af'}}>Blue = calculated forecast (revenue × split ÷ ASP). White = actuals.</span>
            </div>
            {FUNNELS_LIST.map(funnel=>{
              const fskuConfigs=skuConfig.filter(c=>c.funnel===funnel); if (!fskuConfigs.length) return null
              const col=collUnits.has(funnel)
              const weeks=[...new Set(fwData.map(r=>r.week_start))].sort()
              const allWeeks=[...weeks.filter(w=>!isFuture(w)).slice(-6),...weeks.filter(w=>isFuture(w)).slice(0,8)]
              return (
                <div key={funnel} style={{marginBottom:16}}>
                  {funnelBar(col,()=>toggleCollUnits(funnel),funnel,fskuConfigs.length)}
                  {!col&&(
                    <div style={{border:'1px solid #e5e7eb',borderTop:'none',borderRadius:'0 0 8px 8px',background:'#fff',overflowX:'auto'}}>
                      <table style={{borderCollapse:'collapse',fontSize:12,minWidth:600}}>
                        <thead>
                          <tr style={{background:'#f9fafb'}}>
                            <th style={{...th,width:120,position:'sticky',left:0,background:'#f9fafb',zIndex:10}}>SKU</th>
                            <th style={{...th,width:65}}>ASP</th>
                            <th style={{...th,width:60}}>Split%</th>
                            {allWeeks.map(w=>{
                              const future=isFuture(w)
                              return <th key={w} style={{...th,textAlign:'center',background:future?'#eff6ff':'#f9fafb',borderLeft:'2px solid #e5e7eb',minWidth:65}}>
                                <span style={{color:future?'#2563eb':'#374151'}}>{new Date(w).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
                              </th>
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {fskuConfigs.map(cfg=>(
                            <tr key={cfg.sku} style={{borderBottom:'1px solid #f3f4f6'}}>
                              <td style={{...td,fontWeight:600,position:'sticky',left:0,background:'#fff',zIndex:5,borderRight:'1px solid #e5e7eb'}}>
                                <span style={{fontFamily:'monospace',fontSize:11,background:'#f3f4f6',padding:'2px 5px',borderRadius:4,cursor:'pointer'}} onClick={()=>switchTab('ue')}>{cfg.sku}</span>
                              </td>
                              <td style={{...td,color:'#6b7280'}}>${cfg.asp_dtc?.toFixed(0)??'—'}</td>
                              <td style={{...td,color:'#6b7280'}}>{cfg.dtc_mix_pct!=null?(cfg.dtc_mix_pct*100).toFixed(1)+'%':'—'}</td>
                              {allWeeks.map(w=>{
                                const future=isFuture(w)
                                const actual=unitsData.find(u=>u.sku===cfg.sku&&u.week_start===w)?.units_actual
                                const fw=fwData.find(r=>r.week_start===w&&r.channel==='DTC'&&r.funnel===funnel)
                                const calc=(fw?.sales_forecast!=null&&cfg.dtc_mix_pct!=null&&cfg.asp_dtc)?Math.round(fw.sales_forecast*cfg.dtc_mix_pct/cfg.asp_dtc):null
                                const display=actual??calc; const isActual=actual!=null
                                return <td key={w} style={{...td,textAlign:'right' as const,borderLeft:'2px solid #e5e7eb',color:isActual?'#374151':'#2563eb',fontWeight:isActual?400:500,background:future&&!isActual?'#eff6ff':'transparent'}}>{display!=null?display.toLocaleString():<span style={{color:'#d1d5db'}}>—</span>}</td>
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ TRANSFER ORDERS ═══ */}
        {!loading&&tab==='transfers'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}><h2 style={{fontSize:15,fontWeight:600,margin:0}}>Inbound Transfer Orders</h2><span style={{fontSize:12,color:'#9ca3af'}}>{transfers.length} lines</span></div>
            {Object.entries(groupedTransfers).sort(([a],[b])=>a.localeCompare(b)).map(([dest,tos])=>{
              const dc=collWH.has(dest); const byTO=groupTOs(tos)
              const inTransit=tos.filter(t=>t.status==='In Transfer').length; const pending=tos.filter(t=>t.status==='TO Pending').length
              return (
                <div key={dest} style={{marginBottom:16}}>
                  <div onClick={()=>toggleCollWH(dest)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',background:'#1f2937',borderRadius:dc?8:'8px 8px 0 0',cursor:'pointer',userSelect:'none'}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <span style={{fontWeight:700,fontSize:14,color:'#fff'}}>📦 {dest}</span>
                      <span style={{fontSize:12,color:'#9ca3af'}}>{Object.keys(byTO).length} TOs · {tos.length} lines</span>
                      {inTransit>0&&groupBadge(`${inTransit} in transit`,'#dbeafe','#1d4ed8')}
                      {pending>0&&groupBadge(`${pending} pending`,'#fef3c7','#d97706')}
                    </div>
                    <span style={{color:'#9ca3af',transform:dc?'rotate(-90deg)':'none',transition:'transform 0.15s'}}>▾</span>
                  </div>
                  {!dc&&(
                    <div style={{border:'1px solid #e5e7eb',borderTop:'none',borderRadius:'0 0 8px 8px',background:'#fff',overflow:'hidden'}}>
                      {Object.entries(byTO).sort(([a],[b])=>a.localeCompare(b)).map(([toNum,toRows])=>{
                        const toKey=dest+'___'+toNum; const tc=collTO.has(toKey)
                        const displayNum=toNum.startsWith('__no_')?'—':toNum
                        const firstETA=toRows.find(r=>r.eta_destination)?.eta_destination
                        const daysOut=firstETA?Math.ceil((new Date(firstETA).getTime()-Date.now())/86400000):null
                        const toStatus=toRows[0]?.status
                        return (
                          <div key={toKey} style={{borderBottom:'1px solid #f3f4f6'}}>
                            <div onClick={()=>toggleCollTO(toKey)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 16px',background:'#f9fafb',cursor:'pointer',userSelect:'none'}}>
                              <div style={{display:'flex',alignItems:'center',gap:12}}>
                                <span style={{fontWeight:600,fontSize:13,fontFamily:'monospace'}}>{displayNum}</span>
                                <span style={{fontSize:12,color:'#9ca3af'}}>{toRows.length} SKU{toRows.length!==1?'s':''}</span>
                                {firstETA&&<span style={{fontSize:12,color:daysOut!=null&&daysOut<=7?'#16a34a':daysOut!=null&&daysOut<=21?'#d97706':'#374151'}}>ETA {new Date(firstETA).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}{daysOut!=null&&<span style={{color:'#9ca3af',marginLeft:4}}>({daysOut}d)</span>}</span>}
                                {toStatus&&groupBadge(toStatus,toStatus==='TO Pending'?'#fef3c7':toStatus==='In Transfer'?'#dbeafe':'#dcfce7',toStatus==='TO Pending'?'#d97706':toStatus==='In Transfer'?'#1d4ed8':'#15803d')}
                              </div>
                              <div style={{display:'flex',alignItems:'center',gap:8}}>
                                {displayNum!=='—'&&<button onClick={e=>{e.stopPropagation();fetchTOChangelog(toRows[0].id)}} style={{fontSize:11,padding:'2px 8px',border:'1px solid #e5e7eb',borderRadius:5,cursor:'pointer',background:'#fff'}}>History</button>}
                                <span style={{color:'#9ca3af',transform:tc?'rotate(-90deg)':'none',transition:'transform 0.15s'}}>▾</span>
                              </div>
                            </div>
                            {!tc&&(
                              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                                <thead><tr>{['SKU','Qty','Pick Up','ETA','Method','Status',''].map(h=><th key={h} style={{...th,background:'#fff',fontSize:10}}>{h}</th>)}</tr></thead>
                                <tbody>{toRows.sort((a,b)=>(a.eta_destination||'').localeCompare(b.eta_destination||'')).map(t=>(
                                  <tr key={t.id}>
                                    <td style={td}><span style={{background:'#f3f4f6',padding:'2px 5px',borderRadius:4,fontSize:11,fontFamily:'monospace'}}>{t.sku}</span></td>
                                    <td style={{...td,fontWeight:600}}>{t.qty?.toLocaleString()}</td>
                                    <td style={{...td,color:'#6b7280'}}>{t.pick_up_date?new Date(t.pick_up_date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'—'}</td>
                                    <td style={td}>{t.eta_destination?new Date(t.eta_destination).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'—'}</td>
                                    <td style={{...td,color:'#6b7280'}}>{t.shipping_method||'—'}</td>
                                    <td style={td}>{t.status&&groupBadge(t.status,t.status==='TO Pending'?'#fef3c7':t.status==='In Transfer'?'#dbeafe':'#dcfce7',t.status==='TO Pending'?'#d97706':t.status==='In Transfer'?'#1d4ed8':'#15803d')}</td>
                                    <td style={td}><button onClick={()=>{setEditingTO(t);setToEdits({sku:t.sku,qty:t.qty,pick_up_date:t.pick_up_date,eta_destination:t.eta_destination,shipping_method:t.shipping_method,status:t.status,destination:t.destination,to_number:t.to_number});setToComment('')}} style={{fontSize:11,padding:'3px 8px',border:'1px solid #e5e7eb',borderRadius:5,cursor:'pointer',background:'#fff'}}>Edit</button></td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ UNIT ECONOMICS — transposed: SKUs as rows, fields as columns ═══ */}
        {!loading&&tab==='ue'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontSize:15,fontWeight:600,margin:0}}>Unit Economics</h2>
              <span style={{fontSize:12,color:'#9ca3af'}}>Underlined fields are editable. Click to update.</span>
            </div>
            {FUNNEL_ORDER.map(funnel=>{
              const frows=ueData.filter(r=>FUNNEL_MAP[funnel]?.includes(r.sku)); if (!frows.length) return null
              const col=collUE.has(funnel)
              return (
                <div key={funnel} style={{marginBottom:16}}>
                  {funnelBar(col,()=>toggleCollUE(funnel),funnel,frows.length)}
                  {!col&&(
                    <div style={{border:'1px solid #e5e7eb',borderTop:'none',borderRadius:'0 0 8px 8px',background:'#fff',overflowX:'auto'}}>
                      {UE_GROUPS.map(group=>{
                        const groupCols=UE_COLS.filter(c=>c.group===group)
                        const gk=funnel+'__'+group; const gc=collUEG.has(gk)
                        return (
                          <div key={group}>
                            <div onClick={()=>toggleCollUEG(gk)} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',background:'#f3f4f6',cursor:'pointer',userSelect:'none',borderBottom:'1px solid #e5e7eb'}}>
                              <span style={{transform:gc?'rotate(-90deg)':'none',transition:'transform 0.15s',color:'#9ca3af',fontSize:12}}>▾</span>
                              <span style={{fontWeight:700,fontSize:11,textTransform:'uppercase',color:'#374151',letterSpacing:'0.05em'}}>{group}</span>
                            </div>
                            {!gc&&(
                              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                                <thead>
                                  <tr style={{background:'#fafafa'}}>
                                    <th style={{...th,fontSize:10,width:130,position:'sticky',left:0,background:'#fafafa',zIndex:5}}>SKU</th>
                                    {groupCols.map(c=><th key={c.key} style={{...th,fontSize:10,textAlign:'right' as const,minWidth:90}}>{c.label}</th>)}
                                    <th style={{...th,fontSize:10,width:60}}>Log</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {frows.map(r=>(
                                    <tr key={r.sku} style={{borderBottom:'1px solid #f3f4f6'}}>
                                      <td style={{...td,fontWeight:600,position:'sticky',left:0,background:'#fff',zIndex:4,borderRight:'1px solid #e5e7eb'}}>
                                        <span style={{fontFamily:'monospace',fontSize:11,background:'#f3f4f6',padding:'2px 5px',borderRadius:4}}>{r.sku}</span>
                                      </td>
                                      {groupCols.map(c=>{
                                        const val=(r as any)[c.key]
                                        const display=fmtField(val,c.fmt)
                                        const isNeg=typeof val==='number'&&val<0&&(c.key.includes('profit')||c.key.includes('margin'))
                                        return (
                                          <td key={c.key} onClick={()=>c.editable&&(setEditingUE({row:r,field:c.key,label:c.label}),setUeNewValue(val!=null?String(val):''))} style={{...td,textAlign:'right' as const,color:val==null?'#d1d5db':isNeg?'#dc2626':'#374151',cursor:c.editable?'pointer':'default'}}>
                                            <span style={{borderBottom:c.editable?'1px dashed #9ca3af':'none',paddingBottom:1}}>{display}</span>
                                          </td>
                                        )
                                      })}
                                      <td style={td}><button onClick={()=>fetchCostChangelog(r.sku)} style={{fontSize:10,padding:'2px 6px',border:'1px solid #e5e7eb',borderRadius:4,cursor:'pointer',background:'#fff',color:'#6b7280'}}>History</button></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ VENDORS — manufacturers only ═══ */}
        {!loading&&tab==='vendors'&&(
          <div>
            <div style={{marginBottom:16}}><h2 style={{fontSize:15,fontWeight:600,margin:0}}>Manufacturers</h2></div>
            <div style={{border:'1px solid #e5e7eb',borderRadius:10,background:'#fff',overflow:'hidden'}}>
              {mfrVendors.map((v,idx)=>{
                const vc=collVendors.has(v.id)
                const vPT=paymentTerms.filter(p=>p.factory===v.vendor_name||p.factory===v.full_name)
                return (
                  <div key={v.id} style={{borderBottom:idx<mfrVendors.length-1?'1px solid #e5e7eb':'none'}}>
                    {/* Vendor header row — click to expand, text is selectable */}
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',cursor:'pointer',userSelect:'none'}} onClick={()=>toggleCollVendors(v.id)}>
                      <div style={{display:'flex',alignItems:'center',gap:14}}>
                        <div>
                          <div style={{fontWeight:600,fontSize:13}}>{v.vendor_name}</div>
                          {v.full_name&&<div style={{fontSize:11,color:'#9ca3af',marginTop:1}}>{v.full_name}</div>}
                        </div>
                        {v.country&&<span style={{fontSize:11,padding:'2px 8px',background:'#f3f4f6',borderRadius:10,color:'#6b7280'}}>{v.country}</span>}
                        {v.description&&<span style={{fontSize:12,color:'#6b7280'}}>{v.description}</span>}
                      </div>
                      <span style={{color:'#9ca3af',transform:vc?'rotate(-90deg)':'none',transition:'transform 0.15s',flexShrink:0}}>▾</span>
                    </div>
                    {!vc&&(
                      <div style={{padding:'0 16px 16px'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,marginBottom:vPT.length?16:0}}>
                          <tbody>
                            {v.address&&<tr><td style={{...td,color:'#6b7280',width:120,userSelect:'text'}}>Address</td><td style={{...td,userSelect:'text'}}>{v.address}</td></tr>}
                            {v.contact_person&&<tr><td style={{...td,color:'#6b7280',userSelect:'text'}}>Contact</td><td style={{...td,userSelect:'text'}}>{v.contact_person}{v.contact_number?' · '+v.contact_number:''}</td></tr>}
                          </tbody>
                        </table>
                        {vPT.length>0&&(
                          <div>
                            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',color:'#6b7280',marginBottom:8,letterSpacing:'0.05em'}}>Payment Terms</div>
                            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                              <thead><tr style={{background:'#f9fafb'}}>
                                {['SKU','Terms','Deposit','At Pickup','Balance','Balance Days'].map(h=><th key={h} style={{...th,fontSize:10}}>{h}</th>)}
                              </tr></thead>
                              <tbody>
                                {vPT.map(p=>(
                                  <tr key={p.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                                    <td style={{...td,fontFamily:'monospace',fontSize:11,userSelect:'text'}}>{p.sku}</td>
                                    <td style={{...td,color:'#6b7280',userSelect:'text'}}>{p.terms_description||'—'}</td>
                                    <td style={{...td,textAlign:'right' as const}}>{p.deposit_pct!=null?(p.deposit_pct*100).toFixed(0)+'%':'—'}</td>
                                    <td style={{...td,textAlign:'right' as const}}>{p.at_pickup_pct!=null?(p.at_pickup_pct*100).toFixed(0)+'%':'—'}</td>
                                    <td style={{...td,textAlign:'right' as const}}>{p.balance_pct!=null?(p.balance_pct*100).toFixed(0)+'%':'—'}</td>
                                    <td style={{...td,textAlign:'right' as const,color:'#6b7280'}}>{p.balance_days!=null?p.balance_days+'d':'—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {vPT.length===0&&<div style={{fontSize:12,color:'#9ca3af',fontStyle:'italic'}}>No payment terms on record.</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ BACKLOG ═══ */}
        {!loading&&tab==='backlog'&&(
          <div>
            <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
              <input value={searchOrder} onChange={e=>setSearchOrder(e.target.value)} placeholder="Order # or customer..." style={{padding:'7px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,width:200}}/>
              <select value={filterSku} onChange={e=>setFilterSku(e.target.value)} style={{padding:'7px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13}}>
                <option value="all">All SKUs</option>
                {skus.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}
              </select>
              {(['active','priority','on_hold','all'] as const).map(s=>(
                <button key={s} onClick={()=>setFilterStatus(s)} style={{padding:'6px 14px',borderRadius:20,border:'none',cursor:'pointer',fontSize:13,background:filterStatus===s?'#111':'#f3f4f6',color:filterStatus===s?'#fff':'#374151',fontWeight:filterStatus===s?600:400}}>
                  {s==='on_hold'?'On hold':s.charAt(0).toUpperCase()+s.slice(1)}
                </button>
              ))}
            </div>
            <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead><tr>{['Order','Customer','SKU','Qty','Date','Status','Actions'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {filteredOrders.length===0?<tr><td colSpan={7} style={{padding:40,textAlign:'center',color:'#9ca3af'}}>No orders match filters</td></tr>
                  :filteredOrders.map(o=>(
                    <tr key={o.id}>
                      <td style={td}><span style={{fontWeight:600}}>{o.order_id}</span></td>
                      <td style={td}>{o.customer_name}</td>
                      <td style={td}><span style={{background:'#f3f4f6',padding:'2px 6px',borderRadius:4,fontSize:11}}>{o.sku_id}</span></td>
                      <td style={td}>{o.qty}</td>
                      <td style={{...td,color:'#6b7280'}}>{new Date(o.order_date).toLocaleDateString('en-GB')}</td>
                      <td style={td}>{groupBadge(o.status==='on_hold'?'On Hold':o.priority?'★ Priority':'Active',o.status==='on_hold'?'#fef3c7':o.priority?'#dbeafe':'#f3f4f6',o.status==='on_hold'?'#d97706':o.priority?'#1d4ed8':'#374151')}</td>
                      <td style={{...td,display:'flex',gap:6}}>
                        <button onClick={async()=>{await supabase.from('backlog_orders').update({priority:!o.priority}).eq('id',o.id);fetchAll()}} style={{fontSize:11,padding:'3px 8px',border:'1px solid #e5e7eb',borderRadius:5,cursor:'pointer',background:'#fff'}}>{o.priority?'Unprioritise':'Prioritise'}</button>
                        <button onClick={async()=>{await supabase.from('backlog_orders').update({status:o.status==='on_hold'?'active':'on_hold'}).eq('id',o.id);fetchAll()}} style={{fontSize:11,padding:'3px 8px',border:'1px solid #e5e7eb',borderRadius:5,cursor:'pointer',background:'#fff'}}>{o.status==='on_hold'?'Activate':'Hold'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{padding:'8px 16px',fontSize:12,color:'#9ca3af',borderTop:'1px solid #f3f4f6'}}>{filteredOrders.length} items</div>
            </div>
          </div>
        )}

        {/* ═══ IMPORT ═══ */}
        {!loading&&tab==='import'&&(
          <div style={{maxWidth:640}}>
            <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,padding:24}}>
              <h3 style={{fontSize:15,fontWeight:600,marginBottom:4}}>Daily Shopify CSV import</h3>
              <p style={{fontSize:13,color:'#6b7280',marginBottom:16}}>Shopify Admin → Orders → Export → CSV. Duplicate orders are skipped.</p>
              <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleCSV(f)}} onClick={()=>document.getElementById('csvInput')?.click()} style={{border:'2px dashed #e5e7eb',borderRadius:8,padding:'40px 24px',textAlign:'center',cursor:'pointer'}}>
                <div style={{fontSize:24,marginBottom:8}}>↑</div>
                <div style={{fontWeight:500}}>Drop Shopify CSV here</div>
                <div style={{fontSize:12,color:'#9ca3af',marginTop:4}}>or click to browse</div>
                <input id="csvInput" type="file" accept=".csv" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleCSV(f)}}/>
              </div>
              {importStatus&&<div style={{marginTop:12,padding:'10px 14px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,fontSize:13,color:'#15803d'}}>{importStatus}</div>}
            </div>
          </div>
        )}
      </div>

      {/* ═══ MODALS ═══ */}
      {editingFcast&&modal(modalBox(
        <>
          <h3 style={{fontSize:16,fontWeight:700,marginBottom:4}}>Update Forecast</h3>
          <p style={{fontSize:12,color:'#9ca3af',marginBottom:20}}>{editingFcast.funnel} · {editingFcast.channel} · {new Date(editingFcast.week).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</p>
          <p style={{fontSize:12,marginBottom:10}}>Field: <strong>{editingFcast.field.replace(/_/g,' ')}</strong></p>
          <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>New Value</label>
          <input type="number" step="0.01" value={fcastNewValue} onChange={e=>setFcastNewValue(e.target.value)} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:14,marginBottom:14,boxSizing:'border-box'}}/>
          <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Reason <span style={{color:'#9ca3af',fontWeight:400}}>(required)</span></label>
          <textarea value={fcastReason} onChange={e=>setFcastReason(e.target.value)} rows={3} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,resize:'vertical',marginBottom:20,boxSizing:'border-box'}}/>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>setEditingFcast(null)} style={{flex:1,padding:'9px 0',border:'1px solid #e5e7eb',borderRadius:8,cursor:'pointer',background:'#fff',fontSize:14}}>Cancel</button>
            <button onClick={saveFcastEdit} disabled={!fcastReason.trim()||fcastSaving} style={{flex:1,padding:'9px 0',border:'none',borderRadius:8,cursor:'pointer',background:fcastReason.trim()?'#111':'#d1d5db',color:'#fff',fontSize:14,fontWeight:600}}>{fcastSaving?'Saving...':'Save'}</button>
          </div>
        </>
      ))}

      {editingSku&&modal(modalBox(
        <>
          <h3 style={{fontSize:16,fontWeight:700,marginBottom:4}}>Edit Stock — {editingSku.name}</h3>
          <p style={{fontSize:13,color:'#6b7280',marginBottom:20}}>Current: {editingSku.current_stock.toLocaleString()}</p>
          <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>New Quantity</label>
          <input type="number" value={editQty} onChange={e=>setEditQty(parseInt(e.target.value)||0)} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:14,marginBottom:14,boxSizing:'border-box'}}/>
          <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Comment <span style={{color:'#9ca3af',fontWeight:400}}>(required)</span></label>
          <textarea value={editComment} onChange={e=>setEditComment(e.target.value)} rows={3} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,resize:'vertical',marginBottom:20,boxSizing:'border-box'}}/>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>setEditingSku(null)} style={{flex:1,padding:'9px 0',border:'1px solid #e5e7eb',borderRadius:8,cursor:'pointer',background:'#fff'}}>Cancel</button>
            <button onClick={saveStockEdit} disabled={!editComment.trim()||editSaving} style={{flex:1,padding:'9px 0',border:'none',borderRadius:8,cursor:'pointer',background:editComment.trim()?'#111':'#d1d5db',color:'#fff',fontSize:14,fontWeight:600}}>{editSaving?'Saving...':'Save'}</button>
          </div>
        </>
      ))}

      {editingTO&&modal(modalBox(
        <>
          <h3 style={{fontSize:16,fontWeight:700,marginBottom:4}}>Edit Transfer Order</h3>
          <p style={{fontSize:12,color:'#9ca3af',marginBottom:20}}>{editingTO.to_number||'No TO number'}</p>
          {([{label:'TO Number',field:'to_number',type:'text'},{label:'Destination',field:'destination',type:'select',opts:DESTINATIONS},{label:'SKU',field:'sku',type:'sku'},{label:'Qty',field:'qty',type:'number'},{label:'Pick Up Date',field:'pick_up_date',type:'date'},{label:'ETA',field:'eta_destination',type:'date'},{label:'Shipping Method',field:'shipping_method',type:'select',opts:SHIPPING_METHODS},{label:'Status',field:'status',type:'select',opts:STATUSES_TO}] as any[]).map(({label,field,type,opts})=>(
            <div key={field} style={{marginBottom:12}}>
              <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:4}}>{label}</label>
              {type==='select'?<select value={(toEdits as any)[field]??''} onChange={e=>setToEdits(p=>({...p,[field]:e.target.value}))} style={{width:'100%',padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,boxSizing:'border-box'}}>{opts.map((o:string)=><option key={o} value={o}>{o}</option>)}</select>
              :type==='sku'?<select value={(toEdits as any)[field]??''} onChange={e=>setToEdits(p=>({...p,[field]:e.target.value}))} style={{width:'100%',padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,boxSizing:'border-box'}}>{skus.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</select>
              :<input type={type} value={(toEdits as any)[field]??''} onChange={e=>setToEdits(p=>({...p,[field]:type==='number'?parseInt(e.target.value)||0:e.target.value}))} style={{width:'100%',padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,boxSizing:'border-box'}}/>}
            </div>
          ))}
          <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:4}}>Comment <span style={{color:'#9ca3af',fontWeight:400}}>(required)</span></label>
          <textarea value={toComment} onChange={e=>setToComment(e.target.value)} rows={2} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,resize:'vertical',marginBottom:20,boxSizing:'border-box'}}/>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>setEditingTO(null)} style={{flex:1,padding:'9px 0',border:'1px solid #e5e7eb',borderRadius:8,cursor:'pointer',background:'#fff'}}>Cancel</button>
            <button onClick={saveToEdit} disabled={!toComment.trim()||toSaving} style={{flex:1,padding:'9px 0',border:'none',borderRadius:8,cursor:'pointer',background:toComment.trim()?'#111':'#d1d5db',color:'#fff',fontSize:14,fontWeight:600}}>{toSaving?'Saving...':'Save'}</button>
          </div>
        </>
      ,500))}

      {editingUE&&modal(modalBox(
        <>
          <h3 style={{fontSize:16,fontWeight:700,marginBottom:4}}>Edit {editingUE.label}</h3>
          <p style={{fontSize:12,color:'#9ca3af',marginBottom:20}}>{editingUE.row.sku} · Current: {(editingUE.row as any)[editingUE.field]??'—'}</p>
          <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>New Value</label>
          <input type="number" step="0.0001" value={ueNewValue} onChange={e=>setUeNewValue(e.target.value)} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:14,marginBottom:14,boxSizing:'border-box'}}/>
          <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Linked TO Number</label>
          <select value={ueToNumber} onChange={e=>setUeToNumber(e.target.value)} style={{width:'100%',padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,marginBottom:14,boxSizing:'border-box'}}>
            <option value="">— None —</option>
            {toNumbers.map(n=><option key={n} value={n}>{n}</option>)}
          </select>
          <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>PO Number (optional)</label>
          <input type="text" value={uePONumber} onChange={e=>setUePONumber(e.target.value)} style={{width:'100%',padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,marginBottom:14,boxSizing:'border-box'}}/>
          <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Reason <span style={{color:'#9ca3af',fontWeight:400}}>(required)</span></label>
          <textarea value={ueReason} onChange={e=>setUeReason(e.target.value)} rows={2} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,resize:'vertical',marginBottom:20,boxSizing:'border-box'}}/>
          <div style={{display:'flex',gap:10}}>
            <button onClick={()=>setEditingUE(null)} style={{flex:1,padding:'9px 0',border:'1px solid #e5e7eb',borderRadius:8,cursor:'pointer',background:'#fff'}}>Cancel</button>
            <button onClick={saveUEEdit} disabled={!ueReason.trim()||ueSaving} style={{flex:1,padding:'9px 0',border:'none',borderRadius:8,cursor:'pointer',background:ueReason.trim()?'#111':'#d1d5db',color:'#fff',fontSize:14,fontWeight:600}}>{ueSaving?'Saving...':'Save'}</button>
          </div>
        </>
      ))}

      {showChangelog&&modal(modalBox(
        <>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:20}}><h3 style={{fontSize:16,fontWeight:700,margin:0}}>Stock Change Log</h3><button onClick={()=>setShowChangelog(false)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#6b7280'}}>×</button></div>
          {changelog.length===0?<div style={{color:'#9ca3af',textAlign:'center',padding:40}}>No changes yet.</div>:changelog.map((c:any)=>(
            <div key={c.id} style={{padding:'12px 0',borderBottom:'1px solid #f3f4f6'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontWeight:600}}>{c.sku}</span><span style={{fontSize:12,color:'#9ca3af'}}>{new Date(c.changed_at).toLocaleString('en-GB')}</span></div>
              <div style={{fontSize:13,marginBottom:4}}>{c.previous_qty?.toLocaleString()} → <strong>{c.new_qty?.toLocaleString()}</strong><span style={{marginLeft:8,fontSize:12,color:c.new_qty>c.previous_qty?'#16a34a':'#dc2626'}}>({c.new_qty>c.previous_qty?'+':''}{(c.new_qty-c.previous_qty).toLocaleString()})</span></div>
              <div style={{fontSize:12,color:'#6b7280',fontStyle:'italic'}}>{c.comment}</div>
            </div>
          ))}
        </>,600
      ))}

      {showTOChangelog&&modal(modalBox(
        <>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:20}}><h3 style={{fontSize:16,fontWeight:700,margin:0}}>Transfer Order History</h3><button onClick={()=>setShowTOChangelog(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#6b7280'}}>×</button></div>
          {toChangelog.length===0?<div style={{color:'#9ca3af',textAlign:'center',padding:40}}>No changes recorded.</div>:toChangelog.map((c:any)=>(
            <div key={c.id} style={{padding:'12px 0',borderBottom:'1px solid #f3f4f6'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontWeight:600,fontSize:13}}>{c.field_changed}</span><span style={{fontSize:12,color:'#9ca3af'}}>{new Date(c.changed_at).toLocaleString('en-GB')}</span></div>
              <div style={{fontSize:13,marginBottom:4}}>{c.previous_value||'—'} → <strong>{c.new_value}</strong></div>
              <div style={{fontSize:12,color:'#6b7280',fontStyle:'italic'}}>{c.comment}</div>
            </div>
          ))}
        </>,600
      ))}

      {showCostChangelog&&modal(modalBox(
        <>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:20}}><h3 style={{fontSize:16,fontWeight:700,margin:0}}>Cost Log — {showCostChangelog}</h3><button onClick={()=>setShowCostChangelog(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#6b7280'}}>×</button></div>
          {costChangelog.length===0?<div style={{color:'#9ca3af',textAlign:'center',padding:40}}>No cost changes yet.</div>:costChangelog.map((c:any)=>(
            <div key={c.id} style={{padding:'12px 0',borderBottom:'1px solid #f3f4f6'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontWeight:600,fontSize:13}}>{c.field_changed}</span><span style={{fontSize:12,color:'#9ca3af'}}>{new Date(c.changed_at).toLocaleString('en-GB')}</span></div>
              <div style={{fontSize:13,marginBottom:4}}>${c.previous_value?.toFixed(2)??'—'} → <strong>${c.new_value?.toFixed(2)}</strong>{c.to_number&&<span style={{marginLeft:8,fontSize:11,color:'#6b7280'}}>TO: {c.to_number}</span>}{c.po_number&&<span style={{marginLeft:8,fontSize:11,color:'#6b7280'}}>PO: {c.po_number}</span>}</div>
              <div style={{fontSize:12,color:'#6b7280',fontStyle:'italic'}}>{c.reason}</div>
            </div>
          ))}
        </>,600
      ))}
    </div>
  )
}
