// Run: node scripts/husk_logic.test.mjs
import assert from "node:assert/strict";
import * as H from "../src/husk_logic.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

const compRates = [
  { id: "cr1", companyId: "A", materialId: "soya", rate: 2850, effectiveFrom: "2026-06-01", ts: 1 },
  { id: "cr2", companyId: "A", materialId: "soya", rate: 3000, effectiveFrom: "2026-09-01", ts: 2 },
];
const custRates = [
  { id: "ur1", customerId: "C1", materialId: "soya", companyId: "A", rate: 2600, effectiveFrom: "2026-06-01", ts: 1 },
  { id: "ur2", customerId: "C1", materialId: "soya", companyId: "A", rate: 2700, effectiveFrom: "2026-09-01", ts: 2 },
];

t("rate picked by entry date", () => {
  assert.equal(H.companyRateFor(compRates, "A", "soya", "2026-08-31").rate, 2850);
  assert.equal(H.companyRateFor(compRates, "A", "soya", "2026-09-01").rate, 3000);
  assert.equal(H.companyRateFor(compRates, "A", "soya", "2026-05-31"), null);
  assert.equal(H.customerRateFor(custRates, "C1", "soya", "A", "2026-10-08").rate, 2700);
  assert.equal(H.customerRateFor(custRates, "C1", "rice", "A", "2026-10-08"), null);
});

t("worked example: 10 t, 3000/2700, company pays 20000", () => {
  const a = H.computeAmounts({ tons: 10, companyRate: 3000, customerRate: 2700 });
  assert.deepEqual(a, { companyAmount: 30000, customerAmount: 27000, netPayable: 27000, margin: 3000 });
  const data = {
    trips: [{ id: "T1", entryDate: "2026-09-03", companyId: "A", materialId: "soya", customerId: "C1", vehicleId: "V1", tons: 10, companyRate: 3000, customerRate: 2700, ...a, companyAmount: 30000, customerAmount: 27000, netPayable: 27000 }],
    payments: [{ id: "P1", kind: "company_received", companyId: "A", materialId: "soya", amount: 20000, deduction: 0, date: "2026-09-10" }],
  };
  assert.equal(H.companyLedger(data, "A").balance, 10000);
  assert.equal(H.companyLedger(data, "A", { materialId: "rice" }).balance, 0);
  const p = H.profitSummary(data);
  assert.equal(p.margin, 3000);
  assert.equal(p.profit, 3000);
});

t("loan deduction is the smaller of per-trip amount and balance", () => {
  const cust = { id: "C1", loanPerTrip: 1500 };
  const loans = [{ customerId: "C1", kind: "given", amount: 3200 }];
  assert.equal(H.loanDeductionFor(cust, loans), 1500);
  loans.push({ customerId: "C1", kind: "recovered", amount: 1500 });
  assert.equal(H.loanDeductionFor(cust, loans), 1500);
  loans.push({ customerId: "C1", kind: "recovered", amount: 1500 });
  assert.equal(H.loanBalance(loans, "C1"), 200);
  assert.equal(H.loanDeductionFor(cust, loans), 200);
  loans.push({ customerId: "C1", kind: "recovered", amount: 200 });
  assert.equal(H.loanDeductionFor(cust, loans), 0);
  assert.equal(H.loanDeductionFor({ id: "C1", loanPerTrip: 0 }, [{ customerId: "C1", kind: "given", amount: 500 }]), 0);
});

const mk = (o) => {
  const a = H.computeAmounts(o);
  return { vehicleId: "V1", ...o, ...a };
};

t("late rate change reprices entries on or after its effective date only", () => {
  const trips = [
    { id: "T1", entryDate: "2026-08-20", companyId: "A", materialId: "soya", customerId: "C1", ...mk({ tons: 10, companyRate: 2850, customerRate: 2600 }) },
    { id: "T2", entryDate: "2026-09-05", companyId: "A", materialId: "soya", customerId: "C1", ...mk({ tons: 10, companyRate: 2850, customerRate: 2600 }) },
    { id: "T3", entryDate: "2026-09-20", companyId: "A", materialId: "soya", customerId: "C1", ...mk({ tons: 5, companyRate: 3000, customerRate: 2700 }) },
    { id: "T4", entryDate: "2026-09-06", companyId: "B", materialId: "soya", customerId: "C1", ...mk({ tons: 5, companyRate: 1, customerRate: 1 }) },
  ];
  // the 3000 rate (from 1 Sep) was entered late: T2 was saved at the old 2850
  const ups = H.repriceTrips(trips, compRates, custRates, { kind: "company", companyId: "A", materialId: "soya", from: "2026-09-01" });
  assert.deepEqual(ups.map(u => u.trip.id), ["T2"]);
  assert.equal(ups[0].patch.companyRate, 3000);
  assert.equal(ups[0].patch.companyAmount, 30000);
  const ups2 = H.repriceTrips(trips, compRates, custRates, { kind: "customer", customerId: "C1", materialId: "soya", companyId: "A", from: "2026-09-01" });
  assert.deepEqual(ups2.map(u => u.trip.id), ["T2"]);
  assert.equal(ups2[0].patch.customerRate, 2700);
  assert.equal(ups2[0].patch.customerAmount, 27000);
});

