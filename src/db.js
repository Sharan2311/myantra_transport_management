// ─── db.js — all Supabase read/write operations ────────────────────────────
import { supabase } from './supabase.js'

const tripFromDB = r => ({
  id: r.id, type: r.type, lrNo: r.lr_no, diNo: r.di_no, truckNo: r.truck_no,
  grNo: r.gr_no, consignee: r.consignee, from: r.from, to: r.to, grade: r.grade,
  client: r.client || 'Shree Cement Kodla',
  qty: +r.qty, bags: +r.bags, frRate: +r.fr_rate, givenRate: +r.given_rate,
  date: r.date, advance: +r.advance, shortage: +r.shortage, tafal: +r.tafal,
  shortageRecovery: +(r.shortage_recovery||0), loanRecovery: +(r.loan_recovery||0),
  dieselEstimate: +r.diesel_estimate, status: r.status, invoiceNo: r.invoice_no,
  paymentStatus: r.payment_status, driverSettled: r.driver_settled,
  settledBy: r.settled_by, netPaid: +r.net_paid, billedBy: r.billed_by,
  billedAt: r.billed_at, editedBy: r.edited_by, editedAt: r.edited_at,
  createdBy: r.created_by, createdAt: r.created_at,
  diLines: r.di_lines || [],
  dieselIndentNo: r.diesel_indent_no || "",
  lr: r.lr || r.lr_no || "",
  truck: r.truck || r.truck_no || "",
  billedToShree: +(r.billed_to_shree||0),
  invoiceDate: r.invoice_date || "",
  paidAmount: +(r.paid_amount||0),
  paymentDate: r.payment_date || "",
  utr: r.utr_shree || "",
  shreeStatus: r.shree_status || "pending",
  shreeShortage: r.shree_shortage || null,
  frtRate: +(r.fr_rate||0),
  orderType: r.order_type || 'godown',
  grFilePath: r.gr_file_path || '',
  invoiceFilePath: r.invoice_file_path || '',
  mergedPdfPath: r.merged_pdf_path || '',
  receiptFilePath: r.receipt_file_path || '',
  receiptUploadedAt: r.receipt_uploaded_at || '',
  district: r.district || '',
  state: r.state || '',
  emailSentAt: r.email_sent_at || '',
  partyEmail: r.party_email || '',
  batchId: r.batch_id || '',
  sealedInvoicePath: r.sealed_invoice_path || '',
  cashEmpId: r.cash_emp_id || '',
})
const tripToDB = t => ({
  id: t.id, type: t.type, lr_no: t.lrNo, di_no: t.diNo, truck_no: t.truckNo,
  gr_no: t.grNo, consignee: t.consignee, from: t.from, to: t.to, grade: t.grade,
  client: t.client || 'Shree Cement Kodla',
  qty: t.qty, bags: t.bags, fr_rate: t.frRate, given_rate: t.givenRate,
  date: t.date, advance: t.advance, shortage: t.shortage, tafal: t.tafal,
  shortage_recovery: t.shortageRecovery||0, loan_recovery: t.loanRecovery||0,
  diesel_estimate: t.dieselEstimate, status: t.status, invoice_no: t.invoiceNo,
  payment_status: t.paymentStatus, driver_settled: t.driverSettled,
  settled_by: t.settledBy, net_paid: t.netPaid, billed_by: t.billedBy,
  billed_at: t.billedAt, edited_by: t.editedBy, edited_at: t.editedAt,
  created_by: t.createdBy, created_at: t.createdAt,
  di_lines: t.diLines || [],
  diesel_indent_no: t.dieselIndentNo || "",
  lr: t.lr || t.lrNo || "",
  truck: t.truck || t.truckNo || "",
  billed_to_shree: t.billedToShree || 0,
  invoice_no_shree: t.invoiceNo || "",
  invoice_date: t.invoiceDate || "",
  paid_amount: t.paidAmount || 0,
  payment_date: t.paymentDate || "",
  utr_shree: t.utr || "",
  shree_status: t.shreeStatus || t.status || "pending",
  shree_shortage: t.shortage && typeof t.shortage === 'object' ? t.shortage : null,
  order_type: t.orderType || 'godown',
  gr_file_path: t.grFilePath || '',
  invoice_file_path: t.invoiceFilePath || '',
  merged_pdf_path: t.mergedPdfPath || '',
  receipt_file_path: t.receiptFilePath || '',
  receipt_uploaded_at: t.receiptUploadedAt || '',
  district: t.district || '',
  state: t.state || '',
  email_sent_at: t.emailSentAt || '',
  party_email: t.partyEmail || '',
  batch_id: t.batchId || '',
  sealed_invoice_path: t.sealedInvoicePath || '',
  cash_emp_id: t.cashEmpId || '',
})

