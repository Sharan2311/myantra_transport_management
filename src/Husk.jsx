// ─── Husk.jsx — Husk module screens (rice / tuvar / soya … husk supply) ──────
// Rules live in husk_logic.js (tested), storage in db.js (HuskDB), small shared
// widgets and PDF in husk_ui.jsx. App.jsx passes its own theme + components in
// through the `ui` prop so this file looks and behaves like the rest of the app.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { HuskDB } from "./db.js";
import * as L from "./husk_logic.js";
import { setHuskUI, ui, Card, Muted, Empty, Warn, DateInput, BTable, SummaryBoxes, fmtDay, fmtTons, money, printHuskReport, periodText, fyRange, fyLabel, fyStartYear } from "./husk_ui.jsx";

const nm = (list, id) => (list.find(x => x.id === id) || {}).name || "—";
const normTruck = s => String(s || "").toUpperCase().replace(/\s+/g, "");
const opt = (list, all) => [{ v: "", l: all || "All" }, ...list.map(x => ({ v: x.id, l: x.name }))];
const dayBefore = iso => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
// The top Financial-year filter is a range; each screen's own From/To can only narrow it.
const effRange = (range, from, to) => ({
  from: [range.from, from].filter(Boolean).sort().pop() || "",
  to: [range.to, to].filter(Boolean).sort()[0] || "",
});
const MODES = ["Cash", "UPI", "Bank transfer", "Cheque"].map(m => ({ v: m, l: m }));

// Who owned the vehicle on a given date (history), falling back to the current owner.
const ownerAt = (vehicle, owners, date) => {
  const rows = owners.filter(o => o.vehicleId === vehicle.id && (o.fromDate || "") <= date && (!o.toDate || o.toDate >= date));
  if (rows.length) { rows.sort((a, b) => (b.fromDate || "").localeCompare(a.fromDate || "")); return rows[0].customerId; }
  return vehicle.customerId;
};

function useHuskData() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try { setData(await HuskDB.loadAll()); setErr(""); } catch (e) { setErr(e.message || String(e)); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 45000); return () => clearInterval(t); }, [load]);
  return [data, load, err];
}

// Top-of-screen financial year filter (Indian FY, 1 Apr – 31 Mar). Applies to
// every Husk screen; each entry's own FY is worked out from its date.
function FYBar({ data, fy, setFy }) {
  const { C, PillBar, today } = ui();
  const years = new Set([fyStartYear(today())]);
  [...data.trips.map(t => t.entryDate), ...data.payments.map(p => p.date), ...data.openings.map(o => o.asOf), ...data.loans.map(l => l.date)]
    .forEach(d => { const y = fyStartYear(d); if (y) years.add(y); });
  const items = [...[...years].sort((a, b) => b - a).map(y => ({ id: String(y), label: fyLabel(y), color: C.accent })), { id: "all", label: "All years", color: C.muted }];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: C.muted, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>📅 FY</span>
      <div style={{ minWidth: 0, flex: 1 }}><PillBar items={items} active={fy || "all"} onSelect={id => setFy(id === "all" ? "" : id)} /></div>
    </div>
  );
}


// Which earlier entries change price when rates change. scopes: [{kind,...,from}] (company first, then customer).
function planRepriceTrips(trips, coRates, cuRates, scopes) {
  let working = trips;
  const before = new Map(trips.map(t => [t.id, t]));
  const touched = new Set();
  scopes.forEach(scope => {
    const ch = L.repriceTrips(working, coRates, cuRates, scope);
    const by = new Map(ch.map(c => [c.trip.id, c.patch]));
    ch.forEach(c => touched.add(c.trip.id));
    working = working.map(t => by.has(t.id) ? { ...t, ...by.get(t.id) } : t);
  });
  return working.filter(t => touched.has(t.id)).map(t => ({ before: before.get(t.id), after: t }));
}

