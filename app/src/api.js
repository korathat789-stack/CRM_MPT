import { supabase } from './supabase.js'

// ============================================================
// Config (mirrors Config.gs / server.js ENTITIES)
// ============================================================
export const PIPELINE_STAGES = [
  { StageCode: 'NEW_INQUIRY',             StageName: 'New Inquiry',             Probability: 10 },
  { StageCode: 'CONTACTED',               StageName: 'Contacted',               Probability: 20 },
  { StageCode: 'QUALIFIED',               StageName: 'Qualified',               Probability: 30 },
  { StageCode: 'REQUIREMENT_CONFIRMED',   StageName: 'Requirement Confirmed',   Probability: 40 },
  { StageCode: 'QUOTATION',               StageName: 'Quotation',               Probability: 55 },
  { StageCode: 'NEGOTIATION',             StageName: 'Negotiation',             Probability: 65 },
  { StageCode: 'PURCHASE_ORDER_RECEIVED', StageName: 'PO Received',             Probability: 75 },
  { StageCode: 'ORDER_CONFIRMED',         StageName: 'Order Confirmed',         Probability: 80 },
  { StageCode: 'DELIVERY_IMPLEMENTATION', StageName: 'Delivery / Implementation', Probability: 85 },
  { StageCode: 'INVOICED',                StageName: 'Invoiced',                Probability: 90 },
  { StageCode: 'PAYMENT_PENDING',         StageName: 'Payment Pending',         Probability: 92 },
  { StageCode: 'PARTIALLY_PAID',          StageName: 'Partially Paid',          Probability: 95 },
  { StageCode: 'PAID',                    StageName: 'Paid',                    Probability: 100 },
  { StageCode: 'WON',                     StageName: 'Won',                     Probability: 100 },
  { StageCode: 'LOST',                    StageName: 'Lost',                    Probability: 0 },
  { StageCode: 'CANCELLED',               StageName: 'Cancelled',               Probability: 0 },
]

