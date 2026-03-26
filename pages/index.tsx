import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type SKU = { id: string; name: string; current_stock: number; safety_reserve: number; status: string; funnel: string; hidden: boolean; avg_weekly_sales: number }
type TransferOrder = { id: string; to_number: string; destination: string; sku: string; qty: number; pick_up_date: string; eta_destination: string; shipping_method: string; status: string }
type BacklogOrder = { id: string; order_id: string; customer_name: string; sku_id: string; qty: number; order_date: string; status: string; priority: boolean }
type UERow = { sku: string; product_name: string; hts_code: string; manufacturer: string; manufacturer_country: string; production_lead_time_days: number; cbm: number; pkg_length_cm: number; pkg_width_cm: number; pkg_height_cm: number; cogs: number; inspection: number; commission: number; tariff_pct: number; tariff_cost: number; placement_fees: number; shipping_to_us: number; inbound_3pl: number; storage_3pl: number; us_landed_cost: number; amazon_landed_cogs: number; referral_fees: number; pick_pack_amazon: number; selling_price_amazon: number; profit_amazon: number; margin_amazon: number; selling_price_dtc: number; transaction_fees_dtc: number; pick_pack_dtc: number; shipping_dtc: number; profit_dtc: number; margin_dtc: number; upc: string; asin: string; current_unit_cost: number; current_shipping_cost: number }
type ForecastWeekly = { id: string; week_start: string; channel: string; funnel: string; sales_forecast: number | null; sales_actual: number | null; ad_spend_forecast: number | null; ad_spend_actual: number | null; mer_forecast: number | null; mer_actual: number | null }
type ForecastDaily = { id: string; date: string; channel: string; funnel: string; sales_actual: number | null; ad_spend_actual: number | null }
type SkuConfig = { sku: string; asp_dtc: number; dtc_mix_pct: number; funnel: string }
type UnitsWeekly = { id: string; sku: string; channel: string; week_start: string; units_actual: number | null }
type Vendor = { id: string; vendor_name: string; full_name: string; type: string; description: string; country: string; address: string; contact_person: string; contact_number: string; hidden: boolean }
type PaymentTerms = { id: string; sku: string; factory: string; terms_description: string; deposit_pct: number; at_pickup_pct: number; balance_pct: number; balance_days: number }
type TOComment = { id: string; to_number: string; comment: string; created_at: string }
type SKUComment = { id: string; sku: string; comment: string; created_at: string }
type BOW = { id: string; sku: string; week_start: string; bow_qty: number }
type Tab = 'dashboard' | 'forecast' | 'units' | 'transfers' | 'ue' | 'vendors' | 'backlog' | 'import'

const FUNNEL_MAP: Record<string, string[]> = {
  'Pans': ['TI_PAN_LID','TI_WOK_LID','TI_POT_LID','TI_SAUCE_LID','TI_UT_SPAT','TI_UT_SET'],
  'Cutting Boards': ['TI_BRD_S','TI_BRD_M','TI_BRD_L','BRD_STND'],
  'Jar Vacuum Sealer': ['MASON_VAC','MASON_LID_REG','MASON_LID_WIDE','MASON_FUNNEL','MASON_LABEL'],
  'Bag Vacuum Sealer': ['BAG_VAC','BAG_SML_15','BAG_S_10','BAG_M_10','BAG_L_10','BAG_XL_10','BAG_CONT_SML','BAG_VAC_SML_15','BAG_VAC_SML_30','BAG_VAC_SML_45'],
  'Food Warming Mat': ['FWM_M_GRY_US','FWM_M_CRM_US','FWM_M_BLU_US'],
}
const FUNNEL_ORDER = ['Pans','Cutting Boards','Jar Vacuum Sealer','Bag Vacuum Sealer','Food Warming Mat']
const FUNNELS_FORECAST = ['Food Warming Mat','Titanium Cutting Board','Titanium Pan','Jar Vacuum Sealer','Bag Vacuum Sealer']
const DESTINATIONS = ['KSCA','KSNJ','AMAZON','Other']
const SHIPPING_METHODS = ['Express Sea','Regular Sea','PO','Air','LCL','FCL']
const STATUSES_TO = ['TO Pending','In Transfer','Delivered','Cancelled']
const TODAY = new Date('2026-03-26')
const TODAY_STR = '2026-03-26'

const UE_FIELDS = [
  { key:'product_name', label:'Product', group:'Info', editable:false, fmt:'str' },
  { key:'manufacturer', label:'Manufacturer', group:'Info', editable:false, fmt:'str' },
  { key:'manufacturer_country', label:'Country', group:'Info', editable:false, fmt:'str' },
  { key:'hts_code', label:'HTS Code', group:'Info', editable:false, fmt:'str' },
  { key:'upc', label:'UPC', group:'Info', editable:false, fmt:'str' },
  { key:'asin', label:'ASIN', group:'Info', editable:false, fmt:'str' },
  { key:'production_lead_time_days', label:'Lead Time (days)', group:'Manufacturing', editable:true, fmt:'num' },
  { key:'cogs', label:'COGS', group:'Manufacturing', editable:true, fmt:'$' },
  { key:'inspection', label:'Inspection', group:'Manufacturing', editable:true, fmt:'$' },
  { key:'commission', label:'Commission', group:'Manufacturing', editable:true, fmt:'$' },
  { key:'pkg_length_cm', label:'L (cm)', group:'Dimensions', editable:true, fmt:'num' },
  { key:'pkg_width_cm', label:'W (cm)', group:'Dimensions', editable:true, fmt:'num' },
  { key:'pkg_height_cm', label:'H (cm)', group:'Dimensions', editable:true, fmt:'num' },
  { key:'cbm', label:'CBM', group:'Dimensions', editable:false, fmt:'num4' },
  { key:'tariff_pct', label:'Tariff %', group:'Tariffs', editable:true, fmt:'pct' },
  { key:'tariff_cost', label:'Tariff Cost', group:'Tariffs', editable:false, fmt:'$' },
  { key:'shipping_to_us', label:'Shipping to US', group:'Shipping & 3PL', editable:true, fmt:'$' },
  { key:'placement_fees', label:'Placement/Polybag', group:'Shipping & 3PL', editable:true, fmt:'$' },
  { key:'inbound_3pl', label:'Inbound 3PL', group:'Shipping & 3PL', editable:true, fmt:'$' },
  { key:'storage_3pl', label:'Storage 3PL', group:'Shipping & 3PL', editable:true, fmt:'$' },
  { key:'us_landed_cost', label:'US Landed Cost', group:'Shipping & 3PL', editable:false, fmt:'$' },
  { key:'amazon_landed_cogs', label:'Amazon Landed COGS', group:'Amazon', editable:false, fmt:'$' },
  { key:'referral_fees', label:'Referral Fees', group:'Amazon', editable:true, fmt:'$' },
  { key:'pick_pack_amazon', label:'Pick & Pack', group:'Amazon', editable:true, fmt:'$' },
  { key:'selling_price_amazon', label:'Selling Price', group:'Amazon', editable:true, fmt:'$' },
  { key:'profit_amazon', label:'Profit', group:'Amazon', editable:false, fmt:'$' },
  { key:'margin_amazon', label:'Margin', group:'Amazon', editable:false, fmt:'pct' },
  { key:'selling_price_dtc', label:'Selling Price', group:'DTC', editable:true, fmt:'$' },
  { key:'transaction_fees_dtc', label:'Transaction Fees', group:'DTC', editable:true, fmt:'$' },
  { key:'pick_pack_dtc', label:'Pick & Pack', group:'DTC', editable:true, fmt:'$' },
  { key:'shipping_dtc', label:'Shipping', group:'DTC', editable:true, fmt:'$' },
  { key:'profit_dtc', label:'Profit', group:'DTC', editable:false, fmt:'$' },
  { key:'margin_dtc', label:'Margin', group:'DTC', editable:false, fmt:'pct' },
  { key:'current_unit_cost', label:'Unit Cost', group:'Batch', editable:true, fmt:'$' },
  { key:'current_shipping_cost', label:'Shipping Cost', group:'Batch', editable:true, fmt:'$' },
]
const UE_GROUPS = [...new Set(UE_FIELDS.map(f => f.group))]

const fmtK = (n: number|null|undefined) => { if (n==null) return '—'; if (Math.abs(n)>=1000000) return '$'+(n/1000000).toFixed(1)+'M'; if (Math.abs(n)>=1000) return '$'+(n/1000).toFixed(0)+'K'; return '$'+n.toFixed(0) }
const fmtPct = (n: number|null|undefined) => n==null ? '—' : (n*100).toFixed(1)+'%'
const fmtDollar = (n: number|null|undefined) => n==null ? '—' : '$'+n.toFixed(2)
const fmtVal = (v: any, fmt?: string) => { if (v==null||v==='') return '—'; if (fmt==='$') return fmtDollar(v); if (fmt==='pct') return fmtPct(v); if (fmt==='num4') return typeof v==='number'?v.toFixed(4):String(v); if (fmt==='num') return typeof v==='number'?(v%1===0?v.toString():v.toFixed(2)):String(v); return String(v) }
const deltaColor = (a:number|null, f:number|null) => { if (a==null||f==null||f===0) return '#374151'; return a>=f?'#16a34a':'#dc2626' }
const deltaPct = (a:number|null, f:number|null) => { if (a==null||f==null||f===0) return null; return ((a-f)/f*100).toFixed(1) }
const isFuture = (w:string) => new Date(w) > TODAY
const daysLeft = (stock:number, avg:number) => !avg ? null : Math.floor(stock/avg*7)
const daysColor = (d:number|null) => d==null?'#6b7280':d<=0?'#dc2626':d<=14?'#dc2626':d<=28?'#d97706':d>180?'#2563eb':'#16a34a'
const fmtDate = (d:string) => new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})
const fmtDateTime = (d:string) => new Date(d).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})