// ── Generic form sheet ───────────────────────────────────────────────────────
function FormSheet({ title, fields, init, onSave, onClose, validate, hint, header, saveLabel = "Save" }) {
  const { Btn, Sheet, Field } = ui();
  const [v, setV] = useState(init);
  const [busy, setBusy] = useState(false);
  const set = k => val => setV(p => ({ ...p, [k]: val }));
  const fl = typeof fields === "function" ? fields(v) : fields;
  const err = validate ? validate(v) : "";
  const go = async () => {
    if (err || busy) return;
    setBusy(true);
    try { await onSave(v); onClose(); } catch (e) { alert("Could not save: " + (e.message || e)); setBusy(false); }
  };
  return (
    <Sheet title={title} onClose={onClose}>
      {header && <div style={{ marginBottom: 12 }}>{header(v, setV)}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {fl.map(f => f.type === "date"
          ? <DateInput key={f.k} label={f.label} value={v[f.k]} onChange={set(f.k)} half={f.half} />
          : <Field key={f.k} label={f.label} value={v[f.k] ?? ""} onChange={set(f.k)} type={f.type || "text"} opts={f.opts} half={f.half} placeholder={f.placeholder} note={f.note} />)}
      </div>
      {hint && <div style={{ marginTop: 12 }}>{hint(v)}</div>}
      {err && <div style={{ marginTop: 10 }}><Warn>{err}</Warn></div>}
      <div style={{ marginTop: 16 }}><Btn full onClick={go} disabled={!!err || busy} loading={busy}>{saveLabel}</Btn></div>
    </Sheet>
  );
}

// ═════════════════════════════════ MAIN ═════════════════════════════════════
export default function HuskMod({ user, log, ui: uiBag }) {
  setHuskUI(uiBag);
  const { C, PillBar, nowTs, uid } = uiBag;
  const [data, load, err] = useHuskData();
  const [tab, setTab] = useState("entries");
  const [fy, setFy] = useState(() => String(fyStartYear(uiBag.today())));

  const roles = (user.role || "").split(",").map(s => s.trim());
  const P = { entry: uiBag.can("husk_entry"), manage: uiBag.can("husk_manage"), profit: uiBag.can("husk_profit"), admin: roles.includes("owner") };
  const h = useMemo(() => ({
    data, load, user, P, log, fy, range: fy ? fyRange(+fy) : { from: "", to: "" },
    meta: () => ({ createdBy: user.name, createdAt: nowTs(), ts: Date.now() }),
    change: (tableName, recordId, action, before, after) => ({ id: uid(), ts: Date.now(), at: nowTs(), by: user.name, tableName, recordId, action, before, after }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, user, fy, P.entry, P.manage, P.profit, P.admin]);

  if (!data) return (
    <div style={{ padding: 30, textAlign: "center", color: C.muted }}>
      {err ? <Warn color={C.red}>Could not load Husk data: {err}</Warn> : "Loading Husk…"}
    </div>
  );

  const tabs = [
    { id: "entries", label: "Entries", color: C.accent },
    { id: "payments", label: "Payments", color: C.green },
    { id: "ledgers", label: "Ledgers", color: C.purple },
    { id: "rates", label: "Rates", color: C.teal },
    { id: "loans", label: "Loans", color: C.orange },
    ...(P.profit ? [{ id: "profit", label: "Profit", color: C.green }] : []),
    ...(P.manage ? [{ id: "setup", label: "Setup", color: C.blue }] : []),
    ...(P.admin ? [{ id: "log", label: "Change log", color: C.muted }] : []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900, fontSize: 18, color: C.text }}>🌾 Husk</div>
        <div style={{ fontSize: 11, color: C.muted }}>{user.name}</div>
      </div>
      {data.missing.length > 0 && (
        <Warn color={C.red}>Husk tables are not created in this database yet ({data.missing.length} missing). Run the Husk SQL in Supabase first. Nothing can be saved until then.</Warn>
      )}
      <FYBar data={data} fy={fy} setFy={setFy} />
      <PillBar items={tabs} active={tab} onSelect={setTab} />
      {tab === "entries" && <EntriesTab h={h} />}
      {tab === "payments" && <PaymentsTab h={h} />}
      {tab === "ledgers" && <LedgersTab h={h} />}
      {tab === "rates" && <RatesTab h={h} />}
      {tab === "loans" && <LoansTab h={h} />}
      {tab === "profit" && P.profit && <ProfitTab h={h} />}
      {tab === "setup" && P.manage && <SetupTab h={h} />}
      {tab === "log" && P.admin && <LogTab h={h} />}
    </div>
  );
}

// ═══════════════════════════ ENTRY FORM ═════════════════════════════════════
function EntryForm({ h, edit, onClose }) {
  const { C, Btn, Sheet, Field, fmt, today, uid, nowTs } = ui();
  const { data: D, user, P } = h;
  const NEW = "__new";
  const [date, setDate] = useState(edit ? edit.entryDate : today());
  const [companySel, setCompanySel] = useState(edit ? edit.companyId : "");     // company id, or NEW
  const [materialSel, setMaterialSel] = useState(edit ? edit.materialId : "");  // material id, or NEW
  const [coName, setCoName] = useState("");
  const [coContact, setCoContact] = useState("");
  const [matName, setMatName] = useState("");
  const [vehicleId, setVehicleId] = useState(edit ? edit.vehicleId : "");
  const [q, setQ] = useState("");
  const [newVeh, setNewVeh] = useState(!edit && D.vehicles.length === 0);
  const [newTruck, setNewTruck] = useState("");
  const [ownerSel, setOwnerSel] = useState("");      // owner of a NEW vehicle: customer id, or NEW
  const [relink, setRelink] = useState(false);       // change owner of the chosen vehicle
  const [relSel, setRelSel] = useState("");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [coNew, setCoNew] = useState(null);          // new / changed company rate {rate, from}
  const [cuNew, setCuNew] = useState(null);          // new / changed customer rate {rate, from}
  const [tons, setTons] = useState(edit ? String(edit.tons) : "");
  const [dedId, setDedId] = useState(edit ? edit.dedPaymentId : "");
  const [dedAmt, setDedAmt] = useState(edit && edit.customerDeduction ? String(edit.customerDeduction) : "");
  const [note, setNote] = useState(edit ? edit.note : "");
  const [busy, setBusy] = useState(false);
  const newCustId = useRef(uid()).current;
  const newCoId = useRef(uid()).current;
  const newMatId = useRef(uid()).current;
  const coRateId = useRef(uid()).current;
  const cuRateId = useRef(uid()).current;

  const act = list => list.filter(x => x.active !== false);
  const creatingCo = companySel === NEW;
  const creatingMat = materialSel === NEW;
  const companyId = creatingCo ? newCoId : companySel;
  const materialId = creatingMat ? newMatId : materialSel;
  const coLabel = creatingCo ? (coName.trim() || "the new company") : nm(D.companies, companyId);
  const matLabel = creatingMat ? (matName.trim() || "the new material") : nm(D.materials, materialId);
  const vehicle = D.vehicles.find(v => v.id === vehicleId);
  const ownerPick = newVeh ? ownerSel : relink ? relSel : "";
  const creatingCust = ownerPick === NEW;
  const customerId = edit ? edit.customerId : creatingCust ? newCustId : ownerPick ? ownerPick : vehicle ? ownerAt(vehicle, D.vehicleOwners, date) : "";
  const customer = creatingCust ? { id: newCustId, name: custName.trim(), phone: custPhone, loanPerTrip: 0, active: true } : D.customers.find(c => c.id === customerId);
  const ready = !edit && companyId && materialId && customerId;

  // Rates typed into this form (saved with the entry)
  const coRec = !edit && coNew && L.num(coNew.rate) > 0 && coNew.from && companyId && materialId
    ? { id: coRateId, companyId, materialId, rate: L.num(coNew.rate), effectiveFrom: coNew.from, ts: Date.now(), createdBy: user.name, createdAt: nowTs() } : null;
  const cuRec = !edit && cuNew && L.num(cuNew.rate) > 0 && cuNew.from && customerId && companyId && materialId
    ? { id: cuRateId, customerId, materialId, companyId, rate: L.num(cuNew.rate), effectiveFrom: cuNew.from, ts: Date.now(), createdBy: user.name, createdAt: nowTs() } : null;
  const coRates = coRec ? [...D.companyRates, coRec] : D.companyRates;
  const cuRates = cuRec ? [...D.customerRates, cuRec] : D.customerRates;
  const coBase = ready ? L.companyRateFor(D.companyRates, companyId, materialId, date) : null;
  const cuBase = ready ? L.customerRateFor(D.customerRates, customerId, materialId, companyId, date) : null;
  const cr = edit ? { rate: edit.companyRate } : (companyId && materialId ? L.companyRateFor(coRates, companyId, materialId, date) : null);
  const pr = edit ? { rate: edit.customerRate } : (customerId && companyId && materialId ? L.customerRateFor(cuRates, customerId, materialId, companyId, date) : null);

  // Earlier entries that a new / changed rate re-prices (company first, then customer, on the updated entries)
  const planReprice = () => planRepriceTrips(D.trips, coRates, cuRates, [
    ...(coRec ? [{ kind: "company", companyId, materialId, from: coRec.effectiveFrom }] : []),
    ...(cuRec ? [{ kind: "customer", customerId, materialId, companyId, from: cuRec.effectiveFrom }] : []),
  ]);
  const repriced = coRec || cuRec ? planReprice() : [];

  const loanDed = edit ? edit.loanDeduction : (customer && !creatingCust ? L.loanDeductionFor(customer, D.loans) : 0);
  const tonsN = L.num(tons);
  const tripsOther = edit ? D.trips.filter(t => t.id !== edit.id) : D.trips;
  const opens = companyId ? L.openDeductions(D.payments, tripsOther, companyId) : [];
  const selOpen = opens.find(o => o.payment.id === dedId);
  const base = L.computeAmounts({ tons: tonsN, companyRate: cr && cr.rate, customerRate: pr && pr.rate, loanDeduction: loanDed });
  const dedMax = selOpen ? Math.min(selOpen.open, Math.max(0, base.customerAmount - loanDed)) : 0;
  const dedN = selOpen ? L.num(dedAmt) : 0;
  const amt = L.computeAmounts({ tons: tonsN, companyRate: cr && cr.rate, customerRate: pr && pr.rate, loanDeduction: loanDed, customerDeduction: dedN });
  const entryFy = fyStartYear(date);

  const matches = useMemo(() => {
    const k = normTruck(q);
    if (!k) return [];
    return D.vehicles.filter(v => normTruck(v.truckNo).includes(k)).slice(0, 6);
  }, [q, D.vehicles]);

  const nameTaken = n => D.customers.some(c => c.name.trim().toLowerCase() === n.trim().toLowerCase());
  const errors = [];
  if (!edit) {
    if (!companySel || !materialSel) errors.push("Choose a company and a material.");
    if (creatingCo && !coName.trim()) errors.push("Enter the new company's name.");
    if (creatingCo && coName.trim() && D.companies.some(c => c.name.trim().toLowerCase() === coName.trim().toLowerCase())) errors.push("A company with this name already exists. Choose it from the list.");
    if (creatingMat && !matName.trim()) errors.push("Enter the new material's name.");
    if (creatingMat && matName.trim() && D.materials.some(m => m.name.trim().toLowerCase() === matName.trim().toLowerCase())) errors.push("A material with this name already exists. Choose it from the list.");
    if (!newVeh && !vehicle) errors.push("Choose a vehicle.");
    if (newVeh && !newTruck.trim()) errors.push("Enter the truck number.");
    if (newVeh && D.vehicles.some(v => normTruck(v.truckNo) === normTruck(newTruck))) errors.push("This truck number already exists. Search for it instead.");
    if ((newVeh || relink) && !ownerPick) errors.push("Choose the owner.");
    if (creatingCust && !custName.trim()) errors.push("Enter the new owner's name.");
    if (creatingCust && custName.trim() && nameTaken(custName)) errors.push("An owner with this name already exists. Choose them from the list.");
    if (coNew && !(L.num(coNew.rate) > 0)) errors.push("Enter the company rate.");
    if (cuNew && !(L.num(cuNew.rate) > 0)) errors.push("Enter the customer rate.");
    if ((coNew && coNew.from > date) || (cuNew && cuNew.from > date)) errors.push("A rate cannot start after the entry date.");
    if (companyId && materialId && !cr && !coNew) errors.push(P.manage ? `Set the company rate for ${coLabel} / ${matLabel}.` : `No company rate for ${coLabel} / ${matLabel} on ${fmtDay(date)}. Ask the Husk manager to set it.`);
    if (ready && !pr && !cuNew) errors.push(P.manage ? `Set the customer rate for ${customer ? customer.name || "the new owner" : "the customer"} on ${coLabel} / ${matLabel}.` : `No customer rate for ${customer ? customer.name : "this owner"} on ${coLabel} / ${matLabel}. Ask the Husk manager to set it.`);
  }
  if (!(tonsN > 0)) errors.push("Enter the unloaded tons.");
  if (selOpen && !(dedN > 0 && dedN <= dedMax + 0.001)) errors.push(`Deduction must be between ₹1 and ${fmt(dedMax)}.`);

  const save = async () => {
    if (errors.length || busy) return;
    setBusy(true);
    try {
      const ts = Date.now();
      if (edit) {
        const next = {
          ...edit, tons: tonsN, note, dedPaymentId: dedN > 0 ? dedId : "", customerDeduction: dedN > 0 ? dedN : 0,
          companyAmount: amt.companyAmount, customerAmount: amt.customerAmount, netPayable: amt.netPayable,
          editedBy: user.name, editedAt: nowTs(),
        };
        await HuskDB.save("trips", next);
        await HuskDB.save("changelog", h.change("mye_husk_trips", edit.id, "edit", edit, next));
        h.log && h.log("HUSK_EDIT", `${edit.truckNo} ${fmtDay(edit.entryDate)} edited`);
      } else {
        // 0. new company / material → masters
        if (creatingCo) {
          const rec = { id: newCoId, name: coName.trim(), contact: coContact, active: true, ...h.meta() };
          await HuskDB.save("companies", rec);
          await HuskDB.save("changelog", h.change("mye_husk_companies", rec.id, "create", null, rec));
        }
        if (creatingMat) {
          const rec = { id: newMatId, name: matName.trim(), active: true, ...h.meta() };
          await HuskDB.save("materials", rec);
          await HuskDB.save("changelog", h.change("mye_husk_materials", rec.id, "create", null, rec));
        }
        // 1. new owner → customers
        if (creatingCust) {
          const rec = { id: newCustId, name: custName.trim(), phone: custPhone, loanPerTrip: 0, active: true, ...h.meta() };
          await HuskDB.save("customers", rec);
          await HuskDB.save("changelog", h.change("mye_husk_customers", rec.id, "create", null, rec));
        }
        // 2. new vehicle → vehicles (+ ownership history) | changed owner → ownership history
        let vId = vehicleId, truckNo = vehicle ? vehicle.truckNo : "";
        if (newVeh) {
          vId = uid(); truckNo = newTruck.trim().toUpperCase();
          const vrec = { id: vId, truckNo, customerId, ...h.meta() };
          await HuskDB.save("vehicles", vrec);
          await HuskDB.save("vehicleOwners", { id: uid(), vehicleId: vId, customerId, fromDate: "", toDate: "", ts, createdBy: user.name });
          await HuskDB.save("changelog", h.change("mye_husk_vehicles", vId, "create", null, vrec));
        } else if (relink && customerId !== vehicle.customerId) {
          const cur = D.vehicleOwners.filter(o => o.vehicleId === vehicle.id && !o.toDate).sort((a, b) => (b.fromDate || "").localeCompare(a.fromDate || ""))[0];
          if (cur) await HuskDB.save("vehicleOwners", { ...cur, toDate: dayBefore(date) });
          await HuskDB.save("vehicleOwners", { id: uid(), vehicleId: vehicle.id, customerId, fromDate: date, toDate: "", ts, createdBy: user.name });
          const nextV = { ...vehicle, customerId };
          await HuskDB.save("vehicles", nextV);
          await HuskDB.save("changelog", h.change("mye_husk_vehicles", vehicle.id, "relink", vehicle, nextV));
        }
        // 3. new / changed rates → rates, re-priced earlier entries → trips, everything → change log
        if (coRec) { await HuskDB.save("companyRates", coRec); await HuskDB.save("changelog", h.change("mye_husk_company_rates", coRec.id, "rate", null, coRec)); }
        if (cuRec) { await HuskDB.save("customerRates", cuRec); await HuskDB.save("changelog", h.change("mye_husk_customer_rates", cuRec.id, "rate", null, cuRec)); }
        if (repriced.length) {
          const edited = repriced.map(r => ({ ...r.after, editedBy: user.name, editedAt: nowTs() }));
          await HuskDB.saveMany("trips", edited);
          await HuskDB.saveMany("changelog", repriced.map((r, i) => h.change("mye_husk_trips", r.before.id, "reprice", r.before, edited[i])));
        }
        // 4. the entry itself (+ loan recovery)
        const trip = {
          id: uid(), entryDate: date, companyId, materialId, vehicleId: vId, truckNo, customerId, tons: tonsN,
          companyRate: L.num(cr.rate), customerRate: L.num(pr.rate),
          companyAmount: amt.companyAmount, customerAmount: amt.customerAmount, loanDeduction: loanDed,
          customerDeduction: dedN > 0 ? dedN : 0, dedPaymentId: dedN > 0 ? dedId : "", netPayable: amt.netPayable,
          note, enteredBy: user.name, enteredAt: nowTs(), editedBy: "", editedAt: "", ts: ts + 1,
        };
        await HuskDB.save("trips", trip);
        if (loanDed > 0) await HuskDB.save("loans", { id: uid(), customerId, kind: "recovered", amount: loanDed, date, tripId: trip.id, note: "Deducted on trip " + truckNo, createdBy: user.name, ts: ts + 1 });
        h.log && h.log("HUSK_ENTRY", `${truckNo} ${tonsN}t ${coLabel}`);
      }
      await h.load();
      onClose();
    } catch (e) { alert("Could not save: " + (e.message || e)); setBusy(false); }
  };

  const ownerOpts = [{ v: "", l: "Select owner" }, ...act(D.customers).map(c => ({ v: c.id, l: c.name })), { v: NEW, l: "＋ New owner…" }];
  const newOwnerFields = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      <Field label="New owner name" value={custName} onChange={setCustName} />
      <Field label="Phone (optional)" value={custPhone} onChange={setCustPhone} />
    </div>
  );

  // One rate: shows the current rate; managers/owner can set or change it right here.
  const rateBlock = (label, baseRate, pending, setPending, currentReady) => {
    if (!currentReady) return null;
    const editing = pending || (!baseRate && P.manage);
    const pv = pending || { rate: "", from: date };
    return (
      <div style={{ flex: "1 1 100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ fontSize: 13 }}>{label}: {baseRate ? <><b>{fmt(baseRate.rate)}</b>/t <span style={{ color: C.muted, fontSize: 12 }}>since {fmtDay(baseRate.effectiveFrom)}</span></> : <span style={{ color: C.orange, fontWeight: 700 }}>no rate set</span>}</div>
        {editing ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            <Field label={baseRate ? "New rate (₹ per ton)" : "Rate (₹ per ton)"} type="number" value={pv.rate} onChange={v => setPending({ ...pv, rate: v })} half />
            <DateInput label="Effective from" value={pv.from} onChange={v => setPending({ ...pv, from: v })} half />
            {baseRate && <div><Btn sm outline onClick={() => setPending(null)}>Keep current rate</Btn></div>}
          </div>
        ) : P.manage ? (
          <div style={{ marginTop: 8 }}><Btn sm outline onClick={() => setPending({ rate: "", from: date })}>Change rate</Btn></div>
        ) : !baseRate ? <Muted style={{ marginTop: 6 }}>Ask the Husk manager to set this rate.</Muted> : null}
      </div>
    );
  };

  return (
    <Sheet title={edit ? `Edit entry · ${edit.truckNo}` : "New vehicle entry"} onClose={onClose} noBackdropClose>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {edit ? (
          <div style={{ flex: "1 1 100%" }}>
            <Muted>{fmtDay(edit.entryDate)} · {edit.truckNo} · {nm(D.customers, edit.customerId)}</Muted>
            <Muted>{nm(D.companies, edit.companyId)} · {nm(D.materials, edit.materialId)} · rates stay as saved</Muted>
          </div>
        ) : (<>
          <DateInput label="Date" value={date} onChange={setDate} />
          <div style={{ flex: "1 1 100%", fontSize: 12, color: C.muted }}>Financial year: <b style={{ color: C.text }}>{entryFy ? fyLabel(entryFy) : "—"}</b> (from the date){h.fy && entryFy && String(entryFy) !== h.fy ? <span style={{ color: C.orange }}> · not the year selected at the top, so it will not show in the list until you switch</span> : null}</div>
          <Field label="Company" value={companySel} onChange={setCompanySel} opts={[...opt(act(D.companies), "Select company"), ...(P.manage ? [{ v: NEW, l: "＋ New company…" }] : [])]} half />
          <Field label="Material" value={materialSel} onChange={setMaterialSel} opts={[...opt(act(D.materials), "Select material"), ...(P.manage ? [{ v: NEW, l: "＋ New material…" }] : [])]} half />
          {creatingCo && <><Field label="New company name" value={coName} onChange={setCoName} half /><Field label="Contact (optional)" value={coContact} onChange={setCoContact} half /></>}
          {creatingMat && <Field label="New material name (e.g. Rice husk)" value={matName} onChange={setMatName} />}
          <div style={{ flex: "1 1 100%" }}>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Vehicle</div>
            {newVeh ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Field label="New truck number" value={newTruck} onChange={setNewTruck} placeholder="e.g. KA01AB1234" />
                <Field label="Owner" value={ownerSel} onChange={setOwnerSel} opts={ownerOpts} />
                {creatingCust && newOwnerFields}
                <div><Btn sm outline onClick={() => { setNewVeh(false); setOwnerSel(""); }}>Back to search</Btn></div>
              </div>
            ) : vehicle ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div><b>{vehicle.truckNo}</b><Muted>Owner: {customer ? customer.name || "(new owner)" : "—"}</Muted></div>
                  <Btn sm outline onClick={() => { setVehicleId(""); setQ(""); setRelink(false); setRelSel(""); }}>Change</Btn>
                </div>
                {P.entry && !relink && <div><Btn sm outline onClick={() => setRelink(true)}>Vehicle sold? Change owner</Btn></div>}
                {relink && (<>
                  <Field label="New owner (from the entry date)" value={relSel} onChange={setRelSel} opts={ownerOpts.filter(o => o.v !== vehicle.customerId)} />
                  {creatingCust && newOwnerFields}
                  <Muted>Earlier entries keep the old owner. This entry and later ones use the new owner.</Muted>
                  <div><Btn sm outline onClick={() => { setRelink(false); setRelSel(""); }}>Keep current owner</Btn></div>
                </>)}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Type truck number…"
                  style={{ background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "13px 12px", fontSize: 15, outline: "none", width: "100%", boxSizing: "border-box" }} />
                {matches.map(v => (
                  <button key={v.id} onClick={() => { setVehicleId(v.id); setQ(""); }}
                    style={{ textAlign: "left", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", color: C.text }}>
                    <b>{v.truckNo}</b> <span style={{ color: C.muted, fontSize: 12 }}>· {nm(D.customers, v.customerId)}</span>
                  </button>
                ))}
                {q && !matches.length && <Muted>No vehicle matches “{q}”.</Muted>}
                {P.entry && <div><Btn sm outline onClick={() => { setNewVeh(true); setNewTruck(q.trim().toUpperCase()); }}>＋ New vehicle</Btn></div>}
              </div>
            )}
          </div>
          {rateBlock("Company rate", coBase, coNew, setCoNew, !!(companyId && materialId))}
          {rateBlock("Customer rate", cuBase, cuNew, setCuNew, !!ready)}
          {repriced.length > 0 && <div style={{ flex: "1 1 100%" }}><Warn>{repriced.length} earlier entr{repriced.length === 1 ? "y" : "ies"} made on or after the new rate's start date will be repriced. The change log keeps the old and new amounts.</Warn></div>}
        </>)}

        <Field label="Unloaded tons" type="number" value={tons} onChange={setTons} placeholder="e.g. 10.5" />

        {(cr || pr) && (
          <div style={{ flex: "1 1 100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: 1.7 }}>
            <div>Company rate <b>{cr ? fmt(cr.rate) : "—"}</b>/t → <b>{fmt(amt.companyAmount)}</b></div>
            <div>Customer rate <b>{pr ? fmt(pr.rate) : "—"}</b>/t → <b>{fmt(amt.customerAmount)}</b></div>
            {loanDed > 0 && <div style={{ color: C.orange }}>Husk loan deducted: −{fmt(loanDed)}</div>}
            {dedN > 0 && <div style={{ color: C.orange }}>Company deduction recovered: −{fmt(dedN)}</div>}
            <div style={{ marginTop: 4, fontWeight: 800 }}>Net payable to {customer && customer.name ? customer.name : "customer"}: {fmt(amt.netPayable)}</div>
          </div>
        )}

        {opens.length > 0 && (<>
          <Field label="Recover a company deduction (optional)" value={dedId}
            onChange={v => { setDedId(v); const o = opens.find(x => x.payment.id === v); setDedAmt(o ? String(Math.min(o.open, Math.max(0, base.customerAmount - loanDed))) : ""); }}
            opts={[{ v: "", l: "No deduction on this trip" }, ...opens.map(o => ({ v: o.payment.id, l: `${fmtDay(o.payment.date)} · ${o.payment.deductionReason || "Deduction"} · open ${fmt(o.open)}` }))]} />
          {selOpen && <Field label="Deduct from this customer (₹)" type="number" value={dedAmt} onChange={setDedAmt} note={`Up to ${fmt(dedMax)}`} />}
        </>)}
        <Field label="Note (optional)" value={note} onChange={setNote} />
      </div>
      {errors.length > 0 && <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>{errors.map((e, i) => <Warn key={i}>{e}</Warn>)}</div>}
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <Btn full onClick={save} disabled={errors.length > 0 || busy} loading={busy}>{edit ? "Save changes" : "Save entry"}</Btn>
      </div>
    </Sheet>
  );
}

// ═══════════════════════════ ENTRIES TAB ════════════════════════════════════
function EntriesTab({ h }) {
  const { C, Btn, Field, KPI, fmt, today } = ui();
  const { data: D, P } = h;
  const [form, setForm] = useState(null); // null | "new" | trip
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cFilter, setCFilter] = useState("");
  const [mFilter, setMFilter] = useState("");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(40);

  const e = effRange(h.range, from, to);
  const rows = useMemo(() => {
    const k = search.trim().toLowerCase();
    return D.trips.filter(t =>
      (!e.from || t.entryDate >= e.from) && (!e.to || t.entryDate <= e.to) &&
      (!cFilter || t.companyId === cFilter) && (!mFilter || t.materialId === mFilter) &&
      (!k || t.truckNo.toLowerCase().includes(k) || nm(D.customers, t.customerId).toLowerCase().includes(k))
    ).sort((a, b) => b.entryDate.localeCompare(a.entryDate) || a.ts - b.ts);
  }, [D, e.from, e.to, cFilter, mFilter, search]);

  // Serial number of each entry within its day (1, 2, 3 … in the order they were made),
  // counted over all entries of the day so it does not change with the filters.
  const serial = useMemo(() => {
    const byDay = {};
    D.trips.forEach(t => { (byDay[t.entryDate] = byDay[t.entryDate] || []).push(t); });
    const m = new Map();
    Object.values(byDay).forEach(list => list.sort((a, b) => a.ts - b.ts).forEach((t, i) => m.set(t.id, i + 1)));
    return m;
  }, [D.trips]);
  const dayName = iso => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" });
  const groupDays = list => {
    const out = [];
    list.forEach(t => {
      const g = out[out.length - 1];
      if (g && g.date === t.entryDate) g.trips.push(t); else out.push({ date: t.entryDate, trips: [t] });
    });
    return out;
  };
  const dayLine = g => `${dayName(g.date)} ${fmtDay(g.date)} · ${g.trips.length} trip${g.trips.length === 1 ? "" : "s"} · ${fmtTons(g.trips.reduce((s, t) => s + t.tons, 0))}`;

  const totalTons = rows.reduce((s, t) => s + t.tons, 0);
  const thisMonth = D.trips.filter(t => t.entryDate.slice(0, 7) === today().slice(0, 7));

  const del = async t => {
    if (!window.confirm(`Delete the entry for ${t.truckNo} on ${fmtDay(t.entryDate)}? This also removes its loan deduction. The change log keeps a copy.`)) return;
    try {
      for (const l of D.loans.filter(l => l.tripId === t.id)) await HuskDB.remove("loans", l.id);
      await HuskDB.save("changelog", h.change("mye_husk_trips", t.id, "delete", t, null));
      await HuskDB.remove("trips", t.id);
      h.log && h.log("HUSK_DELETE", `${t.truckNo} ${fmtDay(t.entryDate)} deleted`);
      await h.load();
    } catch (e) { alert("Could not delete: " + (e.message || e)); }
  };

  const pdf = () => {
    const days = groupDays(rows);
    const pr = [];
    days.forEach(g => {
      pr.push({ _group: `${dayLine(g)} · net payable ${fmt(g.trips.reduce((x, t) => x + t.netPayable, 0))}` });
      g.trips.forEach(t => pr.push({ sn: String(serial.get(t.id)), v: t.truckNo, c: nm(D.customers, t.customerId), co: nm(D.companies, t.companyId), m: nm(D.materials, t.materialId), t: String(t.tons), cr: fmt(t.companyRate), pr: fmt(t.customerRate), ca: fmt(t.companyAmount), n: fmt(t.netPayable) }));
    });
    printHuskReport({
      title: "Husk vehicle entries (day-wise)",
      subtitle: [periodText(e.from, e.to), cFilter && nm(D.companies, cFilter), mFilter && nm(D.materials, mFilter)].filter(Boolean).join(" · ") || "All entries",
      summary: [{ label: "Days", value: String(days.length) }, { label: "Entries", value: String(rows.length) }, { label: "Tons", value: fmtTons(totalTons) }, { label: "Net payable to customers", value: fmt(rows.reduce((x, t) => x + t.netPayable, 0)) }],
      columns: [{ key: "sn", label: "#" }, { key: "v", label: "Vehicle" }, { key: "c", label: "Customer" }, { key: "co", label: "Company" }, { key: "m", label: "Material" }, { key: "t", label: "Tons", right: true }, { key: "cr", label: "Co. rate", right: true }, { key: "pr", label: "Cust. rate", right: true }, { key: "ca", label: "Company amount", right: true }, { key: "n", label: "Net payable", right: true }],
      rows: pr,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <KPI label="This month" value={fmtTons(thisMonth.reduce((s, t) => s + t.tons, 0))} sub={`${thisMonth.length} vehicles`} icon="🚛" />
        <KPI label="Showing" value={fmtTons(totalTons)} sub={`${rows.length} entries`} icon="⚖️" />
      </div>
      {P.entry && <Btn full onClick={() => setForm("new")}>＋ New vehicle entry</Btn>}
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <DateInput label="From" value={from} onChange={setFrom} half />
          <DateInput label="To" value={to} onChange={setTo} half />
          <Field label="Company" value={cFilter} onChange={setCFilter} opts={opt(D.companies)} half />
          <Field label="Material" value={mFilter} onChange={setMFilter} opts={opt(D.materials)} half />
          <Field label="Search truck or customer" value={search} onChange={setSearch} />
        </div>
        <div style={{ marginTop: 10 }}><Btn sm outline onClick={pdf}>⬇ PDF report</Btn></div>
      </Card>
      {rows.length === 0 && <Empty>No entries yet.</Empty>}
      {groupDays(rows.slice(0, shown)).map(g => (
        <div key={g.date} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <b style={{ color: C.text }}>{dayName(g.date)}, {fmtDay(g.date)}</b>
            <span style={{ color: C.muted, fontSize: 12 }}>{g.trips.length} trip{g.trips.length === 1 ? "" : "s"} · {fmtTons(g.trips.reduce((x, t) => x + t.tons, 0))}</span>
          </div>
          {g.trips.map(t => (
            <Card key={t.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontWeight: 800, color: C.text }}><span style={{ color: C.muted, fontWeight: 700 }}>#{serial.get(t.id)}</span> · {t.truckNo}</div>
                <div style={{ fontWeight: 800, color: C.accent }}>{fmtTons(t.tons)}</div>
              </div>
              <Muted>{fyLabel(fyStartYear(t.entryDate))} · {nm(D.customers, t.customerId)}</Muted>
              <Muted>{nm(D.companies, t.companyId)} · {nm(D.materials, t.materialId)}</Muted>
              <Muted>Company {fmt(t.companyRate)}/t = {fmt(t.companyAmount)} · Customer {fmt(t.customerRate)}/t = {fmt(t.customerAmount)}</Muted>
              {t.loanDeduction > 0 && <Muted>Loan deducted −{fmt(t.loanDeduction)}</Muted>}
              {t.customerDeduction > 0 && <Muted>Company deduction recovered −{fmt(t.customerDeduction)}</Muted>}
              <div style={{ marginTop: 4, fontWeight: 800, color: C.green }}>Net payable {fmt(t.netPayable)}</div>
              {t.note && <Muted>{t.note}</Muted>}
              {t.editedBy && <Muted>Edited by {t.editedBy} · {t.editedAt}</Muted>}
              {P.admin && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Btn sm outline onClick={() => setForm(t)}>Edit</Btn>
                  <Btn sm outline color={C.red} onClick={() => del(t)}>Delete</Btn>
                </div>
              )}
            </Card>
          ))}
        </div>
      ))}
      {rows.length > shown && <Btn outline onClick={() => setShown(s => s + 40)}>Show more</Btn>}
      {form && <EntryForm h={h} edit={form === "new" ? null : form} onClose={() => setForm(null)} />}
    </div>
  );
}

// ═══════════════════════════ PAYMENTS TAB ═══════════════════════════════════
function PaymentForm({ h, edit, prefill, onClose }) {
  const { fmt, today, uid, Scan } = ui();
  const { data: D, user } = h;
  const act = list => list.filter(x => x.active !== false);
  const kindOf = e => !e ? "customer_paid" : e.src === "loan" ? "loan_given" : e.rec.kind;
  const init = edit ? {
    kind: kindOf(edit), date: edit.rec.date, customerId: edit.rec.customerId || "", companyId: edit.rec.companyId || "", materialId: edit.rec.materialId || "",
    amount: String(edit.rec.amount || ""), deduction: edit.rec.deduction ? String(edit.rec.deduction) : "", deductionReason: edit.rec.deductionReason || "",
    mode: edit.rec.mode || "Cash", note: edit.rec.note || "",
  } : { kind: "customer_paid", date: today(), customerId: "", companyId: "", materialId: "", amount: "", deduction: "", deductionReason: "", mode: "Cash", note: "",
    ...(prefill ? { ...prefill, amount: prefill.amount ? String(Math.round(prefill.amount * 100) / 100) : "" } : {}) };
  const kinds = [{ v: "customer_paid", l: "Paid to customer" }, { v: "company_received", l: "Received from company" }, { v: "loan_given", l: "Husk loan given" }];

  const fields = v => {
    const f = [{ k: "kind", label: "What happened", opts: edit ? kinds.filter(k => k.v === init.kind) : kinds }, { k: "date", label: "Date", type: "date" }];
    if (v.kind === "customer_paid") f.push({ k: "customerId", label: "Customer", opts: opt(act(D.customers), "Select customer") }, { k: "companyId", label: "Against company", opts: opt(act(D.companies), "Select company"), half: true }, { k: "materialId", label: "Against material", opts: opt(act(D.materials), "Select material"), half: true });
    if (v.kind === "company_received") f.push({ k: "companyId", label: "Company", opts: opt(act(D.companies), "Select company"), half: true }, { k: "materialId", label: "Material", opts: opt(act(D.materials), "Select material"), half: true });
    if (v.kind === "loan_given") f.push({ k: "customerId", label: "Customer", opts: opt(act(D.customers), "Select customer") });
    f.push({ k: "amount", label: v.kind === "company_received" ? "Amount received (₹)" : "Amount (₹)", type: "number" });
    if (v.kind === "company_received") f.push({ k: "deduction", label: "Company deduction (₹, if any)", type: "number", half: true, note: "Moisture, shortage, TDS…" }, { k: "deductionReason", label: "Deduction reason", half: true });
    if (v.kind !== "loan_given") f.push({ k: "mode", label: "Mode", opts: MODES });
    f.push({ k: "note", label: "Note (optional)" });
    return f;
  };
  const validate = v => {
    if (!(L.num(v.amount) > 0)) return "Enter the amount.";
    if (v.kind === "customer_paid" && (!v.customerId || !v.companyId || !v.materialId)) return "Choose the customer, company and material.";
    if (v.kind === "company_received" && (!v.companyId || !v.materialId)) return "Choose the company and material.";
    if (v.kind === "loan_given" && !v.customerId) return "Choose the customer.";
    if (v.kind === "company_received" && L.num(v.deduction) > 0 && !String(v.deductionReason).trim()) return "Enter the reason for the deduction.";
    if (edit && edit.src === "payment" && edit.rec.kind === "company_received") {
      const rec = L.recoveredByPayment(D.trips)[edit.rec.id] || 0;
      if (L.num(v.deduction) < rec) return `${fmt(rec)} of this deduction is already recovered through trips; it cannot go below that.`;
    }
    return "";
  };
  const onSave = async v => {
    const id = edit ? edit.rec.id : uid();
    const ts = edit ? edit.rec.ts : Date.now();
    if (v.kind === "loan_given") {
      const rec = { id, customerId: v.customerId, kind: "given", amount: L.num(v.amount), date: v.date, tripId: "", note: v.note, createdBy: edit ? edit.rec.createdBy : user.name, ts };
      await HuskDB.save("loans", rec);
      if (edit) await HuskDB.save("changelog", h.change("mye_husk_loans", id, "edit", edit.rec, rec));
    } else {
      const rec = {
        id, kind: v.kind, date: v.date, companyId: v.companyId, materialId: v.materialId, customerId: v.kind === "customer_paid" ? v.customerId : "",
        amount: L.num(v.amount), deduction: v.kind === "company_received" ? L.num(v.deduction) : 0, deductionReason: v.kind === "company_received" ? v.deductionReason : "",
        mode: v.mode, note: v.note, createdBy: edit ? edit.rec.createdBy : user.name, createdAt: edit ? edit.rec.createdAt : ui().nowTs(), ts,
      };
      await HuskDB.save("payments", rec);
      if (edit) await HuskDB.save("changelog", h.change("mye_husk_payments", id, "edit", edit.rec, rec));
    }
    h.log && h.log("HUSK_PAYMENT", `${v.kind} ${v.amount}`);
    await h.load();
  };
  // Scan a bank / UPI payment screenshot to fill the amount, date and reference; the owner checks it before saving.
  const applyScan = (r, v, setV) => {
    const patch = { mode: "Bank transfer" };
    if (r.amount) patch.amount = String(r.amount);
    if (r.paymentDate) patch.date = r.paymentDate;
    const ref = r.referenceNo || r.transactionId;
    const bits = [ref ? "Ref: " + ref : "", r.paidTo ? "To: " + r.paidTo : ""].filter(Boolean);
    if (bits.length) patch.note = [v.note, ...bits].filter(Boolean).join(" · ");
    if (r.paidTo && !v.customerId && v.kind !== "company_received") {
      const hay = String(r.paidTo).toLowerCase();
      const c = act(D.customers).find(c => c.name.toLowerCase().split(/\s+/).some(p => p.length >= 3 && hay.includes(p)));
      if (c) patch.customerId = c.id;
    }
    setV(p => ({ ...p, ...patch }));
  };
  const header = !edit && Scan ? (v, setV) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Scan onResult={r => applyScan(r, v, setV)} />
      <span style={{ fontSize: 11, color: ui().C.muted }}>Scan a payment screenshot, or fill the form by hand. Check what was read before saving.</span>
    </div>
  ) : null;
  return <FormSheet title={edit ? "Edit payment" : "Record payment"} init={init} fields={fields} validate={validate} onSave={onSave} onClose={onClose} header={header} />;
}

function PaymentsTab({ h }) {
  const { C, Btn, Field, KPI, PillBar, fmt } = ui();
  const { data: D, P } = h;
  const [form, setForm] = useState(null);   // null | "new" | {prefill} | payment item to edit
  const [view, setView] = useState("pay");
  const [kind, setKind] = useState("");
  const [shown, setShown] = useState(40);

  const toPay = useMemo(() => L.customersDue(D), [D]);
  const toReceive = useMemo(() => L.companiesDue(D), [D]);
  const owed = toPay.filter(d => d.total > 0), advances = toPay.filter(d => d.total < 0);
  const payTotal = owed.reduce((x, d) => x + d.total, 0);
  const recvTotal = toReceive.reduce((x, d) => x + d.total, 0);
  const dedOpen = useMemo(() => L.deductionLedger(D).unrecovered, [D]);

  const items = useMemo(() => {
    const a = D.payments.map(p => ({ src: "payment", rec: p, date: p.date, ts: p.ts, kind: p.kind }));
    const b = D.loans.filter(l => l.kind === "given").map(l => ({ src: "loan", rec: l, date: l.date, ts: l.ts, kind: "loan_given" }));
    return [...a, ...b].filter(x => (!kind || x.kind === kind) && (!h.range.from || x.date >= h.range.from) && (!h.range.to || x.date <= h.range.to)).sort((x, y) => y.date.localeCompare(x.date) || y.ts - x.ts);
  }, [D, kind, h.range.from, h.range.to]);

  const del = async it => {
    if (it.src === "payment" && D.trips.some(t => t.dedPaymentId === it.rec.id)) { alert("Part of this payment's deduction has been recovered through trips. Remove it from those trips first."); return; }
    if (!window.confirm("Delete this payment? The change log keeps a copy.")) return;
    try {
      await HuskDB.save("changelog", h.change(it.src === "loan" ? "mye_husk_loans" : "mye_husk_payments", it.rec.id, "delete", it.rec, null));
      await HuskDB.remove(it.src === "loan" ? "loans" : "payments", it.rec.id);
      await h.load();
    } catch (e) { alert("Could not delete: " + (e.message || e)); }
  };

  const label = { customer_paid: ["Paid to customer", C.red], company_received: ["Received from company", C.green], loan_given: ["Husk loan given", C.orange] };
  const line = (key, text, amount, color, action) => (
    <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 12, color: C.text, minWidth: 0 }}>{text}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <b style={{ color }}>{fmt(amount)}</b>
        {action}
      </div>
    </div>
  );
  const isEdit = form && form !== "new" && !form.prefill;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <KPI label="To pay customers" value={fmt(payTotal)} sub={`${owed.length} customer${owed.length === 1 ? "" : "s"}`} color={C.red} icon="💸" />
        <KPI label="To receive from companies" value={fmt(recvTotal)} sub={`${toReceive.filter(c => c.total > 0).length} compan${toReceive.filter(c => c.total > 0).length === 1 ? "y" : "ies"}`} color={C.green} icon="🏭" />
      </div>
      {P.manage && <Btn full onClick={() => setForm("new")}>＋ Record payment</Btn>}
      <PillBar items={[{ id: "pay", label: "To pay customers", color: C.red }, { id: "recv", label: "To receive from companies", color: C.green }, { id: "hist", label: "Payment history", color: C.accent }]} active={view} onSelect={setView} />

      {view === "pay" && (<>
        <Muted>What M Yantra still has to pay each customer: net payable of all their trucks, less what has been paid. It goes down by itself when a payment is recorded. All dates, not just the selected year.</Muted>
        {owed.length === 0 && <Empty>Nothing to pay right now.</Empty>}
        {owed.map(d => (
          <Card key={d.customerId}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontWeight: 800, color: C.text }}>{nm(D.customers, d.customerId)}</div>
              <div style={{ fontWeight: 900, color: C.red }}>{fmt(d.total)}</div>
            </div>
            <Muted>{d.trips} trip{d.trips === 1 ? "" : "s"} · net payable {fmt(d.earned)} · paid {fmt(d.paid)}</Muted>
            <div style={{ marginTop: 6 }}>
              {d.lines.map(l => line(l.companyId + l.materialId, `${nm(D.companies, l.companyId)} · ${nm(D.materials, l.materialId)}`, l.balance, l.balance >= 0 ? C.text : C.green,
                P.manage && l.balance > 0 ? <Btn sm onClick={() => setForm({ prefill: { kind: "customer_paid", customerId: d.customerId, companyId: l.companyId, materialId: l.materialId, amount: l.balance } })}>Pay</Btn> : null))}
              {Math.abs(d.other) > 0.005 && line("other", "Opening balance (no company / material)", d.other, C.text,
                P.manage && d.other > 0 ? <Btn sm onClick={() => setForm({ prefill: { kind: "customer_paid", customerId: d.customerId, amount: d.other } })}>Pay</Btn> : null)}
            </div>
          </Card>
        ))}
        {advances.length > 0 && (
          <Card>
            <div style={{ fontWeight: 800, color: C.text, marginBottom: 4 }}>Advances (customer owes M Yantra)</div>
            {advances.map(d => line(d.customerId, nm(D.customers, d.customerId), -d.total, C.orange, null))}
          </Card>
        )}
      </>)}

      {view === "recv" && (<>
        <Muted>What each company still has to pay M Yantra: billed amount of all trips, less receipts and the deductions they made. All dates.</Muted>
        {toReceive.length === 0 && <Empty>Nothing to receive right now.</Empty>}
        {toReceive.map(c => (
          <Card key={c.companyId}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontWeight: 800, color: C.text }}>{nm(D.companies, c.companyId)}</div>
              <div style={{ fontWeight: 900, color: c.total >= 0 ? C.green : C.orange }}>{fmt(c.total)}</div>
            </div>
            <Muted>Billed {fmt(c.billed)} · received {fmt(c.received)} · deducted by company {fmt(c.deducted)}</Muted>
            <div style={{ marginTop: 6 }}>
              {c.lines.map(l => line(l.materialId, nm(D.materials, l.materialId), l.balance, l.balance >= 0 ? C.text : C.orange,
                P.manage && l.balance > 0 ? <Btn sm onClick={() => setForm({ prefill: { kind: "company_received", companyId: c.companyId, materialId: l.materialId, amount: l.balance } })}>Record receipt</Btn> : null))}
              {Math.abs(c.other) > 0.005 && line("other", "Opening balance (no material)", c.other, C.text, null)}
            </div>
          </Card>
        ))}
        <Card><Muted>Company deductions not yet recovered from customers</Muted><div style={{ fontWeight: 900, color: C.orange }}>{fmt(dedOpen)}</div></Card>
      </>)}

      {view === "hist" && (<>
        <Field label="Show" value={kind} onChange={setKind} opts={[{ v: "", l: "All payments" }, { v: "customer_paid", l: "Paid to customers" }, { v: "company_received", l: "Received from companies" }, { v: "loan_given", l: "Husk loans given" }]} />
        {items.length === 0 && <Empty>No payments in this period.</Empty>}
        {items.slice(0, shown).map(it => {
          const r = it.rec; const [lab, col] = label[it.kind];
          return (
            <Card key={it.src + r.id}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 800, color: col }}>{lab}</div>
                <div style={{ fontWeight: 800 }}>{fmt(r.amount)}</div>
              </div>
              <Muted>{fmtDay(r.date)}{r.customerId ? " · " + nm(D.customers, r.customerId) : ""}{r.companyId ? " · " + nm(D.companies, r.companyId) : ""}{r.materialId ? " · " + nm(D.materials, r.materialId) : ""}</Muted>
              {it.kind === "company_received" && r.deduction > 0 && <Muted>Deduction {fmt(r.deduction)} · {r.deductionReason}</Muted>}
              {(r.mode || r.note) && <Muted>{[r.mode, r.note].filter(Boolean).join(" · ")}</Muted>}
              <Muted>By {r.createdBy}</Muted>
              {P.admin && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Btn sm outline onClick={() => setForm(it)}>Edit</Btn>
                  <Btn sm outline color={C.red} onClick={() => del(it)}>Delete</Btn>
                </div>
              )}
            </Card>
          );
        })}
        {items.length > shown && <Btn outline onClick={() => setShown(s => s + 40)}>Show more</Btn>}
      </>)}
      {form && <PaymentForm h={h} edit={isEdit ? form : null} prefill={form && form.prefill ? form.prefill : null} onClose={() => setForm(null)} />}
    </div>
  );
}