const vehicleFromDB = r => ({
  id: r.id, truckNo: r.truck_no, ownerName: r.owner_name, phone: r.phone,
  accountNo: r.account_no||"", ifsc: r.ifsc||"",
  driverName: r.driver_name||"", driverPhone: r.driver_phone||"", driverLicense: r.driver_license||"",
  loan: +r.loan, loanRecovered: +r.loan_recovered, deductPerTrip: +r.deduct_per_trip,
  tafalExempt: r.tafal_exempt, shortageOwed: +(r.shortage_owed||0),
  shortageRecovered: +(r.shortage_recovered||0), createdBy: r.created_by,
  loanTxns: r.loan_txns||[], shortageTxns: r.shortage_txns||[],
})
const vehicleToDB = v => ({
  id: v.id, truck_no: v.truckNo, owner_name: v.ownerName, phone: v.phone,
  account_no: v.accountNo||"", ifsc: v.ifsc||"",
  driver_name: v.driverName||"", driver_phone: v.driverPhone||"", driver_license: v.driverLicense||"",
  loan: v.loan, loan_recovered: v.loanRecovered, deduct_per_trip: v.deductPerTrip,
  tafal_exempt: v.tafalExempt, shortage_owed: v.shortageOwed||0,
  shortage_recovered: v.shortageRecovered||0, created_by: v.createdBy,
  loan_txns: v.loanTxns||[], shortage_txns: v.shortageTxns||[],
})

const employeeFromDB = r => ({
  id: r.id, name: r.name, phone: r.phone, role: r.role,
  loan: +r.loan, loanRecovered: +r.loan_recovered,
  linkedTrucks: r.linked_trucks||[], createdBy: r.created_by,
})
const employeeToDB = e => ({
  id: e.id, name: e.name, phone: e.phone, role: e.role,
  loan: e.loan, loan_recovered: e.loanRecovered,
  linked_trucks: e.linkedTrucks||[], created_by: e.createdBy,
})

const paymentFromDB = r => ({
  id: r.id, invoiceNo: r.invoice_no, date: r.date, totalBill: +r.total_bill,
  tds: +r.tds, gstHold: +(r.gst_hold||r.hold||0), hold: +(r.gst_hold||r.hold||0),
  shortageTotal: +(r.shortage_total||0), shortageLines: r.shortage_lines||[],
  otherDeduct: +(r.other_deduct||0), otherDeductLabel: r.other_deduct_label||'',
  paid: +r.paid, utr: r.utr, createdBy: r.created_by, createdAt: r.created_at,
  totalPaid: +(r.total_paid||r.paid||0),
  totalBilled: +(r.total_billed||r.total_bill||0),
  tdsDeducted: +(r.tds_deducted||r.tds||0),
  holdAmount: +(r.hold_amount||r.gst_hold||r.hold||0),
  paymentDate: r.payment_date||r.date||"",
  invoices: r.invoices||[], shortages: r.shortages||[], penalties: r.penalties||[],
  expenses: r.expenses||[],
})
const paymentToDB = p => ({
  id: p.id, invoice_no: p.invoiceNo, date: p.date||p.paymentDate, total_bill: p.totalBill||p.totalBilled||0,
  tds: p.tds||p.tdsDeducted||0, gst_hold: p.gstHold||p.holdAmount||0, hold: p.gstHold||p.holdAmount||0,
  shortage_total: p.shortageTotal||0, shortage_lines: p.shortageLines||[],
  other_deduct: p.otherDeduct||0, other_deduct_label: p.otherDeductLabel||'',
  paid: p.paid||p.totalPaid||0, utr: p.utr, created_by: p.createdBy, created_at: p.createdAt,
  total_paid: p.totalPaid||p.paid||0, total_billed: p.totalBilled||p.totalBill||0,
  tds_deducted: p.tdsDeducted||p.tds||0, hold_amount: p.holdAmount||p.gstHold||0,
  payment_date: p.paymentDate||p.date||"",
  invoices: p.invoices||[], shortages: p.shortages||[], penalties: p.penalties||[],
  expenses: p.expenses||[],
})

