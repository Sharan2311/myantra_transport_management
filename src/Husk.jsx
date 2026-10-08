// ─── Husk.jsx — Husk module screens (rice / tuvar / soya … husk supply) ──────
// Rules live in husk_logic.js (tested), storage in db.js (HuskDB), small shared
// widgets and PDF in husk_ui.jsx. App.jsx passes its own theme + components in
// through the `ui` prop so this file looks and behaves like the rest of the app.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { HuskDB } from "./db.js";
import * as L from "./husk_logic.js";
import { setHuskUI, ui, Card, Muted, Empty, Warn, DateInput, fmtDay, fmtTons, money, printHuskReport, periodText, fyRange, fyLabel, fyStartYear } from "./husk_ui.jsx";

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

// ── Generic form sheet ───────────────────────────────────────────────────────
function FormSheet({ title, fields, init, onSave, onClose, validate, hint, saveLabel = "Save" }) {
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
  const { data: D, user } = h;
  const [date, setDate] = useState(edit ? edit.entryDate : today());
  const [companyId, setCompanyId] = useState(edit ? edit.companyId : "");
  const [materialId, setMaterialId] = useState(edit ? edit.materialId : "");
  const [vehicleId, setVehicleId] = useState(edit ? edit.vehicleId : "");
  const [q, setQ] = useState("");
  const [newVeh, setNewVeh] = useState(false);
  const [newTruck, setNewTruck] = useState("");
  const [newCust, setNewCust] = useState("");
  const [tons, setTons] = useState(edit ? String(edit.tons) : "");
  const [dedId, setDedId] = useState(edit ? edit.dedPaymentId : "");
  const [dedAmt, setDedAmt] = useState(edit && edit.customerDeduction ? String(edit.customerDeduction) : "");
  const [note, setNote] = useState(edit ? edit.note : "");
  const [busy, setBusy] = useState(false);

  const vehicle = D.vehicles.find(v => v.id === vehicleId);
  const customerId = edit ? edit.customerId : newVeh ? newCust : vehicle ? ownerAt(vehicle, D.vehicleOwners, date) : "";
  const customer = D.customers.find(c => c.id === customerId);
  const cr = edit ? { rate: edit.companyRate } : (companyId && materialId ? L.companyRateFor(D.companyRates, companyId, materialId, date) : null);
  const pr = edit ? { rate: edit.customerRate } : (customerId && companyId && materialId ? L.customerRateFor(D.customerRates, customerId, materialId, companyId, date) : null);
  const loanDed = edit ? edit.loanDeduction : (customer ? L.loanDeductionFor(customer, D.loans) : 0);
  const tonsN = L.num(tons);
  const entryFy = fyStartYear(date);
  const tripsOther = edit ? D.trips.filter(t => t.id !== edit.id) : D.trips;
  const opens = companyId ? L.openDeductions(D.payments, tripsOther, companyId) : [];
  const selOpen = opens.find(o => o.payment.id === dedId);
  const base = L.computeAmounts({ tons: tonsN, companyRate: cr && cr.rate, customerRate: pr && pr.rate, loanDeduction: loanDed });
  const dedMax = selOpen ? Math.min(selOpen.open, Math.max(0, base.customerAmount - loanDed)) : 0;
  const dedN = selOpen ? L.num(dedAmt) : 0;
  const amt = L.computeAmounts({ tons: tonsN, companyRate: cr && cr.rate, customerRate: pr && pr.rate, loanDeduction: loanDed, customerDeduction: dedN });

  const matches = useMemo(() => {
    const k = normTruck(q);
    if (!k) return [];
    return D.vehicles.filter(v => normTruck(v.truckNo).includes(k)).slice(0, 6);
  }, [q, D.vehicles]);

  const errors = [];
  if (!edit) {
    if (!companyId || !materialId) errors.push("Choose a company and a material.");
    if (!newVeh && !vehicle) errors.push("Choose a vehicle.");
    if (newVeh && (!newTruck.trim() || !newCust)) errors.push("Enter the truck number and its owner.");
  }
  if (!(tonsN > 0)) errors.push("Enter the unloaded tons.");
  if (companyId && materialId && !edit && !cr) errors.push(`No company rate for ${nm(D.companies, companyId)} / ${nm(D.materials, materialId)} on ${fmtDay(date)}. Add it under Rates first.`);
  if (customerId && companyId && materialId && !edit && !pr) errors.push(`No rate for ${nm(D.customers, customerId)} on ${nm(D.companies, companyId)} / ${nm(D.materials, materialId)} on ${fmtDay(date)}. Add it under Rates first.`);
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
        let vId = vehicleId, truckNo = vehicle ? vehicle.truckNo : "";
        if (newVeh) {
          if (D.vehicles.some(v => normTruck(v.truckNo) === normTruck(newTruck))) { alert("This truck number already exists. Search for it instead."); setBusy(false); return; }
          vId = uid(); truckNo = newTruck.trim().toUpperCase();
          await HuskDB.save("vehicles", { id: vId, truckNo, customerId: newCust, ...h.meta() });
          await HuskDB.save("vehicleOwners", { id: uid(), vehicleId: vId, customerId: newCust, fromDate: "", toDate: "", ts, createdBy: user.name });
        }
        const trip = {
          id: uid(), entryDate: date, companyId, materialId, vehicleId: vId, truckNo, customerId, tons: tonsN,
          companyRate: L.num(cr.rate), customerRate: L.num(pr.rate),
          companyAmount: amt.companyAmount, customerAmount: amt.customerAmount, loanDeduction: loanDed,
          customerDeduction: dedN > 0 ? dedN : 0, dedPaymentId: dedN > 0 ? dedId : "", netPayable: amt.netPayable,
          note, enteredBy: user.name, enteredAt: nowTs(), editedBy: "", editedAt: "", ts,
        };
        await HuskDB.save("trips", trip);
        if (loanDed > 0) await HuskDB.save("loans", { id: uid(), customerId, kind: "recovered", amount: loanDed, date, tripId: trip.id, note: "Deducted on trip " + truckNo, createdBy: user.name, ts });
        h.log && h.log("HUSK_ENTRY", `${truckNo} ${tonsN}t ${nm(D.companies, companyId)}`);
      }
      await h.load();
      onClose();
    } catch (e) { alert("Could not save: " + (e.message || e)); setBusy(false); }
  };

  const act = list => list.filter(x => x.active !== false);
  return (
    <Sheet title={edit ? `Edit entry · ${edit.truckNo}` : "New vehicle entry"} onClose={onClose} noBackdropClose>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {edit ? (
          <div style={{ flex: "1 1 100%" }}>
            <Muted>{fmtDay(edit.entryDate)} · {edit.truckNo} · {nm(D.customers, edit.customerId)}</Muted>
            <Muted>{nm(D.companies, edit.companyId)} · {nm(D.materials, edit.materialId)} · rates stay as saved (change them under Rates)</Muted>
          </div>
        ) : (<>
          <DateInput label="Date" value={date} onChange={setDate} />
          <div style={{ flex: "1 1 100%", fontSize: 12, color: C.muted }}>Financial year: <b style={{ color: C.text }}>{entryFy ? fyLabel(entryFy) : "—"}</b> (from the date){h.fy && entryFy && String(entryFy) !== h.fy ? <span style={{ color: C.orange }}> · not the year selected at the top, so it will not show in the list until you switch</span> : null}</div>
          <Field label="Company" value={companyId} onChange={setCompanyId} opts={opt(act(D.companies), "Select company")} half />
          <Field label="Material" value={materialId} onChange={setMaterialId} opts={opt(act(D.materials), "Select material")} half />
          <div style={{ flex: "1 1 100%" }}>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Vehicle</div>
            {vehicle && !newVeh ? (
              <div style={{ background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><b>{vehicle.truckNo}</b><Muted>Owner: {nm(D.customers, customerId)}</Muted></div>
                <Btn sm outline onClick={() => { setVehicleId(""); setQ(""); }}>Change</Btn>
              </div>
            ) : newVeh ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Field label="New truck number" value={newTruck} onChange={setNewTruck} placeholder="e.g. KA01AB1234" />
                <Field label="Owner (customer)" value={newCust} onChange={setNewCust} opts={opt(act(D.customers), "Select owner")} />
                <div><Btn sm outline onClick={() => setNewVeh(false)}>Back to search</Btn></div>
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
                <div><Btn sm outline onClick={() => { setNewVeh(true); setNewTruck(q.trim().toUpperCase()); }}>＋ New vehicle</Btn></div>
              </div>
            )}
          </div>
        </>)}

        <Field label="Unloaded tons" type="number" value={tons} onChange={setTons} placeholder="e.g. 10.5" />

        {(cr || pr) && (
          <div style={{ flex: "1 1 100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: 1.7 }}>
            <div>Company rate <b>{cr ? fmt(cr.rate) : "—"}</b>/t → <b>{fmt(amt.companyAmount)}</b></div>
            <div>Customer rate <b>{pr ? fmt(pr.rate) : "—"}</b>/t → <b>{fmt(amt.customerAmount)}</b></div>
            {loanDed > 0 && <div style={{ color: C.orange }}>Husk loan deducted: −{fmt(loanDed)}</div>}
            {dedN > 0 && <div style={{ color: C.orange }}>Company deduction recovered: −{fmt(dedN)}</div>}
            <div style={{ marginTop: 4, fontWeight: 800 }}>Net payable to {customer ? customer.name : "customer"}: {fmt(amt.netPayable)}</div>
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
    ).sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.ts - a.ts);
  }, [D, e.from, e.to, cFilter, mFilter, search]);

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

  const pdf = () => printHuskReport({
    title: "Husk vehicle entries",
    subtitle: [periodText(e.from, e.to), cFilter && nm(D.companies, cFilter), mFilter && nm(D.materials, mFilter)].filter(Boolean).join(" · ") || "All entries",
    summary: [{ label: "Entries", value: String(rows.length) }, { label: "Tons", value: fmtTons(totalTons) }],
    columns: [{ key: "d", label: "Date" }, { key: "v", label: "Vehicle" }, { key: "c", label: "Customer" }, { key: "co", label: "Company · Material" }, { key: "t", label: "Tons", right: true }, { key: "cr", label: "Co. rate", right: true }, { key: "pr", label: "Cust. rate", right: true }, { key: "n", label: "Net payable", right: true }],
    rows: rows.map(t => ({ d: fmtDay(t.entryDate), v: t.truckNo, c: nm(D.customers, t.customerId), co: nm(D.companies, t.companyId) + " · " + nm(D.materials, t.materialId), t: String(t.tons), cr: String(t.companyRate), pr: String(t.customerRate), n: fmt(t.netPayable) })),
  });

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
      {rows.slice(0, shown).map(t => (
        <Card key={t.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 800, color: C.text }}>{t.truckNo}</div>
            <div style={{ fontWeight: 800, color: C.accent }}>{fmtTons(t.tons)}</div>
          </div>
          <Muted>{fmtDay(t.entryDate)} · {fyLabel(fyStartYear(t.entryDate))} · {nm(D.customers, t.customerId)}</Muted>
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
      {rows.length > shown && <Btn outline onClick={() => setShown(s => s + 40)}>Show more</Btn>}
      {form && <EntryForm h={h} edit={form === "new" ? null : form} onClose={() => setForm(null)} />}
    </div>
  );
}

// ═══════════════════════════ PAYMENTS TAB ═══════════════════════════════════
function PaymentForm({ h, edit, onClose }) {
  const { fmt, today, uid } = ui();
  const { data: D, user } = h;
  const act = list => list.filter(x => x.active !== false);
  const kindOf = e => !e ? "customer_paid" : e.src === "loan" ? "loan_given" : e.rec.kind;
  const init = edit ? {
    kind: kindOf(edit), date: edit.rec.date, customerId: edit.rec.customerId || "", companyId: edit.rec.companyId || "", materialId: edit.rec.materialId || "",
    amount: String(edit.rec.amount || ""), deduction: edit.rec.deduction ? String(edit.rec.deduction) : "", deductionReason: edit.rec.deductionReason || "",
    mode: edit.rec.mode || "Cash", note: edit.rec.note || "",
  } : { kind: "customer_paid", date: today(), customerId: "", companyId: "", materialId: "", amount: "", deduction: "", deductionReason: "", mode: "Cash", note: "" };
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
  return <FormSheet title={edit ? "Edit payment" : "Record payment"} init={init} fields={fields} validate={validate} onSave={onSave} onClose={onClose} />;
}

function PaymentsTab({ h }) {
  const { C, Btn, Field, fmt } = ui();
  const { data: D, P } = h;
  const [form, setForm] = useState(null);
  const [kind, setKind] = useState("");
  const [shown, setShown] = useState(40);

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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {P.manage && <Btn full onClick={() => setForm("new")}>＋ Record payment</Btn>}
      <Field label="Show" value={kind} onChange={setKind} opts={[{ v: "", l: "All payments" }, { v: "customer_paid", l: "Paid to customers" }, { v: "company_received", l: "Received from companies" }, { v: "loan_given", l: "Husk loans given" }]} />
      {items.length === 0 && <Empty>No payments yet.</Empty>}
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
      {form && <PaymentForm h={h} edit={form === "new" ? null : form} onClose={() => setForm(null)} />}
    </div>
  );
}

// ═══════════════════════════ LEDGERS TAB ════════════════════════════════════
function buildLedger(D, mode, f) {
  const filt = { from: f.from || undefined, to: f.to || undefined, companyId: f.companyId || undefined, materialId: f.materialId || undefined };
  let res, title, who = "", pos = "", neg = "";
  if (mode === "customer") { res = L.customerLedger(D, f.partyId, filt); title = "Customer ledger"; who = nm(D.customers, f.partyId); pos = "M Yantra owes the customer"; neg = "Advance (customer owes M Yantra)"; }
  else if (mode === "company") { res = L.companyLedger(D, f.partyId, filt); title = "Company ledger"; who = nm(D.companies, f.partyId); pos = "Company owes M Yantra"; neg = "Company has paid in excess"; }
  else if (mode === "material") { res = L.materialLedger(D, f.partyId, filt); title = "Material ledger"; who = nm(D.materials, f.partyId); pos = "Companies owe M Yantra"; neg = "Companies have paid in excess"; }
  else if (mode === "vehicle") { res = L.vehicleLedger(D, f.partyId, filt); title = "Vehicle ledger"; who = nm(D.vehicles.map(v => ({ id: v.id, name: v.truckNo })), f.partyId); pos = "Net payable to owners"; neg = ""; }
  else if (mode === "loan") { res = L.loanLedger(D, f.partyId, filt); title = "Husk loan ledger"; who = nm(D.customers, f.partyId); pos = "Customer still owes on the loan"; neg = "Loan over-recovered"; }
  else { res = L.deductionLedger(D, filt); title = "Deduction recovery ledger"; who = "All companies"; pos = "Deducted by companies, not yet recovered"; neg = "Recovered more than deducted"; }
  const rows = res.rows.map(r => {
    let detail = r.detail || "";
    if (r.kind === "Trip") {
      const cust = mode === "customer" ? "" : (r.customerId ? nm(D.customers, r.customerId) + " · " : "");
      const rate = r.rate != null ? ` × ₹${r.rate}` : (r.companyRate != null ? ` · co ₹${r.companyRate} / cust ₹${r.customerRate}` : "");
      detail = `${r.truckNo || ""} · ${cust}${fmtTons(r.tons)}${rate}`;
      if (mode === "customer" && (r.loan > 0 || r.deduction > 0)) detail += ` (gross ${Math.round(r.gross)}${r.loan > 0 ? " − loan " + Math.round(r.loan) : ""}${r.deduction > 0 ? " − deduction " + Math.round(r.deduction) : ""})`;
    }
    if (r.kind === "Recovered" && r.customerId) detail = `${nm(D.customers, r.customerId)} · ${detail}`;
    const cm = [r.companyId ? nm(D.companies, r.companyId) : "", r.materialId ? nm(D.materials, r.materialId) : ""].filter(Boolean).join(" · ");
    return { date: fmtDay(r.date), kind: r.kind, cm, detail, amount: money(r.amount), balance: money(r.balance), _bold: r.kind === "Opening", _neg: r.amount < 0 };
  });
  return { res, rows, title, who, pos, neg };
}

const LEDGER_COLS = [
  { key: "date", label: "Date" }, { key: "kind", label: "Entry" }, { key: "cm", label: "Company · Material" },
  { key: "detail", label: "Details" }, { key: "amount", label: "Amount", right: true }, { key: "balance", label: "Balance", right: true },
];

function LedgerTable({ rows }) {
  const { C } = ui();
  if (!rows.length) return <Empty>No entries for these filters.</Empty>;
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 12, background: C.card }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 560 }}>
        <thead><tr>{LEDGER_COLS.map(c => <th key={c.key} style={{ textAlign: c.right ? "right" : "left", padding: "8px 8px", background: C.card2, color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap" }}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} style={{ borderTop: `1px solid ${C.border}`, fontWeight: r._bold ? 700 : 400 }}>
            {LEDGER_COLS.map(c => <td key={c.key} style={{ padding: "7px 8px", textAlign: c.right ? "right" : "left", color: c.key === "amount" && r._neg ? C.red : C.text, whiteSpace: c.key === "detail" ? "normal" : "nowrap" }}>{r[c.key]}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function LedgersTab({ h }) {
  const { C, Btn, Field, PillBar, KPI } = ui();
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
  const L2 = ready ? buildLedger(D, mode, fe) : null;

  const subtitle = L2 ? [L2.who, periodText(fe.from, fe.to), mode !== "company" && mode !== "material" && f.companyId && nm(D.companies, f.companyId), f.materialId && mode !== "material" && nm(D.materials, f.materialId)].filter(Boolean).join(" · ") : "";
  const pdf = () => {
    if (!L2) return;
    const bal = L2.res.balance;
    const summary = [{ label: "Balance", value: money(bal) }, { label: bal >= 0 ? "Meaning" : "Meaning", value: bal >= 0 ? L2.pos : (L2.neg || "—") }];
    if (mode === "deduction") summary.unshift({ label: "Deducted", value: money(L2.res.deducted) }, { label: "Recovered", value: money(L2.res.recovered) });
    if (mode === "vehicle") summary.push({ label: "Tons", value: fmtTons(L2.res.tons) });
    printHuskReport({ title: L2.title, subtitle, summary, columns: LEDGER_COLS, rows: L2.rows });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PillBar items={modes} active={mode} onSelect={m => { setMode(m); setF(p => ({ ...p, partyId: "" })); }} />
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {needsParty && <Field label={modes.find(m => m.id === mode).label} value={f.partyId} onChange={set("partyId")} opts={partyOpts} />}
          {(mode === "customer" || mode === "deduction") && <Field label="Company" value={f.companyId} onChange={set("companyId")} opts={opt(D.companies)} half />}
          {mode === "material" && <Field label="Company" value={f.companyId} onChange={set("companyId")} opts={opt(D.companies)} half />}
          {(mode === "customer" || mode === "company" || mode === "deduction") && <Field label="Material" value={f.materialId} onChange={set("materialId")} opts={opt(D.materials)} half />}
          <DateInput label="From" value={f.from} onChange={set("from")} half />
          <DateInput label="To" value={f.to} onChange={set("to")} half />
        </div>
      </Card>
      {!ready && <Empty>Choose a {modes.find(m => m.id === mode).label.toLowerCase()} to see the ledger.</Empty>}
      {L2 && (<>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <KPI label="Balance" value={money(L2.res.balance)} color={L2.res.balance >= 0 ? C.green : C.red} sub={L2.res.balance >= 0 ? L2.pos : (L2.neg || "")} />
          {mode === "deduction" && <KPI label="Unrecovered" value={money(L2.res.unrecovered)} sub={`Deducted ${money(L2.res.deducted)}`} color={C.orange} />}
          {mode === "vehicle" && <KPI label="Tons" value={fmtTons(L2.res.tons)} />}
          {mode === "material" && Object.keys(L2.res.perCompany).length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px" }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>By company</div>
              {Object.entries(L2.res.perCompany).map(([id, b]) => <div key={id} style={{ fontSize: 12 }}>{nm(D.companies, id)}: <b>{money(b)}</b></div>)}
            </div>
          )}
        </div>
        <Btn sm outline onClick={pdf}>⬇ Download PDF</Btn>
        <LedgerTable rows={L2.rows} />
      </>)}
    </div>
  );
}

// ═══════════════════════════ RATES TAB ══════════════════════════════════════
function RateForm({ h, onClose }) {
  const { fmt, today, uid, nowTs } = ui();
  const { data: D, user } = h;
  const act = list => list.filter(x => x.active !== false);
  const init = { kind: "company", companyId: "", materialId: "", customerId: "", rate: "", effectiveFrom: today() };
  const fields = v => [
    { k: "kind", label: "Rate for", opts: [{ v: "company", l: "Company rate (what the company pays M Yantra)" }, { v: "customer", l: "Customer rate (what M Yantra pays the customer)" }] },
    ...(v.kind === "customer" ? [{ k: "customerId", label: "Customer", opts: opt(act(D.customers), "Select customer") }] : []),
    { k: "companyId", label: "Company", opts: opt(act(D.companies), "Select company"), half: true },
    { k: "materialId", label: "Material", opts: opt(act(D.materials), "Select material"), half: true },
    { k: "rate", label: "Rate per ton (₹)", type: "number", half: true },
    { k: "effectiveFrom", label: "Effective from", type: "date", half: true },
  ];
  const validate = v => {
    if (!v.companyId || !v.materialId) return "Choose the company and material.";
    if (v.kind === "customer" && !v.customerId) return "Choose the customer.";
    if (!(L.num(v.rate) > 0)) return "Enter the rate per ton.";
    if (!v.effectiveFrom) return "Choose the date the rate starts.";
    return "";
  };
  const plan = v => {
    if (validate(v)) return null;
    const ts = Date.now();
    if (v.kind === "company") {
      const rec = { id: uid(), companyId: v.companyId, materialId: v.materialId, rate: L.num(v.rate), effectiveFrom: v.effectiveFrom, ts, createdBy: user.name, createdAt: nowTs() };
      const next = [...D.companyRates, rec];
      return { rec, key: "companyRates", table: "mye_husk_company_rates", changes: L.repriceTrips(D.trips, next, D.customerRates, { kind: "company", companyId: v.companyId, materialId: v.materialId, from: v.effectiveFrom }) };
    }
    const rec = { id: uid(), customerId: v.customerId, materialId: v.materialId, companyId: v.companyId, rate: L.num(v.rate), effectiveFrom: v.effectiveFrom, ts, createdBy: user.name, createdAt: nowTs() };
    const next = [...D.customerRates, rec];
    return { rec, key: "customerRates", table: "mye_husk_customer_rates", changes: L.repriceTrips(D.trips, D.companyRates, next, { kind: "customer", customerId: v.customerId, materialId: v.materialId, companyId: v.companyId, from: v.effectiveFrom }) };
  };
  const hint = v => {
    const p = plan(v);
    if (!p) return null;
    const delta = p.changes.reduce((s, c) => s + (c.patch.customerAmount !== undefined && v.kind === "customer" ? c.patch.customerAmount - c.trip.customerAmount : c.patch.companyAmount - c.trip.companyAmount), 0);
    return p.changes.length
      ? <Warn>{p.changes.length} existing entr{p.changes.length === 1 ? "y" : "ies"} made on or after {fmtDay(v.effectiveFrom)} will be repriced ({v.kind === "company" ? "company" : "customer"} amount changes by {money(delta)}). The change log keeps the old and new amounts.</Warn>
      : <Muted>No existing entries are affected.</Muted>;
  };
  const onSave = async v => {
    const p = plan(v);
    await HuskDB.save(p.key, p.rec);
    if (p.changes.length) {
      const edited = p.changes.map(c => ({ ...c.trip, ...c.patch, editedBy: user.name, editedAt: nowTs() }));
      await HuskDB.saveMany("trips", edited);
      await HuskDB.saveMany("changelog", p.changes.map((c, i) => h.change("mye_husk_trips", c.trip.id, "reprice", c.trip, edited[i])));
    }
    await HuskDB.save("changelog", h.change(p.table, p.rec.id, "rate", null, p.rec));
    h.log && h.log("HUSK_RATE", `${v.kind} rate ${v.rate} from ${v.effectiveFrom}, ${p.changes.length} repriced`);
    await h.load();
  };
  return <FormSheet title="Add a rate" init={init} fields={fields} validate={validate} hint={hint} onSave={onSave} onClose={onClose} saveLabel="Save rate" />;
}

function RatesTab({ h }) {
  const { C, Btn, fmt, today } = ui();
  const { data: D, P } = h;
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState("");
  const t = today();

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

  const block = (title, groups) => (
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
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                    <span>from {fmtDay(r.effectiveFrom)}{r.effectiveFrom > t ? " (upcoming)" : ""}</span>
                    <span><b>{fmt(r.rate)}</b> <span style={{ color: C.muted }}>· {r.createdBy}</span></span>
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
      {P.manage ? <Btn full onClick={() => setForm(true)}>＋ Add a rate</Btn> : <Muted>View only. Rates are added by the Husk manager or the owner.</Muted>}
      {block("Company rates (company pays M Yantra)", companyGroups)}
      {block("Customer rates (M Yantra pays customer)", customerGroups)}
      {form && <RateForm h={h} onClose={() => setForm(false)} />}
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
        const led = open === c.id ? L.loanLedger(D, c.id) : null;
        return (
          <Card key={c.id}>
            <div onClick={() => setOpen(open === c.id ? "" : c.id)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 800, color: C.text }}>{c.name}</div>
                <div style={{ fontWeight: 800, color: bal > 0 ? C.orange : C.green }}>{fmt(bal)}</div>
              </div>
              <Muted>Deducted per trip: {c.loanPerTrip > 0 ? fmt(c.loanPerTrip) : "not set"} · tap for the loan ledger</Muted>
            </div>
            {led && <div style={{ marginTop: 10 }}><LedgerTable rows={led.rows.map(r => ({ date: fmtDay(r.date), kind: r.kind, cm: "", detail: r.detail || "", amount: money(r.amount), balance: money(r.balance), _neg: r.amount < 0, _bold: r.kind === "Opening" }))} /></div>}
          </Card>
        );
      })}
      {form && <PaymentForm h={h} edit={null} onClose={() => setForm(false)} />}
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
    if (kind === "vehicle") {
      return <FormSheet key="veh-new" title="Add vehicle" onClose={close}
        init={{ truckNo: "", customerId: "" }}
        fields={[{ k: "truckNo", label: "Truck number" }, { k: "customerId", label: "Owner (customer)", opts: opt(D.customers.filter(c => c.active !== false), "Select owner") }]}
        validate={v => !v.truckNo.trim() ? "Enter the truck number." : !v.customerId ? "Choose the owner." : D.vehicles.some(x => normTruck(x.truckNo) === normTruck(v.truckNo)) ? "This truck number already exists." : ""}
        onSave={async v => {
          const id = uid(); const m = h.meta();
          await HuskDB.save("vehicles", { id, truckNo: v.truckNo.trim().toUpperCase(), customerId: v.customerId, ...m });
          await HuskDB.save("vehicleOwners", { id: uid(), vehicleId: id, customerId: v.customerId, fromDate: "", toDate: "", ts: m.ts, createdBy: user.name });
          await h.load();
        }} />;
    }
    if (kind === "relink") {
      return <FormSheet key={"rl" + e.id} title={`Change owner · ${e.truckNo}`} onClose={close}
        init={{ customerId: "", from: today() }}
        fields={[{ k: "customerId", label: "New owner (customer)", opts: opt(D.customers.filter(c => c.active !== false && c.id !== e.customerId), "Select new owner") }, { k: "from", label: "Effective from", type: "date" }]}
        hint={() => <Muted>Old entries keep the old owner. New entries from this date use the new owner. Currently: {nm(D.customers, e.customerId)}.</Muted>}
        validate={v => !v.customerId ? "Choose the new owner." : !v.from ? "Choose the date." : ""}
        onSave={async v => {
          const ts = Date.now();
          const cur = D.vehicleOwners.filter(o => o.vehicleId === e.id && !o.toDate).sort((a, b) => (b.fromDate || "").localeCompare(a.fromDate || ""))[0];
          if (cur) await HuskDB.save("vehicleOwners", { ...cur, toDate: dayBefore(v.from) });
          await HuskDB.save("vehicleOwners", { id: uid(), vehicleId: e.id, customerId: v.customerId, fromDate: v.from, toDate: "", ts, createdBy: user.name });
          const next = { ...e, customerId: v.customerId };
          await HuskDB.save("vehicles", next);
          await HuskDB.save("changelog", h.change("mye_husk_vehicles", e.id, "relink", e, next));
          await h.load();
        }} />;
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
      {sec === "customers" && (<><Btn full onClick={() => open("customer")}>＋ Add customer</Btn>{list(D.customers, c => row(c.id, c.name + (c.active ? "" : " (inactive)"), [c.phone, c.loanPerTrip > 0 ? `loan ${fmt(c.loanPerTrip)}/trip` : ""].filter(Boolean).join(" · "), () => open("customer", c)))}</>)}
      {sec === "vehicles" && (<><Btn full onClick={() => open("vehicle")}>＋ Add vehicle</Btn>{list(D.vehicles, v => {
        const hist = D.vehicleOwners.filter(o => o.vehicleId === v.id).sort((a, b) => (b.fromDate || "").localeCompare(a.fromDate || ""));
        return (
          <Card key={v.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontWeight: 800, color: C.text }}>{v.truckNo}</div><Muted>Owner: {nm(D.customers, v.customerId)}</Muted></div>
              <Btn sm outline onClick={() => open("relink", v)}>Change owner</Btn>
            </div>
            {hist.length > 1 && <div style={{ marginTop: 6 }}>{hist.map(o => <Muted key={o.id}>{nm(D.customers, o.customerId)}: {o.fromDate ? fmtDay(o.fromDate) : "start"} → {o.toDate ? fmtDay(o.toDate) : "now"}</Muted>)}</div>}
          </Card>
        );
      })}</>)}
      {sec === "openings" && (<><Btn full onClick={() => open("opening")}>＋ Add opening balance</Btn>{list([...D.openings].sort((a, b) => b.asOf.localeCompare(a.asOf)), o => row(o.id,
        `${o.partyType === "customer" ? nm(D.customers, o.partyId) : nm(D.companies, o.partyId)} · ${money(o.amount)}`,
        `${o.partyType === "customer" ? "Customer" : "Company"} · as of ${fmtDay(o.asOf)}${o.companyId ? " · " + nm(D.companies, o.companyId) : ""}${o.materialId ? " · " + nm(D.materials, o.materialId) : ""}${o.note ? " · " + o.note : ""}`,
        () => open("opening", o),
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
