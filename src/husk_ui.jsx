// ─── husk_ui.jsx — small shared UI helpers for the Husk screens ──────────────
// The app's base components (C, Btn, Field, Sheet…) live inside App.jsx, so
// HuskMod hands them over once with setHuskUI() and the Husk files read them
// from here. Everything is inline-styled, like the rest of the app.
import React from "react";
import { RC } from "./runtime_config.js";

let UI = null;
export const setHuskUI = u => { UI = u; };
export const ui = () => UI;

export const Card = ({ children, style }) => {
  const { C } = UI;
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 14px", ...style }}>{children}</div>;
};

export const Label = ({ children }) => {
  const { C } = UI;
  return <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{children}</div>;
};

export const Muted = ({ children, style }) => {
  const { C } = UI;
  return <div style={{ color: C.muted, fontSize: 12, ...style }}>{children}</div>;
};

export const Empty = ({ children }) => {
  const { C } = UI;
  return <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "26px 10px" }}>{children}</div>;
};

export const Warn = ({ children, color }) => {
  const { C } = UI;
  const c = color || C.orange;
  return <div style={{ background: c + "18", border: `1px solid ${c}55`, color: c, borderRadius: 10, padding: "10px 12px", fontSize: 12, fontWeight: 600 }}>{children}</div>;
};

// Native date input styled like Field (Field's "date" type is a plain text box).
export const DateInput = ({ label, value, onChange, half }) => {
  const { C } = UI;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: half ? "1 1 45%" : "1 1 100%", minWidth: 0 }}>
      {label && <label style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{label}</label>}
      <input type="date" value={value || ""} onChange={e => onChange(e.target.value)}
        style={{ background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "12px 12px", fontSize: 15, outline: "none", width: "100%", maxWidth: "100%", minWidth: 0, display: "block", boxSizing: "border-box", colorScheme: "light", WebkitAppearance: "none", appearance: "none", textAlign: "left", minHeight: 48 }} />
    </div>
  );
};

// Select with a plain list of {v,l}; uses Field's select styling.
export const Pick = ({ label, value, onChange, options, half, note }) => {
  const { Field } = UI;
  return <Field label={label} value={value} onChange={onChange} opts={options} half={half} note={note} />;
};

export const fmtDay = iso => {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1];
  return `${m[3]} ${mon} ${m[1].slice(2)}`;
};
export const fmtTons = n => `${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })} t`;
// Signed rupees: "−₹5,000" / "₹5,000"
export const money = n => { const { fmt } = UI; return (n < 0 ? "−" : "") + fmt(Math.abs(n)); };

// ── Bordered table (screen) ─────────────────────────────────────────────────
// columns: [{key,label,right,w}] · rows: [{...}] · totals: {key:value} printed as a last row.
export function BTable({ columns, rows, totals, empty = "Nothing to show." }) {
  const { C } = UI;
  if (!rows.length) return <div style={{ color: C.muted, fontSize: 12, padding: "10px 4px" }}>{empty}</div>;
  const cell = { border: `1px solid ${C.border}`, padding: "7px 8px", fontSize: 12, verticalAlign: "top" };
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10, background: C.card }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: Math.max(320, columns.length * 78) }}>
        <thead><tr>{columns.map(c => (
          <th key={c.key} style={{ ...cell, background: C.card2, color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: c.right ? "right" : "left", whiteSpace: "nowrap" }}>{c.label}</th>
        ))}</tr></thead>
        <tbody>
          {rows.map((r, i) => r._group ? (
            <tr key={i}><td colSpan={columns.length} style={{ ...cell, background: r._note ? "#fff7e0" : C.card2, color: r._note ? "#8a5a00" : C.text, fontWeight: 800 }}>{r._group}</td></tr>
          ) : (
            <tr key={i}>{columns.map(c => (
              <td key={c.key} style={{ ...cell, textAlign: c.right ? "right" : "left", whiteSpace: c.right || c.nowrap ? "nowrap" : "normal", color: r._neg && c.right ? C.red : C.text, fontWeight: r._bold ? 700 : 400, minWidth: c.w }}>{r[c.key]}</td>
            ))}</tr>
          ))}
          {totals && <tr>{columns.map(c => (
            <td key={c.key} style={{ ...cell, textAlign: c.right ? "right" : "left", whiteSpace: "nowrap", fontWeight: 800, background: C.card2 }}>{totals[c.key] ?? ""}</td>
          ))}</tr>}
        </tbody>
      </table>
    </div>
  );
}