// ═══════════════════════════ LEDGERS TAB ════════════════════════════════════
// Each ledger is shown as separate bordered tables (trips / payments / loan …),
// each with its own summary on top, so nothing is mixed into one long list.
const sn = rows => { let n = 0; return rows.map(r => r._group ? r : ({ sn: String(++n), ...r })); };

// Bold "rate changed" rows placed by date between trips. items: [{date(ISO), row}]
const withRateNotes = (items, events, text) => {
  const notes = events.filter(e => e.from !== null).map(e => ({ date: e.date, row: { _group: text(e), _note: true } }));
  const out = []; let ni = 0;
  items.forEach(it => {
    while (ni < notes.length && notes[ni].date <= it.date) out.push(notes[ni++].row);
    out.push(it.row);
  });
  while (ni < notes.length) out.push(notes[ni++].row);
  return out;
};
const COL = {
  sn: { key: "sn", label: "#", w: 28 }, date: { key: "date", label: "Date", nowrap: true },
  co: { key: "co", label: "Company" }, mat: { key: "mat", label: "Material" }, veh: { key: "veh", label: "Vehicle", nowrap: true },
  cust: { key: "cust", label: "Customer" }, tons: { key: "tons", label: "Tons", right: true },
};
const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);

function buildLedger(D, mode, f) {
  const { fmt } = ui();
  const m = n => fmt(n);
  const dash = n => (n ? fmt(n) : "—");
  const cn = id => (id ? nm(D.companies, id) : "—");
  const mn = id => (id ? nm(D.materials, id) : "—");
  const un = id => (id ? nm(D.customers, id) : "—");
  const filt = { from: f.from || undefined, to: f.to || undefined, companyId: f.companyId || undefined, materialId: f.materialId || undefined };
  const out = { title: "", who: "", pos: "", neg: "", balance: 0, topSummary: [], sections: [] };
  const rateText = e => `RATE CHANGE · ${fmtDay(e.date)} · ${e.side === "company" ? "Company rate" : "Customer rate"} (${e.side === "customer" ? un(e.customerId) + " · " : ""}${cn(e.companyId)} · ${mn(e.materialId)}): ${e.from === null ? "set at " + m(e.to) : m(e.from) + " → " + m(e.to)} per ton`;
  const win = { from: filt.from, to: filt.to };
  const okCo = r => (!filt.companyId || r.companyId === filt.companyId) && (!filt.materialId || r.materialId === filt.materialId);
  const bal = (label, v) => ({ label, value: money(v), color: v >= 0 ? "green" : "red", sub: v >= 0 ? out.pos : out.neg });

  if (mode === "customer") {
    const res = L.customerLedger(D, f.partyId, filt);
    Object.assign(out, { title: "Customer ledger", who: un(f.partyId), pos: "M Yantra owes the customer", neg: "Advance (customer owes M Yantra)", balance: res.balance });
    const open = sum(res.rows.filter(r => r.kind === "Opening"), "amount");
    const trips = res.rows.filter(r => r.kind === "Trip"), paid = res.rows.filter(r => r.kind === "Paid");
    const evs = L.rateChanges(D, win, { customer: r => r.customerId === f.partyId && okCo(r) });
    const tripRows = sn(withRateNotes(trips.map(r => ({ date: r.date, row: { date: fmtDay(r.date), co: cn(r.companyId), mat: mn(r.materialId), veh: r.truckNo, tons: String(r.tons), rate: m(r.rate), gross: m(r.gross), loan: dash(r.loan), ded: dash(r.deduction), net: m(r.amount) } })), evs, rateText));
    const tonsT = sum(trips, "tons"), netT = sum(trips, "amount"), paidT = -sum(paid, "amount");
    out.topSummary = [
      { label: "Opening / brought forward", value: money(open) }, { label: "Net payable (trips)", value: m(netT) },
      { label: "Paid to customer", value: m(paidT) }, { label: "Balance", value: money(res.balance), color: res.balance >= 0 ? "green" : "red", sub: res.balance >= 0 ? out.pos : out.neg },
    ];
    out.sections.push({
      title: "Trips",
      summary: [{ label: "Trips", value: String(trips.length) }, { label: "Tons", value: fmtTons(tonsT) }, { label: "Gross", value: m(sum(trips, "gross")) }, { label: "Loan deducted", value: m(sum(trips, "loan")) }, { label: "Deductions recovered", value: m(sum(trips, "deduction")) }, { label: "Net payable", value: m(netT) }],
      columns: [COL.sn, COL.date, COL.co, COL.mat, COL.veh, COL.tons, { key: "rate", label: "Rate", right: true }, { key: "gross", label: "Gross", right: true }, { key: "loan", label: "Loan ded.", right: true }, { key: "ded", label: "Deduction", right: true }, { key: "net", label: "Net payable", right: true }],
      rows: tripRows, totals: { sn: "", date: "Total", tons: String(Math.round(tonsT * 1000) / 1000), gross: m(sum(trips, "gross")), loan: m(sum(trips, "loan")), ded: m(sum(trips, "deduction")), net: m(netT) },
    });
    out.sections.push({
      title: "Payments to the customer",
      summary: [{ label: "Payments", value: String(paid.length) }, { label: "Total paid", value: m(paidT) }],
      columns: [COL.sn, COL.date, COL.co, COL.mat, { key: "detail", label: "Mode · note" }, { key: "amt", label: "Amount paid", right: true }],
      rows: sn(paid.map(r => ({ date: fmtDay(r.date), co: cn(r.companyId), mat: mn(r.materialId), detail: r.detail || "", amt: m(-r.amount) }))), totals: { sn: "", date: "Total", amt: m(paidT) },
    });
    if (D.loans.some(l => l.customerId === f.partyId)) out.sections.push(loanSection(D, f.partyId, filt, m));
  } else if (mode === "company" || mode === "material") {
    const isCo = mode === "company";
    const res = isCo ? L.companyLedger(D, f.partyId, filt) : L.materialLedger(D, f.partyId, filt);
    Object.assign(out, { title: isCo ? "Company ledger" : "Material ledger", who: isCo ? cn(f.partyId) : mn(f.partyId), pos: isCo ? "Company owes M Yantra" : "Companies owe M Yantra", neg: isCo ? "Company has paid in excess" : "Companies have paid in excess", balance: res.balance });
    const open = sum(res.rows.filter(r => r.kind === "Opening"), "amount");
    const trips = res.rows.filter(r => r.kind === "Trip"), recv = res.rows.filter(r => r.kind === "Received"), dedRows = res.rows.filter(r => r.kind === "Deduction");
    const tonsT = sum(trips, "tons"), billed = sum(trips, "amount"), recvT = -sum(recv, "amount"), dedT = -sum(dedRows, "amount");
    out.topSummary = [
      { label: "Opening / brought forward", value: money(open) }, { label: "Billed (trips)", value: m(billed) },
      { label: "Received", value: m(recvT) }, { label: "Deductions by company", value: m(dedT) },
      { label: "Balance", value: money(res.balance), color: res.balance >= 0 ? "green" : "red", sub: res.balance >= 0 ? out.pos : out.neg },
    ];
    const coCol = isCo ? [] : [COL.co];
    out.sections.push({
      title: "Trips",
      summary: [{ label: "Trips", value: String(trips.length) }, { label: "Tons", value: fmtTons(tonsT) }, { label: "Billed", value: m(billed) }],
      columns: [COL.sn, COL.date, ...coCol, COL.mat, COL.veh, COL.cust, COL.tons, { key: "rate", label: "Rate", right: true }, { key: "amt", label: "Amount", right: true }],
      rows: sn(withRateNotes(trips.map(r => ({ date: r.date, row: { date: fmtDay(r.date), co: cn(r.companyId), mat: mn(r.materialId), veh: r.truckNo, cust: un(r.customerId), tons: String(r.tons), rate: m(r.rate), amt: m(r.amount) } })),
        L.rateChanges(D, win, { company: r => okCo(r) && (isCo ? r.companyId === f.partyId : r.materialId === f.partyId) }), rateText)),
      totals: { sn: "", date: "Total", tons: String(Math.round(tonsT * 1000) / 1000), amt: m(billed) },
    });
    const dedBy = new Map(dedRows.map(d => [d.payId, d]));
    out.sections.push({
      title: "Payments received from the company",
      summary: [{ label: "Receipts", value: String(recv.length) }, { label: "Received", value: m(recvT) }, { label: "Deductions", value: m(dedT) }],
      columns: [COL.sn, COL.date, ...coCol, COL.mat, { key: "detail", label: "Mode · note" }, { key: "amt", label: "Received", right: true }, { key: "ded", label: "Deduction", right: true }, { key: "why", label: "Reason" }],
      rows: sn(recv.map(r => { const d = dedBy.get(r.payId); return { date: fmtDay(r.date), co: cn(r.companyId), mat: mn(r.materialId), detail: r.detail || "", amt: m(-r.amount), ded: d ? m(-d.amount) : "—", why: d ? d.detail : "" }; })),
      totals: { sn: "", date: "Total", amt: m(recvT), ded: m(dedT) },
    });
    if (!isCo && res.perCompany && Object.keys(res.perCompany).length) out.sections.push({
      title: "Balance by company (all dates)",
      columns: [{ key: "co", label: "Company" }, { key: "b", label: "Balance", right: true }],
      rows: Object.entries(res.perCompany).map(([id, b]) => ({ co: cn(id), b: money(b) })),
    });
  } else if (mode === "vehicle") {
    const res = L.vehicleLedger(D, f.partyId, filt);
    const veh = D.vehicles.find(v => v.id === f.partyId);
    Object.assign(out, { title: "Vehicle ledger", who: veh ? veh.truckNo : "—", balance: res.balance });
    const trips = res.rows.filter(r => r.kind === "Trip");
    const combos = new Set(); trips.forEach(t => { combos.add(t.companyId + "|" + t.materialId); combos.add(t.companyId + "|" + t.materialId + "|" + t.customerId); });
    out.topSummary = [{ label: "Trips", value: String(trips.length) }, { label: "Tons", value: fmtTons(res.tons) }, { label: "Net payable to owners", value: m(sum(trips, "amount")) }];
    out.sections.push({
      title: "Trips",
      columns: [COL.sn, COL.date, COL.co, COL.mat, COL.cust, COL.tons, { key: "cr", label: "Co. rate", right: true }, { key: "ur", label: "Cust. rate", right: true }, { key: "net", label: "Net payable", right: true }],
      rows: sn(withRateNotes(trips.map(r => ({ date: r.date, row: { date: fmtDay(r.date), co: cn(r.companyId), mat: mn(r.materialId), cust: un(r.customerId), tons: String(r.tons), cr: m(r.companyRate), ur: m(r.customerRate), net: m(r.amount) } })),
        L.rateChanges(D, win, { company: r => combos.has(r.companyId + "|" + r.materialId), customer: r => combos.has(r.companyId + "|" + r.materialId + "|" + r.customerId) }), rateText)),
      totals: { sn: "", date: "Total", tons: String(Math.round(res.tons * 1000) / 1000), net: m(sum(trips, "amount")) },
    });
  } else if (mode === "loan") {
    Object.assign(out, { title: "Husk loan ledger", who: un(f.partyId), pos: "Customer still owes on the loan", neg: "Loan over-recovered", balance: L.loanBalance(D.loans, f.partyId) });
    const sec = loanSection(D, f.partyId, filt, m);
    out.topSummary = sec.summary;
    out.sections.push({ ...sec, title: "Loan entries", summary: undefined });
  } else {
    const res = L.deductionLedger(D, filt);
    Object.assign(out, { title: "Deduction recovery ledger", who: "All companies", pos: "Deducted by companies, not yet recovered", neg: "Recovered more than deducted", balance: res.unrecovered });
    const ded = res.rows.filter(r => r.kind === "Deducted"), rec = res.rows.filter(r => r.kind === "Recovered");
    out.topSummary = [{ label: "Deducted by companies", value: m(res.deducted) }, { label: "Recovered from customers", value: m(res.recovered) }, { label: "Not yet recovered", value: m(res.unrecovered), color: "orange" }];
    out.sections.push({
      title: "Deducted by companies",
      columns: [COL.sn, COL.date, COL.co, COL.mat, { key: "why", label: "Reason" }, { key: "amt", label: "Amount", right: true }],
      rows: sn(ded.map(r => ({ date: fmtDay(r.date), co: cn(r.companyId), mat: mn(r.materialId), why: r.detail || "", amt: m(r.amount) }))), totals: { sn: "", date: "Total", amt: m(res.deducted) },
    }, {
      title: "Recovered through trips",
      columns: [COL.sn, COL.date, COL.co, COL.mat, COL.cust, { key: "amt", label: "Recovered", right: true }],
      rows: sn(rec.map(r => ({ date: fmtDay(r.date), co: cn(r.companyId), mat: mn(r.materialId), cust: un(r.customerId), amt: m(-r.amount) }))), totals: { sn: "", date: "Total", amt: m(res.recovered) },
    });
  }
  return out;
}