t("customer ledger: advance shows negative, trips and payments run the balance", () => {
  const data = {
    openings: [],
    trips: [
      { id: "T1", entryDate: "2026-09-10", companyId: "A", materialId: "soya", customerId: "C2", tons: 15, customerRate: 2650, customerAmount: 39750, loanDeduction: 0, customerDeduction: 0, netPayable: 39750, ts: 5 },
    ],
    payments: [
      { id: "P1", kind: "customer_paid", customerId: "C2", companyId: "B", materialId: "rice", amount: 5000, date: "2026-09-02", ts: 1 },
    ],
  };
  const l = H.customerLedger(data, "C2");
  assert.deepEqual(l.rows.map(r => [r.kind, r.balance]), [["Paid", -5000], ["Trip", 34750]]);
  assert.equal(l.balance, 34750);
  assert.equal(H.customerLedger(data, "C2", { companyId: "B" }).balance, -5000);
  assert.equal(H.customerLedger(data, "C2", { companyId: "A", materialId: "soya" }).balance, 39750);
});

t("opening balances only appear when their company and material match the filter", () => {
  const data = { openings: [{ partyType: "customer", partyId: "C1", amount: -2000, asOf: "2026-09-01" }, { partyType: "customer", partyId: "C1", companyId: "A", materialId: "soya", amount: 700, asOf: "2026-09-01" }], trips: [], payments: [] };
  assert.equal(H.customerLedger(data, "C1").balance, -1300);
  assert.equal(H.customerLedger(data, "C1", { companyId: "A" }).balance, 700);
});

t("date window adds a balance brought forward row", () => {
  const data = {
    trips: [
      { id: "T1", entryDate: "2026-09-01", companyId: "A", materialId: "soya", customerId: "C1", tons: 10, companyRate: 3000, companyAmount: 30000, ts: 1 },
      { id: "T2", entryDate: "2026-09-20", companyId: "A", materialId: "soya", customerId: "C1", tons: 5, companyRate: 3000, companyAmount: 15000, ts: 2 },
    ], payments: [], openings: [],
  };
  const l = H.companyLedger(data, "A", { from: "2026-09-10", to: "2026-09-30" });
  assert.deepEqual(l.rows.map(r => [r.kind, r.amount, r.balance]), [["Opening", 30000, 30000], ["Trip", 15000, 45000]]);
  assert.equal(l.balance, 45000);
});

t("company deduction: open until recovered through trips; profit offsets it", () => {
  const data = {
    trips: [
      { id: "T1", entryDate: "2026-09-03", companyId: "A", materialId: "soya", customerId: "C1", vehicleId: "V1", tons: 12, companyRate: 3000, customerRate: 2700, companyAmount: 36000, customerAmount: 32400, customerDeduction: 0, loanDeduction: 0, netPayable: 32400 },
      { id: "T2", entryDate: "2026-09-13", companyId: "A", materialId: "soya", customerId: "C1", vehicleId: "V1", tons: 8, companyRate: 3000, customerRate: 2700, companyAmount: 24000, customerAmount: 21600, customerDeduction: 400, dedPaymentId: "P1", loanDeduction: 0, netPayable: 21200 },
    ],
    payments: [{ id: "P1", kind: "company_received", companyId: "A", materialId: "soya", amount: 25000, deduction: 1200, deductionReason: "Moisture", date: "2026-09-12" }],
    openings: [],
  };
  const od = H.openDeductions(data.payments, data.trips, "A");
  assert.equal(od.length, 1);
  assert.equal(od[0].open, 800);
  const dl = H.deductionLedger(data);
  assert.equal(dl.deducted, 1200); assert.equal(dl.recovered, 400); assert.equal(dl.unrecovered, 800);
  const p = H.profitSummary(data);
  assert.equal(p.margin, 6000);        // 20 t × 300
  assert.equal(p.profit, 6000 - 1200 + 400);
  const pc = H.profitSummary(data, { customerId: "C1" });
  assert.equal(pc.profit, 6000);       // deductions are not attributed to a customer
  assert.equal(pc.deductionsAttributed, false);
  // company ledger: 60000 billed, 25000 received, 1200 deducted
  assert.equal(H.companyLedger(data, "A").balance, 60000 - 25000 - 1200);
  // customer ledger uses the net payable, which already includes the 400 deduction
  assert.equal(H.customerLedger(data, "C1").balance, 32400 + 21200);
});

