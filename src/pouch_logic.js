// ─── Party return-pouch rules (pure functions — no React, no database) ──────────
// Tested in scripts/pouch_logic.test.mjs

// The ₹ pouch is held back on every party trip until the FIRST payment on that trip
// has been recorded; from then on the employee can request it. A payment of 0 does not count.
export const tripPouchReleased = (trip, driverPays) =>
  (driverPays || []).some(p => p.tripId === trip.id && (+p.amount || 0) > 0);

const norm = s => String(s || "").toUpperCase().trim();

// The employee a trip is "under": the one assigned to the trip, else the one the truck is linked to.
export const pouchEmployeeFor = (truckNo, employees, assignedEmpId, pick) => {
  const list = employees || [];
  if (assignedEmpId) {
    const a = list.find(e => e.id === assignedEmpId);
    if (a && pick(a)) return a;
  }
  if (!truckNo) return null;
  const t = norm(truckNo);
  return list.find(e => pick(e) && (e.linkedTrucks || []).some(x => norm(x) === t)) || null;
};

const hasAmount = e => e && e.pouchAmount != null && e.pouchAmount !== "" && !isNaN(+e.pouchAmount);

// Pouch to put on a NEW party trip.
//   employee exempt (switch ON)       -> 0
//   vehicle exempt                    -> 0
//   employee's own amount             -> that
//   vehicle override                  -> that
//   otherwise                         -> global setting, else 700
// Existing trips keep the amount they were saved with.
export const pouchAmountFor = ({ veh, employees, assignedEmpId, settings }) => {
  const truckNo = veh?.truckNo;
  if (pouchEmployeeFor(truckNo, employees, assignedEmpId, e => e.pouchExempt)) return 0;
  if (veh?.pouchExempt) return 0;
  const emp = pouchEmployeeFor(truckNo, employees, assignedEmpId, hasAmount);
  if (emp) return +emp.pouchAmount;
  if (veh?.pouchOverride != null) return veh.pouchOverride;
  return settings?.pouchPerTrip ?? 700;
};