const ENUMS = {
  CustomerType:   ['ราชการ', 'ตัวแทนจำหน่าย', 'ผู้ใช้งาน', 'เอกชน', 'ทั่วไป-ขายต่อ', 'อื่นๆ'],
  CustomerStatus: ['Active', 'Inactive', 'Prospect', 'On Hold'],
  Priority:       ['Low', 'Medium', 'High', 'Critical'],
  ActivityType:   ['Call', 'Email', 'Meeting', 'LINE', 'Site Visit', 'Demo', 'Proposal', 'Follow-up', 'Other'],
  ActivityStatus: ['Open', 'In Progress', 'Completed', 'Cancelled', 'Overdue'],
  DocStatus:      ['Draft', 'Pending Approval', 'Approved', 'Sent', 'Accepted', 'Rejected', 'Cancelled'],
  InvoiceStatus:  ['Draft', 'Issued', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'],
  PaymentStatus:  ['Unpaid', 'Partially Paid', 'Paid'],
  PaymentMethod:  ['Bank Transfer', 'Cash', 'Cheque', 'Credit Card', 'Other'],
}

const ENTITIES = {
  customers: {
    table: 'customers', label: 'ลูกค้า (Customers)',
    codePrefix: 'CUST', codeField: 'CustomerCode', ownerField: 'OwnerUserID',
    fields: ['CustomerCode','CustomerType','CompanyNameTH','CompanyNameEN','TaxID','Industry','Phone','Email','LINE','Address','Province','CustomerStatus','OwnerUserID','CreditTermDays','CreditLimit','Notes'],
    required: ['CompanyNameTH','OwnerUserID'],
    numeric: ['CreditTermDays','CreditLimit'],
    enums: { CustomerType: ENUMS.CustomerType, CustomerStatus: ENUMS.CustomerStatus },
    searchable: ['CustomerCode','CompanyNameTH','CompanyNameEN','TaxID','Phone','Email','Industry'],
  },
  contacts: {
    table: 'contacts', label: 'ผู้ติดต่อ (Contacts)',
    parentField: 'CustomerID',
    fields: ['CustomerID','Prefix','FirstName','LastName','Position','Department','Phone','Mobile','Email','LINE','IsPrimary','Notes'],
    required: ['CustomerID','FirstName'],
    booleans: ['IsPrimary'],
    searchable: ['FirstName','LastName','Position','Phone','Mobile','Email'],
  },
  opportunities: {
    table: 'opportunities', label: 'โอกาสขาย (Opportunities)',
    codePrefix: 'OPP', codeField: 'OpportunityCode', ownerField: 'OwnerUserID', parentField: 'CustomerID',
    fields: ['OpportunityCode','CustomerID','OpportunityName','Source','OwnerUserID','Stage','Probability','EstimatedValue','ExpectedCloseDate','NextFollowUpDate','Competitor','LostReason','Notes'],
    required: ['CustomerID','OpportunityName','OwnerUserID','Stage'],
    numeric: ['Probability','EstimatedValue'],
    enums: { Stage: PIPELINE_STAGES.map(s => s.StageCode) },
    searchable: ['OpportunityCode','OpportunityName','Source','Competitor','Notes'],
  },
  activities: {
    table: 'activities', label: 'กิจกรรม (Activities)',
    ownerField: 'AssignedToUserID', parentField: 'CustomerID',
    fields: ['CustomerID','OpportunityID','ActivityType','Subject','Description','ActivityDate','DueDate','CompletedDate','ActivityStatus','Priority','AssignedToUserID','Outcome'],
    required: ['CustomerID','ActivityType','Subject','ActivityDate','AssignedToUserID'],
    enums: { ActivityType: ENUMS.ActivityType, ActivityStatus: ENUMS.ActivityStatus, Priority: ENUMS.Priority },
    searchable: ['Subject','Description','Outcome'],
  },
  products: {
    table: 'products', label: 'สินค้า (Products)',
    codePrefix: 'PROD', codeField: 'ProductCode',
    fields: ['ProductCode','ProductName','ProductCategory','Unit','StandardPrice','CostPrice','IsActive','Description'],
    required: ['ProductName','Unit'],
    numeric: ['StandardPrice','CostPrice'],
    booleans: ['IsActive'],
    searchable: ['ProductCode','ProductName','ProductCategory','Description'],
  },
  quotations: {
    table: 'quotations', label: 'ใบเสนอราคา (Quotations)',
    codePrefix: 'QT', codeField: 'QuotationNumber', parentField: 'CustomerID',
    fields: ['QuotationNumber','CustomerID','OpportunityID','IssueDate','ExpiryDate','Status','Subtotal','Discount','VAT','GrandTotal','TermsAndConditions'],
    required: ['CustomerID','IssueDate','Status'],
    numeric: ['Subtotal','Discount','VAT','GrandTotal'],
    enums: { Status: ENUMS.DocStatus },
    searchable: ['QuotationNumber','TermsAndConditions'],
    computeTotals: true,
  },
  invoices: {
    table: 'invoices', label: 'ใบแจ้งหนี้ (Invoices)',
    codePrefix: 'INV', codeField: 'InvoiceNumber', parentField: 'CustomerID',
    fields: ['InvoiceNumber','CustomerID','InvoiceDate','DueDate','InvoiceStatus','Subtotal','Discount','VAT','GrandTotal','PaidAmount','OutstandingAmount','PaymentStatus'],
    required: ['CustomerID','InvoiceDate','DueDate','InvoiceStatus'],
    numeric: ['Subtotal','Discount','VAT','GrandTotal','PaidAmount','OutstandingAmount'],
    enums: { InvoiceStatus: ENUMS.InvoiceStatus, PaymentStatus: ENUMS.PaymentStatus },
    searchable: ['InvoiceNumber'],
    computeTotals: true,
  },
  payments: {
    table: 'payments', label: 'การรับเงิน (Payments)',
    codePrefix: 'RCPT', codeField: 'ReceiptNumber', parentField: 'CustomerID',
    fields: ['ReceiptNumber','CustomerID','PaymentDate','PaymentMethod','ReceivedAmount','BankReference','Notes'],
    required: ['CustomerID','PaymentDate','PaymentMethod','ReceivedAmount'],
    numeric: ['ReceivedAmount'],
    enums: { PaymentMethod: ENUMS.PaymentMethod },
    searchable: ['ReceiptNumber','BankReference','Notes'],
  },
}

// ============================================================
// Helpers
// ============================================================
function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function toNum(v, fallback = 0) {
  if (v === null || v === undefined || String(v).trim() === '') return fallback
  const n = Number(String(v).replace(/,/g, ''))
  return isNaN(n) ? fallback : n
}

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === ''
}