t("material ledger gives a balance per company; vehicle ledger sums tons", () => {
  const data = {
    trips: [
      { id: "T1", entryDate: "2026-09-03", companyId: "A", materialId: "soya", customerId: "C1", vehicleId: "V1", tons: 12, companyRate: 3000, companyAmount: 36000, netPayable: 32400 },
      { id: "T2", entryDate: "2026-09-04", companyId: "B", materialId: "soya", customerId: "C1", vehicleId: "V1", tons: 10, companyRate: 2900, companyAmount: 29000, netPayable: 26000 },
    ],
    payments: [{ id: "P1", kind: "company_received", companyId: "B", materialId: "soya", amount: 9000, deduction: 0, date: "2026-09-10" }], openings: [],
  };
  const m = H.materialLedger(data, "soya");
  assert.deepEqual(m.perCompany, { A: 36000, B: 20000 });
  assert.equal(m.total, 56000);
  assert.equal(H.vehicleLedger(data, "V1").tons, 22);
});

t("profitBy groups by dimension and sorts by profit", () => {
  const data = { trips: [
    { entryDate: "2026-09-03", companyId: "A", materialId: "soya", customerId: "C1", vehicleId: "V1", tons: 10, companyAmount: 30000, customerAmount: 27000 },
    { entryDate: "2026-09-03", companyId: "B", materialId: "rice", customerId: "C2", vehicleId: "V2", tons: 10, companyAmount: 27000, customerAmount: 24000 },
    { entryDate: "2026-09-04", companyId: "B", materialId: "rice", customerId: "C2", vehicleId: "V2", tons: 10, companyAmount: 28000, customerAmount: 24000 },
  ], payments: [] };
  const by = H.profitBy(data, "company");
  assert.deepEqual(by.map(r => [r.id, r.profit]), [["B", 7000], ["A", 3000]]);
});

t("receivable and payable totals", () => {
  const data = {
    trips: [{ id: "T1", entryDate: "2026-09-03", companyId: "A", materialId: "soya", customerId: "C1", tons: 10, companyAmount: 30000, netPayable: 27000 }],
    payments: [{ id: "P1", kind: "company_received", companyId: "A", materialId: "soya", amount: 20000, deduction: 0, date: "2026-09-10" }, { id: "P2", kind: "customer_paid", customerId: "C1", companyId: "A", materialId: "soya", amount: 7000, date: "2026-09-11" }],
    openings: [],
  };
  assert.equal(H.receivableFromCompanies(data), 10000);
  assert.equal(H.payableToCustomers(data), 20000);
});

t("what is still to be paid: A has 2 trucks, B has 1; a payment reduces it on its own", () => {
  const trip = (id, cust, tons, net, co = "A", m = "soya") => ({ id, entryDate: "2026-09-03", companyId: co, materialId: m, customerId: cust, tons, companyAmount: tons * 3000, customerAmount: net, netPayable: net });
  const data = {
    trips: [trip("T1", "CA", 10, 27000), trip("T2", "CA", 5, 13500), trip("T3", "CB", 8, 21600), trip("T4", "CA", 4, 10800, "B", "rice")],
    payments: [], openings: [],
  };
  let due = H.customersDue(data);
  assert.deepEqual(due.map(d => [d.customerId, d.total, d.trips]), [["CA", 51300, 3], ["CB", 21600, 1]]);
  assert.equal(due[0].lines.length, 2); // A: soya at company A + rice at company B
  data.payments.push({ id: "P1", kind: "customer_paid", customerId: "CA", companyId: "A", materialId: "soya", amount: 40500, date: "2026-09-10" });
  due = H.customersDue(data);
  assert.equal(due.find(d => d.customerId === "CA").total, 10800);
  assert.equal(due.find(d => d.customerId === "CA").lines.length, 1);
  data.payments.push({ id: "P2", kind: "customer_paid", customerId: "CB", companyId: "A", materialId: "soya", amount: 25000, date: "2026-09-11" });
  assert.equal(H.customersDue(data).find(d => d.customerId === "CB").total, -3400); // advance
  const co = H.companiesDue(data);
  assert.deepEqual(co.map(c => [c.companyId, c.total]), [["A", 23 * 3000], ["B", 12000]]);
});

t("rate changes inside a window are listed with the rate they replaced", () => {
  const data = { companyRates: [
    { id: "r1", companyId: "A", materialId: "soya", rate: 3000, effectiveFrom: "2026-09-01", ts: 1 },
    { id: "r2", companyId: "A", materialId: "soya", rate: 3100, effectiveFrom: "2026-10-05", ts: 2 }],
    customerRates: [{ id: "c1", customerId: "CA", companyId: "A", materialId: "soya", rate: 2700, effectiveFrom: "2026-09-01", ts: 1 }] };
  const ev = H.rateChanges(data, { from: "2026-10-01", to: "2026-10-10" }, { company: () => true, customer: () => true });
  assert.deepEqual(ev.map(e => [e.date, e.side, e.from, e.to]), [["2026-10-05", "company", 3000, 3100]]);
  assert.equal(H.rateChanges(data, { from: "2026-09-01", to: "2026-09-30" }, { customer: () => true })[0].from, null);
});

console.log(`\n${n} tests passed`);
