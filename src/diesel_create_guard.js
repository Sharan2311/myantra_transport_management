// Rules for creating a NEW diesel request (the form on the Diesel Requests screen).
export const CONFIRMED_BLOCK_MSG = "Either delete existing confirmed diesel request or attach LR to it for creating new diesel request";

export const normTruck = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();

// A confirmed request (pump has issued the diesel, no LR attached yet) blocks a new one for the same vehicle.
export function confirmedBlock(requests, truckNo) {
  const t = normTruck(truckNo);
  if (!t) return null;
  const hit = (requests || []).find((r) => r && r.status === "confirmed" && normTruck(r.truckNo) === t);
  return hit ? { message: CONFIRMED_BLOCK_MSG, indentNo: hit.indentNo } : null;
}

// The same form filled again: an open request for the same vehicle, pump and amounts on the same day.
// (A refresh clears the form, so this is what catches "I clicked, the page reloaded, I filled it again".)
export function sameFormAlready(requests, f) {
  const t = normTruck(f.truckNo);
  return (requests || []).find((r) => r && r.status === "open" && normTruck(r.truckNo) === t &&
    String(r.pumpId || "") === String(f.pumpId || "") && r.date === f.date &&
    Number(r.dieselAmount ?? r.amount) === Number(f.dieselAmount) && Number(r.cashAmount || 0) === Number(f.cashAmount || 0)) || null;
}
