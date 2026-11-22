// When are two pump bills the SAME bill? The pump's receipt number alone is not enough: the same number (e.g. K0596)
// has been printed on two different bills for different vehicles, amounts and days. So a receipt number only counts as
// "already used" when the vehicle and the amount do not prove the bills are different.
export const normReceipt = (s) => String(s || "").trim().toUpperCase();
export const last4 = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-4);
const money = (a) => { if (a == null || a === "") return null; const n = Math.round(+a * 100) / 100; return Number.isFinite(n) ? n : null; };

// True only when BOTH sides have the value and it differs. Missing data never proves two bills different.
export function billsDiffer(a, b) {
  const va = last4(a?.vehicleNo), vb = last4(b?.vehicleNo);
  if (va && vb && va !== vb) return true;
  const ma = money(a?.amount), mb = money(b?.amount);
  if (ma != null && mb != null && ma !== mb) return true;
  return false;
}

const parts = (s) => String(s || "").split("+").map(normReceipt).filter(Boolean);

// bill: {receiptNo, vehicleNo, amount}. requests: saved diesel requests (their bill details are in extractedVehicleNo /
// extractedAmount). Returns {clash, notices}: clash = a request that already holds this bill (or might: not provably
// different) -> block; notices = requests with the same receipt number but provably a different bill -> allow, tell the owner.
export function receiptClashes(bill, requests, selfId) {
  const rn = normReceipt(bill?.receiptNo);
  const out = { clash: null, notices: [] };
  if (!rn) return out;
  for (const r of requests || []) {
    if (r.id === selfId) continue;
    const ps = parts(r.receiptNo);
    if (!ps.includes(rn)) continue;
    const split = ps.length > 1 || /\+/.test(String(bill.receiptNo || ""));
    const differs = !split && billsDiffer(bill, { vehicleNo: r.extractedVehicleNo, amount: r.extractedAmount });
    if (differs) out.notices.push(r);
    else if (!out.clash) out.clash = r;
  }
  return out;
}