// Shared in-memory code counter per session (avoids duplicate codes in the same session)
const _codeCtr = {}
function nextCode(prefix) {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '')
  const key = prefix + ym
  _codeCtr[key] = (_codeCtr[key] || 0) + 1
  return prefix + '-' + ym + '-' + String(_codeCtr[key]).padStart(4, '0')
}

function normalizeRecord(userId, name, input, existing) {
  const cfg = ENTITIES[name]
  const out = existing ? { ...existing } : {}
  cfg.fields.forEach(f => {
    if (Object.prototype.hasOwnProperty.call(input, f)) {
      let v = input[f]
      if (typeof v === 'string') v = v.trim()
      out[f] = v
    } else if (!existing) {
      out[f] = ''
    }
  })
  ;(cfg.numeric || []).forEach(f => { out[f] = toNum(out[f], 0) })
  ;(cfg.booleans || []).forEach(f => { out[f] = Boolean(out[f]) })
  if (cfg.ownerField && isBlank(out[cfg.ownerField])) out[cfg.ownerField] = userId
  if (name === 'opportunities') {
    if (isBlank(out.Stage)) out.Stage = 'NEW_INQUIRY'
    const st = PIPELINE_STAGES.find(s => s.StageCode === out.Stage)
    if (st && isBlank(input.Probability)) out.Probability = st.Probability
    out.Probability = Math.max(0, Math.min(100, toNum(out.Probability, 0)))
  }
  if (cfg.computeTotals) {
    const sub = toNum(out.Subtotal), dis = toNum(out.Discount), vat = toNum(out.VAT)
    out.GrandTotal = Math.max(0, sub - dis + vat)
    if (name === 'invoices') {
      const paid = toNum(out.PaidAmount)
      out.OutstandingAmount = Math.max(0, out.GrandTotal - paid)
      out.PaymentStatus = out.OutstandingAmount === 0 && out.GrandTotal > 0
        ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Unpaid'
    }
  }
  if (name === 'products' && !existing && isBlank(out.IsActive)) out.IsActive = true
  return out
}

function validateRecord(name, rec) {
  const cfg = ENTITIES[name]
  const errors = []
  ;(cfg.required || []).forEach(f => {
    if (isBlank(rec[f])) errors.push({ field: f, message: f + ' is required.' })
  })
  Object.entries(cfg.enums || {}).forEach(([f, vals]) => {
    if (!isBlank(rec[f]) && !vals.includes(rec[f])) {
      errors.push({ field: f, message: 'Invalid value for ' + f + '.' })
    }
  })
  if (errors.length) throw { code: 'VALIDATION_ERROR', message: 'Validation failed.', errors }
}

// ============================================================
// Profile cache (per-page-load)
// ============================================================
let _profile = null
let _authEmail = null

export async function getCachedProfile() {
  if (_profile) return _profile
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  _profile = data ? { ...data, email: user.email } : null
  _authEmail = user.email
  return _profile
}

function clearCache() { _profile = null; _authEmail = null }

