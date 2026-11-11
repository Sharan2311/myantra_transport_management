// Bulk payment-screenshot check: compare the bank amount with what the database recorded under the same
// reference, and — only when the database shows MORE and the extra is exactly money the trips were
// supposed to hold back — plan the per-trip reductions. Pure and read-only; the caller saves.
//
// Agreed rule (owner): the "hold" on a trip is whatever it still carries but was paid out anyway:
//   excess = max(0, everything paid on the trip − what it is owed after pouch + advance + tafal + diesel
//            + shortage + recoveries).
// A trip already paid net of its holds has no excess and is never touched. If the excesses do not add up to
// the difference EXACTLY, nothing is proposed and the row is blocked.

export const r2 = n => Math.round((+n || 0) * 100) / 100;
const cents = n => Math.round((+n || 0) * 100);

// Mirrors the Driver Pay screen's per-trip figures (tripWithBalance in App.jsx).
export function tripFigures(t, paidAll = 0) {
  const lines = Array.isArray(t?.diLines) ? t.diLines : [];
  const gross = lines.length > 1
    ? lines.reduce((s, d) => s + (+d.qty || 0) * (+d.givenRate || 0), 0)
    : (+t?.qty || 0) * (+t?.givenRate || 0);
  const pouchHold = !t?.pouchReleased ? (+t?.pouchBalance || 0) : 0;
  const otherDeducts = (+t?.advance || 0) + (+t?.tafal || 0) + (+t?.dieselEstimate || 0)
    + (+t?.shortage || 0) * (+t?.givenRate || 0) + (+t?.shortageRecovery || 0) + (+t?.loanRecovery || 0);
  const netDue = Math.max(0, gross - (otherDeducts + pouchHold));
  const paid = +paidAll || 0;
  return {
    gross: r2(gross), pouchHold: r2(pouchHold), otherDeducts: r2(otherDeducts), netDue: r2(netDue),
    balance: r2(Math.max(0, netDue - paid)),
    balancePlain: r2(Math.max(0, Math.max(0, gross - otherDeducts) - paid)),
  };
}

// amount  : amount on the bank screenshot
// rows    : driver-payment rows recorded under this reference [{id, tripId, lrNo, truckNo, amount}]
// trips   : { [tripId]: trip }   paidByTrip : { [tripId]: total paid on that trip across ALL references }
export function reconcileScreenshot({ amount, rows = [], trips = {}, paidByTrip = {} }) {
  const out = { status: "", recordedTotal: 0, diff: 0, remaining: 0, reason: "", changes: [], rows: [] };
  if (!rows.length) { out.status = "not_recorded"; out.reason = "No driver payment is recorded under this reference."; return out; }
  const recorded = rows.reduce((s, r) => s + cents(r.amount), 0);
  const shot = cents(amount);
  out.recordedTotal = recorded / 100;
  out.diff = (recorded - shot) / 100;
  if (recorded === shot) { out.status = "ok"; return out; }
  if (recorded < shot) {
    out.status = "blocked"; out.remaining = out.diff;
    out.reason = `Screenshot is ₹${r2(-out.diff).toLocaleString("en-IN")} MORE than recorded — nothing is changed automatically.`;
    return out;
  }
  // recorded > screenshot: how much of the extra is hold the trips should have kept back?
  const tripIds = [...new Set(rows.map(r => r.tripId))];
  const missing = tripIds.find(id => !trips[id]);
  if (missing !== undefined) { out.status = "blocked"; out.reason = `A payment under this reference belongs to a trip that was not found (${missing}).`; out.remaining = out.diff; return out; }

  const left = {};   // cents still reducible per trip (excess), capped below by what this reference paid on it
  const info = {};
  for (const id of tripIds) {
    const f = tripFigures(trips[id], paidByTrip[id]);
    const excess = Math.max(0, cents(paidByTrip[id]) - cents(f.netDue));
    left[id] = excess;
    info[id] = f;
  }
  let total = 0;
  const changes = [];
  for (const r of rows) {
    const take = Math.min(left[r.tripId], cents(r.amount));
    left[r.tripId] -= take;
    total += take;
    const f = info[r.tripId];
    out.rows.push({ rowId: r.id, tripId: r.tripId, lrNo: r.lrNo || trips[r.tripId].lrNo, oldAmount: r2(r.amount), reduction: take / 100 });
    if (take > 0) {
      const paidAll = +paidByTrip[r.tripId] || 0;
      changes.push({
        rowId: r.id, tripId: r.tripId, lrNo: r.lrNo || trips[r.tripId].lrNo, truckNo: r.truckNo || trips[r.tripId].truckNo,
        oldAmount: r2(r.amount), newAmount: r2((cents(r.amount) - take) / 100), reduction: take / 100,
        pouchHold: f.pouchHold, otherDeducts: f.otherDeducts,
        balanceBefore: f.balancePlain,
        balanceAfter: tripFigures(trips[r.tripId], paidAll - take / 100).balancePlain,
      });
      // keep each later row on the same trip aware of the reduction already applied
      paidByTrip = { ...paidByTrip, [r.tripId]: paidAll - take / 100 };
      info[r.tripId] = tripFigures(trips[r.tripId], paidByTrip[r.tripId]);
    }
  }
  if (total === recorded - shot) { out.status = "adjust"; out.changes = changes; return out; }
  out.status = "blocked";
  out.remaining = (recorded - shot - total) / 100;
  out.reason = `After taking back the holds (₹${(total / 100).toLocaleString("en-IN")}), the row still differs from the screenshot by ₹${r2(Math.abs(out.remaining)).toLocaleString("en-IN")}.`;
  return out;
}
