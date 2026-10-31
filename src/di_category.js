// DI category: Trade (T) vs Non Trade (NT), read from the GR particulars "Goods" text.
// RULE (owner, 31 Oct 2026): if the goods text has NT → NT, otherwise T (also when there is no goods text).
// "NT" must stand alone as a word — CEMENT / PAYMENT / AGENT contain the letters but are trade.
const NT_WORD = /(^|[^A-Za-z0-9])NT([^A-Za-z0-9]|$)/i;
const NON_TRADE = /NON[\s-]*TRADE/i;
export const diCategory = (goods) => {
  const g = String(goods ?? "");
  return NT_WORD.test(g) || NON_TRADE.test(g) ? "NT" : "T";
};

// Goods for one DI: its own line first, else the trip's GR particulars (older trips store goods only there).
export const goodsFor = (trip, line) => (line && line.goods) || trip?.grParticulars?.goods || "";

// Trip-level filter: a trip is in a category if ANY of its DIs is. "all" (or empty) matches everything.
export const tripHasCategory = (trip, cat) => {
  if (!cat || cat === "all") return true;
  const lines = trip?.diLines?.length ? trip.diLines : [null];
  return lines.some((l) => diCategory(goodsFor(trip, l)) === cat);
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// entries: [{truckNo,date,lrNo,partyName,diNo,cat,pouch,email,ready,amount}] — one per DI row.
export const followupByVehicle = (entries) => {
  const by = new Map();
  for (const e of entries || []) {
    const k = (e.truckNo || "").trim() || "—";
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  }
  const vehicles = [...by.entries()].map(([truckNo, list]) => {
    const sorted = [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const dates = list.map((e) => e.date).filter(Boolean).sort();
    return { truckNo, entries: sorted, dis: list.length, lrs: new Set(list.map((e) => e.lrNo)).size,
      oldest: dates[0] || "", amount: list.reduce((s, e) => s + (+e.amount || 0), 0) };
  }).sort((a, b) => b.amount - a.amount || a.truckNo.localeCompare(b.truckNo));
  const lrAll = new Set((entries || []).map((e) => e.truckNo + "|" + e.lrNo));
  return { vehicles, totals: { trips: lrAll.size, dis: (entries || []).length, vehicles: vehicles.length,
    amount: vehicles.reduce((s, v) => s + v.amount, 0) } };
};

export const followupHtml = (r, { company = "", filterSummary = "", generated = "", fmt = (x) => x, logo = "", title = "Party Portal — Follow-up List (Vehicle-wise)" } = {}) => {
  const tick = (ok) => `<td style="color:${ok ? "#16a34a" : "#dc2626"};font-weight:700;text-align:center">${ok ? "✓" : "✗"}</td>`;
  const sum = r.vehicles.map((v, i) => `<tr><td>${i + 1}</td><td>${esc(v.truckNo)}</td><td>${v.dis}</td><td>${v.lrs}</td><td>${esc(v.oldest)}</td><td style="text-align:right">${fmt(v.amount)}</td></tr>`).join("");
  const blocks = r.vehicles.map((v) => `<div class="veh"><div class="vh"><span><b>${esc(v.truckNo)}</b> <span class="mut">· ${v.lrs} LR${v.lrs > 1 ? "s" : ""} · ${v.dis} DI${v.dis > 1 ? "s" : ""}</span></span><span class="amt">${fmt(v.amount)}</span></div>
<table><tr><th>Date</th><th>LR</th><th>Party name</th><th>DI</th><th>Type</th><th>Pouch</th><th>Email</th><th>Ready</th><th style="text-align:right">Amount</th></tr>
${v.entries.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.lrNo || "—")}</td><td>${esc(e.partyName || "—")}</td><td>${esc(e.diNo || "—")}</td><td style="text-align:center"><b style="color:${e.cat === "NT" ? "#b45309" : "#0f766e"}">${esc(e.cat)}</b></td>${tick(e.pouch)}${tick(e.email)}${tick(e.ready)}<td style="text-align:right">${fmt(e.amount)}</td></tr>`).join("")}</table></div>`).join("");
  return `<style>
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;margin:20px}
  .kpis{display:flex;gap:12px;margin:12px 0;flex-wrap:wrap}.kpi{border:1px solid #ddd;border-radius:6px;padding:8px 14px;min-width:90px;text-align:center}
  .kpi .val{font-size:16px;font-weight:800}.kpi .lbl{font-size:9px;color:#888;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:6px;font-size:10px}
  th{background:#7c3aed;color:#fff;padding:5px 7px;text-align:left;border:1px solid #7c3aed;font-size:9px;text-transform:uppercase}
  td{padding:4px 7px;border:1px solid #e0e0e0}tr:nth-child(even){background:#f7f5fc}
  .veh{page-break-inside:avoid;margin-top:12px}.vh{display:flex;justify-content:space-between;border-left:4px solid #7c3aed;background:#f3effe;padding:6px 10px;font-size:13px}
  .mut{color:#888;font-size:10px}.amt{color:#16a34a;font-weight:800}
  .footer{margin-top:20px;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:8px}
  @media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}</style>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid #7c3aed">
  ${logo ? `<img src="${esc(logo)}" style="width:52px;height:52px;border-radius:8px;object-fit:cover"/>` : ""}
  <div><div style="font-size:7px;text-transform:uppercase;letter-spacing:2px;color:#7c3aed;font-weight:700">${esc(company)}</div>
  <div style="font-size:20px;font-weight:800;line-height:1.2">${esc(title)}</div><div style="font-size:10px;color:#888">Generated ${esc(generated)}</div></div></div>
  <div style="background:#f7f5fc;border:1px solid #7c3aed44;border-radius:8px;padding:8px 12px;margin-bottom:12px;color:#555"><b>Filters applied:</b> ${esc(filterSummary)}</div>
  <div class="kpis"><div class="kpi"><div class="val" style="color:#7c3aed">${r.totals.trips}</div><div class="lbl">TRIPS (LRs)</div></div>
  <div class="kpi"><div class="val" style="color:#7c3aed">${r.totals.dis}</div><div class="lbl">DIs</div></div>
  <div class="kpi"><div class="val" style="color:#7c3aed">${r.totals.vehicles}</div><div class="lbl">VEHICLES</div></div>
  <div class="kpi"><div class="val" style="color:#16a34a">${fmt(r.totals.amount)}</div><div class="lbl">TOTAL AMOUNT</div></div></div>
  <h3>Vehicle Summary</h3><table><tr><th>#</th><th>Vehicle</th><th>DIs</th><th>LRs</th><th>Oldest date</th><th style="text-align:right">Amount</th></tr>${sum}</table>
  ${blocks}<div class="footer">${esc(company)} · Vehicle-wise follow-up · Source report generated ${esc(generated)}</div>`;
};
