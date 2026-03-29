import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { DB } from "./db.js";
import { supabase } from "./supabase.js";

// ─── THEME ────────────────────────────────────────────────────────────────────
const C = {
  bg:"#f0f6fc", card:"#ffffff", card2:"#e8f0fa", border:"#ccddf0",
  accent:"#1565c0", green:"#1b6e3a", red:"#b91c1c", blue:"#1565c0",
  purple:"#6d28d9", teal:"#0e7490", orange:"#c67c00",
  text:"#0a1f3a", muted:"#4a7090", dim:"#dce8f4",
};
const fmt   = n => "₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
const today = () => new Date().toISOString().split("T")[0];
const nowTs = () => new Date().toLocaleString("en-IN",{dateStyle:"short",timeStyle:"short"});
const uid   = () => Math.random().toString(36).slice(2,9).toUpperCase();

// ─── ROLES ────────────────────────────────────────────────────────────────────
const ROLES = {
  owner:    {label:"Owner",         color:C.accent, perms:["trips","billing","settlement","vehicles","employees","payments","reports","reminders","diesel","tafal","admin"]},
  manager:  {label:"Manager",       color:C.blue,   perms:["trips","billing","settlement","vehicles","employees","payments","reports","reminders","diesel","tafal"]},
  operator: {label:"Trip Operator", color:C.teal,   perms:["trips","billing","diesel"]},
  accounts: {label:"Accounts",      color:C.purple, perms:["billing","payments","reports","diesel","tafal"]},
  viewer:   {label:"Viewer",        color:C.muted,  perms:["reports"]},
};
const can = (user, p) => user && ROLES[user.role]?.perms.includes(p);

// ─── SUPABASE DATA HOOK ────────────────────────────────────────────────────────
// Loads data once, then every 15 seconds. Writes go straight to DB + local state.
function useDB(fetcher, initial = []) {
  const [data,  setData]  = useState(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await fetcher();
      // Merge: preserve locally-set party fields that may not be in DB yet
      // (receiptFilePath, mergedPdfPath, orderType, grFilePath, invoiceFilePath)
      const PARTY_FIELDS = ["receiptFilePath","receiptUploadedAt","mergedPdfPath",
        "orderType","grFilePath","invoiceFilePath","emailSentAt","partyEmail",
        "district","state","sealedInvoicePath"];
      setData(prev => {
        if(!Array.isArray(result)||!Array.isArray(prev)) return result;
        const prevMap = {};
        (prev||[]).forEach(t=>{ if(t.id) prevMap[t.id]=t; });
        return result.map(r => {
          const p = prevMap[r.id];
          if(!p) return r;
          // For each party field: use local value if DB value is empty/missing
          const merged = {...r};
          PARTY_FIELDS.forEach(f => {
            if(!merged[f] && p[f]) merged[f] = p[f];
          });
          return merged;
        });
      });
      setError(null);
    } catch(e) {
      console.error("DB load error:", e);
      setError(e.message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  // Returns [data, optimisticSetter, ready, reload]
  // optimisticSetter updates local state immediately, then saves to DB
  const set = useCallback((updater) => {
    setData(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

  return [data, set, ready, load, error];
}

// ─── CALC NET ────────────────────────────────────────────────────────────────
// Supports single-rate trips AND multi-DI trips (diLines array)
function calcNet(t, vehicle, confirmedDiesel) {
  // Multi-DI: gross = sum of each DI's qty × its own givenRate
  const gross = t.diLines && t.diLines.length > 0
    ? t.diLines.reduce((s, d) => s + (d.qty||0) * (d.givenRate||0), 0)
    : (t.qty||0) * (t.givenRate||0);
  // Bill to Shree = per-DI qty × per-DI frRate (falls back to trip-level frRate)
  const billed = t.diLines && t.diLines.length > 0
    ? t.diLines.reduce((s,d) => s + (d.qty||0) * (d.frRate || t.frRate || 0), 0)
    : (t.qty||0) * (t.frRate||0);
  const tafal            = t.tafal || 0;
  const loanDeduct       = vehicle ? (vehicle.deductPerTrip||0) : 0;
  const diesel           = confirmedDiesel != null ? confirmedDiesel : (t.dieselEstimate||0);
  const advance          = t.advance || 0;
  const shortageRecovery = t.shortageRecovery || 0;
  const loanRecovery     = t.loanRecovery || 0;
  const net              = gross - advance - tafal - loanDeduct - diesel - shortageRecovery - loanRecovery;
  return {gross, billed, tafal, loanDeduct, diesel, advance, shortageRecovery, loanRecovery, net};
}

const mkTrip = (o) => ({
  id:uid(), type:"outbound", lrNo:"", diNo:"", truckNo:"", grNo:"",
  consignee:"", from:"", to:"", grade:"Cement Packed", qty:0, bags:0,
  frRate:0, givenRate:0, date:today(), advance:0, shortage:0, tafal:0,
  shortageRecovery:0, loanRecovery:0,
  status:"Pending Bill", invoiceNo:"", paymentStatus:"Unpaid",
  driverSettled:false, dieselEstimate:0,
  dieselIndentNo:"", // indent number from pump slip — given before loading
  diLines:[], // [{diNo, grNo, qty, bags, givenRate}] — for multi-DI trips
  createdBy:"system", createdAt:nowTs(), ...o
});

// ─── BASE UI COMPONENTS ───────────────────────────────────────────────────────
const Badge = ({label, color}) => (
  <span style={{background:color+"22",color,border:`1px solid ${color}44`,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>
);
const SC = s => ({"Pending Bill":C.accent,"Billed":C.blue,"Paid":C.green,"Unpaid":C.red}[s]||C.muted);

const Field = ({label, value, onChange, type="text", placeholder="", opts=null, half=false, note=""}) => {
  const isNum = type === "number";
  const handleNum = e => {
    const v = e.target.value;
    // Allow empty string, digits only, one decimal — no negatives, no special chars
    if(v === "" || /^\d*\.?\d*$/.test(v)) onChange(v);
  };
  // For number fields: keep raw string in state so "0" doesn't vanish mid-typing
  const displayVal = isNum ? (value === undefined || value === null ? "" : String(value)) : value;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5,flex:half?"1 1 45%":"1 1 100%",minWidth:0}}>
      {label && <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{label}</label>}
      {opts
        ? <select value={value} onChange={e=>onChange(e.target.value)}
            style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,padding:"13px 12px",fontSize:15,outline:"none",WebkitAppearance:"none",appearance:"none"}}>
            {opts.map(o => <option key={o.v??o} value={o.v??o}>{o.l??o}</option>)}
          </select>
        : <input
            type="text"
            inputMode={isNum ? "decimal" : type==="date" ? undefined : "text"}
            value={displayVal}
            onChange={isNum ? handleNum : e=>onChange(e.target.value)}
            onFocus={isNum ? e=>e.target.select() : undefined}
            placeholder={placeholder}
            onClick={type==="date"?e=>e.target.showPicker?.():undefined}
            style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,
              padding:"13px 12px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box",
              WebkitAppearance:"none",MozAppearance:"textfield",
              ...(type==="date"?{colorScheme:"light"}:{})}} />
      }
      {note && <div style={{color:C.muted,fontSize:11}}>{note}</div>}
    </div>
  );
};

// ─── SEARCHSELECT — searchable dropdown for LR/trip lists ─────────────────────
function SearchSelect({label, value, onChange, opts=[], half=false, placeholder="Search…", note=""}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? opts.filter(o => (o.l??o).toLowerCase().includes(query.toLowerCase()))
    : opts;

  const selected = opts.find(o => (o.v??o) === value);
  const displayLabel = selected ? (selected.l??selected) : "";

  const select = ov => { onChange(ov); setOpen(false); setQuery(""); };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:5,flex:half?"1 1 45%":"1 1 100%",minWidth:0}}>
      {label && <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{label}</label>}

      {/* Trigger — shows selected value or placeholder */}
      <div onTouchEnd={e=>{e.preventDefault();setOpen(o=>!o);setQuery("");}}
           onClick={()=>{setOpen(o=>!o);setQuery("");}}
        style={{background:C.bg,border:`1.5px solid ${open?C.accent:C.border}`,borderRadius:10,
          padding:"13px 12px",fontSize:15,cursor:"pointer",
          display:"flex",justifyContent:"space-between",alignItems:"center",userSelect:"none",
          WebkitTapHighlightColor:"transparent"}}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,
          color:value?C.text:C.muted}}>
          {displayLabel || placeholder}
        </span>
        <span style={{color:C.muted,fontSize:12,marginLeft:8,flexShrink:0}}>{open?"▲":"▼"}</span>
      </div>

      {/* Inline expand — no absolute, no overflow issues on mobile */}
      {open && (
        <div style={{background:C.card,border:`1.5px solid ${C.accent}44`,borderRadius:12,overflow:"hidden"}}>
          {/* Search box */}
          <div style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}`}}>
            <input
              value={query} onChange={e=>setQuery(e.target.value)}
              placeholder="Type to search…"
              style={{width:"100%",boxSizing:"border-box",background:C.bg,border:`1px solid ${C.border}`,
                borderRadius:8,padding:"9px 10px",color:C.text,fontSize:14,outline:"none",
                WebkitAppearance:"none"}}/>
          </div>
          {/* Options */}
          <div style={{maxHeight:200,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
            {filtered.length===0 && (
              <div style={{padding:"14px 12px",color:C.muted,fontSize:13,textAlign:"center"}}>No results</div>
            )}
            {filtered.map((o,i)=>{
              const ov = o.v??o, ol = o.l??o;
              const isSel = ov===value;
              const isEmpty = ov===""||ov===null||ov===undefined;
              return (
                <div key={i}
                  onTouchEnd={e=>{e.preventDefault();select(ov);}}
                  onClick={()=>select(ov)}
                  style={{padding:"12px",cursor:"pointer",fontSize:13,
                    borderBottom:`1px solid ${C.border}22`,
                    background:isSel?C.accent+"22":"transparent",
                    color:isEmpty?C.muted:isSel?C.accent:C.text,
                    WebkitTapHighlightColor:"transparent"}}>
                  {ol}
                </div>
              );
            })}
          </div>
          {/* Clear + Close */}
          <div style={{display:"flex",borderTop:`1px solid ${C.border}`}}>
            {value && (
              <div onTouchEnd={e=>{e.preventDefault();select("");}}
                   onClick={()=>select("")}
                style={{flex:1,padding:"10px 12px",color:C.red,fontSize:12,cursor:"pointer",
                  textAlign:"center",borderRight:`1px solid ${C.border}`,
                  WebkitTapHighlightColor:"transparent"}}>
                ✕ Clear
              </div>
            )}
            <div onTouchEnd={e=>{e.preventDefault();setOpen(false);setQuery("");}}
                 onClick={()=>{setOpen(false);setQuery("");}}
              style={{flex:1,padding:"10px 12px",color:C.muted,fontSize:12,cursor:"pointer",
                textAlign:"center",WebkitTapHighlightColor:"transparent"}}>
              ✕ Close
            </div>
          </div>
        </div>
      )}
      {note && <div style={{color:C.muted,fontSize:11}}>{note}</div>}
    </div>
  );
}

// ─── ERROR BOUNDARY — prevents blank screen crashes ───────────────────────────
class ErrBound extends React.Component {
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return {err:e};}
  render(){
    if(this.state.err) return (
      <div style={{background:"#fef2f2",border:"1px solid #b91c1c",borderRadius:12,padding:16,margin:8}}>
        <div style={{color:"#da3633",fontWeight:800,marginBottom:6}}>⚠ Something went wrong</div>
        <div style={{color:"#6b7280",fontSize:12}}>{this.state.err?.message||"Unknown error"}</div>
        <button onClick={()=>this.setState({err:null})}
          style={{marginTop:10,background:"#da3633",border:"none",color:"#fff",
            borderRadius:8,padding:"8px 16px",cursor:"pointer",fontWeight:700}}>
          Retry
        </button>
      </div>
    );
    return this.props.children;
  }
}

const Btn = ({children, onClick, color=C.accent, outline=false, sm=false, full=false, disabled=false, loading=false}) => (
  <button onClick={onClick} disabled={disabled||loading} style={{
    background: (disabled||loading) ? C.dim : (outline ? "transparent" : color),
    color: (disabled||loading) ? C.muted : (outline ? color : "#000"),
    border: `2px solid ${(disabled||loading) ? C.dim : color}`,
    borderRadius:12, padding: sm ? "8px 16px" : "14px 20px",
    fontSize: sm ? 13 : 15, fontWeight:800,
    cursor: (disabled||loading) ? "not-allowed" : "pointer",
    width: full ? "100%" : "auto", minWidth: sm ? 0 : 80,
    display:"flex", alignItems:"center", justifyContent:"center", gap:6,
  }}>{loading ? "Saving…" : children}</button>
);

const Sheet = ({title, onClose, children}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
    onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:C.card,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:600,maxHeight:"92vh",overflowY:"auto",paddingBottom:40}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"14px 16px 12px",borderBottom:`1px solid ${C.border}`,
        position:"sticky",top:0,background:C.card,zIndex:1,gap:12}}>
        <span style={{color:C.text,fontWeight:800,fontSize:16,flex:1,minWidth:0,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</span>
        <button onClick={onClose}
          style={{background:C.red,border:"none",color:"#fff",borderRadius:12,
            minWidth:52,height:44,fontSize:15,fontWeight:700,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",
            flexShrink:0,gap:4,padding:"0 14px",letterSpacing:0.3}}>
          ✕ Close
        </button>
      </div>
      <div style={{padding:"16px 18px 0"}}>{children}</div>
    </div>
  </div>
);

const KPI = ({label, value, color=C.text, sub, icon=""}) => (
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 12px"}}>
    <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{icon} {label}</div>
    <div style={{fontSize:19,fontWeight:900,color}}>{value}</div>
    {sub && <div style={{fontSize:11,color:C.muted,marginTop:3}}>{sub}</div>}
  </div>
);

const PillBar = ({items, active, onSelect}) => (
  <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:2,scrollbarWidth:"none"}}>
    {items.map(i => (
      <button key={i.id} onClick={()=>onSelect(i.id)} style={{
        background: active===i.id ? i.color+"22" : "transparent",
        border: `1.5px solid ${active===i.id ? i.color : C.border}`,
        color: active===i.id ? i.color : C.muted,
        borderRadius:20, padding:"6px 13px", fontSize:12, fontWeight:700,
        cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
      }}>{i.label}</button>
    ))}
  </div>
);

const Av = ({name, role, size=34}) => {
  const c = ROLES[role]?.color || C.muted;
  return <div style={{width:size,height:size,borderRadius:"50%",background:c+"33",border:`2px solid ${c}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:900,color:c,flexShrink:0}}>{(name||"?")[0]}</div>;
};

const ErrBanner = ({msg}) => msg ? (
  <div style={{background:C.red+"11",border:`1px solid ${C.red}33`,borderRadius:10,padding:"10px 14px",color:C.red,fontSize:12,marginBottom:10}}>
    ⚠ {msg}
  </div>
) : null;

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────
const MAIN_IDS = ["dashboard","trips","billing","diesel","more"];
function BottomNav({tab, setTab, user, trips, driverPays, vehicles}) {
  const items = [
    {id:"dashboard",icon:"⊞",label:"Home",    perm:null},
    {id:"trips",    icon:"🚚",label:"Trips",   perm:"trips"},
    {id:"billing",  icon:"🧾",label:"Billing", perm:"billing"},
    {id:"diesel",   icon:"⛽",label:"Diesel",  perm:"diesel"},
    {id:"more",     icon:"⋯", label:"More",    perm:null},
  ].filter(n => !n.perm || can(user, n.perm));

  // Badge counts
  const pendingBills = (trips||[]).filter(t=>t.status==="Pending Bill").length;
  const unsettledDrivers = (trips||[]).filter(t=>{
    if(t.driverSettled) return false;
    const veh = (vehicles||[]).find(v=>v.truckNo===t.truckNo);
    const gross = (t.qty||0)*(t.givenRate||0);
    const deducts = (t.advance||0)+(t.tafal||0)+(veh?.deductPerTrip||0)+(t.dieselEstimate||0);
    const netDue = Math.max(0, gross-deducts);
    const paid = (driverPays||[]).filter(p=>p.tripId===t.id).reduce((s,p)=>s+(p.amount||0),0);
    return netDue>0 && paid<netDue;
  }).length;
  // Only billing and more tabs get badges — trips/diesel tabs don't need them
  const badges = {billing:pendingBills||null, more:unsettledDrivers||null};

  return (
    <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:600,background:C.card,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom,6px)"}}>
      {items.map(n => {
        const active = tab===n.id || (n.id==="more" && !MAIN_IDS.includes(tab));
        const badge = badges[n.id];
        return (
          <button key={n.id} onClick={()=>setTab(n.id)} style={{flex:1,background:"none",border:"none",padding:"10px 4px 5px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",color:active?C.accent:C.muted,position:"relative"}}>
            <span style={{fontSize:20,lineHeight:1,position:"relative"}}>
              {n.icon}
              {badge ? <span style={{position:"absolute",top:-4,right:-8,background:C.red,color:"#fff",fontSize:9,fontWeight:800,borderRadius:10,padding:"1px 4px",minWidth:14,textAlign:"center",lineHeight:"14px"}}>{badge>9?"9+":badge}</span> : null}
            </span>
            <span style={{fontSize:10,fontWeight:700}}>{n.label}</span>
            {active && <div style={{width:18,height:3,background:C.accent,borderRadius:2}} />}
          </button>
        );
      })}
    </nav>
  );
}

const MORE_TABS = [
  {id:"inbound",   icon:"🏭",label:"Raw Material",   perm:"trips",      group:"ops"},
  {id:"driverPay", icon:"🏧",label:"Driver Pay",     perm:"settlement", group:"money"},
  {id:"settlement",icon:"💵",label:"Settlement",     perm:"settlement", group:"money"},
  {id:"tafal",     icon:"🤝",label:"TAFAL",          perm:"tafal",      group:"money"},
  {id:"vehicles",  icon:"🚛",label:"Vehicles",       perm:"vehicles",   group:"fleet"},
  {id:"employees", icon:"👥",label:"Employees",      perm:"employees",  group:"fleet"},
  {id:"payments",  icon:"💰",label:"Shree Payments", perm:"payments",   group:"finance"},
  {id:"expenses",  icon:"🧮",label:"Expenses",       perm:"payments",   group:"finance"},
  {id:"reports",   icon:"📤",label:"Reports",        perm:"reports",    group:"info"},
  {id:"reminders", icon:"📲",label:"Reminders",      perm:"reminders",  group:"info"},
  {id:"activity",  icon:"📋",label:"Activity Log",   perm:"reports",    group:"info"},
  {id:"admin",     icon:"⚙", label:"User Admin",     perm:"admin",      group:"info"},
];
const MORE_GROUPS = [
  {id:"ops",     label:"Operations"},
  {id:"money",   label:"Payments & Settlement"},
  {id:"fleet",   label:"Fleet & People"},
  {id:"finance", label:"Finance"},
  {id:"info",    label:"Reports & Admin"},
];
function MoreMenu({user, setTab, trips, driverPays, vehicles}) {
  // Compute badges for more menu items
  const pendingBills = (trips||[]).filter(t=>t.status==="Pending Bill").length;
  const unsettled = (trips||[]).filter(t=>{
    if(t.driverSettled) return false;
    const veh=(vehicles||[]).find(v=>v.truckNo===t.truckNo);
    const netDue=Math.max(0,(t.qty||0)*(t.givenRate||0)-(t.advance||0)-(t.tafal||0)-(veh?.deductPerTrip||0)-(t.dieselEstimate||0));
    return netDue>0 && (driverPays||[]).filter(p=>p.tripId===t.id).reduce((s,p)=>s+(p.amount||0),0)<netDue;
  }).length;
  const tabBadge = {driverPay:unsettled||null, settlement:unsettled||null};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      {MORE_GROUPS.map(g => {
        const tabs = MORE_TABS.filter(t=>t.group===g.id&&can(user,t.perm));
        if(!tabs.length) return null;
        return (
          <div key={g.id}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{g.label}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {tabs.map(t => {
                const badge = tabBadge[t.id];
                return (
                  <button key={t.id} onClick={()=>setTab(t.id)}
                    style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 12px",
                      display:"flex",flexDirection:"column",gap:6,cursor:"pointer",textAlign:"left",position:"relative"}}>
                    <span style={{fontSize:22}}>{t.icon}</span>
                    <span style={{color:C.text,fontWeight:700,fontSize:13}}>{t.label}</span>
                    {badge ? <span style={{position:"absolute",top:8,right:10,background:C.red,color:"#fff",
                      fontSize:10,fontWeight:800,borderRadius:10,padding:"2px 6px"}}>{badge}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({onLogin}) {
  const [un, setUn] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    const username = un.trim().toLowerCase();
    if (!username || !pin) { setErr("Enter username and PIN."); return; }
    setBusy(true); setErr("");
    try {
      // Query Supabase directly — bypasses any caching issue
      // Fetch by username only, check pin + active in JS
      const { data: rows, error } = await supabase
        .from('mye_users')
        .select('*')
        .eq('username', username);
      const data = (rows||[]).find(u => u.pin === pin && u.active !== false);
      if (error) throw new Error(error.message);
      if (!data) {
        setErr("Wrong username or PIN. Try again.");
      } else {
        const u = {
          id: data.id, name: data.name, username: data.username,
          pin: data.pin, role: data.role, active: data.active,
          createdAt: data.created_at,
        };
        onLogin(u);
      }
    } catch(e) {
      setErr("Cannot reach database. Check internet connection. (" + e.message + ")");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,-apple-system,sans-serif"}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:44,marginBottom:8}}>⬡</div>
          <div style={{color:C.accent,fontWeight:900,fontSize:22,letterSpacing:1}}>M. YANTRA ENTERPRISES</div>
          <div style={{color:C.muted,fontSize:12,letterSpacing:3,marginTop:4}}>TRANSPORT MANAGEMENT</div>
        </div>
        <div style={{background:C.card,borderRadius:20,padding:24,display:"flex",flexDirection:"column",gap:14}}>
          <Field label="Username" value={un} onChange={setUn} placeholder="owner / raju / suresh" />
          <Field label="PIN" value={pin} onChange={setPin} type="password" placeholder="4-digit PIN" />
          {err && <div style={{color:C.red,fontSize:13,background:C.red+"11",border:`1px solid ${C.red}33`,borderRadius:10,padding:"10px 14px"}}>{err}</div>}
          <Btn onClick={go} full loading={busy}>{busy ? "Checking…" : "Login →"}</Btn>
        </div>
        <div style={{textAlign:"center",color:C.muted,fontSize:12,marginTop:16}}>
          Users: owner · raju · suresh · accounts
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [tab,  setTab]  = useState("dashboard");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const [users,       setUsers,       rU, reloadUsers]       = useDB(DB.getUsers,       []);
  const [trips,       setTrips,       rT, reloadTrips]       = useDB(DB.getTrips,       []);
  const [allTripsLoaded, setAllTripsLoaded] = useState(false);
  const [loadingAllTrips, setLoadingAllTrips] = useState(false);
  // Load all trips (beyond 90-day default) — called explicitly by user
  const loadAllTrips = async () => {
    setLoadingAllTrips(true);
    try {
      const all = await DB.getTripsAll();
      setTrips(() => all);
      setAllTripsLoaded(true);
    } catch(e) {
      alert("Could not load older trips: " + e.message);
    } finally {
      setLoadingAllTrips(false);
    }
  };
  const [vehicles,    setVehicles,    rV, reloadVehicles]    = useDB(DB.getVehicles,    []);
  const [employees,   setEmployees,   rE, reloadEmployees]   = useDB(DB.getEmployees,   []);
  const [payments,    setPayments,    rP, reloadPayments]    = useDB(DB.getPayments,    []);
  const [settlements, setSettlements, rS, reloadSettlements] = useDB(DB.getSettlements, []);
  const [activity,    setActivity,    rA, reloadActivity]    = useDB(DB.getActivity,    []);
  const [pumps,       setPumps,       rPu,reloadPumps]       = useDB(DB.getPumps,       []);
  const [indents,        setIndents,        rI,  reloadIndents]       = useDB(DB.getIndents,       []);
  const [pumpPayments,   setPumpPayments,   rPP, reloadPumpPayments] = useDB(DB.getPumpPayments, []);
  const dbSetPumpPayments = async (val) => { setPumpPayments(val); }; // pump payments saved individually via recordPumpPayment
  const [settings,    setSettings,    rSt,reloadSettings]    = useDB(DB.getSettings,    {tafalPerTrip:300});
  const [driverPays,  setDriverPays,  rDP,reloadDriverPays]  = useDB(DB.getDriverPays,  []);
  const [expenses,       setExpenses,       rEx, reloadExpenses]      = useDB(DB.getExpenses,       []);
  const [gstReleases,    setGstReleases,    rGR, reloadGst]           = useDB(DB.getGstReleases,    []);
  const [cashTransfers,  setCashTransfers,  rCT, reloadCashTransfers] = useDB(DB.getCashTransfers,  []);

  const loading = !rU||!rT||!rV||!rE||!rP||!rS||!rPu||!rI||!rSt||!rDP||!rEx||!rGR;
  const dbError = (!rU && users.length===0) ? "Could not load users from database." : null;

  // ── Wrapped setters that also persist to DB ──────────────────────────────
  const save = async (fn, reload, label="") => {
    setSaving(true); setSaveErr("");
    try { await fn(); if(reload) await reload(); }
    catch(e) { console.error(label, e); setSaveErr(e.message||"Save failed. Check connection."); }
    finally { setSaving(false); }
  };

  const log = async (action, detail) => {
    if (!user) return;
    const e = {id:uid(), user:user.name, role:user.role, action, detail, time:nowTs()};
    setActivity(p => [e, ...(p||[]).slice(0,199)]);
    try { await DB.logActivity(e); } catch(err) { console.warn("Activity log failed", err); }
  };

  // ── DB-backed setters ────────────────────────────────────────────────────
  const dbSetTrips = (updater) => {
    setTrips(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // Persist changed trips
      const prevIds = new Set((prev||[]).map(t=>t.id));
      next.forEach(t => {
        if (!prevIds.has(t.id) || JSON.stringify(t) !== JSON.stringify((prev||[]).find(x=>x.id===t.id))) {
          DB.saveTrip(t).catch(e => setSaveErr(e.message));
        }
      });
      return next;
    });
  };

  const dbSetVehicles = (updater) => {
    setVehicles(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(v => DB.saveVehicle(v).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetEmployees = (updater) => {
    setEmployees(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(e => DB.saveEmployee(e).catch(err => setSaveErr(err.message)));
      return next;
    });
  };

  const dbSetPayments = (updater) => {
    setPayments(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set((prev||[]).map(p=>p.id));
      next.filter(p => !prevIds.has(p.id)).forEach(p => DB.savePayment(p).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetSettlements = (updater) => {
    setSettlements(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set((prev||[]).map(s=>s.id));
      next.filter(s => !prevIds.has(s.id)).forEach(s => DB.saveSettlement(s).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetPumps = (updater) => {
    setPumps(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set((prev||[]).map(p=>p.id));
      next.filter(p => !prevIds.has(p.id)).forEach(p => DB.savePump(p).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetIndents = (updater) => {
    setIndents(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(i => DB.saveIndent(i).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetDriverPays = (updater) => {
    setDriverPays(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set((prev||[]).map(p=>p.id));
      next.filter(p => !prevIds.has(p.id)).forEach(p => DB.saveDriverPay(p).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetExpenses = (updater) => {
    setExpenses(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set((prev||[]).map(e=>e.id));
      next.filter(e => !prevIds.has(e.id)).forEach(e => DB.saveExpense(e).catch(err => setSaveErr(err.message)));
      return next;
    });
  };

  const dbSetGstReleases = (updater) => {
    setGstReleases(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set((prev||[]).map(r=>r.id));
      next.filter(r => !prevIds.has(r.id)).forEach(r => DB.saveGstRelease(r).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetCashTransfers = (updater) => {
    setCashTransfers(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set((prev||[]).map(r=>r.id));
      next.filter(r => !prevIds.has(r.id)).forEach(r => DB.saveCashTransfer(r).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetSettings = (val) => {
    setSettings(val);
    DB.saveSettings(val).catch(e => setSaveErr(e.message));
  };

  const dbSetUsers = (updater) => {
    setUsers(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      next.forEach(u => DB.saveUser(u).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const sp = {
    trips, setTrips:dbSetTrips,
    vehicles, setVehicles:dbSetVehicles,
    employees, setEmployees:dbSetEmployees,
    payments, setPayments:dbSetPayments,
    settlements, setSettlements:dbSetSettlements,
    activity, setActivity,
    pumps, setPumps:dbSetPumps,
    indents, setIndents:dbSetIndents,
    pumpPayments, setPumpPayments:dbSetPumpPayments,
    settings:settings||{tafalPerTrip:300}, setSettings:dbSetSettings,
    driverPays, setDriverPays:dbSetDriverPays,
    expenses, setExpenses:dbSetExpenses,
    gstReleases, setGstReleases:dbSetGstReleases,
    cashTransfers, setCashTransfers:dbSetCashTransfers,
    user, log,
    allTripsLoaded, loadingAllTrips, loadAllTrips,
  };

  // ── Retroactive auto-settle: runs whenever trips or driverPays change ─────────
  // Catches trips that reached balance=0 before auto-settle was deployed,
  // or trips paid via external means without going through savePayment.
  React.useEffect(() => {
    if(!trips?.length || !vehicles) return;
    const toSettle = trips.filter(t => {
      if(t.driverSettled) return false;                    // already settled
      const veh = vehicles.find(v=>v.truckNo===t.truckNo);
      const gross   = (t.qty||0)*(t.givenRate||0);
      const deducts = (t.advance||0)+(t.tafal||0)+(veh?.deductPerTrip||0)+(t.dieselEstimate||0)+((t.shortage||0)*(t.givenRate||0));
      const netDue  = Math.max(0, gross - deducts);
      if(netDue <= 0) return false;                        // nothing due — not a real trip payment
      const paid = (driverPays||[]).filter(p=>p.tripId===t.id).reduce((s,p)=>s+(p.amount||0),0);
      return paid >= netDue;                               // fully paid but not marked settled
    });
    if(toSettle.length === 0) return;
    dbSetTrips(prev => prev.map(t => {
      if(!toSettle.find(s=>s.id===t.id)) return t;
      const veh = vehicles.find(v=>v.truckNo===t.truckNo);
      const gross   = (t.qty||0)*(t.givenRate||0);
      const deducts = (t.advance||0)+(t.tafal||0)+(veh?.deductPerTrip||0)+(t.dieselEstimate||0)+((t.shortage||0)*(t.givenRate||0));
      const netDue  = Math.max(0, gross - deducts);
      return {...t, driverSettled:true, settledBy:"auto", netPaid:netDue};
    }));
  }, [trips, driverPays, vehicles, allTripsLoaded]);

  if (!user) {
    if (loading) return (
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,fontFamily:"system-ui"}}>
        <div style={{fontSize:36}}>⬡</div>
        <div style={{color:C.accent,fontWeight:900,fontSize:18}}>M. YANTRA</div>
        <div style={{color:C.muted,fontSize:13}}>Connecting to database…</div>
      </div>
    );
    return <Login onLogin={u=>{setUser(u);log("LOGIN",`${u.name} signed in`);}} />;
  }

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif",color:C.text,maxWidth:600,margin:"0 auto",paddingBottom:80,position:"relative"}}>
        {/* Logo watermark */}
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          width:300,height:300,pointerEvents:"none",zIndex:0,
          backgroundImage:`url(${LOGO_B64})`,backgroundSize:"contain",
          backgroundRepeat:"no-repeat",backgroundPosition:"center",
          opacity:0.07}} />
      {/* TOP BAR */}
      <div style={{position:"sticky",top:0,zIndex:50,background:C.card,borderBottom:`1px solid ${C.border}`,padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{color:C.accent,fontWeight:900,fontSize:14}}>⬡ M. YANTRA</div>
          <div style={{color:C.muted,fontSize:10,letterSpacing:1}}>TRANSPORT MANAGEMENT</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:C.green,animation:"pulse 2s infinite"}} />
            <span style={{color:C.muted,fontSize:11}}>Live</span>
          </div>
          <Av name={user.name} role={user.role} />
          <button onClick={()=>{log("LOGOUT",`${user.name} signed out`);setUser(null);}}
            style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>Out</button>
        </div>
      </div>

      {/* SAVE ERROR BANNER */}
      {saveErr && (
        <div style={{background:C.red+"11",borderBottom:`1px solid ${C.red}33`,padding:"8px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:C.red,fontSize:12}}>⚠ {saveErr}</span>
          <button onClick={()=>setSaveErr("")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>×</button>
        </div>
      )}

      <div style={{padding:"14px 16px 8px"}}>
        {tab==="dashboard"  && <Dashboard {...sp} setTab={setTab} />}
        {tab==="trips"      && can(user,"trips")      && <Trips      {...sp} tripType="outbound" />}
        {tab==="inbound"    && can(user,"trips")      && <Trips      {...sp} tripType="inbound" />}
        {tab==="billing"    && can(user,"billing")    && <Billing    {...sp} />}
        {tab==="settlement" && can(user,"settlement") && <Settlement {...sp} />}
        {tab==="tafal"      && can(user,"tafal")      && <TafalMod   {...sp} />}
        {tab==="diesel"     && can(user,"diesel")     && <DieselMod  {...sp} />}
        {tab==="vehicles"   && can(user,"vehicles")   && <Vehicles   {...sp} />}
        {tab==="employees"  && can(user,"employees")  && <Employees  {...sp} />}
        {tab==="payments"   && can(user,"payments")   && <Payments   {...sp} />}
        {tab==="driverPay"  && can(user,"settlement") && <DriverPayments {...sp} />}
        {tab==="expenses"   && can(user,"payments")   && <ExpensesLedger {...sp} />}
        {tab==="reports"    && can(user,"reports")    && <Reports    {...sp} />}
        {tab==="reminders"  && can(user,"reminders")  && <Reminders  {...sp} />}
        {tab==="activity"   && can(user,"reports")    && <ActivityLog activity={activity} />}
        {tab==="admin"      && can(user,"admin")      && <UserAdmin  users={users} setUsers={dbSetUsers} user={user} log={log} />}
        {tab==="more"       && <MoreMenu user={user} setTab={setTab} trips={trips} driverPays={driverPays} vehicles={vehicles} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} user={user} trips={trips} driverPays={driverPays} vehicles={vehicles} />
    </div>
  );
}
// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({trips, vehicles, employees, indents, pumps, pumpPayments, driverPays, activity, settings, setTab, user}) {
  const todayStr    = today();
  const todayTrips  = trips.filter(t => t.date===todayStr);
  const pending     = trips.filter(t => t.status==="Pending Bill");
  const weekAgo     = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
  const weekAgoStr  = weekAgo.toISOString().split("T")[0];
  const oldUnsettled = trips.filter(t => !t.driverSettled && t.date < weekAgoStr && (t.qty||0)*(t.givenRate||0)>0);
  const margin      = trips.reduce((s,t) => s + t.qty*(t.frRate-t.givenRate), 0);
  const todayMargin = todayTrips.reduce((s,t) => s + t.qty*(t.frRate-t.givenRate), 0);
  const confirmedIndents = indents.filter(i => i.confirmed);
  const totalDieselOwed = confirmedIndents.reduce((s,i) => s+(+(i.amount)||0), 0);
  const totalDieselPaid = (pumpPayments||[]).reduce((s,p) => s+(+(p.amount)||0), 0);
  const unpaidDiesel = Math.max(0, totalDieselOwed - totalDieselPaid);
  const tafalPool   = trips.reduce((s,t) => s+(t.tafal||0), 0);
  const vLoan       = vehicles.reduce((s,v) => s + Math.max(0, v.loan-v.loanRecovered), 0);

  // Actionable alerts
  const alerts = [
    pending.length>0 && {color:C.accent, icon:"🧾", text:`${pending.length} trip${pending.length>1?"s":""} pending bill — ₹${(pending.reduce((s,t)=>s+t.qty*t.frRate,0)).toLocaleString("en-IN")}`, tab:"billing"},
    oldUnsettled.length>0 && {color:C.red, icon:"⏰", text:`${oldUnsettled.length} trip${oldUnsettled.length>1?"s":""} unsettled >7 days`, tab:"driverPay"},
    unpaidDiesel>0 && {color:C.orange, icon:"⛽", text:`Diesel payment pending — ${fmt(unpaidDiesel)}`, tab:"diesel"},
  ].filter(Boolean);

  const hour = new Date().getHours();
  const greeting = hour<12?"Good morning":"hour"<17?"Good afternoon":"Good evening";

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Greeting */}
      <div>
        <div style={{color:C.text,fontSize:18,fontWeight:800}}>{greeting}, {user.name.split(" ")[0]} 👋</div>
        <div style={{color:C.muted,fontSize:12,marginTop:2}}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</div>
      </div>

      {/* Quick Actions */}
      {can(user,"trips") && (
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setTab("trips")}   style={{flex:1,background:C.accent+"22",border:`1.5px solid ${C.accent}`,color:C.accent,borderRadius:12,padding:"12px 6px",fontSize:13,fontWeight:700,cursor:"pointer"}}>🚚 + Cement</button>
          <button onClick={()=>setTab("inbound")} style={{flex:1,background:C.teal+"22",  border:`1.5px solid ${C.teal}`,  color:C.teal,  borderRadius:12,padding:"12px 6px",fontSize:13,fontWeight:700,cursor:"pointer"}}>🏭 + RM Trip</button>
          {can(user,"diesel") && <button onClick={()=>setTab("diesel")} style={{flex:1,background:C.orange+"22",border:`1.5px solid ${C.orange}`,color:C.orange,borderRadius:12,padding:"12px 6px",fontSize:13,fontWeight:700,cursor:"pointer"}}>⛽ Indent</button>}
        </div>
      )}

      {/* Today's summary */}
      <div style={{background:C.card,borderRadius:14,padding:"14px 16px"}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Today — {todayStr}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[
            {l:"Trips Added",  v:todayTrips.length,       c:C.blue},
            {l:"Today Margin", v:fmt(todayMargin),         c:C.green},
            {l:"Pending Bills",v:pending.length,           c:pending.length>0?C.accent:C.muted},
          ].map(x=>(
            <div key={x.l} style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}>
              <div style={{color:x.c,fontWeight:800,fontSize:14}}>{x.v}</div>
              <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",marginTop:2}}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Actionable alerts */}
      {alerts.length>0 && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Needs Attention</div>
          {alerts.map((a,i)=>(
            <button key={i} onClick={()=>setTab(a.tab)}
              style={{background:a.color+"15",border:`1px solid ${a.color}44`,borderRadius:12,
                padding:"11px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",
                cursor:"pointer",width:"100%",textAlign:"left"}}>
              <span style={{color:a.color,fontSize:13,fontWeight:600}}>{a.icon} {a.text}</span>
              <span style={{color:a.color,fontSize:16,opacity:0.7}}>›</span>
            </button>
          ))}
        </div>
      )}

      {/* Per-client summary */}
      {(()=>{
        const clientData = CLIENTS.map(c=>({
          name: c,
          trips: trips.filter(t=>(t.client||DEFAULT_CLIENT)===c&&t.type==="outbound"),
          color: c.includes("Ultratech")?C.orange:c.includes("Guntur")?C.purple:C.blue,
          short: c.replace("Shree Cement ","SC ").replace("Ultratech ","UT "),
        })).filter(cd=>cd.trips.length>0);
        if(clientData.length<2) return null;
        return (
          <div>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>By Plant</div>
            <div style={{display:"grid",gridTemplateColumns:`repeat(${clientData.length},1fr)`,gap:8}}>
              {clientData.map(cd=>(
                <div key={cd.name} style={{background:C.card,borderRadius:12,padding:"10px 12px",borderTop:`3px solid ${cd.color}`}}>
                  <div style={{color:cd.color,fontWeight:700,fontSize:11,marginBottom:4}}>{cd.short}</div>
                  <div style={{color:C.text,fontWeight:800,fontSize:16}}>{cd.trips.length}</div>
                  <div style={{color:C.muted,fontSize:10}}>trips</div>
                  <div style={{color:C.green,fontWeight:700,fontSize:12,marginTop:4}}>
                    {fmt(cd.trips.reduce((s,t)=>s+t.qty*(t.frRate-t.givenRate),0))}
                  </div>
                  <div style={{color:C.muted,fontSize:9}}>margin</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* KPI grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <KPI icon="📈" label="Total Margin"    value={fmt(margin)}      color={C.green} sub="all time" />
        <KPI icon="🚚" label="Total Trips"     value={trips.length}     color={C.blue}  sub={`${trips.filter(t=>t.type==="outbound").length} out · ${trips.filter(t=>t.type==="inbound").length} in`} />
        <KPI icon="🔴" label="Vehicle Loans"   value={fmt(vLoan)}       color={C.red} />
        <KPI icon="🤝" label="TAFAL Pool"      value={fmt(tafalPool)}   color={C.purple}sub={`₹${settings?.tafalPerTrip||300}/trip`} />
      </div>

      {/* Recent Activity */}
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{color:C.blue,fontWeight:700,fontSize:13}}>📋 Recent Activity</div>
          <button onClick={()=>setTab("activity")} style={{background:"none",border:"none",color:C.blue,fontSize:12,cursor:"pointer"}}>All →</button>
        </div>
        {(activity||[]).slice(0,4).map(a => (
          <div key={a.id} style={{background:C.card,borderRadius:12,padding:"10px 12px",marginBottom:7,display:"flex",gap:10,alignItems:"center"}}>
            <Av name={a.user} role={a.role} size={30} />
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700}}>{a.user} <span style={{color:C.muted,fontWeight:400}}>{a.action}</span></div>
              <div style={{color:C.muted,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.detail} · {a.time}</div>
            </div>
          </div>
        ))}
        {!(activity||[]).length && <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:16}}>No activity yet</div>}
      </div>
    </div>
  );
}




// ─── ASK LR SHEET ─────────────────────────────────────────────────────────────
// Shown after scanning — asks user to enter LR number, then checks for duplicates
function AskLRSheet({ extracted, trips, vehicles, onConfirm, onCancel }) {
  const [lrNo, setLrNo] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const truckNo = (extracted.truckNo||"").toUpperCase().trim();
  const existingVehicle = vehicles ? vehicles.find(v => v.truckNo === truckNo) : null;
  // Phone required if: vehicle exists but has no phone, OR vehicle doesn't exist yet (new truck)
  const needsDriverPhone = !existingVehicle || !existingVehicle.driverPhone;

  // Check for duplicate DI across ALL trips
  const scannedDiNo = (extracted.diNo || "").trim();
  const duplicateDI = scannedDiNo ? trips.find(t => {
    // Check diLines array
    if (t.diLines && t.diLines.length > 0) {
      return t.diLines.some(d => d.diNo === scannedDiNo);
    }
    // Check flat diNo field (may be "DI1 + DI2")
    return (t.diNo || "").split("+").map(s=>s.trim()).includes(scannedDiNo);
  }) : null;

  const existing = lrNo.trim() ? trips.find(t => t.lrNo === lrNo.trim()) : null;

  // Check if this DI already exists in the found LR trip
  const diAlreadyInLR = existing && scannedDiNo && (() => {
    if (existing.diLines && existing.diLines.length > 0)
      return existing.diLines.some(d => d.diNo === scannedDiNo);
    return (existing.diNo || "").split("+").map(s=>s.trim()).includes(scannedDiNo);
  })();

  const blocked = !!duplicateDI || !!diAlreadyInLR;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Scanned summary */}
      <div style={{background:C.green+"11",border:`1px solid ${C.green}33`,borderRadius:12,padding:"14px"}}>
        <div style={{color:C.green,fontWeight:800,fontSize:13,marginBottom:8}}>✓ Document Scanned</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12}}>
          {[
            ["Truck",    extracted.truckNo],
            ["DI No",    extracted.diNo],
            ["GR No",    extracted.grNo],
            ["Qty",      `${extracted.qty} MT`],
            ["Bags",     String(extracted.bags)],
            ["Fr.Rate",  `₹${extracted.frRate}/MT`],
          ].map(([l,v]) => v && v !== "0" ? (
            <div key={l}><span style={{color:C.muted}}>{l}: </span><b style={{color:C.text}}>{v}</b></div>
          ) : null)}
        </div>
      </div>

      {/* Vehicle pending balances — shown once LR is entered or always if truck known */}
      {existingVehicle && !duplicateDI && (()=>{
        const loanBal = (existingVehicle.loan||0)-(existingVehicle.loanRecovered||0);
        const shortBal = (existingVehicle.shortageOwed||0)-(existingVehicle.shortageRecovered||0);
        if (loanBal<=0 && shortBal<=0) return null;
        return (
          <div style={{background:`${C.orange}11`,border:`2px solid ${C.orange}66`,borderRadius:12,padding:"12px 14px"}}>
            <div style={{color:C.orange,fontWeight:800,fontSize:12,marginBottom:8}}>
              ⚠ Pending Dues on {truckNo}
            </div>
            <div style={{display:"flex",gap:16,fontSize:12}}>
              {loanBal>0&&(
                <div>
                  <div style={{color:C.red,fontWeight:700}}>₹{loanBal.toLocaleString("en-IN")}</div>
                  <div style={{color:C.muted,fontSize:10}}>LOAN BALANCE</div>
                </div>
              )}
              {shortBal>0&&(
                <div>
                  <div style={{color:C.red,fontWeight:700}}>₹{shortBal.toLocaleString("en-IN")}</div>
                  <div style={{color:C.muted,fontSize:10}}>SHORTAGE BALANCE</div>
                </div>
              )}
            </div>
            <div style={{color:C.muted,fontSize:11,marginTop:6}}>
              You can enter Shortage Recovery / Loan Recovery amounts in the trip form.
            </div>
          </div>
        );
      })()}

      {/* Duplicate DI warning — block immediately */}
      {duplicateDI && (
        <div style={{background:C.red+"11",border:`1px solid ${C.red}44`,borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:C.red,fontWeight:800,fontSize:13,marginBottom:4}}>🚫 Duplicate DI — Already Exists!</div>
          <div style={{color:C.muted,fontSize:12}}>
            DI <b style={{color:C.text}}>{scannedDiNo}</b> is already recorded in:
          </div>
          <div style={{color:C.muted,fontSize:12,marginTop:4}}>
            LR: <b style={{color:C.text}}>{duplicateDI.lrNo||"—"}</b> · {duplicateDI.truckNo} · {duplicateDI.qty}MT
          </div>
          <div style={{color:C.red,fontSize:11,marginTop:6,fontWeight:700}}>
            You cannot add the same DI number twice. Please check the document.
          </div>
        </div>
      )}

      {/* LR entry — only show if not a duplicate */}
      {!duplicateDI && (
        <div style={{background:C.bg,borderRadius:12,padding:"14px",border:`2px solid ${C.blue}44`}}>
          <div style={{color:C.blue,fontWeight:800,fontSize:13,marginBottom:10}}>
            📋 Enter LR Number for this DI
          </div>
          <Field value={lrNo} onChange={setLrNo} placeholder="e.g. MYE/2526/001" />

          {diAlreadyInLR && (
            <div style={{marginTop:8,background:C.red+"11",border:`1px solid ${C.red}33`,
              borderRadius:8,padding:"10px 12px",fontSize:12}}>
              <div style={{color:C.red,fontWeight:800}}>🚫 This DI is already in LR {lrNo}</div>
              <div style={{color:C.muted,marginTop:2}}>Cannot add the same DI to the same trip twice.</div>
            </div>
          )}

          {existing && !diAlreadyInLR && (
            <div style={{marginTop:10,background:C.orange+"11",border:`1px solid ${C.orange}33`,
              borderRadius:8,padding:"10px 12px",fontSize:12}}>
              <div style={{color:C.orange,fontWeight:800,marginBottom:4}}>⚠ LR already has a trip!</div>
              <div style={{color:C.muted}}>{existing.truckNo} · {existing.qty}MT · DI: {existing.diNo||"—"}</div>
              <div style={{color:C.muted,marginTop:2}}>Tap Continue → you can merge this DI into that trip</div>
            </div>
          )}

          {lrNo.trim() && !existing && (
            <div style={{marginTop:8,color:C.green,fontSize:12,fontWeight:700}}>✓ New LR — will create a new trip</div>
          )}
        </div>
      )}

      {/* Driver phone prompt if missing */}
      {!duplicateDI && needsDriverPhone && (
        <div style={{background:`${C.orange}08`,border:`1px solid ${C.orange}44`,borderRadius:12,padding:"14px"}}>
          <div style={{color:C.orange,fontWeight:800,fontSize:13,marginBottom:8}}>📞 Driver Phone Required</div>
          <div style={{color:C.muted,fontSize:12,marginBottom:10}}>
            Truck <b style={{color:C.text}}>{truckNo}</b> has no driver phone on record. Please add it now.
          </div>
          <Field label="Driver Phone *" value={driverPhone} onChange={setDriverPhone} type="tel" placeholder="9XXXXXXXXX" />
        </div>
      )}

      {!duplicateDI && (
        <Btn onClick={()=>onConfirm(lrNo, driverPhone)} full color={C.blue}
          disabled={!lrNo.trim() || !!diAlreadyInLR || (needsDriverPhone && !driverPhone.trim())}>
          {existing && !diAlreadyInLR ? "Continue → Merge options" : "Continue → Fill trip details"}
        </Btn>
      )}
      <Btn onClick={onCancel} full outline color={C.muted}>
        {duplicateDI ? "Close" : "Cancel"}
      </Btn>
    </div>
  );
}

// ─── MERGE DI SHEET ───────────────────────────────────────────────────────────
// Shown when scanning a second DI with same LR — confirms merge with driver rate
function MergeDISheet({ conflict, onMerge, onSeparate, onCancel, isOwner=false }) {
  const { extracted, existingTrip } = conflict;
  const [driverRate, setDriverRate] = useState("");
  const [shreeRate,  setShreeRate]  = useState(String(extracted.frRate || ""));

  const existingLines = existingTrip.diLines && existingTrip.diLines.length > 0
    ? existingTrip.diLines
    : [{ diNo: existingTrip.diNo, qty: existingTrip.qty, bags: existingTrip.bags, givenRate: existingTrip.givenRate }];

  const newQty   = +extracted.qty  || 0;
  const newRate  = +driverRate     || 0;
  const totalQty = existingLines.reduce((s,d)=>s+(d.qty||0),0) + newQty;
  const totalBags= existingLines.reduce((s,d)=>s+(d.bags||0),0) + (+extracted.bags||0);

  // Gross = existing DI gross + new DI gross
  const existingGross = existingLines.reduce((s,d)=>s+(d.qty||0)*(d.givenRate||0),0);
  const newGross      = newQty * newRate;
  const totalGross    = existingGross + newGross;

  // Bill to Shree = per-DI qty × per-DI frRate
  const existingFrRate = existingTrip.frRate || 0;
  const newFrRateVal   = +shreeRate || +extracted.frRate || existingFrRate;
  const existingBill   = existingLines.reduce((s,d)=>s+(d.qty||0)*(d.frRate||existingFrRate),0);
  const newBill        = newQty * newFrRateVal;
  const totalBill      = existingBill + newBill;

  const tafal    = existingTrip.tafal   || 0;
  const advance  = existingTrip.advance || 0;
  const diesel   = existingTrip.dieselEstimate || 0;
  const net      = totalGross - advance - tafal - diesel;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Header */}
      <div style={{background:C.orange+"11",border:`1px solid ${C.orange}44`,borderRadius:12,padding:"14px"}}>
        <div style={{color:C.orange,fontWeight:800,fontSize:15,marginBottom:6}}>📋 Same LR — Add Another DI?</div>
        <div style={{color:C.muted,fontSize:12}}>LR: <b style={{color:C.text}}>{existingTrip.lrNo}</b> · Truck: <b style={{color:C.text}}>{existingTrip.truckNo}</b></div>
      </div>

      {/* Existing DIs */}
      <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Existing DIs</div>
        {existingLines.map((d,i) => (
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}22`,fontSize:13}}>
            <span style={{color:C.muted}}>DI {d.diNo||"—"}</span>
            <span>{d.qty} MT × {fmt(d.givenRate)} = <b style={{color:C.orange}}>{fmt((d.qty||0)*(d.givenRate||0))}</b></span>
          </div>
        ))}
      </div>

      {/* New DI being added */}
      <div style={{background:C.green+"11",border:`1px solid ${C.green}33`,borderRadius:10,padding:"12px 14px"}}>
        <div style={{color:C.green,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>New DI to Add</div>
        <div style={{fontSize:13,color:C.text,marginBottom:10}}>
          DI <b>{extracted.diNo}</b> · {newQty} MT · {extracted.bags} Bags
        </div>
        {/* Shree Rate — locked for non-owners, they cannot change billing rate */}
        {isOwner ? (
          <Field label="Shree Rate ₹/MT (from DI)"
            value={shreeRate} onChange={setShreeRate} type="number"
            placeholder="Rate Shree pays" />
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:8}}>
            <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Shree Rate ₹/MT</label>
            <div style={{background:C.dim,border:`1.5px solid ${C.border}`,borderRadius:10,
              color:C.muted,padding:"13px 12px",fontSize:15,display:"flex",
              justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:C.text}}>{shreeRate||extracted.frRate||"—"}</span>
              <span style={{fontSize:11,color:C.muted}}>🔒 Owner only</span>
            </div>
          </div>
        )}
        <Field label="Driver Rate ₹/MT for this DI"
          value={driverRate} onChange={setDriverRate} type="number"
          placeholder="Enter driver rate" />
      </div>

      {/* Merged totals preview */}
      {driverRate && (
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>After Merge — Combined Totals</div>
          {[
            {l:"Total MT",          v:`${totalQty} MT`,   c:C.text},
            {l:"Total Bags",        v:totalBags,           c:C.text},
            {l:"Bill to Shree",     v:fmt(totalBill),      c:C.blue},
            {l:"Gross to Driver",   v:fmt(totalGross),     c:C.orange},
            {l:"(−) Advance",       v:fmt(advance),        c:C.red},
            {l:"(−) TAFAL",         v:fmt(tafal),          c:C.purple},
            {l:"(−) Diesel Est.",   v:fmt(diesel),         c:C.orange},
            {l:"Est. Net to Driver",v:fmt(net),            c:net>=0?C.green:C.red},
          ].map(x=>(
            <div key={x.l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}22`,fontSize:13}}>
              <span style={{color:C.muted}}>{x.l}</span>
              <span style={{color:x.c,fontWeight:700}}>{x.v}</span>
            </div>
          ))}
        </div>
      )}

      <Btn onClick={()=>onMerge(driverRate, shreeRate)} full color={C.orange}
        disabled={!driverRate}>
        ➕ Merge into existing trip
      </Btn>
      {onSeparate && (
        <Btn onClick={onSeparate} full outline color={C.muted}>
          Save as new separate trip
        </Btn>
      )}
      <Btn onClick={onCancel} full outline color={C.muted}>
        Cancel
      </Btn>
    </div>
  );
}

// ─── DI / GR COPY UPLOADER ───────────────────────────────────────────────────
// Sends photo or PDF to Claude AI → extracts all trip fields automatically

// ─── GOOGLE DRIVE BROWSER ────────────────────────────────────────────────────
// Root folder ID — your M Yantra Drive folder
const GDRIVE_ROOT_ID = "1xa6W-u-Q91u5QDS_AFPhrXzmwdjc2QEf";

function extractDriveId(url) {
  const m1 = url.match(/\/folders\/([a-zA-Z0-9_-]{20,})/);
  const m2 = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  const m3 = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return (m1||m2||m3)?.[1] || null;
}

// Opens a full folder-browser modal. User navigates folders, clicks a file to import.
function openGoogleDrivePicker(onFile) {
  return new Promise((resolve, reject) => {
    // ── Build modal DOM ──────────────────────────────────────────────────────
    const S = {
      overlay: "position:fixed;inset:0;background:#000c;z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px;",
      box:     "background:#ffffff;border:1.5px solid #ccddf0;border-radius:16px;width:min(480px,96vw);max-height:85vh;display:flex;flex-direction:column;overflow:hidden;",
      header:  "display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid #252e3d;flex-shrink:0;",
      breadcrumb: "padding:8px 18px;background:#e8f0fa;font-size:11px;color:#4a7090;display:flex;align-items:center;gap:4px;flex-wrap:wrap;flex-shrink:0;border-bottom:1px solid #1a2030;",
      list:    "overflow-y:auto;flex:1;padding:8px;",
      row:     "display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;border:none;background:none;width:100%;text-align:left;",
      footer:  "padding:12px 16px;border-top:1px solid #252e3d;flex-shrink:0;",
    };

    const overlay = document.createElement("div"); overlay.style.cssText = S.overlay;
    const box     = document.createElement("div"); box.style.cssText = S.box;

    // Header
    const hdr = document.createElement("div"); hdr.style.cssText = S.header;
    hdr.innerHTML = `
      <div style="color:#0a1f3a;font-weight:800;font-size:15px;">🔵 Google Drive</div>
      <button id="gd-close" style="background:#da363322;border:none;color:#da3633;border-radius:50%;width:28px;height:28px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
    `;

    // Breadcrumb
    const bc = document.createElement("div"); bc.style.cssText = S.breadcrumb;

    // List area
    const list = document.createElement("div"); list.style.cssText = S.list;

    // Footer — status + error
    const footer = document.createElement("div"); footer.style.cssText = S.footer;
    footer.innerHTML = `<div id="gd-status" style="color:#64748b;font-size:12px;text-align:center;"></div>`;

    box.appendChild(hdr); box.appendChild(bc); box.appendChild(list); box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const statusEl = footer.querySelector("#gd-status");
    const closeBtn = hdr.querySelector("#gd-close");
    const close = () => { document.body.removeChild(overlay); };
    closeBtn.onclick = () => { close(); reject(new Error("cancelled")); };

    // ── State ────────────────────────────────────────────────────────────────
    const stack = [{ id: GDRIVE_ROOT_ID, name: "M Yantra Drive" }];

    // ── Render breadcrumb ────────────────────────────────────────────────────
    const renderBc = () => {
      bc.innerHTML = "";
      stack.forEach((f, i) => {
        const span = document.createElement("span");
        span.textContent = f.name;
        span.style.cssText = i === stack.length-1
          ? "color:#0a1f3a;font-weight:700;"
          : "color:#1a73e8;cursor:pointer;text-decoration:underline;";
        if(i < stack.length-1) {
          span.onclick = () => { stack.splice(i+1); loadFolder(f.id); };
        }
        bc.appendChild(span);
        if(i < stack.length-1) {
          const sep = document.createElement("span");
          sep.textContent = " › ";
          bc.appendChild(sep);
        }
      });
    };

    // ── Load folder via Netlify function ─────────────────────────────────────
    const loadFolder = async (folderId) => {
      list.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b;font-size:13px;">⏳ Loading…</div>`;
      statusEl.textContent = "";
      renderBc();
      try {
        const res = await fetch("/.netlify/functions/proxy-drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list", folderId }),
        });
        const data = await res.json();
        if(data.error) throw new Error(data.error);
        renderItems(data.items || []);
      } catch(e) {
        list.innerHTML = `<div style="color:#da3633;padding:20px;font-size:12px;text-align:center;">❌ ${e.message}</div>`;
      }
    };

    // ── Render file/folder list ───────────────────────────────────────────────
    const renderItems = (items) => {
      list.innerHTML = "";
      if(items.length === 0) {
        list.innerHTML = `<div style="color:#64748b;padding:30px;text-align:center;font-size:13px;">📂 Empty folder</div>`;
        return;
      }
      // Folders first, then files
      const sorted = [...items].sort((a,b) => {
        if(a.isFolder && !b.isFolder) return -1;
        if(!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });
      sorted.forEach(item => {
        const row = document.createElement("button");
        row.style.cssText = S.row;
        const icon = item.isFolder ? "📁" : (item.mimeType?.includes("pdf") ? "📄" : "🖼️");
        row.innerHTML = `
          <span style="font-size:20px;flex-shrink:0;">${icon}</span>
          <span style="color:#0a1f3a;font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.name}</span>
          ${item.isFolder ? '<span style="color:#64748b;font-size:12px;">›</span>' : '<span style="color:#1a73e8;font-size:11px;font-weight:700;">SELECT</span>'}
        `;
        row.onmouseover = () => row.style.background = "#e8f0fa";
        row.onmouseout  = () => row.style.background = "none";

        if(item.isFolder) {
          row.onclick = () => {
            stack.push({ id: item.id, name: item.name });
            loadFolder(item.id);
          };
        } else {
          row.onclick = async () => {
            statusEl.textContent = "⏳ Downloading " + item.name + "…";
            row.disabled = true;
            try {
              const res = await fetch("/.netlify/functions/proxy-drive", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "download", fileId: item.id, fileName: item.name, mimeType: item.mimeType }),
              });
              const data = await res.json();
              if(data.error) throw new Error(data.error);
              const byteStr = atob(data.base64);
              const ab = new ArrayBuffer(byteStr.length);
              const ia = new Uint8Array(ab);
              for(let i=0;i<byteStr.length;i++) ia[i]=byteStr.charCodeAt(i);
              const blob = new Blob([ab], {type: item.mimeType||"application/octet-stream"});
              const file = new File([blob], item.name, {type: item.mimeType||"application/octet-stream"});
              close();
              onFile(file);
              resolve();
            } catch(e) {
              statusEl.textContent = "❌ " + e.message;
              row.disabled = false;
            }
          };
        }
        list.appendChild(row);
      });
      statusEl.textContent = `${items.length} item${items.length!==1?"s":""}`;
    };

    // ── Start at root ─────────────────────────────────────────────────────────
    loadFolder(GDRIVE_ROOT_ID);
  });
}


// ─── FILE SOURCE PICKER — reusable Local + Google Drive button pair ───────────
// Usage: <FileSourcePicker onFile={fn} accept="image/*,application/pdf" label="Upload" color={C.blue} />
function FileSourcePicker({ onFile, accept="image/*,application/pdf", label="Upload", color, icon="📎", compact=false }) {
  const inputRef = useRef();
  const [gdLoading, setGdLoading] = useState(false);

  const handleDrive = async () => {
    setGdLoading(true);
    try { await openGoogleDrivePicker(onFile); }
    catch(e) { alert("Google Drive: " + (e.message||"Could not open. Check popup blocker.")); }
    finally { setGdLoading(false); }
  };

  const col = color || C.blue;

  if(compact) {
    // Small inline button pair (for scan buttons in headers etc)
    return (
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>inputRef.current?.click()}
          style={{background:col+"22",border:`1.5px solid ${col}66`,borderRadius:8,
            color:col,fontWeight:700,fontSize:12,padding:"7px 12px",cursor:"pointer",
            display:"flex",alignItems:"center",gap:4}}>
          📁 {label}
        </button>
        <button onClick={handleDrive} disabled={gdLoading}
          style={{background:"#1a73e822",border:"1.5px solid #1a73e866",borderRadius:8,
            color:"#4285f4",fontWeight:700,fontSize:12,padding:"7px 10px",cursor:"pointer",
            opacity:gdLoading?0.6:1}}>
          {gdLoading?"⏳":"🔵"}
        </button>
        <input ref={inputRef} type="file" accept={accept} style={{display:"none"}}
          onChange={e=>{if(e.target.files?.[0])onFile(e.target.files[0]);e.target.value="";}} />
      </div>
    );
  }

  // Full dashed-box style
  return (
    <div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>inputRef.current?.click()}
          style={{flex:1,background:col+"11",border:`1.5px dashed ${col}`,
            borderRadius:10,padding:"18px 8px",color:col,fontWeight:700,
            fontSize:13,cursor:"pointer",textAlign:"center",
            display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <span style={{fontSize:26}}>{icon}</span>
          <span>📁 Local / Camera</span>
          <span style={{color:C.muted,fontSize:11,fontWeight:400}}>{label}</span>
        </button>
        <button onClick={handleDrive} disabled={gdLoading}
          style={{flex:1,background:"#1a73e811",border:"1.5px dashed #1a73e8",
            borderRadius:10,padding:"18px 8px",color:"#4285f4",fontWeight:700,
            fontSize:13,cursor:"pointer",textAlign:"center",
            display:"flex",flexDirection:"column",alignItems:"center",gap:6,
            opacity:gdLoading?0.6:1}}>
          <span style={{fontSize:26}}>🔵</span>
          <span>{gdLoading?"Opening…":"Google Drive"}</span>
          <span style={{color:C.muted,fontSize:11,fontWeight:400}}>Pick from Drive</span>
        </button>
      </div>
      <input ref={inputRef} type="file" accept={accept} style={{display:"none"}}
        onChange={e=>{if(e.target.files?.[0])onFile(e.target.files[0]);e.target.value="";}} />
    </div>
  );
}

function DIUploader({ onExtracted, trips, settings, isIn, onFile=null }) {
  const [state,   setState]   = useState("idle"); // idle | reading | scanning | done | error
  const [preview, setPreview] = useState(null);   // base64 for image preview
  const [error,   setError]   = useState("");
  const inputRef = useRef(null);

  const PROMPT = `You are reading a Delivery Instruction (DI) or GR copy for a cement transport company in India.
Extract the following fields from this document image and return ONLY a JSON object with these exact keys:
{
  "lrNo": "LR number / Lorry Receipt number",
  "diNo": "DI number / Delivery Instruction number",
  "grNo": "GR number / Goods Receipt number",
  "truckNo": "Vehicle/Truck registration number",
  "consignee": "Consignee name / destination party",
  "consignor": "Consignor name — the cement company/plant name e.g. Shree Cement Limited KARNATAKA CEMENT PROJECT GUNTUR",
  "from": "Source/loading location",
  "to": "Destination/unloading location",
  "grade": "Material grade - use exactly 'Cement Packed' or 'Cement Bulk' for cement, else actual material name",
  "district": "Destination district name from consignee address — use the district/taluka/tehsil name from the address",
  "state": "Destination state name — derive from consignee address or pincode (e.g. 501218=Telangana, 412219=Maharashtra, 585222=Karnataka)",
  "qty": "Quantity in MT as a number only (no units)",
  "bags": "Number of bags as a number only (0 if not applicable)",
  "frRate": "Freight rate per MT in rupees as a number only (the Shree/company rate, not driver rate)",
  "date": "Date in YYYY-MM-DD format"
}
Rules:
- Return ONLY the JSON object, no explanation, no markdown, no backticks
- If a field is not found in the document, use empty string "" for text fields and 0 for number fields
- For truck numbers, format as uppercase with no spaces e.g. KA34C4617
- For qty and bags, return only the number e.g. 35 not "35 MT"
- For frRate: look in the Goods Receipt Particulars table for the "Rate PMT" column — this is the rate per MT that Shree pays M Yantra. It appears as a number like 1030.00 or 1050.00 in the row alongside the quantity and amount. Extract ONLY the rate from THIS specific document — do not reuse rates from other documents. Each GR has its own rate.`;

  const fileToBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const handleFile = async (file) => {
    if (!file) return;
    setError(""); setState("reading");

    try {
      const base64 = await fileToBase64(file);
      const isImage = file.type.startsWith("image/");
      const isPDF   = file.type === "application/pdf";

      if (!isImage && !isPDF) {
        setError("Please upload a photo (JPG/PNG) or PDF file.");
        setState("error"); return;
      }

      // Show preview for images
      if (isImage) setPreview(`data:${file.type};base64,${base64}`);
      else setPreview(null);

      setState("scanning");

      // Call via Netlify serverless function (avoids browser CORS restriction)
      const resp = await fetch("/.netlify/functions/scan-di", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mediaType: file.type, prompt: PROMPT }),
      });

      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || "Server error");
      const text = data.text || "";

      // Parse JSON — strip any accidental markdown
      const clean = text.replace(/```json|```/g, "").trim();
      const extracted = JSON.parse(clean);

      // Check if same LR already exists
      const lrNo = (extracted.lrNo || "").trim();
      const existingTrip = lrNo ? trips.find(t => t.lrNo === lrNo) : null;

      setState("done");
      // If caller wants the raw file (e.g. to auto-populate GR ref), pass it back
      if(onFile) onFile(file);
      onExtracted({
        ...extracted,
        qty:    String(extracted.qty    || ""),
        bags:   String(extracted.bags   || "0"),
        frRate: String(extracted.frRate || ""),
        tafal:  String(settings?.tafalPerTrip || 300),
        advance: "0", shortage: "0", shortageRecovery: "0", loanRecovery: "0", dieselEstimate: "0",
        type: isIn ? "inbound" : "outbound",
      }, existingTrip);

    } catch(e) {
      console.error("DI scan error:", e);
      setError("Could not read document. Try a clearer photo. (" + e.message + ")");
      setState("error");
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div style={{marginBottom:16}}>
      {/* Upload zone */}
      {(state === "idle" || state === "error") && (
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          style={{
            border: `2px dashed ${state==="error" ? C.red : C.blue}`,
            borderRadius: 14, padding: "20px 16px", textAlign: "center",
            background: C.bg,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}
        >
          <div style={{fontSize: 32}}>📄</div>
          <div style={{color: C.blue, fontWeight: 800, fontSize: 14}}>
            Upload DI / GR Copy
          </div>
          <div style={{color: C.muted, fontSize: 12}}>
            Take a photo or upload PDF — AI will fill all fields
          </div>
          <FileSourcePicker onFile={handleFile} accept="image/*,application/pdf"
            label="Take photo or upload PDF" color={C.blue} icon="📄" />
          {error && <div style={{color:C.red, fontSize:12, marginTop:4}}>{error}</div>}
        </div>
      )}

      {/* Scanning state */}
      {(state === "reading" || state === "scanning") && (
        <div style={{
          border: `2px solid ${C.blue}44`, borderRadius: 14, padding: "20px 16px",
          textAlign: "center", background: C.bg,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        }}>
          {preview && (
            <img src={preview} alt="DI preview"
              style={{maxHeight: 120, maxWidth: "100%", borderRadius: 8, objectFit: "contain"}} />
          )}
          <div style={{color: C.blue, fontWeight: 800, fontSize: 14}}>
            {state === "reading" ? "📖 Reading file…" : "🤖 AI scanning document…"}
          </div>
          <div style={{color: C.muted, fontSize: 12}}>
            {state === "scanning" ? "Extracting LR, DI, GR, quantity, rate…" : "Preparing…"}
          </div>
          <div style={{display:"flex", gap:4}}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width:8, height:8, borderRadius:"50%", background:C.blue,
                opacity: 0.3 + (i * 0.3),
                animation:`bounce 1s ${i*0.2}s infinite`,
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Done — show scan again button */}
      {state === "done" && (
        <div style={{
          border: `2px solid ${C.green}44`, borderRadius: 14, padding: "10px 16px",
          background: C.green+"11", display:"flex", justifyContent:"space-between", alignItems:"center",
        }}>
          <div style={{color: C.green, fontWeight: 700, fontSize: 13}}>
            ✓ Document scanned — fields filled below
          </div>
          <button onClick={() => { setState("idle"); setPreview(null); }}
            style={{background:"none", border:`1px solid ${C.green}44`, color:C.green,
              borderRadius:8, padding:"4px 10px", fontSize:12, cursor:"pointer"}}>
            Scan another
          </button>
        </div>
      )}



      <style>{`
        @keyframes bounce {
          0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)}
        }
      `}</style>
    </div>
  );
}

// ─── PARTY TRIP STORAGE HELPERS ──────────────────────────────────────────────
// IMPORTANT: Must match bucket name exactly in Supabase Storage
// ─── CLIENT / PLANT LIST ─────────────────────────────────────────────────────
const CLIENTS = ["Shree Cement Kodla","Shree Cement Guntur","Ultratech Malkhed"];
const DEFAULT_CLIENT = "Shree Cement Kodla";
// Shree Cement plants (used to decide if Shree Payments tab is relevant)
const SHREE_CLIENTS = ["Shree Cement Kodla","Shree Cement Guntur"];

const LOGO_B64 = "data:image/jpeg;base64,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";
const PARTY_BUCKET = "party-trip-files";

async function uploadPartyFile(tripId, role, file) {
  const ext  = (file.name||"file").split(".").pop() || "pdf";
  const path = `${tripId}/${role}.${ext}`;
  const { error } = await supabase.storage.from(PARTY_BUCKET).upload(path, file, {upsert:true});
  if (error) {
    if(error.message?.includes("Bucket not found")||error.statusCode==="404")
      throw new Error(`Storage bucket "${PARTY_BUCKET}" not found. Create it in Supabase → Storage.`);
    throw new Error("Upload failed: " + error.message);
  }
  return { path };  // store only path, generate signed URLs on demand
}

async function getSignedUrl(path, expiresIn=3600) {
  const { data, error } = await supabase.storage.from(PARTY_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw new Error("Could not generate download link: " + error.message);
  return data.signedUrl;
}

async function deletePartyFiles(tripId) {
  const { data:files } = await supabase.storage.from(PARTY_BUCKET).list(tripId);
  if (!files||!files.length) return;
  await supabase.storage.from(PARTY_BUCKET).remove(files.map(f=>`${tripId}/${f.name}`));
}

// Merge PDFs using pdf-lib — returns Uint8Array blob
async function mergePDFs(pdfBuffers) {
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();
  for (const buf of pdfBuffers) {
    try {
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    } catch(e) {
      console.warn("Could not merge one PDF:", e.message);
    }
  }
  return await merged.save();
}

// Fetch a file from Supabase Storage as ArrayBuffer
async function fetchStorageFile(path) {
  const { data, error } = await supabase.storage.from(PARTY_BUCKET).download(path);
  if (error) throw new Error("Could not fetch file: " + error.message);
  return await data.arrayBuffer();
}
// buildConfirmationHTML removed — confirmation doc now built via pdf-lib after receipt reply

// ─── ORDER TYPE SELECTOR ──────────────────────────────────────────────────────
function OrderTypeSelector({ onSelect }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14,padding:"4px 0"}}>
      <div style={{color:C.text,fontWeight:800,fontSize:15,textAlign:"center"}}>What type of order is this?</div>
      {[
        {id:"godown", icon:"🏭", label:"Godown Order", sub:"Unloading managed by Shree Cement · standard flow", color:C.teal},
        {id:"party",  icon:"🤝", label:"Party Order",  sub:"Private party · GR + Invoice upload + email required", color:C.accent},
      ].map(o=>(
        <button key={o.id} onClick={()=>onSelect(o.id)} style={{
          background:C.card, border:`2px solid ${o.color}`,
          borderRadius:16, padding:"18px 16px", cursor:"pointer",
          textAlign:"left", display:"flex", gap:14, alignItems:"center",
          WebkitTapHighlightColor:"transparent"}}>
          <span style={{fontSize:30}}>{o.icon}</span>
          <div>
            <div style={{color:o.color,fontWeight:800,fontSize:15}}>{o.label}</div>
            <div style={{color:C.muted,fontSize:12,marginTop:3}}>{o.sub}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── PARTY DOC UPLOAD ─────────────────────────────────────────────────────────
function PartyDocUpload({ tripId, grFileRef, invoiceFileRef, onDone, onBack }) {
  // grFileRef.current and invoiceFileRef.current are now arrays of File objects
  const [grFiles,  setGrFiles]  = useState(Array.isArray(grFileRef.current) ? grFileRef.current : []);
  const [invFiles, setInvFiles] = useState(Array.isArray(invoiceFileRef.current) ? invoiceFileRef.current : []);

  const addGR  = f => { const next=[...grFiles,f];  grFileRef.current=next;  setGrFiles(next); };
  const addInv = f => { const next=[...invFiles,f]; invoiceFileRef.current=next; setInvFiles(next); };
  const removeGR  = i => { const next=grFiles.filter((_,idx)=>idx!==i);  grFileRef.current=next;  setGrFiles(next); };
  const removeInv = i => { const next=invFiles.filter((_,idx)=>idx!==i); invoiceFileRef.current=next; setInvFiles(next); };

  const canProceed = grFiles.length > 0 && invFiles.length > 0;

  const FileList = ({files, onAdd, onRemove, label, color}) => (
    <div style={{background:C.bg,borderRadius:12,padding:14,border:`2px dashed ${files.length>0?color:C.border}`}}>
      <div style={{color:color,fontWeight:700,fontSize:12,marginBottom:8}}>
        {label} {files.length>0 && <span style={{color:C.muted,fontWeight:400}}>({files.length} file{files.length>1?"s":""})</span>}
      </div>
      {files.map((f,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          background:C.card,borderRadius:8,padding:"8px 10px",marginBottom:6}}>
          <span style={{color:C.text,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",
            whiteSpace:"nowrap",flex:1}}>{f.name}</span>
          <button onClick={()=>onRemove(i)}
            style={{background:"none",border:"none",color:C.red,fontSize:16,cursor:"pointer",
              marginLeft:8,flexShrink:0}}>×</button>
        </div>
      ))}
      <div style={{marginTop:files.length>0?8:0}}>
        <FileSourcePicker onFile={onAdd} accept="image/*,application/pdf"
          label={files.length>0?`+ Add another ${label}`:`Upload ${label}`}
          color={color} icon="📎" />
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:C.accent+"11",border:`1px solid ${C.accent}33`,borderRadius:10,
        padding:"10px 14px",color:C.accent,fontSize:12,fontWeight:700}}>
        🤝 Party Order — Upload documents before filling trip details
        <div style={{color:C.muted,fontWeight:400,marginTop:3}}>For multi-DI trips, upload each GR copy and invoice separately — they will be merged into one file.</div>
      </div>
      <FileList files={grFiles}  onAdd={addGR}  onRemove={removeGR}
        label="GR Copy *" color={C.green} />
      <FileList files={invFiles} onAdd={addInv} onRemove={removeInv}
        label="Invoice *" color={C.blue} />
      {canProceed && (
        <div style={{background:C.green+"11",border:`1px solid ${C.green}33`,borderRadius:8,
          padding:"8px 12px",color:C.green,fontSize:12,fontWeight:700}}>
          ✓ {grFiles.length} GR + {invFiles.length} Invoice file{invFiles.length>1?"s":""} ready
          {(grFiles.length>1||invFiles.length>1)&&" — will be auto-merged on save"}
        </div>
      )}
      <Btn onClick={onDone} full color={C.accent} disabled={!canProceed}>
        Continue → Fill Trip Details
      </Btn>
      <Btn onClick={onBack} full outline color={C.muted}>← Back</Btn>
    </div>
  );
}

// ─── PARTY EMAIL MODAL ────────────────────────────────────────────────────────
function PartyEmailModal({ trip, fromEmail, toEmail, onToEmailChange, onMarkSent, onClose }) {
  const [localTo, setLocalTo] = useState(toEmail||"");
  const [opened,  setOpened]  = useState(false);
  const fmtD = d => { if(!d) return "—"; const [y,m,dy]=d.split("-"); return `${dy}-${m}-${y}`; };

  const subject = `Delivery Confirmation Request — M Yantra Enterprises`;

  // Plain text — label: value format works reliably in all mail clients
  const body =
`Dear Sir,

Please confirm receipt of cement for the following consignment(s) by return mail.

Transport Name    : M YANTRA ENTERPRISES
Shipment Date     : ${fmtD(trip.date)}
Bill of Lading    : ${trip.lrNo||"—"}
Delivery Number   : ${trip.diNo||"—"}
Freight Qty.      : ${trip.qty||0} MT
Customer/Vendor   : ${trip.consignee||"—"}
Vehicle Number    : ${trip.truckNo||"—"}
To Location       : ${trip.to||"—"}
District          : ${trip.district||"—"}
State             : ${trip.state||"—"}

Kindly reply to this email confirming receipt at the earliest.

Regards,
M Yantra Enterprises
9606477257`;

  const openMail = () => {
    const mailto = `mailto:${localTo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailto, "_blank");
    setOpened(true);
    onToEmailChange(localTo);
  };

  // Styled table rows for in-app preview
  const previewRows = [
    ["Transport Name",  "M YANTRA ENTERPRISES"],
    ["Shipment Date",   fmtD(trip.date)],
    ["Bill of Lading",  trip.lrNo||"—"],
    ["Delivery Number", trip.diNo||"—"],
    ["Freight Qty.",    `${trip.qty||0} MT`],
    ["Customer/Vendor", trip.consignee||"—"],
    ["Vehicle Number",  trip.truckNo||"—"],
    ["To Location",     trip.to||"—"],
    ["District",        trip.district||"—"],
    ["State",           trip.state||"—"],
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:C.blue+"11",border:`1px solid ${C.blue}33`,borderRadius:10,
        padding:"10px 14px",color:C.blue,fontSize:12,fontWeight:700}}>
        📧 Send Confirmation Email
      </div>

      <div style={{background:C.bg,borderRadius:10,padding:"10px 12px",fontSize:12}}>
        <div style={{color:C.muted,marginBottom:2}}>From:</div>
        <div style={{color:C.text,fontWeight:700}}>{fromEmail||"(set in Settings)"}</div>
      </div>

      <Field label="To Email *" value={localTo} onChange={setLocalTo}
        placeholder="party@example.com" />

      {/* In-app preview — matches exactly what will appear in the email */}
      <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:8}}>EMAIL PREVIEW</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:10,lineHeight:1.6}}>
          Dear Sir,<br/>Please confirm receipt of cement for the following consignment(s) by return mail.
        </div>
        {previewRows.map(([label,value])=>(
          <div key={label} style={{display:"flex",borderBottom:`1px solid ${C.border}22`,padding:"5px 0",gap:8}}>
            <span style={{color:C.muted,fontSize:12,minWidth:130,flexShrink:0}}>{label}</span>
            <span style={{color:C.text,fontSize:12,fontWeight:600}}>: {value}</span>
          </div>
        ))}
        <div style={{color:C.muted,fontSize:12,marginTop:10,lineHeight:1.6}}>
          Kindly reply to this email confirming receipt at the earliest.<br/>
          <br/>Regards,<br/><b style={{color:C.text}}>M Yantra Enterprises</b><br/>9606477257
        </div>
      </div>

      <div style={{background:`${C.orange}08`,border:`1px solid ${C.orange}44`,borderRadius:8,
        padding:"9px 12px",color:C.orange,fontSize:11}}>
        📱 On mobile: Gmail will open with the email pre-filled. Attach GR Copy and Invoice from your Files app before sending.<br/>
        🖥 On desktop: Copy the email body above and paste into Gmail manually.
      </div>

      {!opened ? (
        <Btn onClick={openMail} full color={C.blue} disabled={!localTo.trim()}>
          📧 Open Gmail / Mail App
        </Btn>
      ) : (
        <>
          <div style={{background:C.green+"11",border:`1px solid ${C.green}33`,borderRadius:8,
            padding:"9px 12px",color:C.green,fontSize:12,fontWeight:700}}>
            ✓ Email app opened — send the email with attachments, then confirm below
          </div>
          <Btn onClick={()=>onMarkSent(localTo)} full color={C.green}>
            ✓ Email Sent — Save Trip Now
          </Btn>
          <Btn onClick={openMail} full outline color={C.blue}>
            Re-open Mail App
          </Btn>
        </>
      )}
      <Btn onClick={onClose} full outline color={C.muted}>Cancel</Btn>
    </div>
  );
}

// ─── PARTY BATCH EMAIL SHEET ──────────────────────────────────────────────────
function PartyBatchEmailSheet({ trips, setTrips, onClose, log }) {
  const [selected, setSelected] = useState(new Set());
  const [toEmail,  setToEmail]  = useState("");
  const [step,     setStep]     = useState("select"); // "select" | "compose" | "sealed"
  const [opened,   setOpened]   = useState(false);

  const pending = trips.filter(t => t.orderType==="party" && !t.emailSentAt);
  const fmtD = d => { if(!d) return "—"; const [y,m,dy]=d.split("-"); return dy+"-"+m+"-"+y; };

  const toggle = id => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const selTrips = pending.filter(t => selected.has(t.id));

  // Build email body — one row per selected trip
  const subject = "Delivery Confirmation Request — M Yantra Enterprises";
  const body = selTrips.length===0 ? "" :
    "Dear Sir,\n\nPlease confirm receipt of cement for the following consignment(s) by return mail.\n\n" +
    "Transport Name    : M YANTRA ENTERPRISES\n" +
    selTrips.map(t =>
      "--------------------------------------------------\n" +
      "Shipment Date     : "+fmtD(t.date)+"\n" +
      "Bill of Lading    : "+(t.lrNo||"—")+"\n" +
      "Delivery Number   : "+(t.diNo||"—")+"\n" +
      "Freight Qty.      : "+(t.qty||0)+" MT\n" +
      "Customer/Vendor   : "+(t.consignee||"—")+"\n" +
      "Vehicle Number    : "+(t.truckNo||"—")+"\n" +
      "To Location       : "+(t.to||"—")+"\n" +
      "District          : "+(t.district||"—")+"\n" +
      "State             : "+(t.state||"—")
    ).join("\n") +
    "\n--------------------------------------------------\n\n" +
    "Kindly reply to this email confirming receipt at the earliest.\n\nRegards,\nM Yantra Enterprises\n9606477257";

  const openMail = () => {
    const mailto = "mailto:"+toEmail+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);
    window.open(mailto,"_blank");
    setOpened(true);
  };

  const markSent = () => {
    const batchId = "BATCH-"+Date.now();
    const ts = nowTs();
    setTrips(p => p.map(t => {
      if(!selected.has(t.id)) return t;
      const updated = {...t, emailSentAt:ts, partyEmail:toEmail, batchId};
      DB.saveTrip(updated).catch(e=>console.error("saveTrip batch:",e));
      return updated;
    }));
    log("PARTY EMAIL SENT", selTrips.length+" trips · batch:"+batchId+" → "+toEmail);
    onClose();
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {step==="select" && (<>
        <div style={{color:C.accent,fontWeight:700,fontSize:12}}>
          Select party trips to include in this email batch
        </div>

        {pending.length===0 && (
          <div style={{textAlign:"center",padding:"30px 0",color:C.muted}}>
            <div style={{fontSize:32,marginBottom:8}}>✅</div>
            <div style={{fontWeight:700}}>All party trips have been emailed</div>
          </div>
        )}

        {/* Select All / Deselect All */}
        {pending.length>0 && (
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setSelected(new Set(pending.map(t=>t.id)))}
              style={{background:C.accent+"22",border:"1px solid "+C.accent+"44",color:C.accent,
                borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              Select All ({pending.length})
            </button>
            <button onClick={()=>setSelected(new Set())}
              style={{background:C.dim,border:"1px solid "+C.border,color:C.muted,
                borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              Clear
            </button>
          </div>
        )}

        {pending.map(t => (
          <div key={t.id} onClick={()=>toggle(t.id)}
            style={{background:selected.has(t.id)?C.accent+"11":C.bg,
              border:"2px solid "+(selected.has(t.id)?C.accent:C.border),
              borderRadius:12,padding:"12px 14px",cursor:"pointer",
              display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{width:20,height:20,borderRadius:4,flexShrink:0,marginTop:2,
              background:selected.has(t.id)?C.accent:C.dim,
              border:"2px solid "+(selected.has(t.id)?C.accent:C.border),
              display:"flex",alignItems:"center",justifyContent:"center",color:"#000",fontSize:13,fontWeight:900}}>
              {selected.has(t.id)?"✓":""}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontWeight:800,fontSize:13}}>{t.truckNo}</span>
                <span style={{color:C.orange,fontWeight:700}}>{t.qty} MT</span>
              </div>
              <div style={{color:C.blue,fontSize:12}}>LR: {t.lrNo||"—"} · DI: {t.diNo||"—"}</div>
              <div style={{color:C.muted,fontSize:11}}>{t.consignee||"—"} · {t.to||"—"}</div>
              <div style={{color:C.muted,fontSize:11}}>{t.district||"—"}, {t.state||"—"} · {t.date}</div>
            </div>
          </div>
        ))}

        {/* Two action options */}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>
            Choose confirmation method
          </div>
          <Btn onClick={()=>setStep("compose")} full color={C.accent}
            disabled={selected.size===0}>
            📧 Compose Email → ({selected.size} trip{selected.size!==1?"s":""} selected)
          </Btn>
          <Btn onClick={()=>setStep("sealed")} full color={C.orange}
            disabled={selected.size===0}>
            🏷️ Upload Sealed Invoice → ({selected.size} trip{selected.size!==1?"s":""} selected)
          </Btn>
          <div style={{color:C.muted,fontSize:11,textAlign:"center"}}>
            Use Email if party needs to confirm · Use Sealed Invoice if you already have the stamped copy
          </div>
        </div>
        <Btn onClick={onClose} full outline color={C.muted}>Cancel</Btn>
      </>)}

      {step==="sealed" && (<>
        <button onClick={()=>setStep("select")}
          style={{background:"none",border:"none",color:C.blue,fontSize:12,
            cursor:"pointer",textAlign:"left",padding:"0 0 4px"}}>
          ← Back to selection
        </button>
        <div style={{background:C.orange+"11",border:`1px solid ${C.orange}33`,borderRadius:10,padding:"12px 14px",color:C.orange,fontSize:12,fontWeight:700}}>
          🏷️ Upload Sealed Invoice for {selected.size} trip{selected.size!==1?"s":""}
        </div>
        <div style={{color:C.muted,fontSize:12}}>
          For each selected trip, tap the <b style={{color:C.orange}}>🏷️ Upload Sealed Invoice</b> button
          on its trip card. The sealed invoice will be merged with GR + Invoice into one PDF.
        </div>
        {selTrips.map(t=>(
          <div key={t.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:13}}>{t.truckNo} <span style={{color:C.blue,fontSize:12}}>LR:{t.lrNo||"—"}</span></div>
              <div style={{color:C.muted,fontSize:11}}>{t.consignee||"—"} · {t.qty}MT</div>
            </div>
            <span style={{color:t.mergedPdfPath?C.green:C.orange,fontSize:11,fontWeight:700}}>
              {t.mergedPdfPath?"✅ Done":"⏳ Pending"}
            </span>
          </div>
        ))}
        <Btn onClick={onClose} full color={C.green}>Done</Btn>
      </>)}

      {step==="compose" && (<>
        <button onClick={()=>{setStep("select");setOpened(false);}}
          style={{background:"none",border:"none",color:C.blue,fontSize:12,
            cursor:"pointer",textAlign:"left",padding:"0 0 4px"}}>
          ← Back to selection
        </button>

        <div style={{background:C.bg,borderRadius:10,padding:"10px 14px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:4}}>SELECTED TRIPS</div>
          {selTrips.map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",
              padding:"4px 0",borderBottom:"1px solid "+C.border+"22",fontSize:12}}>
              <span style={{color:C.text}}>{t.lrNo||"—"} · {t.truckNo}</span>
              <span style={{color:C.muted}}>{t.qty}MT · {t.consignee||"—"}</span>
            </div>
          ))}
        </div>

        <Field label="To Email *" value={toEmail} onChange={setToEmail}
          placeholder="party@example.com" />

        {/* Preview */}
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",
          maxHeight:240,overflowY:"auto"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:8}}>
            EMAIL PREVIEW
          </div>
          <div style={{color:C.muted,fontSize:12,marginBottom:8,lineHeight:1.6}}>
            Dear Sir,<br/>Please confirm receipt of cement for the following consignment(s).
          </div>
          {selTrips.map(t=>(
            <div key={t.id} style={{background:C.card,borderRadius:8,padding:"8px 10px",
              marginBottom:8,fontSize:11}}>
              {[
                ["Shipment Date",  fmtD(t.date)],
                ["Bill of Lading", t.lrNo||"—"],
                ["Delivery No.",   t.diNo||"—"],
                ["Freight Qty.",   t.qty+" MT"],
                ["Customer",       t.consignee||"—"],
                ["Vehicle",        t.truckNo],
                ["To Location",    t.to||"—"],
                ["District",       t.district||"—"],
                ["State",          t.state||"—"],
              ].map(([l,v])=>(
                <div key={l} style={{display:"flex",gap:6,padding:"2px 0"}}>
                  <span style={{color:C.muted,minWidth:100,flexShrink:0}}>{l}</span>
                  <span style={{color:C.text,fontWeight:600}}>: {v}</span>
                </div>
              ))}
            </div>
          ))}
          <div style={{color:C.muted,fontSize:12,marginTop:6,lineHeight:1.6}}>
            Kindly reply confirming receipt.<br/>
            <b style={{color:C.text}}>M Yantra Enterprises</b> · 9606477257
          </div>
        </div>

        {/* Download GR + Invoice per trip for manual attachment */}
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:8}}>
            ATTACHMENTS — Download & attach to email
          </div>
          {selTrips.map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",padding:"6px 0",borderBottom:"1px solid "+C.border+"22"}}>
              <span style={{color:C.text,fontSize:12,fontWeight:600}}>{t.lrNo||"—"} · {t.truckNo}</span>
              <div style={{display:"flex",gap:6}}>
                {t.grFilePath && (
                  <button onClick={async()=>{
                    try{const url=await getSignedUrl(t.grFilePath,3600);const a=document.createElement("a");a.href=url;a.download="GR_"+(t.lrNo||t.id);a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);}
                    catch(e){alert("Failed: "+e.message);}
                  }} style={{background:C.teal+"22",color:C.teal,border:"1px solid "+C.teal+"44",
                    borderRadius:8,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                    ⬇ GR
                  </button>
                )}
                {t.invoiceFilePath && (
                  <button onClick={async()=>{
                    try{const url=await getSignedUrl(t.invoiceFilePath,3600);const a=document.createElement("a");a.href=url;a.download="Invoice_"+(t.lrNo||t.id);a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);}
                    catch(e){alert("Failed: "+e.message);}
                  }} style={{background:C.blue+"22",color:C.blue,border:"1px solid "+C.blue+"44",
                    borderRadius:8,padding:"3px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                    ⬇ Invoice
                  </button>
                )}
              </div>
            </div>
          ))}
          <div style={{color:C.muted,fontSize:10,marginTop:6}}>
            Download each file above, then attach them in Gmail before sending.
          </div>
        </div>

        <div style={{background:`${C.orange}08`,border:"1px solid "+C.orange+"44",borderRadius:8,
          padding:"9px 12px",color:C.orange,fontSize:11}}>
          📱 On mobile: Open Gmail → attach files from Downloads → send.<br/>
          🖥 On desktop: Paste the preview into Gmail → attach downloaded files → send.
        </div>

        {!opened ? (
          <Btn onClick={openMail} full color={C.blue} disabled={!toEmail.trim()}>
            📧 Open Gmail / Mail App
          </Btn>
        ) : (<>
          <div style={{background:C.green+"11",border:"1px solid "+C.green+"33",borderRadius:8,
            padding:"9px 12px",color:C.green,fontSize:12,fontWeight:700}}>
            ✓ Email app opened — send the email with attachments, then confirm below
          </div>
          <Btn onClick={markSent} full color={C.green} disabled={!toEmail.trim()}>
            ✓ Email Sent — Mark {selected.size} Trips as Sent
          </Btn>
          <Btn onClick={openMail} full outline color={C.blue}>
            Re-open Mail App
          </Btn>
        </>)}
        <Btn onClick={onClose} full outline color={C.muted}>Cancel</Btn>
      </>)}
    </div>
  );
}

// ─── BATCH RECEIPT UPLOAD SHEET ───────────────────────────────────────────────
function BatchReceiptSheet({ batchId, trips, setTrips, onClose, log }) {
  const batchTrips = trips.filter(t => t.batchId===batchId);
  const [receiptFile, setReceiptFile] = useState(null);
  const [preview,     setPreview]     = useState(null);
  const [merging,     setMerging]     = useState(false);
  const [error,       setError]       = useState("");
  const inputRef = useRef(null);

  const pick = f => {
    setReceiptFile(f); setError("");
    const r=new FileReader(); r.onload=e=>setPreview(e.target.result); r.readAsDataURL(f);
    if(inputRef.current) inputRef.current.value="";
  };

  const handleMerge = async () => {
    if(!receiptFile){setError("Please upload the reply email PDF.");return;}
    const missing = batchTrips.filter(t=>!t.grFilePath||!t.invoiceFilePath);
    if(missing.length>0){setError("Some trips are missing GR or Invoice files: "+missing.map(t=>t.lrNo||t.id).join(", "));return;}
    setMerging(true); setError("");
    try {
      // Use first trip's id for the receipt file path (batch receipt)
      const anchorId = batchTrips[0].id;
      const receiptResult = await uploadPartyFile(anchorId, "batch_receipt_"+batchId, receiptFile);

      // Fetch all PDFs: receipt first, then GR+Invoice per trip in order
      const pdfBuffers = [];
      pdfBuffers.push(await fetchStorageFile(receiptResult.path));
      for(const t of batchTrips){
        pdfBuffers.push(await fetchStorageFile(t.grFilePath));
        pdfBuffers.push(await fetchStorageFile(t.invoiceFilePath));
      }

      const mergedBytes = await mergePDFs(pdfBuffers);
      const mergedFile  = new File([mergedBytes],"batch_merged_"+batchId+".pdf",{type:"application/pdf"});
      const mergedResult = await uploadPartyFile(anchorId, "batch_merged_"+batchId, mergedFile);

      // Stamp all trips in batch
      const ts = nowTs();
      setTrips(p => p.map(t => {
        if(t.batchId!==batchId) return t;
        const updated = {
          ...t,
          receiptFilePath: receiptResult.path,
          receiptUploadedAt: ts,
          mergedPdfPath: mergedResult.path,
        };
        DB.saveTrip(updated).catch(e=>console.error("saveTrip batch receipt:",e));
        return updated;
      }));
      log("BATCH RECEIPT UPLOADED","batch:"+batchId+" "+batchTrips.length+" trips merged");
      onClose();
      alert("✅ Batch PDF merged! Tap ⬇ Download PDF on any trip in this batch to download.");
    } catch(e) {
      setError("Merge failed: "+e.message);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:C.blue+"11",border:"1px solid "+C.blue+"33",borderRadius:10,
        padding:"10px 14px",color:C.blue,fontSize:12,fontWeight:700}}>
        📎 Upload reply email for this batch ({batchTrips.length} trips)
      </div>
      <div style={{background:C.bg,borderRadius:10,padding:"10px 14px"}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:6}}>TRIPS IN BATCH</div>
        {batchTrips.map(t=>(
          <div key={t.id} style={{display:"flex",justifyContent:"space-between",
            padding:"4px 0",borderBottom:"1px solid "+C.border+"22",fontSize:12}}>
            <span style={{color:C.text}}>{t.lrNo||"—"} · {t.truckNo}</span>
            <span style={{color:C.muted}}>{t.qty}MT</span>
          </div>
        ))}
      </div>
      <div style={{background:C.bg,borderRadius:12,padding:14,
        border:"2px dashed "+(receiptFile?C.green:C.border)}}>
        <div style={{color:C.green,fontWeight:700,fontSize:12,marginBottom:8}}>
          Reply Email PDF (receipt confirmation) *
        </div>
        {receiptFile ? (
          <div style={{position:"relative"}}>
            <div style={{background:C.card,borderRadius:8,padding:"12px",
              textAlign:"center",color:C.green,fontWeight:700}}>✓ {receiptFile.name}</div>
            <button onClick={()=>{setReceiptFile(null);setPreview(null);}}
              style={{position:"absolute",top:4,right:4,background:C.red,border:"none",
                color:"#fff",borderRadius:"50%",width:24,height:24,fontSize:14,
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        ) : (
          <FileSourcePicker onFile={pick} accept="application/pdf,image/*"
            label="Upload Reply Email PDF" color={C.green} icon="📧" />
        )}
      </div>
      <div style={{background:C.bg,borderRadius:10,padding:"10px 14px"}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:6}}>MERGE ORDER</div>
        {[
          {n:"1. Reply Email (receipt confirmation)", ok:!!receiptFile, c:C.green},
          ...batchTrips.map((t,i)=>[
            {n:(i+2)+". GR Copy — "+t.lrNo, ok:!!t.grFilePath, c:C.teal},
            {n:"   Invoice — "+t.lrNo, ok:!!t.invoiceFilePath, c:C.blue},
          ]).flat()
        ].map((x,i)=>(
          <div key={i} style={{display:"flex",gap:8,padding:"3px 0",fontSize:11}}>
            <span style={{color:x.ok?x.c:C.red}}>{x.ok?"✓":"✗"}</span>
            <span style={{color:x.ok?C.text:C.red}}>{x.n}</span>
          </div>
        ))}
      </div>
      {error&&<div style={{background:C.red+"11",border:"1px solid "+C.red+"33",
        borderRadius:8,padding:"9px 12px",color:C.red,fontSize:12}}>{error}</div>}
      <Btn onClick={handleMerge} full color={C.green} disabled={!receiptFile||merging} loading={merging}>
        {merging?"Merging PDFs…":"🔀 Merge & Store Batch PDF"}
      </Btn>
      <Btn onClick={onClose} full outline color={C.muted}>Cancel</Btn>
    </div>
  );
}

// ─── RECEIPT CONFIRMATION UPLOAD SHEET ───────────────────────────────────────
function ReceiptUploadSheet({ trip, onMerge, onClose }) {
  const [receiptFile, setReceiptFile] = useState(null);
  const [preview,     setPreview]     = useState(null);
  const [merging,     setMerging]     = useState(false);
  const [error,       setError]       = useState("");
  const inputRef = useRef(null);

  const pick = f => {
    setReceiptFile(f);
    setError("");
    const r = new FileReader();
    r.onload = e => setPreview(e.target.result);
    r.readAsDataURL(f);
    if(inputRef.current) inputRef.current.value="";
  };

  const handleMerge = async () => {
    if(!receiptFile){setError("Please upload the reply email PDF first.");return;}
    if(!trip.grFilePath||!trip.invoiceFilePath){
      setError("GR Copy or Invoice path missing on this trip. Cannot merge.");return;
    }
    setMerging(true); setError("");
    try {
      // Upload receipt email PDF
      const receiptResult = await uploadPartyFile(trip.id, "receipt_confirmation", receiptFile);

      // Fetch all three source PDFs from Supabase Storage
      const [receiptBuf, grBuf, invoiceBuf] = await Promise.all([
        fetchStorageFile(receiptResult.path),
        fetchStorageFile(trip.grFilePath),
        fetchStorageFile(trip.invoiceFilePath),
      ]);

      // Merge: Receipt Reply (page 1) → GR Copy → Invoice
      const mergedBytes = await mergePDFs([receiptBuf, grBuf, invoiceBuf]);
      const mergedFile  = new File([mergedBytes], "merged_confirmation.pdf", {type:"application/pdf"});

      // Upload merged PDF
      const mergedResult = await uploadPartyFile(trip.id, "merged_confirmation", mergedFile);

      onMerge(trip.id, receiptResult.path, mergedResult.path);
    } catch(e) {
      setError("Merge failed: " + e.message);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Trip summary */}
      <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
        <div style={{color:C.accent,fontWeight:800,fontSize:13,marginBottom:4}}>🤝 {trip.consignee||"—"}</div>
        <div style={{color:C.muted,fontSize:12}}>LR: <b style={{color:C.text}}>{trip.lrNo||"—"}</b> · {trip.truckNo} · {trip.date}</div>
        <div style={{color:C.muted,fontSize:12,marginTop:2}}>DI: {trip.diNo||"—"} · {trip.qty}MT → {trip.to}</div>
      </div>

      {/* What this does */}
      <div style={{background:C.blue+"11",border:`1px solid ${C.blue}33`,borderRadius:10,
        padding:"10px 14px",color:C.blue,fontSize:12}}>
        <div style={{fontWeight:700,marginBottom:4}}>📎 Upload party's reply email (confirming receipt)</div>
        <div style={{color:C.muted}}>The app will merge: <b style={{color:C.text}}>Reply Email → GR Copy → Invoice</b> into one PDF for portal submission</div>
      </div>

      {/* File upload */}
      <div style={{background:C.bg,borderRadius:12,padding:14,
        border:`2px dashed ${receiptFile?C.green:C.border}`}}>
        <div style={{color:C.green,fontWeight:700,fontSize:12,marginBottom:8}}>Reply Email PDF *</div>
        {receiptFile ? (
          <div style={{position:"relative"}}>
            {preview&&preview.startsWith("data:image") ? (
              <img src={preview} style={{width:"100%",maxHeight:160,objectFit:"contain",borderRadius:8}} />
            ) : (
              <div style={{background:C.card,borderRadius:8,padding:"12px",
                textAlign:"center",color:C.green,fontWeight:700}}>
                ✓ {receiptFile.name}
              </div>
            )}
            <button onClick={()=>{setReceiptFile(null);setPreview(null);}}
              style={{position:"absolute",top:4,right:4,background:C.red,border:"none",
                color:"#fff",borderRadius:"50%",width:24,height:24,fontSize:14,
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        ) : (
          <FileSourcePicker onFile={pick} accept="application/pdf,image/*"
            label="Tap to upload Reply Email PDF" color={C.green} icon="📧" />
        )}
      </div>

      {/* Merge summary */}
      {receiptFile && (
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:8}}>MERGE ORDER</div>
          {[
            {n:"1. Reply Email (receipt confirmation)", c:C.green,  ok:!!receiptFile},
            {n:"2. GR Copy",                           c:C.teal,   ok:!!trip.grFilePath},
            {n:"3. Invoice",                           c:C.blue,   ok:!!trip.invoiceFilePath},
          ].map(x=>(
            <div key={x.n} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",
              borderBottom:`1px solid ${C.border}22`}}>
              <span style={{color:x.ok?x.c:C.red,fontSize:14}}>{x.ok?"✓":"✗"}</span>
              <span style={{color:x.ok?C.text:C.red,fontSize:12}}>{x.n}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{background:C.red+"11",border:`1px solid ${C.red}33`,borderRadius:8,
          padding:"9px 12px",color:C.red,fontSize:12}}>{error}</div>
      )}

      <Btn onClick={handleMerge} full color={C.green}
        disabled={!receiptFile||merging} loading={merging}>
        {merging ? "Merging PDFs…" : "🔀 Merge & Store PDF"}
      </Btn>
      <Btn onClick={onClose} full outline color={C.muted}>Cancel</Btn>
    </div>
  );
}


// ─── SEALED INVOICE UPLOAD SHEET ─────────────────────────────────────────────
// For party trips that receive a physically sealed/stamped invoice instead of email
// Merges: Sealed Invoice → GR Copy → Original Invoice into one final PDF
function SealedInvoiceSheet({ trip, onMerge, onClose }) {
  const [files,   setFiles]   = useState([]);
  const [merging, setMerging] = useState(false);
  const [error,   setError]   = useState("");

  const addFile = f => { setFiles(prev=>[...prev, f]); setError(""); };
  const removeFile = i => setFiles(prev=>prev.filter((_,idx)=>idx!==i));

  const handleMerge = async () => {
    if(files.length===0){setError("Please upload at least one sealed invoice file.");return;}
    if(!trip.grFilePath||!trip.invoiceFilePath){
      setError("GR Copy or Invoice missing on this trip.");return;
    }
    setMerging(true); setError("");
    try {
      // Upload sealed invoice(s) — merge if multiple
      const { PDFDocument } = await import("pdf-lib");
      const sealedMerged = await PDFDocument.create();
      for(const f of files) {
        const buf = await f.arrayBuffer();
        try {
          if(f.type==="application/pdf"||f.name?.endsWith(".pdf")) {
            const doc = await PDFDocument.load(buf, {ignoreEncryption:true});
            const pages = await sealedMerged.copyPages(doc, doc.getPageIndices());
            pages.forEach(p=>sealedMerged.addPage(p));
          } else {
            const img = f.type==="image/png" ? await sealedMerged.embedPng(buf) : await sealedMerged.embedJpg(buf);
            const page = sealedMerged.addPage([img.width, img.height]);
            page.drawImage(img, {x:0,y:0,width:img.width,height:img.height});
          }
        } catch(e){ console.warn("Could not add file:", f.name, e.message); }
      }
      const sealedBytes = await sealedMerged.save();
      const sealedFile  = new File([sealedBytes], "sealed_invoice.pdf", {type:"application/pdf"});

      // Upload sealed invoice PDF
      const sealedResult = await uploadPartyFile(trip.id, "sealed_invoice", sealedFile);

      // Fetch GR + original invoice from storage
      const [grBuf, invBuf] = await Promise.all([
        fetchStorageFile(trip.grFilePath),
        fetchStorageFile(trip.invoiceFilePath),
      ]);

      // Final merge: Sealed Invoice → GR Copy → Original Invoice
      const finalBytes = await mergePDFs([sealedBytes, grBuf, invBuf]);
      const finalFile  = new File([finalBytes], "merged_confirmation.pdf", {type:"application/pdf"});
      const mergedResult = await uploadPartyFile(trip.id, "merged_confirmation", finalFile);

      onMerge(trip.id, sealedResult.path, mergedResult.path);
    } catch(e) {
      setError("Merge failed: " + e.message);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Trip summary */}
      <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
        <div style={{color:C.accent,fontWeight:800,fontSize:13,marginBottom:4}}>🤝 {trip.consignee||"—"}</div>
        <div style={{color:C.muted,fontSize:12}}>LR: <b style={{color:C.text}}>{trip.lrNo||"—"}</b> · {trip.truckNo} · {trip.date}</div>
        <div style={{color:C.muted,fontSize:12,marginTop:2}}>DI: {trip.diNo||"—"} · {trip.qty}MT → {trip.to}</div>
      </div>

      {/* Info */}
      <div style={{background:C.orange+"11",border:`1px solid ${C.orange}33`,borderRadius:10,
        padding:"10px 14px",color:C.orange,fontSize:12}}>
        <div style={{fontWeight:700,marginBottom:4}}>🏷️ Upload Sealed / Stamped Invoice</div>
        <div style={{color:C.muted}}>Upload the party's physically sealed invoice (image or PDF). The app will merge: <b style={{color:C.text}}>Sealed Invoice → GR Copy → Original Invoice</b> into one PDF.</div>
      </div>

      {/* File list */}
      <div style={{background:C.bg,borderRadius:12,padding:14,
        border:`2px dashed ${files.length>0?C.orange:C.border}`}}>
        <div style={{color:C.orange,fontWeight:700,fontSize:12,marginBottom:8}}>
          Sealed Invoice {files.length>0&&`(${files.length} file${files.length>1?"s":""})`}
        </div>
        {files.map((f,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            background:C.card,borderRadius:8,padding:"8px 10px",marginBottom:6}}>
            <span style={{color:C.text,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",
              whiteSpace:"nowrap",flex:1}}>{f.name}</span>
            <button onClick={()=>removeFile(i)}
              style={{background:"none",border:"none",color:C.red,fontSize:16,cursor:"pointer",marginLeft:8}}>×</button>
          </div>
        ))}
        <FileSourcePicker onFile={addFile} accept="image/*,application/pdf"
          label={files.length>0?"+ Add another page":"Upload sealed invoice"}
          color={C.orange} icon="🏷️" />
      </div>

      {/* Merge order preview */}
      {files.length>0 && (
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:8}}>FINAL PDF ORDER</div>
          {[
            {n:`1. Sealed Invoice (${files.length} page${files.length>1?"s":""})`, c:C.orange, ok:true},
            {n:"2. GR Copy",             c:C.teal,  ok:!!trip.grFilePath},
            {n:"3. Original Invoice",    c:C.blue,  ok:!!trip.invoiceFilePath},
          ].map(x=>(
            <div key={x.n} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",
              borderBottom:`1px solid ${C.border}22`}}>
              <span style={{color:x.ok?x.c:C.red,fontSize:14}}>{x.ok?"✓":"✗"}</span>
              <span style={{color:x.ok?C.text:C.red,fontSize:12}}>{x.n}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{background:C.red+"11",border:`1px solid ${C.red}33`,borderRadius:8,
          padding:"9px 12px",color:C.red,fontSize:12}}>{error}</div>
      )}

      <Btn onClick={handleMerge} full color={C.orange}
        disabled={files.length===0||merging}>
        {merging ? "Merging PDFs…" : "🔀 Merge & Store PDF"}
      </Btn>
      <Btn onClick={onClose} full outline color={C.muted}>Cancel</Btn>
    </div>
  );
}

// ─── TRIPS ────────────────────────────────────────────────────────────────────
function Trips({trips, setTrips, vehicles, setVehicles, indents, settings, tripType, user, log, driverPays, employees, cashTransfers, setCashTransfers, allTripsLoaded, loadingAllTrips, loadAllTrips}) {
  const isIn = tripType === "inbound";
  const ac   = isIn ? C.teal : C.accent;

  const [addSheet,    setAddSheet]    = useState(false);
  const [editSheet,   setEditSheet]   = useState(null);
  const [filter,      setFilter]      = useState("All");
  const [search,      setSearch]      = useState("");
  const [clientFilter, setClientFilter] = useState(""); // "" = All clients
  const [diConflict,  setDiConflict]  = useState(null);
  const [wasScanned,  setWasScanned]  = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set()); // collapsed by default
  const toggleExpand = id => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  // Party order flow state
  const [orderTypeStep, setOrderTypeStep] = useState(null);
  const [partyStep,     setPartyStep]     = useState("docs");
  const [uploadingFiles,setUploadingFiles]= useState(false);
  // Refs to hold file objects across re-renders without triggering state
  const grFileRef      = useRef([]); // array — supports multiple GR copies for multi-DI
  const invoiceFileRef = useRef([]); // array — supports multiple invoices for multi-DI
  // Party email batch sheet
  const [partyEmailSheet, setPartyEmailSheet] = useState(false);
  // WhatsApp reminder sheet
  const [waSheet, setWaSheet] = useState(false);
  // Batch receipt upload sheet
  const [batchReceiptSheet, setBatchReceiptSheet] = useState(null); // batchId string
  // Sealed invoice upload sheet
  const [sealedSheet, setSealedSheet] = useState(null); // trip object

  const blankForm = (isParty=false) => ({
    type:tripType, lrNo:"", diNo:"", truckNo:"", grNo:"", dieselIndentNo:"",
    client: isIn ? DEFAULT_CLIENT : DEFAULT_CLIENT,
    consignee: isIn ? "Shree Cement Ltd" : "",
    from: isIn ? "" : "Kodla", to: isIn ? "Kodla" : "",
    grade: isIn ? "Limestone" : "Cement Packed",
    qty:"", bags:"", frRate:"", givenRate:"",
    date:today(), advance:"0", shortage:"0", shortageRecovery:"0", loanRecovery:"0",
    tafal: String(settings?.tafalPerTrip||300),
    dieselEstimate:"0",
    cashEmpId: "",
    // Party order fields
    orderType: isParty ? "party" : "godown",
    district:"", state:"",
    grFilePath:"", invoiceFilePath:"", mergedPdfPath:"",
    emailSentAt:"", partyEmail:"", batchId:"",
    receiptFilePath:"", receiptUploadedAt:"",
  });

  const [f, setF] = useState(blankForm);
  const ff = k => v => setF(p => ({...p, [k]:v}));

  const list   = trips.filter(t => t.type===tripType);
  const clist  = clientFilter ? list.filter(t => (t.client||DEFAULT_CLIENT)===clientFilter) : list;
  const dlist  = (dateFrom||dateTo) ? clist.filter(t => t.date>=(dateFrom||"2000-01-01") && t.date<=(dateTo||"2099-12-31")) : clist;
  const slist  = search ? dlist.filter(t => (t.truckNo+t.lrNo+t.grNo+t.diNo+t.to+t.consignee+(t.client||"")).toLowerCase().includes(search.toLowerCase())) : dlist;
  const shown  = filter==="All" ? slist : slist.filter(t => t.status===filter);

  // When truck number changes, check if tafalExempt
  const onTruckChange = v => {
    const tn  = v.toUpperCase().trim();
    const veh = vehicles.find(x => x.truckNo===tn);
    // Find last trip with this truck to pre-fill rate and destination
    const lastTrip = [...trips].filter(t=>t.truckNo===tn&&t.type===tripType).sort((a,b)=>b.date.localeCompare(a.date))[0];
    setF(p => ({
      ...p,
      truckNo: v,
      tafal: veh?.tafalExempt ? "0" : String(settings?.tafalPerTrip||300),
      // Auto-fill from last trip with this truck (only if fields currently empty)
      givenRate: p.givenRate||"" ? p.givenRate : String(lastTrip?.givenRate||""),
      frRate:    p.frRate||""    ? p.frRate    : String(lastTrip?.frRate||""),
      to:        p.to            ? p.to        : (lastTrip?.to||""),
    }));
  };

  // Recent destinations and grades for quick-fill suggestions
  const recentDestinations = [...new Set(trips.filter(t=>t.type===tripType&&t.to).map(t=>t.to))].slice(0,6);
  const recentGrades       = [...new Set(trips.filter(t=>t.grade).map(t=>t.grade))].slice(0,5);

  // Called when AI extracts fields from DI/GR copy
  // LR is always manual — so we show LR-ask screen first, then check for duplicates
  // Detect client from scanned consignee/from field
  const detectClient = (extracted) => {
    // Search ALL text fields — consignor plant name can appear anywhere in the GR
    const haystack = [
      extracted.consignee||"",
      extracted.consignor||"",
      extracted.from||"",
      extracted.to||"",
      extracted.grade||"",
      extracted.grNo||"",
      extracted.diNo||"",
    ].join(" ").toLowerCase();
    if(haystack.includes("ultratech"))  return "Ultratech Malkhed";
    if(haystack.includes("guntur"))     return "Shree Cement Guntur";
    if(haystack.includes("malkhed"))    return "Ultratech Malkhed";
    // Also check the "from" field specifically for plant location keywords
    const fromStr = (extracted.from||"").toLowerCase();
    if(fromStr.includes("guntur"))      return "Shree Cement Guntur";
    return DEFAULT_CLIENT;
  };

  const onDIExtracted = (extracted, _ignored) => {
    // Carry district+state into form if present (party orders)
    if(extracted.district || extracted.state){
      setF(p=>({...p, district:extracted.district||p.district||"", state:extracted.state||p.state||""}));
    }
    // Auto-detect client from scanned document
    const detectedClient = detectClient(extracted);
    setF(p=>({...p, client: detectedClient}));
    // Always ask for LR number — it's never on the GR copy
    setDiConflict({ extracted, existingTrip: null, askLR: true, lrInput: "" });
  };

  // Called when user confirms LR number after scanning
  const onLRConfirmed = (lrNo, driverPhone) => {
    const { extracted } = diConflict;
    const existingTrip = lrNo.trim() ? trips.find(t => t.lrNo === lrNo.trim()) : null;

    // Auto-create vehicle record if truck not already registered
    const truckNo = (extracted.truckNo||"").toUpperCase().trim();
    const existingVehicle = vehicles.find(v => v.truckNo === truckNo);
    if (truckNo && !existingVehicle) {
      const newVehicle = {
        id: uid(), truckNo,
        ownerName:"", phone:"",
        driverName:"", driverPhone: driverPhone||"", driverLicense:"",
        accountNo:"", ifsc:"",
        loan:0, loanRecovered:0, deductPerTrip:0,
        tafalExempt:false, shortageOwed:0, shortageRecovered:0,
        loanTxns:[], shortageTxns:[],
        createdBy: user.username,
      };
      setVehicles(p => [...(p||[]), newVehicle]);
      log("AUTO-CREATE VEHICLE", `${truckNo} driver:${driverPhone||"—"}`);
    } else if (existingVehicle && driverPhone && !existingVehicle.driverPhone) {
      // Save driver phone if it was just entered
      setVehicles(p => p.map(v => v.truckNo===truckNo ? {...v, driverPhone} : v));
      log("UPDATE DRIVER PHONE", `${truckNo} → ${driverPhone}`);
    }

    if (existingTrip) {
      setDiConflict({ extracted: { ...extracted, lrNo }, existingTrip, askLR: false });
    } else {
      setF(p => ({ ...p, ...extracted, lrNo, district:extracted.district||p.district||"", state:extracted.state||p.state||"" }));
      setWasScanned(true);
      setDiConflict(null);
    }
  };

  // Merge second DI into existing trip — driver rate AND shree rate entered per DI
  const addDIToExisting = (newDriverRate, newShreeRate) => {
    const { extracted, existingTrip } = diConflict;
    const newQty     = +extracted.qty  || 0;
    const newBags    = +extracted.bags || 0;
    const newRate    = +newDriverRate  || 0;
    const newFrRate  = +newShreeRate   || +extracted.frRate || 0;

    // Build diLines — migrate existing trip if needed, preserving its frRate
    const existingLines = existingTrip.diLines && existingTrip.diLines.length > 0
      ? existingTrip.diLines.map(d => ({...d, frRate: d.frRate || existingTrip.frRate || 0}))
      : [{ diNo: existingTrip.diNo, grNo: existingTrip.grNo,
           qty: existingTrip.qty, bags: existingTrip.bags,
           givenRate: existingTrip.givenRate, frRate: existingTrip.frRate || 0 }];

    const newLine = { diNo: extracted.diNo, grNo: extracted.grNo,
                      qty: newQty, bags: newBags, givenRate: newRate, frRate: newFrRate };
    const allLines = [...existingLines, newLine];

    const totalQty  = allLines.reduce((s,d) => s+(d.qty||0), 0);
    const totalBags = allLines.reduce((s,d) => s+(d.bags||0), 0);
    const allDiNos  = allLines.map(d=>d.diNo).filter(Boolean).join(" + ");
    const allGrNos  = [...new Set(allLines.map(d=>d.grNo).filter(Boolean))].join(" + ");

    const updatedTrip = {
      ...existingTrip,
      diNo: allDiNos, grNo: allGrNos,
      qty: totalQty, bags: totalBags,
      diLines: allLines,
      editedBy: user.username, editedAt: nowTs(),
    };
    setTrips(p => p.map(t => t.id === existingTrip.id ? updatedTrip : t));
    log("ADD DI TO TRIP", `LR:${existingTrip.lrNo} + DI:${extracted.diNo} total ${totalQty}MT`);
    setDiConflict(null); setAddSheet(false);
  };

  const saveNew = async () => {
    // Validate: driver rate is mandatory
    if (!f.givenRate || +f.givenRate <= 0) {
      alert("Driver Rate ₹/MT is mandatory.\nPlease enter the rate before saving.\n\nಡ್ರೈವರ್ ರೇಟ್ ₹/MT ಕಡ್ಡಾಯ.\nಸೇವ್ ಮಾಡುವ ಮೊದಲು ದರ ನಮೂದಿಸಿ.");
      return;
    }
    // Validate: minimum margin between Shree Rate and Driver Rate
    {
      const _diLines = f.diLines||[];
      const _isMulti = _diLines.length > 1;
      const _minMargin = _isMulti
        ? Math.min(..._diLines.map(d => (+(d.frRate||f.frRate)||0) - (+(d.givenRate)||0)))
        : (+(f.frRate)||0) - (+(f.givenRate)||0);
      if(_minMargin < 30) {
        alert(`Cannot save: Margin is ₹${_minMargin.toLocaleString("en-IN")}/MT (Shree Rate − Driver Rate).\nMinimum margin required is ₹30/MT. Please adjust the rates.\n\nಉಳಿತಾಯ ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ: ಮಾರ್ಜಿನ್ ₹${_minMargin.toLocaleString("en-IN")}/MT ಇದೆ.\nಕನಿಷ್ಠ ₹30/MT ಮಾರ್ಜಿನ್ ಇರಬೇಕು. ದರ ಸರಿಪಡಿಸಿ.`);
        return;
      }
    }
    // Validate: if diesel estimate entered, indent number is mandatory
    if ((+f.dieselEstimate||0) > 0 && !f.dieselIndentNo?.trim()) {
      alert("Diesel Indent No is mandatory when Diesel Estimate is entered.\nPlease enter the indent number from the pump slip.\n\nಡೀಸೆಲ್ ಅಂದಾಜು ನಮೂದಿಸಿದಾಗ Indent No ಕಡ್ಡಾಯ.\nಪಂಪ್ ಸ್ಲಿಪ್‌ನಿಂದ ಇಂಡೆಂಟ್ ನಂಬರ್ ನಮೂದಿಸಿ.");
      return;
    }
    // Validate: diesel indent no must be unique across trips AND diesel indents
    if (f.dieselIndentNo && f.dieselIndentNo.trim()) {
      if (trips.some(t => t.dieselIndentNo && t.dieselIndentNo.trim() === f.dieselIndentNo.trim())) {
        alert(`Indent No "${f.dieselIndentNo}" already exists on another trip. Each indent number must be unique.\n\nIndent No "${f.dieselIndentNo}" ಬೇರೆ ಟ್ರಿಪ್‌ನಲ್ಲಿ ಇದೆ. ಪ್ರತಿ Indent No ಅನನ್ಯವಾಗಿರಬೇಕು.`);
        return;
      }
      if ((indents||[]).some(i => i.indentNo && String(i.indentNo).trim() === f.dieselIndentNo.trim())) {
        alert(`Indent No "${f.dieselIndentNo}" already exists in Diesel records. Each indent number must be unique.\n\nIndent No "${f.dieselIndentNo}" ಡೀಸೆಲ್ ರೆಕಾರ್ಡ್‌ನಲ್ಲಿ ಇದೆ. ಪ್ರತಿ Indent No ಅನನ್ಯವಾಗಿರಬೇಕು.`);
        return;
      }
    }
    // Validate: Est. Net to Driver cannot be negative
    // For multi-DI trips, diesel covers all DIs so first DI may show negative — allow with warning
    {
      const _gross = (+f.qty||0)*(+f.givenRate||0);
      const _net = _gross - (+f.advance||0) - (+f.tafal||0) - (+f.dieselEstimate||0) - (+f.shortageRecovery||0) - (+f.loanRecovery||0);
      if(_net < 0){
        const isOnlyDiesel = (+f.dieselEstimate||0) > 0 && (+f.advance||0)===0 && (+f.shortageRecovery||0)===0 && (+f.loanRecovery||0)===0;
        if(isOnlyDiesel) {
          // Likely a multi-DI trip where diesel spans multiple DIs — allow with warning
          if(!window.confirm(`Est. Net to Driver is ₹${_net.toLocaleString("en-IN")} (negative) — likely because diesel covers multiple DIs.\n\nSave anyway? You can merge the second DI after saving.`)) return;
        } else {
          alert(`Cannot save: Est. Net to Driver is ₹${_net.toLocaleString("en-IN")} (negative). Please reduce Advance/Loan/Shortage Recovery.\n\nಡ್ರೈವರ್‌ಗೆ ನಿವ್ವಳ ₹${_net.toLocaleString("en-IN")} (ಋಣಾತ್ಮಕ). Advance/Loan/Shortage ಕಡಿಮೆ ಮಾಡಿ.`);
          return;
        }
      }
    }
    const t = mkTrip({
      ...f, type:tripType,
      qty:+f.qty, bags:+f.bags, frRate:+f.frRate, givenRate:+f.givenRate,
      advance:+f.advance, shortage:+f.shortage, tafal:+f.tafal,
      shortageRecovery:+f.shortageRecovery||0, loanRecovery:+f.loanRecovery||0,
      dieselEstimate:+f.dieselEstimate,
      dieselIndentNo: (f.dieselIndentNo||"").trim(),
      cashEmpId: f.cashEmpId||"",
      createdBy:user.username, createdAt:nowTs(),
    });
    setTrips(p => [t, ...(p||[])]);
    log("ADD TRIP", `LR:${t.lrNo} ${t.truckNo}→${t.to} ${t.qty}MT`);
    // If advance linked to an employee wallet, record the deduction
    // Use t.advance (numeric, from the built trip) not f.advance (string from form state)
    if(t.cashEmpId && t.advance>0) {
      const empName = (employees||[]).find(e=>e.id===t.cashEmpId)?.name||t.cashEmpId;
      const wxn={id:"WX-"+t.id, empId:t.cashEmpId, amount:-t.advance, date:t.date||today(),
        note:`Advance — LR ${t.lrNo||"—"} · ${t.truckNo}`, lrNo:t.lrNo||"", tripId:t.id,
        createdBy:user.username, createdAt:nowTs()};
      setCashTransfers(prev=>[wxn,...(Array.isArray(prev)?prev:[])]);
      DB.saveCashTransfer(wxn).catch(e=>console.error("saveCashTransfer:",e));
      log("WALLET ADVANCE",`${empName} −₹${fmt(t.advance)} LR:${t.lrNo}`);
    }
    const tn2 = (t.truckNo||"").toUpperCase().trim();
    // Auto-create vehicle FIRST if not yet registered — so ledger update below finds it
    if (tn2 && !vehicles.find(v => v.truckNo === tn2)) {
      const nv = { id:uid(), truckNo:tn2, ownerName:"", phone:"",
        driverName:"", driverPhone:"", driverLicense:"",
        accountNo:"", ifsc:"", loan:0, loanRecovered:0, deductPerTrip:0,
        tafalExempt:false, shortageOwed:0, shortageRecovered:0,
        shortageTxns:[], loanTxns:[], createdBy:user.username };
      setVehicles(p => [...(p||[]), nv]);
      log("AUTO-CREATE VEHICLE", `${tn2} from trip save`);
    }
    // Reflect shortageRecovery / loanRecovery into vehicle ledger
    if(tn2 && (t.shortageRecovery>0 || t.loanRecovery>0)){
      setVehicles(prev=>prev.map(veh=>{
        if(veh.truckNo!==tn2) return veh;
        let upd={...veh};
        if(t.shortageRecovery>0){
          const txn={id:uid(),type:"recovery",date:t.date||today(),qty:0,amount:t.shortageRecovery,lrNo:t.lrNo,note:"From trip form"};
          upd={...upd,shortageRecovered:(upd.shortageRecovered||0)+t.shortageRecovery,shortageTxns:[...(upd.shortageTxns||[]),txn]};
        }
        if(t.loanRecovery>0){
          const txn={id:uid(),type:"recovery",date:t.date||today(),amount:t.loanRecovery,lrNo:t.lrNo,note:"From trip form"};
          upd={...upd,loanRecovered:(upd.loanRecovered||0)+t.loanRecovery,loanTxns:[...(upd.loanTxns||[]),txn]};
        }
        return upd;
      }));
    }
    setF(blankForm()); setAddSheet(false); setWasScanned(false);
  };

  const saveEdit = () => {
    // Freeze check — settled trips cannot be edited (except by owner)
    const origTrip = trips.find(t=>t.id===editSheet.id);
    if(origTrip?.driverSettled && user.role !== "owner") {
      alert("This trip is frozen — driver payment is complete. Only Owner can edit.\n\nಈ ಟ್ರಿಪ್ ಫ್ರೀಜ್ ಆಗಿದೆ — ಡ್ರೈವರ್ ಪಾವತಿ ಪೂರ್ಣಗೊಂಡಿದೆ. ಓನರ್ ಮಾತ್ರ ಬದಲಾಯಿಸಬಹುದು.");
      setEditSheet(null);
      return;
    }
    // For multi-DI trips, recalculate blended rates from diLines
    const diLines = editSheet.diLines || [];
    const isMultiDI = diLines.length > 1;
    const totalQty    = isMultiDI ? diLines.reduce((s,d)=>s+(d.qty||0),0)                  : +editSheet.qty;
    const totalGross  = isMultiDI ? diLines.reduce((s,d)=>s+(d.qty||0)*(d.givenRate||0),0) : 0;
    const totalBilled = isMultiDI ? diLines.reduce((s,d)=>s+(d.qty||0)*(d.frRate||0),0)    : 0;
    const blendedGivenRate = isMultiDI && totalQty>0 ? totalGross/totalQty  : +editSheet.givenRate;
    const blendedFrRate    = isMultiDI && totalQty>0 ? totalBilled/totalQty : +editSheet.frRate;
    // Persist frRate on each diLine so it survives future edits
    const savedLines = isMultiDI ? diLines.map(d=>({...d, frRate:d.frRate||+editSheet.frRate||0})) : diLines;

    // ── Validate FIRST before any state mutation ──────────────────────────────
    {
      const _diLines = editSheet.diLines||[];
      const _isMulti = _diLines.length > 1;
      const _minMargin = _isMulti
        ? Math.min(..._diLines.map(d => (+(d.frRate||editSheet.frRate)||0) - (+(d.givenRate)||0)))
        : (+(editSheet.frRate)||0) - (+(editSheet.givenRate)||0);
      if(_minMargin < 30) {
        alert(`Cannot save: Margin is ₹${_minMargin.toLocaleString("en-IN")}/MT (Shree Rate − Driver Rate).\nMinimum margin required is ₹30/MT. Please adjust the rates.\n\nಉಳಿತಾಯ ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ: ಮಾರ್ಜಿನ್ ₹${_minMargin.toLocaleString("en-IN")}/MT ಇದೆ.\nಕನಿಷ್ಠ ₹30/MT ಮಾರ್ಜಿನ್ ಇರಬೇಕು. ದರ ಸರಿಪಡಿಸಿ.`);
        return;
      }
    }
    {
      const _diLines = editSheet.diLines||[];
      const _isMulti = _diLines.length > 1;
      const _gross = _isMulti
        ? _diLines.reduce((s,d)=>s+(d.qty||0)*(d.givenRate||0),0)
        : (+editSheet.qty||0)*(+editSheet.givenRate||0);
      const _net = _gross - (+editSheet.advance||0) - (+editSheet.tafal||0) - (+editSheet.dieselEstimate||0) - (+editSheet.shortageRecovery||0) - (+editSheet.loanRecovery||0);
      if(_net < 0){
        const isOnlyDiesel = (+editSheet.dieselEstimate||0) > 0 && (+editSheet.advance||0)===0 && (+editSheet.shortageRecovery||0)===0 && (+editSheet.loanRecovery||0)===0;
        if(isOnlyDiesel) {
          if(!window.confirm(`Est. Net to Driver is ₹${_net.toLocaleString("en-IN")} (negative) — likely because diesel covers multiple DIs.\n\nSave anyway?`)) return;
        } else {
          alert(`Cannot save: Est. Net to Driver is ₹${_net.toLocaleString("en-IN")} (negative). Please reduce Advance/Loan/Shortage Recovery.\n\nಡ್ರೈವರ್‌ಗೆ ನಿವ್ವಳ ₹${_net.toLocaleString("en-IN")} (ಋಣಾತ್ಮಕ). Advance/Loan/Shortage ಕಡಿಮೆ ಮಾಡಿ.`);
          return;
        }
      }
    }
    setTrips(p => p.map(t => t.id===editSheet.id ? {
      ...editSheet,
      qty:+editSheet.qty, bags:+editSheet.bags,
      frRate: blendedFrRate || +editSheet.frRate,
      givenRate: blendedGivenRate,
      diLines: savedLines,
      advance:+editSheet.advance,
      shortage:+editSheet.shortage, tafal:+editSheet.tafal,
      shortageRecovery:+editSheet.shortageRecovery||0, loanRecovery:+editSheet.loanRecovery||0,
      dieselEstimate:+editSheet.dieselEstimate,
      cashEmpId: editSheet.cashEmpId||"",
      editedBy:user.username, editedAt:nowTs(),
    } : t));
    // Reflect shortageRecovery / loanRecovery change into vehicle ledger (delta only)
    const prevTrip = trips.find(t=>t.id===editSheet.id);
    const prevSR = prevTrip?.shortageRecovery||0;
    const prevLR = prevTrip?.loanRecovery||0;
    const newSR = +editSheet.shortageRecovery||0;
    const newLR = +editSheet.loanRecovery||0;
    const deltaSR = newSR - prevSR;
    const deltaLR = newLR - prevLR;
    const tn3 = (editSheet.truckNo||"").toUpperCase().trim();
    if(tn3 && (deltaSR!==0||deltaLR!==0)){
      setVehicles(prev=>prev.map(veh=>{
        if(veh.truckNo!==tn3) return veh;
        let upd={...veh};
        if(deltaSR>0){
          const txn={id:uid(),type:"recovery",date:editSheet.date||today(),qty:0,amount:deltaSR,lrNo:editSheet.lrNo,note:"From trip edit"};
          upd={...upd,shortageRecovered:(upd.shortageRecovered||0)+deltaSR,shortageTxns:[...(upd.shortageTxns||[]),txn]};
        } else if(deltaSR<0){
          upd={...upd,shortageRecovered:Math.max(0,(upd.shortageRecovered||0)+deltaSR)};
        }
        if(deltaLR>0){
          const txn={id:uid(),type:"recovery",date:editSheet.date||today(),amount:deltaLR,lrNo:editSheet.lrNo,note:"From trip edit"};
          upd={...upd,loanRecovered:(upd.loanRecovered||0)+deltaLR,loanTxns:[...(upd.loanTxns||[]),txn]};
        } else if(deltaLR<0){
          upd={...upd,loanRecovered:Math.max(0,(upd.loanRecovered||0)+deltaLR)};
        }
        return upd;
      }));
    }
    // Wallet advance: upsert a single record per trip using stable id "WX-"+tripId
    // This prevents duplicate entries — editing just overwrites the same record
    const newAdv   = +editSheet.advance||0;
    const newEmpId = editSheet.cashEmpId||"";
    const stableId = "WX-"+editSheet.id;
    if(newEmpId && newAdv>0) {
      // Upsert: replace existing wallet record for this trip
      const empName = (employees||[]).find(e=>e.id===newEmpId)?.name||newEmpId;
      const wxn={id:stableId, empId:newEmpId, amount:-newAdv, date:editSheet.date||today(),
        note:`Advance — LR ${editSheet.lrNo||"—"} · ${editSheet.truckNo}`, lrNo:editSheet.lrNo||"", tripId:editSheet.id,
        createdBy:user.username, createdAt:nowTs()};
      setCashTransfers(prev=>[wxn,...(Array.isArray(prev)?prev:[]).filter(x=>x.id!==stableId)]);
      DB.saveCashTransfer(wxn).catch(e=>console.error("saveCashTransfer:",e));
      log("WALLET ADVANCE",`${empName} −₹${fmt(newAdv)} LR:${editSheet.lrNo}`);
    } else if(!newEmpId || newAdv<=0) {
      // Employee unlinked or advance cleared — remove the wallet record
      setCashTransfers(prev=>(prev||[]).filter(x=>x.id!==stableId));
      DB.deleteCashTransfer(stableId).catch(()=>{});
    }
    log("EDIT TRIP", `LR:${editSheet.lrNo} ${editSheet.truckNo}`);
    setEditSheet(null);
  };

  const deleteTrip = async (t) => {
    // Cascade: remove any indents/alerts linked to this trip
    const linkedIndents = indents.filter(i => i.tripId === t.id);
    if (linkedIndents.length > 0) {
      setIndents(prev => prev.filter(i => i.tripId !== t.id));
      for (const ind of linkedIndents) {
        try { await DB.deleteIndent(ind.id); } catch(e) { console.warn("indent cascade delete:", e); }
      }
    }
    // Optimistic update immediately
    setTrips(p => p.filter(x => x.id !== t.id));
    setConfirmDel(null);
    log("DELETE TRIP", `LR:${t.lrNo} ${t.truckNo} ${t.qty}MT`);
    // Delete party files if applicable
    if(t.orderType==="party") deletePartyFiles(t.id).catch(e=>console.warn("Party file delete:", e));
    // Persist to Supabase
    try {
      await DB.deleteTrip(t.id);
    } catch(e) {
      // If DB delete fails, restore the trip
      setTrips(p => [t, ...p]);
      alert("Failed to delete from database: " + e.message);
    }
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:ac,fontWeight:800,fontSize:16}}>{isIn?"🏭 Raw Material":"🚚 Cement Trips"}</div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>setShowDateFilter(v=>!v)} sm outline color={showDateFilter||(dateFrom||dateTo)?C.orange:C.muted}>📅</Btn>
          {!isIn && (() => {
            const pending = trips.filter(t=>t.orderType==="party"&&!t.emailSentAt);
            return pending.length>0 ? (
              <Btn onClick={()=>setPartyEmailSheet(true)} sm
                color={pending.length>5?C.red:C.accent}>
                📧 {pending.length}
              </Btn>
            ) : null;
          })()}
          <button onClick={()=>{
            if(isIn){setOrderTypeStep("godown");setF(blankForm(false));}
            else{setOrderTypeStep("selecting");}
            setAddSheet(true);
          }} style={{background:ac,border:"none",borderRadius:10,color:"#fff",
            padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            Add Trip
          </button>
        </div>
      </div>
      {/* Warning: >5 pending party emails */}
      {!isIn && (() => {
        const pending = trips.filter(t=>t.orderType==="party"&&!t.emailSentAt);
        return pending.length>5 ? (
          <div style={{background:C.red+"11",border:"1px solid "+C.red+"44",borderRadius:10,
            padding:"9px 14px",color:C.red,fontSize:12,fontWeight:700,
            display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
            <span style={{flex:1}}>⚠ {pending.length} party trips waiting for email</span>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button onClick={()=>setWaSheet(true)}
                style={{background:"#25D366",border:"none",color:"#fff",borderRadius:8,
                  padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                📲 Remind
              </button>
              <button onClick={()=>setPartyEmailSheet(true)}
                style={{background:C.blue,border:"none",color:"#fff",borderRadius:8,
                  padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                📧 Email
              </button>
              <button onClick={()=>{
                // Find first party trip with GR uploaded but no merged PDF for sealed invoice
                const t = (trips||[]).find(x=>x.orderType==="party"&&x.grFilePath&&!x.mergedPdfPath);
                if(t) setSealedSheet(t);
                else setSealedSheet((trips||[]).find(x=>x.orderType==="party"&&!x.mergedPdfPath)||null);
              }}
                style={{background:C.orange,border:"none",color:"#fff",borderRadius:8,
                  padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                🏷️ Sealed
              </button>
            </div>
          </div>
        ) : null;
      })()}

      {/* Date filter bar */}
      {showDateFilter && (
        <div style={{background:C.card,borderRadius:12,padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
            <div style={{flex:1}}>
              <div style={{color:C.muted,fontSize:11,marginBottom:3}}>FROM</div>
              <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                onClick={e=>e.target.showPicker?.()}
                style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,color:dateFrom?C.text:C.muted,
                  padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"light",WebkitAppearance:"none",boxSizing:"border-box"}} />
            </div>
            <div style={{flex:1}}>
              <div style={{color:C.muted,fontSize:11,marginBottom:3}}>TO</div>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                onClick={e=>e.target.showPicker?.()}
                style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,color:dateTo?C.text:C.muted,
                  padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"light",WebkitAppearance:"none",boxSizing:"border-box"}} />
            </div>
            <Btn onClick={()=>{setDateFrom("");setDateTo("");}} sm outline color={C.muted}>Clear</Btn>
          </div>
          {(dateFrom||dateTo) && (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:C.muted,fontSize:12}}>{dlist.length} trips · {dateFrom||"all"} → {dateTo||"all"}</div>
              <button onClick={()=>{
                const rows = shown.map(t => {
                  const v = vehicles?.find(x=>x.truckNo===t.truckNo);
                  const diesel = t.dieselEstimate||0;
                  const net = (t.qty*(t.givenRate||0)) - (t.advance||0) - (t.tafal||0) - diesel;
                  return "<tr><td>"+t.date+"</td><td>"+t.truckNo+"</td><td>"+(t.lrNo||"—")+"</td><td>"+(t.client||DEFAULT_CLIENT).replace("Shree Cement ","SC ").replace("Ultratech ","UT ")+"</td><td>"+(t.to||"—")+"</td><td>"+t.qty+"</td><td style='text-align:right'>"+fmt(t.qty*(t.frRate||0))+"</td><td style='text-align:right'>"+fmt(t.advance||0)+"</td><td style='text-align:right'>"+fmt(diesel)+"</td><td style='text-align:right'>"+fmt(net)+"</td><td>"+(t.status||"—")+"</td></tr>";
                }).join("");
                const totalFreight = shown.reduce((s,t)=>s+t.qty*(t.frRate||0),0);
                const totalQty = shown.reduce((s,t)=>s+t.qty,0);
                const html = "<html><head><style>body{font-family:Arial,sans-serif;font-size:12px;padding:16px}h2{color:#f97316;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#f97316;color:#fff;padding:6px 8px;text-align:left;font-size:11px}td{padding:5px 8px;border-bottom:1px solid #eee;font-size:11px}.summary{display:flex;gap:24px;margin:8px 0;font-size:13px;color:#555}.sv{font-weight:bold;color:#111}</style></head>"
                  +"<body><h2>M. Yantra — Trip Report</h2>"
                  +"<div style='color:#888;font-size:12px'>Period: "+(dateFrom||"all")+" to "+(dateTo||"all")+" &nbsp;|&nbsp; Filter: "+filter+"</div>"
                  +"<div class='summary'><div>Trips: <span class='sv'>"+shown.length+"</span></div><div>Total Qty: <span class='sv'>"+totalQty+"MT</span></div><div>Total Freight: <span class='sv'>"+fmt(totalFreight)+"</span></div></div>"
                  +"<table><thead><tr><th>Date</th><th>Truck</th><th>LR</th><th>To</th><th>Qty(MT)</th><th>Freight</th><th>Advance</th><th>Diesel</th><th>Net</th><th>Status</th></tr></thead>"
                  +"<tbody>"+rows+"</tbody></table></body></html>";
                const w = window.open("","_blank");
                w.document.write(html);
                w.document.close();
                setTimeout(()=>w.print(),400);
              }} style={{background:C.orange,border:"none",borderRadius:8,color:"#000",
                fontSize:12,fontWeight:700,padding:"7px 14px",cursor:"pointer"}}>
                🖨 Export PDF ({shown.length})
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search truck, LR, destination…"
          style={{flex:1,background:C.card,border:`1.5px solid ${search?C.accent:C.border}`,borderRadius:10,
            color:C.text,padding:"10px 14px",fontSize:13,outline:"none",boxSizing:"border-box"}} />
        {search && <button onClick={()=>setSearch("")}
          style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button>}
      </div>

      <PillBar items={["All","Pending Bill","Billed","Paid"].map(s=>({id:s,label:s+(s!=="All"?` (${list.filter(t=>t.status===s).length})`:""  ),color:SC(s)}))} active={filter} onSelect={setFilter} />

      {/* Client / Plant filter — only shows when multiple clients present */}
      {(()=>{
        const cc={};
        list.forEach(t=>{const c=t.client||DEFAULT_CLIENT;cc[c]=(cc[c]||0)+1;});
        if(Object.keys(cc).length<2) return null;
        return (
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{color:C.muted,fontSize:11,fontWeight:700}}>Plant:</span>
            {["All",...CLIENTS].map(c=>{
              const cnt=c==="All"?list.length:(cc[c]||0);
              if(c!=="All"&&!cc[c]) return null;
              const active=(clientFilter||"")===(c==="All"?"":c);
              return (
                <button key={c} onClick={()=>setClientFilter(c==="All"?"":c)}
                  style={{padding:"4px 10px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",
                    border:`1.5px solid ${active?C.teal:C.border}`,
                    background:active?C.teal+"22":"none",
                    color:active?C.teal:C.muted}}>
                  {c==="All"?"All":c.replace("Shree Cement ","SC·").replace("Ultratech ","UT·")} ({cnt})
                </button>
              );
            })}
          </div>
        );
      })()}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:C.muted,fontSize:12}}>{shown.length} trips {(dateFrom||dateTo)?`· ${dateFrom||"all"} → ${dateTo||"all"}`:""}</div>
        {(dateFrom||dateTo) && <button onClick={()=>{setDateFrom("");setDateTo("");}} style={{background:"none",border:"none",color:C.red,fontSize:11,cursor:"pointer"}}>✕ Clear dates</button>}
      </div>

      {/* ── Load older trips banner ── */}
      {!allTripsLoaded && (
        <div style={{background:C.card,borderRadius:12,padding:"11px 14px",
          display:"flex",justifyContent:"space-between",alignItems:"center",
          border:`1px solid ${C.border}`}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:C.text}}>Showing last 90 days</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>
              {trips.length} trips loaded · Older records not shown
            </div>
          </div>
          <button onClick={loadAllTrips} disabled={loadingAllTrips}
            style={{background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:10,
              color:C.blue,fontSize:12,fontWeight:700,padding:"7px 14px",
              cursor:loadingAllTrips?"wait":"pointer",whiteSpace:"nowrap",flexShrink:0}}>
            {loadingAllTrips ? "Loading…" : "Load all trips"}
          </button>
        </div>
      )}
      {allTripsLoaded && (
        <div style={{textAlign:"center",color:C.muted,fontSize:11,padding:"4px 0"}}>
          All trips loaded ({trips.length} total)
        </div>
      )}

      {/* TRIP CARDS — date-grouped, LR-prominent, sorted newest first */}
      {(() => {
        // Sort shown by date desc, then LR desc within same date
        const sorted = [...shown].sort((a,b) => {
          const dc = (b.date||"").localeCompare(a.date||"");
          if(dc!==0) return dc;
          return (+b.lrNo||0) - (+a.lrNo||0);
        });

        // Group by date
        const groups = [];
        sorted.forEach(t => {
          const d = t.date||"";
          if(!groups.length || groups[groups.length-1].date!==d)
            groups.push({date:d, trips:[]});
          groups[groups.length-1].trips.push(t);
        });

        const todayStr = today();
        const yesterStr = new Date(Date.now()-864e5).toISOString().split("T")[0];
        const fmtDateHdr = d => {
          if(d===todayStr) return "Today — "+new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});
          if(d===yesterStr) return "Yesterday — "+new Date(d).toLocaleDateString("en-IN",{day:"numeric",month:"short"});
          return new Date(d).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
        };

        return groups.map(({date:grpDate, trips:grpTrips}) => (
          <div key={grpDate}>
            {/* Date group header */}
            <div style={{display:"flex",alignItems:"center",gap:10,margin:"14px 0 6px",paddingLeft:2}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,whiteSpace:"nowrap"}}>
                {fmtDateHdr(grpDate)}
              </div>
              <div style={{flex:1,height:1,background:C.border+"55"}} />
              <div style={{color:C.muted,fontSize:11}}>{grpTrips.length} trip{grpTrips.length>1?"s":""}</div>
            </div>

            {grpTrips.map(t => {
              const v    = vehicles.find(x => x.truckNo===t.truckNo);
              const tripIndents = indents.filter(i => i.tripId===t.id && i.confirmed);
              const confirmedDiesel = tripIndents.reduce((s,i) => s+(i.amount||0), 0);
              const calc = calcNet(t, v, confirmedDiesel > 0 ? confirmedDiesel : null);
              const paidSoFar = (driverPays||[]).filter(p=>p.tripId===t.id).reduce((s,p)=>s+(p.amount||0),0);
              const remaining = Math.max(0, calc.net - paidSoFar);
              const isExpanded = expandedIds.has(t.id);
              return (
                <div key={t.id} style={{background:C.card,borderRadius:14,overflow:"hidden",
                  borderLeft:`4px solid ${SC(t.status)}`,marginBottom:6}}>

                  {/* ── Collapsed row — LR prominent (Option A+C combo) ── */}
                  <div onClick={()=>toggleExpand(t.id)}
                    style={{padding:"10px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>

                    {/* LR number — big and prominent on the left */}
                    <div style={{textAlign:"center",minWidth:44,flexShrink:0}}>
                      <div style={{fontSize:18,fontWeight:800,color:C.blue,lineHeight:1}}>{t.lrNo||"—"}</div>
                      <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>LR</div>
                    </div>

                    {/* Divider */}
                    <div style={{width:1,height:36,background:C.border+"66",flexShrink:0}} />

                    {/* Main info */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:13}}>{t.truckNo}</span>
                        {t.driverSettled && <span style={{fontSize:10,color:C.green,fontWeight:600}}>✓ Settled</span>}
                        {t.diLines&&t.diLines.length>1 && <span style={{fontSize:10,color:C.teal,fontWeight:600}}>{t.diLines.length} DIs</span>}
                        {t.orderType==="party" && <span style={{fontSize:10,color:C.accent,fontWeight:600}}>🤝</span>}
                        {(()=>{
                          const c=t.client||DEFAULT_CLIENT;
                          const col=c.includes("Ultratech")?C.orange:c.includes("Guntur")?C.purple:C.blue;
                          const lbl=c.replace("Shree Cement ","").replace("Ultratech ","UT·");
                          return <span style={{fontSize:9,color:col,fontWeight:700,background:col+"18",borderRadius:8,padding:"1px 6px"}}>{lbl}</span>;
                        })()}
                      </div>
                      <div style={{color:C.muted,fontSize:11,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {t.to} · {t.qty}MT
                        {remaining>0 && <span style={{color:C.orange,fontWeight:600}}> · ₹{remaining.toLocaleString("en-IN")} due</span>}
                      </div>
                    </div>

                    {/* Status + chevron */}
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                      <Badge label={t.status} color={SC(t.status)} />
                      <span style={{color:C.muted,fontSize:12,transition:"transform 0.2s",
                        display:"inline-block",transform:isExpanded?"rotate(180deg)":"rotate(0deg)"}}>⌄</span>
                    </div>
                  </div>

                  {/* ── Expanded content ── */}
                  {isExpanded && (
                  <div style={{borderTop:`1px solid ${C.border}33`}}>
                  <div style={{padding:"10px 14px 10px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:15}}>{t.truckNo}
                        <span style={{fontSize:11,fontWeight:400,color:(t.client||DEFAULT_CLIENT).includes("Ultratech")?C.orange:(t.client||DEFAULT_CLIENT).includes("Guntur")?C.purple:C.blue,marginLeft:8}}>
                          {(t.client||DEFAULT_CLIENT)}
                        </span>
                      </div>
                        <div style={{fontSize:12,marginTop:2}}>
                          <span style={{color:C.blue,fontWeight:700}}>LR: {t.lrNo||"—"}</span>
                          {t.grNo && <span style={{color:C.muted}}> · GR: {t.grNo}</span>}
                        </div>
                        <div style={{color:C.muted,fontSize:11,marginTop:1}}>{t.from}→{t.to} · {t.date}</div>
                      </div>
                      <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                        <Badge label={t.status} color={SC(t.status)} />
                        {t.driverSettled && user.role!=="owner" ? (
                          <div title="Trip is frozen — driver payment complete. Only Owner can edit."
                            style={{background:C.dim,borderRadius:8,color:C.muted+"66",padding:"5px 8px",
                              fontSize:14,cursor:"not-allowed",opacity:0.4,display:"flex",alignItems:"center"}}>
                            🔒
                          </div>
                        ) : (
                          <button onClick={()=>{
                            const normalized = {...t, diLines: (t.diLines||[]).map(d=>({...d, frRate: d.frRate||t.frRate||0}))};
                            setEditSheet(normalized);
                          }} style={{background:C.dim,border:"none",borderRadius:8,color:t.driverSettled?C.orange:C.muted,padding:"5px 8px",cursor:"pointer",fontSize:14}}>
                            {t.driverSettled?"🔓":"✏"}
                          </button>
                        )}
                        {user.role==="owner" && (
                          <button onClick={()=>setConfirmDel(t)}
                            style={{background:C.red+"22",border:"none",borderRadius:8,color:C.red,padding:"5px 8px",cursor:"pointer",fontSize:14}}>🗑</button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderTop:`1px solid ${C.border}`,background:C.card2}}>
                    {[
                      {l:"MT",     v:t.qty,                            c:C.text},
                      {l:"Billed", v:fmt(calc.billed||t.qty*t.frRate), c:C.blue},
                      {l:"Owed",   v:fmt(calc.gross),                  c:C.orange},
                      {l: paidSoFar>0 ? "Remaining" : "Net Pay",
                       v: fmt(paidSoFar>0 ? remaining : calc.net),
                       c: paidSoFar>0 ? (remaining===0 ? C.green : C.accent) : (calc.net>=0?C.green:C.red),
                       sub: paidSoFar>0 ? `paid ${fmt(paidSoFar)}` : null},
                    ].map(x => (
                      <div key={x.l} style={{padding:"8px 0",textAlign:"center",borderRight:`1px solid ${C.border}`}}>
                        <div style={{color:x.c,fontWeight:700,fontSize:12}}>{x.v}</div>
                        <div style={{color:C.muted,fontSize:9}}>{x.l}</div>
                        {x.sub && <div style={{color:C.muted,fontSize:9}}>{x.sub}</div>}
                      </div>
                    ))}
                  </div>

                  <div style={{padding:"7px 12px 4px",display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{color:ROLES[t.createdBy]?.color||C.muted,fontSize:11}}>by {t.createdBy} · {t.createdAt}</span>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                      {t.tafal>0     && <Badge label={"TAFAL ₹"+t.tafal}     color={C.purple} />}
                      {t.shortage>0  && <Badge label={"⚠ "+t.shortage+"MT"}  color={C.red} />}
                      {t.advance>0   && <Badge label={"Adv "+fmt(t.advance)}  color={C.orange} />}
                      {confirmedDiesel>0 && <Badge label={"⛽ "+fmt(confirmedDiesel)} color={C.orange} />}
                      {t.driverSettled   && <Badge label="✓ Settled"          color={C.green} />}
                      {t.diLines && t.diLines.length > 1 && <Badge label={t.diLines.length+" DIs"} color={C.teal} />}
                    </div>
                  </div>

                  {(t.orderType==="party"||t.grFilePath) && (
                    <div style={{padding:"5px 12px 8px",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",
                      borderTop:"1px solid "+C.border+"33"}}>
                      <Badge label="🤝 Party" color={C.accent} />
                      {t.orderType==="party" && !t.emailSentAt && !t.sealedInvoicePath && !t.mergedPdfPath && (
                        <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                          <Badge label="⚠ Pending" color={C.red} />
                          <button onClick={e=>{e.stopPropagation();setPartyEmailSheet(true);}}
                            style={{background:C.blue+"22",color:C.blue,border:`1px solid ${C.blue}44`,borderRadius:16,
                              padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                            📧 Email
                          </button>
                          <button onClick={e=>{e.stopPropagation();setSealedSheet(t);}}
                            style={{background:C.orange+"22",color:C.orange,border:`1px solid ${C.orange}44`,borderRadius:16,
                              padding:"3px 10px",fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                            🏷️ Sealed Invoice
                          </button>
                        </div>
                      )}
                      {t.orderType==="party" && t.emailSentAt && !t.receiptFilePath && !t.mergedPdfPath && <Badge label="📧 Awaiting Reply" color={C.blue} />}
                      {t.receiptFilePath && !t.mergedPdfPath && <Badge label="🔄 Receipt uploaded" color={C.teal} />}
                      {t.sealedInvoicePath && !t.mergedPdfPath && <Badge label="🏷️ Sealed uploaded" color={C.orange} />}
                      {t.mergedPdfPath && <Badge label="✅ Merged PDF ready" color={C.green} />}
                      {t.emailSentAt && t.batchId && !t.mergedPdfPath && (
                        <button onClick={()=>setBatchReceiptSheet(t.batchId)}
                          style={{background:C.green+"22",color:C.green,border:"1px solid "+C.green+"44",borderRadius:20,
                            padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                          📎 Upload Batch Receipt
                        </button>
                      )}
                      {t.grFilePath && !t.mergedPdfPath && (
                        <button onClick={()=>setSealedSheet(t)}
                          style={{background:C.orange+"22",color:C.orange,border:"1px solid "+C.orange+"44",borderRadius:20,
                            padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                          🏷️ Upload Sealed Invoice
                        </button>
                      )}
                      {t.grFilePath && (
                        <button onClick={async()=>{try{const url=await getSignedUrl(t.grFilePath,3600);const a=document.createElement("a");a.href=url;a.download="GR_"+(t.lrNo||t.id);a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(e){alert("GR download failed: "+e.message);}}}
                          style={{background:C.teal+"22",color:C.teal,border:"1px solid "+C.teal+"44",borderRadius:20,
                            padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                          ⬇ GR
                        </button>
                      )}
                      {t.invoiceFilePath && (
                        <button onClick={async()=>{try{const url=await getSignedUrl(t.invoiceFilePath,3600);const a=document.createElement("a");a.href=url;a.download="Invoice_"+(t.lrNo||t.id);a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(e){alert("Invoice download failed: "+e.message);}}}
                          style={{background:C.blue+"22",color:C.blue,border:"1px solid "+C.blue+"44",borderRadius:20,
                            padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                          ⬇ Invoice
                        </button>
                      )}
                      {t.mergedPdfPath && (
                        <button onClick={async()=>{try{const url=await getSignedUrl(t.mergedPdfPath,3600);const a=document.createElement("a");a.href=url;a.download="MergedConfirmation_"+(t.lrNo||t.id)+".pdf";a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(e){alert("Download failed: "+e.message);}}}
                          style={{background:C.green+"22",color:C.green,border:"1px solid "+C.green+"44",borderRadius:20,
                            padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                          ⬇ Merged PDF
                        </button>
                      )}
                    </div>
                  )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        ));
      })()}
      {shown.length===0 && <div style={{textAlign:"center",color:C.muted,padding:40}}>No trips found</div>}

      {/* ── WHATSAPP REMINDER SHEET ── */}
      {waSheet && (()=>{
        const pending = trips.filter(t=>t.orderType==="party"&&!t.emailSentAt);
        // Build contacts from employees with phones
        const contacts = (employees||[])
          .filter(e=>e.phone&&e.phone.trim())
          .map(e=>({name:e.name, phone:e.phone.replace(/\D/g,""), role:e.role||""}));
        const msgText = "Dear {name},\n\nReminder: "+pending.length+" party trip"+(pending.length>1?"s are":"is")+" pending email confirmation at M Yantra Enterprises.\n\nPlease send the confirmation email at the earliest.\n\n- M Yantra System\n9606477257";
        return (
          <Sheet title="📲 WhatsApp Reminder" onClose={()=>setWaSheet(false)}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{background:C.red+"11",border:"1px solid "+C.red+"44",borderRadius:10,
                padding:"10px 14px",color:C.red,fontSize:12,fontWeight:700}}>
                ⚠ {pending.length} party trip{pending.length>1?"s":""}  pending email confirmation
              </div>

              <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginBottom:6}}>MESSAGE PREVIEW</div>
                <div style={{color:C.text,fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap"}}>
                  {msgText.replace("{name}","[Name]")}
                </div>
              </div>

              {contacts.length===0 ? (
                <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",
                  color:C.muted,fontSize:12,textAlign:"center"}}>
                  No employee phone numbers found.<br/>Add phone numbers to employees first.
                </div>
              ) : (
                <>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1}}>
                    TAP TO SEND TO:
                  </div>
                  {contacts.map(c=>(
                    <button key={c.phone} onClick={()=>{
                      const msg = msgText.replace("{name}", c.name);
                      window.open("https://wa.me/91"+c.phone+"?text="+encodeURIComponent(msg),"_blank");
                    }} style={{background:C.card,border:"1px solid "+C.border,borderRadius:12,
                      padding:"12px 14px",cursor:"pointer",
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      textAlign:"left"}}>
                      <div>
                        <div style={{color:C.text,fontWeight:700,fontSize:13}}>{c.name}</div>
                        <div style={{color:C.muted,fontSize:11,marginTop:2}}>📞 {c.phone}{c.role?" · "+c.role:""}</div>
                      </div>
                      <div style={{background:"#25D366",borderRadius:10,padding:"6px 12px",
                        color:C.text,fontWeight:700,fontSize:12,flexShrink:0}}>
                        📲 Send
                      </div>
                    </button>
                  ))}
                </>
              )}

              <Btn onClick={()=>setWaSheet(false)} full outline color={C.muted}>Close</Btn>
            </div>
          </Sheet>
        );
      })()}

      {/* ── PARTY BATCH EMAIL SHEET ── */}
      {partyEmailSheet && (
        <Sheet title="📧 Party Confirmation Email" onClose={()=>setPartyEmailSheet(false)}>
          <PartyBatchEmailSheet
            trips={trips}
            setTrips={setTrips}
            log={log}
            onClose={()=>setPartyEmailSheet(false)}
          />
        </Sheet>
      )}

      {/* ── BATCH RECEIPT UPLOAD SHEET ── */}
      {batchReceiptSheet && (
        <Sheet title="📎 Upload Batch Receipt" onClose={()=>setBatchReceiptSheet(null)}>
          <BatchReceiptSheet
            batchId={batchReceiptSheet}
            trips={trips}
            setTrips={setTrips}
            log={log}
            onClose={()=>setBatchReceiptSheet(null)}
          />
        </Sheet>
      )}

      {/* ── SEALED INVOICE SHEET ── */}
      {sealedSheet && (
        <Sheet title="🏷️ Upload Sealed Invoice" onClose={()=>setSealedSheet(null)}>
          <SealedInvoiceSheet
            trip={sealedSheet}
            onMerge={(tripId, sealedPath, mergedPath) => {
              setTrips(prev=>prev.map(t=>t.id===tripId
                ? {...t, sealedInvoicePath:sealedPath, mergedPdfPath:mergedPath,
                    receiptFilePath:sealedPath, receiptUploadedAt:nowTs()}
                : t));
              log("SEALED INVOICE", `LR:${sealedSheet.lrNo} merged`);
              setSealedSheet(null);
            }}
            onClose={()=>setSealedSheet(null)}
          />
        </Sheet>
      )}

      {/* ── ADD SHEET ── */}
      {addSheet && (
        <Sheet title={isIn?"New Raw Material Trip":"New Cement Trip"} onClose={()=>{
          setAddSheet(false);setF(blankForm());setDiConflict(null);setWasScanned(false);
          setOrderTypeStep(null);setPartyStep("docs");setUploadingFiles(false);
          grFileRef.current=[]; invoiceFileRef.current=[];
        }}>

          {/* STEP 0: Order type selection */}
          {orderTypeStep==="selecting" && !isIn && (
            <OrderTypeSelector onSelect={ot=>{
              if(ot==="godown"){
                setOrderTypeStep("godown");
                setF(blankForm(false));
              } else {
                setOrderTypeStep("party");
                setPartyStep("docs");
                setF(blankForm(true));
              }
            }} />
          )}

          {/* STEP 0b: inbound always godown flow */}
          {(orderTypeStep==="godown" || (isIn && orderTypeStep!=="selecting" && orderTypeStep!==null)) && (
            <>
              {diConflict ? (
                diConflict.askLR ? (
                  <AskLRSheet extracted={diConflict.extracted} trips={trips} vehicles={vehicles}
                    onConfirm={onLRConfirmed} onCancel={()=>setDiConflict(null)} />
                ) : (
                  <MergeDISheet conflict={diConflict} onMerge={addDIToExisting}
                    onSeparate={null}
                    onCancel={()=>setDiConflict(null)} isOwner={user.role==="owner"} />
                )
              ) : (
                <>
                  <DIUploader onExtracted={onDIExtracted} trips={trips} settings={settings} isIn={isIn} />
                  {user.role !== "owner" && !wasScanned ? (
                    <div style={{background:C.bg,border:`2px dashed ${C.border}`,borderRadius:14,
                      padding:"28px 20px",textAlign:"center",marginTop:8}}>
                      <div style={{fontSize:32,marginBottom:8}}>📄</div>
                      <div style={{color:C.muted,fontWeight:700,fontSize:14,marginBottom:4}}>Upload GR / DI copy to fill trip details</div>
                      <div style={{color:C.muted,fontSize:12}}>Scan the document above — fields will be filled automatically</div>
                    </div>
                  ) : (
                    <TripForm f={f} ff={ff} isIn={isIn} ac={ac} vehicles={vehicles} settings={settings} employees={employees||[]} cashTransfers={cashTransfers||[]} recentDestinations={recentDestinations} recentGrades={recentGrades}
                      onTruckChange={onTruckChange} onSubmit={saveNew} submitLabel="Save Trip"
                      user={user} wasScanned={wasScanned} />
                  )}
                </>
              )}
            </>
          )}

          {/* STEP 1 (PARTY): Upload GR + Invoice — skippable if files already present */}
          {orderTypeStep==="party" && partyStep==="docs" && (() => {
            const hasGR  = Array.isArray(grFileRef.current)  ? grFileRef.current.length>0  : !!grFileRef.current;
            const hasInv = Array.isArray(invoiceFileRef.current) ? invoiceFileRef.current.length>0 : !!invoiceFileRef.current;
            return (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {/* If files already loaded (e.g. from prior scan), show skip option */}
                {hasGR && hasInv && (
                  <div style={{background:C.green+"11",border:`1px solid ${C.green}33`,borderRadius:10,
                    padding:"12px 14px"}}>
                    <div style={{color:C.green,fontWeight:700,fontSize:13,marginBottom:6}}>
                      ✓ Files already uploaded from scan
                    </div>
                    <div style={{color:C.muted,fontSize:12,marginBottom:10}}>
                      GR: {Array.isArray(grFileRef.current)?grFileRef.current.length:1} file(s) &nbsp;·&nbsp;
                      Invoice: {Array.isArray(invoiceFileRef.current)?invoiceFileRef.current.length:1} file(s)
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <Btn onClick={()=>setPartyStep("form")} full color={C.green}>
                        Continue with these files →
                      </Btn>
                    </div>
                    <div style={{marginTop:8,textAlign:"center"}}>
                      <button onClick={()=>{grFileRef.current=[];invoiceFileRef.current=[];}}
                        style={{background:"none",border:"none",color:C.muted,fontSize:12,
                          cursor:"pointer",textDecoration:"underline"}}>
                        Replace files instead
                      </button>
                    </div>
                  </div>
                )}
                {/* Show upload form if no files yet, or if replacing */}
                {(!hasGR || !hasInv) && (
                  <>
                    <PartyDocUpload
                      tripId={f.id||"new"}
                      grFileRef={grFileRef}
                      invoiceFileRef={invoiceFileRef}
                      onDone={()=>setPartyStep("form")}
                      onBack={()=>setOrderTypeStep("selecting")}
                    />
                    <div style={{textAlign:"center",marginTop:4}}>
                      <button onClick={()=>setPartyStep("form")}
                        style={{background:"none",border:"none",color:C.muted,fontSize:12,
                          cursor:"pointer",textDecoration:"underline"}}>
                        Skip — scan DI first, upload files after
                      </button>
                    </div>
                  </>
                )}
                {/* Back button when files exist but user wants to replace */}
                {hasGR && hasInv && (
                  <Btn onClick={()=>setOrderTypeStep("selecting")} full outline color={C.muted}>← Back</Btn>
                )}
              </div>
            );
          })()}

          {/* STEP 2 (PARTY): Fill trip form — same scan/conflict flow as godown */}
          {orderTypeStep==="party" && partyStep==="form" && (
            <>
              {/* Attached docs indicator */}
              <div style={{display:"flex",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                {(()=>{
                  const grCount  = Array.isArray(grFileRef.current)?grFileRef.current.length:(grFileRef.current?1:0);
                  const invCount = Array.isArray(invoiceFileRef.current)?invoiceFileRef.current.length:(invoiceFileRef.current?1:0);
                  return (<>
                    <div style={{background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:8,
                      padding:"5px 10px",fontSize:11,color:grCount>0?C.green:C.red,fontWeight:700}}>
                      {grCount>0?`✓ GR: ${grCount} file(s)`:"⚠ No GR file"}
                    </div>
                    <div style={{background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:8,
                      padding:"5px 10px",fontSize:11,color:invCount>0?C.blue:C.orange,fontWeight:700}}>
                      {invCount>0?`✓ Inv: ${invCount} file(s)`:"⚠ No Invoice — add after scan"}
                    </div>
                    <button onClick={()=>{setPartyStep("docs");setDiConflict(null);setWasScanned(false);}}
                      style={{background:"none",border:"none",color:C.muted,fontSize:11,cursor:"pointer"}}>
                      ✏ Add/Change files
                    </button>
                  </>);
                })()}
              </div>

              {/* Same DI conflict flow as godown — handles duplicate DI, LR entry, merge */}
              {diConflict ? (
                diConflict.askLR ? (
                  <AskLRSheet extracted={diConflict.extracted} trips={trips} vehicles={vehicles}
                    onConfirm={(lrNo, driverPhone)=>{
                      // Carry party fields through LR confirm
                      onLRConfirmed(lrNo, driverPhone);
                      setF(p=>({...p, orderType:"party",
                        client: detectClient(diConflict.extracted)||p.client||DEFAULT_CLIENT,
                        district:diConflict.extracted.district||p.district||"",
                        state:diConflict.extracted.state||p.state||""}));
                    }}
                    onCancel={()=>setDiConflict(null)} />
                ) : (
                  <MergeDISheet conflict={diConflict} onMerge={addDIToExisting}
                    onSeparate={null}
                    onCancel={()=>setDiConflict(null)} isOwner={user.role==="owner"} />
                )
              ) : (
                <>
                  {/* Scan uploader — goes through same onDIExtracted → AskLRSheet flow */}
                  <DIUploader onExtracted={e=>{
                    // Preserve party orderType and district/state through the scan flow
                    const dc = detectClient(e);
                    setF(p=>({...p, orderType:"party", client:dc,
                      district:e.district||p.district||"",
                      state:e.state||p.state||""}));
                    onDIExtracted(e);
                  }} trips={trips} settings={settings} isIn={false}
                  onFile={file=>{
                    // Auto-capture scanned file into GR ref so user doesn't need to upload twice
                    const cur = Array.isArray(grFileRef.current)?grFileRef.current:[];
                    // Only add if not already present (avoid duplicates on re-scan)
                    if(!cur.some(f=>f.name===file.name&&f.size===file.size)){
                      grFileRef.current=[...cur, file];
                    }
                  }} />

                  {/* Show form only after scan + LR confirmed (wasScanned) or owner */}
                  {(wasScanned || user.role==="owner") ? (
                    <TripForm f={f} ff={ff} isIn={false} ac={C.accent} vehicles={vehicles} settings={settings} employees={employees||[]} cashTransfers={cashTransfers||[]} recentDestinations={recentDestinations} recentGrades={recentGrades}
                      onTruckChange={onTruckChange}
                      onSubmit={async ()=>{
                        // All same validations as godown saveNew
                        if(!f.givenRate||+f.givenRate<=0){alert("Driver Rate ₹/MT is mandatory.\nಡ್ರೈವರ್ ರೇಟ್ ₹/MT ಕಡ್ಡಾಯ.");return;}
                        {
                          const _diLines = f.diLines||[];
                          const _isMulti = _diLines.length > 1;
                          const _minMargin = _isMulti
                            ? Math.min(..._diLines.map(d=>(+(d.frRate||f.frRate)||0)-(+(d.givenRate)||0)))
                            : (+(f.frRate)||0)-(+(f.givenRate)||0);
                          if(_minMargin < 30){
                            alert(`Cannot save: Margin is ₹${_minMargin.toLocaleString("en-IN")}/MT (Shree Rate − Driver Rate). Minimum margin required is ₹30/MT.\n\nಮಾರ್ಜಿನ್ ₹${_minMargin.toLocaleString("en-IN")}/MT — ಕನಿಷ್ಠ ₹30/MT ಬೇಕು. ದರ ಸರಿಪಡಿಸಿ.`);
                            return;
                          }
                        }
                        if((+f.dieselEstimate||0)>0&&!f.dieselIndentNo?.trim()){alert("Diesel Indent No is mandatory when Diesel Estimate is entered.\nಡೀಸೆಲ್ ಅಂದಾಜು ನಮೂದಿಸಿದಾಗ Indent No ಕಡ್ಡಾಯ.");return;}
                        if(f.dieselIndentNo&&f.dieselIndentNo.trim()){
                          if(trips.some(t=>t.dieselIndentNo&&t.dieselIndentNo.trim()===f.dieselIndentNo.trim()))
                            {alert(`Indent No "${f.dieselIndentNo}" already exists on another trip.\nIndent No ಬೇರೆ ಟ್ರಿಪ್‌ನಲ್ಲಿ ಇದೆ.`);return;}
                          if((indents||[]).some(i=>i.indentNo&&String(i.indentNo).trim()===f.dieselIndentNo.trim()))
                            {alert(`Indent No "${f.dieselIndentNo}" already exists in Diesel records.\nIndent No ಡೀಸೆಲ್ ರೆಕಾರ್ಡ್‌ನಲ್ಲಿ ಇದೆ.`);return;}
                        }
                        if(f.lrNo&&f.lrNo.trim()&&trips.some(t=>t.lrNo===f.lrNo.trim()))
                          {alert(`LR "${f.lrNo}" already exists. Each LR must be unique.\nLR "${f.lrNo}" ಈಗಾಗಲೇ ಇದೆ. ಪ್ರತಿ LR ಅನನ್ಯವಾಗಿರಬೇಕು.`);return;}
                        const _gross=(+f.qty||0)*(+f.givenRate||0);
                        const _net=_gross-(+f.advance||0)-(+f.tafal||0)-(+f.dieselEstimate||0)-(+f.shortageRecovery||0)-(+f.loanRecovery||0);
                        if(_net<0){
                          const isOnlyDiesel=(+f.dieselEstimate||0)>0&&(+f.advance||0)===0&&(+f.shortageRecovery||0)===0&&(+f.loanRecovery||0)===0;
                          if(isOnlyDiesel){if(!window.confirm(`Est. Net to Driver is negative (likely diesel spans multiple DIs). Save anyway?`))return;}
                          else{alert("Cannot save: Est. Net to Driver is negative.\nಡ್ರೈವರ್‌ಗೆ ನಿವ್ವಳ ಮೊತ್ತ ಋಣಾತ್ಮಕ — ಸೇವ್ ಸಾಧ್ಯವಿಲ್ಲ.");return;}
                        }
                        if(!f.district||!f.state){alert("District and State are required for Party orders.\nಪಾರ್ಟಿ ಆರ್ಡರ್‌ಗೆ ಜಿಲ್ಲೆ ಮತ್ತು ರಾಜ್ಯ ಕಡ್ಡಾಯ.");return;}
                        // Save directly — email sent separately via Party Email button
                        setUploadingFiles(true);
                        try {
                          const tripId = uid();
                          let grUrl="", invUrl="";
                          // Helper: merge array of Files into one PDF blob (or return single file as-is)
                          const prepareFile = async (files, role) => {
                            if(!files||files.length===0) return null;
                            if(files.length===1) return files[0];
                            // Multiple files — convert each to ArrayBuffer then merge via pdf-lib
                            const { PDFDocument } = await import("pdf-lib");
                            const merged = await PDFDocument.create();
                            for(const f of files) {
                              const buf = await f.arrayBuffer();
                              try {
                                if(f.type==="application/pdf"||f.name?.endsWith(".pdf")) {
                                  const doc = await PDFDocument.load(buf, {ignoreEncryption:true});
                                  const pages = await merged.copyPages(doc, doc.getPageIndices());
                                  pages.forEach(p=>merged.addPage(p));
                                } else {
                                  // Image — embed as full page
                                  const img = f.type==="image/png"
                                    ? await merged.embedPng(buf)
                                    : await merged.embedJpg(buf);
                                  const page = merged.addPage([img.width, img.height]);
                                  page.drawImage(img, {x:0,y:0,width:img.width,height:img.height});
                                }
                              } catch(e) { console.warn("Could not merge file:", f.name, e.message); }
                            }
                            const bytes = await merged.save();
                            return new File([bytes], role+"_merged.pdf", {type:"application/pdf"});
                          };
                          const grFiles  = Array.isArray(grFileRef.current)  ? grFileRef.current  : (grFileRef.current  ? [grFileRef.current]  : []);
                          const invFiles = Array.isArray(invoiceFileRef.current) ? invoiceFileRef.current : (invoiceFileRef.current ? [invoiceFileRef.current] : []);
                          const grReady  = await prepareFile(grFiles,  "gr");
                          const invReady = await prepareFile(invFiles, "invoice");
                          if(grReady)  { const r=await uploadPartyFile(tripId,"gr",grReady);  grUrl=r.path; }
                          if(invReady) { const r=await uploadPartyFile(tripId,"invoice",invReady); invUrl=r.path; }
                          const t = mkTrip({
                            ...f, id:tripId, type:tripType,
                            qty:+f.qty, bags:+f.bags, frRate:+f.frRate, givenRate:+f.givenRate,
                            advance:+f.advance, shortage:+f.shortage, tafal:+f.tafal,
                            shortageRecovery:+f.shortageRecovery||0, loanRecovery:+f.loanRecovery||0,
                            dieselEstimate:+f.dieselEstimate,
                            dieselIndentNo:(f.dieselIndentNo||"").trim(),
                            orderType:"party", district:f.district||"", state:f.state||"",
                            client: f.client||DEFAULT_CLIENT,
                            grFilePath:grUrl, invoiceFilePath:invUrl, mergedPdfPath:"",
                            emailSentAt:"", partyEmail:"", batchId:"", sealedInvoicePath:"",
                            receiptFilePath:"", receiptUploadedAt:"",
                            createdBy:user.username, createdAt:nowTs(),
                          });
                          setTrips(p=>[t,...(p||[])]);
                          log("ADD PARTY TRIP",`LR:${t.lrNo} ${t.truckNo}`);
                          const tn2=(t.truckNo||"").toUpperCase().trim();
                          if(tn2&&!vehicles.find(v=>v.truckNo===tn2)){
                            const nv={id:uid(),truckNo:tn2,ownerName:"",phone:"",driverName:"",driverPhone:"",
                              driverLicense:"",accountNo:"",ifsc:"",loan:0,loanRecovered:0,deductPerTrip:0,
                              tafalExempt:false,shortageOwed:0,shortageRecovered:0,shortageTxns:[],loanTxns:[],createdBy:user.username};
                            setVehicles(p=>[...(p||[]),nv]);
                          }
                          if(tn2&&(t.loanRecovery>0||t.shortageRecovery>0)){
                            setVehicles(prev=>prev.map(veh=>{
                              if(veh.truckNo!==tn2) return veh;
                              let upd={...veh};
                              if(t.loanRecovery>0){const txn={id:uid(),type:"recovery",date:t.date,amount:t.loanRecovery,lrNo:t.lrNo,note:"Party trip"};upd={...upd,loanRecovered:(upd.loanRecovered||0)+t.loanRecovery,loanTxns:[...(upd.loanTxns||[]),txn]};}
                              if(t.shortageRecovery>0){const txn={id:uid(),type:"recovery",date:t.date,qty:0,amount:t.shortageRecovery,lrNo:t.lrNo,note:"Party trip"};upd={...upd,shortageRecovered:(upd.shortageRecovered||0)+t.shortageRecovery,shortageTxns:[...(upd.shortageTxns||[]),txn]};}
                              return upd;
                            }));
                          }
                          setAddSheet(false); setF(blankForm());
                          setOrderTypeStep(null); setPartyStep("docs");
                          grFileRef.current=[]; invoiceFileRef.current=[];
                        } catch(e){ alert("Error saving trip: "+e.message); }
                        finally { setUploadingFiles(false); }
                      }}
                      submitLabel="💾 Save Party Trip"
                      user={user} wasScanned={wasScanned}
                      isParty={true} />
                  ) : (
                    <div style={{background:C.bg,border:`2px dashed ${C.border}`,borderRadius:14,
                      padding:"28px 20px",textAlign:"center",marginTop:8}}>
                      <div style={{fontSize:32,marginBottom:8}}>📄</div>
                      <div style={{color:C.muted,fontWeight:700,fontSize:14,marginBottom:4}}>Scan the GR copy above to fill trip details</div>
                      <div style={{color:C.muted,fontSize:12}}>Fields will be filled automatically from the document</div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Upload progress overlay */}
          {uploadingFiles && (
            <div style={{position:"fixed",inset:0,background:"#000a",zIndex:999,
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
              <div style={{fontSize:36}}>⏳</div>
              <div style={{color:C.text,fontWeight:700,fontSize:16}}>Uploading documents…</div>
              <div style={{color:C.muted,fontSize:13}}>Please wait</div>
            </div>
          )}
        </Sheet>
      )}

      {/* ── DELETE CONFIRM ── */}
      {confirmDel && (
        <Sheet title="Delete Trip" onClose={()=>setConfirmDel(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{background:C.red+"11",border:`1px solid ${C.red}33`,borderRadius:12,padding:"16px"}}>
              <div style={{color:C.red,fontWeight:800,fontSize:15,marginBottom:8}}>⚠ Delete this trip?</div>
              <div style={{color:C.text,fontSize:14,fontWeight:700}}>{confirmDel.truckNo}</div>
              <div style={{color:C.muted,fontSize:13,marginTop:4}}>
                LR: {confirmDel.lrNo||"—"} · DI: {confirmDel.diNo||"—"}
              </div>
              <div style={{color:C.muted,fontSize:13}}>
                {confirmDel.qty}MT → {confirmDel.to} · {confirmDel.date}
              </div>
              <div style={{color:C.red,fontSize:12,marginTop:10,fontWeight:700}}>
                This cannot be undone. All data for this trip will be permanently deleted.
              </div>
            </div>
            <Btn onClick={()=>deleteTrip(confirmDel)} full color={C.red}>
              🗑 Yes, Delete Trip
            </Btn>
            <Btn onClick={()=>setConfirmDel(null)} full outline color={C.muted}>
              Cancel — Keep Trip
            </Btn>
          </div>
        </Sheet>
      )}

      {/* ── EDIT SHEET ── */}
      {editSheet && (
        <Sheet title="Edit Trip" onClose={()=>setEditSheet(null)}>
          <div style={{background:editSheet.driverSettled?C.red+"22":C.orange+"11",
            border:`1px solid ${editSheet.driverSettled?C.red:C.orange}33`,
            borderRadius:10,padding:"9px 12px",
            color:editSheet.driverSettled?C.red:C.orange,fontSize:12,fontWeight:700,marginBottom:14}}>
            {editSheet.driverSettled
              ? "🔒 FROZEN TRIP — Driver payment complete · LR: "+(editSheet.lrNo||"—")+" · "+editSheet.truckNo
              : "Editing trip · LR: "+(editSheet.lrNo||"—")+" · "+editSheet.truckNo}
            {editSheet.driverSettled && user.role==="owner" && (
              <div style={{color:C.muted,fontSize:11,fontWeight:400,marginTop:4}}>
                ⚠ Owner override: changes will update settled amounts
              </div>
            )}
          </div>
          {/* Order type toggle in edit — owner can fix godown↔party */}
          {user.role==="owner" && (
            <div style={{display:"flex",gap:8,marginBottom:4}}>
              {["godown","party"].map(ot=>(
                <button key={ot} onClick={()=>setEditSheet(p=>({...p,orderType:ot}))}
                  style={{flex:1,padding:"10px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:13,
                    background: editSheet.orderType===ot ? (ot==="party"?C.accent+"33":C.teal+"33") : C.bg,
                    border:`2px solid ${editSheet.orderType===ot?(ot==="party"?C.accent:C.teal):C.border}`,
                    color: editSheet.orderType===ot ? (ot==="party"?C.accent:C.teal) : C.muted}}>
                  {ot==="party"?"🤝 Party Order":"🏭 Godown Order"}
                </button>
              ))}
            </div>
          )}
          <TripForm
            f={editSheet}
            ff={k=>v=>setEditSheet(p=>({...p,[k]:v}))}
            isIn={isIn} ac={C.blue} vehicles={vehicles} settings={settings}
            employees={employees||[]} cashTransfers={cashTransfers||[]}
            onTruckChange={v=>{const veh=vehicles.find(x=>x.truckNo===v.toUpperCase().trim()); setEditSheet(p=>({...p,truckNo:v,tafal:veh?.tafalExempt?0:(settings?.tafalPerTrip||300)}));}}
            onSubmit={saveEdit} submitLabel="Save Changes" user={user}
            showStatus={true}
            wasScanned={user.role !== "owner"}
            isParty={editSheet.orderType==="party"}
          />
        </Sheet>
      )}
    </div>
  );
}

// Shared form for add + edit
function TripForm({f, ff, isIn, ac, vehicles, settings, onTruckChange, onSubmit, submitLabel, user, showStatus=false, wasScanned=false, isParty=false, employees=[], cashTransfers=[], recentDestinations=[], recentGrades=[]}) {
  // Ensure each diLine has frRate — migrate from trip-level frRate if missing
  const normalizedDiLines = (f.diLines||[]).map(d => ({...d, frRate: d.frRate || +f.frRate || 0}));
  const fWithLines = normalizedDiLines.length > 1 ? {...f, diLines: normalizedDiLines} : f;
  // Use fWithLines everywhere diLines are rendered
  // Per-DI calculations when multiple DIs exist
  const isMultiDI = normalizedDiLines.length > 1;
  const billedToShree = isMultiDI
    ? normalizedDiLines.reduce((s,d) => s + (d.qty||0)*(d.frRate||0), 0)
    : (+f.qty||0)*(+f.frRate||0);
  const gross = isMultiDI
    ? normalizedDiLines.reduce((s,d) => s + (d.qty||0)*(d.givenRate||0), 0)
    : (+f.qty||0)*(+f.givenRate||0);
  const margin = billedToShree - gross;
  // Per-MT margin check (minimum ₹30 required)
  const perMTMargin = isMultiDI && (+f.qty||0)>0
    ? margin / (+f.qty||0)
    : (+(f.frRate)||0) - (+(f.givenRate)||0);
  const marginOk = perMTMargin >= 30;
  const tafalAmt = +f.tafal||0;
  const net      = gross - (+f.advance||0) - tafalAmt - (+f.dieselEstimate||0);
  const veh      = vehicles.find(x => x.truckNo===(f.truckNo||"").toUpperCase().trim());
  const isOwner  = user?.role === "owner";
  // Fields locked after scan for non-owners
  const locked   = wasScanned && !isOwner;

  // Locked display component
  const LockedField = ({label, value, half=false}) => (
    <div style={{display:"flex",flexDirection:"column",gap:5,flex:half?"1 1 45%":"1 1 100%",minWidth:0}}>
      {label && <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{label}</label>}
      <div style={{background:C.dim,border:`1.5px solid ${C.border}`,borderRadius:10,
        color:C.muted,padding:"13px 12px",fontSize:15,display:"flex",
        justifyContent:"space-between",alignItems:"center"}}>
        <span style={{color:C.text}}>{value||"—"}</span>
        <span style={{fontSize:11,color:C.muted}}>🔒</span>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:13}}>

      {/* Scan lock notice for non-owners */}
      {locked && (
        <div style={{background:C.orange+"11",border:`1px solid ${C.orange}33`,borderRadius:10,
          padding:"9px 14px",color:C.orange,fontSize:12,fontWeight:700}}>
          🔒 Scanned fields are locked — only Owner can edit them
        </div>
      )}

      {/* LR Number - always editable (LR is never on the GR copy, must be entered manually) */}
      <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",border:`1.5px solid ${C.blue}44`}}>
        <div style={{color:C.blue,fontWeight:700,fontSize:12,marginBottom:6}}>📄 LR NUMBER (Lorry Receipt)</div>
        <Field value={f.lrNo||""} onChange={ff("lrNo")} placeholder="e.g. LR/MYE/001 — identifies this trip" />
      </div>

      <div style={{display:"flex",gap:10}}>
        {locked
          ? <LockedField label="Truck No" value={f.truckNo} half />
          : <Field label="Truck No" value={f.truckNo||""} onChange={onTruckChange} placeholder="KA34C4617" half />}
        {locked
          ? <LockedField label="Date" value={f.date} half />
          : <Field label="Date" value={f.date||today()} onChange={ff("date")} type="date" half />}
      </div>
      {veh && (
        <div style={{fontSize:12,color:C.muted,background:C.bg,borderRadius:8,padding:"10px 12px",
          border:`1px solid ${C.border}33`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div><span style={{color:C.muted}}>Owner: </span><b style={{color:C.text}}>{veh.ownerName}</b></div>
              {veh.phone && <div style={{marginTop:2}}><span style={{color:C.muted}}>Phone: </span><b style={{color:C.text}}>{veh.phone}</b></div>}
              {veh.accountNo && <div style={{marginTop:2}}><span style={{color:C.muted}}>A/C: </span><b style={{color:C.blue}}>{veh.accountNo}</b>{veh.ifsc && <span style={{color:C.muted}}> · IFSC: {veh.ifsc}</span>}</div>}
            </div>
            {veh.tafalExempt && <Badge label="TAFAL Exempt" color={C.red} />}
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:10}}>
        {locked
          ? <><LockedField label="DI / Order No" value={f.diNo} half /><LockedField label="GR No" value={f.grNo} half /></>
          : <><Field label="DI / Order No" value={f.diNo||""} onChange={ff("diNo")} placeholder="9003158248" half />
              <Field label="GR No" value={f.grNo||""} onChange={ff("grNo")} placeholder="1070/MYE/2670" half /></>}
      </div>

      {/* Client / Plant selector — always visible, editable even after scan */}
      <div style={{marginBottom:4}}>
        <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>
          Client / Plant *
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {CLIENTS.map(c => (
            <button key={c} onClick={()=>ff("client")(c)}
              style={{padding:"8px 14px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",
                border:`2px solid ${(f.client||DEFAULT_CLIENT)===c?ac:C.border}`,
                background:(f.client||DEFAULT_CLIENT)===c?ac+"22":"none",
                color:(f.client||DEFAULT_CLIENT)===c?ac:C.muted}}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        {locked
          ? <><LockedField label="From" value={f.from} half /><LockedField label="To" value={f.to} half /></>
          : <><Field label="From" value={f.from||""} onChange={ff("from")} half />
              <Field label="To"   value={f.to||""}   onChange={ff("to")}   half /></>}
      </div>
      {/* Recent destination chips */}
      {!locked && !f.to && recentDestinations.length>0 && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:-6}}>
          <span style={{color:C.muted,fontSize:11,alignSelf:"center"}}>Recent:</span>
          {recentDestinations.map(d=>(
            <button key={d} onClick={()=>ff("to")(d)}
              style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,
                padding:"3px 10px",fontSize:11,color:C.text,cursor:"pointer"}}>
              {d}
            </button>
          ))}
        </div>
      )}
      {locked
        ? <LockedField label="Consignee" value={f.consignee} />
        : <Field label="Consignee" value={f.consignee||""} onChange={ff("consignee")} />}
      {locked
        ? <LockedField label="Grade" value={f.grade} />
        : <>
            <Field label="Grade" value={f.grade||""} onChange={ff("grade")}
              opts={isIn ? ["Limestone","Coal","Gypsum","Fly Ash","Slag","Other"].map(x=>({v:x,l:x}))
                         : ["Cement Packed","Cement Bulk","Clinker"].map(x=>({v:x,l:x}))} />
            {/* Recent grade chips */}
            {!f.grade && recentGrades.length>0 && (
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:-6}}>
                <span style={{color:C.muted,fontSize:11,alignSelf:"center"}}>Recent:</span>
                {recentGrades.map(g=>(
                  <button key={g} onClick={()=>ff("grade")(g)}
                    style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,
                      padding:"3px 10px",fontSize:11,color:C.text,cursor:"pointer"}}>
                    {g}
                  </button>
                ))}
              </div>
            )}
          </>}
      <div style={{display:"flex",gap:10}}>
        {locked
          ? <><LockedField label="Qty (MT)" value={f.qty} half /><LockedField label="Bags" value={f.bags} half /></>
          : <><Field label="Qty (MT)" value={f.qty||""} onChange={ff("qty")} type="number" half />
              <Field label="Bags"     value={f.bags||""} onChange={ff("bags")} type="number" half /></>}
      </div>
      {/* Rates — multi-DI: one editable row per DI */}
      {fWithLines.diLines && fWithLines.diLines.length > 1 ? (
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
            Rates per DI
          </div>
          {/* Warn if any diLine is missing its own frRate — old trips saved before per-DI fix */}
          {(f.diLines||[]).some(d=>!d.frRate) && (
            <div style={{background:"#1a1000",border:"1px solid #ff980044",borderRadius:6,
              padding:"7px 10px",marginBottom:10,fontSize:11,color:"#c67c00"}}>
              ⚠ Shree rates below were auto-filled from trip level — please verify each DI rate and save.
            </div>
          )}
          {fWithLines.diLines.map((d,i) => (
            <div key={i} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.border}22`}}>
              <div style={{color:C.blue,fontSize:12,fontWeight:700,marginBottom:6}}>
                DI {d.diNo||`#${i+1}`} · {d.qty} MT · {d.bags} Bags
              </div>
              <div style={{display:"flex",gap:8}}>
                {/* Shree rate — locked for non-owners */}
                {locked
                  ? <LockedField label="Shree Rate ₹/MT" value={d.frRate||f.frRate||"—"} half />
                  : <Field label="Shree Rate ₹/MT" half type="number"
                      value={String(d.frRate||f.frRate||"")}
                      onChange={v => {
                        const lines = f.diLines.map((x,j)=> j===i ? {...x,frRate:+v} : x);
                        ff("diLines")(lines);
                      }} />
                }
                {/* Driver rate — always editable */}
                <Field label="Driver Rate ₹/MT" half type="number"
                  value={String(d.givenRate||"")}
                  onChange={v => {
                    const lines = f.diLines.map((x,j)=> j===i ? {...x,givenRate:+v} : x);
                    ff("diLines")(lines);
                  }} />
              </div>
            </div>
          ))}
          {/* Totals row */}
          <div style={{fontSize:12,color:C.muted,display:"flex",justifyContent:"space-between",marginTop:4}}>
            <span>Shree Rates: <b style={{color:C.blue}}>{fWithLines.diLines.map(d=>d.frRate||"—").join(" + ")}</b></span>
            <span>Driver Rates: <b style={{color:C.orange}}>{fWithLines.diLines.map(d=>d.givenRate||"—").join(" + ")}</b></span>
          </div>
        </div>
      ) : (
        <div style={{display:"flex",gap:10}}>
          {locked
            ? <LockedField label="Shree Rate ₹/MT" value={f.frRate} half />
            : <Field label="Shree Rate ₹/MT"  value={f.frRate||""}    onChange={ff("frRate")}    type="number" half />}
          <div style={{flex:"1 1 45%",minWidth:0,display:"flex",flexDirection:"column",gap:5}}>
            <label style={{color:(!f.givenRate||+f.givenRate<=0)?C.red:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>
              Driver Rate ₹/MT {(!f.givenRate||+f.givenRate<=0) && <span style={{fontSize:10}}>*required</span>}
            </label>
            <input type="text" inputMode="decimal" value={f.givenRate||""} onChange={e=>{const v=e.target.value;if(v===""||/^\d*\.?\d*$/.test(v))ff("givenRate")(v);}}
              style={{background:C.bg,border:`1.5px solid ${(!f.givenRate||+f.givenRate<=0)?C.red:C.border}`,
                borderRadius:10,color:C.text,padding:"13px 12px",fontSize:15,outline:"none",
                width:"100%",boxSizing:"border-box"}} />
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:10}}>
        <Field label="Advance ₹" value={f.advance||""} onChange={ff("advance")} type="number" half />
        <Field label="Shortage Recovery ₹" value={f.shortageRecovery||""} onChange={ff("shortageRecovery")} type="number" half
          note={veh&&(veh.shortageOwed||0)>(veh.shortageRecovered||0)?`Pending: ₹${((veh.shortageOwed||0)-(veh.shortageRecovered||0)).toLocaleString("en-IN")}`:""} />
      </div>
      {+f.advance>0 && (employees||[]).length>0 && (
        <div>
          <label style={{color:C.green,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,display:"block",marginBottom:4}}>💵 Deduct Advance from Employee Wallet</label>
          <select value={f.cashEmpId||""} onChange={e=>ff("cashEmpId")(e.target.value)}
            style={{width:"100%",background:C.bg,border:`1.5px solid ${f.cashEmpId?C.green:C.border}`,
              borderRadius:10,color:f.cashEmpId?C.text:C.muted,padding:"10px 12px",fontSize:13,outline:"none"}}>
            <option value="">— None (no wallet effect) —</option>
            {(employees||[]).map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          {f.cashEmpId && <div style={{color:C.green,fontSize:11,marginTop:4}}>✓ ₹{(+f.advance||0).toLocaleString("en-IN")} will be deducted from {(employees||[]).find(e=>e.id===f.cashEmpId)?.name}'s wallet on save</div>}
        </div>
      )}
      <div style={{display:"flex",gap:10}}>
        <div style={{display:"flex",flexDirection:"column",gap:5,flex:"1 1 100%",minWidth:0}}>
          <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Loan Recovery ₹</label>
          {(()=>{
            const loanBal = veh ? Math.max(0,(veh.loan||0)-(veh.loanRecovered||0)) : null;
            const overLimit = loanBal !== null && (+f.loanRecovery||0) > loanBal;
            return (<>
              <input type="text" inputMode="decimal" value={f.loanRecovery===undefined||f.loanRecovery===null?"":String(f.loanRecovery)}
                onChange={e=>{
                  const raw = e.target.value;
                  if(raw !== "" && !/^\d*\.?\d*$/.test(raw)) return; // block non-numeric, negatives
                  // Only clamp against loanBal when user finishes typing (on blur), not on every keystroke
                  ff("loanRecovery")(raw);
                }}
                onBlur={e=>{
                  const val = parseFloat(e.target.value)||0;
                  if(loanBal !== null && val > loanBal) ff("loanRecovery")(String(loanBal));
                }}
                style={{background:C.bg,border:`1.5px solid ${overLimit?C.red:C.border}`,borderRadius:10,color:C.text,padding:"13px 12px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box",MozAppearance:"textfield",WebkitAppearance:"none"}} />
              {loanBal !== null && loanBal > 0 && (
                <div style={{color:overLimit?C.red:C.muted,fontSize:11}}>
                  {overLimit ? `⚠ Max allowed: ₹${loanBal.toLocaleString("en-IN")}` : `Pending: ₹${loanBal.toLocaleString("en-IN")}`}
                </div>
              )}
              {loanBal !== null && loanBal === 0 && (
                <div style={{color:C.green,fontSize:11}}>✓ Loan fully cleared</div>
              )}
            </>);
          })()}
        </div>

      </div>
      {isParty && (
        <div style={{background:C.accent+"11",border:`1px solid ${C.accent}33`,borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:C.accent,fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
            🤝 Party Order — Destination Details (for confirmation email)
          </div>
          <div style={{display:"flex",gap:10}}>
            <Field label="District *" value={f.district||""} onChange={ff("district")} placeholder="e.g. Pune" half />
            <Field label="State *"    value={f.state||""}    onChange={ff("state")}    placeholder="e.g. Maharashtra" half />
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:10}}>
        <Field label="TAFAL ₹" value={f.tafal||""} onChange={ff("tafal")} type="number" half
          placeholder="0" note={veh?.tafalExempt?"This vehicle is exempt":""} />
        <Field label="Diesel Estimate ₹" value={f.dieselEstimate||""} onChange={ff("dieselEstimate")} type="number" half
          note="Driver's estimate (update later via Indent)" placeholder="0" />
      </div>
      <Field label="⛽ Diesel Indent No"
        value={f.dieselIndentNo||""} onChange={ff("dieselIndentNo")}
        placeholder="e.g. 25748 — from pump slip before loading"
        note="Pump gives this before loading — used to match diesel slip" />
      {showStatus && (
        user?.role==="owner"
          ? <Field label="Status" value={f.status||"Pending Bill"} onChange={ff("status")}
              opts={["Pending Bill","Billed","Paid"].map(x=>({v:x,l:x}))} />
          : <div style={{display:"flex",flexDirection:"column",gap:5}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Status</label>
              <div style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:10,
                color:C.muted,padding:"13px 12px",fontSize:15,display:"flex",
                justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:C.text}}>{f.status||"Pending Bill"}</span>
                <span style={{fontSize:11,color:C.muted}}>🔒 Owner only</span>
              </div>
            </div>
      )}

      {/* Live calc */}
      {f.qty && (f.frRate || isMultiDI) && (f.givenRate || isMultiDI) && (
        <div style={{background:C.bg,borderRadius:12,padding:"12px 14px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Calculation Preview</div>
          {[
            {l:"Billed to Shree",            v:fmt(billedToShree),                      c:C.blue},
            {l:"Gross to Driver",             v:fmt(gross),                              c:C.orange},
            {l:"(−) Advance",                 v:fmt(+f.advance||0),                     c:C.red},
            {l:"(−) TAFAL",                   v:fmt(tafalAmt),                           c:C.purple},
            {l:"(−) Diesel (estimate)",       v:fmt(+f.dieselEstimate||0),              c:C.orange},
            {l:"(−) Shortage Recovery",       v:fmt(+f.shortageRecovery||0),            c:(+f.shortageRecovery||0)>0?C.red:C.muted},
            {l:"(−) Loan Recovery",           v:fmt(+f.loanRecovery||0),               c:(+f.loanRecovery||0)>0?C.red:C.muted},
            {l:marginOk?"My Margin ✓":"⚠ Margin", v:`${fmt(margin)} (₹${perMTMargin.toFixed(0)}/MT)`, c:marginOk?C.green:C.red},
            {l:"Est. Net to Driver",          v:fmt(net-(+f.shortageRecovery||0)-(+f.loanRecovery||0)),  c:(net-(+f.shortageRecovery||0)-(+f.loanRecovery||0))>=0?C.green:C.red},
          ].map(x => (
            <div key={x.l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}22`}}>
              <span style={{color:C.muted,fontSize:13}}>{x.l}</span>
              <span style={{color:x.c,fontWeight:700,fontSize:13}}>{x.v}</span>
            </div>
          ))}
          {!marginOk && (+(f.frRate)||0)>0 && (+(f.givenRate)||0)>0 && (
            <div style={{background:C.red+"22",border:`1.5px solid ${C.red}`,borderRadius:8,
              padding:"10px 12px",marginTop:8,color:C.red,fontSize:13,fontWeight:700,
              display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>⛔</span>
              <span>Margin ₹{perMTMargin.toFixed(0)}/MT — minimum ₹30/MT required<br/>
                <span style={{fontSize:11,fontWeight:400,color:C.red,opacity:0.8}}>ಮಾರ್ಜಿನ್ ₹{perMTMargin.toFixed(0)}/MT — ಕನಿಷ್ಠ ₹30/MT ಬೇಕು</span>
              </span>
            </div>
          )}
          <div style={{color:C.muted,fontSize:11,marginTop:8}}>Note: Loan deduction & confirmed diesel will apply at settlement</div>
        </div>
      )}

      <div style={{color:C.muted,fontSize:12}}>Recording as: <b style={{color:ROLES[user.role]?.color}}>{user.name}</b></div>
      <Btn onClick={onSubmit} full color={ac}>{submitLabel}</Btn>
    </div>
  );
}

// ─── BILLING ──────────────────────────────────────────────────────────────────
function Billing({trips, setTrips, user, log}) {
  const pending = trips.filter(t => t.status==="Pending Bill");
  const billed  = trips.filter(t => t.status==="Billed");
  const paid    = trips.filter(t => t.status==="Paid");
  const [orderFilter, setOrderFilter] = useState("All"); // "All" | "godown" | "party"

  // Apply order type filter to pending
  const filteredPending = orderFilter==="All" ? pending
    : orderFilter==="party"  ? pending.filter(t=>t.orderType==="party")
    : pending.filter(t=>!t.orderType||t.orderType==="godown");

  // Totals by type
  const godownPending = pending.filter(t=>!t.orderType||t.orderType==="godown");
  const partyPending  = pending.filter(t=>t.orderType==="party");
  const godownTotal   = godownPending.reduce((s,t)=>s+t.qty*(t.frRate||0),0);
  const partyTotal    = partyPending.reduce((s,t)=>s+t.qty*(t.frRate||0),0);

  // Group billed trips by invoice number
  const invoiceGroups = {};
  billed.forEach(t => {
    if (!invoiceGroups[t.invoiceNo]) invoiceGroups[t.invoiceNo] = [];
    invoiceGroups[t.invoiceNo].push(t);
  });

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{color:C.blue,fontWeight:800,fontSize:16}}>🧾 Billing</div>

      {/* Flow guide */}
      <div style={{background:C.card,borderRadius:12,padding:"12px 14px"}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>How Billing Works</div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {[
            {l:"① Add Trip",c:C.accent},{l:"→",c:C.muted},
            {l:"② Upload Invoice in Shree Payments",c:C.blue},{l:"→",c:C.muted},
            {l:"③ Shree Pays → record Payment Advice",c:C.green},
          ].map((x,i)=>x.l==="→"
            ?<span key={i} style={{color:C.muted,fontSize:14}}>→</span>
            :<div key={i} style={{background:x.c+"22",border:`1px solid ${x.c}44`,borderRadius:8,padding:"4px 9px",fontSize:11,fontWeight:700,color:x.c}}>{x.l}</div>
          )}
        </div>
      </div>

      {/* Split totals — godown vs party */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <div style={{background:C.card,borderRadius:12,padding:"12px 14px",borderTop:`3px solid ${C.accent}`}}>
          <div style={{color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>⚠ Pending</div>
          <div style={{color:C.accent,fontWeight:900,fontSize:20,marginTop:4}}>{pending.length}</div>
          <div style={{color:C.muted,fontSize:11,marginTop:2}}>{fmt(pending.reduce((s,t)=>s+t.qty*(t.frRate||0),0))}</div>
        </div>
        <div style={{background:C.card,borderRadius:12,padding:"12px 14px",borderTop:`3px solid ${C.blue}`}}>
          <div style={{color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>🧾 Billed</div>
          <div style={{color:C.blue,fontWeight:900,fontSize:20,marginTop:4}}>{billed.length}</div>
          <div style={{color:C.muted,fontSize:11,marginTop:2}}>{fmt(billed.reduce((s,t)=>s+t.qty*(t.frRate||0),0))}</div>
        </div>
        <div style={{background:C.card,borderRadius:12,padding:"12px 14px",borderTop:`3px solid ${C.green}`}}>
          <div style={{color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>✅ Paid</div>
          <div style={{color:C.green,fontWeight:900,fontSize:20,marginTop:4}}>{paid.length}</div>
          <div style={{color:C.muted,fontSize:11,marginTop:2}}>{fmt(paid.reduce((s,t)=>s+t.qty*(t.frRate||0),0))}</div>
        </div>
      </div>

      {/* Godown vs Party unbilled totals */}
      {pending.length > 0 && (godownPending.length>0 && partyPending.length>0) && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div style={{background:C.card,borderRadius:10,padding:"10px 14px",borderLeft:`4px solid ${C.blue}`}}>
            <div style={{color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>🏭 Godown Unbilled</div>
            <div style={{color:C.blue,fontWeight:800,fontSize:16,marginTop:2}}>{godownPending.length} trips</div>
            <div style={{color:C.accent,fontWeight:700,fontSize:14}}>{fmt(godownTotal)}</div>
          </div>
          <div style={{background:C.card,borderRadius:10,padding:"10px 14px",borderLeft:`4px solid ${C.accent}`}}>
            <div style={{color:C.muted,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>🤝 Party Unbilled</div>
            <div style={{color:C.accent,fontWeight:800,fontSize:16,marginTop:2}}>{partyPending.length} trips</div>
            <div style={{color:C.accent,fontWeight:700,fontSize:14}}>{fmt(partyTotal)}</div>
          </div>
        </div>
      )}

      {/* Pending trips — filter + read-only list */}
      {pending.length > 0 && (
        <div>
          <div style={{background:C.accent+"11",border:`1px solid ${C.accent}33`,borderRadius:10,
            padding:"9px 12px",color:C.accent,fontSize:12,fontWeight:700,marginBottom:10}}>
            Upload the invoice in Shree Payments tab → trips will be marked Billed automatically
          </div>

          {/* Filter pills */}
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
            {[
              {id:"All",   label:"All ("+pending.length+")"},
              {id:"godown",label:"🏭 Godown ("+godownPending.length+")"},
              {id:"party", label:"🤝 Party ("+partyPending.length+")"},
            ].map(tab=>(
              <button key={tab.id} onClick={()=>setOrderFilter(tab.id)}
                style={{padding:"5px 12px",borderRadius:16,fontSize:12,fontWeight:700,cursor:"pointer",
                  border:`1.5px solid ${orderFilter===tab.id?C.blue:C.border}`,
                  background:orderFilter===tab.id?C.blue+"22":"none",
                  color:orderFilter===tab.id?C.blue:C.muted}}>
                {tab.label}
              </button>
            ))}
          </div>

          {filteredPending.length===0 && (
            <div style={{textAlign:"center",color:C.muted,padding:"20px 0",fontSize:13}}>
              No {orderFilter==="godown"?"godown":orderFilter==="party"?"party":""} trips pending billing
            </div>
          )}

          {filteredPending.map(t => (
            <div key={t.id} style={{background:C.card,border:`1px solid ${C.border}`,
              borderRadius:14,padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:800,fontSize:14}}>{t.truckNo}
                    {t.orderType==="party" && <span style={{fontSize:10,color:C.accent,fontWeight:700,marginLeft:6,background:C.accent+"22",borderRadius:6,padding:"1px 5px"}}>🤝 Party</span>}
                  </div>
                  <div style={{color:C.blue,fontSize:12}}>LR: {t.lrNo||"—"} · GR: {t.grNo||"—"}</div>
                  <div style={{color:C.muted,fontSize:11}}>{t.from}→{t.to} · {t.qty}MT · {t.date}</div>
                  <div style={{color:C.muted,fontSize:11}}>DI: {t.diNo||"—"} · {t.grade} · {t.bags} bags</div>
                  <div style={{color:ROLES[t.createdBy]?.color||C.muted,fontSize:11,marginTop:2}}>by {t.createdBy} · {t.createdAt}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{color:C.green,fontWeight:800,fontSize:15}}>{fmt(t.qty*(t.frRate||0))}</div>
                  <div style={{color:C.muted,fontSize:10}}>{t.qty}MT × ₹{t.frRate}</div>
                  {t.shortage>0 && <Badge label={"⚠ "+t.shortage+"MT short"} color={C.red} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Billed invoices grouped */}
      {Object.keys(invoiceGroups).length > 0 && (
        <div>
          <div style={{color:C.blue,fontWeight:700,fontSize:13,marginBottom:8}}>Billed Invoices — Awaiting Payment</div>
          {Object.entries(invoiceGroups).map(([inv, ts]) => (
            <div key={inv} style={{background:C.card,borderRadius:14,padding:"14px 16px",marginBottom:10,borderLeft:`4px solid ${C.blue}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{color:C.blue,fontWeight:800,fontSize:14}}>{inv}</div>
                  <div style={{color:C.muted,fontSize:12}}>{ts.length} trips · by {ts[0].billedBy||"—"}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:C.green,fontWeight:800,fontSize:16}}>{fmt(ts.reduce((s,t)=>s+t.qty*(t.frRate||0),0))}</div>
                  <Badge label="Awaiting Payment" color={C.orange} />
                </div>
              </div>
              {ts.map(t => (
                <div key={t.id} style={{background:C.bg,borderRadius:8,padding:"8px 10px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <span style={{fontWeight:700,fontSize:13}}>{t.truckNo}</span>
                    <span style={{color:C.muted,fontSize:11,marginLeft:8}}>LR:{t.lrNo||"—"} · {t.to} · {t.qty}MT</span>
                  </div>
                  <span style={{color:C.blue,fontWeight:700}}>{fmt(t.qty*(t.frRate||0))}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Paid */}
      {paid.length > 0 && (
        <div>
          <div style={{color:C.green,fontWeight:700,fontSize:13,marginBottom:8}}>✅ Paid ({paid.length})</div>
          {paid.map(t => (
            <div key={t.id} style={{background:C.card,borderRadius:12,padding:"10px 14px",marginBottom:6,borderLeft:`4px solid ${C.green}`,display:"flex",justifyContent:"space-between"}}>
              <div>
                <span style={{fontWeight:700}}>{t.truckNo}</span>
                <span style={{color:C.muted,fontSize:11,marginLeft:8}}>LR:{t.lrNo||"—"} · {t.invoiceNo}</span>
              </div>
              <span style={{color:C.green,fontWeight:800}}>{fmt(t.qty*(t.frRate||0))}</span>
            </div>
          ))}
        </div>
      )}

      {pending.length===0 && billed.length===0 && paid.length===0 && (
        <div style={{textAlign:"center",color:C.muted,padding:40}}>No trips yet — add trips first from the Trips tab</div>
      )}
    </div>
  );
}

// ─── SETTLEMENT ───────────────────────────────────────────────────────────────
function Settlement({trips, setTrips, vehicles, setVehicles, settlements, setSettlements, indents, user, log}) {
  const [sel, setSel]   = useState(null);
  const [notes, setNotes] = useState("");
  const unsettled = trips.filter(t => !t.driverSettled);

  const settle = t => {
    const v = vehicles.find(x => x.truckNo===t.truckNo);
    const tripIndents = indents.filter(i => i.tripId===t.id && i.confirmed);
    const confirmedDiesel = tripIndents.reduce((s,i) => s+(i.amount||0), 0);
    const calc = calcNet(t, v, confirmedDiesel > 0 ? confirmedDiesel : (t.dieselEstimate||0));
    const s = {id:uid(), tripId:t.id, date:today(), truckNo:t.truckNo, lrNo:t.lrNo, grNo:t.grNo, to:t.to, qty:t.qty, givenRate:t.givenRate, ownerName:v?.ownerName||"—", notes, settledBy:user.username, settledAt:nowTs(), ...calc};
    setSettlements(p => [s, ...(p||[])]);
    setTrips(p => p.map(x => x.id===t.id ? {...x, driverSettled:true, settledBy:user.username, netPaid:calc.net} : x));
    // Update vehicle ledger on settlement
    if (v) setVehicles(p => p.map(x => {
      if (x.truckNo!==t.truckNo) return x;
      let updated = {...x};
      const settleDate = today();
      // Loan deduct per trip
      if (calc.loanDeduct>0) {
        const txn = {id:uid(),type:"recovery",date:settleDate,amount:calc.loanDeduct,lrNo:t.lrNo,note:"Auto — deduct/trip at settlement"};
        updated = {...updated, loanRecovered:(updated.loanRecovered||0)+calc.loanDeduct, loanTxns:[...(updated.loanTxns||[]),txn]};
      }
      // Explicit shortage recovery on this trip
      if (calc.shortageRecovery>0) {
        const txn = {id:uid(),type:"recovery",date:settleDate,mt:0,amount:calc.shortageRecovery,lrNo:t.lrNo,note:"Shortage recovery at settlement"};
        updated = {...updated, shortageRecovered:(updated.shortageRecovered||0)+calc.shortageRecovery, shortageTxns:[...(updated.shortageTxns||[]),txn]};
      }
      // Explicit loan recovery on this trip
      if (calc.loanRecovery>0) {
        const txn = {id:uid(),type:"recovery",date:settleDate,amount:calc.loanRecovery,lrNo:t.lrNo,note:"Loan recovery at settlement"};
        updated = {...updated, loanRecovered:(updated.loanRecovered||0)+calc.loanRecovery, loanTxns:[...(updated.loanTxns||[]),txn]};
      }
      return updated;
    }));
    log("SETTLEMENT", `LR:${t.lrNo} ${t.truckNo} — Net ${fmt(calc.net)}`);
    setSel(null); setNotes("");
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{color:C.green,fontWeight:800,fontSize:16}}>💵 Driver Settlement</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <KPI icon="⏳" label="Pending"    value={unsettled.length}                                    color={C.accent} />
        <KPI icon="✅" label="Total Paid" value={fmt(settlements.reduce((s,x)=>s+(x.net||0),0))} color={C.green} />
      </div>

      {sel && (()=>{
        const v = vehicles.find(x => x.truckNo===sel.truckNo);
        const tripIndents = indents.filter(i => i.tripId===sel.id && i.confirmed);
        const confirmedDiesel = tripIndents.reduce((s,i)=>s+(i.amount||0),0);
        const usingConfirmed  = confirmedDiesel > 0;
        const calc = calcNet(sel, v, usingConfirmed ? confirmedDiesel : (sel.dieselEstimate||0));
        return (
          <Sheet title={`Settle — ${sel.truckNo}`} onClose={()=>setSel(null)}>
            <div style={{display:"flex",flexDirection:"column",gap:11}}>
              <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",fontSize:13}}>
                <div><span style={{color:C.muted}}>LR: </span><b style={{color:C.blue}}>{sel.lrNo||"—"}</b></div>
                <div><span style={{color:C.muted}}>Route: </span><b>{sel.from}→{sel.to}</b></div>
                <div><span style={{color:C.muted}}>Owner: </span><b>{v?.ownerName||"—"}</b></div>
                <div><span style={{color:C.muted}}>Qty: </span><b>{sel.qty}MT @ {fmt(sel.givenRate)}/MT</b></div>
              </div>
              {[
                {l:"Gross Pay (Qty × Driver Rate)",           v:calc.gross,              c:C.green,  s:""},
                {l:"(−) Advance Given",                         v:calc.advance,            c:C.red,    s:"−"},
                {l:"(−) TAFAL",                                 v:calc.tafal,              c:C.purple, s:"−"},
                {l:"(−) Loan Deduction / Trip",                 v:calc.loanDeduct,         c:C.red,    s:"−"},
                {l:`(−) Diesel ${usingConfirmed?"(confirmed indents)":"(estimate)"}`,      v:calc.diesel,  c:C.orange, s:"−"},
                {l:"(−) Shortage Recovery (Shree deduction)",   v:calc.shortageRecovery,   c:calc.shortageRecovery>0?C.red:C.muted, s:"−"},
                {l:"(−) Loan Recovery (trip deduction)",        v:calc.loanRecovery,       c:calc.loanRecovery>0?C.red:C.muted, s:"−"},
              ].map(r => (
                <div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.muted,fontSize:13}}>{r.l}</span>
                  <span style={{color:r.c,fontWeight:700}}>{r.s} {fmt(r.v)}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0"}}>
                <span style={{fontWeight:800,fontSize:16}}>NET CASH TO PAY</span>
                <span style={{color:calc.net>=0?C.green:C.red,fontWeight:900,fontSize:22}}>{fmt(calc.net)}</span>
              </div>
              {!usingConfirmed && sel.dieselEstimate>0 && (
                <div style={{background:C.orange+"11",border:`1px solid ${C.orange}33`,borderRadius:8,padding:"8px 10px",color:C.orange,fontSize:12}}>
                  ⚠ Using diesel estimate. Confirm indents in Diesel module for accurate figure.
                </div>
              )}
              <Field label="Notes" value={notes} onChange={setNotes} placeholder="Cash / bank transfer / cheque…" />
              <Btn onClick={()=>settle(sel)} full color={C.green}>✓ Mark Settled — {fmt(calc.net)}</Btn>
            </div>
          </Sheet>
        );
      })()}

      {unsettled.map(t => {
        const v = vehicles.find(x=>x.truckNo===t.truckNo);
        const calc = calcNet(t, v, null);
        return (
          <div key={t.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",borderLeft:`4px solid ${C.accent}`,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <div>
                <div style={{fontWeight:800,fontSize:15}}>{t.truckNo}</div>
                <div style={{color:C.blue,fontSize:12}}>LR: {t.lrNo||"—"}</div>
                <div style={{color:C.muted,fontSize:11}}>{t.from}→{t.to} · {t.qty}MT · {t.date}</div>
                <div style={{color:ROLES[t.createdBy]?.color||C.muted,fontSize:11}}>by {t.createdBy}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:calc.net>=0?C.green:C.red,fontWeight:800,fontSize:17}}>{fmt(calc.net)}</div>
                <div style={{color:C.muted,fontSize:11}}>est. net</div>
              </div>
            </div>
            <Btn onClick={()=>setSel(t)} full color={C.green} sm>Settle This Trip</Btn>
          </div>
        );
      })}
      {unsettled.length===0 && <div style={{textAlign:"center",color:C.muted,padding:40}}>All trips settled ✓</div>}

      {settlements.length>0 && (
        <div style={{marginTop:6}}>
          <div style={{color:C.muted,fontWeight:700,fontSize:13,marginBottom:8}}>Settlement History ({settlements.length})</div>
          {settlements.slice(0,10).map(s => (
            <div key={s.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",marginBottom:7,borderLeft:`4px solid ${C.green}`,display:"flex",justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:700}}>{s.truckNo} <span style={{color:C.muted,fontWeight:400,fontSize:12}}>LR:{s.lrNo||"—"}</span></div>
                <div style={{color:C.muted,fontSize:11}}>{s.to} · {s.date} · by {s.settledBy}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:C.green,fontWeight:800}}>{fmt(s.net||0)}</div>
                <div style={{color:C.muted,fontSize:11}}>paid</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TAFAL MODULE ─────────────────────────────────────────────────────────────
function TafalMod({trips, vehicles, setVehicles, employees, settings, setSettings, user}) {
  const [month, setMonth] = useState(today().slice(0,7));
  const tafalRate = settings?.tafalPerTrip || 300;

  const monthTrips  = trips.filter(t => t.date.startsWith(month) && t.tafal>0);
  const collected   = monthTrips.reduce((s,t) => s+(t.tafal||0), 0);
  const activeEmps  = employees.length || 1;
  const perEmployee = activeEmps>0 ? collected/activeEmps : 0;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{color:C.purple,fontWeight:800,fontSize:16}}>🤝 TAFAL</div>
      <div style={{background:C.card,borderRadius:12,padding:"12px 14px",color:C.muted,fontSize:13}}>
        TAFAL is a fixed amount deducted per trip from the driver and distributed equally among all employees every month.
      </div>

      {/* Global rate setting */}
      <div style={{background:C.card,borderRadius:12,padding:"14px 16px"}}>
        <div style={{color:C.muted,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Global TAFAL Rate</div>
        <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
          <Field label="₹ Per Trip (all vehicles)" value={String(tafalRate)} onChange={v=>setSettings(p=>({...(p||{}),tafalPerTrip:+v}))} type="number" />
          <div style={{color:C.muted,fontSize:12,paddingBottom:14}}>applies to new trips</div>
        </div>
      </div>



      <Field label="Select Month" value={month} onChange={setMonth} type="month" />

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <KPI icon="🤝" label="Collected" value={fmt(collected)} color={C.purple} sub={`${monthTrips.length} trips`} />
        <KPI icon="👤" label="Per Employee" value={fmt(perEmployee)} color={C.green} sub={`÷ ${activeEmps} employees`} />
      </div>

      {/* Trip breakdown */}
      <div>
        <div style={{color:C.muted,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>TAFAL Collected — {month}</div>
        {monthTrips.length===0
          ? <div style={{textAlign:"center",color:C.muted,padding:24}}>No TAFAL collected this month</div>
          : monthTrips.map(t => (
            <div key={t.id} style={{background:C.card,borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700}}>{t.truckNo}</div>
                <div style={{color:C.blue,fontSize:12}}>LR: {t.lrNo||"—"} · {t.date}</div>
              </div>
              <div style={{color:C.purple,fontWeight:800}}>{fmt(t.tafal)}</div>
            </div>
          ))
        }
      </div>

      {/* Distribution table */}
      <div style={{background:C.card,borderRadius:12,padding:"14px 16px"}}>
        <div style={{color:C.muted,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Monthly Distribution</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:10}}>{fmt(collected)} ÷ {activeEmps} = <b style={{color:C.green}}>{fmt(perEmployee)} each</b></div>
        {employees.map(e => (
          <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}22`}}>
            <div>
              <div style={{fontWeight:700}}>{e.name}</div>
              <div style={{color:C.muted,fontSize:12}}>{e.role}</div>
            </div>
            <div style={{color:C.green,fontWeight:800,fontSize:16}}>{fmt(perEmployee)}</div>
          </div>
        ))}
        {employees.length===0 && <div style={{color:C.muted,fontSize:13}}>No employees added yet</div>}
      </div>

      {/* Exemptions per vehicle */}
      <div>
        <div style={{color:C.muted,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Vehicle Exemptions</div>
        {vehicles.map(v => (
          <div key={v.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700}}>{v.truckNo}</div>
              <div style={{color:C.muted,fontSize:12}}>{v.ownerName}</div>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <Badge label={v.tafalExempt?"Exempt":`₹${tafalRate}/trip`} color={v.tafalExempt?C.muted:C.purple} />
              <button onClick={()=>setVehicles(p=>p.map(x=>x.id===v.id?{...x,tafalExempt:!x.tafalExempt}:x))}
                style={{background:v.tafalExempt?C.dim:C.purple+"22",border:`1px solid ${v.tafalExempt?C.border:C.purple}`,color:v.tafalExempt?C.muted:C.purple,borderRadius:8,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {v.tafalExempt?"Enable":"Exempt"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PUMP ROW (extracted to allow useState) ───────────────────────────────────
function PumpRow({p, paid, onPayAll}) {
  const [showRef, setShowRef] = useState(false);
  const [ref, setRef] = useState("");
  const paidCount = paid.filter(i=>i.pumpId===p.id).length;
  return (
    <div style={{background:C.card,borderRadius:14,padding:"14px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
        <div>
          <div style={{fontWeight:800,fontSize:15}}>{p.name}</div>
          <div style={{color:C.muted,fontSize:12}}>{p.contact} · {p.address}</div>
          {p.accountNo && <div style={{color:C.blue,fontSize:12}}>A/C: {p.accountNo} · IFSC: {p.ifsc}</div>}
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{color:p.unpaidAmt>0?C.red:C.green,fontWeight:800,fontSize:16}}>{fmt(p.unpaidAmt)}</div>
          <div style={{color:C.muted,fontSize:11}}>pending</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
        {[{l:"Total",v:p.unpaid.length+paidCount,c:C.text},{l:"Unpaid",v:p.unpaid.length,c:C.red},{l:"Paid",v:paidCount,c:C.green}].map(x=>(
          <div key={x.l} style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}>
            <div style={{color:x.c,fontWeight:700}}>{x.v}</div>
            <div style={{color:C.muted,fontSize:10}}>{x.l}</div>
          </div>
        ))}
      </div>
      {p.unpaidAmt>0 && !showRef && <Btn onClick={()=>setShowRef(true)} sm full outline color={C.green}>Pay All Pending — {fmt(p.unpaidAmt)}</Btn>}
      {p.unpaidAmt>0 && showRef && (
        <div style={{display:"flex",gap:8,marginTop:6}}>
          <div style={{flex:1}}><Field value={ref} onChange={setRef} placeholder="Payment ref / UTR" /></div>
          <Btn onClick={()=>{onPayAll(p.id,ref);setShowRef(false);setRef("");}} sm color={C.green}>Confirm</Btn>
        </div>
      )}
    </div>
  );
}




// ─── DIESEL ALERT BANNER ──────────────────────────────────────────────────────
function DieselAlertBanner({ alerts, trips, indents, user, onLink, onDismiss, onDelete }) {
  const [expandedId, setExpandedId] = useState(null);
  const [linkTripId,  setLinkTripId]  = useState("");
  const [dismissReason, setDismissReason] = useState("");
  const [lrSearch, setLrSearch] = useState("");

  const sendWhatsApp = (alert) => {
    const type = alert.truckMismatch ? "TRUCK MISMATCH" : alert.amountMismatch ? "AMOUNT MISMATCH" : "NO TRIP FOUND";
    const amtDetail = alert.amountMismatch
      ? `\nHSD ₹${alert.amount} + Adv ₹${(alert.pumpTotal||0)-(alert.amount||0)} = ₹${alert.pumpTotal} | Est: ₹${alert.estDiesel} | Diff: ₹${Math.abs((alert.pumpTotal||0)-(alert.estDiesel||0))}`
      : "";
    const msg  = `🚨 DIESEL ALERT [${type}]\nIndent: ${alert.indentNo||"—"} · Truck: ${alert.truckNo}\nDate: ${alert.date}${amtDetail}\nPlease check with employees immediately.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{background:C.red+"11",border:`2px solid ${C.red}55`,borderRadius:12,padding:"12px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
          <div>
            <div style={{color:C.red,fontWeight:800,fontSize:14,marginBottom:2}}>
              🚨 {alerts.length} Diesel Alert{alerts.length>1?"s":""} Require Action
            </div>
            <div style={{color:C.muted,fontSize:12}}>
              Tap each alert to link to a trip or dismiss with reason
            </div>
          </div>
          <Btn onClick={()=>{
            const lines = alerts.map(a => {
              const type = a.truckMismatch ? "Truck Mismatch" : a.amountMismatch ? "Amount Mismatch" : "No Trip";
              const amtInfo = a.amountMismatch ? ` (Pump ₹${a.pumpTotal} ≠ Est ₹${a.estDiesel})` : "";
              return `• ${a.truckNo} | Indent: ${a.indentNo||"—"} | ₹${a.amount}${amtInfo} | ${type}`;
            }).join("\n");
            const msg = `🚨 DIESEL ALERTS — ${new Date().toLocaleDateString("en-IN")}\n\n${lines}\n\nPlease resolve with employees.`;
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
          }} sm outline color={C.red}>📱 All</Btn>
        </div>
      </div>

      {alerts.map(alert => (
        <div key={alert.id} style={{background:C.card,borderRadius:12,overflow:"hidden",
          border:`2px solid ${C.red}44`}}>
          {/* Alert header */}
          <div style={{padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}
            onClick={() => setExpandedId(expandedId===alert.id ? null : alert.id)}>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                <span style={{background:C.red,color:"#fff",fontSize:10,fontWeight:800,
                  padding:"2px 8px",borderRadius:20}}>
                  {alert.truckMismatch ? "TRUCK MISMATCH" : alert.amountMismatch ? "AMOUNT MISMATCH" : "NO TRIP"}
                </span>
                <span style={{color:C.muted,fontSize:11}}>{alert.date}</span>
              </div>
              <div style={{fontWeight:800,fontSize:14}}>{alert.truckNo}</div>
              <div style={{color:C.muted,fontSize:12}}>Indent: {alert.indentNo||"—"}</div>
              {alert.truckMismatch && alert.tripId && (
                <div style={{color:C.orange,fontSize:12}}>
                  ⚠ Matched trip has different truck
                </div>
              )}
            </div>
            <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
              <div style={{color:C.red,fontWeight:800,fontSize:16}}>
                ₹{(alert.amount||0).toLocaleString("en-IN")}
              </div>
              {user.role==="owner" && (
                <button onClick={e=>{e.stopPropagation();if(window.confirm(`Delete alert for ${alert.truckNo}?\nThis cannot be undone.`)){onDelete(alert.id);}}}
                  style={{background:"none",border:"1px solid "+C.red+"44",borderRadius:5,color:C.red,
                    fontSize:10,padding:"2px 6px",cursor:"pointer",marginTop:3,display:"block",width:"100%"}}>
                  🗑 Delete
                </button>
              )}
              <div style={{color:C.muted,fontSize:12,marginTop:2}}>{expandedId===alert.id?"▲":"▼"}</div>
            </div>
          </div>

          {/* Expanded actions */}
          {expandedId===alert.id && (
            <div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.border}22`,
              display:"flex",flexDirection:"column",gap:10,paddingTop:12}}>

              {/* Send WhatsApp alert */}
              <Btn onClick={()=>sendWhatsApp(alert)} full outline color={C.red} sm>
                📱 Send WhatsApp Alert to Owner
              </Btn>

              {/* Link to trip — searchable by LR */}
              <div style={{background:C.bg,borderRadius:8,padding:"10px 12px"}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:6}}>
                  LINK TO A TRIP (clears alert)
                </div>
                <input
                  value={lrSearch} onChange={e=>{setLrSearch(e.target.value);setLinkTripId("");}}
                  placeholder="Search by LR, truck, destination…"
                  style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,
                    color:C.text,padding:"8px 10px",fontSize:13,width:"100%",boxSizing:"border-box",
                    outline:"none",marginBottom:6}} />
                {(() => {
                  const q = lrSearch.trim().toLowerCase();
                  const eligible = trips.filter(t => {
                    if (t.status==="Paid") return false;
                    const alreadyLinked = indents.some(i =>
                      i.tripId===t.id && i.confirmed && !i.unmatched && !i.truckMismatch && !i.amountMismatch && i.id!==alert.id
                    );
                    return !alreadyLinked;
                  });
                  const filtered = q ? eligible.filter(t=>(t.lrNo+t.truckNo+t.to+t.date).toLowerCase().includes(q)) : eligible.slice(0,6);
                  if (!filtered.length) return <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:6}}>No trips found</div>;
                  return (
                    <div style={{maxHeight:160,overflowY:"auto",display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
                      {filtered.map(t=>(
                        <div key={t.id} onClick={()=>{setLinkTripId(t.id);setLrSearch(`${t.truckNo} · LR ${t.lrNo||"—"} → ${t.to}`);}}
                          style={{padding:"7px 10px",borderRadius:7,cursor:"pointer",fontSize:12,
                            background:linkTripId===t.id?C.green+"22":C.card,
                            border:`1px solid ${linkTripId===t.id?C.green:C.border}`,
                            color:linkTripId===t.id?C.green:C.text}}>
                          <b>{t.truckNo}</b> · LR <b>{t.lrNo||"—"}</b> → {t.to}
                          <span style={{color:C.muted,marginLeft:6,fontSize:11}}>{t.date}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <Btn onClick={()=>{if(linkTripId){onLink(alert.id,linkTripId);setExpandedId(null);setLinkTripId("");setLrSearch("");}}}
                  full color={C.green} sm disabled={!linkTripId}>
                  ✓ Link to Selected Trip
                </Btn>
              </div>

              {/* Owner dismiss + delete */}
              {user.role==="owner" && (
                <div style={{background:C.bg,borderRadius:8,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700}}>OWNER ACTIONS</div>
                  <div style={{display:"flex",gap:8}}>
                    <input value={dismissReason} onChange={e=>setDismissReason(e.target.value)}
                      placeholder="Dismiss reason…"
                      style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,
                        color:C.text,padding:"8px 10px",fontSize:12,outline:"none"}} />
                    <Btn onClick={()=>{if(dismissReason.trim()){onDismiss(alert.id,dismissReason);setExpandedId(null);setDismissReason("");}}}
                      outline color={C.muted} sm disabled={!dismissReason.trim()}>
                      Dismiss
                    </Btn>
                  </div>
                  <Btn onClick={()=>{if(window.confirm(`Delete alert for ${alert.truckNo} indent ${alert.indentNo||"—"}?\nThis cannot be undone.`)){onDelete(alert.id);setExpandedId(null);}}}
                    full outline color={C.red} sm>
                    🗑 Delete This Alert
                  </Btn>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── CONFIRM DIESEL SHEET ─────────────────────────────────────────────────────
// Manager enters actual amount, sends WhatsApp to pump group, then confirms
function ConfirmDieselSheet({ indent, trips, onConfirm, onCancel }) {
  const trip = trips.find(t => t.id === indent.tripId);
  const [amount, setAmount] = useState(String(indent.amount || ""));
  const estAmount = indent.amount || 0;
  const actualAmount = +amount || 0;
  const diff = actualAmount - estAmount;

  const sendWhatsApp = () => {
    const date = indent.date || today();
    const msg = `Please confirm: Truck ${indent.truckNo} diesel ₹${actualAmount} on ${date}`;
    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  return (
    <Sheet title="Confirm Diesel Amount" onClose={onCancel}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>

        {/* Indent summary */}
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:4}}>{indent.truckNo}</div>
          <div style={{color:C.muted,fontSize:13}}>
            Date: {indent.date} · Indent: {indent.indentNo||"—"}
          </div>
          {trip && <div style={{color:C.blue,fontSize:12,marginTop:2}}>
            Trip: LR {trip.lrNo||"—"} → {trip.to}
          </div>}
        </div>

        {/* Amount entry */}
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",border:`1.5px solid ${C.orange}44`}}>
          <div style={{color:C.orange,fontWeight:700,fontSize:12,marginBottom:8}}>
            ACTUAL DIESEL AMOUNT ₹
          </div>
          <Field value={amount} onChange={setAmount} type="number"
            placeholder="Enter confirmed amount from pump" />
          {amount && (
            <div style={{marginTop:8,fontSize:13}}>
              <span style={{color:C.muted}}>Est: ₹{estAmount} → Actual: </span>
              <b style={{color:actualAmount>0?C.orange:C.muted}}>₹{actualAmount}</b>
              {diff !== 0 && amount && (
                <span style={{color:diff>0?C.red:C.green,marginLeft:8,fontWeight:700}}>
                  {diff>0?`+₹${diff} over estimate`:`₹${Math.abs(diff)} under estimate`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Step 1 — Send WhatsApp */}
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",
            letterSpacing:1,marginBottom:8}}>Step 1 — Send to Pump WhatsApp Group</div>
          <div style={{background:C.card2,borderRadius:8,padding:"10px 12px",
            fontSize:13,color:C.text,marginBottom:10,fontStyle:"italic"}}>
            "Please confirm: Truck {indent.truckNo} diesel ₹{actualAmount||"___"} on {indent.date}"
          </div>
          <Btn onClick={sendWhatsApp} full outline color={C.green}
            disabled={!amount}>
            📱 Open WhatsApp with this message
          </Btn>
        </div>

        {/* Step 2 — Mark confirmed after pump replies */}
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",
            letterSpacing:1,marginBottom:8}}>Step 2 — After Pump Confirms in Group</div>
          <Btn onClick={()=>onConfirm(amount)} full color={C.green}
            disabled={!amount}>
            ✓ Pump Confirmed — Save ₹{actualAmount||"___"}
          </Btn>
        </div>

        <Btn onClick={onCancel} full outline color={C.muted}>Cancel</Btn>
      </div>
    </Sheet>
  );
}

// ─── PUMP SLIP SCANNER ────────────────────────────────────────────────────────
// Scans a pump slip image — extracts multiple truck entries in one shot
const PUMP_PROMPT = `This is a diesel pump slip or Excel screenshot sent by a fuel pump.
Extract ALL vehicle/truck rows. Return a JSON array like:
[{"truckNo":"KA32D2753","indentNo":"25748","date":"2026-03-05","hsd":31596,"advance":3000},...]
Rules:
- truckNo: uppercase, remove spaces (KA 34 B 4788 → KA34B4788)
- indentNo: the indent/serial number, or "" if not visible
- date: YYYY-MM-DD format, or "" if not visible
- hsd: the HSD column value — diesel amount, number only, no ₹ or commas
- advance: the Advance column value — number only, 0 if blank or zero
- Skip total/summary rows
- Include ALL truck rows even if advance is 0
Return ONLY the JSON array, no other text.`;

function PumpSlipScanner({ pumps, trips, user, onResults }) {
  const inputRef = useRef(null);
  const [state, setState] = useState("idle"); // idle|reading|scanning|done|error
  const [error, setError] = useState("");

  const handleFile = async (file) => {
    setError(""); setState("reading");
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image (JPG/PNG) from WhatsApp."); setState("error"); return;
    }
    const base64 = await new Promise((res,rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = () => rej(new Error("Read failed"));
      r.readAsDataURL(file);
    });
    setState("scanning");
    try {
      const resp = await fetch("/.netlify/functions/scan-di", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ base64, mediaType: file.type, prompt: PUMP_PROMPT }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || "Server error");
      const clean = data.text.replace(/```json|```/g,"").trim();
      const entries = JSON.parse(clean);

      // Match by indent number first (exact), fallback to truck number
      // Dedup — if pump slip has same indent no or same truck no twice, keep first only
      const seen = new Set();
      const results = entries.map(e => {
        const truck  = (e.truckNo||"").toUpperCase().trim();
        const indent = String(e.indentNo||"").trim();

        const hsd       = +(e.hsd||e.amount)||0;
        const advance   = +(e.advance)||0;
        const pumpTotal = hsd + advance;

        // ── STRICT MATCHING HIERARCHY ─────────────────────────────────
        // Rule 1: Pump slip MUST have indent number → else UNMATCHED
        // Rule 2: LR MUST have dieselIndentNo filled → else UNMATCHED
        // Rule 3: Both indent numbers must match exactly → else UNMATCHED
        // Rule 4: Truck on slip must match truck on LR → TRUCK MISMATCH
        // Rule 5: HSD + Advance must equal LR dieselEstimate → AMOUNT MISMATCH
        // No fallback to truck-only matching under any condition.

        let trip          = null;
        let truckMismatch = false;
        let amountMismatch = false;
        let noIndentOnLR  = false; // matched by truck but LR has no indent
        let matchedBy     = null;

        if (!indent) {
          // Rule 1: no indent on pump slip → always UNMATCHED
          trip = null;
        } else {
          // Rule 2+3: find trip where dieselIndentNo matches exactly
          const indentTrip = trips.find(t =>
            String(t.dieselIndentNo||"").trim() === indent && t.status !== "Paid"
          );

          if (indentTrip) {
            trip      = indentTrip;
            matchedBy = "indent";
            // Rule 4: truck check
            truckMismatch = trip.truckNo !== truck;
            // Rule 5: amount check (only if truck matched AND estimate was set)
            if (!truckMismatch) {
              const est = +(trip.dieselEstimate||0);
              if (est > 0) {
                amountMismatch = Math.round(pumpTotal * 100) !== Math.round(est * 100);
              }
              // If est=0 (not set on trip), no amount check — still green if matched
            }
          } else {
            // Indent on slip but no LR has that indent number → UNMATCHED
            // (includes case where LR has no indent set — both sides mandatory)
            trip = null;
          }
        }

        const estDiesel = trip ? +(trip.dieselEstimate||0) : 0;

        return {
          truckNo: truck,
          indentNo: indent,
          date: e.date||today(),
          amount: hsd,
          advance,
          pumpTotal,
          estDiesel,
          amountMismatch,
          indentMismatch: false,
          trip: trip||null,
          truckMismatch,
          matchedBy,
          pumpId: pumps.length===1 ? pumps[0].id : "",  // auto-select only if exactly 1 pump
          include: !!trip && !truckMismatch,
          noIndentOnLR,
        };
      }).filter(r => {
        // Dedup: skip if same indent no or same truck already seen
        const key = r.indentNo || r.truckNo;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      onResults(results);
      setState("done");
    } catch(e) {
      setError("Could not read slip: " + e.message); setState("error");
    }
  };

  return (
    <div>
      {(state==="idle"||state==="error") && (
        <FileSourcePicker onFile={handleFile} accept="image/*"
          label="Save image from WhatsApp → upload here"
          color={C.blue} icon="📷" />
      )}
      {(state==="reading"||state==="scanning") && (
        <div style={{border:`2px solid ${C.blue}44`,borderRadius:14,padding:"20px 16px",
          textAlign:"center",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <div style={{color:C.blue,fontWeight:800,fontSize:14}}>
            {state==="reading"?"📖 Loading image…":"🤖 Reading pump slip…"}
          </div>
          <div style={{color:C.muted,fontSize:12}}>AI extracting truck numbers and amounts…</div>
        </div>
      )}
      {state==="done" && (
        <div style={{border:`2px solid ${C.green}44`,borderRadius:14,padding:"12px 16px",
          background:C.green+"11",textAlign:"center",color:C.green,fontWeight:700}}>
          ✓ Slip scanned — review below
        </div>
      )}
      {error && <div style={{color:C.red,fontSize:12,marginTop:4}}>{error}</div>}
    </div>
  );
}

// ─── SCAN PAYMENT IMAGE ───────────────────────────────────────────────────────
function ScanPaymentBtn({ onResult }) {
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef();

  const scan = async (file) => {
    if (!file) return;
    setScanning(true);
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const resp = await fetch("/.netlify/functions/scan-payment", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ base64: b64, mediaType: file.type||"image/jpeg" })
      });
      const parsed = await resp.json();
      if (parsed.error) throw new Error(parsed.error);
      onResult(parsed);
    } catch(e) {
      alert("Could not read payment image. Please fill manually.");
    } finally {
      setScanning(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <FileSourcePicker onFile={scan} accept="image/*,application/pdf"
      label={scanning?"Reading…":"Scan Payment"}
      color={C.purple||"#7c3aed"} icon="📷" compact={true} />
  );
}

// ─── SPLIT PAYMENT SHEET ──────────────────────────────────────────────────────
// Shown when a scanned payment contains multiple LR numbers
function SplitPaymentSheet({ scanData, trips, tripWithBalance, employees, setCashTransfers, user, log, onSave, onCancel }) {
  const totalAmount = +(scanData.amount||0);
  const utr = scanData.referenceNo||"";
  const date = scanData.date||today();
  const paidTo = scanData.paidTo||"";

  // Detect if paidTo/note matches an employee name
  const detectEmployee = () => {
    if(!(employees||[]).length) return null;
    const haystack = (paidTo+" "+(scanData.note||"")+" "+(scanData.narration||"")).toLowerCase();
    return (employees||[]).find(e => {
      const parts = e.name.toLowerCase().split(/\s+/);
      return parts.some(p => p.length>=3 && haystack.includes(p));
    }) || null;
  };
  const detectedEmp = detectEmployee();
  const [mode, setMode] = useState(detectedEmp ? "wallet" : "trips");
  const [selEmpId, setSelEmpId] = useState(detectedEmp?.id||"");

  // Try to match scanned LR numbers to actual trips
  const scannedLRs = (scanData.lrNumbers||[]).map(lr => String(lr).trim());

  // Build initial rows — one per detected LR, pre-matched to a trip
  const initRows = scannedLRs.map(lr => {
    const matched = tripWithBalance.find(t =>
      String(t.lrNo||"").toLowerCase().includes(lr.toLowerCase()) ||
      lr.toLowerCase().includes(String(t.lrNo||"").toLowerCase())
    );
    return { lr, tripId: matched?.id||"", amount: "" };
  });

  // If no LRs detected, start with 2 blank rows
  const [rows, setRows] = useState(initRows.length > 0 ? initRows : [
    {lr:"", tripId:"", amount:""},
    {lr:"", tripId:"", amount:""},
  ]);
  const [sharedUtr]    = useState(utr);
  const [sharedDate,   setSharedDate]   = useState(date);
  const [sharedPaidTo, setSharedPaidTo] = useState(paidTo);
  const [sharedNote,   setSharedNote]   = useState("");

  const updateRow = (i, k, v) => setRows(r => r.map((row,idx) => idx===i ? {...row,[k]:v} : row));

  const totalAllocated = rows.reduce((s,r) => s+(+r.amount||0), 0);
  const remaining = totalAmount - totalAllocated;

  const canSave = rows.every(r => r.tripId && +r.amount > 0) &&
    rows.every(r => {
      const t = tripWithBalance.find(x=>x.id===r.tripId);
      return !t || +r.amount <= t.balance;
    }) && rows.length > 0 && remaining === 0;

  const handleSave = () => {
    const payments = rows.map(r => {
      const t = tripWithBalance.find(x=>x.id===r.tripId);
      return {
        id: uid(), tripId: r.tripId,
        truckNo: t?.truckNo||"", lrNo: t?.lrNo||"",
        amount: +r.amount, utr: sharedUtr,
        date: sharedDate, paidTo: sharedPaidTo, notes: sharedNote,
      };
    });
    onSave(payments);
  };

  return (
    <Sheet title="Split Payment Across LRs" onClose={onCancel}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>

        {/* Summary from scan */}
        <div style={{background:C.purple+"11",border:`1.5px solid ${C.purple}44`,borderRadius:12,padding:"12px 14px"}}>
          <div style={{color:C.purple||"#7c3aed",fontWeight:800,fontSize:13,marginBottom:6}}>📷 Scanned Payment</div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{color:C.muted,fontSize:12}}>Total Amount</span>
            <span style={{color:C.text,fontWeight:800,fontSize:16}}>{fmt(totalAmount)}</span>
          </div>
          {utr && <div style={{color:C.muted,fontSize:11}}>UTR: <b style={{color:C.text}}>{utr}</b></div>}
          {paidTo && <div style={{color:C.muted,fontSize:11}}>Paid to: {paidTo}</div>}
          {scannedLRs.length > 0 && <div style={{color:C.muted,fontSize:11,marginTop:2}}>Detected LRs: <b style={{color:C.orange}}>{scannedLRs.join(", ")}</b></div>}
        </div>

        {/* Mode selector */}
        {(employees||[]).length>0 && (
          <div style={{display:"flex",gap:8}}>
            {[{id:"trips",label:"🚛 Trip Payment"},{id:"wallet",label:"💵 Employee Wallet"}].map(m=>(
              <button key={m.id} onClick={()=>setMode(m.id)} style={{
                flex:1,padding:"9px 0",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",border:"none",
                background:mode===m.id?(m.id==="wallet"?C.green:C.purple):C.card,
                color:mode===m.id?"#fff":C.muted}}>
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Wallet mode */}
        {mode==="wallet" && (()=>{
          const selEmp = (employees||[]).find(e=>e.id===selEmpId);
          return (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {detectedEmp && <div style={{background:"#f0fdf4",border:"1px solid #2ea04355",borderRadius:8,
                padding:"9px 12px",color:C.green,fontSize:12,fontWeight:600}}>
                ✅ Detected: <b>{detectedEmp.name}</b> from "{paidTo}"
              </div>}
              <div>
                <div style={{color:C.muted,fontSize:11,marginBottom:4,fontWeight:700}}>SELECT EMPLOYEE</div>
                <select value={selEmpId} onChange={e=>setSelEmpId(e.target.value)}
                  style={{width:"100%",background:C.bg,border:`1.5px solid ${selEmpId?C.green:C.border}`,
                    borderRadius:8,color:C.text,padding:"9px 12px",fontSize:13,outline:"none"}}>
                  <option value="">— Choose employee —</option>
                  {(employees||[]).map(e=><option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}
                </select>
              </div>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:3}}>AMOUNT ₹</div>
                  <div style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,
                    color:C.text,padding:"9px 12px",fontSize:14,fontWeight:700}}>{fmt(totalAmount)}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:3}}>DATE</div>
                  <input type="date" value={sharedDate} onChange={e=>setSharedDate(e.target.value)}
                    onClick={e=>e.target.showPicker?.()}
                    style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,color:C.text,
                      padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"light",WebkitAppearance:"none",boxSizing:"border-box"}} />
                </div>
              </div>
              <div>
                <div style={{color:C.muted,fontSize:11,marginBottom:3}}>NOTE</div>
                <input value={sharedNote} onChange={e=>setSharedNote(e.target.value)}
                  placeholder="UPI / NEFT / Cash"
                  style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,color:C.text,
                    padding:"9px 12px",fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"}} />
              </div>
              <Btn onClick={()=>{
                if(!selEmpId){alert("Select an employee");return;}
                const tx={id:uid(),empId:selEmpId,amount:totalAmount,date:sharedDate,lrNo:"",
                  note:(sharedNote||paidTo||"Cash Transfer").trim(),utr,
                  createdBy:user?.username||"",createdAt:nowTs()};
                setCashTransfers(prev=>[tx,...(Array.isArray(prev)?prev:[])]);
                log&&log("CASH TRANSFER",`${selEmp?.name} ₹${fmt(totalAmount)} UTR:${utr}`);
                alert(`✅ ₹${fmt(totalAmount)} added to ${selEmp?.name}'s wallet`);
                onCancel();
              }} full color={C.green} disabled={!selEmpId||totalAmount<=0}>
                💵 Save to {selEmp?selEmp.name+"'s":"Employee"} Wallet
              </Btn>
            </div>
          );
        })()}

        {/* Trip payment mode */}
        {mode==="trips" && (<>

        {/* Shared date + paid to + notes */}
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}>
            <div style={{color:C.muted,fontSize:11,marginBottom:3}}>DATE</div>
            <input type="date" value={sharedDate} onChange={e=>setSharedDate(e.target.value)}
              onClick={e=>e.target.showPicker?.()}
              style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,color:C.text,
                padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"light",
                WebkitAppearance:"none",boxSizing:"border-box"}} />
          </div>
          <div style={{flex:1}}>
            <div style={{color:C.muted,fontSize:11,marginBottom:3}}>PAID TO</div>
            <input value={sharedPaidTo} onChange={e=>setSharedPaidTo(e.target.value)}
              placeholder="Recipient name…"
              style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,color:C.text,
                padding:"8px 10px",fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"}} />
          </div>
        </div>
        <div>
          <div style={{color:C.muted,fontSize:11,marginBottom:3}}>NOTES</div>
          <input value={sharedNote} onChange={e=>setSharedNote(e.target.value)}
            placeholder="Bank name, remarks…"
            style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,color:C.text,
              padding:"8px 10px",fontSize:13,width:"100%",boxSizing:"border-box",outline:"none"}} />
        </div>

        {/* Allocation rows */}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>
              Allocate to Trips
            </div>
            <button onClick={()=>setRows(r=>[...r,{lr:"",tripId:"",amount:""}])}
              style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,
                color:C.text,fontSize:11,padding:"3px 8px",cursor:"pointer"}}>
              + Add Row
            </button>
          </div>

          {rows.map((row, i) => {
            const trip = tripWithBalance.find(t=>t.id===row.tripId);
            return (
              <div key={i} style={{background:C.bg,borderRadius:10,padding:"10px 12px",
                border:`1px solid ${row.tripId?C.green+"44":C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700}}>LR {i+1}</div>
                  {rows.length > 1 && (
                    <button onClick={()=>setRows(r=>r.filter((_,idx)=>idx!==i))}
                      style={{background:"none",border:"none",color:C.red,fontSize:14,cursor:"pointer",padding:"0 4px"}}>×</button>
                  )}
                </div>

                {/* Trip search */}
                <div style={{marginBottom:6}}>
                  <input
                    value={row.lr} onChange={e=>{
                      const q = e.target.value;
                      updateRow(i,"lr",q);
                      // auto-match
                      const m = tripWithBalance.find(t=>
                        (t.lrNo||"").toLowerCase().includes(q.toLowerCase()) && q.length>=2
                      );
                      updateRow(i,"tripId", m?.id||"");
                    }}
                    placeholder="Type LR number or truck…"
                    style={{background:C.card,border:`1px solid ${row.tripId?C.green:C.border}`,borderRadius:7,
                      color:C.text,padding:"7px 10px",fontSize:13,width:"100%",
                      boxSizing:"border-box",outline:"none"}} />
                  {/* Matching dropdown */}
                  {row.lr && !row.tripId && (() => {
                    const q = row.lr.toLowerCase();
                    const matches = tripWithBalance.filter(t=>
                      t.balance>0 && (t.lrNo||"").toLowerCase().includes(q) || (t.truckNo||"").toLowerCase().includes(q)
                    ).slice(0,5);
                    return matches.length > 0 ? (
                      <div style={{background:C.card,borderRadius:7,marginTop:3,
                        border:`1px solid ${C.border}`,overflow:"hidden"}}>
                        {matches.map(t=>(
                          <div key={t.id} onClick={()=>{updateRow(i,"tripId",t.id);updateRow(i,"lr",`LR ${t.lrNo} · ${t.truckNo}`);}}
                            style={{padding:"7px 10px",cursor:"pointer",fontSize:12,
                              borderBottom:`1px solid ${C.border}22`}}>
                            <b>LR {t.lrNo}</b> · {t.truckNo} · Balance: <span style={{color:C.accent}}>{fmt(t.balance)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Trip info if matched */}
                {trip && (
                  <div style={{color:C.muted,fontSize:11,marginBottom:6,padding:"4px 6px",
                    background:C.green+"11",borderRadius:5}}>
                    ✅ {trip.truckNo} · {trip.from}→{trip.to} · Balance: <b style={{color:C.green}}>{fmt(trip.balance)}</b>
                  </div>
                )}

                {/* Amount */}
                <input type="number" value={row.amount}
                  onChange={e=>updateRow(i,"amount",e.target.value)}
                  placeholder={trip ? `Max balance: ${trip.balance}` : "Amount ₹"}
                  style={{background:C.card,border:`1.5px solid ${
                    !row.amount ? C.border :
                    trip && +row.amount > trip.balance ? C.red :
                    +row.amount > 0 ? C.green : C.border
                  }`,borderRadius:7,
                    color:C.text,padding:"8px 10px",fontSize:14,width:"100%",
                    boxSizing:"border-box",outline:"none"}} />
                {trip && +row.amount > trip.balance && (
                  <div style={{color:C.red,fontSize:11,marginTop:3,fontWeight:700}}>
                    ⚠ Exceeds balance of {fmt(trip.balance)} — reduce amount
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Running total */}
        <div style={{background:C.card,borderRadius:10,padding:"10px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{color:C.muted,fontSize:12}}>Allocated</span>
            <span style={{color:C.text,fontWeight:700}}>{fmt(totalAllocated)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{color:C.muted,fontSize:12}}>Total Scanned</span>
            <span style={{color:C.text,fontWeight:700}}>{fmt(totalAmount)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}33`,paddingTop:6}}>
            <span style={{fontWeight:800,fontSize:13}}>Remaining</span>
            <span style={{fontWeight:900,fontSize:15,
              color:remaining===0?C.green:remaining<0?C.red:C.orange}}>
              {remaining===0?"✅ Fully allocated":fmt(Math.abs(remaining))+(remaining<0?" over":"")}
            </span>
          </div>
        </div>

        <Btn onClick={handleSave} full color={C.green} disabled={!canSave}>
          ✓ Save {rows.length} Payment{rows.length>1?"s":""} — {fmt(totalAllocated)}
        </Btn>
        {remaining > 0 && (
          <div style={{color:C.orange,fontSize:12,textAlign:"center",fontWeight:700}}>
            ⚠ ₹{remaining.toLocaleString("en-IN")} still unallocated — add more rows or adjust amounts
          </div>
        )}
        </>)}
        <Btn onClick={onCancel} full outline color={C.muted}>Cancel</Btn>
      </div>
    </Sheet>
  );
}

// ─── DIESEL MODULE ────────────────────────────────────────────────────────────
function DieselMod({trips, setTrips, vehicles, indents, setIndents, pumpPayments, setPumpPayments, pumps, setPumps, driverPays, setDriverPays, user, log}) {
  const [view,        setView]        = useState("pumps");
  const [pumpSheet,   setPumpSheet]   = useState(false);
  const [scanSheet,   setScanSheet]   = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [scanSummary, setScanSummary] = useState(null);
  const [confirmFlow, setConfirmFlow] = useState(null);
  const [payPumpId,   setPayPumpId]   = useState(null);
  const [payAmt,      setPayAmt]      = useState("");
  const [payUtr,      setPayUtr]      = useState("");
  const [payPaidTo,   setPayPaidTo]   = useState("");
  const [payNote,     setPayNote]     = useState("");
  const [expandPump,  setExpandPump]  = useState(null); // expanded pump id
  const [filterFrom,  setFilterFrom]  = useState("");
  const [filterTo,    setFilterTo]    = useState("");
  const [showFilter,  setShowFilter]  = useState(false);

  const blankP = {name:"", contact:"", address:"", accountNo:"", ifsc:""};
  const [pf, setPf] = useState(blankP);

  // Confirmed indents = confirmed:true OR alert resolved (alertDismissed:true with tripId)
  // Confirmed = confirmed flag OR alert dismissed with a linked trip
  // Dedup by indentNo — keep the one with confirmed:true preferably, else latest
  const _allConfirmed = indents.filter(i => i.confirmed || (i.alertDismissed && i.tripId));
  const _confirmedMap = new Map();
  _allConfirmed.forEach(i => {
    const key = i.indentNo ? String(i.indentNo).trim() : i.id;
    const existing = _confirmedMap.get(key);
    if (!existing || (i.confirmed && !existing.confirmed) || i.createdAt > existing.createdAt)
      _confirmedMap.set(key, i);
  });
  // Only truly confirmed = confirmed:true AND has a valid linked trip
  const confirmedIndents = Array.from(_confirmedMap.values())
    .filter(i => i.confirmed && i.tripId && trips.some(t => t.id === i.tripId));
  // Indents with no matching trip — flagged for owner
  const unmatchedIndents = indents.filter(i => i.unmatched);
  // Red alerts = unmatched + truck mismatch + amount mismatch + indent mismatch + confirmed but no trip
  // Dedup alerts — keep latest by indentNo+truckNo key
  const _rawAlerts = indents.filter(i => {
    if (i.alertDismissed) return false;
    if (i.unmatched || i.truckMismatch || i.amountMismatch || i.indentMismatch) return true;
    // Confirmed but no valid trip linked → show as NO TRIP alert
    if (i.confirmed && (!i.tripId || !trips.some(t => t.id === i.tripId))) return true;
    return false;
  });

  // Stale alert: trip has dieselEstimate > 0 but NO confirmed indent linked, and trip date < today
  const staleIndentAlerts = trips.filter(t => {
    if ((t.dieselEstimate||0) <= 0) return false;
    if (t.status === "Paid") return false;
    if (t.date >= today()) return false; // only flag if trip date is past
    const hasConfirmed = indents.some(i => i.tripId === t.id && i.confirmed);
    return !hasConfirmed;
  });
  const _seenAlerts = new Map();
  _rawAlerts.forEach(i => {
    const key = (i.indentNo||"") + "_" + (i.truckNo||"");
    if (!_seenAlerts.has(key) || i.createdAt > _seenAlerts.get(key).createdAt)
      _seenAlerts.set(key, i);
  });
  const redAlerts = Array.from(_seenAlerts.values());

  const linkAlertToTrip = async (alertId, tripId) => {
    const trip    = trips.find(t => t.id === tripId);
    const alert   = indents.find(i => i.id === alertId);
    if (!trip || !alert) return;

    // Block if LR already has a confirmed indent
    const existing = indents.find(i =>
      i.tripId === tripId && i.id !== alertId && i.confirmed &&
      !i.unmatched && !i.truckMismatch && !i.amountMismatch
    );
    if (existing) {
      window.alert(`LR ${trip.lrNo||"—"} already has an indent linked (${existing.truckNo} · #${existing.indentNo} · ₹${existing.amount}).\n\nEach LR can only have one indent. Please choose a different trip.`);
      return;
    }

    // 1. Update the indent — link, clear flags, confirm
    const updatedIndent = {...alert, tripId, truckNo: trip.truckNo,
      unmatched:false, truckMismatch:false, amountMismatch:false,
      alertDismissed:false, confirmed:true};
    const updatedIndents = indents.map(i => i.id===alertId ? updatedIndent : i);
    setIndents(updatedIndents);
    await DB.saveIndent(updatedIndent);

    // 2. Update trip dieselEstimate to scanned amount, recalculate
    const oldEst   = trip.dieselEstimate || 0;
    const newDiesel = alert.amount || 0;
    const vehicle   = vehicles?.find(v => v.truckNo === trip.truckNo);
    const oldCalc   = calcNet(trip, vehicle, oldEst);
    const newCalc   = calcNet({...trip, dieselEstimate: newDiesel}, vehicle, newDiesel);
    const updatedTrip = {...trip,
      dieselEstimate: newDiesel,
      dieselIndentNo: alert.indentNo || trip.dieselIndentNo || "",
      editedBy: user.username, editedAt: nowTs()};
    setTrips(prev => prev.map(t => t.id===tripId ? updatedTrip : t));
    await DB.saveTrip(updatedTrip);

    // 3. If trip already settled and new net < old net — create deduction entry
    if (trip.driverSettled && newCalc.net < oldCalc.net) {
      const deductAmt = oldCalc.net - newCalc.net; // extra diesel not deducted before
      const deduction = {
        id: uid(), tripId, truckNo: trip.truckNo, lrNo: trip.lrNo||"",
        amount: -deductAmt, // negative = deduction
        utr: `DIESEL-ADJ-${alert.indentNo||alertId.slice(0,6)}`,
        date: today(),
        notes: `Diesel adjustment: Est ₹${oldEst} → Actual ₹${newDiesel}. Deduction ₹${deductAmt} from next payment.`,
        createdBy: user.username, createdAt: nowTs(),
      };
      setDriverPays(prev => [deduction, ...(prev||[])]);
      await DB.saveDriverPay(deduction);
      log("DIESEL ADJ DEDUCTION", `LR ${trip.lrNo} ₹${deductAmt} deducted — diesel est was ₹${oldEst}, actual ₹${newDiesel}`);
      window.alert(`⚠ Trip LR ${trip.lrNo||"—"} was already settled.\nDiesel updated: ₹${oldEst} → ₹${newDiesel}.\nDeduction of ₹${deductAmt} created in driver payments for next settlement.`);
    }

    // 4. WhatsApp alert if amount mismatch
    if (alert.amountMismatch) {
      const diff = Math.abs((alert.pumpTotal||0) - oldEst);
      const msg  = `🚨 DIESEL AMOUNT UPDATED\nLR: ${trip.lrNo||"—"} · Truck: ${trip.truckNo}\nIndent: ${alert.indentNo||"—"}\nEst: ₹${oldEst} → Actual: ₹${newDiesel} (diff ₹${diff})\nEst Diesel updated in trip. Check balances.`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    }

    log("ALERT LINKED", `Indent ${alertId} → LR ${trip.lrNo}, diesel updated ₹${oldEst}→₹${newDiesel}`);
  };

  const dismissAlert = async (alertId, reason) => {
    const updated = indents.map(i => i.id===alertId
      ? {...i, alertDismissed:true, dismissReason:reason, dismissedBy:user.username, dismissedAt:nowTs()}
      : i);
    setIndents(updated);
    await DB.saveIndent(updated.find(i=>i.id===alertId));
    log("ALERT DISMISSED", `Indent ${alertId} dismissed: ${reason}`);
  };

  const deleteAlert = async (alertId) => {
    setIndents(p => p.filter(i => i.id !== alertId));
    try {
      await DB.deleteIndent(alertId);
      log("ALERT DELETED", `Indent ${alertId} deleted by owner`);
    } catch(e) {
      setIndents(p => [...p]); // restore on fail
      alert("Failed to delete: " + e.message);
    }
  };

  // Per-pump balance: total confirmed - total paid
  const pumpBalances = pumps.map((p) => {
    // Only count indents explicitly assigned to this pump — no auto-fallback
    const pIndents = confirmedIndents.filter(i => i.pumpId === p.id);
    const totalOwed = pIndents.reduce((s,i) => s+(+(i.amount)||0), 0);
    const totalPaid = (pumpPayments||[]).filter(pp => pp.pumpId === p.id)
                        .reduce((s,pp) => s+(+(pp.amount)||0), 0);
    const pending   = Math.max(0, totalOwed - totalPaid);
    return { ...p, pIndents, totalOwed, totalPaid, pending };
  });

  const confirmScanned = async () => {
    // ── DEDUP: check scanned indents against already-saved ones ──────────────
    const existingByNo = new Map(
      indents.filter(i=>i.indentNo).map(i=>[String(i.indentNo).trim(), i])
    );

    const exactDupes   = []; // same indent no + same pumpTotal → skip entirely
    const amountChanged = []; // same indent no but pumpTotal changed → update with alert
    const unconfirmedUpgrades = []; // same indent no, was unconfirmed → upgrade

    for (const r of (scanResults||[])) {
      if (!r.indentNo) continue;
      const existing = existingByNo.get(String(r.indentNo).trim());
      if (!existing) continue;

      if (!existing.confirmed) {
        unconfirmedUpgrades.push({ r, existing });
      } else {
        const existingTotal = +(existing.pumpTotal||existing.amount||0);
        const scannedTotal  = +(r.pumpTotal||0);
        if (Math.round(existingTotal*100) === Math.round(scannedTotal*100)) {
          exactDupes.push(r); // identical — skip silently
        } else {
          amountChanged.push({ r, existing }); // amount differs — ask to update
        }
      }
    }

    // Handle unconfirmed upgrades silently
    if (unconfirmedUpgrades.length > 0) {
      const updatedIndents = indents.map(i => {
        const match = unconfirmedUpgrades.find(u => u.existing.id === i.id);
        if (!match) return i;
        const upd = {...i, confirmed:true, unmatched:false, alertDismissed:false,
          amount: match.r.pumpTotal||+match.r.amount||0,
          hsd: +match.r.amount||0, advance: match.r.advance||0,
          pumpTotal: match.r.pumpTotal||0};
        return upd;
      });
      setIndents(updatedIndents);
      for (const u of unconfirmedUpgrades) {
        const upd = updatedIndents.find(i=>i.id===u.existing.id);
        if (upd) await DB.saveIndent(upd);
      }
    }

    // Handle amount-changed duplicates — alert and update
    for (const { r, existing } of amountChanged) {
      const oldAmt = +(existing.pumpTotal||existing.amount||0);
      const newAmt = +(r.pumpTotal||0);
      const proceed = window.confirm(
        `⚠️ Indent #${r.indentNo} was already saved on ${existing.date}.\n\n` +
        `Previous amount: ₹${oldAmt.toLocaleString("en-IN")} (HSD ₹${existing.hsd||existing.amount||0} + Adv ₹${existing.advance||0})\n` +
        `New amount: ₹${newAmt.toLocaleString("en-IN")} (HSD ₹${+r.amount||0} + Adv ₹${r.advance||0})\n\n` +
        `Update to new amount?`
      );
      if (proceed) {
        const upd = {...existing,
          amount: r.pumpTotal||+r.amount||0,
          hsd: +r.amount||0, advance: r.advance||0,
          pumpTotal: r.pumpTotal||0,
          editedBy: user.username, editedAt: nowTs()};
        setIndents(p => p.map(i => i.id===existing.id ? upd : i));
        await DB.saveIndent(upd);
      }
    }

    // Only process truly fresh indent numbers
    const allDupeNos = new Set([
      ...exactDupes.map(r=>String(r.indentNo).trim()),
      ...amountChanged.map(({r})=>String(r.indentNo).trim()),
      ...unconfirmedUpgrades.map(({r})=>String(r.indentNo).trim()),
    ]);
    const fresh = (scanResults||[]).filter(r => !r.indentNo || !allDupeNos.has(String(r.indentNo).trim()));
    if (fresh.length===0){ setScanResults(null); setScanSheet(false); return; }

    // Split fresh into green (confirmed) and alerts (mismatches)
    const green  = fresh.filter(r=> r.trip && !r.truckMismatch && !r.amountMismatch && !r.indentMismatch);
    const alerts = fresh.filter(r=>!r.trip ||  r.truckMismatch ||  r.amountMismatch ||  r.indentMismatch);
    // amount = pumpTotal (HSD + Advance) — this is the full credit due back from pump
    // hsd = HSD only (fuel portion)
    const newIndents = green.map(r=>({
      id:uid(), pumpId:r.pumpId||"",
      truckNo:r.truckNo, tripId:r.trip.id,
      indentNo:r.indentNo||"", date:r.date||today(),
      litres:0, ratePerLitre:0,
      amount: r.pumpTotal||+r.amount||0,   // HSD + Advance = total credit due
      hsd: +r.amount||0,                   // HSD only
      advance: r.advance||0,
      confirmed:true, paid:false,
      unmatched:false, truckMismatch:false, amountMismatch:false, indentMismatch:false,
      pumpTotal:r.pumpTotal||0, estDiesel:r.estDiesel||0,
      alertDismissed:false,
      createdBy:user.username, createdAt:nowTs(),
    }));

    // Save unresolved alerts as unconfirmed
    const alertIndents = alerts.map(r=>({
      id:uid(), pumpId:r.pumpId||"",
      truckNo:r.truckNo, tripId:r.trip?.id||null,
      indentNo:r.indentNo||"", date:r.date||today(),
      litres:0, ratePerLitre:0,
      amount: r.pumpTotal||+r.amount||0,
      hsd: +r.amount||0,
      advance: r.advance||0,
      confirmed:false, paid:false,
      unmatched:!r.trip, truckMismatch:!!r.truckMismatch,
      amountMismatch:!!r.amountMismatch, indentMismatch:!!r.indentMismatch,
      pumpTotal:r.pumpTotal||0, estDiesel:r.estDiesel||0,
      alertDismissed:false,
      createdBy:user.username, createdAt:nowTs(),
    }));

    const allNew = [...newIndents, ...alertIndents];
    setIndents(p=>[...allNew,...(p||[])]);
    for (const ind of allNew) await DB.saveIndent(ind);

    for (const r of green) log("DIESEL CONFIRM", r.truckNo+" IndentNo:"+r.indentNo+" Rs."+r.amount);

    setScanResults(null);
    setScanSummary({ saved:green.length, flagged:alerts.length, date:today() });
    if (alerts.length===0) setScanSheet(false);
  };

  const saveIndent = () => {
    // Validate: indent number must be unique across both indents AND trips
    if (f.indentNo && f.indentNo.trim()) {
      const dupIndent = (indents||[]).find(i => i.indentNo && String(i.indentNo).trim() === f.indentNo.trim());
      if (dupIndent) {
        alert(`Indent No "${f.indentNo}" already exists in Diesel records (Truck: ${dupIndent.truckNo}, Date: ${dupIndent.date}). Each indent number must be unique.\n\nIndent No "${f.indentNo}" ಡೀಸೆಲ್ ರೆಕಾರ್ಡ್‌ನಲ್ಲಿ ಇದೆ. ಅನನ್ಯ ನಂಬರ್ ಬಳಸಿ.`);
        return;
      }
      const dupTrip = (trips||[]).find(t => t.dieselIndentNo && t.dieselIndentNo.trim() === f.indentNo.trim());
      if (dupTrip) {
        alert(`Indent No "${f.indentNo}" is already linked to Trip LR: ${dupTrip.lrNo||"—"} (Truck: ${dupTrip.truckNo}). Each indent number must be unique.\n\nIndent No ಟ್ರಿಪ್ LR ${dupTrip.lrNo||"—"}ಗೆ ಲಿಂಕ್ ಆಗಿದೆ. ಅನನ್ಯ ನಂಬರ್ ಬಳಸಿ.`);
        return;
      }
    }
    const ind = {...f, id:uid(), amount:+f.amount, litres:+f.litres, ratePerLitre:+f.ratePerLitre, paid:false, createdBy:user.username, createdAt:nowTs()};
    setIndents(p => [ind, ...(p||[])]);
    log("DIESEL INDENT", `${ind.truckNo} · Indent ${ind.indentNo} · ${fmt(ind.amount)}`);
    setF(blankI); setAddSheet(false);
  };

  const confirmIndent = async (id, newAmount) => {
    const updated = indents.map(i => i.id===id
      ? {...i, confirmed:true, amount: newAmount!=null ? +newAmount : i.amount}
      : i);
    setIndents(updated);
    const ind = updated.find(i=>i.id===id);
    await DB.saveIndent(ind);
    log("DIESEL CONFIRM", `Truck ${ind?.truckNo} ₹${ind?.amount} confirmed`);
  };

  const recordPumpPayment = async () => {
    if (!payAmt || +payAmt <= 0 || !payUtr.trim()) return;
    const pump = pumps.find(p => p.id === payPumpId);
    const payment = { id:uid(), pumpId:payPumpId, amount:+payAmt, utr:payUtr.trim(),
      date:today(), paidTo:payPaidTo.trim(), note:payNote.trim(), createdBy:user.username, createdAt:nowTs() };
    setPumpPayments(prev => [payment, ...(prev||[])]);
    await DB.savePumpPayment(payment);
    log("PUMP PAYMENT", `${pump?.name} ₹${fmt(+payAmt)} UTR: ${payUtr}`);
    setPayPumpId(null); setPayAmt(""); setPayUtr(""); setPayPaidTo(""); setPayNote("");
  };

  const deletePumpPayment = async (id) => {
    setPumpPayments(prev => prev.filter(p => p.id !== id));
    await DB.deletePumpPayment(id);
    log("PUMP PAYMENT DELETED", id);
  };

  // Overall totals
  const totalPending = pumpBalances.reduce((s,p) => s + Math.max(0,p.pending), 0);
  const totalPaid    = (pumpPayments||[]).reduce((s,p) => s + p.amount, 0);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:C.orange,fontWeight:800,fontSize:16}}>⛽ Diesel & Pump</div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>setShowFilter(v=>!v)} sm outline color={showFilter?C.orange:C.muted}>📅 Filter</Btn>
          <Btn onClick={()=>setScanSheet(true)} sm outline color={C.blue}>📷 Scan Slip</Btn>
          <Btn onClick={()=>setPumpSheet(true)} sm outline color={C.muted}>+ Pump</Btn>
        </div>
      </div>

      {/* Date filter bar */}
      {showFilter && (
        <div style={{background:C.card,borderRadius:12,padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
            <div style={{flex:1}}>
              <div style={{color:C.muted,fontSize:11,marginBottom:4}}>FROM</div>
              <input type="date" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}
                onClick={e=>e.target.showPicker?.()}
                style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,
                  color:filterFrom?C.text:C.muted, padding:"9px 10px",fontSize:14,width:"100%",
                  WebkitAppearance:"none", colorScheme:"light", boxSizing:"border-box"}} />
            </div>
            <div style={{flex:1}}>
              <div style={{color:C.muted,fontSize:11,marginBottom:4}}>TO</div>
              <input type="date" value={filterTo} onChange={e=>setFilterTo(e.target.value)}
                onClick={e=>e.target.showPicker?.()}
                style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,
                  color:filterTo?C.text:C.muted, padding:"9px 10px",fontSize:14,width:"100%",
                  WebkitAppearance:"none", colorScheme:"light", boxSizing:"border-box"}} />
            </div>
            <Btn onClick={()=>{setFilterFrom("");setFilterTo("");}} sm outline color={C.muted}>Clear</Btn>
          </div>
          {(filterFrom||filterTo) && (()=>{
            const from=filterFrom||"2000-01-01", to=filterTo||"2099-12-31";
            const filtI=confirmedIndents.filter(i=>i.date>=from&&i.date<=to);
            const filtP=(pumpPayments||[]).filter(p=>p.date>=from&&p.date<=to);
            const totalI=filtI.reduce((s,i)=>s+(+i.amount||0),0);
            const totalPmt=filtP.reduce((s,p)=>s+(+p.amount||0),0);
            return (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",gap:8,fontSize:12}}>
                  <span style={{color:C.muted}}>Indents: <b style={{color:C.text}}>{filtI.length}</b></span>
                  <span style={{color:C.muted}}>Total HSD: <b style={{color:C.orange}}>{fmt(totalI)}</b></span>
                  <span style={{color:C.muted}}>Payments: <b style={{color:C.green}}>{fmt(totalPmt)}</b></span>
                </div>
                <Btn onClick={()=>{
                  const pumpMap=Object.fromEntries(pumps.map(p=>[p.id,p.name]));
                  const tripMap=Object.fromEntries(trips.map(t=>[t.id,t.lrNo||"—"]));
                  const indRows=filtI.map(i=>"<tr><td>"+i.date+"</td><td>"+i.truckNo+"</td><td>"+i.indentNo+"</td><td>"+(pumpMap[i.pumpId]||"—")+"</td><td>"+(tripMap[i.tripId]||"—")+"</td><td style='text-align:right'>"+fmt(i.amount)+"</td></tr>").join("");
                  const pmtRows=filtP.map(p=>"<tr><td>"+p.date+"</td><td colspan='3'>"+(pumpMap[p.pumpId]||"—")+" — "+p.utr+"</td><td>"+(p.note||"")+"</td><td style='text-align:right'>"+fmt(p.amount)+"</td></tr>").join("");
                  const html="<html><head><style>body{font-family:Arial,sans-serif;font-size:13px;padding:20px}h2{color:#f97316}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#f97316;color:#fff;padding:7px 10px;text-align:left}td{padding:6px 10px;border-bottom:1px solid #eee}.summary{display:flex;gap:30px;margin-bottom:16px;font-size:14px}.sum-lbl{color:#888}.sum-val{font-weight:bold}</style></head><body>"
                    +"<h2>M. Yantra Enterprises — Diesel Statement</h2>"
                    +"<div style='color:#888;margin-bottom:12px'>Period: "+(filterFrom||"all")+" to "+(filterTo||"all")+"</div>"
                    +"<div class='summary'><div><span class='sum-lbl'>Total HSD </span><span class='sum-val'>"+fmt(totalI)+"</span></div><div><span class='sum-lbl'>Payments Made </span><span class='sum-val'>"+fmt(totalPmt)+"</span></div><div><span class='sum-lbl'>Balance </span><span class='sum-val'>"+fmt(totalI-totalPmt)+"</span></div></div>"
                    +"<h3>Indents ("+filtI.length+")</h3><table><thead><tr><th>Date</th><th>Truck</th><th>Indent No</th><th>Pump</th><th>LR</th><th>Amount</th></tr></thead><tbody>"+indRows+"</tbody></table>"
                    +"<h3>Payments ("+filtP.length+")</h3><table><thead><tr><th>Date</th><th>Pump / UTR</th><th></th><th></th><th>Note</th><th>Amount</th></tr></thead><tbody>"+pmtRows+"</tbody></table>"
                    +"</body></html>";
                  const w=window.open("","_blank");
                  w.document.write(html);
                  w.document.close();
                  setTimeout(()=>w.print(),400);
                }} full color={C.orange} sm>
                  🖨 Export as PDF ({filterFrom||"all"} → {filterTo||"all"})
                </Btn>
              </div>
            );
          })()}
        </div>
      )}

      {/* Red alerts */}
      {redAlerts.length > 0 && (
        <DieselAlertBanner
          alerts={redAlerts} trips={trips} indents={indents} user={user}
          onLink={(alertId, tripId) => linkAlertToTrip(alertId, tripId)}
          onDismiss={(alertId, reason) => dismissAlert(alertId, reason)}
          onDelete={deleteAlert}
        />
      )}

      {/* Stale indent alerts — trips with diesel estimate but no indent scanned */}
      {staleIndentAlerts.length > 0 && (
        <div style={{background:C.orange+"11",border:`1.5px solid ${C.orange}55`,borderRadius:12,padding:"12px 14px"}}>
          <div style={{color:C.orange,fontWeight:800,fontSize:13,marginBottom:6}}>
            ⏰ {staleIndentAlerts.length} Trip{staleIndentAlerts.length>1?"s":""} Missing Diesel Indent
          </div>
          <div style={{color:C.muted,fontSize:12,marginBottom:8}}>
            These trips have a diesel estimate but no pump slip was scanned
          </div>
          {staleIndentAlerts.map(t => (
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"6px 0",borderBottom:`1px solid ${C.orange}22`}}>
              <div>
                <span style={{fontWeight:700,fontSize:13}}>{t.truckNo}</span>
                <span style={{color:C.muted,fontSize:11,marginLeft:6}}>LR {t.lrNo||"—"} · {t.date}</span>
                {t.dieselIndentNo && <span style={{color:C.orange,fontSize:11,marginLeft:6}}>Indent#{t.dieselIndentNo}</span>}
              </div>
              <span style={{color:C.orange,fontWeight:700,fontSize:13}}>₹{(t.dieselEstimate||0).toLocaleString("en-IN")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <KPI icon="⏳" label="Pending to Credit" value={fmt(totalPending)} color={C.red}
          sub={`across ${pumps.length} pump${pumps.length!==1?"s":""}`} />
        <KPI icon="✅" label="Total Paid" value={fmt(totalPaid)} color={C.green}
          sub={`${(pumpPayments||[]).length} payment${(pumpPayments||[]).length!==1?"s":""}`} />
      </div>

      <PillBar items={[
        {id:"pumps",    label:"By Pump",   color:C.orange},
        {id:"payments", label:`Payments (${(pumpPayments||[]).length})`, color:C.green},
        {id:"indents",  label:`Indents (${confirmedIndents.length})`, color:C.blue},
        {id:"lrmap",    label:"LR ↔ Indent", color:C.teal||C.purple},
        {id:"history",  label:"Alerts", color:C.muted},
      ]} active={view} onSelect={setView} />

      {/* ── PAYMENTS VIEW ── */}
      {view==="payments" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:C.muted,fontSize:12}}>{(pumpPayments||[]).length} payments recorded</div>
            <div style={{color:C.green,fontWeight:800}}>{fmt((pumpPayments||[]).reduce((s,p)=>s+(+p.amount||0),0))}</div>
          </div>
          {(pumpPayments||[]).length === 0 && (
            <div style={{textAlign:"center",color:C.muted,padding:40}}>No payments recorded yet</div>
          )}
          {[...(pumpPayments||[])].sort((a,b)=>b.date.localeCompare(a.date)).map(pp => {
            const pump = pumps.find(p=>p.id===pp.pumpId);
            return (
              <div key={pp.id} style={{background:C.card,borderRadius:12,padding:"12px 14px",
                borderLeft:"3px solid "+C.green}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14}}>{fmt(pp.amount)}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>
                      {pump?.name||"—"} · {pp.date}
                    </div>
                    <div style={{color:C.muted,fontSize:11,marginTop:1}}>
                      UTR: {pp.utr||"—"}
                      {pp.note && <span> · {pp.note}</span>}
                    </div>
                  </div>
                  {user.role==="owner" && (
                    <button onClick={async()=>{
                      if(!window.confirm("Delete payment of "+fmt(pp.amount)+" to "+pump?.name+"?\\nThis will affect pending balance.")) return;
                      deletePumpPayment(pp.id);
                    }} style={{background:"none",border:"1px solid "+C.red+"55",borderRadius:6,
                      color:C.red,fontSize:11,padding:"4px 8px",cursor:"pointer",flexShrink:0,marginLeft:8}}>
                      🗑 Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── BY PUMP VIEW ── */}
      {view==="pumps" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {pumpBalances.map(p => {
            const isExpanded = expandPump === p.id;
            const pPayments = (pumpPayments||[]).filter(pp => pp.pumpId === p.id).sort((a,b)=>b.date.localeCompare(a.date));
            return (
              <div key={p.id} style={{background:C.card,borderRadius:14,overflow:"hidden",
                border:`1.5px solid ${p.pending>0?C.red+"44":C.green+"44"}`}}>

                {/* Pump header — tap to expand */}
                <div style={{padding:"14px 16px",cursor:"pointer"}}
                  onClick={()=>setExpandPump(isExpanded?null:p.id)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:800,fontSize:15}}>{p.name}</div>
                      <div style={{color:C.muted,fontSize:12,marginTop:2}}>{p.pIndents.length} confirmed indents</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:11,color:C.muted}}>Pending to Credit</div>
                      <div style={{color:p.pending>0?C.red:C.green,fontWeight:800,fontSize:20}}>
                        {fmt(Math.max(0,p.pending))}
                      </div>
                    </div>
                  </div>
                  {/* Mini balance bar */}
                  <div style={{marginTop:10,display:"flex",gap:10,fontSize:12}}>
                    <span style={{color:C.muted}}>Total Owed: <b style={{color:C.text}}>{fmt(p.totalOwed)}</b></span>
                    <span style={{color:C.muted}}>Paid: <b style={{color:C.green}}>{fmt(p.totalPaid)}</b></span>
                    <span style={{color:C.muted,marginLeft:"auto"}}>{isExpanded?"▲":"▼"}</span>
                  </div>
                </div>

                {/* Expanded: payment history + record payment */}
                {isExpanded && (
                  <div style={{borderTop:`1px solid ${C.border}22`,padding:"12px 16px",
                    display:"flex",flexDirection:"column",gap:12}}>

                    {/* Record payment — owner only */}
                    {user.role==="owner" && (
                      payPumpId===p.id ? (
                        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",
                          display:"flex",flexDirection:"column",gap:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div style={{color:C.text,fontWeight:700,fontSize:13}}>Record NEFT Payment</div>
                            <ScanPaymentBtn onResult={r=>{
                              if(r.amount) setPayAmt(String(r.amount).replace(/[^0-9.]/g,""));
                              if(r.referenceNo) setPayUtr(r.referenceNo);
                              if(r.paidTo) setPayPaidTo(r.paidTo);
                              if(r.date) {}
                            }} />
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <Field label="Amount ₹" value={payAmt} onChange={setPayAmt} type="number" half
                              note={`Pending: ${fmt(p.pending)}`} />
                            <Field label="UTR / Ref No" value={payUtr} onChange={setPayUtr} half />
                          </div>
                          <Field label="Paid To" value={payPaidTo} onChange={setPayPaidTo} placeholder="Recipient name…" />
                          <Field label="Note (optional)" value={payNote} onChange={setPayNote}
                            placeholder="e.g. 1st–15th Mar payment" />
                          <div style={{display:"flex",gap:8}}>
                            <Btn onClick={recordPumpPayment} full color={C.green}
                              disabled={!payAmt||+payAmt<=0||!payUtr.trim()}>
                              ✓ Record Payment
                            </Btn>
                            <Btn onClick={()=>setPayPumpId(null)} outline color={C.muted}>Cancel</Btn>
                          </div>
                        </div>
                      ) : (
                        <Btn onClick={()=>{setPayPumpId(p.id);setPayAmt(String(Math.max(0,p.pending)));setPayUtr("");setPayPaidTo("");setPayNote("");}}
                          full color={C.green} sm>
                          + Record Payment to {p.name}
                        </Btn>
                      )
                    )}

                    {/* Payment history */}
                    {pPayments.length > 0 && (
                      <div>
                        <div style={{color:C.muted,fontSize:11,fontWeight:700,
                          textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
                          Payment History
                        </div>
                        {pPayments.map(pp => (
                          <div key={pp.id} style={{display:"flex",justifyContent:"space-between",
                            alignItems:"center",padding:"8px 0",
                            borderBottom:`1px solid ${C.border}22`}}>
                            <div>
                              <div style={{fontSize:13,fontWeight:600}}>{fmt(pp.amount)}</div>
                              <div style={{color:C.muted,fontSize:11}}>
                                {pp.date} · UTR: {pp.utr}
                                {pp.note && ` · ${pp.note}`}
                              </div>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <Badge label="Paid" color={C.green} />
                              {user.role==="owner" && (
                                <span style={{color:C.red,fontSize:18,cursor:"pointer",padding:"0 4px"}}
                                  onClick={()=>{if(window.confirm("Delete this payment record?")) deletePumpPayment(pp.id);}}>
                                  ×
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {pPayments.length===0 && (
                      <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:8}}>
                        No payments recorded yet
                      </div>
                    )}

                    {/* Recent indents for this pump */}
                    <div>
                      <div style={{color:C.muted,fontSize:11,fontWeight:700,
                        textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>
                        Confirmed Indents
                      </div>
                      {p.pIndents.slice(0,10).map(i => {
                        const trip = trips.find(t=>t.id===i.tripId);
                        return (
                          <div key={i.id} style={{display:"flex",justifyContent:"space-between",
                            padding:"6px 0",borderBottom:`1px solid ${C.border}11`,fontSize:12}}>
                            <span style={{color:C.muted}}>{i.truckNo} · #{i.indentNo} · {i.date}</span>
                            <div style={{textAlign:"right"}}>
                              <div style={{color:C.text,fontWeight:600}}>{fmt(i.amount)}</div>
                              {(i.hsd>0||i.advance>0) && (
                                <div style={{color:C.muted,fontSize:10}}>
                                  {i.hsd>0&&<span>HSD {fmt(i.hsd)}</span>}
                                  {i.advance>0&&<span style={{marginLeft:4}}>+Adv {fmt(i.advance)}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {p.pIndents.length > 10 && (
                        <div style={{color:C.muted,fontSize:11,textAlign:"center",marginTop:4}}>
                          +{p.pIndents.length-10} more indents
                        </div>
                      )}
                      {p.pIndents.length===0 && (
                        <div style={{color:C.muted,fontSize:12,textAlign:"center",padding:8}}>
                          No confirmed indents yet
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            );
          })}
          {pumps.length===0 && (
            <div style={{textAlign:"center",color:C.muted,padding:32}}>
              No pumps added — tap "+ Pump" to add one
            </div>
          )}
        </div>
      )}

      {/* ── ALL CONFIRMED INDENTS ── */}
      {view==="indents" && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {confirmedIndents.length===0 && (
            <div style={{textAlign:"center",color:C.muted,padding:40}}>No confirmed indents yet</div>
          )}
          {confirmedIndents.map(i => {
            const pump = pumps.find(p=>p.id===i.pumpId);
            const trip = trips.find(t=>t.id===i.tripId);
            return (
              <div key={i.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",
                borderLeft:`3px solid ${i.unmatched||i.truckMismatch||i.amountMismatch ? C.orange : C.green}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13}}>{i.truckNo}
                      <span style={{color:C.muted,fontWeight:400,fontSize:11,marginLeft:6}}>#{i.indentNo}</span>
                    </div>
                    <div style={{color:C.muted,fontSize:11,marginTop:2}}>
                      {i.date} · {pump?.name||"—"}
                    </div>
                    {trip && <div style={{color:C.blue,fontSize:11}}>LR {trip.lrNo||"—"} → {trip.to}</div>}
                    {!trip && i.unmatched && <div style={{color:C.orange,fontSize:11}}>⚠ No LR linked</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <div style={{color:C.text,fontWeight:800,fontSize:14}}>{fmt(i.amount)}</div>
                    {(i.hsd>0||i.advance>0) && (
                      <div style={{color:C.muted,fontSize:10,textAlign:"right"}}>
                        {i.hsd>0 && <span>HSD {fmt(i.hsd)}</span>}
                        {i.advance>0 && <span style={{marginLeft:4}}>+ Adv {fmt(i.advance)}</span>}
                      </div>
                    )}
                    {user.role==="owner" && (
                      <button onClick={async()=>{
                        if(!window.confirm("Delete indent #"+i.indentNo+" for "+i.truckNo+"? This cannot be undone.")) return;
                        setIndents(p=>p.filter(x=>x.id!==i.id));
                        try { await DB.deleteIndent(i.id); }
                        catch(e){ alert("Delete failed: "+e.message); }
                      }} style={{background:"none",border:"1px solid "+C.red+"55",borderRadius:6,
                        color:C.red,fontSize:11,padding:"3px 8px",cursor:"pointer"}}>
                        🗑 Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── LR ↔ INDENT MAPPING ── */}
      {view==="lrmap" && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{color:C.muted,fontSize:12,marginBottom:4}}>
            All trips with linked diesel indents
          </div>
          {trips.filter(t => {
            const ind = confirmedIndents.find(i => i.tripId === t.id);
            return !!ind;
          }).sort((a,b) => b.date.localeCompare(a.date)).map(t => {
            const ind  = confirmedIndents.find(i => i.tripId === t.id);
            const pump = pumps.find(p => p.id === ind?.pumpId);
            const veh  = vehicles?.find(v => v.truckNo === t.truckNo);
            const calc = calcNet(t, veh, ind?.amount||t.dieselEstimate||0);
            const estDiff = ind ? Math.round((ind.amount - (t.dieselEstimate||0)) * 100) / 100 : 0;
            const hasDiscrepancy = estDiff !== 0;
            return (
              <div key={t.id} style={{background:C.card,borderRadius:14,padding:"12px 14px",
                borderLeft:`3px solid ${hasDiscrepancy ? C.orange : C.green}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:13}}>{t.truckNo}
                      <span style={{color:C.muted,fontWeight:400,fontSize:11,marginLeft:6}}>LR {t.lrNo||"—"}</span>
                    </div>
                    <div style={{color:C.muted,fontSize:11}}>{t.date} · {t.to}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{color:C.green,fontWeight:800,fontSize:14}}>{fmt(calc.net)}</div>
                    <div style={{color:C.muted,fontSize:10}}>Net Balance</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:16,fontSize:11,flexWrap:"wrap"}}>
                  <span style={{color:C.muted}}>
                    Indent: <b style={{color:C.text}}>#{ind?.indentNo||"—"}</b>
                  </span>
                  <span style={{color:C.muted}}>
                    Pump: <b style={{color:C.text}}>{pump?.name||"—"}</b>
                  </span>
                  <span style={{color:C.muted}}>
                    Diesel: <b style={{color:hasDiscrepancy?C.orange:C.green}}>₹{ind?.amount||0}</b>
                    {hasDiscrepancy && <span style={{color:C.orange}}> ({estDiff>0?"+":""}{estDiff} vs est)</span>}
                  </span>
                  {t.driverSettled && <Badge label="Settled" color={C.green} />}
                </div>
              </div>
            );
          })}
          {trips.filter(t => confirmedIndents.find(i => i.tripId === t.id)).length === 0 && (
            <div style={{textAlign:"center",color:C.muted,padding:40}}>
              No trips linked to indents yet
            </div>
          )}
        </div>
      )}

      {/* ── ALERT HISTORY VIEW ── */}
      {view==="history" && (()=>{
        // All indents that were ever alerts — dismissed or resolved
        const allAlerts = indents.filter(i =>
          i.unmatched || i.truckMismatch || i.amountMismatch || i.indentMismatch
        ).sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));

        // Apply date filter
        const from = filterFrom||"2000-01-01", to = filterTo||"2099-12-31";
        const filtered = (filterFrom||filterTo)
          ? allAlerts.filter(a => (a.date||a.createdAt?.slice(0,10)||"") >= from && (a.date||a.createdAt?.slice(0,10)||"") <= to)
          : allAlerts;

        const resolved   = filtered.filter(a => a.alertDismissed || a.confirmed);
        const unresolved = filtered.filter(a => !a.alertDismissed && !a.confirmed);

        const typeLabel = a => a.truckMismatch ? "Truck Mismatch" : a.indentMismatch ? "Indent Mismatch" : a.amountMismatch ? "Amount Mismatch" : "No Trip";
        const typeColor = a => a.truckMismatch ? C.red : a.indentMismatch ? C.purple : a.amountMismatch ? C.orange : C.red;
        const statusLabel = a => a.confirmed ? "✅ Resolved" : a.alertDismissed ? "🔕 Dismissed" : "🔴 Open";
        const statusColor = a => a.confirmed ? C.green : a.alertDismissed ? C.muted : C.red;

        return (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {/* Inline date filter */}
            <div style={{background:C.card,borderRadius:10,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                <div style={{flex:1}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:3}}>FROM</div>
                  <input type="date" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}
                    onClick={e=>e.target.showPicker?.()}
                    style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,color:filterFrom?C.text:C.muted,
                      padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"light",WebkitAppearance:"none",boxSizing:"border-box"}} />
                </div>
                <div style={{flex:1}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:3}}>TO</div>
                  <input type="date" value={filterTo} onChange={e=>setFilterTo(e.target.value)}
                    onClick={e=>e.target.showPicker?.()}
                    style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,color:filterTo?C.text:C.muted,
                      padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"light",WebkitAppearance:"none",boxSizing:"border-box"}} />
                </div>
                {(filterFrom||filterTo) && (
                  <Btn onClick={()=>{setFilterFrom("");setFilterTo("");}} sm outline color={C.muted}>Clear</Btn>
                )}
              </div>
              <div style={{color:C.muted,fontSize:12}}>
                {filterFrom||filterTo
                  ? `${filtered.length} of ${allAlerts.length} alerts · ${filterFrom||"all"} → ${filterTo||"all"}`
                  : `All ${allAlerts.length} alerts`}
              </div>
            </div>

            {/* Summary row */}
            {filtered.length > 0 && (
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1,background:C.red+"11",border:"1px solid "+C.red+"33",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{color:C.red,fontWeight:800,fontSize:18}}>{unresolved.length}</div>
                  <div style={{color:C.muted,fontSize:11}}>Open</div>
                </div>
                <div style={{flex:1,background:C.green+"11",border:"1px solid "+C.green+"33",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{color:C.green,fontWeight:800,fontSize:18}}>{resolved.filter(a=>a.confirmed).length}</div>
                  <div style={{color:C.muted,fontSize:11}}>Resolved</div>
                </div>
                <div style={{flex:1,background:C.card,border:"1px solid "+C.border,borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{color:C.muted,fontWeight:800,fontSize:18}}>{resolved.filter(a=>a.alertDismissed&&!a.confirmed).length}</div>
                  <div style={{color:C.muted,fontSize:11}}>Dismissed</div>
                </div>
              </div>
            )}

            {filtered.length === 0 && (
              <div style={{textAlign:"center",color:C.muted,padding:40}}>
                No alerts in this period
              </div>
            )}

            {/* Alert cards */}
            {filtered.map(a => {
              const pump = pumps.find(p=>p.id===a.pumpId);
              const trip = trips.find(t=>t.id===a.tripId);
              return (
                <div key={a.id} style={{background:C.card,borderRadius:12,padding:"12px 14px",
                  borderLeft:"3px solid "+(a.confirmed?C.green:a.alertDismissed?C.muted:typeColor(a))}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:13}}>{a.truckNo}</span>
                        {a.indentNo && <span style={{color:C.muted,fontSize:11}}>#{a.indentNo}</span>}
                        <span style={{background:typeColor(a)+"22",color:typeColor(a),fontSize:10,
                          fontWeight:700,padding:"2px 6px",borderRadius:6}}>{typeLabel(a)}</span>
                        <span style={{background:statusColor(a)+"22",color:statusColor(a),fontSize:10,
                          fontWeight:700,padding:"2px 6px",borderRadius:6}}>{statusLabel(a)}</span>
                      </div>
                      <div style={{color:C.muted,fontSize:11,marginTop:3}}>
                        {a.date} · {pump?.name||"—"}
                        {trip && <span style={{color:C.blue}}> · LR {trip.lrNo}</span>}
                      </div>
                      {a.alertDismissed && a.dismissReason && (
                        <div style={{color:C.muted,fontSize:11,marginTop:2,fontStyle:"italic"}}>
                          Dismissed by {a.dismissedBy||"—"}: "{a.dismissReason}"
                        </div>
                      )}
                      {a.confirmed && trip && (
                        <div style={{color:C.green,fontSize:11,marginTop:2}}>
                          Linked to LR {trip.lrNo} → {trip.to}
                        </div>
                      )}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                      <div style={{color:C.text,fontWeight:800,fontSize:14}}>{fmt(a.amount)}</div>
                      {a.pumpTotal > 0 && a.pumpTotal !== a.amount && (
                        <div style={{color:C.muted,fontSize:10}}>Pump: {fmt(a.pumpTotal)}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── CONFIRM AMOUNT SHEET ── */}
      {confirmFlow && (
        <ConfirmDieselSheet
          indent={confirmFlow}
          trips={trips}
          onConfirm={(amount) => { confirmIndent(confirmFlow.id, amount); setConfirmFlow(null); }}
          onCancel={() => setConfirmFlow(null)}
        />
      )}

      {/* ── SCAN PUMP SLIP SHEET ── */}
      {scanSheet && (
        <Sheet title="📷 Scan Pump Slip" onClose={()=>{setScanSheet(false);setScanResults(null);setScanSummary(null);}}>

          {/* Pump selector at top — set default for all scan entries */}
          {pumps.length > 1 && !scanSummary && (
            <div style={{background:C.card,borderRadius:10,padding:"10px 14px",marginBottom:12}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:6,letterSpacing:1}}>
                ⛽ SELECT PUMP FOR THIS SLIP
              </div>
              <select
                value={scanResults?.[0]?.pumpId||""}
                onChange={e=>{
                  const pid=e.target.value;
                  setScanResults(p=>p?p.map(r=>({...r,pumpId:pid})):p);
                }}
                style={{background:C.bg,border:"1.5px solid "+C.orange,borderRadius:8,
                  color:C.text,padding:"9px 12px",fontSize:14,width:"100%",fontWeight:700}}>
                <option value="">— Select pump —</option>
                {pumps.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {(!scanResults?.[0]?.pumpId) && (
                <div style={{color:C.orange,fontSize:11,marginTop:4}}>
                  ⚠ Select pump before scanning or saving
                </div>
              )}
            </div>
          )}

          {/* Post-save summary */}
          {scanSummary && (
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
              <div style={{background:C.green+"11",border:`1.5px solid ${C.green}44`,
                borderRadius:12,padding:"14px 16px"}}>
                <div style={{color:C.green,fontWeight:800,fontSize:15,marginBottom:4}}>
                  ✓ {scanSummary.saved} indent{scanSummary.saved!==1?"s":""} saved & confirmed
                </div>
                <div style={{color:C.muted,fontSize:13}}>
                  Diesel amounts deducted from driver net pay automatically
                </div>
              </div>
              {scanSummary.flagged > 0 && (
                <div style={{background:C.red+"11",border:`1.5px solid ${C.red}44`,
                  borderRadius:12,padding:"14px 16px"}}>
                  <div style={{color:C.red,fontWeight:800,fontSize:15,marginBottom:4}}>
                    🚨 {scanSummary.flagged} alert{scanSummary.flagged!==1?"s":""} flagged — action needed
                  </div>
                  <div style={{color:C.muted,fontSize:13}}>
                    Visible in the red alert banner below — tap each to resolve
                  </div>
                </div>
              )}
              <Btn onClick={()=>{setScanSheet(false);setScanSummary(null);}} full color={C.blue}>
                Done — View Diesel Page
              </Btn>
            </div>
          )}

          {!scanSummary && <PumpSlipScanner
            pumps={pumps} trips={trips} user={user}
            onResults={results => setScanResults(results)}
          />}
          {!scanSummary && scanResults && (()=>{
            const greenList   = scanResults.filter(r=>r.trip&&!r.truckMismatch&&!r.amountMismatch&&!r.indentMismatch);
            const mismatchList= scanResults.filter(r=>!r.trip||r.truckMismatch||r.amountMismatch||r.indentMismatch);
            const selMismatch = scanResults.filter(r=>r._waSelected);
            return (
            <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{color:C.text,fontWeight:800,fontSize:14}}>Review Extracted Entries</div>

              {/* ── GREEN entries ── */}
              {greenList.length>0 && (
                <div style={{color:C.green,fontWeight:700,fontSize:12,marginTop:4}}>
                  ✅ {greenList.length} MATCHED — will be saved
                </div>
              )}
              {greenList.map((r,i)=>{
                const idx=scanResults.indexOf(r);
                return (
                <div key={idx} style={{background:C.bg,borderRadius:10,padding:"12px 14px",
                  border:"1.5px solid "+C.green+"66"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14}}>{r.truckNo}</div>
                      <div style={{color:C.muted,fontSize:12}}>Indent: {r.indentNo} · {r.date}</div>
                      <div style={{color:C.green,fontSize:12}}>
                        ✓ LR {r.trip.lrNo||"—"} · Est Rs.{r.estDiesel} = HSD+Adv Rs.{r.pumpTotal} ✓
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                      <div style={{color:C.green,fontWeight:800,fontSize:15}}>Rs.{r.amount}</div>
                      {r.advance>0&&<div style={{color:C.muted,fontSize:12}}>+Adv Rs.{r.advance}</div>}
                    </div>
                  </div>
                  <div style={{marginTop:8}}>
                    <div style={{color:C.muted,fontSize:10,fontWeight:700,marginBottom:4,letterSpacing:1}}>LINK TO PUMP</div>
                    <select value={r.pumpId||""} onChange={e=>setScanResults(p=>p.map((x,j)=>j===idx?{...x,pumpId:e.target.value}:x))}
                      style={{background:C.bg,border:"1.5px solid "+C.green+"55",borderRadius:8,color:C.text,padding:"8px 10px",fontSize:13,width:"100%"}}>
                      <option value="">— Select pump —</option>
                      {pumps.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              );})}

              {/* ── MISMATCH entries ── */}
              {mismatchList.length>0 && (
                <div style={{color:C.red,fontWeight:700,fontSize:12,marginTop:4}}>
                  🚨 {mismatchList.length} MISMATCH — select to send WhatsApp
                </div>
              )}
              {mismatchList.map((r,i)=>{
                const idx=scanResults.indexOf(r);
                const reason=!r.trip?(r.indentNo?"No LR for indent #"+r.indentNo:"No indent on slip"):r.truckMismatch?"Truck mismatch: LR has "+r.trip.truckNo:r.amountMismatch?"Amount: Rs."+r.pumpTotal+" != Est Rs."+r.estDiesel:"Indent mismatch";
                return (
                <div key={idx} style={{background:C.bg,borderRadius:10,padding:"12px 14px",
                  border:"1.5px solid "+(r._waSelected?C.orange:C.red+"44")}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14}}>{r.truckNo}</div>
                      {r.indentNo&&<div style={{color:C.muted,fontSize:12}}>Indent: {r.indentNo} · {r.date}</div>}
                      <div style={{color:C.red,fontSize:12}}>🚨 {reason}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                      <div style={{color:C.orange,fontWeight:800,fontSize:15}}>Rs.{r.amount}</div>
                      {r.advance>0&&<div style={{color:C.red,fontSize:12}}>+Adv Rs.{r.advance}</div>}
                      <label style={{display:"flex",alignItems:"center",gap:6,marginTop:6,cursor:"pointer",justifyContent:"flex-end"}}>
                        <input type="checkbox" checked={!!r._waSelected}
                          onChange={e=>setScanResults(p=>p.map((x,j)=>j===idx?{...x,_waSelected:e.target.checked}:x))}
                          style={{width:16,height:16,accentColor:C.orange}} />
                        <span style={{color:C.orange,fontSize:12,fontWeight:700}}>WA</span>
                      </label>
                    </div>
                  </div>
                </div>
              );})}

              {/* ── Actions ── */}
              <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:4}}>
                {mismatchList.length>0 && (
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setScanResults(p=>p.map(r=>({...r,_waSelected:!r.trip||r.truckMismatch||r.amountMismatch||r.indentMismatch})))}
                      style={{flex:1,background:C.orange+"22",border:"1px solid "+C.orange+"55",borderRadius:8,
                        color:C.orange,fontSize:12,fontWeight:700,padding:"8px",cursor:"pointer"}}>
                      Select All Mismatches
                    </button>
                    <button onClick={()=>setScanResults(p=>p.map(r=>({...r,_waSelected:false})))}
                      style={{flex:1,background:C.card,border:"1px solid "+C.border,borderRadius:8,
                        color:C.muted,fontSize:12,fontWeight:700,padding:"8px",cursor:"pointer"}}>
                      Deselect All
                    </button>
                  </div>
                )}
                {selMismatch.length>0 && (
                  <Btn onClick={()=>{
                    const lines=selMismatch.map(r=>{
                      const issue=!r.trip?(r.indentNo?"No LR for indent #"+r.indentNo:"No indent on slip"):r.truckMismatch?"Truck mismatch":r.amountMismatch?"Amount mismatch":"Indent mismatch";
                      return r.truckNo+" | Indent:"+(r.indentNo||"--")+" | Rs."+r.amount+(r.advance>0?" +Adv Rs."+r.advance:"")+" | "+issue;
                    }).join("\n");
                    const msg="DIESEL MISMATCH - "+today()+"\n\n"+lines+"\n\nPlease verify and update trips.";
                    window.open("https://wa.me/?text="+encodeURIComponent(msg),"_blank");
                  }} full color={C.orange} sm>
                    📱 Send {selMismatch.length} Selected to WhatsApp
                  </Btn>
                )}
                {greenList.length>0 && (
                  <Btn onClick={confirmScanned} full color={C.green}>
                    ✓ Save {greenList.length} Matched Indent{greenList.length!==1?"s":""}
                  </Btn>
                )}
                {greenList.length===0 && (
                  <div style={{textAlign:"center",color:C.muted,fontSize:12,padding:"8px 0"}}>
                    No matched indents to save — resolve mismatches first
                  </div>
                )}
              </div>
            </div>
            );
          })()}
        </Sheet>
      )}

      {/* ── ADD PUMP SHEET ── */}
      {pumpSheet && (
        <Sheet title="Add Pump Account" onClose={()=>setPumpSheet(false)}>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <Field label="Pump Name"    value={pf.name}      onChange={v=>setPf(p=>({...p,name:v}))} placeholder="Sedam Fuel Station" />
            <Field label="Contact No"   value={pf.contact}   onChange={v=>setPf(p=>({...p,contact:v}))} type="tel" />
            <Field label="Address"      value={pf.address}   onChange={v=>setPf(p=>({...p,address:v}))} />
            <Field label="Bank A/C No"  value={pf.accountNo} onChange={v=>setPf(p=>({...p,accountNo:v}))} />
            <Field label="IFSC Code"    value={pf.ifsc}      onChange={v=>setPf(p=>({...p,ifsc:v}))} />
            <Btn onClick={()=>{const p={...pf,id:uid(),createdBy:user.username}; setPumps(prev=>[...prev,p]); log("ADD PUMP",p.name); setPf(blankP); setPumpSheet(false);}} full color={C.blue}>Save Pump</Btn>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ─── VEHICLES ─────────────────────────────────────────────────────────────────
function Vehicles({trips, setTrips, vehicles, setVehicles, driverPays, user, log}) {
  const isOwner = user.role === "owner";
  const [sheet,    setSheet]    = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [lSheet,   setLSheet]   = useState(null);  // loan management
  const [sSheet,   setSSheet]   = useState(null);  // shortage management
  const [hSheet,   setHSheet]   = useState(null);  // full history
  const [search,   setSearch]   = useState("");

  // Loan txn form
  const [lAmt,  setLAmt]  = useState(""); const [lDate,  setLDate]  = useState(new Date().toISOString().slice(0,10));
  const [lRef,  setLRef]  = useState(""); const [lAcct,  setLAcct]  = useState("");
  // Recovery form  
  const [rAmt,  setRAmt]  = useState(""); const [rDate,  setRDate]  = useState(new Date().toISOString().slice(0,10));
  const [rLR,   setRLR]   = useState(""); const [rRef,   setRRef]   = useState("");
  // Shortage form
  const [shAmt, setShAmt] = useState(""); const [shTrip, setShTrip] = useState("");
  // Shortage recovery form
  const [srAmt, setSrAmt] = useState(""); const [srLR,   setSrLR]   = useState("");

  const blank = {
    truckNo:"", ownerName:"", phone:"",
    driverName:"", driverPhone:"", driverLicense:"",
    accountNo:"", ifsc:"",
    loan:"0", loanRecovered:"0", deductPerTrip:"0", tafalExempt:false,
  };
  const [f, setF] = useState(blank);
  const ff = k => v => setF(p => ({...p,[k]:v}));

  const fmt  = n => Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:0});
  const fmtD = s => { if(!s) return "—"; const d=new Date(s); return isNaN(d)?s:d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); };
  const today = () => new Date().toISOString().slice(0,10);

  const filtered = (vehicles||[]).filter(v => {
    if(!search) return true;
    const q = search.toLowerCase();
    return (v.truckNo||"").toLowerCase().includes(q)
        || (v.ownerName||"").toLowerCase().includes(q)
        || (v.driverName||"").toLowerCase().includes(q)
        || (v.phone||"").includes(q)
        || (v.driverPhone||"").includes(q);
  });

  const resetLoanForm = () => { setLAmt(""); setLDate(today()); setLRef(""); setLAcct(""); setRAmt(""); setRDate(today()); setRLR(""); setRRef(""); };
  const resetShForm   = () => { setShAmt(""); setShTrip(""); setSrAmt(""); setSrLR(""); };

  // Phone-only edit for non-owners
  const [phoneEditId,  setPhoneEditId]  = useState(null);
  const [phoneEditVal, setPhoneEditVal] = useState("");

  // ── PDF EXPORT ──────────────────────────────────────────────────────────────
  const exportVehiclePDF = (v) => {
    const vtrips = (trips||[]).filter(t => t.truckNo===v.truckNo || t.truck===v.truckNo)
                               .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    const pays = (driverPays||[]).filter(p => p.truckNo===v.truckNo);
    const totalPaid = pays.reduce((s,p)=>s+(p.amount||0),0);
    const loanBal = (v.loan||0)-(v.loanRecovered||0);
    const loanTxns = v.loanTxns||[];
    const shortageTxns = v.shortageTxns||[];

    const tripRows = vtrips.map(t => {
      const isMultiDI = t.diLines&&t.diLines.length>1;
      const gross = isMultiDI ? t.diLines.reduce((s,d)=>s+(d.qty||0)*(d.givenRate||0),0) : (t.qty||0)*(t.givenRate||0);
      const net = gross-(t.advance||0)-(t.tafal||0)-(t.dieselEstimate||0);
      const shortAmt = (t.shortage||0)*(t.givenRate||0);
      return `<tr>
        <td>${t.lrNo||"—"}</td><td>${fmtD(t.date)}</td>
        <td>${t.from||"—"} → ${t.to||"—"}</td><td>${t.qty||0} MT</td>
        <td>₹${fmt(t.billedToShree||0)}</td><td>₹${fmt(gross)}</td>
        <td>${(t.shortage||0)>0?`${t.shortage}MT (₹${fmt(shortAmt)})`:"—"}</td>
        <td>₹${fmt(net)}</td>
        <td style="color:${t.driverSettled?"#1a7f37":"#b45309"}">${t.driverSettled?"Settled":"Pending"}</td>
      </tr>`;
    }).join("");

    const loanGivenRows = loanTxns.filter(x=>x.type==="given").map(x=>`<tr>
      <td>${fmtD(x.date)}</td><td>₹${fmt(x.amount)}</td>
      <td>${x.ref||"—"}</td><td>${x.accountName||"—"}</td><td>${x.note||"—"}</td>
    </tr>`).join("");

    const loanRecoveryRows = loanTxns.filter(x=>x.type==="recovery").map(x=>`<tr>
      <td>${fmtD(x.date)}</td><td>₹${fmt(x.amount)}</td>
      <td>${x.lrNo||"—"}</td><td>${x.ref||"—"}</td><td>${x.note||"—"}</td>
    </tr>`).join("");

    const shortageRows = shortageTxns.filter(x=>x.type==="shortage").map(x=>`<tr>
      <td>${fmtD(x.date)}</td><td>${x.qty||0} MT</td>
      <td>${x.lrNo||"—"}</td><td>₹${fmt(x.amount||0)}</td><td>${x.note||"—"}</td>
    </tr>`).join("");

    const shortRecovRows = shortageTxns.filter(x=>x.type==="recovery").map(x=>`<tr>
      <td>${fmtD(x.date)}</td><td>${x.qty||0} MT</td>
      <td>${x.lrNo||"—"}</td><td>₹${fmt(x.amount||0)}</td><td>${x.note||"—"}</td>
    </tr>`).join("");

    const payRows = pays.map(p=>`<tr>
      <td>${fmtD(p.date)}</td><td>${p.lrNo||"—"}</td>
      <td>${p.referenceNo||"—"}</td><td>₹${fmt(p.amount)}</td><td>${p.note||"—"}</td>
    </tr>`).join("");

    const html = `<style>
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;margin:20px}
      h1{font-size:18px;margin-bottom:2px} h2{font-size:13px;color:#333;margin:18px 0 5px;border-bottom:2px solid #eee;padding-bottom:4px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;margin:10px 0 16px;font-size:11px}
      .meta span{color:#555} .meta b{color:#111}
      .kpis{display:flex;gap:12px;margin:12px 0;flex-wrap:wrap}
      .kpi{border:1px solid #ddd;border-radius:6px;padding:8px 14px;min-width:90px;text-align:center}
      .kpi .val{font-size:15px;font-weight:800} .kpi .lbl{font-size:9px;color:#888;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:10px}
      th{background:#f4f4f4;padding:5px 7px;text-align:left;border:1px solid #ccc;font-size:9px;text-transform:uppercase}
      td{padding:4px 7px;border:1px solid #e0e0e0} tr:nth-child(even){background:#fafafa}
      .footer{margin-top:20px;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:8px}
      .empty{color:#999;font-style:italic;font-size:11px;padding:6px 0}
    </style>
    <h1>🚛 Vehicle Report — ${v.truckNo}</h1>
    <div style="font-size:11px;color:#888">Generated by M Yantra Enterprises · ${new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</div>
    <div class="meta">
      <div><span>Owner: </span><b>${v.ownerName||"—"}</b></div>
      <div><span>Owner Phone: </span><b>${v.phone||"—"}</b></div>
      <div><span>Driver: </span><b>${v.driverName||"—"}</b></div>
      <div><span>Driver Phone: </span><b>${v.driverPhone||"—"}</b></div>
      <div><span>License: </span><b>${v.driverLicense||"—"}</b></div>
      <div><span>Bank A/C: </span><b>${v.accountNo||"—"}${v.ifsc?` · IFSC: ${v.ifsc}`:""}</b></div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="val" style="color:#1d4ed8">${vtrips.length}</div><div class="lbl">TOTAL TRIPS</div></div>
      <div class="kpi"><div class="val" style="color:#15803d">₹${fmt(totalPaid)}</div><div class="lbl">TOTAL PAID</div></div>
      <div class="kpi"><div class="val" style="color:${loanBal>0?"#dc2626":"#15803d"}">₹${fmt(loanBal)}</div><div class="lbl">LOAN BALANCE</div></div>
      <div class="kpi"><div class="val" style="color:#d97706">₹${fmt((v.shortageOwed||0)-(v.shortageRecovered||0))}</div><div class="lbl">SHORTAGE BALANCE</div></div>
      <div class="kpi"><div class="val" style="color:#7c3aed">${vtrips.filter(t=>!t.driverSettled).length}</div><div class="lbl">UNSETTLED</div></div>
    </div>

    <h2>📦 Trip History (${vtrips.length})</h2>
    ${vtrips.length===0?'<div class="empty">No trips recorded.</div>':`<table><tr><th>LR No</th><th>Date</th><th>Route</th><th>Qty</th><th>Billed</th><th>Gross</th><th>Shortage</th><th>Net</th><th>Status</th></tr>${tripRows}</table>`}

    <h2>💳 Driver Payment History (${pays.length})</h2>
    ${pays.length===0?'<div class="empty">No payments recorded.</div>':`<table><tr><th>Date</th><th>LR No</th><th>Reference</th><th>Amount</th><th>Note</th></tr>${payRows}</table>`}

    <h2>🏦 Loan Ledger — Given (${loanTxns.filter(x=>x.type==="given").length})</h2>
    ${loanGivenRows?`<table><tr><th>Date</th><th>Amount</th><th>Reference</th><th>Account</th><th>Note</th></tr>${loanGivenRows}</table>`:'<div class="empty">No loan disbursements recorded.</div>'}

    <h2>🏦 Loan Ledger — Recoveries (${loanTxns.filter(x=>x.type==="recovery").length})</h2>
    ${loanRecoveryRows?`<table><tr><th>Date</th><th>Amount</th><th>LR No</th><th>Reference</th><th>Note</th></tr>${loanRecoveryRows}</table>`:'<div class="empty">No loan recoveries recorded.</div>'}

    <table style="max-width:380px;margin-top:8px">
      <tr><th>Total Loan Given</th><td>₹${fmt(v.loan||0)}</td></tr>
      <tr><th>Recovered</th><td>₹${fmt(v.loanRecovered||0)}</td></tr>
      <tr><th style="color:#dc2626">Balance Due</th><td style="font-weight:800;color:${loanBal>0?"#dc2626":"#15803d"}">₹${fmt(loanBal)}</td></tr>
      <tr><th>Deduct / Trip</th><td>₹${fmt(v.deductPerTrip||0)}</td></tr>
    </table>

    <h2>⚠ Shortage Ledger (${shortageTxns.filter(x=>x.type==="shortage").length})</h2>
    ${shortageRows?`<table><tr><th>Date</th><th>Qty</th><th>LR No</th><th>Amount</th><th>Note</th></tr>${shortageRows}</table>`:'<div class="empty">No shortages recorded.</div>'}

    <h2>⚠ Shortage Recoveries (${shortageTxns.filter(x=>x.type==="recovery").length})</h2>
    ${shortRecovRows?`<table><tr><th>Date</th><th>Qty</th><th>LR No</th><th>Amount</th><th>Note</th></tr>${shortRecovRows}</table>`:'<div class="empty">No shortage recoveries recorded.</div>'}

    <table style="max-width:380px;margin-top:8px">
      <tr><th>Total Shortage</th><td>₹${fmt(v.shortageOwed||0)}</td></tr>
      <tr><th>Recovered</th><td>₹${fmt(v.shortageRecovered||0)}</td></tr>
      <tr><th>Balance Owed</th><td style="font-weight:800;color:#d97706">₹${fmt((v.shortageOwed||0)-(v.shortageRecovered||0))}</td></tr>
    </table>

    <div class="footer">M Yantra Enterprises · PAN: ABBFM6370M · GSTN: 29ABBFM6370M1ZR · Report generated ${new Date().toLocaleString("en-IN")}</div>`;

    const w = window.open("","_blank");
    w.document.write(`<!DOCTYPE html><html><head><title>${v.truckNo} — Vehicle Report</title></head><body onload="window.print()">${html}</body></html>`);
    w.document.close();
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:C.accent,fontWeight:800,fontSize:16}}>🚛 Vehicles & Drivers</div>
        {isOwner && <Btn onClick={()=>{setEditId(null);setF(blank);setSheet(true);}} sm>+ Add</Btn>}
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <KPI icon="🔴" label="Loan Due"       value={fmt((vehicles||[]).reduce((s,v)=>s+Math.max(0,(v.loan||0)-(v.loanRecovered||0)),0))} color={C.red} />
        <KPI icon="🚛" label="Total Vehicles"  value={(vehicles||[]).length} color={C.blue} />
      </div>

      {/* Search */}
      <div style={{position:"relative"}}>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#4a7090",pointerEvents:"none"}}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search truck no, owner, driver…"
          style={{width:"100%",boxSizing:"border-box",background:C.bg,border:`1px solid ${C.border}`,
            borderRadius:10,padding:"9px 12px 9px 34px",color:C.text,fontSize:13,outline:"none"}}/>
        {search&&<button onClick={()=>setSearch("")}
          style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
            background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button>}
      </div>
      {search&&<div style={{fontSize:11,color:C.muted}}>{filtered.length} of {(vehicles||[]).length} vehicles</div>}

      {/* ── PHONE-ONLY EDIT SHEET (non-owner) ── */}
      {phoneEditId && (()=>{
        const v = vehicles.find(x=>x.id===phoneEditId);
        if(!v) return null;
        return (
          <Sheet title={`📞 Update Phone — ${v.truckNo}`} onClose={()=>{setPhoneEditId(null);setPhoneEditVal("");}}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
                <div style={{color:C.muted,fontSize:12,marginBottom:4}}>Truck: <b style={{color:C.text}}>{v.truckNo}</b></div>
                <div style={{color:C.muted,fontSize:12}}>Driver: <b style={{color:C.text}}>{v.driverName||"—"}</b></div>
              </div>
              <Field label="Driver Phone *" value={phoneEditVal} onChange={setPhoneEditVal} type="tel" placeholder="9XXXXXXXXX"
                note="Enter 10-digit mobile number" />
              <Btn onClick={()=>{
                const raw = (phoneEditVal||"").replace(/\D/g,"");
                if(!raw){alert("Phone number is required");return;}
                if(raw.length!==10){alert(`Must be 10 digits (entered ${raw.length})`);return;}
                if(!/^[6-9]/.test(raw)){alert("Must start with 6, 7, 8 or 9");return;}
                setVehicles(p=>p.map(x=>x.id===phoneEditId?{...x,driverPhone:raw}:x));
                log("UPDATE DRIVER PHONE",`${v.truckNo} → ${raw}`);
                setPhoneEditId(null); setPhoneEditVal("");
              }} full color={C.blue}>Save Phone Number</Btn>
            </div>
          </Sheet>
        );
      })()}

      {/* ── ADD / EDIT SHEET ── */}
      {sheet && (
        <Sheet title={editId ? `Edit — ${f.truckNo}` : "Register Vehicle"} onClose={()=>{setSheet(false);setF(blank);setEditId(null);}}>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <div style={{color:C.blue,fontSize:11,fontWeight:700,letterSpacing:1}}>TRUCK INFO</div>
            <div style={{display:"flex",gap:10}}>
              <Field label="Truck No *" value={f.truckNo} onChange={ff("truckNo")} half />
              <Field label="Owner Name" value={f.ownerName} onChange={ff("ownerName")} half />
            </div>
            <Field label="Owner Phone" value={f.phone||""} onChange={ff("phone")} type="tel" />

            <div style={{color:C.orange,fontSize:11,fontWeight:700,letterSpacing:1,marginTop:4}}>DRIVER INFO</div>
            <div style={{display:"flex",gap:10}}>
              <Field label="Driver Name *" value={f.driverName||""} onChange={ff("driverName")} half />
              <Field label="Driver Phone *" value={f.driverPhone||""} onChange={ff("driverPhone")} type="tel" half />
            </div>
            <Field label="Driver License No" value={f.driverLicense||""} onChange={ff("driverLicense")} placeholder="e.g. KA0320180012345" />

            <div style={{color:C.green,fontSize:11,fontWeight:700,letterSpacing:1,marginTop:4}}>BANK DETAILS</div>
            <div style={{display:"flex",gap:10}}>
              <Field label="Bank A/C No" value={f.accountNo||""} onChange={ff("accountNo")} half />
              <Field label="IFSC Code"   value={f.ifsc||""}      onChange={ff("ifsc")}      half />
            </div>

            <div style={{color:C.red,fontSize:11,fontWeight:700,letterSpacing:1,marginTop:4}}>LOAN / DEDUCTIONS</div>
            <div style={{display:"flex",gap:10}}>
              <Field label="Loan ₹"       value={f.loan}          onChange={ff("loan")}          type="number" half />
              <Field label="Recovered ₹"  value={f.loanRecovered}  onChange={ff("loanRecovered")}  type="number" half />
            </div>
            <Field label="Deduct Per Trip ₹" value={f.deductPerTrip} onChange={ff("deductPerTrip")} type="number" />
            <div style={{display:"flex",gap:10,alignItems:"center",padding:"4px 0"}}>
              <input type="checkbox" checked={f.tafalExempt} onChange={e=>setF(p=>({...p,tafalExempt:e.target.checked}))} style={{width:20,height:20}} />
              <span style={{color:C.text,fontSize:15}}>TAFAL Exempt</span>
            </div>

            {(!f.driverName.trim() || !f.driverPhone.trim() || (f.driverPhone.replace(/\\D/g,"").length!==10)) && (
              <div style={{background:`${C.orange}08`,border:`1px solid ${C.orange}44`,borderRadius:8,
                padding:"8px 12px",fontSize:12,color:C.orange}}>
                {!f.driverName.trim() && <div>⚠ Driver Name is mandatory</div>}
                {!f.driverPhone.trim() && <div>⚠ Driver Phone is mandatory</div>}
                {f.driverPhone.trim() && f.driverPhone.replace(/\\D/g,"").length!==10 &&
                  <div>⚠ Driver Phone must be 10 digits ({f.driverPhone.replace(/\\D/g,"").length} entered)</div>}
                {f.driverPhone.replace(/\\D/g,"").length===10 && !/^[6-9]/.test(f.driverPhone.replace(/\\D/g,"")) &&
                  <div>⚠ Phone must start with 6, 7, 8 or 9</div>}
              </div>
            )}

            <Btn onClick={()=>{
              if(!f.truckNo.trim()){alert("Truck No is required.\nಟ್ರಕ್ ನಂಬರ್ ಕಡ್ಡಾಯ.");return;}
              if(!f.driverName.trim()){alert("Driver Name is mandatory.\nಡ್ರೈವರ್ ಹೆಸರು ಕಡ್ಡಾಯ.");return;}
              const rawPhone = (f.driverPhone||"").replace(/\\D/g,"");
              if(!rawPhone){alert("Driver Phone is mandatory.\nಡ್ರೈವರ್ ಫೋನ್ ಕಡ್ಡಾಯ.");return;}
              if(rawPhone.length!==10){alert(`Driver Phone must be 10 digits (entered ${rawPhone.length}).\nಡ್ರೈವರ್ ಫೋನ್ 10 ಅಂಕಿಗಳಾಗಿರಬೇಕು (${rawPhone.length} ನಮೂದಿಸಲಾಗಿದೆ).`);return;}
              if(!/^[6-9]/.test(rawPhone)){alert("Driver Phone must start with 6, 7, 8 or 9");return;}
              if(editId) {
                setVehicles(p=>p.map(v=>v.id===editId?{...v,...f,
                  loan:+f.loan,loanRecovered:+f.loanRecovered,deductPerTrip:+f.deductPerTrip,
                  truckNo:f.truckNo.toUpperCase().trim()}:v));
                log("EDIT VEHICLE",`${f.truckNo} updated`);
              } else {
                const v={...f,id:uid(),
                  truckNo:f.truckNo.toUpperCase().trim(),
                  loan:+f.loan,loanRecovered:+f.loanRecovered,deductPerTrip:+f.deductPerTrip,
                  loanTxns:[],shortageTxns:[],createdBy:user.username};
                setVehicles(p=>[...(p||[]),v]);
                log("ADD VEHICLE",`${v.truckNo} driver:${v.driverPhone}`);
              }
              setF(blank); setSheet(false); setEditId(null);
            }} full>{editId?"Save Changes":"Save Vehicle"}</Btn>

            {editId && isOwner && (
              <Btn color={C.red} outline full onClick={async ()=>{
                if(!window.confirm(`Delete vehicle ${f.truckNo}? This cannot be undone.`)) return;
                setVehicles(p=>p.filter(v=>v.id!==editId));
                log("DELETE VEHICLE",f.truckNo);
                setSheet(false);setEditId(null);setF(blank);
                try { await DB.deleteVehicle(editId); }
                catch(e) {
                  alert("Failed to delete from database: "+e.message);
                  // Reload vehicles to restore if DB delete failed
                }
              }}>🗑 Delete Vehicle</Btn>
            )}
          </div>
        </Sheet>
      )}

      {/* ── LOAN MANAGEMENT SHEET ── */}
      {lSheet&&(()=>{
        const v = vehicles.find(x=>x.id===lSheet);
        if(!v) return null;
        const bal = (v.loan||0)-(v.loanRecovered||0);
        const loanTxns = v.loanTxns||[];
        // Same-owner filter: owner can see all LRs; others see only vehicles with same owner
        const sameOwnerTrucks = isOwner
          ? null  // null means no filter
          : new Set((vehicles||[]).filter(x=>x.ownerName&&x.ownerName===v.ownerName).map(x=>x.truckNo));
        const vtrips = (trips||[]).filter(t=>{
          if(t.driverSettled) return false;
          if(sameOwnerTrucks===null) return true;  // owner sees all
          return sameOwnerTrucks.has(t.truckNo)||sameOwnerTrucks.has(t.truck);
        });
        return (
          <Sheet title={`🏦 Loan — ${v.truckNo}`} onClose={()=>{setLSheet(null);resetLoanForm();}}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {/* Balance summary */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                {[{l:"Loan Given",v:fmt(v.loan||0),c:C.red},{l:"Recovered",v:fmt(v.loanRecovered||0),c:C.green},{l:"Balance",v:fmt(bal),c:bal>0?C.accent:C.green}].map(x=>(
                  <div key={x.l} style={{background:C.bg,borderRadius:10,padding:12,textAlign:"center"}}>
                    <div style={{color:x.c,fontWeight:800}}>{x.v}</div>
                    <div style={{color:C.muted,fontSize:10}}>{x.l}</div>
                  </div>
                ))}
              </div>

              {/* Give Loan */}
              <div style={{background:C.bg,borderRadius:12,padding:14}}>
                <div style={{color:C.red,fontWeight:700,fontSize:12,marginBottom:10}}>➕ Give Loan</div>
                <div style={{display:"flex",gap:10}}>
                  <Field label="Amount ₹ *" value={lAmt} onChange={setLAmt} type="number" half />
                  <Field label="Date"        value={lDate} onChange={setLDate} type="date"   half />
                </div>
                <div style={{display:"flex",gap:10}}>
                  <Field label="Reference / Cheque No" value={lRef}  onChange={setLRef}  half />
                  <Field label="Account Name"           value={lAcct} onChange={setLAcct} half />
                </div>
                <Btn onClick={()=>{
                  if(!lAmt||+lAmt<=0){alert("Enter loan amount.\nಸಾಲದ ಮೊತ್ತ ನಮೂದಿಸಿ.");return;}
                  const txn={id:uid(),type:"given",date:lDate,amount:+lAmt,ref:lRef,accountName:lAcct,note:""};
                  setVehicles(p=>p.map(x=>x.id===lSheet?{...x,
                    loan:(x.loan||0)+ +lAmt,
                    loanTxns:[...(x.loanTxns||[]),txn]}:x));
                  log("ADD LOAN",`${v.truckNo} ₹${fmt(+lAmt)} ref:${lRef||"—"}`);
                  setLAmt(""); setLDate(today()); setLRef(""); setLAcct("");
                }} color={C.red} full>Add Loan</Btn>
              </div>

              {/* Record Recovery */}
              <div style={{background:C.bg,borderRadius:12,padding:14}}>
                <div style={{color:C.green,fontWeight:700,fontSize:12,marginBottom:10}}>💰 Record Recovery</div>
                {bal<=0&&<div style={{background:"#002200",borderRadius:8,padding:"7px 10px",fontSize:11,color:C.green,marginBottom:8}}>✓ Loan fully recovered — no balance pending</div>}
                {bal>0&&<div style={{background:"#1a0a00",borderRadius:8,padding:"7px 10px",fontSize:11,color:C.orange,marginBottom:8}}>Outstanding balance: ₹{fmt(bal)}{+rAmt>0?` · Entering: ₹${fmt(+rAmt)}${+rAmt>bal?" ⚠ exceeds balance":" ✓"}`:""}  </div>}
                <div style={{display:"flex",gap:10}}>
                  <Field label="Amount ₹ *" value={rAmt}  onChange={setRAmt}  type="number" half />
                  <Field label="Date"        value={rDate} onChange={setRDate} type="date"   half />
                </div>
                <div style={{display:"flex",gap:10}}>
                  <SearchSelect label="Link LR No" value={rLR} onChange={setRLR}
                    opts={[{v:"",l:"— None —"},...vtrips.map(t=>({v:t.lrNo||t.id,l:`${t.lrNo||"—"} · ${t.truckNo} · ${t.date}`}))]}
                    half placeholder={`Search LR… (${vtrips.length} available)`} />
                  <Field label="Reference" value={rRef} onChange={setRRef} half />
                </div>
                <Btn onClick={()=>{
                  if(!rAmt||+rAmt<=0){alert("Enter recovery amount.\nವಸೂಲಾತಿ ಮೊತ್ತ ನಮೂದಿಸಿ.");return;}
                  // Validate 1: cannot recover more than outstanding loan balance
                  if(+rAmt > bal){alert(`Recovery ₹${fmt(+rAmt)} exceeds loan balance ₹${fmt(bal)}.\nMax recoverable: ₹${fmt(bal)}`);return;}
                  // Validate 2: if linked to an LR, cannot exceed that trip's Est. Net to Driver
                  if(rLR){
                    const linkedTrip = (trips||[]).find(t=>(t.lrNo||t.id)===rLR);
                    if(linkedTrip){
                      const tripVeh = vehicles.find(x=>x.truckNo===(linkedTrip.truckNo||"").toUpperCase().trim());
                      const tripNet = (linkedTrip.qty||0)*(linkedTrip.givenRate||0)
                        - (linkedTrip.advance||0) - (linkedTrip.tafal||0)
                        - (linkedTrip.dieselEstimate||0)
                        - (linkedTrip.shortageRecovery||0)
                        - (linkedTrip.loanRecovery||0);
                      const maxFromTrip = Math.max(0, tripNet);
                      if(+rAmt > maxFromTrip){
                        alert(`Recovery ₹${fmt(+rAmt)} would make Est. Net to Driver negative for LR: ${rLR}.\nMax you can recover from this trip: ₹${fmt(maxFromTrip)}`);
                        return;
                      }
                    }
                  }
                  const txn={id:uid(),type:"recovery",date:rDate,amount:+rAmt,lrNo:rLR,ref:rRef,note:""};
                  setVehicles(p=>p.map(x=>x.id===lSheet?{...x,
                    loanRecovered:(x.loanRecovered||0)+ +rAmt,
                    loanTxns:[...(x.loanTxns||[]),txn]}:x));
                  // Reflect in linked trip's loanRecovery field
                  if(rLR){
                    setTrips(p=>p.map(t=>{
                      if((t.lrNo||t.id)!==rLR) return t;
                      const prev = t.loanRecovery||0;
                      return {...t, loanRecovery: prev + +rAmt};
                    }));
                  }
                  log("LOAN RECOVERY",`${v.truckNo} ₹${fmt(+rAmt)} LR:${rLR||"—"}`);
                  setRAmt(""); setRDate(today()); setRLR(""); setRRef("");
                }} color={C.green} full>Record Recovery</Btn>
              </div>

              {/* Deduct per trip */}
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <div style={{flex:1}}>
                  <Field label="Deduct Per Trip ₹" value={String(v.deductPerTrip||0)}
                    onChange={val=>setVehicles(p=>p.map(x=>x.id===lSheet?{...x,deductPerTrip:+val}:x))}
                    type="number" />
                </div>
              </div>

              {/* Loan transaction history */}
              {loanTxns.length>0&&(
                <>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginTop:4}}>TRANSACTION HISTORY ({loanTxns.length})</div>
                  {[...loanTxns].reverse().map(tx=>(
                    <div key={tx.id} style={{background:C.bg,borderRadius:10,padding:"10px 12px",
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      borderLeft:`3px solid ${tx.type==="given"?C.red:C.green}`}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:tx.type==="given"?C.red:C.green}}>
                          {tx.type==="given"?"➕ Given":"💰 Recovery"} · ₹{fmt(tx.amount)}
                        </div>
                        <div style={{fontSize:11,color:C.muted}}>{fmtD(tx.date)}{tx.ref?` · Ref: ${tx.ref}`:""}</div>
                        {tx.accountName&&<div style={{fontSize:11,color:C.muted}}>Acct: {tx.accountName}</div>}
                        {tx.lrNo&&<div style={{fontSize:11,color:C.blue}}>LR: {tx.lrNo}</div>}
                      </div>
                      {isOwner&&<button onClick={()=>{
                        if(tx.type==="recovery"){
                          const linkedLR = tx.lrNo;
                          const linkedTrip = linkedLR ? (trips||[]).find(t=>t.lrNo===linkedLR) : null;
                          const warningMsg = linkedTrip
                            ? `Delete this ₹${fmt(tx.amount)} recovery?\n\nThis is linked to LR: ${linkedLR}\nThe Loan Recovery on that trip will be reduced by ₹${fmt(tx.amount)} (from ₹${fmt(linkedTrip.loanRecovery||0)} → ₹${fmt(Math.max(0,(linkedTrip.loanRecovery||0)-tx.amount))}).`
                            : `Delete this ₹${fmt(tx.amount)} recovery?\n\nVehicle loan balance will increase by ₹${fmt(tx.amount)}.`;
                          if(!window.confirm(warningMsg)) return;
                          // Reverse loan recovered on vehicle
                          setVehicles(p=>p.map(x=>x.id===lSheet?{...x,
                            loanRecovered:(x.loanRecovered||0)-tx.amount,
                            loanTxns:(x.loanTxns||[]).filter(t=>t.id!==tx.id)}:x));
                          // Reverse loanRecovery on the linked trip (match by lrNo OR trip id)
                          if(linkedTrip){
                            setTrips(p=>p.map(t=>{
                              if(t.id!==linkedTrip.id) return t;
                              return {...t, loanRecovery:Math.max(0,(t.loanRecovery||0)-tx.amount)};
                            }));
                          }
                        } else {
                          // "given" transaction — just remove it and reduce loan amount
                          if(!window.confirm(`Delete this ₹${fmt(tx.amount)} loan entry?\nVehicle loan total will decrease by ₹${fmt(tx.amount)}.`)) return;
                          setVehicles(p=>p.map(x=>x.id===lSheet?{...x,
                            loan:(x.loan||0)-tx.amount,
                            loanTxns:(x.loanTxns||[]).filter(t=>t.id!==tx.id)}:x));
                        }
                      }} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>🗑</button>}
                    </div>
                  ))}
                </>
              )}
            </div>
          </Sheet>
        );
      })()}

      {/* ── SHORTAGE MANAGEMENT SHEET ── */}
      {sSheet&&(()=>{
        const v = vehicles.find(x=>x.id===sSheet);
        if(!v) return null;
        const shortageTxns = v.shortageTxns||[];
        const shortOwed = (v.shortageOwed||0)-(v.shortageRecovered||0);
        // Same-owner filter: owner can see all LRs; others see only vehicles with same owner
        const sameOwnerTrucksS = isOwner
          ? null
          : new Set((vehicles||[]).filter(x=>x.ownerName&&x.ownerName===v.ownerName).map(x=>x.truckNo));
        const vtrips = (trips||[]).filter(t=>{
          if(t.driverSettled) return false;
          if(sameOwnerTrucksS===null) return true;  // owner sees all
          return sameOwnerTrucksS.has(t.truckNo)||sameOwnerTrucksS.has(t.truck);
        });
        return (
          <Sheet title={`⚠ Shortage — ${v.truckNo}`} onClose={()=>{setSSheet(null);resetShForm();}}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {/* Balance */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                {[{l:"Owed",v:fmt(v.shortageOwed||0),c:C.red},{l:"Recovered",v:fmt(v.shortageRecovered||0),c:C.green},{l:"Balance",v:fmt(shortOwed),c:shortOwed>0?C.orange:C.green}].map(x=>(
                  <div key={x.l} style={{background:C.bg,borderRadius:10,padding:12,textAlign:"center"}}>
                    <div style={{color:x.c,fontWeight:800}}>{x.v}</div>
                    <div style={{color:C.muted,fontSize:10}}>{x.l}</div>
                  </div>
                ))}
              </div>

              {/* Record Shortage */}
              <div style={{background:C.bg,borderRadius:12,padding:14}}>
                <div style={{color:C.red,fontWeight:700,fontSize:12,marginBottom:10}}>⚠ Record Shortage</div>
                <div style={{display:"flex",gap:10}}>
                  <Field label="Shortage MT *" value={shAmt} onChange={setShAmt} type="number" half />
                  <SearchSelect label="Link LR *" value={shTrip} onChange={setShTrip}
                    opts={[{v:"",l:"— None —"},...vtrips.map(t=>({v:t.id,l:`${t.lrNo||"—"} · ${t.truckNo} · ${t.date}`}))]}
                    half placeholder={`Search LR… (${vtrips.length} available)`} />
                </div>
                <Btn onClick={()=>{
                  if(!shAmt||+shAmt<=0){alert("Enter shortage MT.\nಕೊರತೆ MT ನಮೂದಿಸಿ.");return;}
                  if(!shTrip){alert("Link to an LR.\nLR ಗೆ ಲಿಂಕ್ ಮಾಡಿ.");return;}
                  const trip = vtrips.find(t=>t.id===shTrip);
                  const lrNo = trip?.lrNo||"";
                  const rate = trip?.givenRate||0;
                  const amount = +shAmt * rate;
                  const txn={id:uid(),type:"shortage",date:trip?.date||today(),qty:+shAmt,lrNo,amount,note:""};
                  // Update trip shortage too
                  setTrips(p=>p.map(t=>t.id===shTrip?{...t,shortage:(t.shortage||0)+ +shAmt}:t));
                  setVehicles(p=>p.map(x=>x.id===sSheet?{...x,
                    shortageOwed:(x.shortageOwed||0)+amount,
                    shortageTxns:[...(x.shortageTxns||[]),txn]}:x));
                  log("SHORTAGE",`${v.truckNo} ${shAmt}MT LR:${lrNo}`);
                  setShAmt(""); setShTrip("");
                }} color={C.red} full>Record Shortage</Btn>
              </div>

              {/* Record Shortage Recovery */}
              <div style={{background:C.bg,borderRadius:12,padding:14}}>
                <div style={{color:C.green,fontWeight:700,fontSize:12,marginBottom:10}}>💰 Shortage Recovery</div>
                {(()=>{
                  const txns=v.shortageTxns||[];
                  const owedMT  = txns.filter(x=>x.type==="shortage").reduce((s,x)=>s+(x.qty||0),0);
                  const recvdMT = txns.filter(x=>x.type==="recovery").reduce((s,x)=>s+(x.qty||0),0);
                  const balMT   = Math.max(0, owedMT-recvdMT);
                  if(owedMT===0) return <div style={{background:"#002200",borderRadius:8,padding:"7px 10px",fontSize:11,color:C.green,marginBottom:8}}>✓ No shortage recorded — nothing to recover</div>;
                  if(balMT<=0)  return <div style={{background:"#002200",borderRadius:8,padding:"7px 10px",fontSize:11,color:C.green,marginBottom:8}}>✓ Shortage fully recovered</div>;
                  return <div style={{background:"#1a0a00",borderRadius:8,padding:"7px 10px",fontSize:11,color:C.orange,marginBottom:8}}>
                    Outstanding: {balMT.toFixed(3)} MT{+srAmt>0?` · Entering: ${srAmt}MT${+srAmt>balMT?" ⚠ exceeds balance":" ✓"}`:""}
                  </div>;
                })()}
                <div style={{display:"flex",gap:10}}>
                  <Field label="Recovery MT *" value={srAmt} onChange={setSrAmt} type="number" half />
                  <SearchSelect label="Link LR" value={srLR} onChange={setSrLR}
                    opts={[{v:"",l:"— None —"},...vtrips.map(t=>({v:t.lrNo||"",l:`${t.lrNo||"—"} · ${t.truckNo} · ${t.date}`}))]}
                    half placeholder={`Search LR… (${vtrips.length} available)`} />
                </div>
                <Btn onClick={()=>{
                  if(!srAmt||+srAmt<=0){alert("Enter recovery MT");return;}
                  // Validate: cannot recover more MT than outstanding shortage balance
                  const shortBalMT = v.shortageOwed>0&&v.shortageOwed===v.shortageRecovered?0
                    : (() => {
                        // compute outstanding in MT from transactions
                        const txns = v.shortageTxns||[];
                        const owedMT   = txns.filter(x=>x.type==="shortage").reduce((s,x)=>s+(x.qty||0),0);
                        const recvdMT  = txns.filter(x=>x.type==="recovery").reduce((s,x)=>s+(x.qty||0),0);
                        return Math.max(0, owedMT - recvdMT);
                      })();
                  if(shortBalMT > 0 && +srAmt > shortBalMT){
                    alert(`Recovery ${srAmt}MT exceeds shortage balance ${shortBalMT.toFixed(3)}MT`);return;
                  }
                  const trip = srLR ? (trips||[]).find(t=>t.lrNo===srLR) : null;
                  const rate = trip?.givenRate||0;
                  const amount = +srAmt * rate;
                  const txn={id:uid(),type:"recovery",date:today(),qty:+srAmt,lrNo:srLR,amount,note:""};
                  setVehicles(p=>p.map(x=>x.id===sSheet?{...x,
                    shortageRecovered:(x.shortageRecovered||0)+amount,
                    shortageTxns:[...(x.shortageTxns||[]),txn]}:x));
                  // Reflect in linked trip's shortageRecovery field (₹)
                  if(srLR && trip){
                    setTrips(p=>p.map(t=>{
                      if(t.lrNo!==srLR) return t;
                      return {...t, shortageRecovery:(t.shortageRecovery||0)+amount};
                    }));
                  }
                  log("SHORTAGE RECOVERY",`${v.truckNo} ${srAmt}MT ₹${fmt(amount)} LR:${srLR||"—"}`);
                  setSrAmt(""); setSrLR("");
                }} color={C.green} full>Record Recovery</Btn>
              </div>

              {/* Shortage transaction history */}
              {shortageTxns.length>0&&(
                <>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginTop:4}}>SHORTAGE HISTORY ({shortageTxns.length})</div>
                  {[...shortageTxns].reverse().map(tx=>(
                    <div key={tx.id} style={{background:C.bg,borderRadius:10,padding:"10px 12px",
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      borderLeft:`3px solid ${tx.type==="shortage"?C.red:C.green}`}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:tx.type==="shortage"?C.red:C.green}}>
                          {tx.type==="shortage"?"⚠ Shortage":"💰 Recovery"} · {tx.qty}MT · ₹{fmt(tx.amount||0)}
                        </div>
                        <div style={{fontSize:11,color:C.muted}}>{fmtD(tx.date)}</div>
                        {tx.lrNo&&<div style={{fontSize:11,color:C.blue}}>LR: {tx.lrNo}</div>}
                      </div>
                      {isOwner&&<button onClick={()=>{
                        if(tx.type==="recovery"){
                          const linkedLR = tx.lrNo;
                          const linkedTrip = linkedLR ? (trips||[]).find(t=>t.lrNo===linkedLR) : null;
                          const warningMsg = linkedTrip
                            ? `Delete this ₹${fmt(tx.amount)} shortage recovery?\n\nThis is linked to LR: ${linkedLR}\nThe Shortage Recovery on that trip will be reduced by ₹${fmt(tx.amount)} (from ₹${fmt(linkedTrip.shortageRecovery||0)} → ₹${fmt(Math.max(0,(linkedTrip.shortageRecovery||0)-tx.amount))}).`
                            : `Delete this ₹${fmt(tx.amount)} shortage recovery?\n\nVehicle shortage balance will increase by ₹${fmt(tx.amount)}.`;
                          if(!window.confirm(warningMsg)) return;
                          setVehicles(p=>p.map(x=>x.id===sSheet?{...x,
                            shortageRecovered:(x.shortageRecovered||0)-(tx.amount||0),
                            shortageTxns:(x.shortageTxns||[]).filter(t=>t.id!==tx.id)}:x));
                          // Reverse shortageRecovery on the linked trip
                          if(linkedTrip){
                            setTrips(p=>p.map(t=>{
                              if(t.lrNo!==linkedLR) return t;
                              return {...t, shortageRecovery:Math.max(0,(t.shortageRecovery||0)-tx.amount)};
                            }));
                          }
                        } else {
                          // shortage "owed" entry
                          if(!window.confirm(`Delete this ${tx.qty}MT shortage entry?\nVehicle shortage owed will decrease by ₹${fmt(tx.amount||0)}.`)) return;
                          setVehicles(p=>p.map(x=>x.id===sSheet?{...x,
                            shortageOwed:(x.shortageOwed||0)-(tx.amount||0),
                            shortageTxns:(x.shortageTxns||[]).filter(t=>t.id!==tx.id)}:x));
                        }
                      }} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>🗑</button>}
                    </div>
                  ))}
                </>
              )}
            </div>
          </Sheet>
        );
      })()}

      {/* ── VEHICLE CARDS ── */}
      {filtered.length===0&&(
        <div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}>
          <div style={{fontSize:32,marginBottom:8}}>🚛</div>
          <div style={{fontSize:13}}>{search?"No vehicles match your search.":"No vehicles yet. Owner can add one above."}</div>
        </div>
      )}

      {filtered.map(v=>{
        const bal=(v.loan||0)-(v.loanRecovered||0);
        const vt=(trips||[]).filter(t=>t.truckNo===v.truckNo||t.truck===v.truckNo);
        const short=vt.reduce((s,t)=>s+(t.shortage||0),0);
        return (
          <div key={v.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",
            borderLeft:`4px solid ${bal>0?C.red:C.green}`,marginBottom:8}}>
            {/* Truck + owner row */}
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div>
                <div style={{fontWeight:800,fontSize:15}}>{v.truckNo}</div>
                <div style={{color:C.muted,fontSize:12}}>{v.ownerName||"—"}{v.phone?` · ${v.phone}`:""}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <Badge label={bal>0?"Loan Due":"Clear"} color={bal>0?C.red:C.green} />
                {v.tafalExempt&&<Badge label="TAFAL Exempt" color={C.muted} />}
                {isOwner ? (
                <button onClick={()=>{setF({
                  truckNo:v.truckNo,ownerName:v.ownerName||"",phone:v.phone||"",
                  driverName:v.driverName||"",driverPhone:v.driverPhone||"",driverLicense:v.driverLicense||"",
                  accountNo:v.accountNo||"",ifsc:v.ifsc||"",
                  loan:String(v.loan||0),loanRecovered:String(v.loanRecovered||0),
                  deductPerTrip:String(v.deductPerTrip||0),tafalExempt:v.tafalExempt||false,
                });setEditId(v.id);setSheet(true);}}
                  style={{background:"none",border:`1px solid ${C.muted}44`,borderRadius:6,
                    padding:"3px 8px",color:C.muted,cursor:"pointer",fontSize:11}}>✏ Edit</button>
              ) : (
                <button onClick={()=>{setPhoneEditId(v.id);setPhoneEditVal(v.driverPhone||"");}}
                  style={{background:"none",border:`1px solid ${C.blue}44`,borderRadius:6,
                    padding:"3px 8px",color:C.blue,cursor:"pointer",fontSize:11}}>📞 Update Phone</button>
              )}
              </div>
            </div>

            {/* Driver row */}
            {(v.driverName||v.driverPhone)&&(
              <div style={{background:C.bg,borderRadius:8,padding:"7px 10px",marginBottom:8,
                fontSize:12,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{color:C.muted,fontSize:10,fontWeight:700}}>DRIVER</span>
                {v.driverName&&<span style={{color:C.text,fontWeight:600}}>{v.driverName}</span>}
                {v.driverPhone&&(
                  <a href={`tel:${v.driverPhone}`} style={{color:C.green,textDecoration:"none",fontFamily:"monospace"}}>
                    📞 {v.driverPhone}
                  </a>
                )}
                {v.driverLicense&&<span style={{color:C.muted,fontSize:11}}>🪪 {v.driverLicense}</span>}
              </div>
            )}
            {!v.driverPhone&&(
              <div style={{background:"#1a1000",border:`1px solid ${C.orange}33`,borderRadius:8,
                padding:"5px 10px",marginBottom:8,fontSize:11,color:C.orange}}>
                ⚠ Driver phone missing — {isOwner?"tap ✏ Edit to add":"contact owner to update"}
              </div>
            )}
            {v.accountNo&&<div style={{color:C.blue,fontSize:11,marginBottom:6}}>🏦 A/C: {v.accountNo}{v.ifsc?` · ${v.ifsc}`:""}</div>}

            {/* Loan KPIs */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
              {[{l:"Loan",v:fmt(v.loan||0),c:C.red},{l:"Recovered",v:fmt(v.loanRecovered||0),c:C.green},{l:"Balance",v:fmt(bal),c:bal>0?C.accent:C.green}].map(x=>(
                <div key={x.l} style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}>
                  <div style={{color:x.c,fontWeight:700,fontSize:12}}>{x.v}</div>
                  <div style={{color:C.muted,fontSize:9}}>{x.l.toUpperCase()}</div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted,marginBottom:10}}>
              <span>Trips: <b style={{color:C.text}}>{vt.length}</b></span>
              <span>Deduct/trip: <b style={{color:C.blue}}>{fmt(v.deductPerTrip||0)}</b></span>
              <span style={{color:short>0?C.red:C.muted}}>Short: {short}MT</span>
            </div>

            {/* Action buttons */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <Btn onClick={()=>{resetLoanForm();setLSheet(v.id);}} sm outline color={C.blue}>🏦 Loan</Btn>
              <Btn onClick={()=>{resetShForm();setSSheet(v.id);}} sm outline color={C.red}>⚠ Shortage</Btn>
              <Btn onClick={()=>setHSheet(v.id)} sm outline color={C.purple}>📋 History</Btn>
              <Btn onClick={()=>exportVehiclePDF(v)} sm outline color={C.orange}>📄 PDF</Btn>
              {v.driverPhone&&(
                <Btn onClick={()=>window.open(`https://wa.me/91${v.driverPhone.replace(/\D/g,"")}?text=${encodeURIComponent(`Dear ${v.driverName||"Driver"}, this is M Yantra Enterprises. - 9606477257`)}`,`_blank`)} sm outline color={C.teal}>📲 Driver</Btn>
              )}
              {v.phone&&(
                <Btn onClick={()=>window.open(`https://wa.me/91${v.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Dear ${v.ownerName}, loan balance ₹${fmt(bal)}. - M.Yantra 9606477257`)}`,`_blank`)} sm outline color={C.green}>📲 Owner</Btn>
              )}
            </div>
          </div>
        );
      })}

      {/* ── FULL HISTORY SHEET ── */}
      {hSheet&&(()=>{
        const v = vehicles.find(x=>x.id===hSheet);
        if(!v) return null;
        const vt = (trips||[]).filter(t=>t.truckNo===v.truckNo||t.truck===v.truckNo)
                               .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
        const pays = (driverPays||[]).filter(p=>p.truckNo===v.truckNo);
        const totalPaid = pays.reduce((s,p)=>s+(p.amount||0),0);
        const loanTxns = v.loanTxns||[];
        const shortageTxns = v.shortageTxns||[];
        return (
          <Sheet title={`📋 ${v.truckNo} — Full History`} onClose={()=>setHSheet(null)}>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {/* Vehicle summary card */}
              <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",fontSize:13}}>
                <div style={{fontWeight:800,fontSize:15,marginBottom:4}}>{v.ownerName||"—"}</div>
                <div style={{color:C.muted,fontSize:12,marginBottom:2}}>{v.phone||"—"}</div>
                {(v.driverName||v.driverPhone)&&(
                  <div style={{color:C.orange,fontSize:12,marginBottom:2}}>
                    Driver: {v.driverName||"—"} · {v.driverPhone||"—"}
                    {v.driverLicense&&` · 🪪 ${v.driverLicense}`}
                  </div>
                )}
                {v.accountNo&&<div style={{color:C.blue,fontSize:11,marginTop:2}}>A/C: {v.accountNo}{v.ifsc?` · IFSC: ${v.ifsc}`:""}</div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:10}}>
                  {[
                    {v:vt.length,              l:"TRIPS",   c:C.blue},
                    {v:vt.filter(t=>t.driverSettled).length, l:"SETTLED", c:C.green},
                    {v:vt.filter(t=>!t.driverSettled).length,l:"PENDING", c:C.orange},
                    {v:`₹${fmt(totalPaid)}`,   l:"PAID",    c:C.green},
                  ].map(x=>(
                    <div key={x.l} style={{background:C.card,borderRadius:8,padding:"8px",textAlign:"center"}}>
                      <div style={{fontWeight:700,color:x.c,fontSize:12}}>{x.v}</div>
                      <div style={{color:C.muted,fontSize:9}}>{x.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              <Btn onClick={()=>exportVehiclePDF(v)} full outline color={C.orange}>📄 Export Full PDF Report</Btn>

              {/* Trips */}
              <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1}}>TRIPS ({vt.length})</div>
              {vt.length===0&&<div style={{textAlign:"center",color:C.muted,padding:24}}>No trips recorded</div>}
              {vt.map(t=>{
                const isMultiDI = t.diLines&&t.diLines.length>1;
                const gross = isMultiDI ? t.diLines.reduce((s,d)=>s+(d.qty||0)*(d.givenRate||0),0) : (t.qty||0)*(t.givenRate||0);
                const net = gross-(t.advance||0)-(t.tafal||0)-(t.dieselEstimate||0);
                const tripPays = pays.filter(p=>p.lrNo===t.lrNo);
                return (
                  <div key={t.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",
                    borderLeft:`3px solid ${t.driverSettled?C.green:C.orange}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:13}}>LR {t.lrNo||"—"}
                          <span style={{color:C.muted,fontWeight:400,fontSize:11,marginLeft:6}}>{fmtD(t.date)}</span>
                        </div>
                        <div style={{color:C.muted,fontSize:11,marginTop:2}}>{t.from||"—"} → {t.to||"—"} · {t.qty}MT</div>
                        <div style={{color:C.muted,fontSize:11}}>
                          {isMultiDI ? `DIs: ${t.diLines.map(d=>d.diNo).join(" + ")}` : `DI: ${t.diNo||"—"}`}
                        </div>
                        {(t.shortage||0)>0&&(
                          <div style={{color:C.red,fontSize:11}}>⚠ Shortage: {t.shortage}MT · ₹{fmt((t.shortage||0)*(t.givenRate||0))}</div>
                        )}
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{color:C.green,fontWeight:800,fontSize:14}}>₹{fmt(net)}</div>
                        <div style={{fontSize:10,color:C.muted}}>Net</div>
                        {t.driverSettled?<Badge label="Settled" color={C.green}/>:<Badge label="Pending" color={C.orange}/>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:10,marginTop:6,fontSize:11,color:C.muted,flexWrap:"wrap"}}>
                      <span>Gross: <b style={{color:C.orange}}>₹{fmt(gross)}</b></span>
                      {(t.advance||0)>0&&<span>(−) Adv: <b style={{color:C.red}}>₹{fmt(t.advance)}</b></span>}
                      {(t.tafal||0)>0&&<span>(−) Tafal: <b>₹{fmt(t.tafal)}</b></span>}
                      {tripPays.length>0&&<span style={{color:C.green}}>Paid: ₹{fmt(tripPays.reduce((s,p)=>s+(p.amount||0),0))}</span>}
                    </div>
                  </div>
                );
              })}

              {/* Loan transactions */}
              {loanTxns.length>0&&(
                <>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginTop:4}}>LOAN TRANSACTIONS ({loanTxns.length})</div>
                  {[...loanTxns].reverse().map(tx=>(
                    <div key={tx.id} style={{background:C.bg,borderRadius:8,padding:"9px 12px",
                      borderLeft:`3px solid ${tx.type==="given"?C.red:C.green}`}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:700,color:tx.type==="given"?C.red:C.green}}>
                            {tx.type==="given"?"➕ Loan Given":"💰 Recovery"} · ₹{fmt(tx.amount)}
                          </div>
                          <div style={{fontSize:11,color:C.muted}}>{fmtD(tx.date)}{tx.ref?` · ${tx.ref}`:""}</div>
                          {tx.accountName&&<div style={{fontSize:11,color:C.muted}}>Acct: {tx.accountName}</div>}
                          {tx.lrNo&&<div style={{fontSize:11,color:C.blue}}>LR: {tx.lrNo}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Shortage transactions */}
              {shortageTxns.length>0&&(
                <>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginTop:4}}>SHORTAGE HISTORY ({shortageTxns.length})</div>
                  {[...shortageTxns].reverse().map(tx=>(
                    <div key={tx.id} style={{background:C.bg,borderRadius:8,padding:"9px 12px",
                      borderLeft:`3px solid ${tx.type==="shortage"?C.red:C.green}`}}>
                      <div style={{fontSize:12,fontWeight:700,color:tx.type==="shortage"?C.red:C.green}}>
                        {tx.type==="shortage"?"⚠ Shortage":"💰 Recovery"} · {tx.qty}MT · ₹{fmt(tx.amount||0)}
                      </div>
                      <div style={{fontSize:11,color:C.muted}}>{fmtD(tx.date)}{tx.lrNo?` · LR: ${tx.lrNo}`:""}</div>
                    </div>
                  ))}
                </>
              )}

              {/* Driver payments */}
              {pays.length>0&&(
                <>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginTop:4}}>DRIVER PAYMENTS ({pays.length})</div>
                  {[...pays].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(p=>(
                    <div key={p.id} style={{background:C.bg,borderRadius:8,padding:"9px 12px",
                      display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:C.text}}>₹{fmt(p.amount)}</div>
                        <div style={{fontSize:11,color:C.muted}}>{fmtD(p.date)} · LR: {p.lrNo||"—"}</div>
                        {p.referenceNo&&<div style={{fontSize:10,color:C.muted}}>Ref: {p.referenceNo}</div>}
                      </div>
                      <Badge label="Paid" color={C.green}/>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Sheet>
        );
      })()}
    </div>
  );
}

// ─── EMPLOYEES ────────────────────────────────────────────────────────────────
function Employees({employees, setEmployees, trips, cashTransfers, setCashTransfers, user, log}) {
  const [sheet,  setSheet]  = useState(false);
  const [lSheet, setLSheet] = useState(null);
  const [wSheet, setWSheet] = useState(null);
  const [lAmt,   setLAmt]   = useState("");
  const [rAmt,   setRAmt]   = useState("");
  const [txAmt,  setTxAmt]  = useState("");
  const [txDate, setTxDate] = useState(today());
  const [txNote, setTxNote] = useState("");
  // wallet PDF date filter
  const [wFrom,  setWFrom]  = useState("");
  const [wTo,    setWTo]    = useState("");
  const blank = {name:"",phone:"",role:"Fleet Agent",loan:"0",loanRecovered:"0",linkedTrucks:""};
  const [f,setF] = useState(blank);
  const ff = k => v => setF(p=>({...p,[k]:v}));
  const isOwner = user?.role==="owner";

  // ── Wallet calculations ──────────────────────────────────────────────────────
  const empTx = empId => (cashTransfers||[]).filter(t=>t.empId===empId);
  const totalTransferred = empId => empTx(empId).filter(t=>Number(t.amount||0)>0).reduce((s,t)=>s+Number(t.amount||0),0);
  const totalAdvanceGiven = empId => Math.abs(empTx(empId).filter(t=>Number(t.amount||0)<0).reduce((s,t)=>s+Number(t.amount||0),0));
  const walletBalance = empId => totalTransferred(empId) - totalAdvanceGiven(empId);

  const txHistory = empId => empTx(empId).sort((a,b)=>(b.date||"").localeCompare(a.date||""));

  const deleteTx = async (txId) => {
    if(!window.confirm("Delete this wallet transaction?")) return;
    setCashTransfers(prev=>(prev||[]).filter(t=>t.id!==txId));
    try { await DB.deleteCashTransfer(txId); } catch(e){ console.warn("deleteCashTransfer:",e); }
  };

  const printWalletPDF = (emp) => {
    const hist = txHistory(emp.id).filter(tx=>{
      if(wFrom && (tx.date||"")<wFrom) return false;
      if(wTo   && (tx.date||"")>wTo)   return false;
      return true;
    });
    const credits  = hist.filter(t=>Number(t.amount||0)>0);
    const debits   = hist.filter(t=>Number(t.amount||0)<0);
    const totCr    = credits.reduce((s,t)=>s+Number(t.amount||0),0);
    const totDb    = Math.abs(debits.reduce((s,t)=>s+Number(t.amount||0),0));
    const bal      = totCr - totDb;
    const fmt2     = n => Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
    const rows     = hist.map(tx=>{
      const amt    = Number(tx.amount||0);
      const isCredit = amt>0;
      return `<tr>
        <td>${tx.date||"—"}</td>
        <td>${tx.note||"Transfer"}</td>
        <td>${tx.lrNo||"—"}</td>
        <td style="text-align:right;color:green">${isCredit?fmt2(amt):""}</td>
        <td style="text-align:right;color:#c00">${!isCredit?fmt2(Math.abs(amt)):""}</td>
        <td style="text-align:right;font-weight:bold">${tx.createdBy||""}</td>
      </tr>`;
    }).join("");
    const html = `<html><head><style>
      body{font-family:Arial,sans-serif;padding:24px;font-size:12px}
      h2{margin-bottom:2px}
      .sub{color:#666;font-size:12px;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th{background:#1a1a2e;color:#fff;padding:7px 8px;text-align:left;font-size:11px}
      td{padding:6px 8px;border-bottom:1px solid #eee;font-size:11px}
      .summary{display:flex;gap:24px;margin:12px 0;font-size:13px}
      .sv{font-weight:bold}.sc{color:green}.sd{color:#c00}.sb{color:#f97316}
      .total{text-align:right;font-weight:bold;font-size:14px;margin-top:12px}
    </style></head><body>
      <h2>M. Yantra — Cash Wallet: ${emp.name}</h2>
      <div class="sub">Role: ${emp.role} | Period: ${wFrom||"All"} → ${wTo||"All"}</div>
      <div class="summary">
        <span>Transferred: <span class="sv sc">₹${fmt2(totCr)}</span></span>
        <span>Advances: <span class="sv sd">₹${fmt2(totDb)}</span></span>
        <span>Balance: <span class="sv sb">₹${fmt2(bal)}</span></span>
      </div>
      <table><thead><tr><th>Date</th><th>Note</th><th>LR No</th><th style="text-align:right">Credit ₹</th><th style="text-align:right">Debit ₹</th><th style="text-align:right">By</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="total">Balance: ₹${fmt2(bal)}</div>
    </body></html>`;
    const w = window.open("","_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),400);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:C.purple,fontWeight:800,fontSize:16}}>👥 Employees</div>
        <Btn onClick={()=>setSheet(true)} sm>+ Add</Btn>
      </div>

      {sheet&&<Sheet title="Add Employee" onClose={()=>{setSheet(false);setF(blank);}}>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <div style={{display:"flex",gap:10}}><Field label="Name" value={f.name} onChange={ff("name")} half /><Field label="Phone" value={f.phone} onChange={ff("phone")} type="tel" half /></div>
          <Field label="Role" value={f.role} onChange={ff("role")} opts={["Fleet Agent","Driver Liaison","Field Staff","Accountant"].map(x=>({v:x,l:x}))} />
          <div style={{display:"flex",gap:10}}><Field label="Loan ₹" value={f.loan} onChange={ff("loan")} type="number" half /><Field label="Recovered ₹" value={f.loanRecovered} onChange={ff("loanRecovered")} type="number" half /></div>
          <Field label="Linked Trucks (comma sep)" value={f.linkedTrucks} onChange={ff("linkedTrucks")} placeholder="KA34C4617, AP29V8469" />
          <Btn onClick={()=>{const e={...f,id:uid(),loan:+f.loan,loanRecovered:+f.loanRecovered,linkedTrucks:f.linkedTrucks.split(",").map(s=>s.trim()).filter(Boolean),createdBy:user.username}; setEmployees(p=>[...(p||[]),e]); log("ADD EMPLOYEE",e.name); setF(blank); setSheet(false);}} full>Save</Btn>
        </div>
      </Sheet>}

      {lSheet&&(()=>{const e=employees.find(x=>x.id===lSheet); return (
        <Sheet title={`Loan — ${e.name}`} onClose={()=>{setLSheet(null);setLAmt("");setRAmt("");}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[{l:"Loan",v:fmt(e.loan),c:C.red},{l:"Recovered",v:fmt(e.loanRecovered),c:C.green},{l:"Balance",v:fmt(e.loan-e.loanRecovered),c:C.accent}].map(x=>(
                <div key={x.l} style={{background:C.bg,borderRadius:10,padding:12,textAlign:"center"}}><div style={{color:x.c,fontWeight:800}}>{x.v}</div><div style={{color:C.muted,fontSize:10}}>{x.l}</div></div>
              ))}
            </div>
            <Field label="Give Loan ₹" value={lAmt} onChange={setLAmt} type="number" />
            <Btn onClick={()=>{setEmployees(p=>p.map(x=>x.id===lSheet?{...x,loan:x.loan+ +lAmt}:x)); log("EMP LOAN",`${e.name} +${fmt(+lAmt)}`); setLAmt("");}} color={C.red} full>Add Loan</Btn>
            <Field label="Record Recovery ₹" value={rAmt} onChange={setRAmt} type="number" />
            <Btn onClick={()=>{setEmployees(p=>p.map(x=>x.id===lSheet?{...x,loanRecovered:x.loanRecovered+ +rAmt}:x)); log("EMP RECOVERY",`${e.name} ${fmt(+rAmt)}`); setRAmt("");}} color={C.green} full>Record Recovery</Btn>
            <div style={{color:C.muted,fontSize:12,marginTop:4}}>Linked trucks:</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{e.linkedTrucks.map(t=><Badge key={t} label={t} color={C.blue} />)}</div>
          </div>
        </Sheet>
      );})()}

      {wSheet&&(()=>{
        const e=employees.find(x=>x.id===wSheet);
        const xfrd=totalTransferred(wSheet), adv=totalAdvanceGiven(wSheet), bal=xfrd-adv;
        const hist=txHistory(wSheet);
        const filtHist = hist.filter(tx=>{
          if(wFrom && (tx.date||"")<wFrom) return false;
          if(wTo   && (tx.date||"")>wTo)   return false;
          return true;
        });
        return (
          <Sheet title={`💵 Cash Wallet — ${e.name}`} onClose={()=>{setWSheet(null);setTxAmt("");setTxNote("");setTxDate(today());setWFrom("");setWTo("");}}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>

              {/* Balance summary */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[{l:"Transferred",v:fmt(xfrd),c:C.green},{l:"Advances",v:fmt(adv),c:C.red},{l:"Balance",v:fmt(bal),c:bal>=0?C.accent:C.red}].map(x=>(
                  <div key={x.l} style={{background:C.bg,borderRadius:10,padding:10,textAlign:"center"}}>
                    <div style={{color:x.c,fontWeight:800,fontSize:14}}>{x.v}</div>
                    <div style={{color:C.muted,fontSize:9,marginTop:2,textTransform:"uppercase",letterSpacing:0.5}}>{x.l}</div>
                  </div>
                ))}
              </div>
              {bal<0&&<div style={{background:"#2a0a0a",border:"1px solid "+C.red,borderRadius:8,padding:"8px 12px",color:C.red,fontSize:12,fontWeight:600}}>⚠️ Advance exceeds transfers by {fmt(Math.abs(bal))}</div>}

              {/* Record new transfer */}
              <div style={{background:C.card,borderRadius:10,padding:"12px 14px"}}>
                <div style={{color:C.green,fontWeight:700,fontSize:12,marginBottom:10}}>➕ Record Cash Transfer to {e.name}</div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <Field label="Amount ₹" value={txAmt} onChange={setTxAmt} type="number" half />
                  <Field label="Date"     value={txDate} onChange={setTxDate} type="date" half />
                </div>
                <Field label="Note (optional)" value={txNote} onChange={setTxNote} placeholder="UPI / NEFT / Cash" />
                <div style={{marginTop:10}}>
                  <Btn onClick={()=>{
                    if(!txAmt||+txAmt<=0){alert("Enter transfer amount.\nವರ್ಗಾವಣೆ ಮೊತ್ತ ನಮೂದಿಸಿ.");return;}
                    const tx={id:uid(),empId:wSheet,amount:+txAmt,date:txDate,lrNo:"",
                      note:txNote.trim(),createdBy:user.username,createdAt:nowTs()};
                    setCashTransfers(prev=>[tx,...(Array.isArray(prev)?prev:[])]);
                    log("CASH TRANSFER",`${e.name} ₹${fmt(+txAmt)}`);
                    setTxAmt("");setTxNote("");setTxDate(today());
                  }} full color={C.green}>Save Transfer</Btn>
                </div>
              </div>

              {/* Date filter + PDF */}
              <div style={{background:C.card,borderRadius:10,padding:"12px 14px"}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>📅 Filter & Export</div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <Field label="From" value={wFrom} onChange={setWFrom} type="date" half />
                  <Field label="To"   value={wTo}   onChange={setWTo}   type="date" half />
                </div>
                <div style={{display:"flex",gap:8}}>
                  <Btn onClick={()=>printWalletPDF(e)} full outline color={C.blue}>🖨️ Print / Save PDF</Btn>
                  <button onClick={()=>{
                    const bal = xfrd - adv;
                    const text = `M.Yantra Cash Wallet — ${e.name}\nTransferred: ${fmt(xfrd)}\nAdvances: ${fmt(adv)}\nBalance: ${fmt(bal)}`;
                    window.open("https://wa.me/91"+e.phone.replace(/[^0-9]/g,"")+"?text="+encodeURIComponent(text),"_blank");
                  }} style={{background:"#25D36622",border:"1px solid #25D36688",borderRadius:8,
                    color:"#25D366",fontSize:13,fontWeight:700,padding:"8px 14px",cursor:"pointer",flexShrink:0}}>
                    📲
                  </button>
                </div>
              </div>

              {/* Transaction history */}
              {filtHist.length>0 ? (
                <div>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>📋 Transaction History ({filtHist.length})</div>
                  {filtHist.map(tx=>{
                    const amt=Number(tx.amount||0), isCredit=amt>0;
                    return (
                      <div key={tx.id} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                        padding:"10px 0",borderBottom:"1px solid "+C.border+"55"}}>
                        <div style={{flex:1}}>
                          <div style={{color:C.text,fontSize:13,fontWeight:600}}>{tx.note||"Transfer"}</div>
                          <div style={{color:C.muted,fontSize:11}}>{tx.date||"—"}{tx.lrNo?" · LR "+tx.lrNo:""} · by {tx.createdBy}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{color:isCredit?C.green:C.red,fontWeight:800,fontSize:14,minWidth:80,textAlign:"right"}}>
                            {isCredit?"+":"-"}{fmt(Math.abs(amt))}
                          </div>
                          {isOwner && (
                            <button onClick={()=>deleteTx(tx.id)}
                              style={{background:"none",border:"none",color:C.red,fontSize:16,cursor:"pointer",padding:"0 4px",opacity:0.7}}>🗑</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{textAlign:"center",color:C.muted,padding:"20px 0",fontSize:13}}>No transactions in this period</div>
              )}
            </div>
          </Sheet>
        );
      })()}

      {employees.map(e=>{
        const loanBal=e.loan-e.loanRecovered, walBal=walletBalance(e.id);
        return (
          <div key={e.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",borderLeft:`4px solid ${loanBal>0?C.red:C.green}`,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <div><div style={{fontWeight:800,fontSize:15}}>{e.name}</div><div style={{color:C.muted,fontSize:12}}>{e.role} · {e.phone}</div></div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <Badge label={loanBal>0?"Loan Due":"Clear"} color={loanBal>0?C.red:C.green} />
                {isOwner && <button onClick={()=>{if(window.confirm(`Delete employee ${e.name}?`)){setEmployees(p=>p.filter(x=>x.id!==e.id)); log("DEL EMPLOYEE",e.name);}}} style={{background:"none",border:"none",color:C.red,fontSize:16,cursor:"pointer",opacity:0.7}}>🗑</button>}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
              {[{l:"Loan",v:fmt(e.loan),c:C.red},{l:"Recovered",v:fmt(e.loanRecovered),c:C.green},{l:"Loan Bal",v:fmt(loanBal),c:loanBal>0?C.accent:C.green}].map(x=>(
                <div key={x.l} style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}><div style={{color:x.c,fontWeight:700,fontSize:12}}>{x.v}</div><div style={{color:C.muted,fontSize:9,textTransform:"uppercase"}}>{x.l}</div></div>
              ))}
            </div>
            <div style={{background:"#f0fdf4",border:"1px solid #2ea04333",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
              <div style={{color:C.green,fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:1,marginBottom:7}}>💵 Cash Wallet</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                {[{l:"Transferred",v:fmt(totalTransferred(e.id)),c:C.green},{l:"Advances",v:fmt(totalAdvanceGiven(e.id)),c:C.red},{l:"Balance",v:fmt(walBal),c:walBal>=0?C.accent:C.red}].map(x=>(
                  <div key={x.l} style={{background:C.bg,borderRadius:6,padding:"7px",textAlign:"center"}}>
                    <div style={{color:x.c,fontWeight:700,fontSize:11}}>{x.v}</div>
                    <div style={{color:C.muted,fontSize:9,textTransform:"uppercase"}}>{x.l}</div>
                  </div>
                ))}
              </div>
            </div>
            {e.linkedTrucks.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{e.linkedTrucks.map(t=><Badge key={t} label={t} color={C.blue} />)}</div>}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Btn onClick={()=>setWSheet(e.id)} sm color={C.green}>💵 Wallet</Btn>
              <Btn onClick={()=>setLSheet(e.id)} sm outline color={C.purple}>Manage Loan</Btn>
              <Btn onClick={()=>window.open(`https://wa.me/91${e.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Dear ${e.name}, wallet balance ${fmt(walBal)}. - M.Yantra`)}`,`_blank`)} sm outline color={C.teal}>📲</Btn>
            </div>
          </div>
        );
      })}
      {employees.length===0&&<div style={{textAlign:"center",color:C.muted,padding:32}}>No employees added yet</div>}
    </div>
  );
}

// ─── SHREE PAYMENTS & BILLING ──────────────────────────────────────────────────
// ─── GST RELEASE FORM ────────────────────────────────────────────────────────
function GstReleaseForm({ gstHoldItems, gstReleases, setGstReleases, isOwner, log }) {
  const [inv,   setInv]   = useState("");
  const [amt,   setAmt]   = useState("");
  const [utr,   setUtr]   = useState("");
  const [date,  setDate]  = useState(new Date().toISOString().slice(0,10));
  const [notes, setNotes] = useState("");
  const [open,  setOpen]  = useState(false);

  const pendingItems = gstHoldItems.filter(g => g.balance > 0);

  if(!isOwner) return null;
  if(pendingItems.length === 0) return (
    <div style={{background:"#0d2618",border:"1px solid #4caf5033",borderRadius:10,
      padding:"10px 14px",color:"#1b6e3a",fontSize:12,fontWeight:700,textAlign:"center"}}>
      ✅ All GST holds have been released
    </div>
  );

  const selectedItem = gstHoldItems.find(g => g.invoiceNo === inv);

  const save = () => {
    if(!inv) { alert("Select an invoice.\nಇನ್‌ವಾಯ್ಸ್ ಆಯ್ಕೆ ಮಾಡಿ."); return; }
    if(!amt || +amt <= 0) { alert("Enter release amount.\nಬಿಡುಗಡೆ ಮೊತ್ತ ನಮೂದಿಸಿ."); return; }
    if(!utr.trim()) { alert("Enter UTR number.\nUTR ನಂಬರ್ ನಮೂದಿಸಿ."); return; }
    const rec = {
      id: "GST"+Date.now(),
      invoiceRef: inv,
      amount: +amt,
      utr: utr.trim(),
      date: date,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };
    setGstReleases(prev => [...(prev||[]), rec]);
    log && log("GST RELEASE", inv+" ₹"+amt+" UTR:"+utr);
    setInv(""); setAmt(""); setUtr(""); setNotes(""); setOpen(false);
  };

  return (
    <div style={{background:C.card,border:"1px solid #21262d",borderRadius:12,overflow:"hidden"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%",background:"none",border:"none",
        padding:"12px 14px",cursor:"pointer",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{color:"#1b6e3a",fontWeight:700,fontSize:13}}>
          ➕ Record GST Release
        </span>
        <span style={{color:"#4a7090",fontSize:12}}>{open?"▲":"▼"}</span>
      </button>
      {open && (
        <div style={{padding:"0 14px 14px",display:"flex",flexDirection:"column",gap:10}}>
          {/* Invoice selector */}
          <div>
            <label style={{color:"#4a7090",fontSize:11,fontWeight:700,textTransform:"uppercase",
              letterSpacing:1,display:"block",marginBottom:4}}>Invoice *</label>
            <select value={inv} onChange={e=>{ setInv(e.target.value);
              const g=gstHoldItems.find(x=>x.invoiceNo===e.target.value);
              if(g) setAmt(String(g.balance)); }}
              style={{width:"100%",background:C.card2,border:"1px solid #30363d",
                borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,outline:"none"}}>
              <option value="">— Select Invoice —</option>
              {pendingItems.map(g=>(
                <option key={g.invoiceNo} value={g.invoiceNo}>
                  {g.invoiceNo} · Pending ₹{Number(g.balance).toLocaleString("en-IN",{maximumFractionDigits:2})}
                </option>
              ))}
            </select>
          </div>
          {selectedItem && (
            <div style={{background:C.card2,borderRadius:8,padding:"8px 12px",fontSize:12}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:"#4a7090"}}>Total Held</span>
                <span style={{color:"#c67c00",fontWeight:700}}>₹{Number(selectedItem.holdAmount).toLocaleString("en-IN",{maximumFractionDigits:2})}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                <span style={{color:"#4a7090"}}>Balance</span>
                <span style={{color:"#b91c1c",fontWeight:700}}>₹{Number(selectedItem.balance).toLocaleString("en-IN",{maximumFractionDigits:2})}</span>
              </div>
            </div>
          )}
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}>
              <label style={{color:"#4a7090",fontSize:11,fontWeight:700,textTransform:"uppercase",
                letterSpacing:1,display:"block",marginBottom:4}}>Release Amount ₹ *</label>
              <input type="number" value={amt} onChange={e=>setAmt(e.target.value)}
                style={{width:"100%",boxSizing:"border-box",background:C.card2,border:"1px solid #30363d",
                  borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,outline:"none"}} />
            </div>
            <div style={{flex:1}}>
              <label style={{color:"#4a7090",fontSize:11,fontWeight:700,textTransform:"uppercase",
                letterSpacing:1,display:"block",marginBottom:4}}>Date *</label>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                onClick={e=>e.target.showPicker?.()}
                style={{width:"100%",boxSizing:"border-box",background:C.card2,border:"1px solid #30363d",
                  borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,outline:"none",colorScheme:"light"}} />
            </div>
          </div>
          <div>
            <label style={{color:"#4a7090",fontSize:11,fontWeight:700,textTransform:"uppercase",
              letterSpacing:1,display:"block",marginBottom:4}}>UTR Number *</label>
            <input value={utr} onChange={e=>setUtr(e.target.value)} placeholder="e.g. 1527531918"
              style={{width:"100%",boxSizing:"border-box",background:C.card2,border:"1px solid #30363d",
                borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,outline:"none"}} />
          </div>
          <div>
            <label style={{color:"#4a7090",fontSize:11,fontWeight:700,textTransform:"uppercase",
              letterSpacing:1,display:"block",marginBottom:4}}>Notes</label>
            <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"
              style={{width:"100%",boxSizing:"border-box",background:C.card2,border:"1px solid #30363d",
                borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,outline:"none"}} />
          </div>
          <button onClick={save} style={{background:"#1b6e3a",border:"none",borderRadius:10,
            color:"#000",padding:"12px",fontWeight:800,fontSize:14,cursor:"pointer",width:"100%"}}>
            ✅ Record GST Release
          </button>
        </div>
      )}
    </div>
  );
}

function Payments({payments, setPayments, trips, setTrips, vehicles, setVehicles, gstReleases, setGstReleases, expenses, setExpenses, user, log}) {

  const [activeTab,   setActiveTab]   = useState("overview");
  const [scanResult,  setScanResult]  = useState(null);
  const [scanning,    setScanning]    = useState(false);
  const [scanError,   setScanError]   = useState(null);
  const [showAlert,   setShowAlert]   = useState(true);
  const [newExp,      setNewExp]      = useState({tripId:"", label:"", amount:""});
  const [searchInv,   setSearchInv]   = useState("");
  const [searchAdv,   setSearchAdv]   = useState("");
  const [searchShort, setSearchShort] = useState("");
  const [searchTrip,  setSearchTrip]  = useState("");
  const [expandedInv, setExpandedInv] = useState(null);
  const [expandedAdv, setExpandedAdv] = useState(null);
  const isOwner = user?.role === "owner";

  const fmtINR = n => Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
  const parseDD = s => {
    if(!s) return "";
    const p = s.split(/[.\-\/]/);
    if(p.length===3 && p[2].length===4) return `${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
    return s;
  };
  const fmtDate = s => {
    if(!s) return "—";
    const d = new Date(s);
    if(isNaN(d)) return s;
    return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"2-digit"});
  };

  // Deduplicated Shree payments only
  const shreePayments = Object.values(
    (payments||[])
      .filter(p => p.totalPaid || p.totalBilled || (p.invoices||[]).length>0)
      .reduce((acc,p) => {
        const key = p.utr || p.id;
        if(!acc[key] || Number(p.totalPaid||0) > Number(acc[key].totalPaid||0)) acc[key]=p;
        return acc;
      }, {})
  ).sort((a,b)=>(b.paymentDate||b.date||"").localeCompare(a.paymentDate||a.date||""));

  const allShortages = shreePayments.flatMap(p =>
    (p.shortages||[]).map(s=>({...s, utr:p.utr, paymentDate:p.paymentDate||p.date}))
  );

  // Client selector for Payments tab — default to first Shree client
  const [payClient, setPayClient] = useState(DEFAULT_CLIENT);
  const payTrips = (trips||[]).filter(t=>(t.client||DEFAULT_CLIENT)===payClient);

  const shreeInvoices = useMemo(() => {
    const map = {};
    payTrips.filter(t=>t.billedToShree&&t.invoiceNo).forEach(t => {
      if(!map[t.invoiceNo]) map[t.invoiceNo] = {
        invoiceNo:t.invoiceNo, invoiceDate:t.invoiceDate, totalAmt:0, trips:[], status:"billed"
      };
      map[t.invoiceNo].trips.push(t);
      map[t.invoiceNo].totalAmt += Number(t.billedToShree||0);
      if(t.paymentDate) map[t.invoiceNo].status = "paid";
    });
    return Object.values(map).sort((a,b)=>(b.invoiceDate||"").localeCompare(a.invoiceDate||""));
  }, [trips, payClient]);

  const shreeTrips = payTrips.filter(t=>t.billedToShree)
    .sort((a,b)=>(b.date||"").localeCompare(a.date||""));

  const tripExps   = tid => (Array.isArray(expenses)?expenses:[]).filter(e=>e.tripId===tid).reduce((s,e)=>s+Number(e.amount||0),0);
  const tripProfit = t => Number(t.paidAmount||t.billedToShree||0)
                        - (t.shreeShortage ? Number(t.shreeShortage.deduction||0) : 0)
                        - tripExps(t.id);

  const totalBilled   = shreeInvoices.reduce((s,i)=>s+i.totalAmt,0);
  const totalReceived = shreePayments.reduce((s,p)=>s+Number(p.totalPaid||0),0);
  const totalHold     = shreePayments.reduce((s,p)=>s+Number(p.holdAmount||0),0);
  const totalShortage = allShortages.reduce((s,sh)=>s+Number(sh.deduction||0),0);

  // ── GST Hold tracking ────────────────────────────────────────────────────────
  // Build per-invoice hold ledger from all payment advices
  const gstHoldItems = useMemo(() => {
    const map = {};
    // Deduplicate by invoiceNo+sapDoc — same invoice can appear in multiple advices
    // Only count hold once per unique invoiceNo+sapDoc combination
    const seen = new Set();
    shreePayments.forEach(pa => {
      (pa.invoices||[]).forEach(inv => {
        const hold = Number(inv.hold||0);
        if(hold <= 0) return;
        // Use invoiceNo+sapDoc as unique key to avoid double-counting
        const dedupeKey = (inv.invoiceNo||"") + "|" + (inv.sapDoc||"");
        if(seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        if(!map[inv.invoiceNo]) {
          map[inv.invoiceNo] = {
            invoiceNo: inv.invoiceNo,
            invDate: inv.invDate || "",
            holdAmount: 0,
            released: 0,
            releaseUtr: "",
            releaseDate: "",
            sapDoc: inv.sapDoc || "",
          };
        }
        map[inv.invoiceNo].holdAmount += hold;
      });
    });
    // Apply releases from gstReleases table (normalize invoice refs for matching)
    const normInvKey = s => (s||"").replace(/\s+/g,"").toUpperCase().trim();
    const mapNorm = {};
    Object.keys(map).forEach(k=>{ mapNorm[normInvKey(k)]=k; });
    (gstReleases||[]).forEach(r => {
      const key = mapNorm[normInvKey(r.invoiceRef)] || r.invoiceRef;
      if(map[key]) {
        map[key].released   += Number(r.amount||0);
        map[key].releaseUtr  = r.utr || map[key].releaseUtr;
        map[key].releaseDate = r.date || map[key].releaseDate;
      }
    });
    return Object.values(map).map(g => ({
      ...g,
      balance: Math.max(0, g.holdAmount - g.released),
      status: g.released >= g.holdAmount ? "released" : g.released > 0 ? "partial" : "pending",
    })).sort((a,b) => (b.invDate||"").localeCompare(a.invDate||""));
  }, [shreePayments, gstReleases]);

  const gstTotalHeld     = gstHoldItems.reduce((s,g)=>s+g.holdAmount,0);
  const gstTotalReleased = gstHoldItems.reduce((s,g)=>s+g.released,0);
  const gstHoldPending   = gstHoldItems.reduce((s,g)=>s+g.balance,0);

  // filtered lists
  const filteredInvoices = shreeInvoices.filter(inv => {
    const q = searchInv.toLowerCase();
    return !q || inv.invoiceNo?.toLowerCase().includes(q)
              || inv.trips.some(t=>(t.lr||t.lrNo||"").toLowerCase().includes(q))
              || fmtDate(inv.invoiceDate).toLowerCase().includes(q);
  });
  const filteredAdvices = shreePayments.filter(p => {
    const q = searchAdv.toLowerCase();
    return !q || (p.utr||"").toLowerCase().includes(q)
              || fmtDate(p.paymentDate||p.date).toLowerCase().includes(q)
              || (p.invoices||[]).some(i=>(i.invoiceNo||"").toLowerCase().includes(q));
  });
  const filteredShortages = allShortages.filter(s => {
    const q = searchShort.toLowerCase();
    return !q || (s.lrNo||s.lr||"").toLowerCase().includes(q)
              || (s.ref||"").toLowerCase().includes(q)
              || (s.utr||"").toLowerCase().includes(q);
  });
  const filteredTrips = shreeTrips.filter(t => {
    const q = searchTrip.toLowerCase();
    return !q || (t.lr||t.lrNo||"").toLowerCase().includes(q)
              || (t.truck||t.truckNo||"").toLowerCase().includes(q)
              || (t.invoiceNo||"").toLowerCase().includes(q);
  });

  // scan
  const handleScan = async (file, scanType) => {
    if(!file) return;
    setScanning(true); setScanResult(null); setScanError(null);
    try {
      const base64 = await new Promise((res,rej)=>{
        const r = new FileReader();
        r.onload = ()=>res(r.result.split(",")[1]);
        r.onerror = ()=>rej(new Error("File read failed"));
        r.readAsDataURL(file);
      });
      const resp = await fetch("/.netlify/functions/scan-shree",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({base64, mediaType:file.type||"application/pdf", scanType}),
      });
      const data = await resp.json();
      if(data.error) setScanError(data.error);
      else setScanResult({...data, type:scanType});
    } catch(e) { setScanError(e.message); }
    finally { setScanning(false); }
  };

  // ── Step 1: IDENTITY MATCH — find the trip by DI or GR number ───────────────
  // Returns {trip, via} or null. Does NOT check amount here.
  const matchInvoiceLine = (st, tripList) => {
    const stDi = (st.diNo||"").trim();
    const stGr = (st.grNo||"").trim();
    const stLr = (st.lrNo||"").trim();

    // 1. Match by DI number (first priority — exact match only)
    if(stDi) {
      const byDi = tripList.find(t =>
        (t.diNo||"").split("+").map(s=>s.trim()).includes(stDi) ||
        (t.diLines||[]).some(d=>(d.diNo||"").trim()===stDi)
      );
      if(byDi) return {trip:byDi, via:"DI"};
    }
    // 2. Match by GR number (second priority)
    if(stGr) {
      const byGr = tripList.find(t =>
        (t.grNo||"").split("+").map(g=>g.trim()).some(g=>g===stGr) ||
        (t.diLines||[]).some(d=>(d.grNo||"").trim()===stGr)
      );
      if(byGr) return {trip:byGr, via:"GR"};
    }
    // 3. Match by LR number (fallback)
    if(stLr) {
      const byLr = tripList.find(t=>(t.lrNo||t.lr||"").trim()===stLr);
      if(byLr) return {trip:byLr, via:"LR"};
    }
    return null;
  };

  // ── Step 2: AMOUNT VALIDATION — after identity match, check the billed amount ─
  // For multi-DI trips: the invoice splits into separate lines per DI.
  // We compare the invoice line amount against what's stored on the matched diLine (or full trip).
  const checkAmount = (st, trip) => {
    const invoiceAmt = Number(st.frtAmt||0);
    if(invoiceAmt === 0) return {ok:true, diff:0}; // can't validate if no amount

    const stDi = (st.diNo||"").trim();
    let expectedAmt = 0;

    if(stDi && (trip.diLines||[]).length > 0) {
      // Multi-DI: find the specific diLine and compute its billed amount
      const diLine = trip.diLines.find(d=>(d.diNo||"").trim()===stDi);
      if(diLine) {
        expectedAmt = (diLine.qty||0) * (diLine.frRate||trip.frRate||0);
      } else {
        // DI matched at trip level but no diLine — use full trip billing
        expectedAmt = trip.billedToShree || (trip.qty||0)*(trip.frRate||0);
      }
    } else {
      // Single DI trip — compare against full billedToShree or qty×frRate
      expectedAmt = trip.billedToShree || (trip.qty||0)*(trip.frRate||0);
    }

    const diff = invoiceAmt - expectedAmt;
    const ok = Math.abs(diff) < 2; // allow ₹2 rounding tolerance
    return {ok, diff, invoiceAmt, expectedAmt};
  };

  const applyInvoiceScan = () => {
    if(!scanResult || scanResult.type!=="invoice") return;
    const invNo = scanResult.invoiceNo;

    // Block if invoice already saved
    if((trips||[]).some(t=>t.invoiceNo===invNo)) {
      setScanError("Invoice "+invNo+" is already scanned and saved. No changes made.");
      return;
    }

    const scTrips = scanResult.trips||[];
    const allTrips = trips||[];

    // ALL lines must match a trip — block if any are unmatched
    const unmatched = scTrips.filter(st => !matchInvoiceLine(st, allTrips));
    if(unmatched.length > 0) {
      const details = unmatched.map(st =>
        "DI: "+(st.diNo||"—")+" · GR: "+(st.grNo||"—")+" · ₹"+Number(st.frtAmt||0).toLocaleString("en-IN")
      ).join("\n");
      setScanError(
        unmatched.length+" trip"+(unmatched.length>1?"s":"")+" in this invoice not found in your Trips:\n\n"+
        details+
        "\n\nGo to Trips tab, add all missing trips first, then scan invoice again."
      );
      return;
    }

    // Block if any amount mismatches
    const mismatches = scTrips.filter(st=>{
      const m = matchInvoiceLine(st, allTrips);
      if(!m) return false;
      return !checkAmount(st, m.trip).ok;
    });
    if(mismatches.length > 0) {
      const details = mismatches.map(st=>{
        const m = matchInvoiceLine(st, allTrips);
        const {invoiceAmt, expectedAmt} = checkAmount(st, m.trip);
        return "DI "+( st.diNo||st.grNo)+": invoice ₹"+invoiceAmt.toLocaleString("en-IN")+" vs trip ₹"+expectedAmt.toLocaleString("en-IN");
      }).join("\n");
      setScanError("Amount mismatch on "+mismatches.length+" line(s):\n\n"+details+"\n\nFix the trip freight rate first, then scan again.");
      return;
    }

    // All matched and amounts OK — apply
    const invDate = parseDD(scanResult.invoiceDate);
    let matched = 0;
    setTrips(prev=>prev.map(t=>{
      const lineMatch = scTrips.reduce((found, st) => {
        if(found) return found;
        const r = matchInvoiceLine(st, [t]);
        return r ? {st, via:r.via} : null;
      }, null);
      if(lineMatch) {
        matched++;
        return {...t, invoiceNo:invNo, invoiceDate:invDate,
          status:"Billed", billedBy:"scan", billedAt:nowTs(),
          shreeStatus:"billed",
          billedToShree: Number(lineMatch.st.frtAmt||t.billedToShree||0) || t.billedToShree};
      }
      return t;
    }));
    log && log("Invoice "+invNo+" scanned — "+matched+" trip(s) marked Billed");
    setScanResult(null);
  };

  const applyPaymentScan = () => {
    if(!scanResult || scanResult.type!=="payment") return;
    const utr=scanResult.utr, pDate=parseDD(scanResult.paymentDate);
    if((payments||[]).some(p=>p.utr===utr)) {
      setScanError(`Payment advice UTR ${utr} is already uploaded. Discard this scan.`); return;
    }
    const invList=scanResult.invoices||[], shorts=scanResult.shortages||[], exps=scanResult.expenses||[];

    // Build a map of lrNo → trip for shortages lookup
    const allTrips = trips||[];
    const lrToTrip = {};
    allTrips.forEach(t=>{ if(t.lrNo||t.lr) lrToTrip[(t.lrNo||t.lr).trim()]=t; });

    // Apply trip updates — mark paid, attach shreeShortage
    const paidTrips = [];
    setTrips(prev=>prev.map(t=>{
      if(invList.some(i=>i.invoiceNo===t.invoiceNo)){
        const lrKey=(t.lrNo||t.lr||"").trim();
        const short=shorts.find(s=>(s.lrNo||"").trim()===lrKey);
        if(t.orderType==="party" && t.id) paidTrips.push(t.id); // track for file deletion
        return {...t, paidAmount:Number(t.billedToShree||0), paymentDate:pDate, utr,
          shreeStatus:"paid",
          shortage: short ? (t.shortage||0)+Number(short.tonnes||0) : t.shortage,
          shreeShortage:short?{tonnes:Number(short.tonnes||0),deduction:Number(short.deduction||0)}:t.shreeShortage};
      }
      return t;
    }));
    // Delete party files from Supabase Storage for paid trips
    if(paidTrips.length>0){
      paidTrips.forEach(tid => deletePartyFiles(tid).catch(e=>console.warn("File delete error:",e)));
    }

    const pa={id:"PA"+Date.now(), utr, paymentDate:pDate,
      totalPaid:Number(scanResult.totalPaid||0), totalBilled:Number(scanResult.totalBilled||0),
      tdsDeducted:Number(scanResult.tdsDeducted||0), holdAmount:Number(scanResult.holdAmount||0),
      invoices:invList, shortages:shorts, penalties:scanResult.penalties||[], expenses:exps};

    // Detect GST releases BEFORE adding pa to payments state
    // Build held map from EXISTING payments only (not including pa yet)
    if(setGstReleases) {
      const heldInvMap = {};
      (payments||[]).forEach(existingPa => {
        (existingPa.invoices||[]).forEach(inv => {
          const h = Number(inv.hold||0);
          if(h > 0) {
            const key = inv.invoiceNo+"|"+(inv.sapDoc||"");
            if(!heldInvMap[inv.invoiceNo] || !heldInvMap[inv.invoiceNo].keys?.has(key)) {
              if(!heldInvMap[inv.invoiceNo]) heldInvMap[inv.invoiceNo] = {total:0, keys:new Set()};
              if(!heldInvMap[inv.invoiceNo].keys.has(key)) {
                heldInvMap[inv.invoiceNo].total += h;
                heldInvMap[inv.invoiceNo].keys.add(key);
              }
            }
          }
        });
      });
      // Normalize invoice number — remove spaces, handle merged digits
      const normInv = s => (s||"").replace(/\s+/g,"").toUpperCase().trim();
      // Build normalized lookup of held invoices
      const heldNormMap = {};
      Object.keys(heldInvMap).forEach(k=>{ heldNormMap[normInv(k)]=k; });

      const gstReleasesToAdd = [];
      invList.forEach(inv => {
        const hold = Number(inv.hold||0);
        if(hold > 0) return; // new hold, not a release
        // Match using normalized invoice number
        const norm = normInv(inv.invoiceNo);
        const originalKey = heldNormMap[norm];
        if(!originalKey) return; // never held
        const payAmt = Number(inv.paymentAmt||inv.totalAmt||0);
        if(payAmt <= 0) return;
        const alreadyReleased = (gstReleases||[]).some(r=>normInv(r.invoiceRef)===norm&&r.utr===utr);
        if(alreadyReleased) return;
        gstReleasesToAdd.push({
          id:"GST"+Date.now()+Math.random().toString(36).slice(2,5),
          invoiceRef: originalKey, // use the original clean invoice number
          amount: payAmt,
          utr, date: pDate,
          notes:"Auto-detected GST release",
          createdAt: new Date().toISOString(),
        });
      });
      if(gstReleasesToAdd.length > 0) {
        setGstReleases(prev=>[...(prev||[]),...gstReleasesToAdd]);
        log && log("GST RELEASES: "+gstReleasesToAdd.length+" invoices · UTR:"+utr);
      }
    }

    setPayments(prev=>[...(prev||[]),pa]);

    // Save expenses — expenses is a flat array, add each as a new record
    if(exps.length>0&&setExpenses){
      const newExps = exps.map(exp=>({
        id:"EXP"+Date.now()+Math.random().toString(36).slice(2,6),
        date:pDate||new Date().toISOString().slice(0,10),
        label:exp.description||exp.ref||"Shree Expense",
        amount:Math.abs(Number(exp.amount||0)),  // abs() handles negative amounts like "590.00-"
        category:exp.category||"other",
        notes:"UTR:"+utr,
        createdBy:user?.name||"",
        createdAt:new Date().toISOString()
      }));
      setExpenses(prev=>[...(Array.isArray(prev)?prev:[]),...newExps]);
    }

    // Push shortages to vehicle shortage ledger (linked to LR)
    if(shorts.length>0&&setVehicles){
      setVehicles(prev=>(prev||[]).map(v=>{
        const vehicleShorts = shorts.filter(s=>{
          const lrKey=(s.lrNo||"").trim();
          const trip=lrToTrip[lrKey];
          return trip && (trip.truckNo===v.truckNo || trip.truck===v.truckNo);
        });
        if(!vehicleShorts.length) return v;
        const newTxns = vehicleShorts.map(s=>({
          id:uid(), type:"recorded",
          date: pDate||new Date().toISOString().slice(0,10),
          mt: Number(s.tonnes||0),
          amount: Number(s.deduction||0),
          lrNo: (s.lrNo||"").trim(),
          note: `Shree deduction · UTR:${utr}`,
          source: "shree_scan",
        }));
        const addedOwed = vehicleShorts.reduce((s,sh)=>s+Number(sh.deduction||0),0);
        return {
          ...v,
          shortageOwed: (Number(v.shortageOwed||0)+addedOwed),
          shortageTxns: [...(v.shortageTxns||[]),...newTxns],
        };
      }));
    }

    log && log("Payment advice UTR "+utr+" applied — "+shorts.length+" shortage(s), "+exps.length+" expense(s), hold ₹"+Number(scanResult.holdAmount||0).toLocaleString("en-IN"));
    setScanResult(null);
  };

  // delete (owner only)
  const deleteInvoice = async (invoiceNo) => {
    if(!window.confirm(`Delete invoice ${invoiceNo}? This will unmark all its trips.`)) return;
    const updated = (trips||[]).map(t=>t.invoiceNo===invoiceNo
      ?{...t,invoiceNo:"",invoiceDate:"",billedToShree:0,shreeStatus:"pending"}:t);
    setTrips(updated);
    // Persist each reverted trip to DB
    for(const t of updated.filter(t=>t.shreeStatus==="pending"&&!t.invoiceNo)){
      try { await DB.saveTrip(t); } catch(e){ console.error("revert trip:",e); }
    }
    log && log(`Invoice ${invoiceNo} deleted by ${user?.name}`);
  };
  const deleteAdvice = async (utr, id) => {
    if(!window.confirm(`Delete payment advice UTR ${utr}? This will revert trips to Billed status.`)) return;
    // Remove payment record from local state
    setPayments(prev=>prev.filter(p=>p.id!==id));
    // Revert trips to Billed
    const revertedTrips = (trips||[]).map(t=>t.utr===utr
      ?{...t,paidAmount:0,paymentDate:"",utr:"",shreeStatus:"billed",shreeShortage:null}:t);
    setTrips(revertedTrips);
    // Persist to DB
    try { await DB.deletePayment(id); } catch(e){ console.error("delete payment:",e); }
    for(const t of revertedTrips.filter(t=>t.shreeStatus==="billed"&&!t.utr)){
      try { await DB.saveTrip(t); } catch(e){ console.error("revert trip:",e); }
    }
    // Also remove any gstReleases recorded for this UTR
    if(setGstReleases) {
      const toDelete = (gstReleases||[]).filter(r=>r.utr===utr);
      if(toDelete.length>0) {
        setGstReleases(prev=>(prev||[]).filter(r=>r.utr!==utr));
        for(const r of toDelete) {
          try { await DB.deleteGstRelease(r.id); } catch(e){ console.error("delete gstRelease:",e); }
        }
      }
    }
    log && log(`Payment advice UTR ${utr} deleted by ${user?.name}`);
  };

  // shared UI
  const Pill = ({status,shortage}) => {
    const c={pending:{bg:"#2a2a2a",col:"#888",txt:"Pending"},
             billed:{bg:"#1a2a1a",col:"#1b6e3a",txt:"Billed"},
             paid:{bg:"#1a1a2e",col:"#1565c0",txt:"Paid"}}[status]||{bg:"#2a2a2a",col:"#888",txt:"Pending"};
    return <span style={{display:"inline-flex",alignItems:"center",gap:3}}>
      <span style={{background:c.bg,color:c.col,border:`1px solid ${c.col}40`,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:700}}>{c.txt}</span>
      {shortage&&<span style={{background:"#2a1515",color:"#b91c1c",border:"1px solid #ff6b6b40",borderRadius:4,padding:"2px 5px",fontSize:10,fontWeight:700}}>⚠SHORT</span>}
    </span>;
  };

  const SearchBar = ({value,onChange,placeholder}) => (
    <div style={{position:"relative",marginBottom:12}}>
      <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#4a7090",pointerEvents:"none"}}>🔍</span>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:"100%",boxSizing:"border-box",background:"#161616",border:"1px solid #2a2a2a",
          borderRadius:8,padding:"9px 32px 9px 32px",color:"#ccc",fontSize:13,outline:"none"}}/>
      {value&&<button onClick={()=>onChange("")}
        style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
          background:"none",border:"none",color:"#4a7090",cursor:"pointer",fontSize:16,lineHeight:1}}>✕</button>}
    </div>
  );

  const EmptyState = ({icon,text}) => (
    <div style={{textAlign:"center",padding:"40px 20px",color:"#444"}}>
      <div style={{fontSize:32,marginBottom:8}}>{icon}</div>
      <div style={{fontSize:13}}>{text}</div>
    </div>
  );

  return (
    <div style={{background:"#0d0d0d",minHeight:"100vh",color:"#e0e0e0",fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>

      {/* header + KPIs */}
      <div style={{background:C.bg,borderBottom:"1px solid #222",padding:"14px 16px"}}>
        <div style={{fontSize:10,letterSpacing:3,color:"#4a7090",marginBottom:2}}>M YANTRA ENTERPRISES</div>
        <div style={{fontSize:17,fontWeight:800,color:"#fff",marginBottom:12}}>💰 Shree Cement — Payments</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
          {[
            {label:"Total Billed",   val:`₹${fmtINR(totalBilled)}`,   col:"#1565c0"},
            {label:"Total Received", val:`₹${fmtINR(totalReceived)}`, col:"#1b6e3a"},
            {label:"On Hold",        val:`₹${fmtINR(totalHold)}`,     col:"#c67c00"},
            {label:"Shortage Lost",  val:`₹${fmtINR(totalShortage)}`, col:"#b91c1c"},
          ].map(m=>(
            <div key={m.label} style={{background:"#161616",borderRadius:6,padding:"8px 12px"}}>
              <div style={{fontSize:9,color:"#4a7090",letterSpacing:1}}>{m.label}</div>
              <div style={{fontWeight:800,color:m.col,fontSize:15}}>{m.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* shortage alert */}
      {showAlert&&allShortages.length>0&&(
        <div style={{background:"#1a0a0a",borderBottom:"1px solid #ff6b6b30",padding:"8px 16px",
          display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span>🚨</span>
          <span style={{color:"#b91c1c",fontWeight:700,fontSize:12}}>
            {allShortages.length} shortage{allShortages.length>1?"s":""} — ₹{fmtINR(totalShortage)} deducted
          </span>
          <button onClick={()=>setActiveTab("shortages")}
            style={{background:"#ff6b6b15",border:"1px solid #ff6b6b50",color:"#b91c1c",
              padding:"2px 10px",borderRadius:4,cursor:"pointer",fontSize:11}}>View</button>
          <button onClick={()=>setShowAlert(false)}
            style={{marginLeft:"auto",background:"none",border:"none",color:"#4a7090",cursor:"pointer",fontSize:16}}>✕</button>
        </div>
      )}

      {/* Client / Plant switcher */}
      <div style={{display:"flex",gap:8,padding:"10px 14px 0",flexWrap:"wrap"}}>
        {CLIENTS.map(c=>(
          <button key={c} onClick={()=>setPayClient(c)}
            style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",
              border:`2px solid ${payClient===c?"#1565c0":"#333"}`,
              background:payClient===c?"#5b8dee22":"none",
              color:payClient===c?"#1565c0":"#666"}}>
            {c.replace("Shree Cement ","SC ").replace("Ultratech ","Ultratech ")}
            <span style={{fontSize:10,opacity:0.7,marginLeft:4}}>
              ({(trips||[]).filter(t=>(t.client||DEFAULT_CLIENT)===c&&t.billedToShree).length})
            </span>
          </button>
        ))}
      </div>

      {/* tabs with badges */}
      <div style={{background:C.bg,borderBottom:"1px solid #1e1e1e",
        display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
        {[
          {id:"overview",  label:"Overview",  badge:null},
          {id:"invoices",  label:"Invoices",  badge:shreeInvoices.length||null},
          {id:"payments",  label:"Advice",    badge:shreePayments.length||null},
          {id:"shortages", label:"Shortages", badge:allShortages.length||null},
          {id:"gst",       label:"GST Hold",  badge:gstHoldPending>0?gstHoldItems.filter(g=>g.balance>0).length:null},
          {id:"profit",    label:"Profit",    badge:null},
        ].map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            background:"none",border:"none",padding:"11px 14px",cursor:"pointer",
            whiteSpace:"nowrap",flexShrink:0,
            fontSize:13,fontWeight:activeTab===t.id?700:400,
            color:activeTab===t.id?"#fff":"#555",
            borderBottom:activeTab===t.id?"2px solid #5b8dee":"2px solid transparent",
          }}>
            {t.label}
            {t.badge!=null&&(
              <span style={{marginLeft:5,background:activeTab===t.id?"#5b8dee22":"#222",
                color:activeTab===t.id?"#1565c0":"#666",borderRadius:10,
                padding:"1px 6px",fontSize:10,fontWeight:700}}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{padding:14}}>

        {/* ══ OVERVIEW ══════════════════════════════════════════════ */}
        {activeTab==="overview"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
              {[
                {label:"Shree Trips",     val:shreeTrips.length,                                                               col:"#1565c0"},
                {label:"Pending Billing", val:shreeTrips.filter(t=>!t.shreeStatus||t.shreeStatus==="pending").length,          col:"#c67c00"},
                {label:"Billed / Paid",   val:`${shreeTrips.filter(t=>t.shreeStatus==="billed").length} / ${shreeTrips.filter(t=>t.shreeStatus==="paid").length}`, col:"#1b6e3a"},
                {label:"Shortage Alerts", val:allShortages.length,                                                             col:"#b91c1c"},
              ].map(c=>(
                <div key={c.label} style={{background:"#151515",border:"1px solid #222",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:10,color:"#4a7090",letterSpacing:1,marginBottom:4}}>{c.label}</div>
                  <div style={{fontSize:24,fontWeight:800,color:c.col}}>{c.val}</div>
                </div>
              ))}
            </div>

            {/* scan zone */}
            <div style={{background:C.bg,border:"1px solid #222",borderRadius:8,padding:14,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:10}}>📤 Scan with AI</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[
                  {icon:"📄",label:"Upload Invoice PDF",      sub:"Extracts LR-wise FRT amounts → marks trips Billed",   type:"invoice"},
                  {icon:"💳",label:"Upload Payment Advice",   sub:"Marks trips Paid + saves electricity/penalty expenses",type:"payment"},
                ].map(btn=>(
                  <div key={btn.type} style={{border:"1.5px dashed #2a2a2a",borderRadius:8,
                    padding:"14px",textAlign:"center",background:"#0d0d0d"}}>
                    <div style={{fontSize:24,marginBottom:4}}>{btn.icon}</div>
                    <div style={{color:"#ccc",fontWeight:600,fontSize:13,marginBottom:4}}>{btn.label}</div>
                    <div style={{fontSize:11,color:"#4a7090",marginBottom:10}}>{btn.sub}</div>
                    <FileSourcePicker onFile={f=>handleScan(f,btn.type)} accept=".pdf,image/*"
                      label={btn.label} color={"#1565c0"} compact={true} />
                  </div>
                ))}
              </div>

              {scanning&&(
                <div style={{marginTop:14,textAlign:"center",color:"#1565c0",fontSize:13}}>
                  <span style={{display:"inline-block",animation:"spin 1s linear infinite",marginRight:6}}>⏳</span>
                  Scanning with AI…
                </div>
              )}
              {scanError&&(
                <div style={{marginTop:10,background:"#1a0808",border:"1px solid #ff6b6b40",borderRadius:6,
                  padding:"10px 12px",color:"#b91c1c",fontSize:12,display:"flex",justifyContent:"space-between",gap:8}}>
                  <span>✕ {scanError}</span>
                  <button onClick={()=>{setScanError(null);setScanResult(null);}}
                    style={{background:"none",border:"none",color:"#b91c1c",cursor:"pointer",flexShrink:0}}>Dismiss</button>
                </div>
              )}

              {scanResult&&!scanError&&(
                <div style={{marginTop:12,background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:12}}>
                  <div style={{fontWeight:700,color:"#1b6e3a",marginBottom:10,fontSize:13}}>
                    ✅ {scanResult.type==="invoice"?"Invoice":"Payment Advice"} scanned
                  </div>

                  {scanResult.type==="invoice"&&(
                    <>
                      <div style={{fontSize:12,color:"#6b82a0",marginBottom:10,display:"flex",gap:12,flexWrap:"wrap"}}>
                        <b style={{color:"#fff"}}>{scanResult.invoiceNo||"—"}</b>
                        <span>{scanResult.invoiceDate||"—"}</span>
                        <span style={{color:"#1565c0",fontWeight:700}}>₹{fmtINR(scanResult.totalAmount)}</span>
                      </div>
                      {/* Per-line: Step 1 identity + Step 2 amount */}
                      {(scanResult.trips||[]).map((st,i)=>{
                        const m   = matchInvoiceLine(st, trips||[]);
                        const trip = m?.trip;
                        const amtCheck = trip ? checkAmount(st, trip) : null;
                        const rowOk = trip && amtCheck?.ok;
                        const rowWarn = trip && !amtCheck?.ok;
                        return (
                          <div key={i} style={{padding:"8px 0",borderBottom:"1px solid #ccddf0",fontSize:12}}>
                            {/* Identity row */}
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                              <div style={{flex:1,minWidth:0}}>
                                <span style={{fontFamily:"monospace",color:"#bbb",fontSize:11}}>
                                  DI: {st.diNo||"—"}
                                </span>
                                {st.grNo && <span style={{fontFamily:"monospace",color:"#4a7090",fontSize:10,marginLeft:8}}>GR: {st.grNo}</span>}
                              </div>
                              <span style={{fontFamily:"monospace",color:"#fff",flexShrink:0}}>₹{fmtINR(st.frtAmt)}</span>
                              <span style={{flexShrink:0,fontSize:11}}>
                                {trip
                                  ? <span style={{color:"#1b6e3a"}}>✓ LR {trip.lrNo||trip.lr}</span>
                                  : <span style={{color:"#b91c1c"}}>✗ no trip</span>}
                              </span>
                            </div>
                            {/* Amount validation row */}
                            {trip && (
                              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,fontSize:11}}>
                                <span style={{color:"#4a7090"}}>Amount:</span>
                                {amtCheck?.ok
                                  ? <span style={{color:"#1b6e3a"}}>✓ matches (₹{fmtINR(amtCheck.expectedAmt)} in trip)</span>
                                  : <span style={{color:"#c67c00"}}>
                                      ⚠ mismatch — invoice ₹{fmtINR(amtCheck?.invoiceAmt)} vs trip ₹{fmtINR(amtCheck?.expectedAmt)}
                                      {" "}<span style={{color:"#b91c1c"}}>(diff ₹{fmtINR(Math.abs(amtCheck?.diff||0))})</span>
                                    </span>}
                              </div>
                            )}
                            {/* No match guidance */}
                            {!trip && (
                              <div style={{color:"#c67c00",fontSize:10,marginTop:3}}>
                                ↳ Go to Trips tab, add this trip (DI: {st.diNo||"—"}) first, then scan invoice again
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Summary bar + Apply button */}
                      {(()=>{
                        const lines = scanResult.trips||[];
                        const identityOk  = lines.filter(st=>matchInvoiceLine(st,trips||[])).length;
                        const amtOk       = lines.filter(st=>{const m=matchInvoiceLine(st,trips||[]);return m&&checkAmount(st,m.trip).ok;}).length;
                        const noTrip      = lines.length - identityOk;
                        const amtMismatch = identityOk - amtOk;
                        const allOk       = noTrip===0 && amtMismatch===0 && identityOk===lines.length;
                        const alreadySaved = (trips||[]).some(t=>t.invoiceNo===scanResult.invoiceNo);
                        return (<>
                          <div style={{marginTop:8,padding:"8px 0",display:"flex",gap:12,flexWrap:"wrap",
                            fontSize:11,borderTop:"1px solid #1a2a1a"}}>
                            {allOk
                              ? <span style={{color:"#1b6e3a",fontWeight:700}}>✓ All {lines.length} trips matched — ready to apply</span>
                              : <>
                                  <span style={{color:"#1b6e3a"}}>{amtOk} matched</span>
                                  {amtMismatch>0 && <span style={{color:"#c67c00"}}>⚠ {amtMismatch} amount mismatch</span>}
                                  {noTrip>0 && <span style={{color:"#b91c1c"}}>✗ {noTrip} trip not in system — add to Trips tab first</span>}
                                </>}
                          </div>
                          {alreadySaved && (
                            <div style={{background:"#fef2f2",border:"1px solid #ff6b6b44",borderRadius:8,
                              padding:"8px 12px",color:"#b91c1c",fontSize:12,fontWeight:700}}>
                              ⚠ Invoice {scanResult.invoiceNo} is already saved. Scanning again will not change anything.
                            </div>
                          )}
                          <div style={{display:"flex",gap:8,marginTop:8}}>
                            <button onClick={applyInvoiceScan} disabled={!allOk||alreadySaved}
                              style={{flex:1,background:allOk&&!alreadySaved?"#1b6e3a":"#333",
                                color:allOk&&!alreadySaved?"#000":"#666",border:"none",borderRadius:6,
                                padding:"10px",fontWeight:700,
                                cursor:allOk&&!alreadySaved?"pointer":"not-allowed",fontSize:13}}>
                              {alreadySaved ? "Already Saved" : allOk ? "✓ Apply — Mark Billed" : "Fix issues above first"}
                            </button>
                            <button onClick={()=>setScanResult(null)}
                              style={{background:"#e8f0fa",color:"#6b82a0",border:"1px solid #ccddf0",borderRadius:6,
                                padding:"10px 14px",cursor:"pointer",fontSize:12}}>Discard</button>
                          </div>
                        </>);
                      })()}
                    </>
                  )}

                  {scanResult.type==="payment"&&(
                    <>
                      <div style={{fontSize:12,color:"#6b82a0",marginBottom:10,display:"flex",gap:12,flexWrap:"wrap"}}>
                        <span>UTR: <b style={{color:"#fff"}}>{scanResult.utr||"—"}</b></span>
                        <span>{scanResult.paymentDate||"—"}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,marginBottom:10}}>
                        {[
                          {l:"Net Paid",   v:scanResult.totalPaid,   c:"#1b6e3a"},
                          {l:"TDS",        v:scanResult.tdsDeducted, c:"#c67c00"},
                          {l:"Hold",       v:scanResult.holdAmount,  c:"#c67c00"},
                          {l:"Total Bill", v:scanResult.totalBilled, c:"#aaa"},
                        ].map(m=>(
                          <div key={m.l} style={{background:"#0d0d0d",borderRadius:4,padding:"6px 8px"}}>
                            <div style={{fontSize:9,color:"#4a7090"}}>{m.l}</div>
                            <div style={{fontWeight:700,color:m.c,fontSize:13}}>₹{fmtINR(m.v)}</div>
                          </div>
                        ))}
                      </div>
                      {(scanResult.shortages||[]).length>0&&(
                        <div style={{background:"#1a0808",borderRadius:6,padding:"8px 10px",marginBottom:8}}>
                          <div style={{color:"#b91c1c",fontWeight:700,fontSize:11,marginBottom:4}}>⚠ Shortages</div>
                          {(scanResult.shortages||[]).map((s,i)=>(
                            <div key={i} style={{fontSize:11,color:"#ff9999",padding:"2px 0"}}>
                              {s.lrNo} — {s.tonnes} TO — ₹{fmtINR(s.deduction)}
                            </div>
                          ))}
                        </div>
                      )}
                      {(scanResult.expenses||[]).length>0&&(
                        <div style={{background:"#1a1000",borderRadius:6,padding:"8px 10px",marginBottom:8}}>
                          <div style={{color:"#c67c00",fontWeight:700,fontSize:11,marginBottom:4}}>
                            📋 Debit Notes → will save as Expenses
                          </div>
                          {(scanResult.expenses||[]).map((e,i)=>(
                            <div key={i} style={{fontSize:11,color:"#ffcc88",padding:"2px 0",
                              display:"flex",justifyContent:"space-between"}}>
                              <span>{e.description||e.ref}</span>
                              <span style={{fontFamily:"monospace"}}>₹{fmtINR(e.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={applyPaymentScan}
                          style={{flex:1,background:"#1565c0",color:"#000",border:"none",borderRadius:6,
                            padding:"10px",fontWeight:700,cursor:"pointer",fontSize:12}}>✓ Apply — Mark Paid</button>
                        <button onClick={()=>setScanResult(null)}
                          style={{background:"#e8f0fa",color:"#6b82a0",border:"1px solid #ccddf0",borderRadius:6,
                            padding:"10px 14px",cursor:"pointer",fontSize:12}}>Discard</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* recent trips */}
            <div style={{background:C.bg,border:"1px solid #222",borderRadius:8,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",borderBottom:"1px solid #1e1e1e",
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,fontSize:13}}>Recent Shree Trips</span>
                {shreeTrips.length>5&&(
                  <button onClick={()=>setActiveTab("invoices")}
                    style={{background:"none",border:"none",color:"#1565c0",fontSize:12,cursor:"pointer"}}>
                    View all →</button>
                )}
              </div>
              {shreeTrips.length===0
                ? <EmptyState icon="🚛" text='Trips with "Billed to Shree" amount will appear here.'/>
                : shreeTrips.slice(0,5).map(t=>(
                  <div key={t.id} style={{padding:"10px 14px",borderBottom:"1px solid #161616",
                    background:t.shreeShortage?"#140808":"transparent"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{fontFamily:"monospace",fontSize:12,color:"#ccc"}}>{t.lr||t.lrNo}</span>
                      <Pill status={t.shreeStatus||"pending"} shortage={t.shreeShortage}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#4a7090"}}>
                      <span>{t.truck||t.truckNo} · {fmtDate(t.date)}</span>
                      <span style={{fontFamily:"monospace",color:"#1565c0"}}>₹{fmtINR(t.billedToShree)}</span>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ══ INVOICES ══════════════════════════════════════════════ */}
        {activeTab==="invoices"&&(
          <div>
            <SearchBar value={searchInv} onChange={setSearchInv} placeholder="Search invoice no, LR, date…"/>
            <div style={{fontSize:11,color:"#4a7090",marginBottom:10}}>
              {filteredInvoices.length} of {shreeInvoices.length} invoice{shreeInvoices.length!==1?"s":""}
              {searchInv&&` · "${searchInv}"`}
            </div>
            {filteredInvoices.length===0
              ? <EmptyState icon="🧾" text={searchInv?"No invoices match your search.":"No invoices yet. Upload an invoice PDF."}/>
              : filteredInvoices.map(inv=>{
                const isOpen = expandedInv===inv.invoiceNo;
                return (
                  <div key={inv.invoiceNo} style={{background:C.bg,border:"1px solid #222",
                    borderRadius:8,marginBottom:10,overflow:"hidden"}}>
                    <div onClick={()=>setExpandedInv(isOpen?null:inv.invoiceNo)}
                      style={{padding:"12px 14px",cursor:"pointer",
                        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                          <span style={{fontFamily:"monospace",fontWeight:700,color:"#fff",fontSize:13}}>
                            {inv.invoiceNo}
                          </span>
                          <Pill status={inv.status}/>
                        </div>
                        <div style={{display:"flex",gap:10,fontSize:11,color:"#4a7090",flexWrap:"wrap"}}>
                          <span>{fmtDate(inv.invoiceDate)}</span>
                          <span>{inv.trips.length} trip{inv.trips.length!==1?"s":""}</span>
                          <span style={{color:"#1565c0",fontWeight:700}}>₹{fmtINR(inv.totalAmt)}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        {isOwner&&(
                          <button onClick={e=>{e.stopPropagation();deleteInvoice(inv.invoiceNo);}}
                            style={{background:"#1a0808",border:"1px solid #ff6b6b30",color:"#b91c1c",
                              borderRadius:5,padding:"5px 9px",fontSize:12,cursor:"pointer"}}>🗑</button>
                        )}
                        <span style={{color:"#333",fontSize:16,fontWeight:700}}>{isOpen?"▲":"▼"}</span>
                      </div>
                    </div>
                    {isOpen&&(
                      <div style={{borderTop:"1px solid #1e1e1e"}}>
                        {inv.trips.map(t=>(
                          <div key={t.id} style={{padding:"9px 14px",borderBottom:"1px solid #161616",
                            background:t.shreeShortage?"#140808":"#0d0d0d"}}>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                              <span style={{fontFamily:"monospace",color:"#6b82a0"}}>{t.lr||t.lrNo}</span>
                              <span style={{fontFamily:"monospace",color:"#ccc",fontWeight:700}}>
                                ₹{fmtINR(t.billedToShree)}
                              </span>
                            </div>
                            <div style={{display:"flex",gap:10,fontSize:10,color:"#4a7090",marginTop:2}}>
                              <span>{t.truck||t.truckNo}</span>
                              <span>{t.qty} MT</span>
                              {t.paymentDate&&<span style={{color:"#1b6e3a"}}>✓ Paid {fmtDate(t.paymentDate)}</span>}
                            </div>
                            {t.shreeShortage&&(
                              <div style={{fontSize:10,color:"#b91c1c",marginTop:3}}>
                                ⚠ {t.shreeShortage.tonnes} TO short — ₹{fmtINR(t.shreeShortage.deduction)}
                              </div>
                            )}
                          </div>
                        ))}
                        <div style={{padding:"8px 14px",display:"flex",justifyContent:"space-between",
                          fontSize:11,background:"#0d0d0d",borderTop:"1px solid #1a1a1a"}}>
                          <span style={{color:"#4a7090"}}>Invoice Total</span>
                          <span style={{fontFamily:"monospace",color:C.text,fontWeight:700}}>₹{fmtINR(inv.totalAmt)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
        )}

        {/* ══ PAYMENT ADVICE ════════════════════════════════════════ */}
        {activeTab==="payments"&&(
          <div>
            <SearchBar value={searchAdv} onChange={setSearchAdv} placeholder="Search UTR, invoice no, date…"/>
            <div style={{fontSize:11,color:"#4a7090",marginBottom:10}}>
              {filteredAdvices.length} of {shreePayments.length} advice{shreePayments.length!==1?"s":""}
              {searchAdv&&` · "${searchAdv}"`}
            </div>
            {filteredAdvices.length===0
              ? <EmptyState icon="💳" text={searchAdv?"No advices match your search.":"No payment advices yet."}/>
              : filteredAdvices.map(p=>{
                const key=p.id||p.utr;
                const isOpen=expandedAdv===key;
                const frtInvoices=(p.invoices||[]).filter(i=>i.invoiceNo&&!i.invoiceNo.startsWith("KR"));
                const allExpenses=[...(p.expenses||[]),...(p.penalties||[])];
                return (
                  <div key={key} style={{background:C.bg,border:"1px solid #222",
                    borderRadius:8,marginBottom:12,overflow:"hidden"}}>
                    <div onClick={()=>setExpandedAdv(isOpen?null:key)}
                      style={{padding:"12px 14px",cursor:"pointer",
                        display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                          <span style={{fontFamily:"monospace",color:"#1565c0",fontSize:13,fontWeight:700}}>
                            UTR: {p.utr}
                          </span>
                          {(p.shortages||[]).length>0&&(
                            <span style={{background:"#2a1515",color:"#b91c1c",border:"1px solid #ff6b6b30",
                              borderRadius:4,padding:"1px 6px",fontSize:10}}>
                              ⚠ {p.shortages.length} shortage{p.shortages.length>1?"s":""}
                            </span>
                          )}
                        </div>
                        <div style={{display:"flex",gap:10,fontSize:11,color:"#4a7090",flexWrap:"wrap"}}>
                          <span>{fmtDate(p.paymentDate||p.date)}</span>
                          <span style={{color:"#1b6e3a",fontWeight:700}}>₹{fmtINR(p.totalPaid||p.paid)}</span>
                          <span>{frtInvoices.length} invoice{frtInvoices.length!==1?"s":""}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        {isOwner&&(
                          <button onClick={e=>{e.stopPropagation();deleteAdvice(p.utr,p.id);}}
                            style={{background:"#1a0808",border:"1px solid #ff6b6b30",color:"#b91c1c",
                              borderRadius:5,padding:"5px 9px",fontSize:12,cursor:"pointer"}}>🗑</button>
                        )}
                        <span style={{color:"#333",fontSize:16,fontWeight:700}}>{isOpen?"▲":"▼"}</span>
                      </div>
                    </div>

                    {isOpen&&(
                      <div style={{borderTop:"1px solid #1e1e1e"}}>
                        {/* amounts grid */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)"}}>
                          {[
                            {l:"Total Billed",  v:p.totalBilled||p.totalBill, c:"#aaa"},
                            {l:"Net Paid",      v:p.totalPaid||p.paid,        c:"#1b6e3a"},
                            {l:"TDS Deducted",  v:p.tdsDeducted||p.tds,      c:"#c67c00"},
                            {l:"On Hold",       v:p.holdAmount||p.gstHold,    c:"#c67c00"},
                          ].map((m,i)=>(
                            <div key={m.l} style={{padding:"10px 14px",background:"#0d0d0d",
                              borderRight:i%2===0?"1px solid #1a1a1a":"none",
                              borderBottom:i<2?"1px solid #1a1a1a":"none"}}>
                              <div style={{fontSize:9,color:"#4a7090",letterSpacing:1}}>{m.l}</div>
                              <div style={{fontWeight:800,color:m.c,fontSize:14}}>₹{fmtINR(m.v)}</div>
                            </div>
                          ))}
                        </div>
                        {/* invoices */}
                        {frtInvoices.length>0&&(
                          <>
                            <div style={{padding:"6px 14px",fontSize:10,fontWeight:700,color:"#4a7090",
                              letterSpacing:1,background:"#0d0d0d",borderTop:"1px solid #1a1a1a"}}>INVOICES</div>
                            {frtInvoices.map((inv,i)=>(
                              <div key={i} style={{padding:"8px 14px",borderTop:"1px solid #161616",
                                display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}>
                                <span style={{fontFamily:"monospace",color:"#6b82a0"}}>{inv.invoiceNo}</span>
                                <div style={{textAlign:"right"}}>
                                  <div style={{color:"#1b6e3a",fontWeight:700}}>₹{fmtINR(inv.paymentAmt)}</div>
                                  {inv.tds>0&&<div style={{fontSize:10,color:"#c67c00"}}>TDS ₹{fmtINR(inv.tds)}</div>}
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                        {/* shortages */}
                        {(p.shortages||[]).length>0&&(
                          <>
                            <div style={{padding:"6px 14px",fontSize:10,fontWeight:700,color:"#b91c1c",
                              letterSpacing:1,background:"#140808",borderTop:"1px solid #2a1212"}}>⚠ SHORTAGES</div>
                            {(p.shortages||[]).map((s,i)=>(
                              <div key={i} style={{padding:"8px 14px",borderTop:"1px solid #1a0a0a",
                                background:"#120808",display:"flex",justifyContent:"space-between",fontSize:12}}>
                                <div>
                                  <div style={{fontFamily:"monospace",color:"#ffaaaa"}}>{s.lrNo||s.lr}</div>
                                  <div style={{fontSize:10,color:"#883333"}}>{s.tonnes} TO · {s.ref}</div>
                                </div>
                                <span style={{color:"#b91c1c",fontWeight:700,fontFamily:"monospace"}}>
                                  ₹{fmtINR(s.deduction)}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                        {/* expenses / debit notes */}
                        {allExpenses.length>0&&(
                          <>
                            <div style={{padding:"6px 14px",fontSize:10,fontWeight:700,color:"#c67c00",
                              letterSpacing:1,background:"#130f00",borderTop:"1px solid #2a2000"}}>📋 DEBIT NOTES / EXPENSES</div>
                            {allExpenses.map((e,i)=>(
                              <div key={i} style={{padding:"8px 14px",borderTop:"1px solid #1a1500",
                                background:"#110e00",display:"flex",justifyContent:"space-between",
                                alignItems:"center",fontSize:12}}>
                                <div>
                                  <div style={{color:"#ffcc88"}}>{e.description||e.ref}</div>
                                  {e.ref&&<div style={{fontSize:10,color:"#665500"}}>{e.ref}</div>}
                                </div>
                                <span style={{color:"#c67c00",fontWeight:700,fontFamily:"monospace"}}>
                                  ₹{fmtINR(e.amount)}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
        )}

        {/* ══ SHORTAGES ══════════════════════════════════════════════ */}
        {activeTab==="shortages"&&(
          <div>
            <div style={{background:"#140808",border:"1px solid #2a1212",borderRadius:8,
              padding:"12px 14px",marginBottom:14,
              display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,textAlign:"center"}}>
              {[
                {l:"Count",    v:allShortages.length,                                                         c:"#b91c1c"},
                {l:"Deducted", v:`₹${fmtINR(totalShortage)}`,                                                c:"#b91c1c"},
                {l:"Tonnes",   v:`${allShortages.reduce((s,sh)=>s+Number(sh.tonnes||0),0).toFixed(2)} TO`,   c:"#ff9999"},
              ].map(m=>(
                <div key={m.l}>
                  <div style={{fontSize:9,color:"#883333",letterSpacing:1,marginBottom:3}}>{m.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:m.c}}>{m.v}</div>
                </div>
              ))}
            </div>

            <SearchBar value={searchShort} onChange={setSearchShort} placeholder="Search LR, ref, UTR…"/>
            <div style={{fontSize:11,color:"#4a7090",marginBottom:10}}>
              {filteredShortages.length} of {allShortages.length} deduction{allShortages.length!==1?"s":""}
              {searchShort&&` · "${searchShort}"`}
            </div>

            {filteredShortages.length===0
              ? <EmptyState icon="✅" text={searchShort?"No shortages match your search.":"No shortage deductions recorded."}/>
              : filteredShortages.map((s,i)=>{
                const lrKey=(s.lrNo||s.lr||"").trim();
                const linkedTrip = lrKey ? (trips||[]).find(t=>(t.lrNo||t.lr||"").trim()===lrKey) : null;
                const linkedVeh  = linkedTrip ? (vehicles||[]).find(v=>v.truckNo===linkedTrip.truckNo||v.truckNo===linkedTrip.truck) : null;
                return (
                <div key={i} style={{background:"#130808",border:`1px solid ${linkedTrip?"#2a1212":"#5a2200"}`,
                  borderRadius:8,padding:"11px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <span style={{fontFamily:"monospace",color:"#ffaaaa",fontSize:13,fontWeight:700}}>
                      {lrKey||"— No LR —"}
                    </span>
                    <span style={{color:"#b91c1c",fontWeight:800,fontFamily:"monospace",fontSize:14}}>
                      ₹{fmtINR(s.deduction)}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:8,fontSize:11,color:"#665555",flexWrap:"wrap",marginBottom:4}}>
                    <span>📦 {s.tonnes} TO</span>
                    {s.ref&&<span>Ref: {s.ref}</span>}
                    {s.utr&&<span>UTR: {s.utr}</span>}
                    {s.paymentDate&&<span>{fmtDate(s.paymentDate)}</span>}
                  </div>
                  {linkedTrip?(
                    <div style={{background:"#0a2000",borderRadius:6,padding:"5px 8px",fontSize:11,
                      display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:"#1b6e3a"}}>✓ Linked · {linkedTrip.truckNo||linkedTrip.truck} · {linkedTrip.to}</span>
                      {linkedVeh&&<span style={{color:"#6b82a0"}}>Balance: ₹{fmtINR((linkedVeh.shortageOwed||0)-(linkedVeh.shortageRecovered||0))}</span>}
                    </div>
                  ):(
                    <div style={{background:"#2a1000",borderRadius:6,padding:"5px 8px",fontSize:11,color:"#ff8800"}}>
                      ⚠ LR not found in trips — verify LR number
                    </div>
                  )}
                </div>
              );})
            }
          </div>
        )}

        {/* ══ PROFIT ════════════════════════════════════════════════ */}
        {/* ══ GST HOLD ══════════════════════════════════════════════ */}
        {activeTab==="gst"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* KPI row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {[
                {label:"Total Held",    val:fmtINR(gstTotalHeld),     col:"#c67c00"},
                {label:"Released",      val:fmtINR(gstTotalReleased),  col:"#1b6e3a"},
                {label:"Pending",       val:fmtINR(gstHoldPending),    col:"#b91c1c"},
              ].map(k=>(
                <div key={k.label} style={{background:C.card,border:"1px solid #21262d",
                  borderRadius:10,padding:"12px 10px",textAlign:"center"}}>
                  <div style={{color:k.col,fontWeight:800,fontSize:15}}>{k.val}</div>
                  <div style={{color:"#4a7090",fontSize:10,marginTop:3,textTransform:"uppercase",letterSpacing:0.5}}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Manual release entry */}
            {isOwner && (()=>{
              const [rInv,setRInv] = [window._gstRInv||"", v=>{ window._gstRInv=v; }];
              return null; // handled below via state
            })()}

            {/* Re-detect releases button — for advices scanned before this feature existed */}
            {isOwner && gstHoldPending > 0 && (() => {
              // Check if any held invoice appears in ANY advice with paymentAmt > 0 and hold=0
              const canAutoDetect = shreePayments.some(pa =>
                (pa.invoices||[]).some(inv => {
                  if(Number(inv.hold||0) > 0) return false;
                  const payAmt = Number(inv.paymentAmt||inv.totalAmt||0);
                  if(payAmt <= 0) return false;
                  return gstHoldItems.some(g => g.invoiceNo===inv.invoiceNo && g.balance>0);
                })
              );
              if(!canAutoDetect) return null;
              return (
                <div style={{background:C.card2,border:"1px solid #4caf5033",borderRadius:10,
                  padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{color:"#1b6e3a",fontWeight:700,fontSize:12}}>🔍 Release data found in scanned advices</div>
                    <div style={{color:"#4a7090",fontSize:11,marginTop:2}}>Tap to mark held invoices as released</div>
                  </div>
                  <button onClick={()=>{
                    // Build held map from all payment advices
                    const heldInvMap = {};
                    const seenKeys = new Set();
                    shreePayments.forEach(pa => {
                      (pa.invoices||[]).forEach(inv => {
                        const h = Number(inv.hold||0);
                        if(h <= 0) return;
                        const k = inv.invoiceNo+"|"+(inv.sapDoc||"");
                        if(seenKeys.has(k)) return;
                        seenKeys.add(k);
                        if(!heldInvMap[inv.invoiceNo]) heldInvMap[inv.invoiceNo] = 0;
                        heldInvMap[inv.invoiceNo] += h;
                      });
                    });
                    // Find releases from advices — invoice with no hold that was previously held
                    const newReleases = [];
                    shreePayments.forEach(pa => {
                      (pa.invoices||[]).forEach(inv => {
                        if(Number(inv.hold||0) > 0) return;
                        if(!heldInvMap[inv.invoiceNo]) return;
                        // Use the actual held amount from the GST hold ledger, not the payment amount
                        const holdEntry = gstHoldItems.find(g => g.invoiceNo === inv.invoiceNo);
                        const releaseAmt = holdEntry ? holdEntry.balance : heldInvMap[inv.invoiceNo];
                        if(releaseAmt <= 0) return;
                        const alreadyReleased = (gstReleases||[]).some(r=>r.invoiceRef===inv.invoiceNo&&r.utr===pa.utr);
                        if(alreadyReleased) return;
                        newReleases.push({
                          id:"GST"+Date.now()+Math.random().toString(36).slice(2,5),
                          invoiceRef: inv.invoiceNo,
                          amount: releaseAmt,
                          utr: pa.utr,
                          date: pa.paymentDate||pa.date||"",
                          notes:"Re-detected from advice scan",
                          createdAt: new Date().toISOString(),
                        });
                      });
                    });
                    if(newReleases.length > 0) {
                      setGstReleases(prev=>[...(prev||[]),...newReleases]);
                      log && log("GST RE-DETECT: "+newReleases.length+" releases found");
                      alert("✅ "+newReleases.length+" GST release(s) detected and marked!");
                    } else {
                      alert("No new releases found.");
                    }
                  }} style={{background:"#1b6e3a",border:"none",color:"#000",
                    borderRadius:8,padding:"7px 14px",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0}}>
                    Auto-Detect
                  </button>
                </div>
              );
            })()}

            {/* Release recording section */}
            <GstReleaseForm
              gstHoldItems={gstHoldItems}
              gstReleases={gstReleases}
              setGstReleases={setGstReleases}
              isOwner={isOwner}
              log={log}
            />

            {/* Hold ledger table */}
            {gstHoldItems.length===0 ? (
              <div style={{textAlign:"center",padding:"30px 0",color:"#4a7090"}}>
                <div style={{fontSize:28,marginBottom:8}}>🔒</div>
                <div>No GST hold recorded yet.</div>
                <div style={{fontSize:12,marginTop:4,color:"#444"}}>Hold amounts are captured automatically when you scan a payment advice.</div>
              </div>
            ) : (
              gstHoldItems.map(g=>(
                <div key={g.invoiceNo} style={{background:C.card,border:"1px solid "+
                  (g.status==="released"?"#86efac":g.status==="partial"?"#fde68a":"#fca5a5"),
                  borderRadius:12,padding:"12px 14px",borderLeft:"4px solid "+
                  (g.status==="released"?"#1b6e3a":g.status==="partial"?"#c67c00":"#b91c1c")}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:C.text}}>{g.invoiceNo}</div>
                      {g.invDate&&<div style={{color:"#4a7090",fontSize:11,marginTop:1}}>{fmtDate(parseDD(g.invDate))}</div>}
                      {g.sapDoc&&<div style={{color:"#4a7090",fontSize:11}}>SAP: {g.sapDoc}</div>}
                    </div>
                    <span style={{background:g.status==="released"?"#f0fdf4":g.status==="partial"?"#fffbeb":"#fef2f2",
                      color:g.status==="released"?"#1b6e3a":g.status==="partial"?"#c67c00":"#b91c1c",
                      border:"1px solid "+(g.status==="released"?"#86efac":g.status==="partial"?"#fde68a":"#fca5a5"),
                      borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700}}>
                      {g.status==="released"?"✅ Released":g.status==="partial"?"🔄 Partial":"🔴 Pending"}
                    </span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:10}}>
                    {[
                      {l:"Held",     v:fmtINR(g.holdAmount), c:"#c67c00"},
                      {l:"Released", v:fmtINR(g.released),   c:"#1b6e3a"},
                      {l:"Balance",  v:fmtINR(g.balance),    c:g.balance>0?"#b91c1c":"#1b6e3a"},
                    ].map(x=>(
                      <div key={x.l} style={{background:C.card2,borderRadius:8,padding:"8px",textAlign:"center"}}>
                        <div style={{color:x.c,fontWeight:700,fontSize:12}}>{x.v}</div>
                        <div style={{color:"#4a7090",fontSize:9,textTransform:"uppercase",letterSpacing:0.5}}>{x.l}</div>
                      </div>
                    ))}
                  </div>
                  {g.releaseUtr&&(
                    <div style={{marginTop:8,color:"#4a7090",fontSize:11}}>
                      Released via UTR: <b style={{color:"#1b6e3a"}}>{g.releaseUtr}</b>
                      {g.releaseDate&&" on "+fmtDate(g.releaseDate)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab==="profit"&&(
          <div>
            {shreeTrips.length>0&&(
              <div style={{background:"#f0fdf4",border:"1px solid #1a3a1a",borderRadius:8,
                padding:"12px 14px",marginBottom:14,
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:10,color:"#2a6a2a",letterSpacing:1,marginBottom:2}}>TOTAL PROFIT</div>
                  <div style={{fontSize:22,fontWeight:800,color:"#1b6e3a"}}>
                    ₹{fmtINR(shreeTrips.reduce((s,t)=>s+tripProfit(t),0))}
                  </div>
                </div>
                <div style={{textAlign:"right",fontSize:11,color:"#4a7090"}}>
                  <div>{shreeTrips.filter(t=>t.shreeStatus==="paid").length} paid trips</div>
                  <div>{shreeTrips.filter(t=>t.shreeShortage).length} with shortages</div>
                </div>
              </div>
            )}

            <div style={{background:C.bg,border:"1px solid #222",borderRadius:8,padding:12,marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>➕ Add Trip Expense</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <SearchSelect
                  value={newExp.tripId}
                  onChange={val=>setNewExp({...newExp,tripId:val})}
                  opts={[{v:"",l:"— Select trip —"},...shreeTrips.map(t=>({v:t.id,l:`${t.lr||t.lrNo||"—"} · ${t.truck||t.truckNo} · ${fmtDate(t.date)}`}))]}
                  placeholder={`Search trip… (${shreeTrips.length})`}
                />
                <input value={newExp.label} onChange={e=>setNewExp({...newExp,label:e.target.value})}
                  placeholder="Expense label (fuel, toll…)"
                  style={{background:"#0d0d0d",border:"1px solid #ccddf0",borderRadius:6,
                    padding:"8px 10px",color:"#ccc",fontSize:13}}/>
                <div style={{display:"flex",gap:8}}>
                  <input value={newExp.amount} onChange={e=>setNewExp({...newExp,amount:e.target.value})}
                    type="number" placeholder="₹ Amount"
                    style={{flex:1,background:"#0d0d0d",border:"1px solid #ccddf0",borderRadius:6,
                      padding:"8px 10px",color:"#ccc",fontSize:13}}/>
                  <button onClick={()=>{
                    if(!newExp.tripId||!newExp.label||!newExp.amount) return;
                    setExpenses(prev=>({...prev,[newExp.tripId]:[...(prev[newExp.tripId]||[]),
                      {label:newExp.label,amount:Number(newExp.amount)}]}));
                    setNewExp({tripId:"",label:"",amount:""});
                  }} style={{background:"#1565c0",color:"#000",border:"none",borderRadius:6,
                    padding:"8px 16px",fontWeight:700,cursor:"pointer",fontSize:13}}>Add</button>
                </div>
              </div>
            </div>

            <SearchBar value={searchTrip} onChange={setSearchTrip} placeholder="Search LR, truck…"/>
            <div style={{fontSize:11,color:"#4a7090",marginBottom:10}}>
              {filteredTrips.length} of {shreeTrips.length} trip{shreeTrips.length!==1?"s":""}
            </div>

            {filteredTrips.length===0
              ? <EmptyState icon="📊" text={searchTrip?"No trips match your search.":"No Shree trips yet."}/>
              : filteredTrips.map(t=>{
                const profit=tripProfit(t);
                return (
                  <div key={t.id} style={{background:C.bg,border:"1px solid #222",
                    borderRadius:8,padding:"11px 14px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div>
                        <span style={{fontFamily:"monospace",fontSize:12,color:"#ccc"}}>{t.lr||t.lrNo}</span>
                        <span style={{fontSize:11,color:"#4a7090",marginLeft:8}}>{t.truck||t.truckNo}</span>
                      </div>
                      <span style={{fontWeight:800,fontSize:15,color:profit>=0?"#1b6e3a":"#b91c1c"}}>
                        ₹{fmtINR(profit)}
                      </span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4,fontSize:11}}>
                      <div><span style={{color:"#4a7090",display:"block"}}>Billed</span>
                        <span style={{color:"#ccc",fontFamily:"monospace"}}>₹{fmtINR(t.billedToShree)}</span></div>
                      <div><span style={{color:"#4a7090",display:"block"}}>Shortage</span>
                        <span style={{color:t.shreeShortage?"#b91c1c":"#444",fontFamily:"monospace"}}>
                          {t.shreeShortage?`₹${fmtINR(t.shreeShortage.deduction)}`:"—"}</span></div>
                      <div><span style={{color:"#4a7090",display:"block"}}>Expenses</span>
                        <span style={{color:"#ccc",fontFamily:"monospace"}}>₹{fmtINR(tripExps(t.id))}</span></div>
                    </div>
                    {(Array.isArray(expenses)?expenses:[]).filter(e=>e.tripId===t.id).length>0&&(
                      <div style={{marginTop:6,fontSize:10,color:"#444"}}>
                        {(Array.isArray(expenses)?expenses:[]).filter(e=>e.tripId===t.id).map(e=>`${e.label}: ₹${fmtINR(e.amount)}`).join(" · ")}
                      </div>
                    )}
                  </div>
                );
              })
            }
          </div>
        )}

      </div>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        input::placeholder{color:#3a3a3a}
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
// ShortageRecoverBtn — needs its own state so extracted as component
function ShortageRecoverBtn({v, setVehicles, log}) {
  const [show, setShow] = useState(false);
  const [amt,  setAmt]  = useState("");
  return show ? (
    <div style={{display:"flex",gap:8,flex:1}}>
      <div style={{flex:1}}><Field value={amt} onChange={setAmt} type="number" placeholder="Amount recovered ₹" /></div>
      <Btn onClick={()=>{
        setVehicles(p=>p.map(x=>x.truckNo===v.truckNo?{...x,shortageOwed:Math.max(0,(x.shortageOwed||0)-(+amt)),shortageRecovered:(x.shortageRecovered||0)+(+amt)}:x));
        log("SHORTAGE RECOVERED",`${v.truckNo} — ${fmt(+amt)}`);
        setShow(false); setAmt("");
      }} sm color={C.green}>✓</Btn>
      <Btn onClick={()=>setShow(false)} sm outline color={C.muted}>×</Btn>
    </div>
  ) : (
    <Btn onClick={()=>setShow(true)} sm outline color={C.red}>Record Recovery</Btn>
  );
}

// ─── DRIVER PAYMENTS ──────────────────────────────────────────────────────────
// Driver payment is separate from settlement.
// Record bank transfers against a trip. "Balance due" auto-updates.
function DriverPayments({trips, setTrips, driverPays, setDriverPays, vehicles, employees, cashTransfers, setCashTransfers, user, log}) {
  const [filter,    setFilter]    = useState("unpaid");
  const [paySheet,  setPaySheet]  = useState(null);
  const [splitSheet, setSplitSheet] = useState(null); // scanned multi-LR data
  const [scanningGlobal, setScanningGlobal] = useState(false);
  const [pf, setPf] = useState({amount:"", utr:"", date:today(), paidTo:"", notes:""});
  const pff = k => v => setPf(p=>({...p,[k]:v}));
  const scanInputRef = useRef();

  // History filters
  const [histFrom,  setHistFrom]  = useState("");
  const [histTo,    setHistTo]    = useState("");
  const [histLR,    setHistLR]    = useState("");

  // For each trip compute total paid and balance
  const tripWithBalance = trips.map(t => {
    const veh      = vehicles.find(v=>v.truckNo===t.truckNo);
    const gross    = (t.qty||0)*(t.givenRate||0);
    const deducts  = (t.advance||0)+(t.tafal||0)+(veh?.deductPerTrip||0)+(t.dieselEstimate||0)+((t.shortage||0)*(t.givenRate||0));
    const netDue   = Math.max(0, gross - deducts);
    const paidSoFar= (driverPays||[]).filter(p=>p.tripId===t.id).reduce((s,p)=>s+(p.amount||0),0);
    const balance  = Math.max(0, netDue - paidSoFar);
    return {...t, gross, netDue, paidSoFar, balance, veh};
  });

  const unpaidTrips  = tripWithBalance.filter(t=>t.balance>0);
  const paidTrips    = tripWithBalance.filter(t=>t.balance<=0 && t.netDue>0);
  const totalBalance = unpaidTrips.reduce((s,t)=>s+t.balance,0);

  // Auto-settle: called after any payment save — marks trip settled if balance reaches 0
  const autoSettle = (tripId, extraAmount) => {
    const tw = tripWithBalance.find(t=>t.id===tripId);
    if(!tw) return;
    const newBalance = Math.max(0, tw.balance - extraAmount);
    if(newBalance === 0 && !tw.driverSettled) {
      setTrips(prev => prev.map(t => t.id===tripId
        ? {...t, driverSettled:true, settledBy:user.username, netPaid:tw.netDue}
        : t));
      log("AUTO SETTLED", `LR:${tw.lrNo} ${tw.truckNo} — balance reached ₹0`);
    }
  };

  const savePayment = (t) => {
    const p = {id:uid(), tripId:t.id, truckNo:t.truckNo, lrNo:t.lrNo,
      amount:+pf.amount, utr:pf.utr, date:pf.date, paidTo:pf.paidTo, notes:pf.notes,
      createdBy:user.username, createdAt:nowTs()};
    setDriverPays(prev=>[...(prev||[]),p]);
    log("DRIVER PAYMENT",`LR:${t.lrNo} ${t.truckNo} — ${fmt(+pf.amount)} UTR:${pf.utr}`);
    autoSettle(t.id, +pf.amount);
    setPaySheet(null); setPf({amount:"",utr:"",date:today(),paidTo:"",notes:""});
  };

  const saveMultiPayment = async (payments) => {
    const withMeta = payments.map(p => ({...p, createdBy:user.username, createdAt:nowTs()}));
    setDriverPays(prev=>[...(prev||[]),...withMeta]);
    for (const p of withMeta) {
      log("DRIVER PAYMENT",`LR:${p.lrNo} ${p.truckNo} — ${fmt(p.amount)} UTR:${p.utr}`);
      await DB.saveDriverPay(p);
      autoSettle(p.tripId, p.amount);
    }
    setSplitSheet(null);
  };

  const deleteDriverPay = async (id) => {
    setDriverPays(prev=>(prev||[]).filter(p=>p.id!==id));
    await DB.deleteDriverPay(id);
  };

  const scanGlobal = async (file) => {
    if (!file) return;
    setScanningGlobal(true);
    try {
      const b64 = await new Promise((res,rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const resp = await fetch("/.netlify/functions/scan-payment", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({base64:b64, mediaType:file.type||"image/jpeg"})
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      // Always open split sheet — handles both single and multi-LR
      setSplitSheet(data);
    } catch(e) {
      alert("Could not read payment image. Please fill manually.");
    } finally {
      setScanningGlobal(false);
      if (scanInputRef.current) scanInputRef.current.value = "";
    }
  };

  // Filtered payment history
  const allPays = [...(driverPays||[])].sort((a,b)=>b.date.localeCompare(a.date));
  const filteredPays = allPays.filter(p => {
    if (histFrom && p.date < histFrom) return false;
    if (histTo   && p.date > histTo)   return false;
    if (histLR   && !(p.lrNo||"").toLowerCase().includes(histLR.toLowerCase()) &&
                    !(p.truckNo||"").toLowerCase().includes(histLR.toLowerCase())) return false;
    return true;
  });
  const histTotal = filteredPays.reduce((s,p)=>s+(p.amount||0),0);

  const shareViaWhatsApp = (phone, text) => {
    const clean = (phone||"").replace(/\D/g,"");
    if(clean.length!==10){alert("Enter a valid 10-digit phone number.");return;}
    window.open(`https://wa.me/91${clean}?text=${encodeURIComponent(text)}`,"_blank");
  };

  const exportHistoryPDF = () => {
    const rows = filteredPays.map(p => {
      const t = trips.find(x=>x.id===p.tripId);
      return `<tr><td>${p.date}</td><td>${p.truckNo}</td><td>${p.lrNo||"—"}</td><td>${t?`${t.from||""}→${t.to||""}`:""}</td><td>${p.utr||"—"}</td><td>${p.notes||""}</td><td style="text-align:right;font-weight:bold">${fmt(p.amount)}</td></tr>`;
    }).join("");
    const html = `<html><head><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:20px}
      h2{color:#f97316;margin-bottom:4px}
      .sub{color:#888;font-size:12px;margin-bottom:12px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th{background:#f97316;color:#fff;padding:7px 8px;text-align:left;font-size:11px}
      td{padding:6px 8px;border-bottom:1px solid #eee;font-size:11px}
      .total{text-align:right;font-weight:bold;font-size:14px;margin-top:12px;color:#f97316}
    </style></head><body>
      <h2>M. Yantra — Driver Payment History</h2>
      <div class="sub">Period: ${histFrom||"all"} → ${histTo||"all"}${histLR?` | Search: ${histLR}`:""}</div>
      <div class="sub">${filteredPays.length} payments recorded</div>
      <table><thead><tr><th>Date</th><th>Truck</th><th>LR</th><th>Route</th><th>UTR</th><th>Notes</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="total">Total Paid: ${fmt(histTotal)}</div>
    </body></html>`;
    const w = window.open("","_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),400);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:C.blue,fontWeight:800,fontSize:16}}>🏧 Driver Payments</div>
        {/* Global scan button */}
        <FileSourcePicker onFile={scanGlobal} accept="image/*,application/pdf"
          label={scanningGlobal?"Reading…":"Scan Payment"}
          color={C.purple||"#7c3aed"} icon="📷" compact={true} />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <KPI icon="⏳" label="Balance Due"  value={fmt(totalBalance)}    color={C.accent} sub={`${unpaidTrips.length} trips`} />
        <KPI icon="✅" label="Total Paid"   value={fmt((driverPays||[]).reduce((s,p)=>s+(p.amount||0),0))} color={C.green} />
      </div>

      <PillBar items={[
        {id:"unpaid",  label:`Unpaid (${unpaidTrips.length})`, color:C.accent},
        {id:"paid",    label:`Paid (${paidTrips.length})`,     color:C.green},
        {id:"all",     label:"All",                            color:C.blue},
        {id:"history", label:`History (${allPays.length})`,    color:C.muted},
      ]} active={filter} onSelect={setFilter} />

      {/* Search bar for trip tabs */}
      {filter!=="history" && (
        <input value={histLR} onChange={e=>setHistLR(e.target.value)}
          placeholder="🔍 Search LR or truck number…"
          style={{background:C.card,border:`1.5px solid ${histLR?C.accent:C.border}`,borderRadius:10,
            color:C.text,padding:"10px 14px",fontSize:13,outline:"none",
            width:"100%",boxSizing:"border-box"}} />
      )}

      {/* ── PAYMENT HISTORY TAB ── */}
      {filter==="history" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {/* Filters */}
          <div style={{background:C.card,borderRadius:12,padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
            <input value={histLR} onChange={e=>setHistLR(e.target.value)}
              placeholder="🔍 Search by LR or truck number…"
              style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,color:C.text,
                padding:"9px 12px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"}} />
            <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
              <div style={{flex:1}}>
                <div style={{color:C.muted,fontSize:11,marginBottom:3}}>FROM</div>
                <input type="date" value={histFrom} onChange={e=>setHistFrom(e.target.value)}
                  onClick={e=>e.target.showPicker?.()}
                  style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,
                    color:histFrom?C.text:C.muted,padding:"8px 10px",fontSize:13,width:"100%",
                    colorScheme:"light",WebkitAppearance:"none",boxSizing:"border-box"}} />
              </div>
              <div style={{flex:1}}>
                <div style={{color:C.muted,fontSize:11,marginBottom:3}}>TO</div>
                <input type="date" value={histTo} onChange={e=>setHistTo(e.target.value)}
                  onClick={e=>e.target.showPicker?.()}
                  style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,
                    color:histTo?C.text:C.muted,padding:"8px 10px",fontSize:13,width:"100%",
                    colorScheme:"light",WebkitAppearance:"none",boxSizing:"border-box"}} />
              </div>
              {(histFrom||histTo||histLR) && (
                <Btn onClick={()=>{setHistFrom("");setHistTo("");setHistLR("");}} sm outline color={C.muted}>Clear</Btn>
              )}
            </div>
            {/* Summary + export */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <span style={{color:C.muted,fontSize:12}}>{filteredPays.length} payments · </span>
                <span style={{color:C.green,fontWeight:800,fontSize:14}}>{fmt(histTotal)}</span>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={exportHistoryPDF}
                  style={{background:C.orange,border:"none",borderRadius:8,color:"#000",
                    fontSize:12,fontWeight:700,padding:"7px 14px",cursor:"pointer"}}>
                  🖨 Export PDF
                </button>
                <button onClick={()=>{
                  const summary = filteredPays.slice(0,10).map(p=>`LR:${p.lrNo||"—"} ${p.truckNo} ₹${fmt(p.amount)} ${p.date}`).join("\n");
                  const text = `M.Yantra Driver Payments\nTotal: ${fmt(histTotal)} (${filteredPays.length} payments)\n${histFrom||"all"} → ${histTo||"all"}\n\n${summary}`;
                  const num = window.prompt("Driver/owner phone (10 digits):");
                  if(num) window.open("https://wa.me/91"+num.replace(/[^0-9]/g,"")+"?text="+encodeURIComponent(text),"_blank");
                }} style={{background:"#25D36622",border:"1px solid #25D36688",borderRadius:8,
                  color:"#25D366",fontSize:12,fontWeight:700,padding:"7px 12px",cursor:"pointer"}}>
                  📲 Share
                </button>
              </div>
            </div>
          </div>

          {filteredPays.length===0 && (
            <div style={{textAlign:"center",color:C.muted,padding:40}}>No payments found</div>
          )}

          {filteredPays.map(p => {
            const t = trips.find(x=>x.id===p.tripId);
            return (
              <div key={p.id} style={{background:C.card,borderRadius:12,padding:"12px 14px",
                borderLeft:"3px solid "+C.green}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontWeight:800,fontSize:14}}>{fmt(p.amount)}</span>
                      <span style={{color:C.blue,fontSize:12}}>LR {p.lrNo||"—"}</span>
                      <span style={{color:C.muted,fontSize:12}}>{p.truckNo}</span>
                    </div>
                    <div style={{color:C.muted,fontSize:11,marginTop:3}}>
                      {p.date}
                      {p.utr && <span> · UTR: <b style={{color:C.text}}>{p.utr}</b></span>}
                      {p.paidTo && <span> · To: <b style={{color:C.text}}>{p.paidTo}</b></span>}
                      {p.notes && <span> · {p.notes}</span>}
                    </div>
                    {t && (
                      <div style={{color:C.muted,fontSize:11,marginTop:1}}>
                        {t.from||""}→{t.to||""} · {t.qty}MT
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0,marginLeft:8}}>
                    <div style={{color:C.muted,fontSize:11}}>{p.createdBy||""}</div>
                    {user.role==="owner" && (
                      <button onClick={()=>{if(window.confirm(`Delete payment of ${fmt(p.amount)} for LR ${p.lrNo}?\nThis will restore the balance.`)) deleteDriverPay(p.id);}}
                        style={{background:"none",border:`1px solid ${C.red}55`,borderRadius:5,
                          color:C.red,fontSize:10,padding:"2px 7px",cursor:"pointer"}}>
                        🗑 Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TRIP LIST (unpaid / paid / all) ── */}
      {filter!=="history" && (()=>{
        const base = filter==="unpaid"?unpaidTrips:filter==="paid"?paidTrips:tripWithBalance;
        const shown = histLR ? base.filter(t=>(t.lrNo+t.truckNo).toLowerCase().includes(histLR.toLowerCase())) : base;
        return shown.map(t=>(
        <div key={t.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",borderLeft:`4px solid ${t.balance>0?C.accent:C.green}`,marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <div>
              <div style={{fontWeight:800,fontSize:14}}>{t.truckNo}</div>
              <div style={{color:C.blue,fontSize:12}}>LR: {t.lrNo||"—"}</div>
              <div style={{color:C.muted,fontSize:11}}>{t.from}→{t.to} · {t.qty}MT · {t.date}</div>
            </div>
            <div style={{textAlign:"right"}}>
              {t.balance>0
                ? <><div style={{color:C.accent,fontWeight:900,fontSize:16}}>{fmt(t.balance)}</div><div style={{color:C.muted,fontSize:11}}>balance due</div></>
                : <Badge label="Fully Paid ✓" color={C.green} />}
            </div>
          </div>
          {/* Payment breakdown */}
          <div style={{background:C.bg,borderRadius:8,padding:"8px 10px",marginBottom:10}}>
            {[
              {l:"Gross (Qty×Rate)",   v:t.gross,      c:C.orange},
              {l:"(−) Advance",        v:t.advance||0, c:C.red},
              {l:"(−) TAFAL",          v:t.tafal||0,   c:C.purple},
              {l:"(−) Loan/Trip",      v:t.veh?.deductPerTrip||0, c:C.red},
              {l:"(−) Diesel est.",    v:t.dieselEstimate||0, c:C.orange},
              {l:"Net Due",            v:t.netDue,     c:C.blue},
              {l:"Paid so far",        v:t.paidSoFar,  c:C.green},
            ].map(r=>(
              <div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0"}}>
                <span style={{color:C.muted,fontSize:11}}>{r.l}</span>
                <span style={{color:r.v>0?r.c:C.dim,fontWeight:r.v>0?700:400,fontSize:11}}>{r.v>0?fmt(r.v):"—"}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0 0",borderTop:`1px solid ${C.border}33`}}>
              <span style={{fontWeight:800,fontSize:13}}>Balance</span>
              <span style={{color:t.balance>0?C.accent:C.green,fontWeight:900,fontSize:14}}>{fmt(t.balance)}</span>
            </div>
          </div>
          {/* Previous payments */}
          {(driverPays||[]).filter(p=>p.tripId===t.id).map(p=>(
            <div key={p.id} style={{background:C.green+"11",borderRadius:6,padding:"6px 10px",marginBottom:4,
              display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}>
              <span style={{color:C.muted}}>{p.date} · UTR: {p.utr}</span>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:C.green,fontWeight:700}}>{fmt(p.amount)}</span>
                {user.role==="owner" && (
                  <button onClick={()=>{if(window.confirm(`Delete payment of ${fmt(p.amount)}?\nBalance will be restored.`)) deleteDriverPay(p.id);}}
                    style={{background:"none",border:`1px solid ${C.red}44`,borderRadius:4,
                      color:C.red,fontSize:10,padding:"1px 6px",cursor:"pointer"}}>
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
          {t.balance>0&&<Btn onClick={()=>{setPaySheet(t);setPf({amount:String(t.balance),utr:"",date:today(),paidTo:"",notes:""});}} full sm color={C.green}>+ Record Payment</Btn>}
        </div>
      ));
      })()}

      {paySheet && (
        <Sheet title={`Pay Driver — ${paySheet.truckNo}`} onClose={()=>setPaySheet(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",fontSize:13}}>
              <div><b>{paySheet.truckNo}</b> · LR: {paySheet.lrNo||"—"}</div>
              <div style={{color:C.muted}}>{paySheet.from}→{paySheet.to} · {paySheet.qty}MT</div>
              <div style={{color:C.accent,fontWeight:800,fontSize:16,marginTop:4}}>Balance: {fmt(paySheet.balance)}</div>
            </div>
            <ScanPaymentBtn onResult={r=>{
              if(r.amount) setPf(p=>({...p,amount:String(r.amount).replace(/[^0-9.]/g,"")}));
              if(r.referenceNo) setPf(p=>({...p,utr:r.referenceNo}));
              if(r.paidTo) setPf(p=>({...p,paidTo:r.paidTo}));
              if(r.date) setPf(p=>({...p,date:r.date}));
            }} />
            <Field label="Amount ₹" value={pf.amount} onChange={pff("amount")} type="number" />
            <div style={{display:"flex",gap:10}}>
              <Field label="UTR / Reference" value={pf.utr} onChange={pff("utr")} half />
              <Field label="Date" value={pf.date} onChange={pff("date")} type="date" half />
            </div>
            <Field label="Paid To" value={pf.paidTo} onChange={pff("paidTo")} placeholder="Recipient name…" />
            <Field label="Notes" value={pf.notes} onChange={pff("notes")} placeholder="Bank name, NEFT/RTGS…" />
            <div style={{color:C.muted,fontSize:12}}>Recording as: <b style={{color:ROLES[user.role]?.color}}>{user.name}</b></div>
            <Btn onClick={()=>savePayment(paySheet)} full color={C.green}>✓ Confirm Payment — {fmt(+pf.amount)}</Btn>
          </div>
        </Sheet>
      )}

      {/* ── SPLIT PAYMENT SHEET (multi-LR scan) ── */}
      {splitSheet && (
        <SplitPaymentSheet
          scanData={splitSheet}
          trips={trips}
          tripWithBalance={tripWithBalance}
          employees={employees||[]}
          setCashTransfers={setCashTransfers}
          user={user}
          log={log}
          onSave={saveMultiPayment}
          onCancel={()=>setSplitSheet(null)}
        />
      )}
    </div>
  );
}

// ─── EXPENSES LEDGER ──────────────────────────────────────────────────────────
function ExpensesLedger({expenses, setExpenses, payments, user, log}) {
  const [sheet, setSheet] = useState(false);
  const [f, setF] = useState({date:today(),label:"",amount:"",category:"Office",notes:"",utr:""});
  const ff = k => v => setF(p=>({...p,[k]:v}));

  const cats = ["Office","Shortage","Other Deduction","Diesel","Repairs","Salary","Government Fee","Other"];

  // Merge manual expenses (flat DB array) + Shree payment advice expenses
  const shreeExps = (payments||[]).flatMap(pa =>
    (pa.expenses||[]).map(e=>({
      id: "shree-"+pa.utr+"-"+(e.ref||e.description||"").slice(0,8),
      date: pa.paymentDate||pa.date||"",
      label: e.description||e.ref||"Shree Expense",
      amount: Math.abs(Number(e.amount||0)),
      category: e.category||"other",
      notes: "UTR:"+pa.utr,
      createdBy: "shree_scan",
      source: "shree",
    }))
  );
  const manualExps = Array.isArray(expenses) ? expenses : [];
  const allExps = [...manualExps, ...shreeExps].sort((a,b)=>(b.date||"").localeCompare(a.date||""));

  const totalExp = allExps.reduce((s,e)=>s+(e.amount||0),0);

  // Group by category
  const byCat = {};
  allExps.forEach(e=>{
    const cat = e.category||"other";
    if(!byCat[cat]) byCat[cat]=0;
    byCat[cat]+=e.amount||0;
  });

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:C.red,fontWeight:800,fontSize:16}}>🧮 Expenses Ledger</div>
        <Btn onClick={()=>setSheet(true)} sm outline color={C.red}>+ Add</Btn>
      </div>
      <KPI icon="💸" label="Total Expenses" value={fmt(totalExp)} color={C.red} />

      {/* Category summary */}
      <div style={{background:C.card,borderRadius:12,padding:"14px 16px"}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>By Category</div>
        {Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>(
          <div key={cat} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}22`}}>
            <span style={{color:C.text,fontSize:13}}>{cat}</span>
            <span style={{color:C.red,fontWeight:700}}>{fmt(amt)}</span>
          </div>
        ))}
        {Object.keys(byCat).length===0&&<div style={{color:C.muted,fontSize:13}}>No expenses yet</div>}
      </div>

      {/* All entries */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {allExps.map(e=>(
          <div key={e.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",borderLeft:`4px solid ${C.red}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontWeight:700,fontSize:13}}>{e.label}</div>
              <div style={{color:C.muted,fontSize:11}}>{e.date} · {e.category}</div>
              {e.utr&&<div style={{color:C.muted,fontSize:11}}>UTR: {e.utr}</div>}
              {e.notes&&<div style={{color:C.muted,fontSize:11}}>{e.notes}</div>}
              {e.createdBy&&<div style={{color:ROLES[e.createdBy]?.color||C.muted,fontSize:11}}>by {e.createdBy}</div>}
            </div>
            <div style={{color:C.red,fontWeight:800,fontSize:15}}>{fmt(e.amount)}</div>
          </div>
        ))}
        {allExps.length===0&&<div style={{textAlign:"center",color:C.muted,padding:32}}>No expenses recorded yet</div>}
      </div>

      {sheet&&(
        <Sheet title="Add Expense" onClose={()=>setSheet(false)}>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <div style={{display:"flex",gap:10}}>
              <Field label="Date" value={f.date} onChange={ff("date")} type="date" half />
              <Field label="Amount ₹" value={f.amount} onChange={ff("amount")} type="number" half />
            </div>
            <Field label="Description" value={f.label} onChange={ff("label")} placeholder="e.g. Office electricity bill" />
            <Field label="Category" value={f.category} onChange={ff("category")} opts={cats.map(c=>({v:c,l:c}))} />
            <Field label="Notes" value={f.notes} onChange={ff("notes")} placeholder="Optional" />
            <Field label="UTR / Ref No" value={f.utr} onChange={ff("utr")} placeholder="Optional — e.g. 1527531918" />
            <div style={{color:C.muted,fontSize:12}}>Recording as: <b style={{color:ROLES[user.role]?.color}}>{user.name}</b></div>
            <Btn onClick={()=>{
              if(f.utr.trim()) {
                const dupUTR = (Array.isArray(expenses)?expenses:[]).some(e => e.utr && e.utr.trim().toLowerCase() === f.utr.trim().toLowerCase());
                if(dupUTR) { alert("⚠️ An expense with UTR \""+f.utr.trim()+"\" already exists. Duplicate not saved.\n\nUTR \""+f.utr.trim()+"\" ಹೊಂದಿರುವ ವೆಚ್ಚ ಈಗಾಗಲೇ ಇದೆ. ನಕಲು ಸೇರಿಸಲಾಗಿಲ್ಲ."); return; }
              }
              const e={...f,id:uid(),amount:+f.amount,utr:f.utr.trim(),createdBy:user.username,createdAt:nowTs()};
              setExpenses(prev=>[e,...(prev||[])]);
              log("EXPENSE",`${e.label} — ${fmt(e.amount)}${e.utr?" · UTR:"+e.utr:""}`);
              setF({date:today(),label:"",amount:"",category:"Office",notes:"",utr:""});
              setSheet(false);
            }} full color={C.red}>Save Expense</Btn>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ─── REPORTS ──────────────────────────────────────────────────────────────────
function Reports({trips, vehicles, employees, payments, settlements, indents}) {
  // ── Date range ───────────────────────────────────────────────────────────────
  const [df, setDf] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [dt, setDt]   = useState(today());
  const [monthSel, setMonthSel] = useState(""); // "YYYY-MM" quick picker

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [stateFilter,  setStateFilter]  = useState("All"); // All|Karnataka|Telangana|Other
  const [orderFilter,  setOrderFilter]  = useState("All"); // All|godown|party
  const [reportTab,    setReportTab]    = useState("dispatch"); // dispatch|csv

  // Quick month picker
  const applyMonth = m => {
    if(!m) return;
    const [y,mo] = m.split("-");
    const last = new Date(+y, +mo, 0).getDate();
    setDf(m+"-01"); setDt(m+"-"+String(last).padStart(2,"0")); setMonthSel(m);
  };

  // ── All outbound trips in date range ────────────────────────────────────────
  const base = trips.filter(t =>
    t.type==="outbound" && t.date>=df && t.date<=dt
  );

  // Apply order type filter
  const afterOrder = orderFilter==="All" ? base
    : orderFilter==="party"  ? base.filter(t=>t.orderType==="party")
    : base.filter(t=>!t.orderType||t.orderType==="godown");

  // Clinker trips (separate)
  const clinkerTrips = afterOrder.filter(t=>(t.grade||"").toLowerCase().includes("clinker"));

  // Cement trips (non-clinker outbound)
  const cementBase = afterOrder.filter(t=>!(t.grade||"").toLowerCase().includes("clinker"));

  // Helper: get state from trip (party trips have state field; godown trips derive from 'to')
  const getState = t => {
    if(t.state&&t.state.trim()) return t.state.trim();
    // Fallback: try to guess from destination
    const to = (t.to||"").toLowerCase();
    if(to.includes("maharashtra")||to.includes("pune")||to.includes("patas")||to.includes("nashik")) return "Maharashtra";
    if(to.includes("telangana")||to.includes("hyderabad")||to.includes("rangareddy")||to.includes("warangal")) return "Telangana";
    if(to.includes("karnataka")||to.includes("raichur")||to.includes("gulbarga")||to.includes("kalaburagi")||to.includes("kodla")) return "Karnataka";
    return "Other";
  };

  // Apply state filter to cement trips
  const cementFiltered = stateFilter==="All" ? cementBase
    : stateFilter==="Other" ? cementBase.filter(t=>!["Karnataka","Telangana","Maharashtra"].includes(getState(t)))
    : cementBase.filter(t=>getState(t)===stateFilter);

  // ── State breakdown for cement ───────────────────────────────────────────────
  const STATES = ["Karnataka","Telangana","Maharashtra","Other"];
  const stateBreakdown = STATES.map(st=>{
    const rows = cementBase.filter(t=>
      st==="Other" ? !["Karnataka","Telangana","Maharashtra"].includes(getState(t)) : getState(t)===st
    );
    return {state:st, trips:rows.length, qty:rows.reduce((s,t)=>s+(+t.qty||0),0), rows};
  }).filter(s=>s.trips>0);

  // ── CSV / Print helpers ───────────────────────────────────────────────────────
  const exportCSV=(rows,name)=>{if(!rows.length)return;const k=Object.keys(rows[0]);const csv=[k.join(","),...rows.map(r=>k.map(x=>'"'+String(r[x]??"").replace(/"/g,'""')+'"').join(","))].join("\n");const b=new Blob([csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);};
  const printR=(html,title)=>{const w=window.open("","_blank");w.document.write("<!DOCTYPE html><html><head><title>"+title+"</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:11px}table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid #ccc;padding:4px 7px;text-align:left}th{background:#f0f0f0;font-size:10px;text-transform:uppercase}.section{margin-top:16px;font-weight:bold;font-size:13px;border-bottom:2px solid #333;padding-bottom:3px;margin-bottom:6px}.summary{display:flex;gap:20px;margin:6px 0 10px;font-size:12px}.sv{font-weight:bold}</style></head><body onload='window.print()'>"+html+"</body></html>");w.document.close();};

  const fmtN = n => Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});

  const dispatchTableHTML = (rows, title) => {
    if(!rows.length) return "";
    const trs = rows.map(t=>
      "<tr><td>"+t.date+"</td><td>"+(t.lrNo||"—")+"</td><td>"+(t.diNo||"—")+"</td><td>"+t.truckNo+"</td><td>"+(t.to||"—")+"</td><td>"+getState(t)+"</td><td>"+t.qty+"</td><td>"+(t.grade||"—")+"</td><td>"+(t.orderType==="party"?"🤝 Party":"🏭 Godown")+"</td><td>"+(t.status||"—")+"</td></tr>"
    ).join("");
    return "<div class='section'>"+title+" ("+rows.length+" trips · "+fmtN(rows.reduce((s,t)=>s+(+t.qty||0),0))+" MT)</div>"
      +"<table><thead><tr><th>Date</th><th>LR</th><th>DI</th><th>Truck</th><th>To</th><th>State</th><th>MT</th><th>Grade</th><th>Order</th><th>Status</th></tr></thead><tbody>"+trs+"</tbody></table>";
  };

  // ── Months for quick pick ────────────────────────────────────────────────────
  const months = [];
  const now = new Date();
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    months.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"));
  }

  const StatCard = ({state, qty, trips, color, onClick, active}) => (
    <button onClick={onClick} style={{
      background: active ? color+"33" : C.card,
      border: "2px solid "+(active?color:C.border),
      borderRadius:12, padding:"12px 10px", cursor:"pointer",
      textAlign:"center", flex:"1 1 0"}}>
      <div style={{color:active?color:C.text, fontWeight:800, fontSize:16}}>{fmtN(qty)}</div>
      <div style={{color:C.muted, fontSize:9, textTransform:"uppercase", letterSpacing:1}}>{state} MT</div>
      <div style={{color:active?color:C.muted, fontSize:10, marginTop:2}}>{trips} trips</div>
    </button>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{color:C.blue,fontWeight:800,fontSize:16}}>📊 Dispatch Report</div>

      {/* Date range */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
        <div style={{flex:1,minWidth:120}}>
          <div style={{color:C.muted,fontSize:10,marginBottom:3,fontWeight:700}}>FROM</div>
          <input type="date" value={df} onChange={e=>{setDf(e.target.value);setMonthSel("");}}
            onClick={e=>e.target.showPicker?.()}
            style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,color:C.text,
              padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"light",boxSizing:"border-box"}} />
        </div>
        <div style={{flex:1,minWidth:120}}>
          <div style={{color:C.muted,fontSize:10,marginBottom:3,fontWeight:700}}>TO</div>
          <input type="date" value={dt} onChange={e=>{setDt(e.target.value);setMonthSel("");}}
            onClick={e=>e.target.showPicker?.()}
            style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,color:C.text,
              padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"light",boxSizing:"border-box"}} />
        </div>
      </div>

      {/* Monthly quick picks */}
      <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:4}}>
        <div style={{display:"flex",gap:6,width:"max-content"}}>
          {months.map(m=>{
            const [y,mo]=m.split("-");
            const label=new Date(+y,+mo-1,1).toLocaleString("en-IN",{month:"short",year:"2-digit"});
            return (
              <button key={m} onClick={()=>applyMonth(m)} style={{
                background:monthSel===m?C.blue+"33":C.card,
                border:"1.5px solid "+(monthSel===m?C.blue:C.border),
                color:monthSel===m?C.blue:C.muted,
                borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:700,
                cursor:"pointer",whiteSpace:"nowrap"}}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters row */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {/* Order type filter */}
        <div style={{display:"flex",gap:6,background:C.card,borderRadius:10,padding:"4px"}}>
          {["All","godown","party"].map(o=>(
            <button key={o} onClick={()=>setOrderFilter(o)} style={{
              background:orderFilter===o?C.accent+"33":"transparent",
              border:"none",borderRadius:8,padding:"5px 10px",
              color:orderFilter===o?C.accent:C.muted,
              fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {o==="All"?"All Orders":o==="party"?"🤝 Party":"🏭 Godown"}
            </button>
          ))}
        </div>
        {/* State filter */}
        <div style={{display:"flex",gap:6,background:C.card,borderRadius:10,padding:"4px",flexWrap:"wrap"}}>
          {["All","Karnataka","Telangana","Maharashtra","Other"].map(s=>(
            <button key={s} onClick={()=>setStateFilter(s)} style={{
              background:stateFilter===s?C.teal+"33":"transparent",
              border:"none",borderRadius:8,padding:"5px 10px",
              color:stateFilter===s?C.teal:C.muted,
              fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── CEMENT DISPATCH ─────────────────────────────────────────────────────── */}
      <div style={{background:C.card,borderRadius:14,padding:"14px 16px"}}>
        <div style={{color:C.blue,fontWeight:800,fontSize:13,marginBottom:10}}>
          🚚 Cement Dispatch
          <span style={{color:C.muted,fontWeight:400,fontSize:11,marginLeft:8}}>
            {cementFiltered.length} trips · {fmtN(cementFiltered.reduce((s,t)=>s+(+t.qty||0),0))} MT
          </span>
        </div>

        {/* State breakdown cards — always All */}
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          {stateBreakdown.map(s=>(
            <StatCard key={s.state}
              state={s.state} qty={s.qty} trips={s.trips}
              color={s.state==="Karnataka"?C.green:s.state==="Telangana"?C.blue:s.state==="Maharashtra"?C.orange:C.muted}
              onClick={()=>setStateFilter(stateFilter===s.state?"All":s.state)}
              active={stateFilter===s.state} />
          ))}
          {stateBreakdown.length>0 && (
            <StatCard key="total" state="TOTAL"
              qty={cementBase.reduce((s,t)=>s+(+t.qty||0),0)}
              trips={cementBase.length}
              color={C.accent}
              onClick={()=>setStateFilter("All")}
              active={stateFilter==="All"} />
          )}
        </div>

        {/* Trip list */}
        {cementFiltered.length===0 ? (
          <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"20px 0"}}>No trips in this period</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {cementFiltered.map(t=>(
              <div key={t.id} style={{background:C.bg,borderRadius:10,padding:"10px 12px",
                borderLeft:"3px solid "+(getState(t)==="Karnataka"?C.green:getState(t)==="Telangana"?C.blue:getState(t)==="Maharashtra"?C.orange:C.muted)}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <span style={{fontWeight:700,fontSize:13}}>{t.truckNo}</span>
                    <span style={{color:C.blue,fontSize:11,marginLeft:6}}>LR:{t.lrNo||"—"}</span>
                    <span style={{color:C.muted,fontSize:11,marginLeft:6}}>DI:{t.diNo||"—"}</span>
                  </div>
                  <div style={{display:"flex",gap:5,alignItems:"center"}}>
                    {t.orderType==="party"&&<Badge label="🤝" color={C.accent} />}
                    <span style={{color:C.orange,fontWeight:800,fontSize:13}}>{t.qty} MT</span>
                  </div>
                </div>
                <div style={{color:C.muted,fontSize:11,marginTop:3}}>
                  {t.to||"—"} · <span style={{color:C.teal,fontWeight:700}}>{getState(t)}</span> · {t.date} · {t.grade||"—"}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Print cement dispatch */}
        <button onClick={()=>{
          let html="<h2>M.YANTRA — Cement Dispatch Report</h2><div>Period: "+df+" to "+dt+" | State: "+stateFilter+" | Orders: "+orderFilter+"</div>";
          if(stateFilter==="All"){
            stateBreakdown.forEach(s=>{ html+=dispatchTableHTML(s.rows.filter(t=>orderFilter==="All"||t.orderType===orderFilter||(orderFilter==="godown"&&!t.orderType)), s.state); });
          } else {
            html+=dispatchTableHTML(cementFiltered,"Cement — "+stateFilter);
          }
          printR(html,"Cement Dispatch");
        }} style={{marginTop:12,background:C.blue+"22",border:"1px solid "+C.blue+"44",
          borderRadius:10,padding:"9px 14px",color:C.blue,fontWeight:700,
          fontSize:12,cursor:"pointer",width:"100%"}}>
          🖨 Print Cement Dispatch
        </button>
      </div>

      {/* ── CLINKER DISPATCH ────────────────────────────────────────────────────── */}
      {(clinkerTrips.length>0 || true) && (
        <div style={{background:C.card,borderRadius:14,padding:"14px 16px"}}>
          <div style={{color:C.orange,fontWeight:800,fontSize:13,marginBottom:10}}>
            🏗 Clinker Dispatch
            <span style={{color:C.muted,fontWeight:400,fontSize:11,marginLeft:8}}>
              {clinkerTrips.length} trips · {fmtN(clinkerTrips.reduce((s,t)=>s+(+t.qty||0),0))} MT
            </span>
          </div>
          {clinkerTrips.length===0 ? (
            <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"12px 0"}}>No clinker trips in this period</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {clinkerTrips.map(t=>(
                <div key={t.id} style={{background:C.bg,borderRadius:10,padding:"10px 12px",
                  borderLeft:"3px solid "+C.orange}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <span style={{fontWeight:700,fontSize:13}}>{t.truckNo}</span>
                      <span style={{color:C.blue,fontSize:11,marginLeft:6}}>LR:{t.lrNo||"—"}</span>
                      <span style={{color:C.muted,fontSize:11,marginLeft:6}}>DI:{t.diNo||"—"}</span>
                    </div>
                    <span style={{color:C.orange,fontWeight:800,fontSize:13}}>{t.qty} MT</span>
                  </div>
                  <div style={{color:C.muted,fontSize:11,marginTop:3}}>
                    {t.to||"—"} · {t.consignee||"—"} · {t.date}
                  </div>
                </div>
              ))}
            </div>
          )}
          {clinkerTrips.length>0&&(
            <button onClick={()=>printR(dispatchTableHTML(clinkerTrips,"Clinker Dispatch"),"Clinker Dispatch")}
              style={{marginTop:12,background:C.orange+"22",border:"1px solid "+C.orange+"44",
                borderRadius:10,padding:"9px 14px",color:C.orange,fontWeight:700,
                fontSize:12,cursor:"pointer",width:"100%"}}>
              🖨 Print Clinker Dispatch
            </button>
          )}
        </div>
      )}

      {/* ── CSV EXPORTS ──────────────────────────────────────────────────────────── */}
      <div style={{background:C.card,borderRadius:14,padding:"14px 16px"}}>
        <div style={{color:C.muted,fontWeight:700,fontSize:12,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>CSV Exports</div>
        {[
          {l:"🚚 Trip Report CSV",  c:C.blue,   fn:()=>exportCSV(cementFiltered.map(t=>({Date:t.date,LR:t.lrNo,DI:t.diNo,Truck:t.truckNo,Client:t.client||DEFAULT_CLIENT,To:t.to,State:getState(t),Grade:t.grade,MT:t.qty,OrderType:t.orderType||"godown",FR:t.frRate,Driver:t.givenRate,Margin:t.qty*(t.frRate-t.givenRate),Status:t.status,By:t.createdBy})),"cement_dispatch.csv")},
          {l:"🏗 Clinker CSV",      c:C.orange, fn:()=>exportCSV(clinkerTrips.map(t=>({Date:t.date,LR:t.lrNo,DI:t.diNo,Truck:t.truckNo,To:t.to,Consignee:t.consignee,MT:t.qty,Status:t.status,By:t.createdBy})),"clinker_dispatch.csv")},
          {l:"🚛 Vehicle Loan CSV", c:C.red,    fn:()=>exportCSV(vehicles.map(v=>({Truck:v.truckNo,Owner:v.ownerName,Loan:v.loan,Recovered:v.loanRecovered,Balance:v.loan-v.loanRecovered})),"loans.csv")},
          {l:"💵 Settlements CSV",  c:C.green,  fn:()=>exportCSV(settlements,"settlements.csv")},
          {l:"⛽ Diesel Indents CSV",c:C.teal,  fn:()=>exportCSV(indents.map(i=>({Date:i.date,Truck:i.truckNo,Indent:i.indentNo,Litres:i.litres,Rate:i.ratePerLitre,Amount:i.amount,Confirmed:i.confirmed,Paid:i.paid,PaidRef:i.paidRef})),"diesel.csv")},
          {l:"🖨 Print Loan Report", c:C.red,   fn:()=>{const vr=vehicles.map(v=>"<tr><td>"+v.truckNo+"</td><td>"+v.ownerName+"</td><td>"+fmtN(v.loan)+"</td><td>"+fmtN(v.loanRecovered)+"</td><td>"+fmtN(v.loan-v.loanRecovered)+"</td></tr>").join(""); printR("<h2>M.YANTRA — Loan Report</h2><table><thead><tr><th>Truck</th><th>Owner</th><th>Loan</th><th>Recovered</th><th>Balance</th></tr></thead><tbody>"+vr+"</tbody></table>","Loan Report");}},
        ].map(r=>(
          <button key={r.l} onClick={r.fn} style={{background:C.bg,border:"1px solid "+C.border,borderRadius:12,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",width:"100%",marginBottom:6}}>
            <span style={{color:C.text,fontWeight:700,fontSize:13}}>{r.l}</span>
            <span style={{color:r.c,fontSize:16}}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── REMINDERS ────────────────────────────────────────────────────────────────
function Reminders({trips, vehicles, employees}) {
  const [phone,setPhone]=useState(""); const [msg,setMsg]=useState("");
  const contacts=[...vehicles.map(v=>({name:v.ownerName,phone:v.phone,type:"Vehicle",ref:v.truckNo,bal:v.loan-v.loanRecovered})),...employees.map(e=>({name:e.name,phone:e.phone,type:"Employee",ref:e.role,bal:e.loan-e.loanRecovered}))];
  const due=contacts.filter(c=>c.bal>0);
  const T=[
    {l:"Loan Reminder",  c:C.red,   m:c=>`Dear ${c.name}, your loan balance is ${fmt(c.bal)}. Kindly repay. - M.Yantra 9606477257`},
    {l:"New Trips",      c:C.green, m:c=>`Dear ${c.name}, new trips available from Kodla. Call: 9606477257. - M.Yantra`},
    {l:"LR Pouch Return",c:C.purple,m:c=>`Dear ${c.name}, please return Lorry Pouch for ${c.ref} within 15 days. - M.Yantra`},
    {l:"Settlement Ready",c:C.blue, m:c=>`Dear ${c.name}, your payment is ready. Visit office. - M.Yantra`},
  ];
  const wa=(ph,m)=>window.open(`https://wa.me/91${ph.replace(/\D/g,"")}?text=${encodeURIComponent(m)}`,"_blank");
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{color:C.teal,fontWeight:800,fontSize:16}}>📲 Reminders</div>
      {due.length>0&&<div>
        <div style={{color:C.red,fontWeight:700,fontSize:13,marginBottom:8}}>🔴 Loan Due ({due.length})</div>
        {due.map(c=>(
          <div key={c.phone} style={{background:C.card,borderRadius:14,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:700}}>{c.name}</div><div style={{color:C.red,fontWeight:800}}>{fmt(c.bal)}</div><div style={{color:C.muted,fontSize:12}}>{c.ref} · {c.phone}</div></div>
            <Btn onClick={()=>wa(c.phone,T[0].m(c))} sm color={C.teal}>📲 WA</Btn>
          </div>
        ))}
      </div>}
      <div>
        <div style={{color:C.blue,fontWeight:700,fontSize:13,marginBottom:8}}>Templates</div>
        {T.map(t=>(
          <button key={t.l} onClick={()=>setMsg(t.m({name:"[Name]",ref:"[Truck]",bal:0}))} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 14px",width:"100%",textAlign:"left",marginBottom:8,cursor:"pointer"}}>
            <div style={{color:t.c,fontWeight:700,fontSize:13}}>{t.l}</div>
            <div style={{color:C.muted,fontSize:11,marginTop:3}}>{t.m({name:"[Name]",ref:"[Truck]",bal:0}).slice(0,70)}…</div>
          </button>
        ))}
      </div>
      <div>
        <div style={{color:C.teal,fontWeight:700,fontSize:13,marginBottom:8}}>Compose</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {contacts.map(c=><button key={c.phone} onClick={()=>setPhone(c.phone)} style={{background:phone===c.phone?C.teal+"33":C.card,border:`1px solid ${phone===c.phone?C.teal:C.border}`,color:phone===c.phone?C.teal:C.muted,borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{c.name}</button>)}
        </div>
        <Field label="Phone" value={phone} onChange={setPhone} placeholder="9XXXXXXXXX" />
        <div style={{marginTop:10}}>
          <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Message</label>
          <textarea value={msg} onChange={e=>setMsg(e.target.value)} rows={4} style={{width:"100%",background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,padding:12,fontSize:15,outline:"none",resize:"vertical",fontFamily:"inherit",marginTop:6,boxSizing:"border-box"}} />
        </div>
        <div style={{marginTop:10}}><Btn onClick={()=>wa(phone,msg)} disabled={!phone||!msg} full color={C.teal}>📲 Open WhatsApp</Btn></div>
      </div>
    </div>
  );
}

// ─── ACTIVITY LOG ─────────────────────────────────────────────────────────────
function ActivityLog({activity}) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{color:C.blue,fontWeight:800,fontSize:16}}>📋 Activity Log</div>
      {(activity||[]).map(a=>(
        <div key={a.id} style={{background:C.card,borderRadius:12,padding:"11px 12px",display:"flex",gap:10,alignItems:"flex-start"}}>
          <Av name={a.user} role={a.role} size={32} />
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:13}}>{a.user} <span style={{color:C.muted,fontWeight:400}}>{a.action}</span></div>
            <div style={{color:C.muted,fontSize:12}}>{a.detail}</div>
            <div style={{color:C.dim,fontSize:11,marginTop:2}}>{a.time}</div>
          </div>
        </div>
      ))}
      {!(activity||[]).length && <div style={{textAlign:"center",color:C.muted,padding:40}}>No activity yet</div>}
    </div>
  );
}

// ─── USER ADMIN ───────────────────────────────────────────────────────────────
function UserAdmin({users, setUsers, user, log}) {
  const [sheet,setSheet]=useState(false); const [edit,setEdit]=useState(null);
  const blank={name:"",username:"",pin:"",role:"operator",active:true};
  const [f,setF]=useState(blank); const ff=k=>v=>setF(p=>({...p,[k]:v}));
  const save=()=>{
    if(edit){setUsers(p=>p.map(u=>u.id===edit.id?{...u,...f}:u));log("EDIT USER",`${f.name}`);}
    else{const u={...f,id:"U"+uid(),createdAt:today()};setUsers(p=>[...(p||[]),u]);log("ADD USER",`${u.name} as ${u.role}`);}
    setF(blank);setSheet(false);setEdit(null);
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:C.accent,fontWeight:800,fontSize:16}}>⚙ User Admin</div>
        <Btn onClick={()=>{setF(blank);setEdit(null);setSheet(true);}} sm>+ Add User</Btn>
      </div>
      <div style={{background:C.accent+"11",border:`1px solid ${C.accent}33`,borderRadius:12,padding:"10px 14px",color:C.muted,fontSize:13}}>Owner-only. Changes take effect on next login.</div>
      {sheet&&<Sheet title={edit?"Edit User":"Add User"} onClose={()=>{setSheet(false);setEdit(null);setF(blank);}}>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <div style={{display:"flex",gap:10}}><Field label="Full Name" value={f.name} onChange={ff("name")} half /><Field label="Username" value={f.username} onChange={ff("username")} half /></div>
          <Field label="PIN (4 digits)" value={f.pin} onChange={ff("pin")} placeholder="1234" />
          <Field label="Role" value={f.role} onChange={ff("role")} opts={Object.entries(ROLES).map(([k,v])=>({v:k,l:`${v.label} — ${v.perms.slice(0,3).join(", ")}…`}))} />
          <div style={{background:C.bg,borderRadius:10,padding:"10px 12px"}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:6}}>PERMISSIONS</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{(ROLES[f.role]?.perms||[]).map(p=><Badge key={p} label={p} color={ROLES[f.role].color} />)}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}><input type="checkbox" checked={f.active} onChange={e=>setF(p=>({...p,active:e.target.checked}))} style={{width:20,height:20}} /><span style={{color:C.text,fontSize:15}}>Active</span></div>
          <Btn onClick={save} full>{edit?"Update":"Add User"}</Btn>
        </div>
      </Sheet>}
      {(users||[]).map(u=>{const r=ROLES[u.role]; const isMe=u.id===user.id; return (
        <div key={u.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",opacity:u.active?1:0.6,marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <Av name={u.name} role={u.role} size={38} />
              <div><div style={{fontWeight:800,fontSize:15}}>{u.name} {isMe&&<Badge label="You" color={C.accent} />}</div><div style={{color:C.muted,fontSize:12}}>@{u.username} · PIN: {u.pin}</div><Badge label={r?.label||u.role} color={r?.color||C.muted} /></div>
            </div>
            <Badge label={u.active?"Active":"Off"} color={u.active?C.green:C.muted} />
          </div>
          {!isMe&&<div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>{setF({name:u.name,username:u.username,pin:u.pin,role:u.role,active:u.active});setEdit(u);setSheet(true);}} sm outline color={C.blue}>Edit</Btn>
            <Btn onClick={()=>{setUsers(p=>p.map(x=>x.id===u.id?{...x,active:!x.active}:x));log("TOGGLE USER",`${u.name} ${u.active?"disabled":"enabled"}`);}} sm outline color={u.active?C.red:C.green}>{u.active?"Disable":"Enable"}</Btn>
          </div>}
        </div>
      );})}
    </div>
  );
}