function ss(key: string, val?: string): string|null {
  if (typeof window==='undefined') return val??null
  if (val!==undefined) { if(typeof window!=='undefined'){try{sessionStorage.setItem(key,val)}catch{}} ; return val }
  if(typeof window==='undefined')return null
  try{return sessionStorage.getItem(key)}catch{return null}
}

function useSet(ssKey: string): [Set<string>, (k:string)=>void, (v:boolean, k:string)=>void] {
  const [s, setS] = useState<Set<string>>(() => {
    if (typeof window==='undefined') return new Set()
    if(typeof window==='undefined')return new Set()
    try{const v=sessionStorage.getItem(ssKey);return v?new Set(JSON.parse(v)):new Set()}catch{return new Set()}
  })
  const save = (next: Set<string>) => { try{if(typeof window!=='undefined')sessionStorage.setItem(ssKey,JSON.stringify([...next]))}catch{} }
  const toggle = useCallback((k:string) => setS(prev => { const n=new Set(prev);n.has(k)?n.delete(k):n.add(k);save(n);return n }),[ssKey])
  const set2 = useCallback((v:boolean, k:string) => setS(prev => { const n=new Set(prev);v?n.add(k):n.delete(k);save(n);return n }),[ssKey])
  return [s, toggle, set2]
}