// Row of small summary boxes (screen).
export function SummaryBoxes({ items }) {
  const { C } = UI;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {items.map((s, i) => (
        <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px" }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{s.label}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: s.color || C.text, marginTop: 2 }}>{s.value}</div>
          {s.sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Print / PDF ──────────────────────────────────────────────────────────────
// Same approach as the app's other reports: build an HTML page with the client
// logo and open the browser's print dialog ("Save as PDF").
// Either pass one table (columns + rows) or `sections`: [{title, summary, columns, rows, totals}].
// A row with _group: "text" prints as a full-width sub-heading (used for day-wise lists).
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function printHuskReport({ title, subtitle, summary = [], sections, columns, rows, note }) {
  const secs = sections || [{ columns, rows }];
  const boxes = list => list.length ? `<div class="sum">${list.map(s => `<div class="box"><div class="k">${esc(s.label)}</div><div class="v">${esc(s.value)}</div></div>`).join("")}</div>` : "";
  const table = sec => {
    const th = sec.columns.map(c => `<th style="text-align:${c.right ? "right" : "left"}">${esc(c.label)}</th>`).join("");
    const body = (sec.rows || []).map(r => r._group
      ? `<tr class="group${r._note ? " note" : ""}"><td colspan="${sec.columns.length}">${esc(r._group)}</td></tr>`
      : `<tr>${sec.columns.map(c => `<td class="${c.right ? "num" : ""}" style="${r._bold ? "font-weight:700;" : ""}">${esc(r[c.key])}</td>`).join("")}</tr>`).join("");
    const tot = sec.totals ? `<tr class="total">${sec.columns.map(c => `<td class="${c.right ? "num" : ""}">${esc(sec.totals[c.key] ?? "")}</td>`).join("")}</tr>` : "";
    const empty = !(sec.rows || []).length ? `<tr><td colspan="${sec.columns.length}" style="text-align:center;color:#4a7090">Nothing to show</td></tr>` : "";
    return `<table><thead><tr>${th}</tr></thead><tbody>${body}${empty}${tot}</tbody></table>`;
  };
  const logo = RC.logoSrc ? `<img src="${RC.logoSrc}" style="width:52px;height:52px;border-radius:8px;object-fit:contain" />` : "";
  const html = `
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#0a1f3a;margin:22px}
      .head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #1565c0;padding-bottom:10px;margin-bottom:14px}
      .co{font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1565c0}
      h1{font-size:20px;margin:2px 0 0}
      h2{font-size:14px;margin:18px 0 6px;color:#1565c0}
      .sub{font-size:12px;color:#4a7090;margin-top:2px}
      .sum{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
      .box{border:1px solid #9bb7d4;border-radius:6px;padding:6px 10px;min-width:110px}
      .k{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#4a7090;font-weight:700}
      .v{font-size:14px;font-weight:800;margin-top:2px}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:6px}
      th{background:#1565c0;color:#fff;padding:6px 7px;border:1px solid #0d4a8f}
      td{padding:5px 7px;border:1px solid #9bb7d4;vertical-align:top}
      td.num{text-align:right;white-space:nowrap}
      tr{page-break-inside:avoid}
      tr:nth-child(even) td{background:#f6faff}
      tr.group td{background:#dce8f4;font-weight:700;color:#0a1f3a}
      tr.group.note td{background:#fff3cd;font-weight:800;color:#7a4a00}
      tr.total td{background:#e8f0fa;font-weight:800}
      .note{font-size:11px;color:#4a7090;margin-top:10px}
      .foot{margin-top:18px;font-size:10px;color:#4a7090;border-top:1px solid #ccddf0;padding-top:6px}
      @media print{*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}}
    </style>
    <div class="head">${logo}<div><div class="co">${esc(RC.companyName || "")}</div><h1>${esc(title)}</h1><div class="sub">${esc(subtitle || "")}</div></div></div>
    ${boxes(summary)}
    ${secs.map(sec => `${sec.title ? `<h2>${esc(sec.title)}</h2>` : ""}${boxes(sec.summary || [])}${table(sec)}`).join("")}
    ${note ? `<div class="note">${esc(note)}</div>` : ""}
    <div class="foot">${esc(RC.companyName || "")}${RC.pan ? " · PAN: " + esc(RC.pan) : ""} · generated ${esc(new Date().toLocaleString("en-IN"))}</div>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to download the report."); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title></head><body onload="window.print()">${html}</body></html>`);
  w.document.close();
}

// ── Financial year (India: 1 Apr – 31 Mar) ───────────────────────────────────
export const fyStartYear = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})/); return m ? (+m[2] >= 4 ? +m[1] : +m[1] - 1) : null; };
export const fyRange = y => ({ from: `${y}-04-01`, to: `${+y + 1}-03-31` });
export const fyLabel = y => `FY ${y}-${String(+y + 1).slice(2)}`;
// Picks a financial year by filling From / To. The select shows the FY that the
// current dates match exactly, otherwise "All time / custom dates".
export function FYPick({ from, to, onPick, data }) {
  const { Field } = UI;
  const years = new Set();
  const cur = fyStartYear(new Date().toISOString().slice(0, 10));
  years.add(cur);
  [...(data.trips || []).map(t => t.entryDate), ...(data.payments || []).map(p => p.date), ...(data.openings || []).map(o => o.asOf), ...(data.loans || []).map(l => l.date)]
    .forEach(d => { const y = fyStartYear(d); if (y) years.add(y); });
  const list = [...years].sort((a, b) => b - a);
  const match = list.find(y => { const r = fyRange(y); return r.from === from && r.to === to; });
  return <Field label="Financial year" value={match ? String(match) : ""}
    onChange={v => { if (!v) onPick("", ""); else { const r = fyRange(+v); onPick(r.from, r.to); } }}
    opts={[{ v: "", l: "All time / custom dates" }, ...list.map(y => ({ v: String(y), l: fyLabel(y) }))]} />;
}
export const periodText = (from, to) => {
  const y = fyStartYear(from);
  if (y && from === fyRange(y).from && to === fyRange(y).to) return fyLabel(y);
  return [from && `From ${fmtDay(from)}`, to && `To ${fmtDay(to)}`].filter(Boolean).join(" · ");
};
