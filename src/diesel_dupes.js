// Duplicate diesel requests: pure, read-only detection. The UI deletes; this only explains.
//
// Rule (owner): a pending (open) or confirmed request with the same vehicle, same date and same amount as an
// attached request is a duplicate; the attached one is the one to keep.
//  - deletable : duplicate of an attached/reconciled request, not linked to any trip -> safe to offer delete
//  - blocked   : would be a duplicate, but a trip still references its indent number -> never offered
//  - review    : same vehicle/date/amount among pending/confirmed rows with NO attached request to keep ->
//                shown for information only, the owner decides

export const normTruckNo = s => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const KEEP_STATUS = new Set(["attached", "reconciled"]);
const CANDIDATE_STATUS = new Set(["open", "confirmed"]);
const STATUS_LABEL = { open: "pending", confirmed: "confirmed", attached: "attached", reconciled: "reconciled" };
const amt = r => Math.round((+r.amount || 0) * 100);
const keyOf = r => {
  const truck = normTruckNo(r.truckNo), date = String(r.date || "").slice(0, 10), a = amt(r);
  return truck && date && a > 0 ? `${truck}|${date}|${a}` : "";
};
const money = n => "₹" + (+n || 0).toLocaleString("en-IN");

export function findDieselDuplicates(requests, trips) {
  const out = { deletable: [], blocked: [], review: [] };
  const reqs = Array.isArray(requests) ? requests : [];
  const tripList = Array.isArray(trips) ? trips : [];

  const keepByKey = new Map();
  for (const r of reqs) {
    if (!KEEP_STATUS.has(r.status)) continue;
    const k = keyOf(r);
    if (!k) continue;
    if (!keepByKey.has(k)) keepByKey.set(k, []);
    keepByKey.get(k).push(r);
  }

  const tripsUsing = indentNo => tripList.filter(t =>
    String(t.dieselIndentNo || "").trim() === String(indentNo) || String(t.dieselIndentNo2 || "").trim() === String(indentNo));

  const noKeep = new Map();
  for (const r of reqs) {
    if (!CANDIDATE_STATUS.has(r.status)) continue;
    const k = keyOf(r);
    if (!k) continue;
    const keeps = keepByKey.get(k);
    if (!keeps) {
      if (!noKeep.has(k)) noKeep.set(k, []);
      noKeep.get(k).push(r);
      continue;
    }
    const keepInfo = keeps.map(a => ({ id: a.id, indentNo: a.indentNo, lrNo: a.lrNo || "", status: a.status }));
    const keepText = keeps.map(a => `#${a.indentNo}${a.lrNo ? " (LR " + a.lrNo + ")" : ""}`).join(", ");
    const reasons = [
      `Same vehicle (${r.truckNo}), same date (${String(r.date).slice(0, 10)}) and same amount (${money(r.amount)}) as ${STATUS_LABEL[keeps[0].status]} indent ${keepText}.`,
      `This ${STATUS_LABEL[r.status]} request #${r.indentNo} is not attached to any trip; the ${STATUS_LABEL[keeps[0].status]} one is the one in use.`,
    ];
    const item = {
      id: r.id, indentNo: r.indentNo, truckNo: r.truckNo, date: String(r.date).slice(0, 10), amount: +r.amount || 0,
      status: r.status, createdBy: r.createdBy || r.requestedBy || "", createdAt: r.createdAt || "",
      keep: keepInfo, reasons, warnings: [],
    };
    if (r.receiptImagePath) item.warnings.push("Has a receipt image uploaded — it stays in storage after delete.");
    if (r.ownerVerified) item.warnings.push("Already marked verified by the owner.");
    const using = r.tripId ? [{ lrNo: r.lrNo || r.tripId }] : tripsUsing(r.indentNo);
    if (r.tripId || using.length) {
      const lrs = using.map(t => t.lrNo || t.id).join(", ");
      item.reasons = [...reasons, `Not deletable: still linked to LR ${lrs}.`];
      out.blocked.push(item);
      continue;
    }
    out.deletable.push(item);
  }

  for (const [k, rows] of noKeep) {
    if (rows.length < 2) continue;
    const r0 = rows[0];
    out.review.push({
      ids: rows.map(r => r.id),
      indentNos: rows.map(r => r.indentNo),
      truckNo: r0.truckNo, date: String(r0.date).slice(0, 10), amount: +r0.amount || 0,
      statuses: rows.map(r => r.status),
      reason: `${rows.length} requests for ${r0.truckNo} on ${String(r0.date).slice(0, 10)} for ${money(r0.amount)} (#${rows.map(r => r.indentNo).join(", #")}) and no attached indent to keep — check which one is real before deleting.`,
    });
  }
  return out;
}
