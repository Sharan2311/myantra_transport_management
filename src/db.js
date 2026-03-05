// ─── db.js — all Supabase read/write operations ────────────────────────────
import { supabase } from './supabase.js'

// ── field mappers (DB snake_case ↔ App camelCase) ──────────────────────────

const tripFromDB = r => ({
  id: r.id, type: r.type, lrNo: r.lr_no, diNo: r.di_no, truckNo: r.truck_no,
  grNo: r.gr_no, consignee: r.consignee, from: r.from, to: r.to, grade: r.grade,
  qty: +r.qty, bags: +r.bags, frRate: +r.fr_rate, givenRate: +r.given_rate,
  date: r.date, advance: +r.advance, shortage: +r.shortage, tafal: +r.tafal,
  dieselEstimate: +r.diesel_estimate, status: r.status, invoiceNo: r.invoice_no,
  paymentStatus: r.payment_status, driverSettled: r.driver_settled,
  settledBy: r.settled_by, netPaid: +r.net_paid, billedBy: r.billed_by,
  billedAt: r.billed_at, editedBy: r.edited_by, editedAt: r.edited_at,
  createdBy: r.created_by, createdAt: r.created_at,
})
const tripToDB = t => ({
  id: t.id, type: t.type, lr_no: t.lrNo, di_no: t.diNo, truck_no: t.truckNo,
  gr_no: t.grNo, consignee: t.consignee, from: t.from, to: t.to, grade: t.grade,
  qty: t.qty, bags: t.bags, fr_rate: t.frRate, given_rate: t.givenRate,
  date: t.date, advance: t.advance, shortage: t.shortage, tafal: t.tafal,
  diesel_estimate: t.dieselEstimate, status: t.status, invoice_no: t.invoiceNo,
  payment_status: t.paymentStatus, driver_settled: t.driverSettled,
  settled_by: t.settledBy, net_paid: t.netPaid, billed_by: t.billedBy,
  billed_at: t.billedAt, edited_by: t.editedBy, edited_at: t.editedAt,
  created_by: t.createdBy, created_at: t.createdAt,
})

const vehicleFromDB = r => ({
  id: r.id, truckNo: r.truck_no, ownerName: r.owner_name, phone: r.phone,
  loan: +r.loan, loanRecovered: +r.loan_recovered, deductPerTrip: +r.deduct_per_trip,
  tafalExempt: r.tafal_exempt, shortageOwed: +(r.shortage_owed||0),
  shortageRecovered: +(r.shortage_recovered||0), createdBy: r.created_by,
})
const vehicleToDB = v => ({
  id: v.id, truck_no: v.truckNo, owner_name: v.ownerName, phone: v.phone,
  loan: v.loan, loan_recovered: v.loanRecovered, deduct_per_trip: v.deductPerTrip,
  tafal_exempt: v.tafalExempt, shortage_owed: v.shortageOwed||0,
  shortage_recovered: v.shortageRecovered||0, created_by: v.createdBy,
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
})
const paymentToDB = p => ({
  id: p.id, invoice_no: p.invoiceNo, date: p.date, total_bill: p.totalBill,
  tds: p.tds, gst_hold: p.gstHold||0, hold: p.gstHold||0,
  shortage_total: p.shortageTotal||0, shortage_lines: p.shortageLines||[],
  other_deduct: p.otherDeduct||0, other_deduct_label: p.otherDeductLabel||'',
  paid: p.paid, utr: p.utr, created_by: p.createdBy, created_at: p.createdAt,
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
})
const indentToDB = i => ({
  id: i.id, pump_id: i.pumpId, truck_no: i.truckNo, trip_id: i.tripId||'',
  indent_no: i.indentNo, date: i.date, litres: i.litres,
  rate_per_litre: i.ratePerLitre, amount: i.amount,
  confirmed: i.confirmed, paid: i.paid, paid_date: i.paidDate||'',
  paid_ref: i.paidRef||'', created_by: i.createdBy, created_at: i.createdAt,
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
  category: r.category, notes: r.notes,
  createdBy: r.created_by, createdAt: r.created_at,
})
const expenseToDB = e => ({
  id: e.id, date: e.date, label: e.label, amount: e.amount,
  category: e.category, notes: e.notes||'',
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

// ── Generic helpers ──────────────────────────────────────────────────────────
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

// ── Exported API ─────────────────────────────────────────────────────────────
export const DB = {
  // Users
  getUsers:       () => fetchAll('mye_users', userFromDB),
  saveUser:       u  => upsertOne('mye_users', userToDB, u),

  // Trips
  getTrips:       () => fetchAll('mye_trips', tripFromDB),
  saveTrip:       t  => upsertOne('mye_trips', tripToDB, t),
  saveManyTrips:  async (trips) => {
    const { error } = await supabase.from('mye_trips').upsert(trips.map(tripToDB))
    if (error) throw error
  },

  // Vehicles
  getVehicles:    () => fetchAll('mye_vehicles', vehicleFromDB),
  saveVehicle:    v  => upsertOne('mye_vehicles', vehicleToDB, v),

  // Employees
  getEmployees:   () => fetchAll('mye_employees', employeeFromDB),
  saveEmployee:   e  => upsertOne('mye_employees', employeeToDB, e),

  // Payments
  getPayments:    () => fetchAll('mye_payments', paymentFromDB),
  savePayment:    p  => upsertOne('mye_payments', paymentToDB, p),

  // Settlements
  getSettlements: () => fetchAll('mye_settlements', settlementFromDB),
  saveSettlement: s  => upsertOne('mye_settlements', settlementToDB, s),

  // Pumps
  getPumps:       () => fetchAll('mye_pumps', pumpFromDB),
  savePump:       p  => upsertOne('mye_pumps', pumpToDB, p),

  // Indents
  getIndents:     () => fetchAll('mye_indents', indentFromDB),
  saveIndent:     i  => upsertOne('mye_indents', indentToDB, i),
  saveManyIndents:async (indents) => {
    const { error } = await supabase.from('mye_indents').upsert(indents.map(indentToDB))
    if (error) throw error
  },

  // Driver Payments
  getDriverPays:  () => fetchAll('mye_driver_payments', driverPayFromDB),
  saveDriverPay:  p  => upsertOne('mye_driver_payments', driverPayToDB, p),

  // Expenses
  getExpenses:    () => fetchAll('mye_expenses', expenseFromDB),
  saveExpense:    e  => upsertOne('mye_expenses', expenseToDB, e),

  // GST Releases
  getGstReleases: () => fetchAll('mye_gst_releases', gstFromDB),
  saveGstRelease: g  => upsertOne('mye_gst_releases', gstToDB, g),

  // Activity
  getActivity:    async () => {
    const { data, error } = await supabase
      .from('mye_activity').select('*')
      .order('time', { ascending: false }).limit(200)
    if (error) throw error
    return (data||[]).map(activityFromDB)
  },
  logActivity:    a  => upsertOne('mye_activity', activityToDB, a),

  // Settings
  getSettings: async () => {
    const { data } = await supabase.from('mye_settings').select('*').eq('key','app_settings').single()
    return data?.value || { tafalPerTrip: 300 }
  },
  saveSettings: async (val) => {
    const { error } = await supabase.from('mye_settings')
      .upsert({ key: 'app_settings', value: val })
    if (error) throw error
  },
}
