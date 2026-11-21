// Day-wise view of diesel requests (like the trips list), so the owner can tick each one against the pump group.
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const amountOf = (r) => {
  const diesel = r.confirmedAmount ?? r.dieselAmount;
  const cash = r.confirmedCash ?? r.cashAmount;
  if (r.confirmedAmount != null || r.confirmedCash != null) return (+diesel || 0) + (+cash || 0);
  return +r.amount || 0;
};
const checkable = (r) => r.status === "confirmed" || r.status === "attached";

export const groupRequestsByDay = (requests) => {
  const by = new Map();
  for (const r of requests || []) {
    const d = ISO.test(String(r.date || "")) ? r.date : "";
    if (!by.has(d)) by.set(d, []);
    by.get(d).push(r);
  }
  const days = [...by.entries()].map(([date, items]) => {
    items.sort((a, b) => (+b.indentNo || 0) - (+a.indentNo || 0));
    return {
      date, items,
      count: items.length,
      total: items.reduce((s, r) => s + amountOf(r), 0),
      checked: items.filter((r) => checkable(r) && r.ownerVerified).length,
      open: items.filter((r) => r.status === "open").length,
    };
  });
  days.sort((a, b) => (a.date === "" ? 1 : b.date === "" ? -1 : b.date.localeCompare(a.date)));
  return days;
};