const settlementFromDB = r => ({
  id: r.id, tripId: r.trip_id, date: r.date, truckNo: r.truck_no,
  lrNo: r.lr_no, grNo: r.gr_no, to: r.to, qty: +r.qty, givenRate: +r.given_rate,
  ownerName: r.owner_name, gross: +r.gross, tafal: +r.tafal,
  loanDeduct: +r.loan_deduct, diesel: +r.diesel, advance: +r.advance,
  shortage: +r.shortage, net: +r.net, notes: r.notes,
  settledBy: r.settled_by, settledAt: r.settled_at,
})
const settlementToDB = s => ({
  id: s.id, trip_id: s.tripId, date: s.date, truck_no: s.truckNo,
  lr_no: s.lrNo, gr_no: s.grNo, to: s.to, qty: s.qty, given_rate: s.givenRate,
  owner_name: s.ownerName, gross: s.gross, tafal: s.tafal,
  loan_deduct: s.loanDeduct, diesel: s.diesel, advance: s.advance,
  shortage: s.shortage, net: s.net, notes: s.notes,
  settled_by: s.settledBy, settled_at: s.settledAt,
})

const pumpFromDB = r => ({
  id: r.id, name: r.name, contact: r.contact, address: r.address,
  accountNo: r.account_no, ifsc: r.ifsc, createdBy: r.created_by,
})
const pumpToDB = p => ({
  id: p.id, name: p.name, contact: p.contact, address: p.address,
  account_no: p.accountNo, ifsc: p.ifsc, created_by: p.createdBy,
})

const indentFromDB = r => ({
  id: r.id, pumpId: r.pump_id, truckNo: r.truck_no, tripId: r.trip_id,
  indentNo: r.indent_no, date: r.date, litres: +r.litres,
  ratePerLitre: +r.rate_per_litre, amount: +r.amount,
  confirmed: r.confirmed, paid: r.paid, paidDate: r.paid_date,
  paidRef: r.paid_ref, createdBy: r.created_by, createdAt: r.created_at,
  unmatched: r.unmatched||false, truckMismatch: r.truck_mismatch||false,
  amountMismatch: r.amount_mismatch||false, indentMismatch: r.indent_mismatch||false,
  pumpTotal: +(r.pump_total||0), estDiesel: +(r.est_diesel||0),
  alertDismissed: r.alert_dismissed||false, dismissReason: r.dismiss_reason||"",
  dismissedBy: r.dismissed_by||"", dismissedAt: r.dismissed_at||"",
})
const indentToDB = i => ({
  id: i.id, pump_id: i.pumpId, truck_no: i.truckNo, trip_id: i.tripId||null,
  indent_no: i.indentNo, date: i.date, litres: i.litres,
  rate_per_litre: i.ratePerLitre, amount: i.amount,
  confirmed: i.confirmed, paid: i.paid, paid_date: i.paidDate||'',
  paid_ref: i.paidRef||'', created_by: i.createdBy, created_at: i.createdAt,
  unmatched: i.unmatched||false, truck_mismatch: i.truckMismatch||false,
  amount_mismatch: i.amountMismatch||false, indent_mismatch: i.indentMismatch||false,
  pump_total: i.pumpTotal||0, est_diesel: i.estDiesel||0,
  alert_dismissed: i.alertDismissed||false, dismiss_reason: i.dismissReason||"",
  dismissed_by: i.dismissedBy||"", dismissed_at: i.dismissedAt||"",
})