function loanSection(D, customerId, filt, m) {
  const res = L.loanLedger(D, customerId, { from: filt.from, to: filt.to });
  const given = res.rows.filter(r => r.kind === "Loan given"), back = res.rows.filter(r => r.kind === "Recovered");
  const bf = res.rows.find(r => r.kind === "Opening");
  return {
    title: "Husk loan",
    summary: [{ label: "Loan given", value: m(sum(given, "amount")) }, { label: "Recovered on trips", value: m(-sum(back, "amount")) }, { label: "Outstanding", value: m(L.loanBalance(D.loans, customerId)) }],
    columns: [COL.sn, COL.date, { key: "kind", label: "Entry" }, { key: "detail", label: "Details" }, { key: "given", label: "Given", right: true }, { key: "rec", label: "Recovered", right: true }, { key: "bal", label: "Balance", right: true }],
    rows: [...(bf ? [{ sn: "", date: fmtDay(bf.date), kind: "Brought forward", detail: "", given: "", rec: "", bal: m(bf.balance), _bold: true }] : []),
      ...sn(res.rows.filter(r => r.kind !== "Opening").map(r => ({ date: fmtDay(r.date), kind: r.kind, detail: r.detail || "", given: r.kind === "Loan given" ? m(r.amount) : "—", rec: r.kind === "Recovered" ? m(-r.amount) : "—", bal: m(r.balance) })))],
  };
}

