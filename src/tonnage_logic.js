// Tonnage by 10-day block (1-10, 11-20, 21-end of month). Pure functions — no React, no database.
// Tested in scripts/tonnage_logic.test.mjs

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const blockOf = date => {
  const s = String(date || "").slice(0, 10);
  if (!ISO.test(s)) return null;
  const d = +s.slice(8, 10);
  return d <= 10 ? 1 : d <= 20 ? 2 : 3;
};
const lastDay = month => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const blockRange = (month, block) => {
  const last = lastDay(month);
  const [a, b] = block === 1 ? [1, 10] : block === 2 ? [11, 20] : [21, last];
  const p = d => `${month}-${String(d).padStart(2, "0")}`;
  return { from: p(a), to: p(b) };
};
const isClinker = t => /^CLK-/i.test(String(t.lrNo || "")) || /^CLINKER/i.test(String(t.truckNo || ""));
const nextMonth = m => { const [y, mm] = m.split("-").map(Number); return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`; };
const r2 = x => Math.round(x * 100) / 100;

// A stray trip months before the real data should not become the "lowest" — real data starts at the first month
// that has at least MIN_TRIPS_START cement trips.
export const MIN_TRIPS_START = 10;

// today: "YYYY-MM-DD" (the caller passes the LOCAL date). A block counts only once its last day is before today.
export function tonnageByBlock(trips, today) {
  const ignored = { clinker: 0, badDate: 0, beforeStart: 0 };
  const perMonth = new Map(); // month -> {tons:[0,0,0], trips:[0,0,0]}
  for (const t of trips || []) {
    if (isClinker(t)) { ignored.clinker++; continue; }
    const b = blockOf(t.date);
    if (!b) { ignored.badDate++; continue; }
    const month = String(t.date).slice(0, 7);
    if (!perMonth.has(month)) perMonth.set(month, { tons: [0, 0, 0], trips: [0, 0, 0] });
    const m = perMonth.get(month);
    m.tons[b - 1] += +t.qty || 0; m.trips[b - 1] += 1;
  }
  const keys = [...perMonth.keys()].sort();
  const start = keys.find(k => perMonth.get(k).trips.reduce((a, c) => a + c, 0) >= MIN_TRIPS_START);
  if (!start) return { months: [], summary: [1, 2, 3].map(block => ({ block, highest: null, lowest: null })), ignored, start: null };
  for (const k of keys) if (k < start) ignored.beforeStart += perMonth.get(k).trips.reduce((a, c) => a + c, 0);
  const end = keys[keys.length - 1];
  const months = [];
  for (let m = start; m <= end; m = nextMonth(m)) {
    const d = perMonth.get(m) || { tons: [0, 0, 0], trips: [0, 0, 0] };
    months.push({
      month: m,
      blocks: [1, 2, 3].map(b => {
        const { from, to } = blockRange(m, b);
        return { block: b, from, to, tons: r2(d.tons[b - 1]), trips: d.trips[b - 1], complete: to < today };
      }),
    });
  }
  const summary = [1, 2, 3].map(block => {
    const cands = months.map(m => ({ month: m.month, tons: m.blocks[block - 1].tons, ok: m.blocks[block - 1].complete && m.blocks[block - 1].tons > 0 })).filter(x => x.ok);
    if (!cands.length) return { block, highest: null, lowest: null };
    const hi = Math.max(...cands.map(c => c.tons)), lo = Math.min(...cands.map(c => c.tons));
    const pick = v => { const ms = cands.filter(c => c.tons === v).map(c => c.month); return { tons: v, month: ms[0], months: ms }; };
    return { block, highest: pick(hi), lowest: pick(lo) };
  });
  return { months, summary, ignored, start };
}
