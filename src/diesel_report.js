// Diesel requests report: pure helpers that turn the (already filtered) request list into a printable HTML page.
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inr = n => (+n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function statusLabel(r) {
  if (r.status === "open") return "Pending";
  if (r.status === "confirmed") return "Confirmed";
  if (r.status === "attached") return r.confirmedAmount ? "Attached" : "Attached (no pump confirm)";
  if (r.status === "reconciled") return "Reconciled";
  return String(r.status || "—");
}

export function dieselReportRows(requests, pumps) {
  const pumpName = id => (pumps || []).find(p => p.id === id)?.name || "—";
  return [...(requests || [])]
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || (+a.indentNo || 0) - (+b.indentNo || 0))
    .map(r => {
      const total = +r.amount || 0;
      const hasSplit = r.dieselAmount != null || r.cashAmount != null;
      const diesel = hasSplit ? (+r.dieselAmount || 0) : total;
      const cash = hasSplit ? (+r.cashAmount || 0) : 0;
      return {
        indentNo: r.indentNo, date: String(r.date || "").slice(0, 10), truckNo: r.truckNo || "", pump: pumpName(r.pumpId),
        diesel, cash, total, confirmed: r.confirmedAmount != null && r.confirmedAmount !== "" ? +r.confirmedAmount : null,
        status: statusLabel(r), lrNo: r.lrNo || "", requestedBy: r.requestedBy || "",
      };
    });
}

export function dieselReportHtml(requests, { filterLabel = "All", from = "", to = "", search = "", company = "", date = "", pumps = [] } = {}) {
  const rows = dieselReportRows(requests, pumps);
  const sum = k => rows.reduce((s, r) => s + r[k], 0);
  const body = rows.length
    ? rows.map(r => `<tr class="d"><td>${esc(r.indentNo)}</td><td>${esc(r.date)}</td><td>${esc(r.truckNo)}</td><td>${esc(r.pump)}</td>` +
        `<td class="n">${inr(r.diesel)}</td><td class="n">${inr(r.cash)}</td><td class="n">${inr(r.total)}</td>` +
        `<td class="n">${r.confirmed == null ? "—" : inr(r.confirmed)}</td><td>${esc(r.status)}</td><td>${esc(r.lrNo)}</td><td>${esc(r.requestedBy)}</td></tr>`).join("")
    : `<tr><td colspan="11" style="text-align:center;padding:16px;color:#666">No requests match this filter.</td></tr>`;
  const bits = [`Status: ${esc(filterLabel)}`];
  if (from || to) bits.push(`Dates: ${esc(from || "…")} to ${esc(to || "…")}`);
  if (search) bits.push(`Search: ${esc(search)}`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Diesel Requests — ${esc(filterLabel)}</title><style>
body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}h2{margin:0 0 4px}.sub{color:#555;margin-bottom:10px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#eee}.n{text-align:right}
tfoot td{font-weight:bold;background:#f5f5f5}@media print{body{margin:6mm}}</style></head><body onload="window.print()">
<h2>${esc(company)} Diesel Requests — ${esc(filterLabel)}</h2>
<div class="sub">${bits.join(" · ")} · ${rows.length} request${rows.length === 1 ? "" : "s"}${date ? " · Generated " + esc(date) : ""}</div>
<table><thead><tr><th>Indent</th><th>Date</th><th>Vehicle</th><th>Pump</th><th>Diesel</th><th>Cash</th><th>Total</th><th>Confirmed</th><th>Status</th><th>LR</th><th>Requested by</th></tr></thead>
<tbody>${body}</tbody>
<tfoot><tr><td colspan="4">Total (${rows.length} request${rows.length === 1 ? "" : "s"})</td><td class="n">${inr(sum("diesel"))}</td><td class="n">${inr(sum("cash"))}</td><td class="n">${inr(sum("total"))}</td><td colspan="4"></td></tr></tfoot></table>
</body></html>`;
}