function LedgersTab({ h }) {
  const { C, Btn, Field, PillBar } = ui();
  const { data: D } = h;
  const [mode, setMode] = useState("customer");
  const [f, setF] = useState({ partyId: "", companyId: "", materialId: "", from: "", to: "" });
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const modes = [
    { id: "customer", label: "Customer", color: C.purple }, { id: "company", label: "Company", color: C.accent },
    { id: "material", label: "Material", color: C.teal }, { id: "vehicle", label: "Vehicle", color: C.blue },
    { id: "loan", label: "Loan", color: C.orange }, { id: "deduction", label: "Deductions", color: C.red },
  ];
  const needsParty = mode !== "deduction";
  const partyOpts = mode === "customer" || mode === "loan" ? opt(D.customers, "Select customer")
    : mode === "company" ? opt(D.companies, "Select company") : mode === "material" ? opt(D.materials, "Select material")
    : opt(D.vehicles.map(v => ({ id: v.id, name: v.truckNo })), "Select vehicle");
  const ready = !needsParty || f.partyId;
  const e = effRange(h.range, f.from, f.to);
  const fe = { ...f, from: e.from, to: e.to };
  const R = ready ? buildLedger(D, mode, fe) : null;
  const col = c => ({ green: C.green, red: C.red, orange: C.orange }[c]);

  const subtitle = R ? [R.who, periodText(fe.from, fe.to), mode !== "company" && mode !== "material" && f.companyId && nm(D.companies, f.companyId), f.materialId && mode !== "material" && nm(D.materials, f.materialId)].filter(Boolean).join(" · ") : "";
  const pdf = () => R && printHuskReport({
    title: R.title, subtitle,
    summary: R.topSummary.map(s => ({ label: s.label, value: s.value })),
    sections: R.sections.map(s => ({ ...s, summary: s.summary && s.summary.map(x => ({ label: x.label, value: x.value })) })),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PillBar items={modes} active={mode} onSelect={m => { setMode(m); setF(p => ({ ...p, partyId: "" })); }} />
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {needsParty && <Field label={modes.find(m => m.id === mode).label} value={f.partyId} onChange={set("partyId")} opts={partyOpts} />}
          {(mode === "customer" || mode === "deduction" || mode === "material") && <Field label="Company" value={f.companyId} onChange={set("companyId")} opts={opt(D.companies)} half />}
          {(mode === "customer" || mode === "company" || mode === "deduction") && <Field label="Material" value={f.materialId} onChange={set("materialId")} opts={opt(D.materials)} half />}
          <DateInput label="From" value={f.from} onChange={set("from")} half />
          <DateInput label="To" value={f.to} onChange={set("to")} half />
        </div>
      </Card>
      {!ready && <Empty>Choose a {modes.find(m => m.id === mode).label.toLowerCase()} to see the ledger.</Empty>}
      {R && (<>
        <div style={{ fontWeight: 800, color: C.text }}>{R.title} · {R.who}</div>
        <SummaryBoxes items={R.topSummary.map(s => ({ ...s, color: col(s.color) }))} />
        <Btn sm outline onClick={pdf}>⬇ Download PDF</Btn>
        {R.sections.map((s, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 800, color: C.accent, marginTop: 6 }}>{s.title}</div>
            {s.summary && <SummaryBoxes items={s.summary} />}
            <BTable columns={s.columns} rows={s.rows} totals={s.totals} empty="Nothing in this period." />
          </div>
        ))}
      </>)}
    </div>
  );
}