// ============================================================
// Authentication
// ============================================================
export async function login(usernameOrEmail, password) {
  let email = usernameOrEmail.trim()

  if (!email.includes('@')) {
    // Look up email by username via a SECURITY DEFINER RPC
    const { data, error } = await supabase.rpc('get_email_by_username', { p_username: email })
    if (error || !data) throw { message: 'Invalid username or password.' }
    email = data
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw { message: 'Invalid username or password.' }
  clearCache()
  return data
}

export async function logout() {
  clearCache()
  await supabase.auth.signOut()
}

// ============================================================
// Bootstrap (replaces GET /api/bootstrap)
// ============================================================
export async function getBootstrap() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw { code: 'UNAUTHENTICATED', message: 'Please sign in.' }

  const profile = await getCachedProfile()
  if (!profile) throw { code: 'UNAUTHENTICATED', message: 'Profile not found.' }

  const isElevated = ['Admin', 'Manager'].includes(profile.Role)
  const isAdmin    = profile.Role === 'Admin'

  const user = {
    userId:              profile.id,
    email:               profile.email,
    username:            profile.Username,
    role:                profile.Role,
    fullName:            profile.FullName || '',
    department:          profile.Department || '',
    mustChangePassword:  profile.MustChangePassword,
  }

  const permissions = {
    canViewAll:         isElevated,
    canManageUsers:     isAdmin,
    canManageSettings:  isAdmin,
    canViewAuditLogs:   isAdmin,
    canDeleteRecords:   isAdmin,
  }

  // Build schemas exposed to the frontend
  const schemas = {}
  Object.entries(ENTITIES).forEach(([name, cfg]) => {
    let fields = [...cfg.fields]
    // Sales reps don't see cost price
    if (profile.Role === 'Sales' && name === 'products') {
      fields = fields.filter(f => f !== 'CostPrice')
    }
    schemas[name] = {
      label:    cfg.label,
      key:      'id',
      fields,
      required: cfg.required  || [],
      numeric:  cfg.numeric   || [],
      booleans: cfg.booleans  || [],
      enums:    cfg.enums     || {},
      canCreate: isElevated || ['customers','contacts','opportunities','activities'].includes(name),
      canDelete: isAdmin,
    }
  })

  // Users for lookups
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, "Username", "FullName", "Role", email')
    .eq('IsActive', true)
    .eq('IsDeleted', false)

  const allUsers = (profilesData || []).map(p => ({
    UserID:   p.id,
    FullName: p.FullName || p.email,
    Email:    p.email,
    Role:     p.Role,
  })).sort((a, b) => a.FullName.localeCompare(b.FullName))

  const lookups = {
    users:          isElevated ? allUsers : allUsers.filter(u => u.UserID === profile.id),
    pipelineStages: PIPELINE_STAGES,
  }

  // Settings
  const { data: settingsData } = await supabase.from('settings').select('*')
  const settingMap = {}
  ;(settingsData || []).forEach(s => { settingMap[s.key] = s.value })
  const settings = {
    appName:     settingMap['APP_NAME']     || 'MATCHPOINT CRM',
    companyName: settingMap['COMPANY_NAME'] || 'MATCHPOINT TECHNOLOGY CO., LTD.',
  }

  // Update last login
  supabase.from('profiles').update({ LastLoginAt: new Date().toISOString() }).eq('id', profile.id).then(() => {})

  return { user, settings, permissions, schemas, lookups }
}

// ============================================================
// Entity CRUD
// ============================================================
export async function listEntity(name, filters = {}) {
  const cfg = ENTITIES[name]
  if (!cfg) throw { message: 'Unknown entity: ' + name }

  const profile = await getCachedProfile()
  const isElevated = ['Admin', 'Manager'].includes(profile?.Role)

  let query = supabase.from(cfg.table).select('*').eq('IsDeleted', false)

  // Ownership filter for sales
  if (!isElevated && cfg.ownerField) {
    query = query.eq(cfg.ownerField, profile.id)
  }

  // Full-text search across searchable fields
  if (filters.query && cfg.searchable?.length) {
    const orParts = cfg.searchable.map(f => `${f}.ilike.%${filters.query}%`).join(',')
    query = query.or(orParts)
  }

  query = query.order('UpdatedAt', { ascending: false })

  const { data, error } = await query
  if (error) throw { message: error.message }

  const all    = data || []
  const page     = Math.max(1, parseInt(filters.page)     || 1)
  const pageSize = Math.max(1, parseInt(filters.pageSize) || 25)
  const total    = all.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start    = (page - 1) * pageSize

  return { items: all.slice(start, start + pageSize), page, pageSize, total, totalPages }
}

export async function getEntityRecord(name, id) {
  const cfg = ENTITIES[name]
  const { data, error } = await supabase.from(cfg.table).select('*').eq('id', id).single()
  if (error || !data || data.IsDeleted) throw { code: 'NOT_FOUND', message: cfg.label + ' not found.' }
  return data
}

export async function saveEntityRecord(name, input) {
  const profile = await getCachedProfile()
  const cfg    = ENTITIES[name]
  const isUpdate = !isBlank(input.id)

  let existing = null
  if (isUpdate) existing = await getEntityRecord(name, input.id)

  const rec = normalizeRecord(profile.id, name, input, existing)
  validateRecord(name, rec)

  const now = nowIso()
  if (isUpdate) {
    rec.UpdatedAt      = now
    rec.UpdatedBy      = profile.email
    rec.RecordVersion  = (parseInt(existing.RecordVersion) || 0) + 1
    const { data, error } = await supabase.from(cfg.table).update(rec).eq('id', input.id).select().single()
    if (error) throw { message: error.message }
    _logAudit('UPDATE', name, input.id, profile.email)
    return data
  } else {
    if (cfg.codeField && isBlank(rec[cfg.codeField])) rec[cfg.codeField] = nextCode(cfg.codePrefix)
    rec.CreatedAt     = now
    rec.CreatedBy     = profile.email
    rec.UpdatedAt     = now
    rec.UpdatedBy     = profile.email
    rec.RecordVersion = 1
    rec.IsDeleted     = false
    const { data, error } = await supabase.from(cfg.table).insert(rec).select().single()
    if (error) throw { message: error.message }
    _logAudit('CREATE', name, data.id, profile.email)
    return data
  }
}

