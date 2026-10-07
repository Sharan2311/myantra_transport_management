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
        style={{ background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 10, color: C.text, padding: "12px 12px", fontSize: 15, outline: "none", width: "100%", boxSizing: "border-box", colorScheme: "light" }} />
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

// ── Print / PDF ──────────────────────────────────────────────────────────────
// Same approach as the app's other reports: build an HTML page with the client
// logo and open the browser's print dialog ("Save as PDF").
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function printHuskReport({ title, subtitle, summary = [], columns, rows, note }) {
  const th = columns.map(c => `<th style="text-align:${c.right ? "right" : "left"}">${esc(c.label)}</th>`).join("");
  const body = rows.map(r => `<tr>${columns.map(c => `<td style="text-align:${c.right ? "right" : "left"};${r._bold ? "font-weight:700;" : ""}">${esc(r[c.key])}</td>`).join("")}</tr>`).join("");
  const sum = summary.map(s => `<div class="box"><div class="k">${esc(s.label)}</div><div class="v">${esc(s.value)}</div></div>`).join("");
  const logo = RC.logoSrc ? `<img src="${RC.logoSrc}" style="width:52px;height:52px;border-radius:8px;object-fit:contain" />` : "";
  const html = `
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#0a1f3a;margin:24px}
      .head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #1565c0;padding-bottom:10px;margin-bottom:14px}
      .co{font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#1565c0}
      h1{font-size:20px;margin:2px 0 0}
      .sub{font-size:12px;color:#4a7090;margin-top:2px}
      .sum{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px}
      .box{border:1px solid #ccddf0;border-radius:8px;padding:8px 12px;min-width:130px}
      .k{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#4a7090;font-weight:700}
      .v{font-size:16px;font-weight:800;margin-top:2px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#1565c0;color:#fff;padding:7px 8px}
      td{padding:6px 8px;border-bottom:1px solid #dce8f4}
      tr:nth-child(even) td{background:#f6faff}
      .note{font-size:11px;color:#4a7090;margin-top:10px}
      .foot{margin-top:18px;font-size:10px;color:#4a7090;border-top:1px solid #ccddf0;padding-top:6px}
      @media print{*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}}
    </style>
    <div class="head">${logo}<div><div class="co">${esc(RC.companyName || "")}</div><h1>${esc(title)}</h1><div class="sub">${esc(subtitle || "")}</div></div></div>
    ${sum ? `<div class="sum">${sum}</div>` : ""}
    <table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>
    ${note ? `<div class="note">${esc(note)}</div>` : ""}
    <div class="foot">${esc(RC.companyName || "")}${RC.pan ? " · PAN: " + esc(RC.pan) : ""} · generated ${esc(new Date().toLocaleString("en-IN"))}</div>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to download the report."); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title></head><body onload="window.print()">${html}</body></html>`);
  w.document.close();
}