const driverPayFromDB = r => ({
  id: r.id, tripId: r.trip_id, truckNo: r.truck_no, lrNo: r.lr_no,
  amount: +r.amount, utr: r.utr, date: r.date, notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at,
})
const driverPayToDB = p => ({
  id: p.id, trip_id: p.tripId, truck_no: p.truckNo, lr_no: p.lrNo,
  amount: p.amount, utr: p.utr, date: p.date, notes: p.notes,
  created_by: p.createdBy, created_at: p.createdAt,
})

const expenseFromDB = r => ({
  id: r.id, date: r.date, label: r.label, amount: +r.amount,
  category: r.category, notes: r.notes, utr: r.utr||'',
  createdBy: r.created_by, createdAt: r.created_at,
})
const expenseToDB = e => ({
  id: e.id, date: e.date, label: e.label, amount: e.amount,
  category: e.category, notes: e.notes||'', utr: e.utr||'',
  created_by: e.createdBy, created_at: e.createdAt,
})

const gstFromDB = r => ({
  id: r.id, date: r.date, invoiceRef: r.invoice_ref, amount: +r.amount,
  utr: r.utr, notes: r.notes, createdBy: r.created_by, createdAt: r.created_at,
})
const gstToDB = g => ({
  id: g.id, date: g.date, invoice_ref: g.invoiceRef, amount: g.amount,
  utr: g.utr, notes: g.notes||'', created_by: g.createdBy, created_at: g.createdAt,
})

// ── Cash Transfers (employee wallet) ─────────────────────────────────────────
const cashTransferFromDB = r => ({
  id: r.id, empId: r.emp_id, amount: +r.amount,
  date: r.date, note: r.note||'', lrNo: r.lr_no||'', tripId: r.trip_id||'',
  utr: r.utr||'', createdBy: r.created_by, createdAt: r.created_at,
})
const cashTransferToDB = t => ({
  id: t.id, emp_id: t.empId, amount: t.amount,
  date: t.date, note: t.note||'', lr_no: t.lrNo||'', trip_id: t.tripId||null,
  utr: t.utr||'', created_by: t.createdBy, created_at: t.createdAt,
})

const activityFromDB = r => ({
  id: r.id, user: r.user, role: r.role,
  action: r.action, detail: r.detail, time: r.time,
})
const activityToDB = a => ({
  id: a.id, user: a.user, role: a.role,
  action: a.action, detail: a.detail, time: a.time,
})

const userFromDB = r => ({
  id: r.id, name: r.name, username: r.username, pin: r.pin,
  role: r.role, active: r.active, createdAt: r.created_at,
})
const userToDB = u => ({
  id: u.id, name: u.name, username: u.username, pin: u.pin,
  role: u.role, active: u.active, created_at: u.createdAt,
})

const pumpPaymentFromDB = r => ({
  id: r.id, pumpId: r.pump_id, amount: +(r.amount||0),
  utr: r.utr||"", date: r.date||"", note: r.note||"",
  createdBy: r.created_by, createdAt: r.created_at,
})
const pumpPaymentToDB = p => ({
  id: p.id, pump_id: p.pumpId, amount: p.amount,
  utr: p.utr||"", date: p.date||"", note: p.note||"",
  created_by: p.createdBy, created_at: p.createdAt,
})

