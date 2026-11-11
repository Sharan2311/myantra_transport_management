// ─── Party return-pouch rules (pure functions — no React, no database) ──────────
// Tested in scripts/pouch_logic.test.mjs

// There is no release rule: the pouch stays held on every party trip (it used to be released
// when the return pouch / confirmation was uploaded). Only the owner's "Mark settled" clears it.

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

// ── Hold on ALL trips of an employee's vehicles (not only party trips) ─────────────────────────────────────
// Employee setting holdScope: "party" (default — the pouch applies to party trips only, as before) or "all"
// (the employee's pouch amount is held on EVERY new trip of his linked trucks / trips assigned to him, whatever the
// order type). Needs an amount; the employee's Exempt switch and a vehicle's exempt flag still give 0.
export const holdAllAmountFor = ({ veh, employees, assignedEmpId }) => {
  const truckNo = veh?.truckNo;
  if (pouchEmployeeFor(truckNo, employees, assignedEmpId, e => e.pouchExempt)) return 0;
  if (veh?.pouchExempt) return 0;
  const emp = pouchEmployeeFor(truckNo, employees, assignedEmpId, e => e.holdScope === "all" && hasAmount(e));
  return emp ? +emp.pouchAmount : 0;
};

// Amount to hold on a NEW trip / DI of this order type.
export const holdAmountFor = ({ orderType, veh, employees, assignedEmpId, settings }) =>
  orderType === "party" ? pouchAmountFor({ veh, employees, assignedEmpId, settings }) : holdAllAmountFor({ veh, employees, assignedEmpId });