export async function deleteEntityRecord(name, id) {
  const profile = await getCachedProfile()
  if (profile.Role !== 'Admin') throw { code: 'ACCESS_DENIED', message: 'Only Admins can delete records.' }
  const cfg = ENTITIES[name]
  const { error } = await supabase.from(cfg.table)
    .update({ IsDeleted: true, UpdatedAt: nowIso(), UpdatedBy: profile.email })
    .eq('id', id)
  if (error) throw { message: error.message }
  _logAudit('DELETE', name, id, profile.email)
}

// ============================================================
// Dashboard
// ============================================================
export async function getDashboard(filters = {}) {
  const profile    = await getCachedProfile()
  const isElevated = ['Admin','Manager'].includes(profile?.Role)

  let custQ = supabase.from('customers').select('id, "OwnerUserID"').eq('IsDeleted', false)
  let oppQ  = supabase.from('opportunities').select('*').eq('IsDeleted', false)
  let actQ  = supabase.from('activities').select('id, "ActivityStatus", "DueDate", "AssignedToUserID"').eq('IsDeleted', false)
  let invQ  = supabase.from('invoices').select('id, "OutstandingAmount", "DueDate", "CustomerID", "InvoiceNumber", "GrandTotal", "PaymentStatus"').eq('IsDeleted', false)
  let payQ  = supabase.from('payments').select('"ReceivedAmount", "PaymentDate"').eq('IsDeleted', false)

  if (!isElevated) {
    custQ = custQ.eq('OwnerUserID', profile.id)
    oppQ  = oppQ.eq('OwnerUserID', profile.id)
    actQ  = actQ.eq('AssignedToUserID', profile.id)
  }
  if (filters.stage)       oppQ = oppQ.eq('Stage', filters.stage)
  if (filters.ownerUserId) oppQ = oppQ.eq('OwnerUserID', filters.ownerUserId)

  const [custRes, oppRes, actRes, invRes, payRes] = await Promise.all([custQ, oppQ, actQ, invQ, payQ])

  const customers     = custRes.data || []
  const opportunities = oppRes.data  || []
  const activities    = actRes.data  || []
  const invoices      = invRes.data  || []
  const payments      = payRes.data  || []

  const pipelineByStage = {}, valueByStage = {}
  let totalPipelineValue = 0, weightedPipelineValue = 0, wonValue = 0, lostValue = 0
  opportunities.forEach(o => {
    const v = toNum(o.EstimatedValue), p = toNum(o.Probability)
    totalPipelineValue    += v
    weightedPipelineValue += v * p / 100
    pipelineByStage[o.Stage] = (pipelineByStage[o.Stage] || 0) + 1
    valueByStage[o.Stage]    = (valueByStage[o.Stage]    || 0) + v
    if (o.Stage === 'WON')  wonValue  += v
    if (o.Stage === 'LOST') lostValue += v
  })

  const today = new Date().toISOString().slice(0, 10)
  const overdueInvoices  = invoices.filter(i => toNum(i.OutstandingAmount) > 0 && i.DueDate && i.DueDate < today)
  const overdueActivities = activities.filter(a => a.ActivityStatus !== 'Completed' && a.DueDate && a.DueDate < today)

  const collectionByMonth = {}
  payments.forEach(p => {
    const month = String(p.PaymentDate || '').slice(0, 7) || 'Unknown'
    collectionByMonth[month] = (collectionByMonth[month] || 0) + toNum(p.ReceivedAmount)
  })

  const topOpportunities = [...opportunities]
    .sort((a, b) => toNum(b.EstimatedValue) - toNum(a.EstimatedValue))
    .slice(0, 12)

  return {
    kpis: {
      customers:            customers.length,
      opportunities:        opportunities.length,
      totalPipelineValue,
      weightedPipelineValue,
      wonValue,
      lostValue,
      openActivities:       activities.filter(a => a.ActivityStatus !== 'Completed').length,
      overdueActivities:    overdueActivities.length,
      overdueInvoices:      overdueInvoices.length,
      outstandingAmount:    invoices.reduce((s, i) => s + toNum(i.OutstandingAmount), 0),
      collectedAmount:      payments.reduce((s, p) => s + toNum(p.ReceivedAmount), 0),
    },
    pipelineByStage,
    valueByStage,
    collectionByMonth,
    topOpportunities,
    overdueInvoices:  overdueInvoices.slice(0, 10),
    overdueActivities: overdueActivities.slice(0, 10),
  }
}