const fetchAll = async (table, fromDB) => {
  const { data, error } = await supabase.from(table).select('*').order('id')
  if (error) throw error
  return (data||[]).map(fromDB)
}
const upsertOne = async (table, toDB, record) => {
  const { error } = await supabase.from(table).upsert(toDB(record))
  if (error) throw error
}
const deleteOne = async (table, id) => {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

export const DB = {
  getUsers:       () => fetchAll('mye_users', userFromDB),
  saveUser:       u  => upsertOne('mye_users', userToDB, u),

  // By default loads last 90 days only — pass fromDate=null to load all
  getTrips: async (fromDate) => {
    const cutoff = fromDate !== null
      ? fromDate
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let q = supabase.from('mye_trips').select('*').order('date', {ascending: false}).order('id');
    if (cutoff) q = q.gte('date', cutoff);
    const { data, error } = await q;
    if (error) throw error;
    return (data||[]).map(tripFromDB);
  },
  getTripsAll: async () => {
    const { data, error } = await supabase.from('mye_trips').select('*').order('date', {ascending: false}).order('id');
    if (error) throw error;
    return (data||[]).map(tripFromDB);
  },
  saveTrip:       t  => upsertOne('mye_trips', tripToDB, t),
  deleteTrip:     id => deleteOne('mye_trips', id),
  saveManyTrips:  async (trips) => {
    const { error } = await supabase.from('mye_trips').upsert(trips.map(tripToDB))
    if (error) throw error
  },

  getVehicles:    () => fetchAll('mye_vehicles', vehicleFromDB),
  saveVehicle:    v  => upsertOne('mye_vehicles', vehicleToDB, v),
  deleteVehicle:  id => deleteOne('mye_vehicles', id),

  getEmployees:   () => fetchAll('mye_employees', employeeFromDB),
  saveEmployee:   e  => upsertOne('mye_employees', employeeToDB, e),
  deleteEmployee: id => deleteOne('mye_employees', id),

  getPayments:    () => fetchAll('mye_payments', paymentFromDB),
  savePayment:    p  => upsertOne('mye_payments', paymentToDB, p),
  deletePayment:  id => deleteOne('mye_payments', id),

  getSettlements: () => fetchAll('mye_settlements', settlementFromDB),
  saveSettlement: s  => upsertOne('mye_settlements', settlementToDB, s),

  getPumps:          () => fetchAll('mye_pumps', pumpFromDB),
  savePump:          p  => upsertOne('mye_pumps', pumpToDB, p),

  getPumpPayments: async () => {
    try { return await fetchAll('mye_pump_payments', pumpPaymentFromDB); }
    catch(e) { console.warn('mye_pump_payments not ready:', e.message); return []; }
  },
  savePumpPayment:   p  => upsertOne('mye_pump_payments', pumpPaymentToDB, p),
  deletePumpPayment: id => deleteOne('mye_pump_payments', id),

  getIndents:      () => fetchAll('mye_indents', indentFromDB),
  saveIndent:      i  => upsertOne('mye_indents', indentToDB, i),
  deleteIndent:    id => deleteOne('mye_indents', id),
  saveManyIndents: async (indents) => {
    const { error } = await supabase.from('mye_indents').upsert(indents.map(indentToDB))
    if (error) throw error
  },

  getDriverPays:   () => fetchAll('mye_driver_payments', driverPayFromDB),
  saveDriverPay:   p  => upsertOne('mye_driver_payments', driverPayToDB, p),
  deleteDriverPay: id => deleteOne('mye_driver_payments', id),

  getExpenses:     () => fetchAll('mye_expenses', expenseFromDB),
  saveExpense:     e  => upsertOne('mye_expenses', expenseToDB, e),

  getGstReleases:  () => fetchAll('mye_gst_releases', gstFromDB),
  saveGstRelease:  g  => upsertOne('mye_gst_releases', gstToDB, g),
  deleteGstRelease:id => deleteOne('mye_gst_releases', id),

  // Cash Transfers — employee wallet (credits + advance deductions)
  getCashTransfers: async () => {
    try { return await fetchAll('mye_cash_transfers', cashTransferFromDB); }
    catch(e) { console.warn('mye_cash_transfers not ready:', e.message); return []; }
  },
  saveCashTransfer:   t  => upsertOne('mye_cash_transfers', cashTransferToDB, t),
  deleteCashTransfer: id => deleteOne('mye_cash_transfers', id),

  getActivity: async () => {
    const { data, error } = await supabase
      .from('mye_activity').select('*')
      .order('time', { ascending: false }).limit(200)
    if (error) throw error
    return (data||[]).map(activityFromDB)
  },
  logActivity: a => upsertOne('mye_activity', activityToDB, a),

  getSettings: async () => {
    const { data } = await supabase.from('mye_settings').select('*').eq('key','app_settings').single()
    return data?.value || { tafalPerTrip: 300 }
  },
  saveSettings: async (val) => {
    const { error } = await supabase.from('mye_settings').upsert({ key: 'app_settings', value: val })
    if (error) throw error
  },
}
