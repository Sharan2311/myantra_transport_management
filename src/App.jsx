import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { DB } from "./db.js";
import { supabase } from "./supabase.js";

// ─── THEME ────────────────────────────────────────────────────────────────────
const C = {
  bg:"#0a0e14", card:"#141920", card2:"#1c2330", border:"#252e3d",
  accent:"#f0a500", green:"#2ea043", red:"#da3633", blue:"#388bfd",
  purple:"#8b5cf6", teal:"#2dd4bf", orange:"#f97316",
  text:"#e2e8f0", muted:"#64748b", dim:"#334155",
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
        "district","state"];
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

const Field = ({label, value, onChange, type="text", placeholder="", opts=null, half=false, note=""}) => (
  <div style={{display:"flex",flexDirection:"column",gap:5,flex:half?"1 1 45%":"1 1 100%",minWidth:0}}>
    {label && <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{label}</label>}
    {opts
      ? <select value={value} onChange={e=>onChange(e.target.value)}
          style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,padding:"13px 12px",fontSize:15,outline:"none",WebkitAppearance:"none",appearance:"none"}}>
          {opts.map(o => <option key={o.v??o} value={o.v??o}>{o.l??o}</option>)}
        </select>
      : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          inputMode={type==="number"?"decimal":undefined}
          onClick={type==="date"?e=>e.target.showPicker?.():undefined}
          style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,padding:"13px 12px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box",
            ...(type==="date"?{colorScheme:"dark",WebkitAppearance:"none"}:{})}} />
    }
    {note && <div style={{color:C.muted,fontSize:11}}>{note}</div>}
  </div>
);

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
      <div style={{background:"#1a0808",border:"1px solid #da3633",borderRadius:12,padding:16,margin:8}}>
        <div style={{color:"#da3633",fontWeight:800,marginBottom:6}}>⚠ Something went wrong</div>
        <div style={{color:"#888",fontSize:12}}>{this.state.err?.message||"Unknown error"}</div>
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
  <div style={{position:"fixed",inset:0,background:"#000c",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
    <div style={{background:C.card,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:600,maxHeight:"92vh",overflowY:"auto",paddingBottom:40}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 20px 14px",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.card,zIndex:1}}>
        <span style={{color:C.text,fontWeight:800,fontSize:17}}>{title}</span>
        <button onClick={onClose} style={{background:C.red,border:`2px solid ${C.red}`,color:"#fff",borderRadius:"50%",width:40,height:40,fontSize:22,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 2px 8px #da363366"}}>×</button>
      </div>
      <div style={{padding:"18px 20px 0"}}>{children}</div>
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
function BottomNav({tab, setTab, user}) {
  const items = [
    {id:"dashboard",icon:"⊞",label:"Home",    perm:null},
    {id:"trips",    icon:"🚚",label:"Trips",   perm:"trips"},
    {id:"billing",  icon:"🧾",label:"Billing", perm:"billing"},
    {id:"diesel",   icon:"⛽",label:"Diesel",  perm:"diesel"},
    {id:"more",     icon:"⋯", label:"More",    perm:null},
  ].filter(n => !n.perm || can(user, n.perm));
  return (
    <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:600,background:C.card,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom,6px)"}}>
      {items.map(n => {
        const active = tab===n.id || (n.id==="more" && !MAIN_IDS.includes(tab));
        return (
          <button key={n.id} onClick={()=>setTab(n.id)} style={{flex:1,background:"none",border:"none",padding:"10px 4px 5px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",color:active?C.accent:C.muted}}>
            <span style={{fontSize:20,lineHeight:1}}>{n.icon}</span>
            <span style={{fontSize:10,fontWeight:700}}>{n.label}</span>
            {active && <div style={{width:18,height:3,background:C.accent,borderRadius:2}} />}
          </button>
        );
      })}
    </nav>
  );
}

const MORE_TABS = [
  {id:"inbound",   icon:"🏭",label:"Raw Material",   perm:"trips"},
  {id:"settlement",icon:"💵",label:"Settlement",     perm:"settlement"},
  {id:"driverPay", icon:"🏧",label:"Driver Payments",perm:"settlement"},
  {id:"tafal",     icon:"🤝",label:"TAFAL",          perm:"tafal"},
  {id:"vehicles",  icon:"🚛",label:"Vehicles",       perm:"vehicles"},
  {id:"employees", icon:"👥",label:"Employees",      perm:"employees"},
  {id:"payments",  icon:"💰",label:"Shree Payments", perm:"payments"},
  {id:"expenses",  icon:"🧮",label:"Expenses",       perm:"payments"},
  {id:"reports",   icon:"📤",label:"Reports",        perm:"reports"},
  {id:"reminders", icon:"📲",label:"Reminders",      perm:"reminders"},
  {id:"activity",  icon:"📋",label:"Activity Log",   perm:"reports"},
  {id:"admin",     icon:"⚙", label:"User Admin",     perm:"admin"},
];
function MoreMenu({user, setTab}) {
  return (
    <div>
      <div style={{color:C.muted,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>All Modules</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {MORE_TABS.filter(t=>can(user,t.perm)).map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"18px 14px",display:"flex",flexDirection:"column",gap:8,cursor:"pointer",textAlign:"left"}}>
            <span style={{fontSize:24}}>{t.icon}</span>
            <span style={{color:C.text,fontWeight:700,fontSize:14}}>{t.label}</span>
          </button>
        ))}
      </div>
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
  const [expenses,    setExpenses,    rEx,reloadExpenses]    = useDB(DB.getExpenses,    []);
  const [gstReleases, setGstReleases, rGR,reloadGst]        = useDB(DB.getGstReleases, []);

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
    user, log,
  };

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
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif",color:C.text,maxWidth:600,margin:"0 auto",paddingBottom:80}}>
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
        {tab==="more"       && <MoreMenu user={user} setTab={setTab} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} user={user} />
    </div>
  );
}
// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({trips, vehicles, employees, indents, pumps, pumpPayments, activity, settings, setTab, user}) {
  const pending     = trips.filter(t => t.status==="Pending Bill");
  const margin      = trips.reduce((s,t) => s + t.qty*(t.frRate-t.givenRate), 0);
  const vLoan       = vehicles.reduce((s,v) => s + Math.max(0, v.loan-v.loanRecovered), 0);
  // Diesel pending = total confirmed indents - total pump payments made
  const confirmedIndents = indents.filter(i => i.confirmed);
  const totalDieselOwed = confirmedIndents.reduce((s,i) => s+(+(i.amount)||0), 0);
  const totalDieselPaid = (pumpPayments||[]).reduce((s,p) => s+(+(p.amount)||0), 0);
  const unpaidDiesel = Math.max(0, totalDieselOwed - totalDieselPaid);
  const tafalPool   = trips.reduce((s,t) => s+(t.tafal||0), 0);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{color:C.text,fontSize:18,fontWeight:800}}>Good day, {user.name.split(" ")[0]} 👋</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <KPI icon="⚠"  label="Pending Bills"   value={pending.length}   color={C.accent} sub={fmt(pending.reduce((s,t)=>s+t.qty*t.frRate,0))} />
        <KPI icon="📈" label="My Margin"        value={fmt(margin)}      color={C.green} />
        <KPI icon="🚚" label="Total Trips"      value={trips.length}     color={C.blue}  sub={`${trips.filter(t=>t.type==="outbound").length} out · ${trips.filter(t=>t.type==="inbound").length} in`} />
        <KPI icon="⛽" label="Diesel Pending"   value={fmt(unpaidDiesel)}color={C.orange}sub={`${confirmedIndents.length} indents`} />
        <KPI icon="🔴" label="Vehicle Loans"    value={fmt(vLoan)}       color={C.red} />
        <KPI icon="🤝" label="TAFAL Pool"       value={fmt(tafalPool)}   color={C.purple}sub={`₹${settings?.tafalPerTrip||300}/trip`} />
      </div>

      {can(user,"trips") && (
        <div>
          <div style={{color:C.muted,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Quick Actions</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setTab("trips")}   style={{flex:1,background:C.accent+"22",border:`1.5px solid ${C.accent}`,color:C.accent,borderRadius:12,padding:"12px 6px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Cement</button>
            <button onClick={()=>setTab("inbound")} style={{flex:1,background:C.teal+"22",  border:`1.5px solid ${C.teal}`,  color:C.teal,  borderRadius:12,padding:"12px 6px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ RM Trip</button>
            {can(user,"diesel") && <button onClick={()=>setTab("diesel")} style={{flex:1,background:C.orange+"22",border:`1.5px solid ${C.orange}`,color:C.orange,borderRadius:12,padding:"12px 6px",fontSize:13,fontWeight:700,cursor:"pointer"}}>⛽ Indent</button>}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{color:C.accent,fontWeight:700,fontSize:13}}>⚠ Pending Bills ({pending.length})</div>
            <button onClick={()=>setTab("billing")} style={{background:"none",border:"none",color:C.blue,fontSize:12,cursor:"pointer"}}>Bill now →</button>
          </div>
          {pending.slice(0,3).map(t => (
            <div key={t.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",marginBottom:8,borderLeft:`4px solid ${C.accent}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:700}}>{t.truckNo} <span style={{color:C.blue,fontSize:12,fontWeight:600}}>LR:{t.lrNo||"—"}</span></div>
                <div style={{color:C.muted,fontSize:12}}>{t.to} · {t.qty}MT · {t.date}</div>
              </div>
              <div style={{color:C.accent,fontWeight:800}}>{fmt(t.qty*t.frRate)}</div>
            </div>
          ))}
        </div>
      )}

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
          <div style={{background:"#1a1000",border:`2px solid ${C.orange}66`,borderRadius:12,padding:"12px 14px"}}>
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
        <div style={{background:"#1a1000",border:`1px solid ${C.orange}44`,borderRadius:12,padding:"14px"}}>
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
      <Btn onClick={onSeparate} full outline color={C.blue}>
        Create as separate new trip
      </Btn>
      <Btn onClick={onCancel} full outline color={C.muted}>
        Cancel
      </Btn>
    </div>
  );
}

// ─── DI / GR COPY UPLOADER ───────────────────────────────────────────────────
// Sends photo or PDF to Claude AI → extracts all trip fields automatically
function DIUploader({ onExtracted, trips, settings, isIn }) {
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
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          style={{
            border: `2px dashed ${state==="error" ? C.red : C.blue}`,
            borderRadius: 14, padding: "20px 16px", textAlign: "center",
            cursor: "pointer", background: C.bg,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}
        >
          <div style={{fontSize: 32}}>📄</div>
          <div style={{color: C.blue, fontWeight: 800, fontSize: 14}}>
            Upload DI / GR Copy
          </div>
          <div style={{color: C.muted, fontSize: 12}}>
            Take a photo or upload PDF — AI will fill all fields
          </div>
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

      <input ref={inputRef} type="file" accept="image/*,application/pdf"
        style={{display:"none"}} onChange={e => handleFile(e.target.files?.[0])} />

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
  const [grFile,      setGrFile]      = useState(grFileRef.current);
  const [invoiceFile, setInvoiceFile] = useState(invoiceFileRef.current);
  const [grPreview,   setGrPreview]   = useState(null);
  const [invPreview,  setInvPreview]  = useState(null);
  const grRef  = useRef(null);
  const invRef = useRef(null);

  const readPreview = (file, setter) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = e => setter(e.target.result);
    r.readAsDataURL(file);
  };

  const pickGR = f => { grFileRef.current=f; setGrFile(f); readPreview(f, setGrPreview); };
  const pickInv = f => { invoiceFileRef.current=f; setInvoiceFile(f); readPreview(f, setInvPreview); };

  const canProceed = grFile && invoiceFile;

  // Inline file box renderer — avoids remount bug from defining component inside render
  const renderFileBox = (label, file, preview, inputRef, onPick, clearFn, color) => (
    <div style={{background:C.bg,borderRadius:12,padding:14,border:`2px dashed ${file?color:C.border}`}}>
      <div style={{color:color,fontWeight:700,fontSize:12,marginBottom:8}}>{label}</div>
      {preview ? (
        <div style={{position:"relative"}}>
          {preview.startsWith("data:image") ? (
            <img src={preview} style={{width:"100%",maxHeight:160,objectFit:"contain",borderRadius:8}} />
          ) : (
            <div style={{background:C.card,borderRadius:8,padding:"12px",textAlign:"center",color:C.green,fontWeight:700}}>
              ✓ PDF loaded: {file.name}
            </div>
          )}
          <button onClick={()=>{clearFn(); if(inputRef.current) inputRef.current.value="";}}
            style={{position:"absolute",top:4,right:4,background:C.red,border:"none",color:"#fff",
              borderRadius:"50%",width:24,height:24,fontSize:14,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
      ) : (
        <button onClick={()=>inputRef.current?.click()}
          style={{width:"100%",background:color+"11",border:`1.5px dashed ${color}`,
            borderRadius:10,padding:"20px",color:color,fontWeight:700,
            fontSize:13,cursor:"pointer",textAlign:"center"}}>
          📎 Tap to upload {label}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*,application/pdf"
        style={{display:"none"}} onChange={e=>{
          const f = e.target.files?.[0];
          if(f) onPick(f);
          // Reset so same file can be re-selected
          e.target.value = "";
        }} />
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{background:C.accent+"11",border:`1px solid ${C.accent}33`,borderRadius:10,
        padding:"10px 14px",color:C.accent,fontSize:12,fontWeight:700}}>
        🤝 Party Order — Upload documents before filling trip details
      </div>
      {renderFileBox("GR Copy *",  grFile,      grPreview,  grRef,  pickGR,
        ()=>{grFileRef.current=null;setGrFile(null);setGrPreview(null);},   C.green)}
      {renderFileBox("Invoice *",  invoiceFile, invPreview, invRef, pickInv,
        ()=>{invoiceFileRef.current=null;setInvoiceFile(null);setInvPreview(null);}, C.blue)}
      {canProceed && (
        <div style={{background:C.green+"11",border:`1px solid ${C.green}33`,borderRadius:8,
          padding:"8px 12px",color:C.green,fontSize:12,fontWeight:700}}>
          ✓ Both documents uploaded — proceed to fill trip details
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

      <div style={{background:"#1a1000",border:`1px solid ${C.orange}44`,borderRadius:8,
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
  const [step,     setStep]     = useState("select"); // "select" | "compose"
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

        <Btn onClick={()=>setStep("compose")} full color={C.accent}
          disabled={selected.size===0}>
          Compose Email → ({selected.size} trips selected)
        </Btn>
        <Btn onClick={onClose} full outline color={C.muted}>Cancel</Btn>
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

        <div style={{background:"#1a1000",border:"1px solid "+C.orange+"44",borderRadius:8,
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
          <button onClick={()=>inputRef.current?.click()}
            style={{width:"100%",background:C.green+"11",border:"1.5px dashed "+C.green,
              borderRadius:10,padding:"20px",color:C.green,fontWeight:700,
              fontSize:13,cursor:"pointer",textAlign:"center"}}>
            📎 Upload Reply Email PDF
          </button>
        )}
        <input ref={inputRef} type="file" accept="application/pdf,image/*"
          style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)pick(f);e.target.value="";}} />
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
          <button onClick={()=>inputRef.current?.click()}
            style={{width:"100%",background:C.green+"11",border:`1.5px dashed ${C.green}`,
              borderRadius:10,padding:"20px",color:C.green,fontWeight:700,
              fontSize:13,cursor:"pointer",textAlign:"center"}}>
            📎 Tap to upload Reply Email PDF
          </button>
        )}
        <input ref={inputRef} type="file" accept="application/pdf,image/*"
          style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)pick(f);e.target.value="";}} />
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

// ─── TRIPS ────────────────────────────────────────────────────────────────────
function Trips({trips, setTrips, vehicles, setVehicles, indents, settings, tripType, user, log, driverPays, employees}) {
  const isIn = tripType === "inbound";
  const ac   = isIn ? C.teal : C.accent;

  const [addSheet,    setAddSheet]    = useState(false);
  const [editSheet,   setEditSheet]   = useState(null);
  const [filter,      setFilter]      = useState("All");
  const [search,      setSearch]      = useState("");
  const [diConflict,  setDiConflict]  = useState(null);
  const [wasScanned,  setWasScanned]  = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  // Party order flow state
  const [orderTypeStep, setOrderTypeStep] = useState(null);
  const [partyStep,     setPartyStep]     = useState("docs");
  const [uploadingFiles,setUploadingFiles]= useState(false);
  // Refs to hold file objects across re-renders without triggering state
  const grFileRef      = useRef(null);
  const invoiceFileRef = useRef(null);
  // Party email batch sheet
  const [partyEmailSheet, setPartyEmailSheet] = useState(false);
  // WhatsApp reminder sheet
  const [waSheet, setWaSheet] = useState(false);
  // Batch receipt upload sheet
  const [batchReceiptSheet, setBatchReceiptSheet] = useState(null); // batchId string

  const blankForm = (isParty=false) => ({
    type:tripType, lrNo:"", diNo:"", truckNo:"", grNo:"", dieselIndentNo:"",
    consignee: isIn ? "Shree Cement Ltd" : "",
    from: isIn ? "" : "Kodla", to: isIn ? "Kodla" : "",
    grade: isIn ? "Limestone" : "Cement Packed",
    qty:"", bags:"", frRate:"", givenRate:"",
    date:today(), advance:"0", shortage:"0", shortageRecovery:"0", loanRecovery:"0",
    tafal: String(settings?.tafalPerTrip||300),
    dieselEstimate:"0",
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
  const dlist  = (dateFrom||dateTo) ? list.filter(t => t.date>=(dateFrom||"2000-01-01") && t.date<=(dateTo||"2099-12-31")) : list;
  const slist  = search ? dlist.filter(t => (t.truckNo+t.lrNo+t.grNo+t.diNo+t.to+t.consignee).toLowerCase().includes(search.toLowerCase())) : dlist;
  const shown  = filter==="All" ? slist : slist.filter(t => t.status===filter);

  // When truck number changes, check if tafalExempt
  const onTruckChange = v => {
    const veh = vehicles.find(x => x.truckNo===v.toUpperCase().trim());
    setF(p => ({...p, truckNo:v, tafal: veh?.tafalExempt ? "0" : String(settings?.tafalPerTrip||300)}));
  };

  // Called when AI extracts fields from DI/GR copy
  // LR is always manual — so we show LR-ask screen first, then check for duplicates
  const onDIExtracted = (extracted, _ignored) => {
    // Carry district+state into form if present (party orders)
    if(extracted.district || extracted.state){
      setF(p=>({...p, district:extracted.district||p.district||"", state:extracted.state||p.state||""}));
    }
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
      alert("Driver Rate ₹/MT is mandatory.\nPlease enter the rate before saving.");
      return;
    }
    // Validate: if diesel estimate entered, indent number is mandatory
    if ((+f.dieselEstimate||0) > 0 && !f.dieselIndentNo?.trim()) {
      alert("Diesel Indent No is mandatory when Diesel Estimate is entered.\nPlease enter the indent number from the pump slip.");
      return;
    }
    // Validate: diesel indent no must be unique across trips AND diesel indents
    if (f.dieselIndentNo && f.dieselIndentNo.trim()) {
      if (trips.some(t => t.dieselIndentNo && t.dieselIndentNo.trim() === f.dieselIndentNo.trim())) {
        alert(`Indent No "${f.dieselIndentNo}" already exists on another trip. Each indent number must be unique.`);
        return;
      }
      if ((indents||[]).some(i => i.indentNo && String(i.indentNo).trim() === f.dieselIndentNo.trim())) {
        alert(`Indent No "${f.dieselIndentNo}" already exists in Diesel records. Each indent number must be unique.`);
        return;
      }
    }
    // Validate: Est. Net to Driver cannot be negative
    {
      const _gross = (+f.qty||0)*(+f.givenRate||0);
      const _net = _gross - (+f.advance||0) - (+f.tafal||0) - (+f.dieselEstimate||0) - (+f.shortageRecovery||0) - (+f.loanRecovery||0);
      if(_net < 0){
        alert(`Cannot save: Est. Net to Driver is ₹${_net.toLocaleString("en-IN")} (negative).\nPlease reduce Advance, Loan Recovery, or Shortage Recovery so the driver's net is ≥ ₹0.`);
        return;
      }
    }
    const t = mkTrip({
      ...f, type:tripType,
      qty:+f.qty, bags:+f.bags, frRate:+f.frRate, givenRate:+f.givenRate,
      advance:+f.advance, shortage:+f.shortage, tafal:+f.tafal,
      shortageRecovery:+f.shortageRecovery||0, loanRecovery:+f.loanRecovery||0,
      dieselEstimate:+f.dieselEstimate,
      dieselIndentNo: (f.dieselIndentNo||"").trim(),
      createdBy:user.username, createdAt:nowTs(),
    });
    setTrips(p => [t, ...(p||[])]);
    log("ADD TRIP", `LR:${t.lrNo} ${t.truckNo}→${t.to} ${t.qty}MT`);
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
      const _gross = _isMulti
        ? _diLines.reduce((s,d)=>s+(d.qty||0)*(d.givenRate||0),0)
        : (+editSheet.qty||0)*(+editSheet.givenRate||0);
      const _net = _gross - (+editSheet.advance||0) - (+editSheet.tafal||0) - (+editSheet.dieselEstimate||0) - (+editSheet.shortageRecovery||0) - (+editSheet.loanRecovery||0);
      if(_net < 0){
        alert(`Cannot save: Est. Net to Driver is ₹${_net.toLocaleString("en-IN")} (negative).\nPlease reduce Advance, Loan Recovery, or Shortage Recovery so the driver's net is ≥ ₹0.`);
        return;
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
          <Btn onClick={()=>{
            if(isIn){setOrderTypeStep("godown");setF(blankForm(false));}
            else{setOrderTypeStep("selecting");}
            setAddSheet(true);
          }} color={ac} sm>+ Add Trip</Btn>
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
                style={{background:C.red,border:"none",color:"#fff",borderRadius:8,
                  padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                Send Now
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
                  padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"dark",WebkitAppearance:"none",boxSizing:"border-box"}} />
            </div>
            <div style={{flex:1}}>
              <div style={{color:C.muted,fontSize:11,marginBottom:3}}>TO</div>
              <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                onClick={e=>e.target.showPicker?.()}
                style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,color:dateTo?C.text:C.muted,
                  padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"dark",WebkitAppearance:"none",boxSizing:"border-box"}} />
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
                  return "<tr><td>"+t.date+"</td><td>"+t.truckNo+"</td><td>"+(t.lrNo||"—")+"</td><td>"+(t.to||"—")+"</td><td>"+t.qty+"</td><td style='text-align:right'>"+fmt(t.qty*(t.frRate||0))+"</td><td style='text-align:right'>"+fmt(t.advance||0)+"</td><td style='text-align:right'>"+fmt(diesel)+"</td><td style='text-align:right'>"+fmt(net)+"</td><td>"+(t.status||"—")+"</td></tr>";
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

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search truck, LR, destination…"
        style={{background:C.card,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,padding:"11px 14px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box"}} />

      <PillBar items={["All","Pending Bill","Billed","Paid"].map(s=>({id:s,label:s+(s!=="All"?` (${list.filter(t=>t.status===s).length})`:""  ),color:SC(s)}))} active={filter} onSelect={setFilter} />

      <div style={{color:C.muted,fontSize:12}}>{shown.length} trips</div>

      {/* TRIP CARDS */}
      {shown.map(t => {
        const v    = vehicles.find(x => x.truckNo===t.truckNo);
        const tripIndents = indents.filter(i => i.tripId===t.id && i.confirmed);
        const confirmedDiesel = tripIndents.reduce((s,i) => s+(i.amount||0), 0);
        const calc = calcNet(t, v, confirmedDiesel > 0 ? confirmedDiesel : null);
        const paidSoFar = (driverPays||[]).filter(p=>p.tripId===t.id).reduce((s,p)=>s+(p.amount||0),0);
        const remaining = Math.max(0, calc.net - paidSoFar);
        return (
          <div key={t.id} style={{background:C.card,borderRadius:14,overflow:"hidden",borderLeft:`4px solid ${SC(t.status)}`,marginBottom:6}}>
            <div style={{padding:"13px 14px 10px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:800,fontSize:15}}>{t.truckNo}</div>
                  <div style={{fontSize:12,marginTop:2}}>
                    <span style={{color:C.blue,fontWeight:700}}>LR: {t.lrNo||"—"}</span>
                    {t.grNo && <span style={{color:C.muted}}> · GR: {t.grNo}</span>}
                  </div>
                  <div style={{color:C.muted,fontSize:11,marginTop:1}}>{t.from}→{t.to} · {t.date}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                  <Badge label={t.status} color={SC(t.status)} />
                  {/* ✏ EDIT ICON */}
                  <button onClick={()=>{
                    // Normalize diLines — ensure each line has frRate populated
                    const normalized = {...t, diLines: (t.diLines||[]).map(d=>({...d, frRate: d.frRate||t.frRate||0}))};
                    setEditSheet(normalized);
                  }} style={{background:C.dim,border:"none",borderRadius:8,color:C.muted,padding:"5px 8px",cursor:"pointer",fontSize:14}}>✏</button>
                  {/* 🗑 DELETE (owner only) */}
                  {user.role==="owner" && (
                    <button onClick={()=>setConfirmDel(t)}
                      style={{background:C.red+"22",border:"none",borderRadius:8,color:C.red,padding:"5px 8px",cursor:"pointer",fontSize:14}}>🗑</button>
                  )}
                </div>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderTop:`1px solid ${C.border}`,background:C.card2}}>
              {[
                {l:"MT",     v:t.qty,                           c:C.text},
                {l:"Billed", v:fmt(calc.billed||t.qty*t.frRate),c:C.blue},
                {l:"Owed",   v:fmt(calc.gross),                 c:C.orange},
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

            {/* Footer — Row 1: meta + standard badges */}
            <div style={{padding:"7px 12px 4px",display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{color:ROLES[t.createdBy]?.color||C.muted,fontSize:11}}>by {t.createdBy} · {t.createdAt}</span>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                {t.tafal>0     && <Badge label={"TAFAL ₹"+t.tafal} color={C.purple} />}
                {t.shortage>0  && <Badge label={"⚠ "+t.shortage+"MT"} color={C.red} />}
                {t.advance>0   && <Badge label={"Adv "+fmt(t.advance)} color={C.orange} />}
                {confirmedDiesel>0 && <Badge label={"⛽ "+fmt(confirmedDiesel)} color={C.orange} />}
                {t.driverSettled   && <Badge label="✓ Settled" color={C.green} />}
                {t.diLines && t.diLines.length > 1 && <Badge label={t.diLines.length+" DIs"} color={C.teal} />}
              </div>
            </div>
            {/* Footer — Row 2: party actions (own row, always visible) */}
            {(t.orderType==="party"||t.grFilePath) && (
              <div style={{padding:"5px 12px 8px",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",
                borderTop:"1px solid "+C.border+"33"}}>
                <Badge label="🤝 Party" color={C.accent} />
                {t.orderType==="party" && !t.emailSentAt && <Badge label="⚠ Email Pending" color={C.red} />}
                {t.orderType==="party" && t.emailSentAt && !t.receiptFilePath && <Badge label="📧 Awaiting Reply" color={C.blue} />}
                {t.receiptFilePath && !t.mergedPdfPath && <Badge label="🔄 Receipt uploaded" color={C.teal} />}
                {t.mergedPdfPath && <Badge label="✅ Merged PDF ready" color={C.green} />}
                {t.emailSentAt && t.batchId && !t.mergedPdfPath && (
                  <button onClick={()=>setBatchReceiptSheet(t.batchId)}
                    style={{background:C.green+"22",color:C.green,
                      border:"1px solid "+C.green+"44",borderRadius:20,
                      padding:"4px 12px",fontSize:11,fontWeight:700,
                      cursor:"pointer",whiteSpace:"nowrap"}}>
                    📎 Upload Batch Receipt
                  </button>
                )}
                {/* GR Copy download */}
                {t.grFilePath && (
                  <button onClick={async()=>{
                    try{
                      const url=await getSignedUrl(t.grFilePath,3600);
                      const a=document.createElement("a");a.href=url;
                      a.download="GR_"+(t.lrNo||t.id);
                      a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);
                    }catch(e){alert("GR download failed: "+e.message);}
                  }} style={{background:C.teal+"22",color:C.teal,
                    border:"1px solid "+C.teal+"44",borderRadius:20,
                    padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                    ⬇ GR
                  </button>
                )}
                {/* Invoice download */}
                {t.invoiceFilePath && (
                  <button onClick={async()=>{
                    try{
                      const url=await getSignedUrl(t.invoiceFilePath,3600);
                      const a=document.createElement("a");a.href=url;
                      a.download="Invoice_"+(t.lrNo||t.id);
                      a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);
                    }catch(e){alert("Invoice download failed: "+e.message);}
                  }} style={{background:C.blue+"22",color:C.blue,
                    border:"1px solid "+C.blue+"44",borderRadius:20,
                    padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                    ⬇ Invoice
                  </button>
                )}
                {/* Merged PDF download */}
                {t.mergedPdfPath && (
                  <button onClick={async()=>{
                    try{
                      const url=await getSignedUrl(t.mergedPdfPath,3600);
                      const a=document.createElement("a");a.href=url;
                      a.download="MergedConfirmation_"+(t.lrNo||t.id)+".pdf";
                      a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);
                    }catch(e){alert("Download failed: "+e.message);}
                  }} style={{background:C.green+"22",color:C.green,
                    border:"1px solid "+C.green+"44",borderRadius:20,
                    padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                    ⬇ Merged PDF
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
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
                        color:"#fff",fontWeight:700,fontSize:12,flexShrink:0}}>
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

      {/* ── ADD SHEET ── */}
      {addSheet && (
        <Sheet title={isIn?"New Raw Material Trip":"New Cement Trip"} onClose={()=>{
          setAddSheet(false);setF(blankForm());setDiConflict(null);setWasScanned(false);
          setOrderTypeStep(null);setPartyStep("docs");setUploadingFiles(false);
          grFileRef.current=null; invoiceFileRef.current=null;
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
                    onSeparate={()=>{setF(p=>({...p,...diConflict.extracted}));setDiConflict(null);}}
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
                    <TripForm f={f} ff={ff} isIn={isIn} ac={ac} vehicles={vehicles} settings={settings}
                      onTruckChange={onTruckChange} onSubmit={saveNew} submitLabel="Save Trip"
                      user={user} wasScanned={wasScanned} />
                  )}
                </>
              )}
            </>
          )}

          {/* STEP 1 (PARTY): Upload GR + Invoice */}
          {orderTypeStep==="party" && partyStep==="docs" && (
            <PartyDocUpload
              tripId={f.id||"new"}
              grFileRef={grFileRef}
              invoiceFileRef={invoiceFileRef}
              onDone={()=>setPartyStep("form")}
              onBack={()=>setOrderTypeStep("selecting")}
            />
          )}

          {/* STEP 2 (PARTY): Fill trip form — same scan/conflict flow as godown */}
          {orderTypeStep==="party" && partyStep==="form" && (
            <>
              {/* Attached docs indicator */}
              <div style={{display:"flex",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                <div style={{background:C.green+"22",border:`1px solid ${C.green}44`,borderRadius:8,
                  padding:"5px 10px",fontSize:11,color:C.green,fontWeight:700}}>
                  ✓ GR: {grFileRef.current?.name||"uploaded"}
                </div>
                <div style={{background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:8,
                  padding:"5px 10px",fontSize:11,color:C.blue,fontWeight:700}}>
                  ✓ Inv: {invoiceFileRef.current?.name||"uploaded"}
                </div>
                <button onClick={()=>{setPartyStep("docs");setDiConflict(null);setWasScanned(false);}}
                  style={{background:"none",border:"none",color:C.muted,fontSize:11,cursor:"pointer"}}>
                  ✏ Change
                </button>
              </div>

              {/* Same DI conflict flow as godown — handles duplicate DI, LR entry, merge */}
              {diConflict ? (
                diConflict.askLR ? (
                  <AskLRSheet extracted={diConflict.extracted} trips={trips} vehicles={vehicles}
                    onConfirm={(lrNo, driverPhone)=>{
                      // Carry party fields through LR confirm
                      onLRConfirmed(lrNo, driverPhone);
                      setF(p=>({...p, orderType:"party",
                        district:diConflict.extracted.district||p.district||"",
                        state:diConflict.extracted.state||p.state||""}));
                    }}
                    onCancel={()=>setDiConflict(null)} />
                ) : (
                  <MergeDISheet conflict={diConflict} onMerge={addDIToExisting}
                    onSeparate={()=>{setF(p=>({...p,...diConflict.extracted,orderType:"party"}));setDiConflict(null);}}
                    onCancel={()=>setDiConflict(null)} isOwner={user.role==="owner"} />
                )
              ) : (
                <>
                  {/* Scan uploader — goes through same onDIExtracted → AskLRSheet flow */}
                  <DIUploader onExtracted={e=>{
                    // Preserve party orderType and district/state through the scan flow
                    setF(p=>({...p, orderType:"party",
                      district:e.district||p.district||"",
                      state:e.state||p.state||""}));
                    onDIExtracted(e);
                  }} trips={trips} settings={settings} isIn={false} />

                  {/* Show form only after scan + LR confirmed (wasScanned) or owner */}
                  {(wasScanned || user.role==="owner") ? (
                    <TripForm f={f} ff={ff} isIn={false} ac={C.accent} vehicles={vehicles} settings={settings}
                      onTruckChange={onTruckChange}
                      onSubmit={async ()=>{
                        // All same validations as godown saveNew
                        if(!f.givenRate||+f.givenRate<=0){alert("Driver Rate ₹/MT is mandatory.");return;}
                        if((+f.dieselEstimate||0)>0&&!f.dieselIndentNo?.trim()){alert("Diesel Indent No is mandatory when Diesel Estimate is entered.");return;}
                        if(f.dieselIndentNo&&f.dieselIndentNo.trim()){
                          if(trips.some(t=>t.dieselIndentNo&&t.dieselIndentNo.trim()===f.dieselIndentNo.trim()))
                            {alert(`Indent No "${f.dieselIndentNo}" already exists on another trip.`);return;}
                          if((indents||[]).some(i=>i.indentNo&&String(i.indentNo).trim()===f.dieselIndentNo.trim()))
                            {alert(`Indent No "${f.dieselIndentNo}" already exists in Diesel records.`);return;}
                        }
                        if(f.lrNo&&f.lrNo.trim()&&trips.some(t=>t.lrNo===f.lrNo.trim()))
                          {alert(`LR "${f.lrNo}" already exists. Each LR must be unique.`);return;}
                        const _gross=(+f.qty||0)*(+f.givenRate||0);
                        const _net=_gross-(+f.advance||0)-(+f.tafal||0)-(+f.dieselEstimate||0)-(+f.shortageRecovery||0)-(+f.loanRecovery||0);
                        if(_net<0){alert("Cannot save: Est. Net to Driver is negative.");return;}
                        if(!f.district||!f.state){alert("District and State are required for Party orders.");return;}
                        // Save directly — email sent separately via Party Email button
                        setUploadingFiles(true);
                        try {
                          const tripId = uid();
                          let grUrl="", invUrl="";
                          if(grFileRef.current)  { const r=await uploadPartyFile(tripId,"gr",grFileRef.current);  grUrl=r.path; }
                          if(invoiceFileRef.current) { const r=await uploadPartyFile(tripId,"invoice",invoiceFileRef.current); invUrl=r.path; }
                          const t = mkTrip({
                            ...f, id:tripId, type:tripType,
                            qty:+f.qty, bags:+f.bags, frRate:+f.frRate, givenRate:+f.givenRate,
                            advance:+f.advance, shortage:+f.shortage, tafal:+f.tafal,
                            shortageRecovery:+f.shortageRecovery||0, loanRecovery:+f.loanRecovery||0,
                            dieselEstimate:+f.dieselEstimate,
                            dieselIndentNo:(f.dieselIndentNo||"").trim(),
                            orderType:"party", district:f.district||"", state:f.state||"",
                            grFilePath:grUrl, invoiceFilePath:invUrl, mergedPdfPath:"",
                            emailSentAt:"", partyEmail:"", batchId:"",
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
                          grFileRef.current=null; invoiceFileRef.current=null;
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
          <div style={{background:C.orange+"11",border:`1px solid ${C.orange}33`,borderRadius:10,padding:"9px 12px",color:C.orange,fontSize:12,fontWeight:700,marginBottom:14}}>
            Editing trip · LR: {editSheet.lrNo||"—"} · {editSheet.truckNo}
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
function TripForm({f, ff, isIn, ac, vehicles, settings, onTruckChange, onSubmit, submitLabel, user, showStatus=false, wasScanned=false, isParty=false}) {
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

      <div style={{display:"flex",gap:10}}>
        {locked
          ? <><LockedField label="From" value={f.from} half /><LockedField label="To" value={f.to} half /></>
          : <><Field label="From" value={f.from||""} onChange={ff("from")} half />
              <Field label="To"   value={f.to||""}   onChange={ff("to")}   half /></>}
      </div>
      {locked
        ? <LockedField label="Consignee" value={f.consignee} />
        : <Field label="Consignee" value={f.consignee||""} onChange={ff("consignee")} />}
      {locked
        ? <LockedField label="Grade" value={f.grade} />
        : <Field label="Grade" value={f.grade||""} onChange={ff("grade")}
            opts={isIn ? ["Limestone","Coal","Gypsum","Fly Ash","Slag","Other"].map(x=>({v:x,l:x}))
                       : ["Cement Packed","Cement Bulk","Clinker"].map(x=>({v:x,l:x}))} />}
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
              padding:"7px 10px",marginBottom:10,fontSize:11,color:"#ff9800"}}>
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
            <input type="number" value={f.givenRate||""} onChange={e=>ff("givenRate")(e.target.value)}
              style={{background:C.bg,border:`1.5px solid ${(!f.givenRate||+f.givenRate<=0)?C.red:C.border}`,
                borderRadius:10,color:C.text,padding:"13px 12px",fontSize:15,outline:"none",
                width:"100%",boxSizing:"border-box"}} />
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:10}}>
        <Field label="Advance ₹"            value={f.advance||""}           onChange={ff("advance")}           type="number" half />
        <Field label="Shortage Recovery ₹"  value={f.shortageRecovery||""} onChange={ff("shortageRecovery")} type="number" half
          note={veh&&(veh.shortageOwed||0)>(veh.shortageRecovered||0)?`Pending: ₹${((veh.shortageOwed||0)-(veh.shortageRecovered||0)).toLocaleString("en-IN")}`:""}
        />
      </div>
      <div style={{display:"flex",gap:10}}>
        <div style={{display:"flex",flexDirection:"column",gap:5,flex:"1 1 45%",minWidth:0}}>
          <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Loan Recovery ₹</label>
          {(()=>{
            const loanBal = veh ? Math.max(0,(veh.loan||0)-(veh.loanRecovered||0)) : null;
            const overLimit = loanBal !== null && (+f.loanRecovery||0) > loanBal;
            return (<>
              <input type="number" value={f.loanRecovery||""} inputMode="decimal"
                onChange={e=>{
                  const val = +e.target.value||0;
                  if(loanBal !== null && val > loanBal){
                    ff("loanRecovery")(String(loanBal));
                  } else {
                    ff("loanRecovery")(e.target.value);
                  }
                }}
                style={{background:C.bg,border:`1.5px solid ${overLimit?C.red:C.border}`,borderRadius:10,color:C.text,padding:"13px 12px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box"}} />
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
        <Field label="Shortage MT (Shree)" value={f.shortage||""} onChange={ff("shortage")} type="number" half
          note="Shortage reported by Shree Cement (in MT)"
        />
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
        <Field label="TAFAL ₹" value={f.tafal||"0"} onChange={ff("tafal")} type="number" half
          note={veh?.tafalExempt?"This vehicle is exempt":""} />
        <Field label="Diesel Estimate ₹" value={f.dieselEstimate||"0"} onChange={ff("dieselEstimate")} type="number" half
          note="Driver's estimate (update later via Indent)" />
      </div>
      <Field label="⛽ Diesel Indent No"
        value={f.dieselIndentNo||""} onChange={ff("dieselIndentNo")}
        placeholder="e.g. 25748 — from pump slip before loading"
        note="Pump gives this before loading — used to match diesel slip" />
      {showStatus && (
        <Field label="Status" value={f.status||"Pending Bill"} onChange={ff("status")}
          opts={["Pending Bill","Billed","Paid"].map(x=>({v:x,l:x}))} />
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
            {l:"My Margin",                   v:fmt(margin),                             c:C.green},
            {l:"Est. Net to Driver",          v:fmt(net-(+f.shortageRecovery||0)-(+f.loanRecovery||0)),  c:(net-(+f.shortageRecovery||0)-(+f.loanRecovery||0))>=0?C.green:C.red},
          ].map(x => (
            <div key={x.l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}22`}}>
              <span style={{color:C.muted,fontSize:13}}>{x.l}</span>
              <span style={{color:x.c,fontWeight:700,fontSize:13}}>{x.v}</span>
            </div>
          ))}
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
  const [sel, setSel]     = useState([]);
  const [invNo, setInvNo] = useState("");
  const tgl = id => setSel(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  const totalSel = pending.filter(t=>sel.includes(t.id)).reduce((s,t)=>s+t.qty*t.frRate,0);

  const bill = () => {
    const inv = invNo.trim() || ("SMYE"+Date.now().toString().slice(-8));
    setTrips(p => p.map(t => sel.includes(t.id)
      ? {...t, status:"Billed", invoiceNo:inv, billedBy:user.username, billedAt:nowTs()}
      : t));
    log("BILLED", `Invoice ${inv} — ${sel.length} trips, ${fmt(totalSel)}`);
    setSel([]); setInvNo("");
  };

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
            {l:"① Add Trip",    c:C.accent},
            {l:"→",            c:C.muted},
            {l:"② Select here",c:C.blue},
            {l:"→",            c:C.muted},
            {l:"③ Generate Invoice", c:C.blue},
            {l:"→",            c:C.muted},
            {l:"④ Shree Pays → record in Shree Payments", c:C.green},
          ].map((x,i) => x.l==="→"
            ? <span key={i} style={{color:C.muted,fontSize:14}}>→</span>
            : <div key={i} style={{background:x.c+"22",border:`1px solid ${x.c}44`,borderRadius:8,padding:"4px 9px",fontSize:11,fontWeight:700,color:x.c}}>{x.l}</div>
          )}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <KPI icon="⚠" label="Pending"  value={pending.length} color={C.accent} sub={fmt(pending.reduce((s,t)=>s+t.qty*t.frRate,0))} />
        <KPI icon="🧾" label="Billed"   value={billed.length}  color={C.blue}   sub={fmt(billed.reduce((s,t)=>s+t.qty*t.frRate,0))} />
        <KPI icon="✅" label="Paid"     value={paid.length}    color={C.green}  sub={fmt(paid.reduce((s,t)=>s+t.qty*t.frRate,0))} />
      </div>

      {/* Step 1 — Select trips */}
      {pending.length > 0 && (
        <div>
          <div style={{background:C.accent+"11",border:`1px solid ${C.accent}33`,borderRadius:10,padding:"9px 12px",color:C.accent,fontSize:12,fontWeight:700,marginBottom:10}}>
            ① Tick the trips you want to include in one invoice
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,alignItems:"center"}}>
            <span style={{color:C.muted,fontSize:12}}>Pending ({pending.length})</span>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setSel(pending.map(t=>t.id))} style={{background:"none",border:"none",color:C.blue,fontSize:12,cursor:"pointer",fontWeight:700}}>Select All</button>
              <button onClick={()=>setSel([])} style={{background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer"}}>Clear</button>
            </div>
          </div>
          {pending.map(t => (
            <div key={t.id} onClick={()=>tgl(t.id)}
              style={{background:sel.includes(t.id)?C.accent+"11":C.card,border:`1.5px solid ${sel.includes(t.id)?C.accent:C.border}`,borderRadius:14,padding:"12px 14px",cursor:"pointer",display:"flex",gap:12,marginBottom:8}}>
              <div style={{width:22,height:22,borderRadius:6,background:sel.includes(t.id)?C.accent:"transparent",border:`2px solid ${sel.includes(t.id)?C.accent:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,marginTop:2}}>{sel.includes(t.id)&&"✓"}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>{t.truckNo}</div>
                    <div style={{color:C.blue,fontSize:12}}>LR: {t.lrNo||"—"} · GR: {t.grNo||"—"}</div>
                    <div style={{color:C.muted,fontSize:11}}>{t.from}→{t.to} · {t.qty}MT · {t.date}</div>
                    <div style={{color:C.muted,fontSize:11}}>DI: {t.diNo||"—"} · {t.grade} · {t.bags} bags</div>
                    <div style={{color:ROLES[t.createdBy]?.color||C.muted,fontSize:11,marginTop:2}}>by {t.createdBy} · {t.createdAt}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{color:C.green,fontWeight:800,fontSize:15}}>{fmt(t.qty*t.frRate)}</div>
                    <div style={{color:C.muted,fontSize:10}}>{t.qty}MT × ₹{t.frRate}</div>
                    {t.shortage>0 && <Badge label={`⚠ ${t.shortage}MT short`} color={C.red} />}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 2 — Generate */}
      {sel.length > 0 && (
        <div style={{background:C.blue+"11",border:`1.5px solid ${C.blue}`,borderRadius:14,padding:"14px 16px"}}>
          <div style={{color:C.blue,fontWeight:800,marginBottom:12}}>② Generate Invoice — {sel.length} trip{sel.length>1?"s":""}</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,padding:"10px 12px",background:C.bg,borderRadius:10}}>
            <span style={{color:C.muted,fontSize:13}}>Invoice total</span>
            <span style={{color:C.green,fontWeight:900,fontSize:20}}>{fmt(totalSel)}</span>
          </div>
          <Field label="Invoice Number (leave blank to auto-generate)" value={invNo} onChange={setInvNo} placeholder="e.g. SMYE107026100302" />
          <div style={{marginTop:12}}><Btn onClick={bill} color={C.blue} full>🧾 Generate Invoice</Btn></div>
          <div style={{color:C.muted,fontSize:11,marginTop:8,textAlign:"center"}}>Status changes: Pending Bill → Billed</div>
        </div>
      )}

      {/* Billed invoices grouped */}
      {Object.keys(invoiceGroups).length > 0 && (
        <div>
          <div style={{color:C.blue,fontWeight:700,fontSize:13,marginBottom:8}}>Billed Invoices — Awaiting Shree Payment</div>
          {Object.entries(invoiceGroups).map(([inv, ts]) => (
            <div key={inv} style={{background:C.card,borderRadius:14,padding:"14px 16px",marginBottom:10,borderLeft:`4px solid ${C.blue}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{color:C.blue,fontWeight:800,fontSize:14}}>{inv}</div>
                  <div style={{color:C.muted,fontSize:12}}>{ts.length} trips · by {ts[0].billedBy||"—"}</div>
                  <div style={{color:C.muted,fontSize:11}}>{ts[0].billedAt||""}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:C.green,fontWeight:800,fontSize:16}}>{fmt(ts.reduce((s,t)=>s+t.qty*t.frRate,0))}</div>
                  <Badge label="Awaiting Payment" color={C.orange} />
                </div>
              </div>
              {ts.map(t => (
                <div key={t.id} style={{background:C.bg,borderRadius:8,padding:"8px 10px",marginBottom:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <span style={{fontWeight:700,fontSize:13}}>{t.truckNo}</span>
                    <span style={{color:C.muted,fontSize:11,marginLeft:8}}>LR:{t.lrNo||"—"} · {t.to} · {t.qty}MT</span>
                  </div>
                  <span style={{color:C.blue,fontWeight:700}}>{fmt(t.qty*t.frRate)}</span>
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
              <span style={{color:C.green,fontWeight:800}}>{fmt(t.qty*t.frRate)}</span>
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
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer?.files?.[0]);}}
        onDragOver={e=>e.preventDefault()}
        style={{border:`2px dashed ${state==="error"?C.red:C.blue}`,borderRadius:14,
          padding:"20px 16px",textAlign:"center",cursor:"pointer",background:C.bg,
          display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
        <div style={{fontSize:32}}>📷</div>
        <div style={{color:C.blue,fontWeight:800,fontSize:14}}>
          {state==="scanning" ? "🤖 Reading pump slip…" :
           state==="done"    ? "✓ Slip scanned — review below" :
           state==="reading" ? "📖 Loading image…" :
           "Upload Pump WhatsApp Slip"}
        </div>
        <div style={{color:C.muted,fontSize:12}}>
          {state==="idle"||state==="error" ? "Save image from WhatsApp → upload here" : "AI extracting truck numbers and amounts…"}
        </div>
        {error && <div style={{color:C.red,fontSize:12}}>{error}</div>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{display:"none"}}
        onChange={e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); e.target.value=""; }} />
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
    <>
      <input ref={inputRef} type="file" accept="image/*,application/pdf"
        style={{display:"none"}} onChange={e=>scan(e.target.files[0])} />
      <button onClick={()=>inputRef.current.click()} disabled={scanning}
        style={{background:scanning?"#333":C.purple||"#7c3aed",border:"none",borderRadius:8,
          color:"#fff",fontSize:12,fontWeight:700,padding:"8px 14px",cursor:"pointer",
          display:"flex",alignItems:"center",gap:6,opacity:scanning?0.7:1}}>
        {scanning ? "⏳ Reading…" : "📷 Scan Payment"}
      </button>
    </>
  );
}

// ─── SPLIT PAYMENT SHEET ──────────────────────────────────────────────────────
// Shown when a scanned payment contains multiple LR numbers
function SplitPaymentSheet({ scanData, trips, tripWithBalance, onSave, onCancel }) {
  const totalAmount = +(scanData.amount||0);
  const utr = scanData.referenceNo||"";
  const date = scanData.date||today();
  const paidTo = scanData.paidTo||"";

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

        {/* Shared date + paid to + notes */}
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:1}}>
            <div style={{color:C.muted,fontSize:11,marginBottom:3}}>DATE</div>
            <input type="date" value={sharedDate} onChange={e=>setSharedDate(e.target.value)}
              onClick={e=>e.target.showPicker?.()}
              style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,color:C.text,
                padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"dark",
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
        alert(`Indent No "${f.indentNo}" already exists in Diesel records (Truck: ${dupIndent.truckNo}, Date: ${dupIndent.date}).\nEach indent number must be unique.`);
        return;
      }
      const dupTrip = (trips||[]).find(t => t.dieselIndentNo && t.dieselIndentNo.trim() === f.indentNo.trim());
      if (dupTrip) {
        alert(`Indent No "${f.indentNo}" is already linked to Trip LR: ${dupTrip.lrNo||"—"} (Truck: ${dupTrip.truckNo}).\nEach indent number must be unique.`);
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
                  WebkitAppearance:"none", colorScheme:"dark", boxSizing:"border-box"}} />
            </div>
            <div style={{flex:1}}>
              <div style={{color:C.muted,fontSize:11,marginBottom:4}}>TO</div>
              <input type="date" value={filterTo} onChange={e=>setFilterTo(e.target.value)}
                onClick={e=>e.target.showPicker?.()}
                style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,
                  color:filterTo?C.text:C.muted, padding:"9px 10px",fontSize:14,width:"100%",
                  WebkitAppearance:"none", colorScheme:"dark", boxSizing:"border-box"}} />
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
                      padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"dark",WebkitAppearance:"none",boxSizing:"border-box"}} />
                </div>
                <div style={{flex:1}}>
                  <div style={{color:C.muted,fontSize:11,marginBottom:3}}>TO</div>
                  <input type="date" value={filterTo} onChange={e=>setFilterTo(e.target.value)}
                    onClick={e=>e.target.showPicker?.()}
                    style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,color:filterTo?C.text:C.muted,
                      padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"dark",WebkitAppearance:"none",boxSizing:"border-box"}} />
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
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#555",pointerEvents:"none"}}>🔍</span>
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
              <div style={{background:"#1a1000",border:`1px solid ${C.orange}44`,borderRadius:8,
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
              if(!f.truckNo.trim()){alert("Truck No is required");return;}
              if(!f.driverName.trim()){alert("Driver Name is mandatory");return;}
              const rawPhone = (f.driverPhone||"").replace(/\\D/g,"");
              if(!rawPhone){alert("Driver Phone is mandatory");return;}
              if(rawPhone.length!==10){alert(`Driver Phone must be 10 digits (entered ${rawPhone.length})`);return;}
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
                  if(!lAmt||+lAmt<=0){alert("Enter loan amount");return;}
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
                  if(!rAmt||+rAmt<=0){alert("Enter recovery amount");return;}
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
                  if(!shAmt||+shAmt<=0){alert("Enter shortage MT");return;}
                  if(!shTrip){alert("Link to an LR");return;}
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
function Employees({employees, setEmployees, user, log}) {
  const [sheet,setSheet]=useState(false); const [lSheet,setLSheet]=useState(null);
  const [lAmt,setLAmt]=useState(""); const [rAmt,setRAmt]=useState("");
  const blank={name:"",phone:"",role:"Fleet Agent",loan:"0",loanRecovered:"0",linkedTrucks:""};
  const [f,setF]=useState(blank); const ff=k=>v=>setF(p=>({...p,[k]:v}));
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
      {employees.map(e=>{const bal=e.loan-e.loanRecovered; return (
        <div key={e.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",borderLeft:`4px solid ${bal>0?C.red:C.green}`,marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <div><div style={{fontWeight:800,fontSize:15}}>{e.name}</div><div style={{color:C.muted,fontSize:12}}>{e.role} · {e.phone}</div></div>
            <Badge label={bal>0?"Loan Due":"Clear"} color={bal>0?C.red:C.green} />
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
            {[{l:"Loan",v:fmt(e.loan),c:C.red},{l:"Recovered",v:fmt(e.loanRecovered),c:C.green},{l:"Balance",v:fmt(bal),c:bal>0?C.accent:C.green}].map(x=>(
              <div key={x.l} style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}><div style={{color:x.c,fontWeight:700,fontSize:12}}>{x.v}</div><div style={{color:C.muted,fontSize:9}}>{x.l.toUpperCase()}</div></div>
            ))}
          </div>
          {e.linkedTrucks.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{e.linkedTrucks.map(t=><Badge key={t} label={t} color={C.blue} />)}</div>}
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>setLSheet(e.id)} sm outline color={C.purple}>Manage Loan</Btn>
            <Btn onClick={()=>window.open(`https://wa.me/91${e.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Dear ${e.name}, loan balance ${fmt(bal)}. - M.Yantra`)}`,"_blank")} sm outline color={C.teal}>📲</Btn>
          </div>
        </div>
      );})}
    </div>
  );
}


// ─── SHREE PAYMENTS & BILLING ──────────────────────────────────────────────────
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

  const shreeInvoices = useMemo(() => {
    const map = {};
    (trips||[]).filter(t=>t.billedToShree&&t.invoiceNo).forEach(t => {
      if(!map[t.invoiceNo]) map[t.invoiceNo] = {
        invoiceNo:t.invoiceNo, invoiceDate:t.invoiceDate, totalAmt:0, trips:[], status:"billed"
      };
      map[t.invoiceNo].trips.push(t);
      map[t.invoiceNo].totalAmt += Number(t.billedToShree||0);
      if(t.paymentDate) map[t.invoiceNo].status = "paid";
    });
    return Object.values(map).sort((a,b)=>(b.invoiceDate||"").localeCompare(a.invoiceDate||""));
  }, [trips]);

  const shreeTrips = (trips||[]).filter(t=>t.billedToShree)
    .sort((a,b)=>(b.date||"").localeCompare(a.date||""));

  const tripExps   = tid => ((expenses||{})[tid]||[]).reduce((s,e)=>s+Number(e.amount||0),0);
  const tripProfit = t => Number(t.paidAmount||t.billedToShree||0)
                        - (t.shreeShortage ? Number(t.shreeShortage.deduction||0) : 0)
                        - tripExps(t.id);

  const totalBilled   = shreeInvoices.reduce((s,i)=>s+i.totalAmt,0);
  const totalReceived = shreePayments.reduce((s,p)=>s+Number(p.totalPaid||0),0);
  const totalHold     = shreePayments.reduce((s,p)=>s+Number(p.holdAmount||0),0);
  const totalShortage = allShortages.reduce((s,sh)=>s+Number(sh.deduction||0),0);

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

  const applyInvoiceScan = () => {
    if(!scanResult || scanResult.type!=="invoice") return;
    const invNo = scanResult.invoiceNo;
    if((trips||[]).some(t=>t.invoiceNo===invNo)) {
      setScanError(`Invoice ${invNo} is already uploaded. Discard this scan.`); return;
    }
    const invDate = parseDD(scanResult.invoiceDate);
    const scTrips = scanResult.trips||[];
    setTrips(prev=>prev.map(t=>{
      const match=scTrips.find(st=>st.lrNo===t.lr&&Math.abs(Number(st.frtAmt||0)-Number(t.billedToShree||0))<2);
      if(match) return {...t, invoiceNo:invNo, invoiceDate:invDate, shreeStatus:"billed"};
      return t;
    }));
    log && log(`Invoice ${invNo} scanned — trips marked Billed`);
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
    setPayments(prev=>[...(prev||[]),pa]);

    // Save expenses
    if(exps.length>0&&setExpenses){
      exps.forEach(exp=>{
        const rec={id:"EXP"+Date.now()+Math.random().toString(36).slice(2,6),
          date:pDate||new Date().toISOString().slice(0,10),
          label:exp.description||exp.ref, amount:Number(exp.amount||0),
          category:exp.category||"other",
          notes:`UTR:${utr}`, createdBy:user?.name||"", createdAt:new Date().toISOString()};
        setExpenses(prev=>({...prev,shree:[...(prev?.shree||[]),rec]}));
      });
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

    log && log(`Payment advice UTR ${utr} applied — ${shorts.length} shortage(s), ${exps.length} expense(s)`);
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
    log && log(`Payment advice UTR ${utr} deleted by ${user?.name}`);
  };

  // shared UI
  const Pill = ({status,shortage}) => {
    const c={pending:{bg:"#2a2a2a",col:"#888",txt:"Pending"},
             billed:{bg:"#1a2a1a",col:"#4caf50",txt:"Billed"},
             paid:{bg:"#1a1a2e",col:"#5b8dee",txt:"Paid"}}[status]||{bg:"#2a2a2a",col:"#888",txt:"Pending"};
    return <span style={{display:"inline-flex",alignItems:"center",gap:3}}>
      <span style={{background:c.bg,color:c.col,border:`1px solid ${c.col}40`,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:700}}>{c.txt}</span>
      {shortage&&<span style={{background:"#2a1515",color:"#ff6b6b",border:"1px solid #ff6b6b40",borderRadius:4,padding:"2px 5px",fontSize:10,fontWeight:700}}>⚠SHORT</span>}
    </span>;
  };

  const SearchBar = ({value,onChange,placeholder}) => (
    <div style={{position:"relative",marginBottom:12}}>
      <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#555",pointerEvents:"none"}}>🔍</span>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:"100%",boxSizing:"border-box",background:"#161616",border:"1px solid #2a2a2a",
          borderRadius:8,padding:"9px 32px 9px 32px",color:"#ccc",fontSize:13,outline:"none"}}/>
      {value&&<button onClick={()=>onChange("")}
        style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
          background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:16,lineHeight:1}}>✕</button>}
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
      <div style={{background:"#111",borderBottom:"1px solid #222",padding:"14px 16px"}}>
        <div style={{fontSize:10,letterSpacing:3,color:"#555",marginBottom:2}}>M YANTRA ENTERPRISES</div>
        <div style={{fontSize:17,fontWeight:800,color:"#fff",marginBottom:12}}>💰 Shree Cement — Payments</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
          {[
            {label:"Total Billed",   val:`₹${fmtINR(totalBilled)}`,   col:"#5b8dee"},
            {label:"Total Received", val:`₹${fmtINR(totalReceived)}`, col:"#4caf50"},
            {label:"On Hold",        val:`₹${fmtINR(totalHold)}`,     col:"#ff9800"},
            {label:"Shortage Lost",  val:`₹${fmtINR(totalShortage)}`, col:"#ff6b6b"},
          ].map(m=>(
            <div key={m.label} style={{background:"#161616",borderRadius:6,padding:"8px 12px"}}>
              <div style={{fontSize:9,color:"#555",letterSpacing:1}}>{m.label}</div>
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
          <span style={{color:"#ff6b6b",fontWeight:700,fontSize:12}}>
            {allShortages.length} shortage{allShortages.length>1?"s":""} — ₹{fmtINR(totalShortage)} deducted
          </span>
          <button onClick={()=>setActiveTab("shortages")}
            style={{background:"#ff6b6b15",border:"1px solid #ff6b6b50",color:"#ff6b6b",
              padding:"2px 10px",borderRadius:4,cursor:"pointer",fontSize:11}}>View</button>
          <button onClick={()=>setShowAlert(false)}
            style={{marginLeft:"auto",background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:16}}>✕</button>
        </div>
      )}

      {/* tabs with badges */}
      <div style={{background:"#111",borderBottom:"1px solid #1e1e1e",
        display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
        {[
          {id:"overview",  label:"Overview",  badge:null},
          {id:"invoices",  label:"Invoices",  badge:shreeInvoices.length||null},
          {id:"payments",  label:"Advice",    badge:shreePayments.length||null},
          {id:"shortages", label:"Shortages", badge:allShortages.length||null},
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
                color:activeTab===t.id?"#5b8dee":"#666",borderRadius:10,
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
                {label:"Shree Trips",     val:shreeTrips.length,                                                               col:"#5b8dee"},
                {label:"Pending Billing", val:shreeTrips.filter(t=>!t.shreeStatus||t.shreeStatus==="pending").length,          col:"#ff9800"},
                {label:"Billed / Paid",   val:`${shreeTrips.filter(t=>t.shreeStatus==="billed").length} / ${shreeTrips.filter(t=>t.shreeStatus==="paid").length}`, col:"#4caf50"},
                {label:"Shortage Alerts", val:allShortages.length,                                                             col:"#ff6b6b"},
              ].map(c=>(
                <div key={c.label} style={{background:"#151515",border:"1px solid #222",borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:10,color:"#555",letterSpacing:1,marginBottom:4}}>{c.label}</div>
                  <div style={{fontSize:24,fontWeight:800,color:c.col}}>{c.val}</div>
                </div>
              ))}
            </div>

            {/* scan zone */}
            <div style={{background:"#111",border:"1px solid #222",borderRadius:8,padding:14,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:10}}>📤 Scan with AI</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[
                  {icon:"📄",label:"Upload Invoice PDF",      sub:"Extracts LR-wise FRT amounts → marks trips Billed",   type:"invoice"},
                  {icon:"💳",label:"Upload Payment Advice",   sub:"Marks trips Paid + saves electricity/penalty expenses",type:"payment"},
                ].map(btn=>(
                  <label key={btn.type} style={{border:"1.5px dashed #2a2a2a",borderRadius:8,
                    padding:"14px",cursor:"pointer",textAlign:"center",display:"block",background:"#0d0d0d"}}>
                    <input type="file" accept=".pdf,image/*" style={{display:"none"}}
                      onChange={e=>{if(e.target.files[0])handleScan(e.target.files[0],btn.type);e.target.value="";}}/>
                    <div style={{fontSize:24,marginBottom:4}}>{btn.icon}</div>
                    <div style={{color:"#ccc",fontWeight:600,fontSize:13}}>{btn.label}</div>
                    <div style={{fontSize:11,color:"#555",marginTop:3}}>{btn.sub}</div>
                  </label>
                ))}
              </div>

              {scanning&&(
                <div style={{marginTop:14,textAlign:"center",color:"#5b8dee",fontSize:13}}>
                  <span style={{display:"inline-block",animation:"spin 1s linear infinite",marginRight:6}}>⏳</span>
                  Scanning with AI…
                </div>
              )}
              {scanError&&(
                <div style={{marginTop:10,background:"#1a0808",border:"1px solid #ff6b6b40",borderRadius:6,
                  padding:"10px 12px",color:"#ff6b6b",fontSize:12,display:"flex",justifyContent:"space-between",gap:8}}>
                  <span>✕ {scanError}</span>
                  <button onClick={()=>{setScanError(null);setScanResult(null);}}
                    style={{background:"none",border:"none",color:"#ff6b6b",cursor:"pointer",flexShrink:0}}>Dismiss</button>
                </div>
              )}

              {scanResult&&!scanError&&(
                <div style={{marginTop:12,background:"#0d1a0d",border:"1px solid #2a4a2a",borderRadius:8,padding:12}}>
                  <div style={{fontWeight:700,color:"#4caf50",marginBottom:10,fontSize:13}}>
                    ✅ {scanResult.type==="invoice"?"Invoice":"Payment Advice"} scanned
                  </div>

                  {scanResult.type==="invoice"&&(
                    <>
                      <div style={{fontSize:12,color:"#888",marginBottom:10,display:"flex",gap:12,flexWrap:"wrap"}}>
                        <b style={{color:"#fff"}}>{scanResult.invoiceNo||"—"}</b>
                        <span>{scanResult.invoiceDate||"—"}</span>
                        <span style={{color:"#5b8dee",fontWeight:700}}>₹{fmtINR(scanResult.totalAmount)}</span>
                      </div>
                      {(scanResult.trips||[]).map((st,i)=>{
                        const match=(trips||[]).find(t=>t.lr===st.lrNo&&Math.abs(Number(t.billedToShree||0)-Number(st.frtAmt||0))<2);
                        return (
                          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                            padding:"6px 0",borderBottom:"1px solid #1a2a1a",fontSize:12}}>
                            <span style={{fontFamily:"monospace",color:"#aaa"}}>{st.lrNo}</span>
                            <span style={{fontFamily:"monospace"}}>₹{fmtINR(st.frtAmt)}</span>
                            <span>{match
                              ?<span style={{color:"#4caf50",fontSize:11}}>✓ matched</span>
                              :<span style={{color:"#ff6b6b",fontSize:11}}>✗ no match</span>}
                            </span>
                          </div>
                        );
                      })}
                      <div style={{display:"flex",gap:8,marginTop:12}}>
                        <button onClick={applyInvoiceScan}
                          style={{flex:1,background:"#4caf50",color:"#000",border:"none",borderRadius:6,
                            padding:"10px",fontWeight:700,cursor:"pointer",fontSize:13}}>✓ Apply — Mark Billed</button>
                        <button onClick={()=>setScanResult(null)}
                          style={{background:"#222",color:"#888",border:"1px solid #333",borderRadius:6,
                            padding:"10px 14px",cursor:"pointer",fontSize:12}}>Discard</button>
                      </div>
                    </>
                  )}

                  {scanResult.type==="payment"&&(
                    <>
                      <div style={{fontSize:12,color:"#888",marginBottom:10,display:"flex",gap:12,flexWrap:"wrap"}}>
                        <span>UTR: <b style={{color:"#fff"}}>{scanResult.utr||"—"}</b></span>
                        <span>{scanResult.paymentDate||"—"}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,marginBottom:10}}>
                        {[
                          {l:"Net Paid",   v:scanResult.totalPaid,   c:"#4caf50"},
                          {l:"TDS",        v:scanResult.tdsDeducted, c:"#ff9800"},
                          {l:"Hold",       v:scanResult.holdAmount,  c:"#ff9800"},
                          {l:"Total Bill", v:scanResult.totalBilled, c:"#aaa"},
                        ].map(m=>(
                          <div key={m.l} style={{background:"#0d0d0d",borderRadius:4,padding:"6px 8px"}}>
                            <div style={{fontSize:9,color:"#555"}}>{m.l}</div>
                            <div style={{fontWeight:700,color:m.c,fontSize:13}}>₹{fmtINR(m.v)}</div>
                          </div>
                        ))}
                      </div>
                      {(scanResult.shortages||[]).length>0&&(
                        <div style={{background:"#1a0808",borderRadius:6,padding:"8px 10px",marginBottom:8}}>
                          <div style={{color:"#ff6b6b",fontWeight:700,fontSize:11,marginBottom:4}}>⚠ Shortages</div>
                          {(scanResult.shortages||[]).map((s,i)=>(
                            <div key={i} style={{fontSize:11,color:"#ff9999",padding:"2px 0"}}>
                              {s.lrNo} — {s.tonnes} TO — ₹{fmtINR(s.deduction)}
                            </div>
                          ))}
                        </div>
                      )}
                      {(scanResult.expenses||[]).length>0&&(
                        <div style={{background:"#1a1000",borderRadius:6,padding:"8px 10px",marginBottom:8}}>
                          <div style={{color:"#ff9800",fontWeight:700,fontSize:11,marginBottom:4}}>
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
                          style={{flex:1,background:"#5b8dee",color:"#000",border:"none",borderRadius:6,
                            padding:"10px",fontWeight:700,cursor:"pointer",fontSize:12}}>✓ Apply — Mark Paid</button>
                        <button onClick={()=>setScanResult(null)}
                          style={{background:"#222",color:"#888",border:"1px solid #333",borderRadius:6,
                            padding:"10px 14px",cursor:"pointer",fontSize:12}}>Discard</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* recent trips */}
            <div style={{background:"#111",border:"1px solid #222",borderRadius:8,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",borderBottom:"1px solid #1e1e1e",
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:700,fontSize:13}}>Recent Shree Trips</span>
                {shreeTrips.length>5&&(
                  <button onClick={()=>setActiveTab("invoices")}
                    style={{background:"none",border:"none",color:"#5b8dee",fontSize:12,cursor:"pointer"}}>
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
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#666"}}>
                      <span>{t.truck||t.truckNo} · {fmtDate(t.date)}</span>
                      <span style={{fontFamily:"monospace",color:"#5b8dee"}}>₹{fmtINR(t.billedToShree)}</span>
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
            <div style={{fontSize:11,color:"#555",marginBottom:10}}>
              {filteredInvoices.length} of {shreeInvoices.length} invoice{shreeInvoices.length!==1?"s":""}
              {searchInv&&` · "${searchInv}"`}
            </div>
            {filteredInvoices.length===0
              ? <EmptyState icon="🧾" text={searchInv?"No invoices match your search.":"No invoices yet. Upload an invoice PDF."}/>
              : filteredInvoices.map(inv=>{
                const isOpen = expandedInv===inv.invoiceNo;
                return (
                  <div key={inv.invoiceNo} style={{background:"#111",border:"1px solid #222",
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
                        <div style={{display:"flex",gap:10,fontSize:11,color:"#555",flexWrap:"wrap"}}>
                          <span>{fmtDate(inv.invoiceDate)}</span>
                          <span>{inv.trips.length} trip{inv.trips.length!==1?"s":""}</span>
                          <span style={{color:"#5b8dee",fontWeight:700}}>₹{fmtINR(inv.totalAmt)}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        {isOwner&&(
                          <button onClick={e=>{e.stopPropagation();deleteInvoice(inv.invoiceNo);}}
                            style={{background:"#1a0808",border:"1px solid #ff6b6b30",color:"#ff6b6b",
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
                              <span style={{fontFamily:"monospace",color:"#aaa"}}>{t.lr||t.lrNo}</span>
                              <span style={{fontFamily:"monospace",color:"#ccc",fontWeight:700}}>
                                ₹{fmtINR(t.billedToShree)}
                              </span>
                            </div>
                            <div style={{display:"flex",gap:10,fontSize:10,color:"#555",marginTop:2}}>
                              <span>{t.truck||t.truckNo}</span>
                              <span>{t.qty} MT</span>
                              {t.paymentDate&&<span style={{color:"#4caf50"}}>✓ Paid {fmtDate(t.paymentDate)}</span>}
                            </div>
                            {t.shreeShortage&&(
                              <div style={{fontSize:10,color:"#ff6b6b",marginTop:3}}>
                                ⚠ {t.shreeShortage.tonnes} TO short — ₹{fmtINR(t.shreeShortage.deduction)}
                              </div>
                            )}
                          </div>
                        ))}
                        <div style={{padding:"8px 14px",display:"flex",justifyContent:"space-between",
                          fontSize:11,background:"#0d0d0d",borderTop:"1px solid #1a1a1a"}}>
                          <span style={{color:"#555"}}>Invoice Total</span>
                          <span style={{fontFamily:"monospace",color:"#fff",fontWeight:700}}>₹{fmtINR(inv.totalAmt)}</span>
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
            <div style={{fontSize:11,color:"#555",marginBottom:10}}>
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
                  <div key={key} style={{background:"#111",border:"1px solid #222",
                    borderRadius:8,marginBottom:12,overflow:"hidden"}}>
                    <div onClick={()=>setExpandedAdv(isOpen?null:key)}
                      style={{padding:"12px 14px",cursor:"pointer",
                        display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                          <span style={{fontFamily:"monospace",color:"#5b8dee",fontSize:13,fontWeight:700}}>
                            UTR: {p.utr}
                          </span>
                          {(p.shortages||[]).length>0&&(
                            <span style={{background:"#2a1515",color:"#ff6b6b",border:"1px solid #ff6b6b30",
                              borderRadius:4,padding:"1px 6px",fontSize:10}}>
                              ⚠ {p.shortages.length} shortage{p.shortages.length>1?"s":""}
                            </span>
                          )}
                        </div>
                        <div style={{display:"flex",gap:10,fontSize:11,color:"#555",flexWrap:"wrap"}}>
                          <span>{fmtDate(p.paymentDate||p.date)}</span>
                          <span style={{color:"#4caf50",fontWeight:700}}>₹{fmtINR(p.totalPaid||p.paid)}</span>
                          <span>{frtInvoices.length} invoice{frtInvoices.length!==1?"s":""}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        {isOwner&&(
                          <button onClick={e=>{e.stopPropagation();deleteAdvice(p.utr,p.id);}}
                            style={{background:"#1a0808",border:"1px solid #ff6b6b30",color:"#ff6b6b",
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
                            {l:"Net Paid",      v:p.totalPaid||p.paid,        c:"#4caf50"},
                            {l:"TDS Deducted",  v:p.tdsDeducted||p.tds,      c:"#ff9800"},
                            {l:"On Hold",       v:p.holdAmount||p.gstHold,    c:"#ff9800"},
                          ].map((m,i)=>(
                            <div key={m.l} style={{padding:"10px 14px",background:"#0d0d0d",
                              borderRight:i%2===0?"1px solid #1a1a1a":"none",
                              borderBottom:i<2?"1px solid #1a1a1a":"none"}}>
                              <div style={{fontSize:9,color:"#555",letterSpacing:1}}>{m.l}</div>
                              <div style={{fontWeight:800,color:m.c,fontSize:14}}>₹{fmtINR(m.v)}</div>
                            </div>
                          ))}
                        </div>
                        {/* invoices */}
                        {frtInvoices.length>0&&(
                          <>
                            <div style={{padding:"6px 14px",fontSize:10,fontWeight:700,color:"#555",
                              letterSpacing:1,background:"#0d0d0d",borderTop:"1px solid #1a1a1a"}}>INVOICES</div>
                            {frtInvoices.map((inv,i)=>(
                              <div key={i} style={{padding:"8px 14px",borderTop:"1px solid #161616",
                                display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}>
                                <span style={{fontFamily:"monospace",color:"#aaa"}}>{inv.invoiceNo}</span>
                                <div style={{textAlign:"right"}}>
                                  <div style={{color:"#4caf50",fontWeight:700}}>₹{fmtINR(inv.paymentAmt)}</div>
                                  {inv.tds>0&&<div style={{fontSize:10,color:"#ff9800"}}>TDS ₹{fmtINR(inv.tds)}</div>}
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                        {/* shortages */}
                        {(p.shortages||[]).length>0&&(
                          <>
                            <div style={{padding:"6px 14px",fontSize:10,fontWeight:700,color:"#ff6b6b",
                              letterSpacing:1,background:"#140808",borderTop:"1px solid #2a1212"}}>⚠ SHORTAGES</div>
                            {(p.shortages||[]).map((s,i)=>(
                              <div key={i} style={{padding:"8px 14px",borderTop:"1px solid #1a0a0a",
                                background:"#120808",display:"flex",justifyContent:"space-between",fontSize:12}}>
                                <div>
                                  <div style={{fontFamily:"monospace",color:"#ffaaaa"}}>{s.lrNo||s.lr}</div>
                                  <div style={{fontSize:10,color:"#883333"}}>{s.tonnes} TO · {s.ref}</div>
                                </div>
                                <span style={{color:"#ff6b6b",fontWeight:700,fontFamily:"monospace"}}>
                                  ₹{fmtINR(s.deduction)}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                        {/* expenses / debit notes */}
                        {allExpenses.length>0&&(
                          <>
                            <div style={{padding:"6px 14px",fontSize:10,fontWeight:700,color:"#ff9800",
                              letterSpacing:1,background:"#130f00",borderTop:"1px solid #2a2000"}}>📋 DEBIT NOTES / EXPENSES</div>
                            {allExpenses.map((e,i)=>(
                              <div key={i} style={{padding:"8px 14px",borderTop:"1px solid #1a1500",
                                background:"#110e00",display:"flex",justifyContent:"space-between",
                                alignItems:"center",fontSize:12}}>
                                <div>
                                  <div style={{color:"#ffcc88"}}>{e.description||e.ref}</div>
                                  {e.ref&&<div style={{fontSize:10,color:"#665500"}}>{e.ref}</div>}
                                </div>
                                <span style={{color:"#ff9800",fontWeight:700,fontFamily:"monospace"}}>
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
                {l:"Count",    v:allShortages.length,                                                         c:"#ff6b6b"},
                {l:"Deducted", v:`₹${fmtINR(totalShortage)}`,                                                c:"#ff6b6b"},
                {l:"Tonnes",   v:`${allShortages.reduce((s,sh)=>s+Number(sh.tonnes||0),0).toFixed(2)} TO`,   c:"#ff9999"},
              ].map(m=>(
                <div key={m.l}>
                  <div style={{fontSize:9,color:"#883333",letterSpacing:1,marginBottom:3}}>{m.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:m.c}}>{m.v}</div>
                </div>
              ))}
            </div>

            <SearchBar value={searchShort} onChange={setSearchShort} placeholder="Search LR, ref, UTR…"/>
            <div style={{fontSize:11,color:"#555",marginBottom:10}}>
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
                    <span style={{color:"#ff6b6b",fontWeight:800,fontFamily:"monospace",fontSize:14}}>
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
                      <span style={{color:"#4caf50"}}>✓ Linked · {linkedTrip.truckNo||linkedTrip.truck} · {linkedTrip.to}</span>
                      {linkedVeh&&<span style={{color:"#888"}}>Balance: ₹{fmtINR((linkedVeh.shortageOwed||0)-(linkedVeh.shortageRecovered||0))}</span>}
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
        {activeTab==="profit"&&(
          <div>
            {shreeTrips.length>0&&(
              <div style={{background:"#0d1a0d",border:"1px solid #1a3a1a",borderRadius:8,
                padding:"12px 14px",marginBottom:14,
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:10,color:"#2a6a2a",letterSpacing:1,marginBottom:2}}>TOTAL PROFIT</div>
                  <div style={{fontSize:22,fontWeight:800,color:"#4caf50"}}>
                    ₹{fmtINR(shreeTrips.reduce((s,t)=>s+tripProfit(t),0))}
                  </div>
                </div>
                <div style={{textAlign:"right",fontSize:11,color:"#555"}}>
                  <div>{shreeTrips.filter(t=>t.shreeStatus==="paid").length} paid trips</div>
                  <div>{shreeTrips.filter(t=>t.shreeShortage).length} with shortages</div>
                </div>
              </div>
            )}

            <div style={{background:"#111",border:"1px solid #222",borderRadius:8,padding:12,marginBottom:14}}>
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
                  style={{background:"#0d0d0d",border:"1px solid #333",borderRadius:6,
                    padding:"8px 10px",color:"#ccc",fontSize:13}}/>
                <div style={{display:"flex",gap:8}}>
                  <input value={newExp.amount} onChange={e=>setNewExp({...newExp,amount:e.target.value})}
                    type="number" placeholder="₹ Amount"
                    style={{flex:1,background:"#0d0d0d",border:"1px solid #333",borderRadius:6,
                      padding:"8px 10px",color:"#ccc",fontSize:13}}/>
                  <button onClick={()=>{
                    if(!newExp.tripId||!newExp.label||!newExp.amount) return;
                    setExpenses(prev=>({...prev,[newExp.tripId]:[...(prev[newExp.tripId]||[]),
                      {label:newExp.label,amount:Number(newExp.amount)}]}));
                    setNewExp({tripId:"",label:"",amount:""});
                  }} style={{background:"#5b8dee",color:"#000",border:"none",borderRadius:6,
                    padding:"8px 16px",fontWeight:700,cursor:"pointer",fontSize:13}}>Add</button>
                </div>
              </div>
            </div>

            <SearchBar value={searchTrip} onChange={setSearchTrip} placeholder="Search LR, truck…"/>
            <div style={{fontSize:11,color:"#555",marginBottom:10}}>
              {filteredTrips.length} of {shreeTrips.length} trip{shreeTrips.length!==1?"s":""}
            </div>

            {filteredTrips.length===0
              ? <EmptyState icon="📊" text={searchTrip?"No trips match your search.":"No Shree trips yet."}/>
              : filteredTrips.map(t=>{
                const profit=tripProfit(t);
                return (
                  <div key={t.id} style={{background:"#111",border:"1px solid #222",
                    borderRadius:8,padding:"11px 14px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div>
                        <span style={{fontFamily:"monospace",fontSize:12,color:"#ccc"}}>{t.lr||t.lrNo}</span>
                        <span style={{fontSize:11,color:"#555",marginLeft:8}}>{t.truck||t.truckNo}</span>
                      </div>
                      <span style={{fontWeight:800,fontSize:15,color:profit>=0?"#4caf50":"#ff6b6b"}}>
                        ₹{fmtINR(profit)}
                      </span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4,fontSize:11}}>
                      <div><span style={{color:"#555",display:"block"}}>Billed</span>
                        <span style={{color:"#ccc",fontFamily:"monospace"}}>₹{fmtINR(t.billedToShree)}</span></div>
                      <div><span style={{color:"#555",display:"block"}}>Shortage</span>
                        <span style={{color:t.shreeShortage?"#ff6b6b":"#444",fontFamily:"monospace"}}>
                          {t.shreeShortage?`₹${fmtINR(t.shreeShortage.deduction)}`:"—"}</span></div>
                      <div><span style={{color:"#555",display:"block"}}>Expenses</span>
                        <span style={{color:"#ccc",fontFamily:"monospace"}}>₹{fmtINR(tripExps(t.id))}</span></div>
                    </div>
                    {((expenses||{})[t.id]||[]).length>0&&(
                      <div style={{marginTop:6,fontSize:10,color:"#444"}}>
                        {((expenses||{})[t.id]||[]).map(e=>`${e.label}: ₹${fmtINR(e.amount)}`).join(" · ")}
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
function DriverPayments({trips, driverPays, setDriverPays, vehicles, user, log}) {
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

  const savePayment = (t) => {
    const p = {id:uid(), tripId:t.id, truckNo:t.truckNo, lrNo:t.lrNo,
      amount:+pf.amount, utr:pf.utr, date:pf.date, paidTo:pf.paidTo, notes:pf.notes,
      createdBy:user.username, createdAt:nowTs()};
    setDriverPays(prev=>[...(prev||[]),p]);
    log("DRIVER PAYMENT",`LR:${t.lrNo} ${t.truckNo} — ${fmt(+pf.amount)} UTR:${pf.utr}`);
    setPaySheet(null); setPf({amount:"",utr:"",date:today(),paidTo:"",notes:""});
  };

  const saveMultiPayment = async (payments) => {
    const withMeta = payments.map(p => ({...p, createdBy:user.username, createdAt:nowTs()}));
    setDriverPays(prev=>[...(prev||[]),...withMeta]);
    for (const p of withMeta) {
      log("DRIVER PAYMENT",`LR:${p.lrNo} ${p.truckNo} — ${fmt(p.amount)} UTR:${p.utr}`);
      await DB.saveDriverPay(p);
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
        <div>
          <input ref={scanInputRef} type="file" accept="image/*,application/pdf"
            style={{display:"none"}} onChange={e=>scanGlobal(e.target.files[0])} />
          <button onClick={()=>scanInputRef.current.click()} disabled={scanningGlobal}
            style={{background:scanningGlobal?"#333":C.purple||"#7c3aed",border:"none",borderRadius:8,
              color:"#fff",fontSize:12,fontWeight:700,padding:"8px 14px",cursor:"pointer",opacity:scanningGlobal?0.7:1}}>
            {scanningGlobal?"⏳ Reading…":"📷 Scan Payment"}
          </button>
        </div>
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
                    colorScheme:"dark",WebkitAppearance:"none",boxSizing:"border-box"}} />
              </div>
              <div style={{flex:1}}>
                <div style={{color:C.muted,fontSize:11,marginBottom:3}}>TO</div>
                <input type="date" value={histTo} onChange={e=>setHistTo(e.target.value)}
                  onClick={e=>e.target.showPicker?.()}
                  style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,
                    color:histTo?C.text:C.muted,padding:"8px 10px",fontSize:13,width:"100%",
                    colorScheme:"dark",WebkitAppearance:"none",boxSizing:"border-box"}} />
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
              <button onClick={exportHistoryPDF}
                style={{background:C.orange,border:"none",borderRadius:8,color:"#000",
                  fontSize:12,fontWeight:700,padding:"7px 14px",cursor:"pointer"}}>
                🖨 Export PDF
              </button>
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
  const [f, setF] = useState({date:today(),label:"",amount:"",category:"Office",notes:""});
  const ff = k => v => setF(p=>({...p,[k]:v}));

  const cats = ["Office","Shortage","Other Deduction","Diesel","Repairs","Salary","Government Fee","Other"];
  const totalExp = (expenses||[]).reduce((s,e)=>s+(e.amount||0),0);

  // Group by category
  const byCat = {};
  (expenses||[]).forEach(e=>{
    if(!byCat[e.category]) byCat[e.category]=0;
    byCat[e.category]+=e.amount||0;
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
        {(expenses||[]).map(e=>(
          <div key={e.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",borderLeft:`4px solid ${C.red}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontWeight:700,fontSize:13}}>{e.label}</div>
              <div style={{color:C.muted,fontSize:11}}>{e.date} · {e.category}</div>
              {e.notes&&<div style={{color:C.muted,fontSize:11}}>{e.notes}</div>}
              {e.createdBy&&<div style={{color:ROLES[e.createdBy]?.color||C.muted,fontSize:11}}>by {e.createdBy}</div>}
            </div>
            <div style={{color:C.red,fontWeight:800,fontSize:15}}>{fmt(e.amount)}</div>
          </div>
        ))}
        {(expenses||[]).length===0&&<div style={{textAlign:"center",color:C.muted,padding:32}}>No expenses recorded yet</div>}
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
            <div style={{color:C.muted,fontSize:12}}>Recording as: <b style={{color:ROLES[user.role]?.color}}>{user.name}</b></div>
            <Btn onClick={()=>{
              const e={...f,id:uid(),amount:+f.amount,createdBy:user.username,createdAt:nowTs()};
              setExpenses(prev=>[e,...(prev||[])]);
              log("EXPENSE",`${e.label} — ${fmt(e.amount)}`);
              setF({date:today(),label:"",amount:"",category:"Office",notes:""});
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
              padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"dark",boxSizing:"border-box"}} />
        </div>
        <div style={{flex:1,minWidth:120}}>
          <div style={{color:C.muted,fontSize:10,marginBottom:3,fontWeight:700}}>TO</div>
          <input type="date" value={dt} onChange={e=>{setDt(e.target.value);setMonthSel("");}}
            onClick={e=>e.target.showPicker?.()}
            style={{background:C.bg,border:"1.5px solid "+C.border,borderRadius:8,color:C.text,
              padding:"8px 10px",fontSize:13,width:"100%",colorScheme:"dark",boxSizing:"border-box"}} />
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
          {l:"🚚 Trip Report CSV",  c:C.blue,   fn:()=>exportCSV(cementFiltered.map(t=>({Date:t.date,LR:t.lrNo,DI:t.diNo,Truck:t.truckNo,To:t.to,State:getState(t),Grade:t.grade,MT:t.qty,OrderType:t.orderType||"godown",FR:t.frRate,Driver:t.givenRate,Margin:t.qty*(t.frRate-t.givenRate),Status:t.status,By:t.createdBy})),"cement_dispatch.csv")},
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

