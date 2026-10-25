// Which trips count in Driver Pay → By Employee.
// Settled trips that still owe money always count. An UNSETTLED trip counts only if it
// was saved on/after the cutoff — older unsettled trips are left out of this tab for now
// (they stay in the normal Driver Pay lists). Going forward every trip's balance shows.
export const BYEMP_UNSETTLED_FROM = "2026-10-25";

export const includeInByEmployee = (t, cutoff = BYEMP_UNSETTLED_FROM) => {
  if (!(t?.balancePlain > 0)) return false;
  if (t.driverSettled) return true;
  const saved = String(t.createdAt || "").slice(0, 10);   // ISO date the trip was saved
  return !!saved && saved >= cutoff;
};
