// Which trips count in Driver Pay → By Employee.
// Settled trips that still owe money always count. An UNSETTLED trip counts only if it
// was saved on/after the cutoff, or the owner flagged it (byEmpInclude) — older unsettled trips are left out of this tab for now
// (they stay in the normal Driver Pay lists). Going forward every trip's balance shows.
export const BYEMP_UNSETTLED_FROM = "2026-10-25";

// The app stores createdAt as "dd/mm/yy, h:mm am" (en-IN short); older/other rows may be ISO.
// Returns "yyyy-mm-dd" or "" when it can't be read.
export const savedDay = (v) => {
  const x = String(v || "").trim();
  let m = x.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
};

export const includeInByEmployee = (t, cutoff = BYEMP_UNSETTLED_FROM) => {
  if (!(t?.balancePlain > 0)) return false;
  if (t.driverSettled) return true;
  if (t.byEmpInclude) return true;   // older unsettled trip the owner chose to show in By Employee
  const saved = savedDay(t.createdAt);   // day the trip was saved
  return !!saved && saved >= cutoff;
};
