// When are two pump bills the SAME bill? The pump's receipt number alone is not enough: the same number (e.g. K0596)
// has been printed on two different bills for different vehicles, amounts and days. So a receipt number only counts as
// "already used" when the vehicle and the amount do not prove the bills are different.
export const normReceipt = (s) => String(s || "").trim().toUpperCase();
export const last4 = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-4);
const money = (a) => { if (a == null || a === "") return null; const n = Math.round(+a * 100) / 100; return Number.isFinite(n) ? n : null; };

// Pump nozzle ("Nozzle No. : 01" on the slip). Each nozzle can run its own receipt counter, so the SAME receipt number on
// nozzle 1 and nozzle 2 is two different bills. "01" and "1" are the same nozzle; blank/unknown never proves anything.
export const normNozzle = (s) => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");
const nozParts = (s) => String(s ?? "").split("+").map(normNozzle);

// True only when BOTH sides have the value and it differs. Missing data never proves two bills different.
export function billsDiffer(a, b) {
  const va = last4(a?.vehicleNo), vb = last4(b?.vehicleNo);
  if (va && vb && va !== vb) return true;
  const ma = money(a?.amount), mb = money(b?.amount);
  if (ma != null && mb != null && ma !== mb) return true;
  const na = normNozzle(a?.nozzleNo), nb = normNozzle(b?.nozzleNo);
  if (na && nb && na !== nb) return true;
  return false;
}

const parts = (s) => String(s || "").split("+").map(normReceipt).filter(Boolean);

// bill: {receiptNo, nozzleNo, vehicleNo, amount}. A bill that serves one request may be several bills: receiptNo "K1 + K2" with
// nozzleNo "1 + 1" in the same order. requests: saved diesel requests (bill details in extractedVehicleNo / extractedAmount /
// extractedNozzle). Each receipt number of the bill is compared with the same receipt number on a saved request, and it is
// "provably a different bill" when the nozzle differs, or the vehicle differs, or (one bill each) the amount differs.
// Returns {clash, notices}: clash = a request that already holds this bill (or might: not provably different) -> block;
// notices = requests with the same receipt number but provably a different bill -> allow, tell the owner.
export function receiptClashes(bill, requests, selfId) {
  const out = { clash: null, notices: [] };
  const mine = String(bill?.receiptNo || "").split("+").map(normReceipt);
  if (!mine.some(Boolean)) return out;
  const mynz = nozParts(bill?.nozzleNo);
  const bv = last4(bill?.vehicleNo), ba = money(bill?.amount);
  const nMine = mine.filter(Boolean).length;
  for (const r of requests || []) {
    if (r.id === selfId) continue;
    const rps = String(r.receiptNo || "").split("+").map(normReceipt);
    const rnz = nozParts(r.extractedNozzle);
    const rv = last4(r.extractedVehicleNo), ra = money(r.extractedAmount);
    const single = nMine === 1 && rps.filter(Boolean).length === 1;
    let hit = false, allDiffer = true;
    mine.forEach((m, i) => {
      if (!m) return;
      const j = rps.indexOf(m);
      if (j < 0) return;
      hit = true;
      const nozD = !!(mynz[i] && rnz[j] && mynz[i] !== rnz[j]);
      const vehD = !!(bv && rv && bv !== rv);
      const amtD = single && ba != null && ra != null && ba !== ra;
      if (!(nozD || vehD || amtD)) allDiffer = false;
    });
    if (!hit) continue;
    if (allDiffer) out.notices.push(r); else if (!out.clash) out.clash = r;
  }
  return out;
}

// What the screens show for a bill's identity: receipt number plus nozzle. "K0713 · Nozzle 1"; for a group
// "K0712 (nozzle 1) + K0713 (nozzle 2)" (nozzles in the same order as the receipts). Unknown nozzle: just the receipt number.
export function receiptLabel(receiptNo, nozzleNo) {
  const rs = String(receiptNo ?? "").split("+").map((s) => s.trim());
  const nz = nozParts(nozzleNo);
  if (!rs.some(Boolean)) return "";
  if (rs.length === 1) return nz[0] ? `${rs[0]} · Nozzle ${nz[0]}` : rs[0];
  return rs.filter(Boolean).map((r, i) => (nz[i] ? `${r} (nozzle ${nz[i]})` : r)).join(" + ");
}
