// Which employee should a vehicle be assigned to? The one on the vehicle's LATEST trip that had an employee.
// A vehicle with no trip history (or whose latest employee no longer exists) is left blank for the user to choose.
export const normTruck = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();
const isoDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? d : "");

export function lastEmployeeForVehicle(trips, truckNo, validEmpIds) {
  const key = normTruck(truckNo);
  if (!key) return null;
  let best = null;
  for (const t of trips || []) {
    if (normTruck(t.truckNo) !== key || !String(t.assignedEmpId || "").trim()) continue;
    const rank = [isoDate(t.date), String(t.createdAt || "")];
    if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && rank[1] > best.rank[1])) best = { rank, t };
  }
  if (!best) return null;
  const empId = String(best.t.assignedEmpId).trim();
  if (validEmpIds && !validEmpIds.has(empId)) return null;
  return { empId, lrNo: best.t.lrNo || "", date: best.t.date || "" };
}