// ============================================================
// Reports
// ============================================================
export async function getReport(type, filters = {}) {
  const big = { ...filters, pageSize: 1000, page: 1 }
  if (type === 'pipeline') {
    const { items } = await listEntity('opportunities', big)
    return {
      headers: ['OpportunityCode','OpportunityName','Stage','Probability','EstimatedValue','ExpectedCloseDate'],
      rows: items,
    }
  }
  if (type === 'collections') {
    const { items } = await listEntity('invoices', big)
    return {
      headers: ['InvoiceNumber','InvoiceDate','DueDate','GrandTotal','PaidAmount','OutstandingAmount','PaymentStatus'],
      rows: items,
    }
  }
  if (type === 'activities') {
    const { items } = await listEntity('activities', big)
    return {
      headers: ['ActivityDate','DueDate','ActivityType','Subject','ActivityStatus','Priority'],
      rows: items,
    }
  }
  throw { message: 'Invalid report type.' }
}

// ============================================================
// Users
// ============================================================
export async function getUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, "Username", "FullName", "Role", "Department", "IsActive", "MustChangePassword", "LastLoginAt", email')
    .eq('IsDeleted', false)
    .order('FullName')
  if (error) throw { message: error.message }
  return (data || []).map(p => ({
    id:                 p.id,
    Email:              p.email,
    Username:           p.Username,
    FullName:           p.FullName || '',
    Role:               p.Role,
    Department:         p.Department || '',
    IsActive:           p.IsActive,
    MustChangePassword: p.MustChangePassword,
    LastLoginAt:        p.LastLoginAt,
  }))
}

export async function saveUser(userData) {
  const profile = await getCachedProfile()
  if (profile.Role !== 'Admin') throw { code: 'ACCESS_DENIED', message: 'Only Admins can manage users.' }

  const { data, error } = await supabase.functions.invoke('manage-user', { body: userData })
  if (error) throw { message: error.message }
  if (!data?.success) throw { message: data?.message || 'User save failed.' }
  return data.data
}

export async function deactivateUser(email) {
  const profile = await getCachedProfile()
  if (profile.Role !== 'Admin') throw { code: 'ACCESS_DENIED', message: 'Only Admins can manage users.' }
  const { error } = await supabase
    .from('profiles')
    .update({ IsActive: false, UpdatedAt: nowIso() })
    .eq('email', email.toLowerCase())
  if (error) throw { message: error.message }
}

// ============================================================
// Settings
// ============================================================
export async function getSettings() {
  const { data, error } = await supabase.from('settings').select('*')
  if (error) throw { message: error.message }
  const result = {}
  ;(data || []).forEach(s => { result[s.key] = s.value })
  return result
}

export async function saveSetting(key, value) {
  const profile = await getCachedProfile()
  if (profile.Role !== 'Admin') throw { code: 'ACCESS_DENIED', message: 'Only Admins can change settings.' }
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw { message: error.message }
}

// ============================================================
// Audit logs
// ============================================================
async function _logAudit(action, entityType, entityId, userEmail) {
  try {
    await supabase.from('audit_logs').insert({
      Timestamp:  new Date().toISOString(),
      UserEmail:  userEmail,
      Action:     action,
      EntityType: entityType,
      EntityID:   entityId,
    })
  } catch (_) {}
}

export async function getAuditLogs(filters = {}) {
  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('Timestamp', { ascending: false })
    .limit(200)

  if (filters.query) {
    query = query.or(
      `UserEmail.ilike.%${filters.query}%,Action.ilike.%${filters.query}%,EntityType.ilike.%${filters.query}%`
    )
  }
  const { data, error } = await query
  if (error) throw { message: error.message }
  return { items: data || [] }
}