export default function Home() {
  const [tab, setTab] = useState<Tab>(() => { if(typeof window==='undefined')return'forecast';try{return(sessionStorage.getItem('tab') as Tab)||'forecast'}catch{return'forecast'} })
  const switchTab = (t:Tab) => { try{if(typeof window!=='undefined')sessionStorage.setItem('tab',t)}catch{};setTab(t) }

  const [skus, setSkus] = useState<SKU[]>([])
  const [orders, setOrders] = useState<BacklogOrder[]>([])
  const [transfers, setTransfers] = useState<TransferOrder[]>([])
  const [ueData, setUeData] = useState<UERow[]>([])
  const [fwData, setFwData] = useState<ForecastWeekly[]>([])
  const [fdData, setFdData] = useState<ForecastDaily[]>([])
  const [skuConfig, setSkuConfig] = useState<SkuConfig[]>([])
  const [unitsData, setUnitsData] = useState<UnitsWeekly[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [payTerms, setPayTerms] = useState<PaymentTerms[]>([])
  const [toComments, setToComments] = useState<TOComment[]>([])
  const [skuComments, setSkuComments] = useState<SKUComment[]>([])
  const [bowData, setBowData] = useState<BOW[]>([])
  const [loading, setLoading] = useState(true)
  const [showHidden, setShowHidden] = useState(false)
  const [importStatus, setImportStatus] = useState<string|null>(null)
  const [fcastChannel, setFcastChannel] = useState<'DTC'|'Amazon'>('DTC')
  const [hidePastWeeks, setHidePastWeeks] = useState(() => { if(typeof window==='undefined')return true;try{return sessionStorage.getItem('hidePast')!=='false'}catch{return true} })

  // Collapsed sets - all default to collapsed (empty set = all expanded, but we initialise everything as collapsed)
  const [collDash, togDash] = useSet('c_dash')
  const [collFcast, togFcast] = useSet('c_fcast')
  const [collFcastWk, togFcastWk] = useSet('c_fcastwk')
  const [collUnits, togUnits] = useSet('c_units')
  const [collWH, togWH] = useSet('c_wh')
  const [collTO, togTO] = useSet('c_to')
  const [collUEFunnel, togUEFunnel] = useSet('c_uefunnel')
  const [collUEGroup, togUEGroup] = useSet('c_uegroup')
  const [collVendor, togVendor] = useSet('c_vendor')
  const [hiddenVendors, , setHiddenVendor] = useSet('hidden_vendors')

  // Modals
  const [editStock, setEditStock] = useState<SKU|null>(null)
  const [editStockQty, setEditStockQty] = useState(0)
  const [editStockComment, setEditStockComment] = useState('')
  const [editStockSaving, setEditStockSaving] = useState(false)
  const [stockLog, setStockLog] = useState<any[]>([])
  const [showStockLog, setShowStockLog] = useState(false)
  const [editTO, setEditTO] = useState<TransferOrder|null>(null)
  const [toEdits, setToEdits] = useState<Partial<TransferOrder>>({})
  const [toEditComment, setToEditComment] = useState('')
  const [toEditSaving, setToEditSaving] = useState(false)
  const [showTOComments, setShowTOComments] = useState<string|null>(null)
  const [newTOComment, setNewTOComment] = useState('')
  const [addingTOComment, setAddingTOComment] = useState(false)
  const [editUE, setEditUE] = useState<{row:UERow,key:string,label:string}|null>(null)
  const [ueNewVal, setUeNewVal] = useState('')
  const [ueTO, setUeTO] = useState('')
  const [uePO, setUePO] = useState('')
  const [ueReason, setUeReason] = useState('')
  const [ueSaving, setUeSaving] = useState(false)
  const [costLog, setCostLog] = useState<any[]>([])
  const [showCostLog, setShowCostLog] = useState<string|null>(null)
  const [showSKUComment, setShowSKUComment] = useState<string|null>(null)
  const [newSKUComment, setNewSKUComment] = useState('')
  const [addingSKUComment, setAddingSKUComment] = useState(false)
  const [editFcast, setEditFcast] = useState<{week:string,channel:string,funnel:string,field:string,label:string}|null>(null)
  const [fcastNewVal, setFcastNewVal] = useState('')
  const [fcastReason, setFcastReason] = useState('')
  const [fcastSaving, setFcastSaving] = useState(false)
  const [filterSku, setFilterSku] = useState('all')
  const [filterStatus, setFilterStatus] = useState('active')
  const [searchOrder, setSearchOrder] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [a,b,c,d,e,f,g,h,i,j,k,l,m] = await Promise.all([
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
      supabase.from('to_comments').select('*').order('created_at'),
      supabase.from('sku_comments').select('*').order('created_at'),
      supabase.from('inventory_bow').select('*').order('week_start'),
    ])
    if(a.data)setSkus(a.data); if(b.data)setOrders(b.data); if(c.data)setTransfers(c.data)
    if(d.data)setUeData(d.data); if(e.data)setFwData(e.data); if(f.data)setFdData(f.data)
    if(g.data)setSkuConfig(g.data); if(h.data)setUnitsData(h.data); if(i.data)setVendors(i.data)
    if(j.data)setPayTerms(j.data); if(k.data)setToComments(k.data); if(l.data)setSkuComments(l.data)
    if(m.data)setBowData(m.data)
    setLoading(false)
  }

  async function fetchStockLog() { const{data}=await supabase.from('stock_changelog').select('*').order('changed_at',{ascending:false}).limit(100);if(data)setStockLog(data) }
  async function fetchCostLog(sku:string) { const{data}=await supabase.from('sku_cost_changelog').select('*').eq('sku',sku).order('changed_at',{ascending:false});if(data)setCostLog(data);setShowCostLog(sku) }

  async function saveStockEdit() {
    if(!editStock||!editStockComment.trim())return;setEditStockSaving(true)
    await supabase.from('stock_changelog').insert({sku:editStock.id,previous_qty:editStock.current_stock,new_qty:editStockQty,comment:editStockComment})
    await supabase.from('skus').update({current_stock:editStockQty,status:editStockQty===0?'out':editStockQty<=(editStock.safety_reserve||0)?'critical':'ok'}).eq('id',editStock.id)
    setEditStock(null);setEditStockComment('');setEditStockSaving(false);fetchAll()
  }

  async function saveToEdit() {
    if(!editTO||!toEditComment.trim())return;setToEditSaving(true)
    const fields:Array<keyof TransferOrder>=['sku','qty','pick_up_date','eta_destination','shipping_method','status','destination','to_number']
    const logs:any[]=[]
    for(const f of fields){if(toEdits[f]!==undefined&&String(toEdits[f])!==String((editTO as any)[f]??''))logs.push({to_id:editTO.id,field_changed:f,previous_value:String((editTO as any)[f]??''),new_value:String(toEdits[f]),comment:toEditComment})}
    if(logs.length){await supabase.from('to_changelog').insert(logs);await supabase.from('transfer_orders').update(toEdits).eq('id',editTO.id)}
    setEditTO(null);setToEdits({});setToEditComment('');setToEditSaving(false);fetchAll()
  }

  async function addTOComment(toNumber:string) {
    if(!newTOComment.trim())return;setAddingTOComment(true)
    await supabase.from('to_comments').insert({to_number:toNumber,comment:newTOComment})
    setNewTOComment('');setAddingTOComment(false);fetchAll()
  }

  async function addSKUComment(sku:string) {
    if(!newSKUComment.trim())return;setAddingSKUComment(true)
    await supabase.from('sku_comments').insert({sku,comment:newSKUComment})
    setNewSKUComment('');setAddingSKUComment(false);fetchAll()
  }

  async function saveUEEdit() {
    if(!editUE||!ueReason.trim())return;setUeSaving(true)
    const{row,key}=editUE;const oldVal=(row as any)[key];const newVal=parseFloat(ueNewVal)
    await supabase.from('sku_cost_changelog').insert({sku:row.sku,field_changed:key,previous_value:oldVal,new_value:newVal,to_number:ueTO||null,po_number:uePO||null,reason:ueReason})
    const upd:any={[key]:newVal,updated_at:new Date().toISOString()}
    if(key==='tariff_pct')upd.tariff_cost=(row.cogs||0)*newVal
    await supabase.from('sku_unit_economics').update(upd).eq('sku',row.sku)
    setEditUE(null);setUeNewVal('');setUeTO('');setUePO('');setUeReason('');setUeSaving(false);fetchAll()
  }

  async function saveFcastEdit() {
    if(!editFcast||!fcastReason.trim())return;setFcastSaving(true)
    const{week,channel,funnel,field}=editFcast
    const ex=fwData.find(r=>r.week_start===week&&r.channel===channel&&r.funnel===funnel)
    const oldVal=ex?(ex as any)[field]:null;const newVal=parseFloat(fcastNewVal)
    await supabase.from('forecast_changelog').insert({week_start:week,channel,funnel,field_changed:field,previous_value:oldVal,new_value:newVal,reason:fcastReason})
    if(ex)await supabase.from('forecast_weekly').update({[field]:newVal}).eq('id',ex.id)
    else await supabase.from('forecast_weekly').insert({week_start:week,channel,funnel,[field]:newVal})
    setEditFcast(null);setFcastNewVal('');setFcastReason('');setFcastSaving(false);fetchAll()
  }

  async function toggleHideVendor(v:Vendor) {
    await supabase.from('vendors').update({hidden:!v.hidden}).eq('id',v.id);fetchAll()
  }

  async function handleCSV(file:File) {
    setImportStatus('Parsing...')
    const text=await file.text();const lines=text.split('\n').filter(Boolean)
    const headers=lines[0].split(',').map(h=>h.replace(/"/g,'').trim())
    const ni=headers.findIndex(h=>h.toLowerCase()==='name'),si=headers.findIndex(h=>h.toLowerCase().includes('lineitem sku'))
    const qi=headers.findIndex(h=>h.toLowerCase().includes('lineitem quantity')),di=headers.findIndex(h=>h.toLowerCase().includes('created at'))
    const fi=headers.findIndex(h=>h.toLowerCase().includes('financial status')),shi=headers.findIndex(h=>h.toLowerCase().includes('requires shipping'))
    let ins=0,sk=0
    for(let i=1;i<lines.length;i++){
      const c=lines[i].split(',').map(x=>x.replace(/"/g,'').trim())
      if(!c[si]||c[fi]?.toLowerCase()!=='paid'||c[shi]?.toLowerCase()==='false'){sk++;continue}
      const st=skus.find(s=>s.id===c[si])?.status
      const{error}=await supabase.from('backlog_orders').insert({order_id:c[ni],customer_name:c[ni]||'',sku_id:c[si],qty:parseInt(c[qi])||1,order_date:c[di]||new Date().toISOString(),status:st==='out'||st==='critical'?'on_hold':'active',priority:false})
      if(!error)ins++;else sk++
    }
    setImportStatus(`Done — ${ins} imported, ${sk} skipped`);fetchAll()
  }

  // Derived
  const visibleSkus = skus.filter(s=>showHidden?true:!s.hidden)
  const skusByFunnel = FUNNEL_ORDER.reduce((a,f)=>{a[f]=visibleSkus.filter(s=>FUNNEL_MAP[f]?.includes(s.id));return a},{} as Record<string,SKU[]>)
  const groupedTransfers = transfers.reduce((a,t)=>{const d=t.destination||'Unknown';if(!a[d])a[d]=[];a[d].push(t);return a},{} as Record<string,TransferOrder[]>)
  const groupTOs = (tos:TransferOrder[])=>{const g:Record<string,TransferOrder[]>={};tos.forEach(t=>{const k=t.to_number||`__${t.id}`;if(!g[k])g[k]=[];g[k].push(t)});return g}
  const filteredOrders = orders.filter(o=>{
    if(filterStatus==='active'&&o.status!=='active')return false
    if(filterStatus==='on_hold'&&o.status!=='on_hold')return false
    if(filterStatus==='priority'&&!o.priority)return false
    if(filterSku!=='all'&&o.sku_id!==filterSku)return false
    if(searchOrder&&!o.order_id?.toLowerCase().includes(searchOrder.toLowerCase())&&!o.customer_name?.toLowerCase().includes(searchOrder.toLowerCase()))return false
    return true
  })
  const fcastWeeks = [...new Set(fwData.map(r=>r.week_start))].sort()
  const visibleFcastWeeks = hidePastWeeks ? fcastWeeks.filter(w=>!isFuture(w)?fcastWeeks.indexOf(w)>=fcastWeeks.filter(x=>!isFuture(x)).length-2:true) : fcastWeeks
  const getFW = (w:string,ch:string,fn:string)=>fwData.find(r=>r.week_start===w&&r.channel===ch&&r.funnel===fn)
  const getDailies = (w:string,ch:string,fn:string)=>{const d0=new Date(w);const d1=new Date(d0);d1.setDate(d0.getDate()+6);return fdData.filter(d=>{const dt=new Date(d.date);return d.channel===ch&&d.funnel===fn&&dt>=d0&&dt<=d1}).sort((a,b)=>a.date.localeCompare(b.date))}
  const ueByFunnel = FUNNEL_ORDER.reduce((a,f)=>{a[f]=ueData.filter(r=>FUNNEL_MAP[f]?.includes(r.sku));return a},{} as Record<string,UERow[]>)
  const manufacturers = vendors.filter(v=>v.type==='Manufacturer')
  const toNumbers = [...new Set(transfers.map(t=>t.to_number).filter(Boolean))]
  const getBOW = (sku:string,week:string)=>bowData.find(b=>b.sku===sku&&b.week_start===week)?.bow_qty??null
  const bowWeeks = [...new Set(bowData.map(b=>b.week_start))].filter(w=>w>=TODAY_STR).sort().slice(0,16)

  // Styles
  const sticky:React.CSSProperties={position:'sticky',top:0,zIndex:50}
  const th:React.CSSProperties={padding:'8px 12px',textAlign:'left' as const,fontWeight:600,color:'#374151',fontSize:11,textTransform:'uppercase' as const,letterSpacing:'0.04em',whiteSpace:'nowrap' as const,background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}
  const td:React.CSSProperties={padding:'8px 12px',borderBottom:'1px solid #f3f4f6',fontSize:13}

  const fBar=(collapsed:boolean,onClick:()=>void,label:string,count?:number,extra?:React.ReactNode)=>(
    <div onClick={onClick} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',background:'#f3f4f6',borderRadius:collapsed?8:'8px 8px 0 0',cursor:'pointer',userSelect:'none',border:'1px solid #e5e7eb',marginBottom:collapsed?8:0}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontWeight:700,fontSize:14}}>{label}</span>
        {count!=null&&count>0&&<span style={{fontSize:12,color:'#9ca3af'}}>{count}</span>}
        {extra}
      </div>
      <span style={{color:'#9ca3af',transform:collapsed?'rotate(-90deg)':'none',transition:'transform 0.15s'}}>▾</span>
    </div>
  )

  const chip=(label:string,color:string,bg:string)=><span style={{fontSize:11,padding:'2px 8px',borderRadius:10,background:bg,color,fontWeight:500}}>{label}</span>

  return (
    <div style={{fontFamily:'Inter, sans-serif',minHeight:'100vh',background:'#f9fafb',color:'#111'}}>
      <div style={{...sticky,background:'#fff',borderBottom:'1px solid #e5e7eb',padding:'11px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontWeight:700,fontSize:16}}>Plateful</span>
          <span style={{color:'#6b7280',fontSize:14}}>Operations</span>
        </div>
        <button onClick={fetchAll} style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280',fontSize:13}}>↻ Refresh</button>
      </div>
      <div style={{...sticky,top:48,background:'#fff',borderBottom:'1px solid #e5e7eb',padding:'0 24px',display:'flex',gap:16}}>
        {(['dashboard','forecast','units','transfers','ue','vendors','backlog','import'] as Tab[]).map(t=>(
          <button key={t} onClick={()=>switchTab(t)} style={{padding:'11px 0',background:'none',border:'none',cursor:'pointer',borderBottom:tab===t?'2px solid #111':'2px solid transparent',fontWeight:tab===t?600:400,fontSize:13,color:tab===t?'#111':'#6b7280',whiteSpace:'nowrap',textTransform:'capitalize'}}>
            {t==='ue'?'Unit Economics':t==='transfers'?'Transfer Orders':t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{padding:24,maxWidth:1600,margin:'0 auto'}}>
        {loading&&<div style={{color:'#6b7280',padding:40,textAlign:'center'}}>Loading...</div>}

        {/* ══ DASHBOARD ══ */}
        {!loading&&tab==='dashboard'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontSize:15,fontWeight:600,margin:0}}>Stock Levels</h2>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>setShowHidden(h=>!h)} style={{fontSize:12,color:'#6b7280',background:'none',border:'1px solid #e5e7eb',borderRadius:6,padding:'4px 10px',cursor:'pointer'}}>{showHidden?'Hide deprecated':'Show deprecated'}</button>
                <button onClick={()=>{setShowStockLog(true);fetchStockLog()}} style={{fontSize:12,color:'#6b7280',background:'none',border:'1px solid #e5e7eb',borderRadius:6,padding:'4px 10px',cursor:'pointer'}}>Change Log</button>
              </div>
            </div>
            {FUNNEL_ORDER.map(funnel=>{
              const fskus=skusByFunnel[funnel]||[];if(!fskus.length)return null
              const c=collDash.has(funnel)
              return(
                <div key={funnel} style={{marginBottom:12}}>
                  {fBar(c,()=>togDash(funnel),funnel,fskus.length)}
                  {!c&&(
                    <div style={{border:'1px solid #e5e7eb',borderTop:'none',borderRadius:'0 0 8px 8px',overflow:'auto',background:'#fff'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:700}}>
                        <thead>
                          <tr>
                            <th style={th}>SKU</th>
                            <th style={th}>Name</th>
                            <th style={th}>Now</th>
                            <th style={th}>Avg/Wk</th>
                            <th style={th}>Days</th>
                            <th style={th}>Status</th>
                            {bowWeeks.slice(0,8).map(w=><th key={w} style={{...th,textAlign:'center',background:'#eff6ff',color:'#2563eb',borderLeft:'1px solid #e5e7eb'}}>{fmtDate(w)}</th>)}
                            <th style={th}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {fskus.map(s=>{
                            const days=daysLeft(s.current_stock,s.avg_weekly_sales)
                            const isOut=s.status==='out'||s.current_stock===0;const isCrit=s.status==='critical'
                            return(
                              <tr key={s.id} style={{opacity:s.hidden?0.4:1}}>
                                <td style={td}><span style={{background:'#f3f4f6',padding:'2px 6px',borderRadius:4,fontSize:10,fontFamily:'monospace'}}>{s.id}</span></td>
                                <td style={{...td,color:'#6b7280',fontSize:12}}>{s.name}</td>
                                <td style={{...td,fontWeight:600}}>{s.current_stock.toLocaleString()}</td>
                                <td style={{...td,color:'#6b7280'}}>{s.avg_weekly_sales?s.avg_weekly_sales.toLocaleString():'—'}</td>
                                <td style={td}><span style={{fontWeight:600,color:daysColor(days)}}>{days==null?'—':days<=0?'Stockout':days+'d'}</span></td>
                                <td style={td}>{chip(isOut?'Out':isCrit?'Critical':'OK',isOut?'#dc2626':isCrit?'#d97706':'#16a34a',isOut?'#fee2e2':isCrit?'#fef3c7':'#dcfce7')}</td>
                                {bowWeeks.slice(0,8).map(w=>{
                                  const bow=getBOW(s.id,w)
                                  const isNeg=bow!=null&&bow<0
                                  const isLow=bow!=null&&bow>=0&&bow<(s.avg_weekly_sales*2)
                                  return<td key={w} style={{...td,textAlign:'center',borderLeft:'1px solid #f3f4f6',background:isNeg?'#fee2e2':isLow?'#fef3c7':'transparent',color:isNeg?'#dc2626':isLow?'#d97706':'#374151',fontWeight:isNeg?600:400}}>
                                    {bow!=null?bow.toLocaleString():'—'}
                                  </td>
                                })}
                                <td style={td}><button onClick={()=>{setEditStock(s);setEditStockQty(s.current_stock)}} style={{fontSize:11,padding:'3px 8px',border:'1px solid #e5e7eb',borderRadius:5,cursor:'pointer',background:'#fff'}}>Edit</button></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ══ FORECAST ══ */}
        {!loading&&tab==='forecast'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div style={{display:'flex',gap:2,background:'#f3f4f6',borderRadius:8,padding:3}}>
                {['DTC','Amazon'].map(ch=><button key={ch} onClick={()=>setFcastChannel(ch as any)} style={{padding:'6px 20px',borderRadius:6,border:'none',cursor:'pointer',background:fcastChannel===ch?'#fff':'transparent',fontWeight:fcastChannel===ch?600:400,fontSize:13,color:fcastChannel===ch?'#111':'#6b7280',boxShadow:fcastChannel===ch?'0 1px 3px rgba(0,0,0,0.1)':'none'}}>{ch}</button>)}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#6b7280',cursor:'pointer'}}>
                  <input type="checkbox" checked={hidePastWeeks} onChange={e=>{setHidePastWeeks(e.target.checked);try{if(typeof window!=='undefined')sessionStorage.setItem('hidePast',String(e.target.checked))}catch{}}} />
                  Hide past weeks
                </label>
                <span style={{fontSize:12,color:'#9ca3af'}}>Blue = editable forecast</span>
              </div>
            </div>
            {FUNNELS_FORECAST.map(funnel=>{
              const c=collFcast.has(funnel)
              const recentW=visibleFcastWeeks.filter(w=>!isFuture(w)).slice(-1)[0]
              const recentFW=recentW?getFW(recentW,fcastChannel,funnel):null
              return(
                <div key={funnel} style={{marginBottom:16}}>
                  {fBar(c,()=>togFcast(funnel),funnel,undefined,recentFW?.sales_actual!=null?<span style={{fontSize:12,color:'#374151',fontWeight:500}}>Last week: {fmtK(recentFW.sales_actual)}</span>:null)}
                  {!c&&(
                    <div style={{border:'1px solid #e5e7eb',borderTop:'none',borderRadius:'0 0 8px 8px',background:'#fff',overflowX:'auto'}}>
                      <table style={{borderCollapse:'collapse',fontSize:12,minWidth:600}}>
                        <thead>
                          <tr style={{background:'#f9fafb'}}>
                            <th style={{...th,width:100,position:'sticky',left:0,background:'#f9fafb',zIndex:10}}>Metric</th>
                            {visibleFcastWeeks.map(week=>{
                              const wk=funnel+week+fcastChannel;const fut=isFuture(week)
                              const dailies=getDailies(week,fcastChannel,funnel)
                              const dc=collFcastWk.has(wk)
                              const cs=(!dailies.length||dc)?3:dailies.length+3
                              return<th key={week} colSpan={cs} style={{...th,textAlign:'center',background:fut?'#eff6ff':'#f9fafb',borderLeft:'2px solid #e5e7eb',cursor:dailies.length?'pointer':'default',minWidth:85}} onClick={()=>dailies.length&&togFcastWk(wk)}>
                                <span style={{color:fut?'#2563eb':'#374151'}}>{fmtDate(week)}</span>
                                {dailies.length>0&&<span style={{fontSize:9,color:'#9ca3af',marginLeft:4,display:'inline-block',transform:dc?'rotate(-90deg)':'none'}}>▾</span>}
                              </th>
                            })}
                          </tr>
                          <tr style={{background:'#fafafa'}}>
                            <th style={{...th,position:'sticky',left:0,background:'#fafafa',zIndex:10}}></th>
                            {visibleFcastWeeks.map(week=>{
                              const wk=funnel+week+fcastChannel;const fut=isFuture(week)
                              const dailies=getDailies(week,fcastChannel,funnel);const dc=collFcastWk.has(wk)
                              const sub:React.CSSProperties={...th,background:'transparent',borderLeft:'1px solid #f3f4f6',fontWeight:400,fontSize:10,textTransform:'none' as const,letterSpacing:0,color:'#9ca3af',padding:'4px 8px'}
                              return<React.Fragment key={week}>
                                {!dc&&dailies.map(d=><th key={d.date} style={{...sub,borderLeft:'2px solid #e5e7eb',color:'#6b7280'}}>{new Date(d.date).toLocaleDateString('en-GB',{weekday:'short'})}</th>)}
                                <th style={{...sub,borderLeft:(!dailies.length||dc)?'2px solid #e5e7eb':'1px solid #f3f4f6'}}>Actual</th>
                                <th style={{...sub,color:fut?'#2563eb':'#9ca3af'}}>Forecast</th>
                                <th style={sub}>Δ%</th>
                              </React.Fragment>
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {([{label:'Sales ($)',ak:'sales_actual',fk:'sales_forecast',fmt:fmtK},{label:'Ad Spend',ak:'ad_spend_actual',fk:'ad_spend_forecast',fmt:fmtK},{label:'MER%',ak:'mer_actual',fk:'mer_forecast',fmt:fmtPct}] as any[]).map(({label,ak,fk,fmt})=>(
                            <tr key={label} style={{borderBottom:'1px solid #f3f4f6'}}>
                              <td style={{...td,fontWeight:500,position:'sticky',left:0,background:'#fff',zIndex:5,borderRight:'1px solid #e5e7eb',minWidth:90}}>{label}</td>
                              {visibleFcastWeeks.map(week=>{
                                const wk=funnel+week+fcastChannel;const fut=isFuture(week)
                                const fw=getFW(week,fcastChannel,funnel)
                                const actual=fw?(fw as any)[ak]:null;const forecast=fw?(fw as any)[fk]:null
                                const dp=deltaPct(actual,forecast);const dc2=deltaColor(actual,forecast)
                                const dailies=getDailies(week,fcastChannel,funnel);const dayC=collFcastWk.has(wk)
                                return<React.Fragment key={week}>
                                  {!dayC&&dailies.map(d=>{const dv=ak==='sales_actual'?d.sales_actual:ak==='ad_spend_actual'?d.ad_spend_actual:null;return<td key={d.date} style={{...td,textAlign:'right' as const,borderLeft:'2px solid #e5e7eb',minWidth:55}}>{dv!=null?fmt(dv):'—'}</td>})}
                                  <td style={{...td,textAlign:'right' as const,borderLeft:(!dailies.length||dayC)?'2px solid #e5e7eb':'1px solid #f3f4f6',minWidth:65}}>{actual!=null?fmt(actual):'—'}</td>
                                  <td onClick={()=>fut&&(setEditFcast({week,channel:fcastChannel,funnel,field:fk,label}),setFcastNewVal(forecast!=null?String(forecast):''))} style={{...td,textAlign:'right' as const,color:'#2563eb',cursor:fut?'pointer':'default',background:fut?'#eff6ff':'transparent',fontWeight:fut?500:400,minWidth:65}}>{forecast!=null?fmt(forecast):<span style={{color:'#9ca3af'}}>—</span>}</td>
                                  <td style={{...td,textAlign:'right' as const,color:dc2,fontWeight:dp?500:400,minWidth:50}}>{dp?(parseFloat(dp)>0?'+':'')+dp+'%':'—'}</td>
                                </React.Fragment>
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

        {/* ══ UNITS ══ */}
        {!loading&&tab==='units'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <h2 style={{fontSize:15,fontWeight:600,margin:0}}>Units Forecast</h2>
              <span style={{fontSize:12,color:'#9ca3af'}}>Black = actuals · Blue = revenue forecast × split ÷ ASP</span>
            </div>
            {FUNNELS_FORECAST.map(funnel=>{
              const fConfigs=skuConfig.filter(c=>c.funnel===funnel);if(!fConfigs.length)return null
              const c=collUnits.has(funnel)
              const weeks=[...new Set(fwData.map(r=>r.week_start))].sort()
              const past=weeks.filter(w=>!isFuture(w)).slice(-6);const future=weeks.filter(w=>isFuture(w)).slice(0,8)
              const allW=[...past,...future]
              return(
                <div key={funnel} style={{marginBottom:16}}>
                  {fBar(c,()=>togUnits(funnel),funnel,fConfigs.length)}
                  {!c&&(
                    <div style={{border:'1px solid #e5e7eb',borderTop:'none',borderRadius:'0 0 8px 8px',background:'#fff',overflowX:'auto'}}>
                      <table style={{borderCollapse:'collapse',fontSize:12,minWidth:600}}>
                        <thead><tr style={{background:'#f9fafb'}}>
                          <th style={{...th,width:140,position:'sticky',left:0,background:'#f9fafb',zIndex:10}}>SKU</th>
                          <th style={{...th,width:65}}>ASP</th>
                          <th style={{...th,width:60}}>Split%</th>
                          {allW.map(w=>{const fut=isFuture(w);return<th key={w} style={{...th,textAlign:'center',background:fut?'#eff6ff':'#f9fafb',borderLeft:'2px solid #e5e7eb',minWidth:70}}><span style={{color:fut?'#2563eb':'#374151'}}>{fmtDate(w)}</span></th>})}
                        </tr></thead>
                        <tbody>
                          {fConfigs.map(cfg=>(
                            <tr key={cfg.sku} style={{borderBottom:'1px solid #f3f4f6'}}>
                              <td style={{...td,fontWeight:600,position:'sticky',left:0,background:'#fff',zIndex:5,borderRight:'1px solid #e5e7eb'}}><span style={{fontFamily:'monospace',fontSize:10,background:'#f3f4f6',padding:'2px 6px',borderRadius:4}}>{cfg.sku}</span></td>
                              <td style={{...td,color:'#6b7280'}}>${cfg.asp_dtc?.toFixed(0)??'—'}</td>
                              <td style={{...td,color:'#6b7280'}}>{cfg.dtc_mix_pct!=null?(cfg.dtc_mix_pct*100).toFixed(1)+'%':'—'}</td>
                              {allW.map(w=>{
                                const fut=isFuture(w)
                                const actual=unitsData.find(u=>u.sku===cfg.sku&&u.week_start===w)?.units_actual
                                const fw=fwData.find(r=>r.week_start===w&&r.channel==='DTC'&&r.funnel===funnel)
                                const calc=(fw?.sales_forecast!=null&&cfg.dtc_mix_pct!=null&&cfg.asp_dtc)?Math.round(fw.sales_forecast*cfg.dtc_mix_pct/cfg.asp_dtc):null
                                const display=actual??calc;const isActual=actual!=null
                                return<td key={w} style={{...td,textAlign:'right' as const,borderLeft:'2px solid #e5e7eb',color:isActual?'#374151':'#2563eb',fontWeight:isActual?400:500,background:fut&&!isActual?'#eff6ff':'transparent'}}>
                                  {display!=null?display.toLocaleString():<span style={{color:'#d1d5db'}}>—</span>}
                                </td>
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

        {/* ══ TRANSFER ORDERS ══ */}
        {!loading&&tab==='transfers'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontSize:15,fontWeight:600,margin:0}}>Inbound Transfer Orders</h2>
              <span style={{fontSize:12,color:'#9ca3af'}}>{transfers.length} lines</span>
            </div>
            {Object.entries(groupedTransfers).sort(([a],[b])=>a.localeCompare(b)).map(([dest,tos])=>{
              const dc=collWH.has(dest);const byTO=groupTOs(tos)
              const inT=tos.filter(t=>t.status==='In Transfer').length;const pend=tos.filter(t=>t.status==='TO Pending').length
              return(
                <div key={dest} style={{marginBottom:16}}>
                  <div onClick={()=>togWH(dest)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',background:'#1f2937',borderRadius:dc?8:'8px 8px 0 0',cursor:'pointer',userSelect:'none'}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <span style={{fontWeight:700,fontSize:14,color:'#fff'}}>📦 {dest}</span>
                      <span style={{fontSize:12,color:'#9ca3af'}}>{Object.keys(byTO).length} TOs · {tos.length} lines</span>
                      {inT>0&&chip(`${inT} in transit`,'#1d4ed8','#dbeafe')}
                      {pend>0&&chip(`${pend} pending`,'#d97706','#fef3c7')}
                    </div>
                    <span style={{color:'#9ca3af',transform:dc?'rotate(-90deg)':'none',transition:'transform 0.15s'}}>▾</span>
                  </div>
                  {!dc&&(
                    <div style={{border:'1px solid #e5e7eb',borderTop:'none',borderRadius:'0 0 8px 8px',background:'#fff',overflow:'hidden'}}>
                      {Object.entries(byTO).sort(([a],[b])=>a.localeCompare(b)).map(([toNum,toRows])=>{
                        const toKey=dest+'___'+toNum;const tc=collTO.has(toKey)
                        const dn=toNum.startsWith('__')?'—':toNum
                        const eta=toRows.find(r=>r.eta_destination)?.eta_destination
                        const dOut=eta?Math.ceil((new Date(eta).getTime()-Date.now())/86400000):null
                        const toSt=toRows[0]?.status
                        const thisTOComments=toComments.filter(c=>c.to_number===dn)
                        return(
                          <div key={toKey} style={{borderBottom:'1px solid #f3f4f6'}}>
                            <div onClick={()=>togTO(toKey)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 16px',background:'#f9fafb',cursor:'pointer',userSelect:'none'}}>
                              <div style={{display:'flex',alignItems:'center',gap:12}}>
                                <span style={{fontWeight:600,fontSize:13,fontFamily:'monospace'}}>{dn}</span>
                                <span style={{fontSize:12,color:'#9ca3af'}}>{toRows.length} SKU{toRows.length!==1?'s':''}</span>
                                {eta&&<span style={{fontSize:12,color:dOut!=null&&dOut<=7?'#16a34a':dOut!=null&&dOut<=21?'#d97706':'#374151'}}>ETA {fmtDate(eta)}{dOut!=null&&<span style={{color:'#9ca3af',marginLeft:4}}>({dOut}d)</span>}</span>}
                                {chip(toSt||'—',toSt==='TO Pending'?'#d97706':toSt==='In Transfer'?'#1d4ed8':'#15803d',toSt==='TO Pending'?'#fef3c7':toSt==='In Transfer'?'#dbeafe':'#dcfce7')}
                                {thisTOComments.length>0&&<span style={{fontSize:11,color:'#6b7280'}}>💬 {thisTOComments.length}</span>}
                              </div>
                              <div style={{display:'flex',alignItems:'center',gap:8}} onClick={e=>e.stopPropagation()}>
                                <button onClick={()=>setShowTOComments(showTOComments===dn?null:dn)} style={{fontSize:11,padding:'2px 8px',border:'1px solid #e5e7eb',borderRadius:5,cursor:'pointer',background:'#fff'}}>Comments</button>
                                <span style={{color:'#9ca3af',transform:tc?'rotate(-90deg)':'none',transition:'transform 0.15s',cursor:'pointer'}} onClick={()=>togTO(toKey)}>▾</span>
                              </div>
                            </div>
                            {/* TO Comments panel */}
                            {showTOComments===dn&&(
                              <div style={{padding:'12px 16px',background:'#fafafa',borderBottom:'1px solid #f3f4f6'}}>
                                <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',color:'#6b7280',marginBottom:8}}>Shipment Comments</div>
                                {thisTOComments.length===0&&<div style={{fontSize:12,color:'#9ca3af',marginBottom:8}}>No comments yet.</div>}
                                {thisTOComments.map(c=>(
                                  <div key={c.id} style={{fontSize:12,padding:'6px 0',borderBottom:'1px solid #f3f4f6'}}>
                                    <span style={{color:'#374151'}}>{c.comment}</span>
                                    <span style={{color:'#9ca3af',marginLeft:8,fontSize:11}}>{fmtDateTime(c.created_at)}</span>
                                  </div>
                                ))}
                                <div style={{display:'flex',gap:8,marginTop:10}}>
                                  <input value={newTOComment} onChange={e=>setNewTOComment(e.target.value)} placeholder="Add comment..." style={{flex:1,padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:12}} onKeyDown={e=>e.key==='Enter'&&addTOComment(dn)} />
                                  <button onClick={()=>addTOComment(dn)} disabled={!newTOComment.trim()||addingTOComment} style={{padding:'6px 14px',border:'none',borderRadius:6,background:'#111',color:'#fff',fontSize:12,cursor:'pointer'}}>Add</button>
                                </div>
                              </div>
                            )}
                            {!tc&&(
                              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                                <thead><tr>{['SKU','Qty','Pick Up','ETA','Method','Status',''].map(h=><th key={h} style={{...th,background:'#fff',fontSize:11}}>{h}</th>)}</tr></thead>
                                <tbody>{toRows.sort((a,b)=>(a.eta_destination||'').localeCompare(b.eta_destination||'')).map(t=>(
                                  <tr key={t.id}>
                                    <td style={td}><span style={{background:'#f3f4f6',padding:'2px 6px',borderRadius:4,fontSize:11,fontFamily:'monospace'}}>{t.sku}</span></td>
                                    <td style={{...td,fontWeight:600}}>{t.qty?.toLocaleString()}</td>
                                    <td style={{...td,color:'#6b7280'}}>{t.pick_up_date?fmtDate(t.pick_up_date):'—'}</td>
                                    <td style={td}>{t.eta_destination?fmtDate(t.eta_destination):'—'}</td>
                                    <td style={{...td,color:'#6b7280'}}>{t.shipping_method||'—'}</td>
                                    <td style={td}>{chip(t.status,t.status==='TO Pending'?'#d97706':t.status==='In Transfer'?'#1d4ed8':'#15803d',t.status==='TO Pending'?'#fef3c7':t.status==='In Transfer'?'#dbeafe':'#dcfce7')}</td>
                                    <td style={td}><button onClick={()=>{setEditTO(t);setToEdits({sku:t.sku,qty:t.qty,pick_up_date:t.pick_up_date,eta_destination:t.eta_destination,shipping_method:t.shipping_method,status:t.status,destination:t.destination,to_number:t.to_number});setToEditComment('')}} style={{fontSize:11,padding:'3px 8px',border:'1px solid #e5e7eb',borderRadius:5,cursor:'pointer',background:'#fff'}}>Edit</button></td>
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

        {/* ══ UNIT ECONOMICS ══ */}
        {!loading&&tab==='ue'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontSize:15,fontWeight:600,margin:0}}>Unit Economics</h2>
              <span style={{fontSize:12,color:'#9ca3af'}}>Dashed = editable · Click to update</span>
            </div>
            {FUNNEL_ORDER.map(funnel=>{
              const frows=ueByFunnel[funnel]||[];if(!frows.length)return null
              const c=collUEFunnel.has(funnel)
              return(
                <div key={funnel} style={{marginBottom:16}}>
                  {fBar(c,()=>togUEFunnel(funnel),funnel,frows.length)}
                  {!c&&(
                    <div style={{border:'1px solid #e5e7eb',borderTop:'none',borderRadius:'0 0 8px 8px',background:'#fff',overflowX:'auto'}}>
                      <table style={{borderCollapse:'collapse',fontSize:12,minWidth:400}}>
                        <thead>
                          <tr style={{background:'#f9fafb'}}>
                            <th style={{...th,position:'sticky',left:0,background:'#f9fafb',zIndex:10,minWidth:100}}>SKU</th>
                            <th style={{...th,position:'sticky',left:100,background:'#f9fafb',zIndex:10,minWidth:60}}>Notes</th>
                            {UE_GROUPS.map(g=>{
                              const gCols=UE_FIELDS.filter(f=>f.group===g)
                              const gc=collUEGroup.has(funnel+'__'+g)
                              return<th key={g} colSpan={gc?1:gCols.length} style={{...th,textAlign:'center',borderLeft:'2px solid #e5e7eb',background:gc?'#f3f4f6':'#f9fafb',cursor:'pointer',color:'#374151',whiteSpace:'nowrap'}} onClick={()=>togUEGroup(funnel+'__'+g)}>
                                <span style={{transform:gc?'rotate(-90deg)':'none',transition:'transform 0.15s',color:'#9ca3af',marginRight:4,display:'inline-block'}}>▾</span>{g}
                              </th>
                            })}
                          </tr>
                          <tr style={{background:'#fafafa'}}>
                            <th style={{...th,position:'sticky',left:0,background:'#fafafa',zIndex:10}}></th>
                            <th style={{...th,position:'sticky',left:100,background:'#fafafa',zIndex:10}}></th>
                            {UE_GROUPS.map(g=>{
                              const gc=collUEGroup.has(funnel+'__'+g)
                              if(gc)return<th key={g} style={{...th,borderLeft:'2px solid #e5e7eb',background:'transparent'}}></th>
                              return UE_FIELDS.filter(f=>f.group===g).map((f,fi)=>(
                                <th key={f.key} style={{...th,background:'transparent',borderLeft:fi===0?'2px solid #e5e7eb':'1px solid #f3f4f6',fontWeight:500,fontSize:10,textTransform:'none' as const,letterSpacing:0,color:f.editable?'#374151':'#9ca3af',minWidth:f.fmt==='str'?120:80}}>
                                  {f.label}{f.editable&&<span style={{color:'#9ca3af',marginLeft:3}}>✎</span>}
                                </th>
                              ))
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {frows.map(row=>{
                            const thisSKUComments=skuComments.filter(c=>c.sku===row.sku)
                            return(
                              <React.Fragment key={row.sku}>
                                <tr style={{borderBottom:'1px solid #f3f4f6'}}>
                                  <td style={{...td,fontWeight:700,position:'sticky',left:0,background:'#fff',zIndex:5,borderRight:'1px solid #e5e7eb'}}>
                                    <div style={{fontFamily:'monospace',fontSize:11}}>{row.sku}</div>
                                    <div style={{display:'flex',gap:4,marginTop:3}}>
                                      <button onClick={()=>fetchCostLog(row.sku)} style={{fontSize:9,padding:'1px 5px',border:'1px solid #e5e7eb',borderRadius:3,cursor:'pointer',background:'#fff',color:'#6b7280'}}>History</button>
                                    </div>
                                  </td>
                                  <td style={{...td,position:'sticky',left:100,background:'#fff',zIndex:5,borderRight:'1px solid #e5e7eb'}}>
                                    <button onClick={()=>setShowSKUComment(showSKUComment===row.sku?null:row.sku)} style={{fontSize:10,padding:'2px 6px',border:'1px solid #e5e7eb',borderRadius:4,cursor:'pointer',background:thisSKUComments.length>0?'#eff6ff':'#fff',color:thisSKUComments.length>0?'#2563eb':'#6b7280'}}>
                                      💬{thisSKUComments.length>0?` ${thisSKUComments.length}`:''}
                                    </button>
                                  </td>
                                  {UE_GROUPS.map(g=>{
                                    const gc=collUEGroup.has(funnel+'__'+g)
                                    if(gc)return<td key={g} style={{...td,borderLeft:'2px solid #e5e7eb',color:'#d1d5db',fontSize:10}}>…</td>
                                    return UE_FIELDS.filter(f=>f.group===g).map((f,fi)=>{
                                      const val=(row as any)[f.key]
                                      const display=fmtVal(val,f.fmt)
                                      const isNeg=typeof val==='number'&&val<0&&(f.key.includes('profit')||f.key.includes('margin'))
                                      return<td key={f.key} onClick={()=>f.editable&&(setEditUE({row,key:f.key,label:f.label}),setUeNewVal(val!=null?String(val):''))}
                                        style={{...td,textAlign:'right' as const,borderLeft:fi===0?'2px solid #e5e7eb':'1px solid #f3f4f6',color:val==null?'#d1d5db':isNeg?'#dc2626':'#374151',cursor:f.editable?'pointer':'default'}}>
                                        <span style={{borderBottom:f.editable?'1px dashed #9ca3af':'none',paddingBottom:1}}>{display}</span>
                                      </td>
                                    })
                                  })}
                                </tr>
                                {showSKUComment===row.sku&&(
                                  <tr><td colSpan={99} style={{padding:'10px 16px',background:'#fafafa',borderBottom:'1px solid #f3f4f6'}}>
                                    <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',color:'#6b7280',marginBottom:6}}>Notes — {row.sku}</div>
                                    {thisSKUComments.map(c=><div key={c.id} style={{fontSize:12,padding:'4px 0',borderBottom:'1px solid #f3f4f6'}}><span style={{color:'#374151'}}>{c.comment}</span><span style={{color:'#9ca3af',marginLeft:8,fontSize:11}}>{fmtDateTime(c.created_at)}</span></div>)}
                                    <div style={{display:'flex',gap:8,marginTop:8}}>
                                      <input value={newSKUComment} onChange={e=>setNewSKUComment(e.target.value)} placeholder="Add note..." style={{flex:1,padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:12}} onKeyDown={e=>e.key==='Enter'&&addSKUComment(row.sku)} />
                                      <button onClick={()=>addSKUComment(row.sku)} disabled={!newSKUComment.trim()||addingSKUComment} style={{padding:'6px 14px',border:'none',borderRadius:6,background:'#111',color:'#fff',fontSize:12,cursor:'pointer'}}>Add</button>
                                    </div>
                                  </td></tr>
                                )}
                              </React.Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ══ VENDORS ══ */}
        {!loading&&tab==='vendors'&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontSize:15,fontWeight:600,margin:0}}>Manufacturers</h2>
              <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#6b7280',cursor:'pointer'}}>
                <input type="checkbox" checked={showHidden} onChange={e=>setShowHidden(e.target.checked)} />
                Show hidden
              </label>
            </div>
            {manufacturers.filter(v=>showHidden?true:!v.hidden).map(v=>{
              const vc=collVendor.has(v.id);const vPT=payTerms.filter(p=>p.factory===v.vendor_name||p.factory===v.full_name)
              return(
                <div key={v.id} style={{marginBottom:8,border:'1px solid #e5e7eb',borderRadius:8,overflow:'hidden',background:'#fff',opacity:v.hidden?0.5:1}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',background:'#f9fafb',cursor:'pointer',userSelect:'none'}} onClick={()=>togVendor(v.id)}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div>
                        <span style={{fontWeight:700,fontSize:14}}>{v.vendor_name}</span>
                        {v.full_name&&v.full_name!==v.vendor_name&&<span style={{fontSize:12,color:'#9ca3af',marginLeft:8}}>{v.full_name}</span>}
                      </div>
                      <span style={{fontSize:11,padding:'2px 8px',background:'#f3f4f6',borderRadius:10,color:'#6b7280'}}>{v.country}</span>
                      {v.description&&<span style={{fontSize:12,color:'#6b7280'}}>{v.description}</span>}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8}} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>toggleHideVendor(v)} style={{fontSize:11,padding:'2px 8px',border:'1px solid #e5e7eb',borderRadius:5,cursor:'pointer',background:'#fff',color:'#6b7280'}}>{v.hidden?'Show':'Hide'}</button>
                      <span style={{color:'#9ca3af',transform:vc?'rotate(-90deg)':'none',transition:'transform 0.15s',cursor:'pointer'}} onClick={()=>togVendor(v.id)}>▾</span>
                    </div>
                  </div>
                  {!vc&&(
                    <div style={{padding:'12px 16px'}}>
                      <div style={{display:'flex',gap:24,fontSize:13,marginBottom:12,paddingBottom:12,borderBottom:'1px solid #f3f4f6'}}>
                        {v.address&&<div><div style={{fontSize:11,color:'#9ca3af',marginBottom:2}}>Address</div><div>{v.address}</div></div>}
                        {v.contact_person&&<div><div style={{fontSize:11,color:'#9ca3af',marginBottom:2}}>Contact</div><div>{v.contact_person}{v.contact_number?' · '+v.contact_number:''}</div></div>}
                      </div>
                      {vPT.length>0&&(
                        <>
                          <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',color:'#6b7280',marginBottom:8}}>Payment Terms by SKU</div>
                          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                            <thead><tr>
                              <th style={th}>SKU</th><th style={th}>Terms</th>
                              <th style={{...th,textAlign:'right' as const}}>Deposit</th>
                              <th style={{...th,textAlign:'right' as const}}>At Pickup</th>
                              <th style={{...th,textAlign:'right' as const}}>Balance</th>
                              <th style={{...th,textAlign:'right' as const}}>Balance due (days after pickup)</th>
                            </tr></thead>
                            <tbody>{vPT.map(p=>(
                              <tr key={p.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                                <td style={td}><span style={{fontFamily:'monospace',fontSize:11,background:'#f3f4f6',padding:'2px 6px',borderRadius:4,cursor:'pointer',color:'#2563eb'}} onClick={()=>switchTab('ue')}>{p.sku}</span></td>
                                <td style={{...td,color:'#6b7280',fontSize:11}}>{p.terms_description||'—'}</td>
                                <td style={{...td,textAlign:'right' as const}}>{p.deposit_pct!=null?(p.deposit_pct*100).toFixed(0)+'%':'—'}</td>
                                <td style={{...td,textAlign:'right' as const}}>{p.at_pickup_pct!=null?(p.at_pickup_pct*100).toFixed(0)+'%':'—'}</td>
                                <td style={{...td,textAlign:'right' as const}}>{p.balance_pct!=null?(p.balance_pct*100).toFixed(0)+'%':'—'}</td>
                                <td style={{...td,textAlign:'right' as const,color:'#6b7280'}}>{p.balance_days??'—'}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ══ BACKLOG ══ */}
        {!loading&&tab==='backlog'&&(
          <div>
            <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
              <input value={searchOrder} onChange={e=>setSearchOrder(e.target.value)} placeholder="Order # or customer..." style={{padding:'7px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,width:200}} />
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
                      <td style={td}>{chip(o.status==='on_hold'?'On Hold':o.priority?'★ Priority':'Active',o.status==='on_hold'?'#d97706':o.priority?'#1d4ed8':'#374151',o.status==='on_hold'?'#fef3c7':o.priority?'#dbeafe':'#f3f4f6')}</td>
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

        {/* ══ IMPORT ══ */}
        {!loading&&tab==='import'&&(
          <div style={{maxWidth:640}}>
            <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,padding:24}}>
              <h3 style={{fontSize:15,fontWeight:600,marginBottom:4}}>Shopify CSV import</h3>
              <p style={{fontSize:13,color:'#6b7280',marginBottom:16}}>Shopify Admin → Orders → Export → CSV. Duplicate orders are skipped.</p>
              <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleCSV(f)}} onClick={()=>document.getElementById('csvInput')?.click()} style={{border:'2px dashed #e5e7eb',borderRadius:8,padding:'40px 24px',textAlign:'center',cursor:'pointer'}}>
                <div style={{fontSize:24,marginBottom:8}}>↑</div>
                <div style={{fontWeight:500}}>Drop Shopify CSV here</div>
                <div style={{fontSize:12,color:'#9ca3af',marginTop:4}}>or click to browse</div>
                <input id="csvInput" type="file" accept=".csv" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleCSV(f)}} />
              </div>
              {importStatus&&<div style={{marginTop:12,padding:'10px 14px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,fontSize:13,color:'#15803d'}}>{importStatus}</div>}
            </div>
          </div>
        )}
      </div>

      {/* ══ MODALS ══ */}

      {editFcast&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div style={{background:'#fff',borderRadius:12,padding:28,width:420,boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
            <h3 style={{fontSize:16,fontWeight:700,marginBottom:4}}>Update Forecast</h3>
            <p style={{fontSize:12,color:'#9ca3af',marginBottom:16}}>{editFcast.funnel} · {editFcast.channel} · {fmtDate(editFcast.week)}</p>
            <p style={{fontSize:12,marginBottom:12}}>Field: <strong>{editFcast.label}</strong></p>
            <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>New Value</label>
            <input type="number" step="0.01" value={fcastNewVal} onChange={e=>setFcastNewVal(e.target.value)} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:14,marginBottom:14,boxSizing:'border-box'}} />
            <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Reason <span style={{color:'#9ca3af',fontWeight:400}}>(required)</span></label>
            <textarea value={fcastReason} onChange={e=>setFcastReason(e.target.value)} rows={3} placeholder="e.g. S&OP 26 Mar — revised based on seasonality" style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,resize:'vertical',marginBottom:20,boxSizing:'border-box'}} />
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setEditFcast(null)} style={{flex:1,padding:'9px 0',border:'1px solid #e5e7eb',borderRadius:8,cursor:'pointer',background:'#fff',fontSize:14}}>Cancel</button>
              <button onClick={saveFcastEdit} disabled={!fcastReason.trim()||fcastSaving} style={{flex:1,padding:'9px 0',border:'none',borderRadius:8,cursor:'pointer',background:fcastReason.trim()?'#111':'#d1d5db',color:'#fff',fontSize:14,fontWeight:600}}>{fcastSaving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {editStock&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div style={{background:'#fff',borderRadius:12,padding:28,width:400,boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
            <h3 style={{fontSize:16,fontWeight:700,marginBottom:4}}>Edit Stock — {editStock.name||editStock.id}</h3>
            <p style={{fontSize:13,color:'#6b7280',marginBottom:20}}>Current: {editStock.current_stock.toLocaleString()}</p>
            <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>New Quantity</label>
            <input type="number" value={editStockQty} onChange={e=>setEditStockQty(parseInt(e.target.value)||0)} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:14,marginBottom:14,boxSizing:'border-box'}} />
            <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Comment <span style={{color:'#9ca3af',fontWeight:400}}>(required)</span></label>
            <textarea value={editStockComment} onChange={e=>setEditStockComment(e.target.value)} rows={3} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,resize:'vertical',marginBottom:20,boxSizing:'border-box'}} />
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setEditStock(null)} style={{flex:1,padding:'9px 0',border:'1px solid #e5e7eb',borderRadius:8,cursor:'pointer',background:'#fff'}}>Cancel</button>
              <button onClick={saveStockEdit} disabled={!editStockComment.trim()||editStockSaving} style={{flex:1,padding:'9px 0',border:'none',borderRadius:8,cursor:'pointer',background:editStockComment.trim()?'#111':'#d1d5db',color:'#fff',fontSize:14,fontWeight:600}}>{editStockSaving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {editTO&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div style={{background:'#fff',borderRadius:12,padding:28,width:500,boxShadow:'0 20px 60px rgba(0,0,0,0.15)',maxHeight:'90vh',overflow:'auto'}}>
            <h3 style={{fontSize:16,fontWeight:700,marginBottom:4}}>Edit Transfer Order</h3>
            <p style={{fontSize:12,color:'#9ca3af',marginBottom:20}}>{editTO.to_number||'No TO number'}</p>
            {([{label:'TO Number',field:'to_number',type:'text'},{label:'Destination',field:'destination',type:'select',opts:DESTINATIONS},{label:'SKU',field:'sku',type:'sku'},{label:'Qty',field:'qty',type:'number'},{label:'Pick Up Date',field:'pick_up_date',type:'date'},{label:'ETA',field:'eta_destination',type:'date'},{label:'Shipping Method',field:'shipping_method',type:'select',opts:SHIPPING_METHODS},{label:'Status',field:'status',type:'select',opts:STATUSES_TO}] as any[]).map(({label,field,type,opts})=>(
              <div key={field} style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:4}}>{label}</label>
                {type==='select'?<select value={(toEdits as any)[field]??''} onChange={e=>setToEdits(p=>({...p,[field]:e.target.value}))} style={{width:'100%',padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,boxSizing:'border-box'}}>{opts.map((o:string)=><option key={o} value={o}>{o}</option>)}</select>
                :type==='sku'?<select value={(toEdits as any)[field]??''} onChange={e=>setToEdits(p=>({...p,[field]:e.target.value}))} style={{width:'100%',padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,boxSizing:'border-box'}}>{skus.map(s=><option key={s.id} value={s.id}>{s.id}</option>)}</select>
                :<input type={type} value={(toEdits as any)[field]??''} onChange={e=>setToEdits(p=>({...p,[field]:type==='number'?parseInt(e.target.value)||0:e.target.value}))} style={{width:'100%',padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,boxSizing:'border-box'}} />}
              </div>
            ))}
            <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:4}}>Comment <span style={{color:'#9ca3af',fontWeight:400}}>(required)</span></label>
            <textarea value={toEditComment} onChange={e=>setToEditComment(e.target.value)} rows={2} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,resize:'vertical',marginBottom:20,boxSizing:'border-box'}} />
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setEditTO(null)} style={{flex:1,padding:'9px 0',border:'1px solid #e5e7eb',borderRadius:8,cursor:'pointer',background:'#fff'}}>Cancel</button>
              <button onClick={saveToEdit} disabled={!toEditComment.trim()||toEditSaving} style={{flex:1,padding:'9px 0',border:'none',borderRadius:8,cursor:'pointer',background:toEditComment.trim()?'#111':'#d1d5db',color:'#fff',fontSize:14,fontWeight:600}}>{toEditSaving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {editUE&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div style={{background:'#fff',borderRadius:12,padding:28,width:440,boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
            <h3 style={{fontSize:16,fontWeight:700,marginBottom:4}}>Edit {editUE.label}</h3>
            <p style={{fontSize:12,color:'#9ca3af',marginBottom:20}}>{editUE.row.sku} · Current: {fmtVal((editUE.row as any)[editUE.key],UE_FIELDS.find(f=>f.key===editUE.key)?.fmt)}</p>
            <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>New Value</label>
            <input type="number" step="0.0001" value={ueNewVal} onChange={e=>setUeNewVal(e.target.value)} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:14,marginBottom:14,boxSizing:'border-box'}} />
            <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Linked TO Number</label>
            <select value={ueTO} onChange={e=>setUeTO(e.target.value)} style={{width:'100%',padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,marginBottom:14,boxSizing:'border-box'}}>
              <option value="">— None —</option>
              {toNumbers.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
            <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>PO Number (optional)</label>
            <input type="text" value={uePO} onChange={e=>setUePO(e.target.value)} style={{width:'100%',padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:6,fontSize:13,marginBottom:14,boxSizing:'border-box'}} />
            <label style={{fontSize:12,fontWeight:500,display:'block',marginBottom:6}}>Reason <span style={{color:'#9ca3af',fontWeight:400}}>(required)</span></label>
            <textarea value={ueReason} onChange={e=>setUeReason(e.target.value)} rows={2} style={{width:'100%',padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,resize:'vertical',marginBottom:20,boxSizing:'border-box'}} />
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setEditUE(null)} style={{flex:1,padding:'9px 0',border:'1px solid #e5e7eb',borderRadius:8,cursor:'pointer',background:'#fff'}}>Cancel</button>
              <button onClick={saveUEEdit} disabled={!ueReason.trim()||ueSaving} style={{flex:1,padding:'9px 0',border:'none',borderRadius:8,cursor:'pointer',background:ueReason.trim()?'#111':'#d1d5db',color:'#fff',fontSize:14,fontWeight:600}}>{ueSaving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {showStockLog&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div style={{background:'#fff',borderRadius:12,padding:28,width:600,maxHeight:'80vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:20}}><h3 style={{fontSize:16,fontWeight:700,margin:0}}>Stock Change Log</h3><button onClick={()=>setShowStockLog(false)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#6b7280'}}>×</button></div>
            {stockLog.length===0?<div style={{color:'#9ca3af',textAlign:'center',padding:40}}>No changes yet.</div>
            :stockLog.map((c:any)=>(
              <div key={c.id} style={{padding:'12px 0',borderBottom:'1px solid #f3f4f6'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontWeight:600}}>{c.sku}</span><span style={{fontSize:12,color:'#9ca3af'}}>{fmtDateTime(c.changed_at)}</span></div>
                <div style={{fontSize:13,marginBottom:4}}>{c.previous_qty?.toLocaleString()} → <strong>{c.new_qty?.toLocaleString()}</strong><span style={{marginLeft:8,fontSize:12,color:c.new_qty>c.previous_qty?'#16a34a':'#dc2626'}}>({c.new_qty>c.previous_qty?'+':''}{(c.new_qty-c.previous_qty).toLocaleString()})</span></div>
                <div style={{fontSize:12,color:'#6b7280',fontStyle:'italic'}}>{c.comment}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCostLog&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}>
          <div style={{background:'#fff',borderRadius:12,padding:28,width:600,maxHeight:'80vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:20}}><h3 style={{fontSize:16,fontWeight:700,margin:0}}>Cost Log — {showCostLog}</h3><button onClick={()=>setShowCostLog(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#6b7280'}}>×</button></div>
            {costLog.length===0?<div style={{color:'#9ca3af',textAlign:'center',padding:40}}>No cost changes yet.</div>
            :costLog.map((c:any)=>(
              <div key={c.id} style={{padding:'12px 0',borderBottom:'1px solid #f3f4f6'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontWeight:600,fontSize:13}}>{c.field_changed}</span><span style={{fontSize:12,color:'#9ca3af'}}>{fmtDateTime(c.changed_at)}</span></div>
                <div style={{fontSize:13,marginBottom:4}}>{c.previous_value!=null?'$'+c.previous_value.toFixed(2):'—'} → <strong>{c.new_value!=null?'$'+c.new_value.toFixed(2):'—'}</strong>{c.to_number&&<span style={{marginLeft:8,fontSize:11,color:'#6b7280'}}>TO: {c.to_number}</span>}{c.po_number&&<span style={{marginLeft:8,fontSize:11,color:'#6b7280'}}>PO: {c.po_number}</span>}</div>
                <div style={{fontSize:12,color:'#6b7280',fontStyle:'italic'}}>{c.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