// ═══════════════════════════ RATES TAB ══════════════════════════════════════
function RatesTab({ h }) {
  const { C, fmt, today, Btn } = ui();
  const { data: D } = h;
  const [open, setOpen] = useState("");
  const [edit, setEdit] = useState(null);
  const t = today();
  const tbl = side => (side === "company" ? "companyRates" : "customerRates");

  // Rates after an edit (next = changed row) or delete (next = null); returns the entries that would be repriced
  const plan = (side, row, next) => {
    const co = D.companyRates.filter(r => side !== "company" || r.id !== row.id).concat(side === "company" && next ? [next] : []);
    const cu = D.customerRates.filter(r => side !== "customer" || r.id !== row.id).concat(side === "customer" && next ? [next] : []);
    const from = next && next.effectiveFrom < row.effectiveFrom ? next.effectiveFrom : row.effectiveFrom;
    const scope = side === "company" ? { kind: "company", companyId: row.companyId, materialId: row.materialId, from } : { kind: "customer", customerId: row.customerId, companyId: row.companyId, materialId: row.materialId, from };
    return { co, cu, changed: planRepriceTrips(D.trips, co, cu, [scope]) };
  };
  const apply = async (side, row, next, action) => {
    const { changed } = plan(side, row, next);
    const tn = side === "company" ? "mye_husk_company_rates" : "mye_husk_customer_rates";
    if (next) await HuskDB.save(tbl(side), next); else await HuskDB.remove(tbl(side), row.id);
    await HuskDB.save("changelog", h.change(tn, row.id, action, row, next));
    if (changed.length) {
      const edited = changed.map(c => ({ ...c.after, editedBy: h.user.name, editedAt: ui().nowTs() }));
      await HuskDB.saveMany("trips", edited);
      await HuskDB.saveMany("changelog", changed.map((c, i) => h.change("mye_husk_trips", c.before.id, "reprice", c.before, edited[i])));
    }
    await h.load();
  };
  const removeRate = async (side, row) => {
    const n = plan(side, row, null).changed.length;
    if (!window.confirm(`Delete the ${fmt(row.rate)}/t rate from ${fmtDay(row.effectiveFrom)}?\n\n` + (n ? `${n} entr${n === 1 ? "y" : "ies"} will fall back to the earlier rate and be repriced.` : "No existing entry changes price.") + "\nThe change log keeps a copy.")) return;
    try { await apply(side, row, null, "delete"); } catch (e) { alert("Could not delete: " + (e.message || e)); }
  };

  const companyGroups = useMemo(() => {
    const m = new Map();
    D.companyRates.forEach(r => { const k = r.companyId + "|" + r.materialId; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m.entries()].map(([k, rows]) => ({ k, rows: rows.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.ts - a.ts), title: `${nm(D.companies, rows[0].companyId)} · ${nm(D.materials, rows[0].materialId)}` }));
  }, [D]);
  const customerGroups = useMemo(() => {
    const m = new Map();
    D.customerRates.forEach(r => { const k = r.customerId + "|" + r.materialId + "|" + r.companyId; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m.entries()].map(([k, rows]) => ({ k, rows: rows.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.ts - a.ts), title: `${nm(D.customers, rows[0].customerId)} · ${nm(D.companies, rows[0].companyId)} · ${nm(D.materials, rows[0].materialId)}` }));
  }, [D]);

  const block = (title, groups, side) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 800, color: C.text }}>{title}</div>
      {groups.length === 0 && <Empty>No rates yet.</Empty>}
      {groups.map(g => {
        const cur = L.pickRate(g.rows, t);
        const isOpen = open === g.k;
        return (
          <Card key={g.k}>
            <div onClick={() => setOpen(isOpen ? "" : g.k)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{g.title}</div>
                <div style={{ fontWeight: 800, color: C.accent, whiteSpace: "nowrap" }}>{cur ? fmt(cur.rate) + "/t" : "not started"}</div>
              </div>
              <Muted>{cur ? "since " + fmtDay(cur.effectiveFrom) : "starts " + fmtDay(g.rows[g.rows.length - 1].effectiveFrom)} · {g.rows.length} rate{g.rows.length === 1 ? "" : "s"} · tap for history</Muted>
            </div>
            {isOpen && (
              <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                {g.rows.map(r => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 0" }}>
                    <span>from {fmtDay(r.effectiveFrom)}{r.effectiveFrom > t ? " (upcoming)" : ""}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span><b>{fmt(r.rate)}</b> <span style={{ color: C.muted }}>· {r.createdBy}</span></span>
                      {h.P.admin && <>
                        <Btn sm outline onClick={() => setEdit({ side, row: r })}>Edit</Btn>
                        <Btn sm outline color={C.red} onClick={() => removeRate(side, r)}>Delete</Btn>
                      </>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Muted>Rates are added or changed in the New vehicle entry form (Husk manager or owner). The owner can also edit or delete a wrong rate here. Every change is kept in the change log.</Muted>
      {block("Company rates (company pays M Yantra)", companyGroups, "company")}
      {block("Customer rates (M Yantra pays customer)", customerGroups, "customer")}
      {edit && <FormSheet title="Edit rate" onClose={() => setEdit(null)} init={{ rate: String(edit.row.rate), effectiveFrom: edit.row.effectiveFrom }}
        fields={[{ k: "rate", label: "Rate per ton (₹)", type: "number", half: true }, { k: "effectiveFrom", label: "Effective from", type: "date", half: true }]}
        validate={v => !(L.num(v.rate) > 0) ? "Enter a rate above 0." : !v.effectiveFrom ? "Pick the effective date." : ""}
        hint={v => { const n = plan(edit.side, edit.row, { ...edit.row, rate: L.num(v.rate), effectiveFrom: v.effectiveFrom }).changed.length; return n ? <Warn>{n} entr{n === 1 ? "y" : "ies"} will be repriced. The change log keeps the old and new amounts.</Warn> : null; }}
        onSave={v => apply(edit.side, edit.row, { ...edit.row, rate: L.num(v.rate), effectiveFrom: v.effectiveFrom }, "edit")} />}
    </div>
  );
}

// ═══════════════════════════ LOANS TAB ══════════════════════════════════════
function LoansTab({ h }) {
  const { C, Btn, fmt } = ui();
  const { data: D, P } = h;
  const [open, setOpen] = useState("");
  const [form, setForm] = useState(false);
  const list = D.customers.map(c => ({ c, bal: L.loanBalance(D.loans, c.id), has: D.loans.some(l => l.customerId === c.id) })).filter(x => x.has || x.c.loanPerTrip > 0);
  const total = list.reduce((s, x) => s + x.bal, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {P.manage && <Btn full onClick={() => setForm(true)}>＋ Give a Husk loan</Btn>}
      <Card><Muted>Total outstanding Husk loans</Muted><div style={{ fontSize: 22, fontWeight: 900, color: C.orange }}>{fmt(total)}</div></Card>
      {list.length === 0 && <Empty>No Husk loans yet.</Empty>}
      {list.map(({ c, bal }) => {
        const sec = open === c.id ? loanSection(D, c.id, {}, n => fmt(n)) : null;
        return (
          <Card key={c.id}>
            <div onClick={() => setOpen(open === c.id ? "" : c.id)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 800, color: C.text }}>{c.name}</div>
                <div style={{ fontWeight: 800, color: bal > 0 ? C.orange : C.green }}>{fmt(bal)}</div>
              </div>
              <Muted>Deducted per trip: {c.loanPerTrip > 0 ? fmt(c.loanPerTrip) : "not set"} · tap for the loan ledger</Muted>
            </div>
            {sec && <div style={{ marginTop: 10 }}><BTable columns={sec.columns} rows={sec.rows} empty="No loan entries." /></div>}
          </Card>
        );
      })}
      {form && <PaymentForm h={h} edit={null} prefill={{ kind: "loan_given" }} onClose={() => setForm(false)} />}
    </div>
  );
}

// ═══════════════════════════ PROFIT TAB ═════════════════════════════════════
function ProfitTab({ h }) {
  const { C, Btn, Field, PillBar, KPI, fmt } = ui();
  const { data: D } = h;
  const [f, setF] = useState({ from: "", to: "", companyId: "", materialId: "", customerId: "", vehicleId: "" });
  const [dim, setDim] = useState("company");
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const pe = effRange(h.range, f.from, f.to);
  const filt = Object.fromEntries(Object.entries({ ...f, from: pe.from, to: pe.to }).map(([k, v]) => [k, v || undefined]));
  const s = L.profitSummary(D, filt);
  const rows = L.profitBy(D, dim, filt);
  const label = id => dim === "company" ? nm(D.companies, id) : dim === "customer" ? nm(D.customers, id) : dim === "material" ? nm(D.materials, id) : (D.vehicles.find(v => v.id === id) || {}).truckNo || "—";
  const pdf = () => printHuskReport({
    title: "Husk profit report",
    subtitle: [periodText(pe.from, pe.to) || "All time", f.companyId && nm(D.companies, f.companyId), f.materialId && nm(D.materials, f.materialId), f.customerId && nm(D.customers, f.customerId), f.vehicleId && (D.vehicles.find(v => v.id === f.vehicleId) || {}).truckNo].filter(Boolean).join(" · "),
    summary: [{ label: "Profit", value: fmt(s.profit) }, { label: "Tons", value: fmtTons(s.tons) }, { label: "Per ton", value: fmt(s.perTon) }, { label: "Billed to companies", value: fmt(s.billed) }, { label: "Payable to customers", value: fmt(s.payable) }, { label: "Rate margin", value: fmt(s.margin) }, ...(s.deductionsAttributed ? [{ label: "Deductions", value: fmt(s.deductions) }, { label: "Recovered", value: fmt(s.recovered) }] : [])],
    columns: [{ key: "n", label: { company: "Company", customer: "Customer", material: "Material", vehicle: "Vehicle" }[dim] }, { key: "t", label: "Tons", right: true }, { key: "m", label: "Rate margin", right: true }, { key: "d", label: "Deductions", right: true }, { key: "r", label: "Recovered", right: true }, { key: "p", label: "Profit", right: true }],
    rows: rows.map(r => ({ n: label(r.id), t: String(r.tons), m: fmt(r.margin), d: r.deductionsAttributed && (dim === "company" || dim === "material") ? fmt(r.deductions) : "—", r: r.deductionsAttributed && (dim === "company" || dim === "material") ? fmt(r.recovered) : "—", p: fmt(r.profit) })),
    note: s.deductionsAttributed ? "" : "Company deductions belong to company payments, so this cut shows the rate margin only.",
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <DateInput label="From" value={f.from} onChange={set("from")} half />
          <DateInput label="To" value={f.to} onChange={set("to")} half />
          <Field label="Company" value={f.companyId} onChange={set("companyId")} opts={opt(D.companies)} half />
          <Field label="Material" value={f.materialId} onChange={set("materialId")} opts={opt(D.materials)} half />
          <Field label="Customer" value={f.customerId} onChange={set("customerId")} opts={opt(D.customers)} half />
          <Field label="Vehicle" value={f.vehicleId} onChange={set("vehicleId")} opts={opt(D.vehicles.map(v => ({ id: v.id, name: v.truckNo })))} half />
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <KPI label="Profit" value={fmt(s.profit)} color={s.profit >= 0 ? C.green : C.red} sub={`${fmt(s.perTon)} per ton`} icon="📈" />
        <KPI label="Tons" value={fmtTons(s.tons)} icon="⚖️" />
        <KPI label="Billed to companies" value={fmt(s.billed)} />
        <KPI label="Payable to customers" value={fmt(s.payable)} />
        <KPI label="Rate margin" value={fmt(s.margin)} />
        {s.deductionsAttributed && <KPI label="Deductions − recovered" value={fmt(s.deductions - s.recovered)} sub={`${fmt(s.deductions)} deducted, ${fmt(s.recovered)} recovered`} color={C.orange} />}
      </div>
      <Btn sm outline onClick={pdf}>⬇ Download PDF</Btn>
      {!s.deductionsAttributed && <Muted>Company deductions belong to company payments, not to a customer or vehicle, so this view shows the rate margin only.</Muted>}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div><Muted>Companies still owe M Yantra</Muted><div style={{ fontWeight: 900, color: C.accent }}>{money(L.receivableFromCompanies(D))}</div></div>
          <div style={{ textAlign: "right" }}><Muted>M Yantra owes customers</Muted><div style={{ fontWeight: 900, color: C.purple }}>{money(L.payableToCustomers(D))}</div></div>
        </div>
      </Card>
      <PillBar items={[{ id: "company", label: "By company", color: C.accent }, { id: "customer", label: "By customer", color: C.purple }, { id: "material", label: "By material", color: C.teal }, { id: "vehicle", label: "By vehicle", color: C.blue }]} active={dim} onSelect={setDim} />
      {rows.length === 0 && <Empty>No entries for these filters.</Empty>}
      {rows.map(r => (
        <Card key={r.id}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 800, color: C.text }}>{label(r.id)}</div>
            <div style={{ fontWeight: 800, color: r.profit >= 0 ? C.green : C.red }}>{fmt(r.profit)}</div>
          </div>
          <Muted>{fmtTons(r.tons)} · margin {fmt(r.margin)}{dim === "company" || dim === "material" ? ` · deductions ${fmt(r.deductions)} · recovered ${fmt(r.recovered)}` : ""}</Muted>
        </Card>
      ))}
    </div>
  );
}

// ═══════════════════════════ SETUP TAB ══════════════════════════════════════
function SetupTab({ h }) {
  const { C, Btn, PillBar, fmt, today, uid } = ui();
  const { data: D, user } = h;
  const [sec, setSec] = useState("companies");
  const [form, setForm] = useState(null);
  const ACTIVE = { k: "active", label: "Status", opts: [{ v: "yes", l: "Active" }, { v: "no", l: "Inactive (hidden from pickers)" }] };

  const saveMaster = async (key, table, edit, rec) => {
    await HuskDB.save(key, rec);
    if (edit) await HuskDB.save("changelog", h.change(table, rec.id, "edit", edit, rec));
    await h.load();
  };
  const nameDup = (list, name, id) => list.some(x => x.id !== id && x.name.trim().toLowerCase() === name.trim().toLowerCase());

  const open = (kind, edit) => setForm({ kind, edit });
  const close = () => setForm(null);
  const e = form && form.edit;

  const renderForm = () => {
    if (!form) return null;
    const { kind } = form;
    if (kind === "company" || kind === "material") {
      const key = kind === "company" ? "companies" : "materials";
      const table = kind === "company" ? "mye_husk_companies" : "mye_husk_materials";
      const list = D[key];
      return <FormSheet key={kind + (e ? e.id : "new")} title={(e ? "Edit " : "Add ") + kind} onClose={close}
        init={{ name: e ? e.name : "", contact: e ? e.contact : "", active: !e || e.active ? "yes" : "no" }}
        fields={[{ k: "name", label: "Name" }, ...(kind === "company" ? [{ k: "contact", label: "Contact (optional)" }] : []), ACTIVE]}
        validate={v => !v.name.trim() ? "Enter a name." : nameDup(list, v.name, e && e.id) ? "That name already exists." : ""}
        onSave={v => saveMaster(key, table, e, { ...(e || { id: uid(), ...h.meta() }), name: v.name.trim(), ...(kind === "company" ? { contact: v.contact } : {}), active: v.active === "yes" })} />;
    }
    if (kind === "customer") {
      return <FormSheet key={"cu" + (e ? e.id : "new")} title={e ? "Edit customer" : "Add customer"} onClose={close}
        init={{ name: e ? e.name : "", phone: e ? e.phone : "", loanPerTrip: e && e.loanPerTrip ? String(e.loanPerTrip) : "", active: !e || e.active ? "yes" : "no" }}
        fields={[{ k: "name", label: "Name" }, { k: "phone", label: "Phone (optional)" }, { k: "loanPerTrip", label: "Husk loan deducted per trip (₹)", type: "number", note: "Each trip deducts this, or what is left of the loan if smaller." }, ACTIVE]}
        validate={v => !v.name.trim() ? "Enter a name." : nameDup(D.customers, v.name, e && e.id) ? "That name already exists." : ""}
        onSave={v => saveMaster("customers", "mye_husk_customers", e, { ...(e || { id: uid(), ...h.meta() }), name: v.name.trim(), phone: v.phone, loanPerTrip: L.num(v.loanPerTrip), active: v.active === "yes" })} />;
    }
    if (kind === "opening") {
      return <FormSheet key={"op" + (e ? e.id : "new")} title={e ? "Edit opening balance" : "Add opening balance"} onClose={close}
        init={e ? { partyType: e.partyType, partyId: e.partyId, companyId: e.companyId, materialId: e.materialId, dir: e.amount < 0 ? "neg" : "pos", amount: String(Math.abs(e.amount)), asOf: e.asOf, note: e.note }
          : { partyType: "customer", partyId: "", companyId: "", materialId: "", dir: "pos", amount: "", asOf: today(), note: "" }}
        fields={v => [
          { k: "partyType", label: "For", opts: [{ v: "customer", l: "A customer" }, { v: "company", l: "A company" }] },
          { k: "partyId", label: v.partyType === "customer" ? "Customer" : "Company", opts: opt(v.partyType === "customer" ? D.customers : D.companies, "Select") },
          ...(v.partyType === "customer" ? [{ k: "companyId", label: "Company (optional)", opts: opt(D.companies, "Not specific"), half: true }] : []),
          { k: "materialId", label: "Material (optional)", opts: opt(D.materials, "Not specific"), half: true },
          { k: "dir", label: "Direction", opts: v.partyType === "customer"
            ? [{ v: "pos", l: "M Yantra owes the customer (+)" }, { v: "neg", l: "Advance: customer owes M Yantra (−)" }]
            : [{ v: "pos", l: "Company owes M Yantra (+)" }, { v: "neg", l: "M Yantra owes the company (−)" }] },
          { k: "amount", label: "Amount (₹)", type: "number", half: true },
          { k: "asOf", label: "As of", type: "date", half: true },
          { k: "note", label: "Note (optional)" },
        ]}
        validate={v => !(v.partyType === "customer" ? D.customers : D.companies).some(x => x.id === v.partyId) ? "Choose who this is for." : !(L.num(v.amount) > 0) ? "Enter the amount." : !v.asOf ? "Choose the date." : ""}
        onSave={async v => {
          const rec = { ...(e || { id: uid(), ts: Date.now(), createdBy: user.name }), partyType: v.partyType, partyId: v.partyId, companyId: v.partyType === "customer" ? v.companyId : "", materialId: v.materialId, amount: (v.dir === "neg" ? -1 : 1) * L.num(v.amount), asOf: v.asOf, note: v.note };
          await saveMaster("openings", "mye_husk_openings", e, rec);
        }} />;
    }
    return null;
  };

  const list = (items, render) => items.length ? items.map(render) : <Empty>Nothing added yet.</Empty>;
  const row = (key, title, sub, onEdit, extra) => (
    <Card key={key}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div><div style={{ fontWeight: 800, color: C.text }}>{title}</div>{sub && <Muted>{sub}</Muted>}</div>
        <div style={{ display: "flex", gap: 6 }}>{extra}{onEdit && <Btn sm outline onClick={onEdit}>Edit</Btn>}</div>
      </div>
    </Card>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PillBar items={[{ id: "companies", label: "Companies", color: C.accent }, { id: "materials", label: "Materials", color: C.teal }, { id: "customers", label: "Customers", color: C.purple }, { id: "vehicles", label: "Vehicles", color: C.blue }, { id: "openings", label: "Opening balances", color: C.orange }]} active={sec} onSelect={setSec} />
      {sec === "companies" && (<><Btn full onClick={() => open("company")}>＋ Add company</Btn>{list(D.companies, c => row(c.id, c.name + (c.active ? "" : " (inactive)"), c.contact, () => open("company", c)))}</>)}
      {sec === "materials" && (<><Btn full onClick={() => open("material")}>＋ Add material</Btn>{list(D.materials, m => row(m.id, m.name + (m.active ? "" : " (inactive)"), "", () => open("material", m)))}</>)}
      {sec === "customers" && (<><Muted>New owners are added in the New vehicle entry form. Here you can edit a customer (phone, loan per trip, active).</Muted>{list(D.customers, c => row(c.id, c.name + (c.active ? "" : " (inactive)"), [c.phone, c.loanPerTrip > 0 ? `loan ${fmt(c.loanPerTrip)}/trip` : ""].filter(Boolean).join(" · "), () => open("customer", c)))}</>)}
      {sec === "vehicles" && (<><Muted>New vehicles and owner changes are made in the New vehicle entry form. Ownership history is shown here.</Muted>{list(D.vehicles, v => {
        const hist = D.vehicleOwners.filter(o => o.vehicleId === v.id).sort((a, b) => (b.fromDate || "").localeCompare(a.fromDate || ""));
        return (
          <Card key={v.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontWeight: 800, color: C.text }}>{v.truckNo}</div><Muted>Owner: {nm(D.customers, v.customerId)}</Muted></div>
            </div>
            {hist.length > 1 && <div style={{ marginTop: 6 }}>{hist.map(o => <Muted key={o.id}>{nm(D.customers, o.customerId)}: {o.fromDate ? fmtDay(o.fromDate) : "start"} → {o.toDate ? fmtDay(o.toDate) : "now"}</Muted>)}</div>}
          </Card>
        );
      })}</>)}
      {sec === "openings" && (<><Btn full onClick={() => open("opening")}>＋ Add opening balance</Btn>{list([...D.openings].sort((a, b) => b.asOf.localeCompare(a.asOf)), o => row(o.id,
        `${o.partyType === "customer" ? nm(D.customers, o.partyId) : nm(D.companies, o.partyId)} · ${money(o.amount)}`,
        `${o.partyType === "customer" ? "Customer" : "Company"} · as of ${fmtDay(o.asOf)}${o.companyId ? " · " + nm(D.companies, o.companyId) : ""}${o.materialId ? " · " + nm(D.materials, o.materialId) : ""}${o.note ? " · " + o.note : ""}`,
        h.P.admin ? () => open("opening", o) : null,
        h.P.admin ? <Btn sm outline color={C.red} onClick={async () => { if (!window.confirm("Delete this opening balance?")) return; await HuskDB.save("changelog", h.change("mye_husk_openings", o.id, "delete", o, null)); await HuskDB.remove("openings", o.id); await h.load(); }}>Delete</Btn> : null))}</>)}
      {renderForm()}
    </div>
  );
}

// ═══════════════════════════ CHANGE LOG ═════════════════════════════════════
function LogTab({ h }) {
  const { C, Btn } = ui();
  const { data: D } = h;
  const [shown, setShown] = useState(40);
  const rows = [...D.changelog].sort((a, b) => b.ts - a.ts);
  const brief = o => {
    if (!o) return "—";
    const bits = [];
    if (o.tons !== undefined) bits.push(`${o.tons}t`);
    if (o.companyRate !== undefined) bits.push(`co ₹${o.companyRate}`);
    if (o.customerRate !== undefined) bits.push(`cust ₹${o.customerRate}`);
    if (o.companyAmount !== undefined) bits.push(`co ₹${o.companyAmount}`);
    if (o.customerAmount !== undefined) bits.push(`cust ₹${o.customerAmount}`);
    if (o.rate !== undefined) bits.push(`rate ₹${o.rate}`);
    if (o.amount !== undefined && o.tons === undefined) bits.push(`₹${o.amount}`);
    if (o.name) bits.push(o.name);
    if (o.truckNo && o.tons === undefined) bits.push(o.truckNo);
    return bits.join(" · ") || "—";
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.length === 0 && <Empty>No changes recorded yet.</Empty>}
      {rows.slice(0, shown).map(r => (
        <Card key={r.id}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 800, color: C.text, textTransform: "capitalize" }}>{r.action} · {r.tableName.replace("mye_husk_", "")}</div>
            <Muted>{r.at}</Muted>
          </div>
          <Muted>By {r.by}</Muted>
          {(r.before || r.after) && <Muted>{brief(r.before)} → {brief(r.after)}</Muted>}
        </Card>
      ))}
      {rows.length > shown && <Btn outline onClick={() => setShown(s => s + 40)}>Show more</Btn>}
    </div>
  );
}
