import { useState, useEffect, useCallback, useRef } from "react";
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
      setData(result);
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
  // Bill to Shree = sum of qty × frRate (same frRate for all DIs under one LR)
  const billed = (t.qty||0) * (t.frRate||0);
  const tafal      = t.tafal || 0;
  const loanDeduct = vehicle ? (vehicle.deductPerTrip||0) : 0;
  const diesel     = confirmedDiesel != null ? confirmedDiesel : (t.dieselEstimate||0);
  const advance    = t.advance || 0;
  const shortage   = (t.shortage||0) * (t.givenRate||0);
  const net        = gross - advance - tafal - loanDeduct - diesel - shortage;
  return {gross, billed, tafal, loanDeduct, diesel, advance, shortage, net};
}

const mkTrip = (o) => ({
  id:uid(), type:"outbound", lrNo:"", diNo:"", truckNo:"", grNo:"",
  consignee:"", from:"", to:"", grade:"Cement Packed", qty:0, bags:0,
  frRate:0, givenRate:0, date:today(), advance:0, shortage:0, tafal:0,
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
          style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,padding:"13px 12px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box"}} />
    }
    {note && <div style={{color:C.muted,fontSize:11}}>{note}</div>}
  </div>
);

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
        <button onClick={onClose} style={{background:C.dim,border:"none",color:C.text,borderRadius:"50%",width:32,height:32,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
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
  const [indents,     setIndents,     rI, reloadIndents]     = useDB(DB.getIndents,     []);
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
function Dashboard({trips, vehicles, employees, indents, activity, settings, setTab, user}) {
  const pending     = trips.filter(t => t.status==="Pending Bill");
  const margin      = trips.reduce((s,t) => s + t.qty*(t.frRate-t.givenRate), 0);
  const vLoan       = vehicles.reduce((s,v) => s + Math.max(0, v.loan-v.loanRecovered), 0);
  const unpaidDiesel= indents.filter(i=>!i.paid).reduce((s,i) => s+(i.amount||0), 0);
  const tafalPool   = trips.reduce((s,t) => s+(t.tafal||0), 0);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{color:C.text,fontSize:18,fontWeight:800}}>Good day, {user.name.split(" ")[0]} 👋</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <KPI icon="⚠"  label="Pending Bills"   value={pending.length}   color={C.accent} sub={fmt(pending.reduce((s,t)=>s+t.qty*t.frRate,0))} />
        <KPI icon="📈" label="My Margin"        value={fmt(margin)}      color={C.green} />
        <KPI icon="🚚" label="Total Trips"      value={trips.length}     color={C.blue}  sub={`${trips.filter(t=>t.type==="outbound").length} out · ${trips.filter(t=>t.type==="inbound").length} in`} />
        <KPI icon="⛽" label="Diesel Pending"   value={fmt(unpaidDiesel)}color={C.orange}sub={`${indents.filter(i=>!i.paid).length} indents`} />
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
function AskLRSheet({ extracted, trips, onConfirm, onCancel }) {
  const [lrNo, setLrNo] = useState("");

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

      {!duplicateDI && (
        <Btn onClick={()=>onConfirm(lrNo)} full color={C.blue}
          disabled={!lrNo.trim() || !!diAlreadyInLR}>
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
function MergeDISheet({ conflict, onMerge, onSeparate, onCancel }) {
  const { extracted, existingTrip } = conflict;
  const [driverRate, setDriverRate] = useState("");

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

  // Bill to Shree = total qty × frRate
  const frRate    = existingTrip.frRate || 0;
  const totalBill = totalQty * frRate;

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
        <Field label="Driver Rate ₹/MT for this DI"
          value={driverRate} onChange={setDriverRate} type="number"
          placeholder="Enter rate for this DI" />
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

      <Btn onClick={()=>onMerge(driverRate)} full color={C.orange}
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
- For frRate, look for "freight", "rate", "F.Rate", "Fr.Rate" or similar — this is the per-MT rate Shree pays`;

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
        advance: "0", shortage: "0", dieselEstimate: "0",
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

// ─── TRIPS ────────────────────────────────────────────────────────────────────
function Trips({trips, setTrips, vehicles, indents, settings, tripType, user, log}) {
  const isIn = tripType === "inbound";
  const ac   = isIn ? C.teal : C.accent;

  const [addSheet,    setAddSheet]    = useState(false);
  const [editSheet,   setEditSheet]   = useState(null);
  const [filter,      setFilter]      = useState("All");
  const [search,      setSearch]      = useState("");
  const [diConflict,  setDiConflict]  = useState(null); // existing trip with same LR
  const [wasScanned,  setWasScanned]  = useState(false); // true if form was filled by AI scan
  const [confirmDel,  setConfirmDel]  = useState(null);  // trip pending delete confirmation

  const blankForm = () => ({
    type:tripType, lrNo:"", diNo:"", truckNo:"", grNo:"", dieselIndentNo:"",
    consignee: isIn ? "Shree Cement Ltd" : "",
    from: isIn ? "" : "Kodla", to: isIn ? "Kodla" : "",
    grade: isIn ? "Limestone" : "Cement Packed",
    qty:"", bags:"", frRate:"", givenRate:"",
    date:today(), advance:"0", shortage:"0",
    tafal: String(settings?.tafalPerTrip||300),
    dieselEstimate:"0",
  });

  const [f, setF] = useState(blankForm);
  const ff = k => v => setF(p => ({...p, [k]:v}));

  const list   = trips.filter(t => t.type===tripType);
  const slist  = search ? list.filter(t => (t.truckNo+t.lrNo+t.grNo+t.diNo+t.to+t.consignee).toLowerCase().includes(search.toLowerCase())) : list;
  const shown  = filter==="All" ? slist : slist.filter(t => t.status===filter);

  // When truck number changes, check if tafalExempt
  const onTruckChange = v => {
    const veh = vehicles.find(x => x.truckNo===v.toUpperCase().trim());
    setF(p => ({...p, truckNo:v, tafal: veh?.tafalExempt ? "0" : String(settings?.tafalPerTrip||300)}));
  };

  // Called when AI extracts fields from DI/GR copy
  // LR is always manual — so we show LR-ask screen first, then check for duplicates
  const onDIExtracted = (extracted, _ignored) => {
    // Always ask for LR number — it's never on the GR copy
    setDiConflict({ extracted, existingTrip: null, askLR: true, lrInput: "" });
  };

  // Called when user confirms LR number after scanning
  const onLRConfirmed = (lrNo) => {
    const { extracted } = diConflict;
    const existingTrip = lrNo.trim() ? trips.find(t => t.lrNo === lrNo.trim()) : null;
    if (existingTrip) {
      setDiConflict({ extracted: { ...extracted, lrNo }, existingTrip, askLR: false });
    } else {
      setF(p => ({ ...p, ...extracted, lrNo }));
      setWasScanned(true);
      setDiConflict(null);
    }
  };

  // Merge second DI into existing trip — driver rate entered per DI
  const addDIToExisting = (newDriverRate) => {
    const { extracted, existingTrip } = diConflict;
    const newQty  = +extracted.qty  || 0;
    const newBags = +extracted.bags || 0;
    const newRate = +newDriverRate  || 0;

    // Build diLines — migrate existing trip if needed
    const existingLines = existingTrip.diLines && existingTrip.diLines.length > 0
      ? existingTrip.diLines
      : [{ diNo: existingTrip.diNo, grNo: existingTrip.grNo,
           qty: existingTrip.qty, bags: existingTrip.bags, givenRate: existingTrip.givenRate }];

    const newLine = { diNo: extracted.diNo, grNo: extracted.grNo,
                      qty: newQty, bags: newBags, givenRate: newRate };
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
    // Validate: diesel indent no must be unique
    if (f.dieselIndentNo && trips.some(t => t.dieselIndentNo && t.dieselIndentNo === f.dieselIndentNo.trim())) {
      alert(`Diesel Indent No "${f.dieselIndentNo}" already exists on another trip. Each indent number must be unique.`);
      return;
    }
    const t = mkTrip({
      ...f, type:tripType,
      qty:+f.qty, bags:+f.bags, frRate:+f.frRate, givenRate:+f.givenRate,
      advance:+f.advance, shortage:+f.shortage, tafal:+f.tafal,
      dieselEstimate:+f.dieselEstimate,
      dieselIndentNo: (f.dieselIndentNo||"").trim(),
      createdBy:user.username, createdAt:nowTs(),
    });
    setTrips(p => [t, ...(p||[])]);
    log("ADD TRIP", `LR:${t.lrNo} ${t.truckNo}→${t.to} ${t.qty}MT`);
    setF(blankForm()); setAddSheet(false); setWasScanned(false);
  };

  const saveEdit = () => {
    // For multi-DI trips, recalculate gross givenRate from diLines
    const diLines = editSheet.diLines || [];
    const totalQty = diLines.length > 1 ? diLines.reduce((s,d)=>s+(d.qty||0),0) : +editSheet.qty;
    const totalGross = diLines.length > 1 ? diLines.reduce((s,d)=>s+(d.qty||0)*(d.givenRate||0),0) : 0;
    const blendedRate = diLines.length > 1 && totalQty > 0 ? totalGross/totalQty : +editSheet.givenRate;

    setTrips(p => p.map(t => t.id===editSheet.id ? {
      ...editSheet,
      qty:+editSheet.qty, bags:+editSheet.bags, frRate:+editSheet.frRate,
      givenRate: blendedRate,
      advance:+editSheet.advance,
      shortage:+editSheet.shortage, tafal:+editSheet.tafal,
      dieselEstimate:+editSheet.dieselEstimate,
      editedBy:user.username, editedAt:nowTs(),
    } : t));
    log("EDIT TRIP", `LR:${editSheet.lrNo} ${editSheet.truckNo}`);
    setEditSheet(null);
  };

  const deleteTrip = async (t) => {
    // Optimistic update immediately
    setTrips(p => p.filter(x => x.id !== t.id));
    setConfirmDel(null);
    log("DELETE TRIP", `LR:${t.lrNo} ${t.truckNo} ${t.qty}MT`);
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
        <Btn onClick={()=>{setF(blankForm());setAddSheet(true);}} color={ac} sm>+ Add Trip</Btn>
      </div>

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
                  <button onClick={()=>setEditSheet({...t})} style={{background:C.dim,border:"none",borderRadius:8,color:C.muted,padding:"5px 8px",cursor:"pointer",fontSize:14}}>✏</button>
                  {/* 🗑 DELETE (owner only) */}
                  {user.role==="owner" && (
                    <button onClick={()=>setConfirmDel(t)}
                      style={{background:C.red+"22",border:"none",borderRadius:8,color:C.red,padding:"5px 8px",cursor:"pointer",fontSize:14}}>🗑</button>
                  )}
                </div>
              </div>
            </div>

            {/* Stats strip */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderTop:`1px solid ${C.border}`,background:C.card2}}>
              {[
                {l:"MT",     v:t.qty,                          c:C.text},
                {l:"Billed", v:fmt(calc.billed||t.qty*t.frRate),c:C.blue},
                {l:"Owed",   v:fmt(calc.gross),                c:C.orange},
                {l:"Net Pay",v:fmt(calc.net),                  c:calc.net>=0?C.green:C.red},
              ].map(x => (
                <div key={x.l} style={{padding:"8px 0",textAlign:"center",borderRight:`1px solid ${C.border}`}}>
                  <div style={{color:x.c,fontWeight:700,fontSize:12}}>{x.v}</div>
                  <div style={{color:C.muted,fontSize:9}}>{x.l}</div>
                </div>
              ))}
            </div>

            {/* Footer badges */}
            <div style={{padding:"7px 12px",display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{color:ROLES[t.createdBy]?.color||C.muted,fontSize:11}}>by {t.createdBy} · {t.createdAt}</span>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {t.tafal>0     && <Badge label={`TAFAL ₹${t.tafal}`} color={C.purple} />}
                {t.shortage>0  && <Badge label={`⚠ ${t.shortage}MT`} color={C.red} />}
                {t.advance>0   && <Badge label={`Adv ${fmt(t.advance)}`} color={C.orange} />}
                {confirmedDiesel>0 && <Badge label={`⛽ ${fmt(confirmedDiesel)}`} color={C.orange} />}
                {t.driverSettled   && <Badge label="✓ Settled" color={C.green} />}
                {t.diLines && t.diLines.length > 1 && <Badge label={`${t.diLines.length} DIs`} color={C.teal} />}
              </div>
            </div>
          </div>
        );
      })}
      {shown.length===0 && <div style={{textAlign:"center",color:C.muted,padding:40}}>No trips found</div>}

      {/* ── ADD SHEET ── */}
      {addSheet && (
        <Sheet title={isIn?"New Raw Material Trip":"New Cement Trip"} onClose={()=>{setAddSheet(false);setF(blankForm());setDiConflict(null);setWasScanned(false);}}>

          {/* DI Conflict — same LR already exists */}
          {diConflict ? (
            diConflict.askLR ? (
              <AskLRSheet
                extracted={diConflict.extracted}
                trips={trips}
                onConfirm={onLRConfirmed}
                onCancel={()=>setDiConflict(null)}
              />
            ) : (
              <MergeDISheet
                conflict={diConflict}
                onMerge={addDIToExisting}
                onSeparate={()=>{setF(p=>({...p,...diConflict.extracted}));setDiConflict(null);}}
                onCancel={()=>setDiConflict(null)}
              />
            )
          ) : (
            <>
              <DIUploader onExtracted={onDIExtracted} trips={trips} settings={settings} isIn={isIn} />
              <TripForm f={f} ff={ff} isIn={isIn} ac={ac} vehicles={vehicles} settings={settings}
                onTruckChange={onTruckChange} onSubmit={saveNew} submitLabel="Save Trip"
                user={user} wasScanned={wasScanned} />
            </>
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
          <TripForm
            f={editSheet}
            ff={k=>v=>setEditSheet(p=>({...p,[k]:v}))}
            isIn={isIn} ac={C.blue} vehicles={vehicles} settings={settings}
            onTruckChange={v=>{const veh=vehicles.find(x=>x.truckNo===v.toUpperCase().trim()); setEditSheet(p=>({...p,truckNo:v,tafal:veh?.tafalExempt?0:(settings?.tafalPerTrip||300)}));}}
            onSubmit={saveEdit} submitLabel="Save Changes" user={user}
            showStatus={true}
            wasScanned={user.role !== "owner"}
          />
        </Sheet>
      )}
    </div>
  );
}

// Shared form for add + edit
function TripForm({f, ff, isIn, ac, vehicles, settings, onTruckChange, onSubmit, submitLabel, user, showStatus=false, wasScanned=false}) {
  const gross    = (+f.qty||0)*(+f.givenRate||0);
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

      {/* LR Number - highlighted */}
      <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",border:`1.5px solid ${C.blue}44`}}>
        <div style={{color:C.blue,fontWeight:700,fontSize:12,marginBottom:6}}>📄 LR NUMBER (Lorry Receipt)</div>
        {locked
          ? <LockedField value={f.lrNo} />
          : <Field value={f.lrNo||""} onChange={ff("lrNo")} placeholder="e.g. LR/MYE/001 — identifies this trip" />}
      </div>

      <div style={{display:"flex",gap:10}}>
        {locked
          ? <LockedField label="Truck No" value={f.truckNo} half />
          : <Field label="Truck No" value={f.truckNo||""} onChange={onTruckChange} placeholder="KA34C4617" half />}
        {locked
          ? <LockedField label="Date" value={f.date} half />
          : <Field label="Date" value={f.date||today()} onChange={ff("date")} type="date" half />}
      </div>
      {veh && <div style={{fontSize:12,color:C.muted,background:C.bg,borderRadius:8,padding:"8px 10px"}}>
        Owner: <b style={{color:C.text}}>{veh.ownerName}</b>
        {veh.tafalExempt && <span style={{color:C.red,marginLeft:8}}>⚠ TAFAL Exempt</span>}
      </div>}
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
                       : ["Cement Packed","Cement Bulk"].map(x=>({v:x,l:x}))} />}
      <div style={{display:"flex",gap:10}}>
        {locked
          ? <><LockedField label="Qty (MT)" value={f.qty} half /><LockedField label="Bags" value={f.bags} half /></>
          : <><Field label="Qty (MT)" value={f.qty||""} onChange={ff("qty")} type="number" half />
              <Field label="Bags"     value={f.bags||""} onChange={ff("bags")} type="number" half /></>}
      </div>
      {/* Rates — multi-DI: one editable row per DI */}
      {f.diLines && f.diLines.length > 1 ? (
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.border}`}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
            Rates per DI
          </div>
          {f.diLines.map((d,i) => (
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
            <span>Shree Rates: <b style={{color:C.blue}}>{f.diLines.map(d=>d.frRate||f.frRate||"—").join(" + ")}</b></span>
            <span>Driver Rates: <b style={{color:C.orange}}>{f.diLines.map(d=>d.givenRate||"—").join(" + ")}</b></span>
          </div>
        </div>
      ) : (
        <div style={{display:"flex",gap:10}}>
          {locked
            ? <LockedField label="Shree Rate ₹/MT" value={f.frRate} half />
            : <Field label="Shree Rate ₹/MT"  value={f.frRate||""}    onChange={ff("frRate")}    type="number" half />}
          <Field label="Driver Rate ₹/MT" value={f.givenRate||""} onChange={ff("givenRate")} type="number" half />
        </div>
      )}
      <div style={{display:"flex",gap:10}}>
        <Field label="Advance ₹"   value={f.advance||""}  onChange={ff("advance")}  type="number" half />
        <Field label="Shortage MT" value={f.shortage||""} onChange={ff("shortage")} type="number" half />
      </div>
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
      {f.qty && f.frRate && f.givenRate && (
        <div style={{background:C.bg,borderRadius:12,padding:"12px 14px"}}>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Calculation Preview</div>
          {[
            {l:"Billed to Shree",        v:fmt((+f.qty)*(+f.frRate)),              c:C.blue},
            {l:"Gross to Driver",         v:fmt(gross),                             c:C.orange},
            {l:"(−) Advance",             v:fmt(+f.advance||0),                    c:C.red},
            {l:"(−) TAFAL",               v:fmt(tafalAmt),                          c:C.purple},
            {l:"(−) Diesel (estimate)",   v:fmt(+f.dieselEstimate||0),             c:C.orange},
            {l:"My Margin",               v:fmt((+f.qty)*((+f.frRate)-(+f.givenRate))), c:C.green},
            {l:"Est. Net to Driver",      v:fmt(net),                               c:net>=0?C.green:C.red},
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
    if (v && calc.loanDeduct>0) setVehicles(p => p.map(x => x.truckNo===t.truckNo ? {...x, loanRecovered:(x.loanRecovered||0)+calc.loanDeduct} : x));
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
                {l:"Gross Pay (Qty × Driver Rate)", v:calc.gross,     c:C.green,  s:""},
                {l:"(−) Advance Given",             v:calc.advance,   c:C.red,    s:"−"},
                {l:"(−) TAFAL",                     v:calc.tafal,     c:C.purple, s:"−"},
                {l:"(−) Loan Deduction / Trip",     v:calc.loanDeduct,c:C.red,    s:"−"},
                {l:`(−) Diesel ${usingConfirmed?"(confirmed indents)":"(estimate)"}`, v:calc.diesel, c:C.orange, s:"−"},
                {l:"(−) Shortage Recovery",         v:calc.shortage,  c:calc.shortage>0?C.red:C.muted, s:"−"},
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
function DieselAlertBanner({ alerts, trips, user, onLink, onDismiss }) {
  const [expandedId, setExpandedId] = useState(null);
  const [linkTripId,  setLinkTripId]  = useState("");
  const [dismissReason, setDismissReason] = useState("");

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
        <div style={{color:C.red,fontWeight:800,fontSize:14,marginBottom:2}}>
          🚨 {alerts.length} Diesel Alert{alerts.length>1?"s":""} Require Action
        </div>
        <div style={{color:C.muted,fontSize:12}}>
          Tap each alert to link to a trip or dismiss with reason
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
              <div style={{color:C.muted,fontSize:12}}>{expandedId===alert.id?"▲":"▼"}</div>
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

              {/* Link to trip */}
              <div style={{background:C.bg,borderRadius:8,padding:"10px 12px"}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:6}}>
                  LINK TO A TRIP (clears alert)
                </div>
                <select value={linkTripId}
                  onChange={e=>setLinkTripId(e.target.value)}
                  style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,
                    color:C.text,padding:"8px 10px",fontSize:13,width:"100%",marginBottom:8}}>
                  <option value="">— Select trip —</option>
                  {trips.filter(t=>t.status!=="Paid").map(t=>(
                    <option key={t.id} value={t.id}>
                      {t.truckNo} · LR {t.lrNo||"—"} → {t.to} · {t.date}
                    </option>
                  ))}
                </select>
                <Btn onClick={()=>{if(linkTripId){onLink(alert.id,linkTripId);setExpandedId(null);setLinkTripId("");}}}
                  full color={C.green} sm disabled={!linkTripId}>
                  ✓ Link to Selected Trip
                </Btn>
              </div>

              {/* Owner dismiss with reason */}
              {user.role==="owner" && (
                <div style={{background:C.bg,borderRadius:8,padding:"10px 12px"}}>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:6}}>
                    DISMISS WITH REASON (owner only)
                  </div>
                  <input value={dismissReason} onChange={e=>setDismissReason(e.target.value)}
                    placeholder="e.g. Loading delayed, trip entered next day"
                    style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,
                      color:C.text,padding:"8px 10px",fontSize:13,width:"100%",
                      boxSizing:"border-box",marginBottom:8,outline:"none"}} />
                  <Btn onClick={()=>{if(dismissReason.trim()){onDismiss(alert.id,dismissReason);setExpandedId(null);setDismissReason("");}}}
                    full outline color={C.muted} sm disabled={!dismissReason.trim()}>
                    Dismiss Alert
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
      const results = entries.map(e => {
        const truck  = (e.truckNo||"").toUpperCase().trim();
        const indent = String(e.indentNo||"").trim();

        // Priority 1: match by dieselIndentNo on trip
        let trip = indent ? trips.find(t =>
          String(t.dieselIndentNo||"").trim() === indent && t.status !== "Paid"
        ) : null;

        // Priority 2: fallback to truck number
        if (!trip) trip = trips.find(t => t.truckNo === truck && t.status !== "Paid");

        // Detect truck mismatch (indent matched but truck is different)
        const truckMismatch = trip && truck && trip.truckNo !== truck;

        const hsd      = +(e.hsd||e.amount)||0;
        const advance  = +(e.advance)||0;
        const pumpTotal = hsd + advance;
        const estDiesel = trip ? +(trip.dieselEstimate||0) : 0;
        const amountMismatch = trip && !truckMismatch && pumpTotal !== estDiesel;

        return {
          truckNo: truck,
          indentNo: indent,
          date: e.date||today(),
          amount: hsd,
          advance: advance,
          pumpTotal,
          estDiesel,
          amountMismatch,
          trip: trip||null,
          truckMismatch,
          matchedBy: trip ? (indent && String(trip.dieselIndentNo||"").trim()===indent ? "indent" : "truck") : null,
          pumpId: pumps[0]?.id||"",
          include: !!trip && !truckMismatch,
        };
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

// ─── DIESEL MODULE ────────────────────────────────────────────────────────────
function DieselMod({trips, indents, setIndents, pumps, setPumps, user, log}) {
  const [view,      setView]      = useState("unpaid");
  const [addSheet,  setAddSheet]  = useState(false);
  const [pumpSheet, setPumpSheet] = useState(false);
  const [paySheet,  setPaySheet]  = useState(null);
  const [payRef,    setPayRef]    = useState("");
  const [scanSheet, setScanSheet] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [confirmFlow, setConfirmFlow] = useState(null); // indent being confirmed

  const blankI = {pumpId:pumps[0]?.id||"", truckNo:"", tripId:"", indentNo:"", date:today(), litres:"", ratePerLitre:"", amount:"", confirmed:false};
  const [f, setF] = useState(blankI);
  const ff = k => v => {
    const next = {...f, [k]:v};
    if (k==="litres"||k==="ratePerLitre") next.amount = String((+(next.litres)||0) * (+(next.ratePerLitre)||0));
    setF(next);
  };

  const blankP = {name:"", contact:"", address:"", accountNo:"", ifsc:""};
  const [pf, setPf] = useState(blankP);

  const unpaid   = indents.filter(i => !i.paid);
  const paid     = indents.filter(i => i.paid);
  const unpaidAmt= unpaid.reduce((s,i)=>s+(i.amount||0),0);
  // Indents with no matching trip — flagged for owner
  const unmatchedIndents = indents.filter(i => i.unmatched);
  // Red alerts = unmatched + truck mismatch, not yet dismissed
  const redAlerts = indents.filter(i => (i.unmatched || i.truckMismatch || i.amountMismatch) && !i.alertDismissed);

  const linkAlertToTrip = async (alertId, tripId) => {
    const trip = trips.find(t => t.id === tripId);
    if (!trip) return;
    const updated = indents.map(i => i.id===alertId
      ? {...i, tripId, truckNo: trip.truckNo, unmatched:false, truckMismatch:false, alertDismissed:false}
      : i);
    setIndents(updated);
    await DB.saveIndent(updated.find(i=>i.id===alertId));
    log("ALERT LINKED", `Indent ${alertId} linked to LR ${trip.lrNo}`);
  };

  const dismissAlert = async (alertId, reason) => {
    const updated = indents.map(i => i.id===alertId
      ? {...i, alertDismissed:true, dismissReason:reason, dismissedBy:user.username, dismissedAt:nowTs()}
      : i);
    setIndents(updated);
    await DB.saveIndent(updated.find(i=>i.id===alertId));
    log("ALERT DISMISSED", `Indent ${alertId} dismissed: ${reason}`);
  };

  // Group unpaid by pump for 15-day view
  const pumpTotals = pumps.map(p => ({
    ...p,
    unpaid: indents.filter(i=>i.pumpId===p.id&&!i.paid),
    unpaidAmt: indents.filter(i=>i.pumpId===p.id&&!i.paid).reduce((s,i)=>s+(i.amount||0),0),
  }));

  const confirmScanned = async () => {
    const toSave = scanResults.filter(r => r.include && r.trip);

    // Save confirmed diesel indents (matched)
    const newIndents = toSave.map(r => ({
      id: uid(), pumpId: r.pumpId||pumps[0]?.id||"",
      truckNo: r.truckNo, tripId: r.trip.id,
      indentNo: r.indentNo||"", date: r.date||today(),
      litres: 0, ratePerLitre: 0, amount: +r.amount||0,
      confirmed: true, paid: false, unmatched: false,
      createdBy: user.username, createdAt: nowTs(),
    }));

    // Save unmatched + truck mismatch indents as red alerts
    const problematic = scanResults.filter(r => !r.trip || r.truckMismatch || r.amountMismatch);
    const unmatchedIndents = problematic.map(r => ({
      id: uid(), pumpId: r.pumpId||pumps[0]?.id||"",
      truckNo: r.truckNo, tripId: r.trip?.id||"",
      indentNo: r.indentNo||"", date: r.date||today(),
      litres: 0, ratePerLitre: 0, amount: +r.amount||0,
      confirmed: false, paid: false,
      unmatched: !r.trip,
      truckMismatch: !!r.truckMismatch,
      amountMismatch: !!r.amountMismatch,
      pumpTotal: r.pumpTotal||0,
      estDiesel: r.estDiesel||0,
      alertDismissed: false,
      createdBy: user.username, createdAt: nowTs(),
    }));

    const allNew = [...newIndents, ...unmatchedIndents];
    setIndents(p => [...allNew, ...(p||[])]);
    for (const ind of allNew) await DB.saveIndent(ind);

    // Add pump advance to trip advance for entries that have advance > 0
    const tripsToUpdate = toSave.filter(r => r.advance > 0);
    if (tripsToUpdate.length > 0) {
      const updatedTrips = trips.map(t => {
        const match = tripsToUpdate.find(r => r.trip.id === t.id);
        if (!match) return t;
        const updated = {...t, advance: (t.advance||0) + match.advance, editedBy: user.username, editedAt: nowTs()};
        DB.saveTrip(updated);
        log("PUMP ADVANCE", `${match.truckNo} +₹${match.advance} added to trip advance`);
        return updated;
      });
      setTrips(updatedTrips);
    }

    for (const r of toSave) {
      log("DIESEL SCAN CONFIRM", `${r.truckNo} · HSD ₹${r.amount}${r.advance>0?` + Adv ₹${r.advance}`:""}`);
    }
    setScanResults(null); setScanSheet(false);
  };

  const saveIndent = () => {
    const ind = {...f, id:uid(), amount:+f.amount, litres:+f.litres, ratePerLitre:+f.ratePerLitre, paid:false, createdBy:user.username, createdAt:nowTs()};
    setIndents(p => [ind, ...(p||[])]);
    // update trip's dieselEstimate if linked
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

  const markPaid = () => {
    setIndents(p => p.map(i => i.id===paySheet.id ? {...i, paid:true, paidDate:today(), paidRef:payRef} : i));
    log("DIESEL PAID", `Indent ${paySheet.indentNo} · ${fmt(paySheet.amount)} · Ref: ${payRef}`);
    setPaySheet(null); setPayRef("");
  };

  // pay all unpaid for a pump at once
  const markPumpPaid = (pumpId, ref) => {
    setIndents(p => p.map(i => i.pumpId===pumpId&&!i.paid ? {...i, paid:true, paidDate:today(), paidRef:ref} : i));
    log("DIESEL PUMP PAID", `Pump ${pumps.find(p=>p.id===pumpId)?.name} — all cleared, Ref: ${ref}`);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:C.orange,fontWeight:800,fontSize:16}}>⛽ Diesel & Pump</div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>setScanSheet(true)} sm outline color={C.blue}>📷 Scan Slip</Btn>
          <Btn onClick={()=>{setF(blankI);setAddSheet(true);}} sm color={C.orange}>+ Add Indent</Btn>
        </div>
      </div>

      {/* Red alerts — unmatched + truck mismatch — visible to all */}
      {redAlerts.length > 0 && (
        <DieselAlertBanner
          alerts={redAlerts} trips={trips} user={user}
          onLink={(alertId, tripId) => linkAlertToTrip(alertId, tripId)}
          onDismiss={(alertId, reason) => dismissAlert(alertId, reason)}
        />
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <KPI icon="⚠" label="Unpaid to Pumps" value={fmt(unpaidAmt)} color={C.red} sub={`${unpaid.length} indents`} />
        <KPI icon="✅" label="Paid to Pumps"   value={fmt(paid.reduce((s,i)=>s+(i.amount||0),0))} color={C.green} />
      </div>

      <PillBar items={[
        {id:"unpaid",  label:`Unpaid (${unpaid.length})`,   color:C.red},
        {id:"pump",    label:"By Pump",                     color:C.blue},
        {id:"paid",    label:`Paid (${paid.length})`,       color:C.green},
      ]} active={view} onSelect={setView} />

      {/* ── UNPAID INDENTS ── */}
      {view==="unpaid" && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {unpaid.map(i => {
            const pump = pumps.find(p=>p.id===i.pumpId);
            const trip = trips.find(t=>t.id===i.tripId);
            return (
              <div key={i.id} style={{background:C.card,borderRadius:14,padding:"13px 14px",borderLeft:`4px solid ${i.confirmed?C.orange:C.red}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:700}}>{i.truckNo} <span style={{color:C.muted,fontWeight:400,fontSize:12}}>Indent: {i.indentNo}</span></div>
                    <div style={{color:C.muted,fontSize:12}}>{i.date} · {i.litres}L @ ₹{i.ratePerLitre}/L</div>
                    {pump && <div style={{color:C.blue,fontSize:12}}>{pump.name}</div>}
                    {trip && <div style={{color:C.muted,fontSize:11}}>Trip: LR {trip.lrNo||"—"} → {trip.to}</div>}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{color:C.red,fontWeight:800,fontSize:16}}>{fmt(i.amount)}</div>
                    {i.confirmed ? <Badge label="Confirmed" color={C.green} /> : <Badge label="Estimate" color={C.orange} />}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {!i.confirmed && (
                    <Btn onClick={()=>setConfirmFlow(i)} sm outline color={C.green}>✓ Confirm Amount</Btn>
                  )}
                  <Btn onClick={()=>{setPaySheet(i);setPayRef("");}} sm color={C.green}>Mark Paid</Btn>
                </div>
              </div>
            );
          })}
          {unpaid.length===0 && <div style={{textAlign:"center",color:C.muted,padding:40}}>No unpaid indents ✓</div>}
        </div>
      )}

      {/* ── BY PUMP (15-DAY VIEW) ── */}
      {view==="pump" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <Btn onClick={()=>setPumpSheet(true)} sm outline color={C.blue}>+ Add Pump</Btn>
          </div>
          {pumpTotals.map(p => (
            <PumpRow key={p.id} p={p} paid={paid} onPayAll={markPumpPaid} />
          ))}
          {pumps.length===0 && <div style={{textAlign:"center",color:C.muted,padding:32}}>No pumps added yet</div>}
        </div>
      )}

      {/* ── PAID ── */}
      {view==="paid" && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {paid.map(i => {
            const pump = pumps.find(p=>p.id===i.pumpId);
            return (
              <div key={i.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",borderLeft:`4px solid ${C.green}`,display:"flex",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontWeight:700}}>{i.truckNo} · {i.indentNo}</div>
                  <div style={{color:C.muted,fontSize:12}}>{i.date} · {i.litres}L · {pump?.name||"—"}</div>
                  <div style={{color:C.green,fontSize:11}}>Paid {i.paidDate} · Ref: {i.paidRef||"—"}</div>
                </div>
                <div style={{color:C.green,fontWeight:800}}>{fmt(i.amount)}</div>
              </div>
            );
          })}
          {paid.length===0 && <div style={{textAlign:"center",color:C.muted,padding:40}}>No paid indents yet</div>}
        </div>
      )}

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
        <Sheet title="📷 Scan Pump Slip" onClose={()=>{setScanSheet(false);setScanResults(null);}}>
          <PumpSlipScanner
            pumps={pumps} trips={trips} user={user}
            onResults={results => setScanResults(results)}
          />
          {scanResults && (
            <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{color:C.text,fontWeight:800,fontSize:14,marginBottom:4}}>
                Review Extracted Entries
              </div>
              {scanResults.map((r,i) => (
                <div key={i} style={{background:C.bg,borderRadius:10,padding:"12px 14px",
                  border:`1.5px solid ${!r.trip||r.truckMismatch ? C.red+"44" : r.amountMismatch ? C.red+"44" : C.green+"44"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14}}>{r.truckNo||"?"}</div>
                      {r.indentNo && <div style={{color:C.muted,fontSize:12}}>Indent: {r.indentNo} · {r.date}</div>}
                      {r.trip && !r.truckMismatch && !r.amountMismatch &&
                        <div style={{color:C.green,fontSize:12}}>
                          ✓ {r.matchedBy==="indent"?"Indent":"Truck"}: LR {r.trip.lrNo||"—"} · Est ₹{r.estDiesel} = HSD+Adv ₹{r.pumpTotal} ✓
                        </div>}
                      {r.trip && !r.truckMismatch && r.amountMismatch &&
                        <div style={{color:C.red,fontSize:12}}>
                          🚨 LR {r.trip.lrNo||"—"}: HSD ₹{r.amount} + Adv ₹{r.advance} = ₹{r.pumpTotal} ≠ Est ₹{r.estDiesel} (diff ₹{Math.abs(r.pumpTotal-r.estDiesel)})
                        </div>}
                      {r.truckMismatch &&
                        <div style={{color:C.red,fontSize:12}}>
                          🚨 Indent {r.indentNo} matched LR {r.trip.lrNo} but truck is {r.trip.truckNo} not {r.truckNo}
                        </div>}
                      {!r.trip &&
                        <div style={{color:C.red,fontSize:12}}>🚨 No trip found — unmatched indent</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                      <div style={{color:C.orange,fontWeight:800,fontSize:15}}>⛽ ₹{r.amount||"?"}</div>
                      {r.advance > 0 && <div style={{color:C.red,fontWeight:700,fontSize:13}}>+Adv ₹{r.advance}</div>}
                      <label style={{display:"flex",alignItems:"center",gap:6,marginTop:4,cursor:"pointer",justifyContent:"flex-end"}}>
                        <input type="checkbox" checked={r.include && !!r.trip}
                          disabled={!r.trip}
                          onChange={e => setScanResults(p => p.map((x,j)=>j===i?{...x,include:e.target.checked}:x))}
                          style={{width:16,height:16}} />
                        <span style={{color:C.muted,fontSize:12}}>{r.trip?"Include":"No trip"}</span>
                      </label>
                    </div>
                  </div>
                  {/* Pump selector */}
                  {pumps.length > 1 && (
                    <select value={r.pumpId||""} onChange={e=>setScanResults(p=>p.map((x,j)=>j===i?{...x,pumpId:e.target.value}:x))}
                      style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,
                        padding:"6px 10px",fontSize:12,width:"100%",marginTop:4}}>
                      {pumps.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                </div>
              ))}
              <div style={{color:C.muted,fontSize:12,textAlign:"center"}}>
                {scanResults.filter(r=>r.include&&r.trip).length} of {scanResults.length} will be saved ·
                Total HSD: ₹{scanResults.filter(r=>r.include&&r.trip).reduce((s,r)=>s+r.amount,0).toLocaleString('en-IN')}
                {scanResults.filter(r=>r.include&&r.trip&&r.advance>0).length > 0 &&
                  ` · Advances: ₹${scanResults.filter(r=>r.include&&r.trip).reduce((s,r)=>s+r.advance,0).toLocaleString('en-IN')}`}
              </div>
              <Btn onClick={confirmScanned} full color={C.orange}
                disabled={!scanResults.some(r=>r.include&&r.trip)}>
                ✓ Confirm & Save All
              </Btn>
            </div>
          )}
        </Sheet>
      )}

      {/* ── ADD INDENT SHEET ── */}
      {addSheet && (
        <Sheet title="Record Diesel Indent" onClose={()=>{setAddSheet(false);setF(blankI);}}>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <Field label="Pump" value={f.pumpId} onChange={ff("pumpId")}
              opts={pumps.length>0 ? pumps.map(p=>({v:p.id,l:p.name})) : [{v:"",l:"No pumps — add one first"}]} />
            <div style={{display:"flex",gap:10}}>
              <Field label="Truck No" value={f.truckNo} onChange={ff("truckNo")} placeholder="KA34C4617" half />
              <Field label="Date"     value={f.date}    onChange={ff("date")} type="date" half />
            </div>
            <Field label="Indent No" value={f.indentNo} onChange={ff("indentNo")} placeholder="IND-2026-001" />
            <Field label="Link to Trip (LR)" value={f.tripId} onChange={ff("tripId")}
              opts={[{v:"",l:"— Not linked to a specific trip —"},
                ...trips.filter(t => !f.truckNo||t.truckNo===f.truckNo).slice(0,30)
                  .map(t=>({v:t.id,l:`LR:${t.lrNo||"—"} · ${t.truckNo} → ${t.to} · ${t.date}`}))]} />
            <div style={{display:"flex",gap:10}}>
              <Field label="Litres" value={f.litres} onChange={ff("litres")} type="number" half />
              <Field label="₹/Litre" value={f.ratePerLitre} onChange={ff("ratePerLitre")} type="number" half />
            </div>
            <Field label="Total Amount ₹ (auto)" value={f.amount} onChange={ff("amount")} type="number" />
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"4px 0"}}>
              <input type="checkbox" checked={f.confirmed} onChange={e=>setF(p=>({...p,confirmed:e.target.checked}))} style={{width:20,height:20,cursor:"pointer"}} />
              <span style={{color:C.text,fontSize:15}}>Pump has confirmed this amount</span>
            </div>
            <div style={{color:C.muted,fontSize:12}}>Recording as: <b style={{color:ROLES[user.role]?.color}}>{user.name}</b></div>
            <Btn onClick={saveIndent} full color={C.orange}>Save Indent</Btn>
          </div>
        </Sheet>
      )}

      {/* ── PAY SINGLE INDENT SHEET ── */}
      {paySheet && (
        <Sheet title="Mark Indent as Paid" onClose={()=>{setPaySheet(null);setPayRef("");}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",fontSize:13}}>
              <div><b>{paySheet.truckNo}</b> · Indent {paySheet.indentNo}</div>
              <div style={{color:C.muted}}>{paySheet.date} · {paySheet.litres}L · {pumps.find(p=>p.id===paySheet.pumpId)?.name||"—"}</div>
              <div style={{color:C.red,fontWeight:800,fontSize:18,marginTop:6}}>{fmt(paySheet.amount)}</div>
            </div>
            <Field label="Payment Reference / UTR" value={payRef} onChange={setPayRef} placeholder="UTR or cheque number" />
            <Btn onClick={markPaid} full color={C.green}>✓ Confirm Payment</Btn>
          </div>
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
function Vehicles({trips, setTrips, vehicles, setVehicles, user, log}) {
  const [sheet,   setSheet]   = useState(false);
  const [lSheet,  setLSheet]  = useState(null);
  const [sSheet,  setSSheet]  = useState(null);
  const [lAmt, setLAmt] = useState(""); const [rAmt, setRAmt] = useState("");
  const [shAmt, setShAmt] = useState(""); const [shTrip, setShTrip] = useState("");
  const blank = {truckNo:"",ownerName:"",phone:"",loan:"0",loanRecovered:"0",deductPerTrip:"0",tafalExempt:false};
  const [f,setF]=useState(blank); const ff=k=>v=>setF(p=>({...p,[k]:v}));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:C.accent,fontWeight:800,fontSize:16}}>🚛 Vehicles & Loans</div>
        <Btn onClick={()=>setSheet(true)} sm>+ Add</Btn>
      </div>
      <KPI icon="🔴" label="Total Loans Due" value={fmt(vehicles.reduce((s,v)=>s+Math.max(0,v.loan-v.loanRecovered),0))} color={C.red} />
      {sheet&&<Sheet title="Register Vehicle" onClose={()=>{setSheet(false);setF(blank);}}>
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          <div style={{display:"flex",gap:10}}><Field label="Truck No" value={f.truckNo} onChange={ff("truckNo")} half /><Field label="Owner" value={f.ownerName} onChange={ff("ownerName")} half /></div>
          <Field label="Phone" value={f.phone} onChange={ff("phone")} type="tel" />
          <div style={{display:"flex",gap:10}}><Field label="Loan ₹" value={f.loan} onChange={ff("loan")} type="number" half /><Field label="Recovered ₹" value={f.loanRecovered} onChange={ff("loanRecovered")} type="number" half /></div>
          <Field label="Deduct Per Trip ₹" value={f.deductPerTrip} onChange={ff("deductPerTrip")} type="number" />
          <div style={{display:"flex",gap:10,alignItems:"center",padding:"4px 0"}}>
            <input type="checkbox" checked={f.tafalExempt} onChange={e=>setF(p=>({...p,tafalExempt:e.target.checked}))} style={{width:20,height:20}} />
            <span style={{color:C.text,fontSize:15}}>TAFAL Exempt</span>
          </div>
          <div style={{color:C.muted,fontSize:12}}>Adding as: <b style={{color:ROLES[user.role]?.color}}>{user.name}</b></div>
          <Btn onClick={()=>{const v={...f,id:uid(),loan:+f.loan,loanRecovered:+f.loanRecovered,deductPerTrip:+f.deductPerTrip,createdBy:user.username}; setVehicles(p=>[...(p||[]),v]); log("ADD VEHICLE",`${v.truckNo} (${v.ownerName})`); setF(blank); setSheet(false);}} full>Save Vehicle</Btn>
        </div>
      </Sheet>}
      {lSheet&&(()=>{const v=vehicles.find(x=>x.id===lSheet); const bal=v.loan-v.loanRecovered; return (
        <Sheet title={`Loan — ${v.truckNo} (${v.ownerName})`} onClose={()=>{setLSheet(null);setLAmt("");setRAmt("");}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[{l:"Loan",v:fmt(v.loan),c:C.red},{l:"Recovered",v:fmt(v.loanRecovered),c:C.green},{l:"Balance",v:fmt(bal),c:C.accent}].map(x=>(
                <div key={x.l} style={{background:C.bg,borderRadius:10,padding:12,textAlign:"center"}}><div style={{color:x.c,fontWeight:800}}>{x.v}</div><div style={{color:C.muted,fontSize:10}}>{x.l}</div></div>
              ))}
            </div>
            <Field label="Give Loan ₹" value={lAmt} onChange={setLAmt} type="number" />
            <Btn onClick={()=>{setVehicles(p=>p.map(x=>x.id===lSheet?{...x,loan:x.loan+ +lAmt}:x)); log("ADD LOAN",`${v.truckNo} +${fmt(+lAmt)}`); setLAmt("");}} color={C.red} full>Add Loan</Btn>
            <Field label="Record Recovery ₹" value={rAmt} onChange={setRAmt} type="number" />
            <Btn onClick={()=>{setVehicles(p=>p.map(x=>x.id===lSheet?{...x,loanRecovered:x.loanRecovered+ +rAmt}:x)); log("LOAN RECOVERY",`${v.truckNo} recovered ${fmt(+rAmt)}`); setRAmt("");}} color={C.green} full>Record Recovery</Btn>
            <Field label="Deduct Per Trip ₹" value={String(v.deductPerTrip)} onChange={val=>setVehicles(p=>p.map(x=>x.id===lSheet?{...x,deductPerTrip:+val}:x))} type="number" />
          </div>
        </Sheet>
      );})()}
      {sSheet&&(()=>{const v=vehicles.find(x=>x.id===sSheet); const vt=trips.filter(t=>t.truckNo===v.truckNo&&!t.driverSettled); return (
        <Sheet title={`Shortage — ${v.truckNo}`} onClose={()=>{setSSheet(null);setShAmt("");setShTrip("");}}>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <Field label="Shortage MT" value={shAmt} onChange={setShAmt} type="number" />
            <Field label="Link to Trip" value={shTrip} onChange={setShTrip}
              opts={[{v:"",l:"— Select trip —"},...vt.map(t=>({v:t.id,l:`LR:${t.lrNo||"—"} · ${t.date} · ${t.to}`}))]} />
            <Btn onClick={()=>{if(shTrip)setTrips(p=>p.map(t=>t.id===shTrip?{...t,shortage:(t.shortage||0)+ +shAmt}:t)); log("SHORTAGE",`${v.truckNo} — ${shAmt}MT`); setSSheet(null);setShAmt("");setShTrip("");}} color={C.red} full>Record Shortage</Btn>
          </div>
        </Sheet>
      );})()}
      {vehicles.map(v=>{
        const bal=v.loan-v.loanRecovered; const vt=trips.filter(t=>t.truckNo===v.truckNo); const short=vt.reduce((s,t)=>s+(t.shortage||0),0);
        return (
          <div key={v.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",borderLeft:`4px solid ${bal>0?C.red:C.green}`,marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <div><div style={{fontWeight:800,fontSize:15}}>{v.truckNo}</div><div style={{color:C.muted,fontSize:12}}>{v.ownerName} · {v.phone}</div></div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <Badge label={bal>0?"Loan Due":"Clear"} color={bal>0?C.red:C.green} />
                {v.tafalExempt && <Badge label="TAFAL Exempt" color={C.muted} />}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
              {[{l:"Loan",v:fmt(v.loan),c:C.red},{l:"Recovered",v:fmt(v.loanRecovered),c:C.green},{l:"Balance",v:fmt(bal),c:bal>0?C.accent:C.green}].map(x=>(
                <div key={x.l} style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}><div style={{color:x.c,fontWeight:700,fontSize:12}}>{x.v}</div><div style={{color:C.muted,fontSize:9}}>{x.l.toUpperCase()}</div></div>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted,marginBottom:10}}>
              <span>Trips: <b style={{color:C.text}}>{vt.length}</b></span>
              <span>Deduct/trip: <b style={{color:C.blue}}>{fmt(v.deductPerTrip)}</b></span>
              <span style={{color:short>0?C.red:C.muted}}>Short: {short}MT</span>
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={()=>setLSheet(v.id)} sm outline color={C.blue}>Loan</Btn>
              <Btn onClick={()=>setSSheet(v.id)} sm outline color={C.red}>Shortage</Btn>
              <Btn onClick={()=>window.open(`https://wa.me/91${v.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Dear ${v.ownerName}, loan balance ${fmt(bal)}. - M.Yantra 9606477257`)}`,"_blank")} sm outline color={C.teal}>📲</Btn>
            </div>
          </div>
        );
      })}
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

// ─── PAYMENTS FROM SHREE ──────────────────────────────────────────────────────
// Shortage in payment advice = Shree deducts for weight lost in transit
// We record which truck caused it → auto-adds to vehicle's shortage recovery due
function Payments({payments, setPayments, trips, setTrips, vehicles, setVehicles, gstReleases, setGstReleases, expenses, setExpenses, user, log}) {
  const [view,     setView]     = useState("list");
  const [sheet,    setSheet]    = useState(false);
  const [gstSheet, setGstSheet] = useState(false);

  // Shortage entries linked to vehicles (for recovery tracking)
  const blankP = {
    invoiceNo:"", date:today(), totalBill:"", tds:"", gstHold:"",
    // shortage: can have multiple trucks in one advice
    shortageLines:[{truckNo:"", lrNo:"", shortMT:"", rate:"", amount:""}],
    otherDeduct:"", otherDeductLabel:"", paid:"", utr:"",
  };
  const [f, setF] = useState(blankP);
  const ff = k => v => setF(p=>({...p,[k]:v}));

  // Shortage line helpers
  const addShortLine  = () => setF(p=>({...p, shortageLines:[...p.shortageLines, {truckNo:"",lrNo:"",shortMT:"",rate:"",amount:""}]}));
  const updShortLine  = (i,k,v) => setF(p=>{
    const lines = p.shortageLines.map((l,idx)=>{
      if(idx!==i) return l;
      const updated = {...l,[k]:v};
      if(k==="shortMT"||k==="rate") updated.amount = String((+updated.shortMT||0)*(+updated.rate||0));
      return updated;
    });
    return {...p, shortageLines:lines};
  });
  const delShortLine  = i => setF(p=>({...p, shortageLines:p.shortageLines.filter((_,idx)=>idx!==i)}));

  const totalShortage = f.shortageLines.reduce((s,l)=>s+(+l.amount||0),0);
  const totalDeduct   = (+f.tds||0) + (+f.gstHold||0) + totalShortage + (+f.otherDeduct||0);
  const netPaid       = Math.max(0, (+f.totalBill||0) - totalDeduct);

  // GST tracking
  const totalGstHeld     = payments.reduce((s,p)=>s+(p.gstHold||p.hold||0),0);
  const totalGstReleased = (gstReleases||[]).reduce((s,r)=>s+(r.amount||0),0);
  const gstOutstanding   = totalGstHeld - totalGstReleased;

  const blankG = {date:today(), invoiceRef:"", amount:"", utr:"", notes:""};
  const [gf, setGf] = useState(blankG);
  const gff = k => v => setGf(p=>({...p,[k]:v}));

  const savePayment = () => {
    const finalPaid = +f.paid || netPaid;
    const p = {
      id:uid(), invoiceNo:f.invoiceNo, date:f.date,
      totalBill:+f.totalBill, tds:+f.tds, gstHold:+f.gstHold, hold:+f.gstHold,
      shortageLines:f.shortageLines.filter(l=>+l.amount>0),
      shortageTotal:totalShortage,
      otherDeduct:+f.otherDeduct, otherDeductLabel:f.otherDeductLabel,
      paid:finalPaid, utr:f.utr,
      createdBy:user.username, createdAt:nowTs(),
    };
    setPayments(prev=>[...(prev||[]),p]);

    // Mark trips as Paid
    setTrips(prev=>prev.map(t=>t.invoiceNo===f.invoiceNo?{...t,status:"Paid",paymentStatus:"Paid"}:t));

    // Add shortage to each vehicle's shortage due (vehicle.shortageOwed)
    if(totalShortage>0) {
      f.shortageLines.filter(l=>+l.amount>0 && l.truckNo).forEach(l=>{
        setVehicles(prev=>prev.map(v=>v.truckNo===l.truckNo
          ? {...v, shortageOwed:(v.shortageOwed||0)+(+l.amount)}
          : v));
      });
      // Also record as an expense
      const e = {id:uid(), date:f.date, label:`Shortage — Invoice ${f.invoiceNo}`,
        amount:totalShortage, category:"Shortage",
        notes:f.shortageLines.filter(l=>+l.amount>0).map(l=>`${l.truckNo}:${l.shortMT}MT`).join(", "),
        createdBy:user.username, createdAt:nowTs()};
      setExpenses(prev=>[e,...(prev||[])]);
    }
    // Record other deduction as expense
    if(+f.otherDeduct>0 && f.otherDeductLabel) {
      const e = {id:uid(), date:f.date, label:f.otherDeductLabel,
        amount:+f.otherDeduct, category:"Other",
        notes:`Deducted in invoice ${f.invoiceNo}`,
        createdBy:user.username, createdAt:nowTs()};
      setExpenses(prev=>[e,...(prev||[])]);
    }

    log("PAYMENT",`Invoice ${f.invoiceNo} — Paid ${fmt(finalPaid)} | TDS ${fmt(+f.tds)} | GST ${fmt(+f.gstHold)} | Shortage ${fmt(totalShortage)} | UTR:${f.utr}`);
    setF(blankP); setSheet(false);
  };

  const saveGst = () => {
    const r = {...gf, id:uid(), amount:+gf.amount, createdBy:user.username, createdAt:nowTs()};
    setGstReleases(prev=>[...(prev||[]),r]);
    log("GST RELEASE",`${fmt(+gf.amount)} · UTR:${gf.utr} · Ref:${gf.invoiceRef}`);
    setGf(blankG); setGstSheet(false);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{color:C.green,fontWeight:800,fontSize:16}}>💰 Shree Payments</div>
        <Btn onClick={()=>setSheet(true)} sm>+ Record</Btn>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <KPI icon="✅" label="Total Received"  value={fmt(payments.reduce((s,p)=>s+(p.paid||0),0))} color={C.green} />
        <KPI icon="📋" label="TDS Deducted"    value={fmt(payments.reduce((s,p)=>s+(p.tds||0),0))} color={C.red} />
        <KPI icon="🔒" label="GST Held (total)"value={fmt(totalGstHeld)}      color={C.orange} sub={`Released: ${fmt(totalGstReleased)}`} />
        <KPI icon="⏳" label="GST Outstanding" value={fmt(gstOutstanding)}    color={gstOutstanding>0?C.accent:C.green} sub="To be released" />
      </div>

      {/* GST banner */}
      {gstOutstanding > 0 && (
        <div style={{background:C.orange+"11",border:`1.5px solid ${C.orange}`,borderRadius:12,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:C.orange,fontWeight:800}}>GST to Release: {fmt(gstOutstanding)}</div>
            <div style={{color:C.muted,fontSize:12}}>Paste GST release payment advice below</div>
          </div>
          <Btn onClick={()=>setGstSheet(true)} sm color={C.orange}>Record Release</Btn>
        </div>
      )}

      <PillBar items={[
        {id:"list",  label:"Payments",    color:C.green},
        {id:"gst",   label:"GST Tracker", color:C.orange},
        {id:"shortage",label:"Shortage Recovery",color:C.red},
      ]} active={view} onSelect={setView} />

      {/* LIST VIEW */}
      {view==="list" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {payments.map(p => (
            <div key={p.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",borderLeft:`4px solid ${C.green}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{color:C.blue,fontWeight:800,fontSize:14}}>{p.invoiceNo}</div>
                  <div style={{color:C.muted,fontSize:12}}>{p.date} · UTR: {p.utr}</div>
                  {p.createdBy&&<div style={{color:ROLES[p.createdBy]?.color||C.muted,fontSize:11}}>by {p.createdBy}</div>}
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:C.green,fontWeight:900,fontSize:20}}>{fmt(p.paid)}</div>
                  <div style={{color:C.muted,fontSize:11}}>received</div>
                </div>
              </div>
              <div style={{background:C.bg,borderRadius:10,padding:"10px 12px"}}>
                {[
                  {l:"Total Bill",          v:p.totalBill||0,                     c:C.blue},
                  {l:"(−) TDS",             v:p.tds||0,                           c:C.red},
                  {l:"(−) GST Held",        v:p.gstHold||p.hold||0,               c:C.orange},
                  {l:"(−) Shortage",        v:p.shortageTotal||0,                 c:C.red},
                  {l:"(−) Other Deduction", v:p.otherDeduct||0,                   c:C.red},
                ].map(r=>(
                  <div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.border}22`}}>
                    <span style={{color:C.muted,fontSize:12}}>{r.l}</span>
                    <span style={{color:r.v>0?r.c:C.dim,fontWeight:r.v>0?700:400,fontSize:12}}>{r.v>0?fmt(r.v):"—"}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0 0"}}>
                  <span style={{fontWeight:800}}>Net Received</span>
                  <span style={{color:C.green,fontWeight:900}}>{fmt(p.paid)}</span>
                </div>
              </div>
              {/* Shortage lines detail */}
              {(p.shortageLines||[]).filter(l=>+l.amount>0).length>0 && (
                <div style={{marginTop:8,background:C.red+"08",borderRadius:8,padding:"8px 10px"}}>
                  <div style={{color:C.red,fontSize:11,fontWeight:700,marginBottom:4}}>Shortage deductions (to recover from vehicles):</div>
                  {p.shortageLines.filter(l=>+l.amount>0).map((l,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}>
                      <span style={{color:C.muted}}>{l.truckNo} · LR:{l.lrNo||"—"} · {l.shortMT}MT × ₹{l.rate}</span>
                      <span style={{color:C.red,fontWeight:700}}>{fmt(+l.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {payments.length===0&&<div style={{textAlign:"center",color:C.muted,padding:40}}>No payments recorded yet</div>}
        </div>
      )}

      {/* GST TRACKER */}
      {view==="gst" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:C.card,borderRadius:12,padding:"14px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{color:C.muted,fontSize:13}}>Total GST held by Shree</span>
              <span style={{color:C.orange,fontWeight:800}}>{fmt(totalGstHeld)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{color:C.muted,fontSize:13}}>Total GST released</span>
              <span style={{color:C.green,fontWeight:800}}>− {fmt(totalGstReleased)}</span>
            </div>
            <div style={{borderTop:`1px solid ${C.border}`,marginTop:6,paddingTop:8,display:"flex",justifyContent:"space-between"}}>
              <span style={{fontWeight:800}}>Outstanding GST to recover</span>
              <span style={{color:gstOutstanding>0?C.accent:C.green,fontWeight:900,fontSize:16}}>{fmt(gstOutstanding)}</span>
            </div>
          </div>
          <div style={{color:C.muted,fontWeight:700,fontSize:12,textTransform:"uppercase",letterSpacing:1}}>GST Held per Invoice</div>
          {payments.filter(p=>(p.gstHold||p.hold||0)>0).map(p=>(
            <div key={p.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",display:"flex",justifyContent:"space-between",borderLeft:`4px solid ${C.orange}`}}>
              <div>
                <div style={{fontWeight:700}}>{p.invoiceNo}</div>
                <div style={{color:C.muted,fontSize:12}}>{p.date}</div>
              </div>
              <div style={{color:C.orange,fontWeight:800}}>{fmt(p.gstHold||p.hold||0)}</div>
            </div>
          ))}
          {(gstReleases||[]).length>0&&(
            <>
              <div style={{color:C.muted,fontWeight:700,fontSize:12,textTransform:"uppercase",letterSpacing:1}}>GST Releases Recorded</div>
              {(gstReleases||[]).map(r=>(
                <div key={r.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",display:"flex",justifyContent:"space-between",borderLeft:`4px solid ${C.green}`}}>
                  <div>
                    <div style={{fontWeight:700}}>Ref: {r.invoiceRef||"—"}</div>
                    <div style={{color:C.muted,fontSize:12}}>{r.date} · UTR: {r.utr}</div>
                    {r.notes&&<div style={{color:C.muted,fontSize:11}}>{r.notes}</div>}
                  </div>
                  <div style={{color:C.green,fontWeight:800}}>{fmt(r.amount)}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* SHORTAGE RECOVERY */}
      {view==="shortage" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{background:C.red+"11",border:`1px solid ${C.red}33`,borderRadius:10,padding:"10px 12px",color:C.muted,fontSize:13}}>
            Shortage = Shree deducted from our payment because the vehicle delivered less MT than loaded. We recover this from the vehicle owner.
          </div>
          {vehicles.filter(v=>(v.shortageOwed||0)>0).map(v=>(
            <div key={v.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",borderLeft:`4px solid ${C.red}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div>
                  <div style={{fontWeight:800,fontSize:15}}>{v.truckNo}</div>
                  <div style={{color:C.muted,fontSize:12}}>{v.ownerName} · {v.phone}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{color:C.red,fontWeight:800,fontSize:16}}>{fmt(v.shortageOwed||0)}</div>
                  <div style={{color:C.muted,fontSize:11}}>to recover</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <ShortageRecoverBtn v={v} setVehicles={setVehicles} log={log} />
                <Btn onClick={()=>window.open(`https://wa.me/91${v.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Dear ${v.ownerName}, shortage amount of ${fmt(v.shortageOwed||0)} is to be recovered. - M.Yantra`)}`,"_blank")} sm outline color={C.teal}>📲 WA</Btn>
              </div>
            </div>
          ))}
          {vehicles.filter(v=>(v.shortageOwed||0)>0).length===0 && (
            <div style={{textAlign:"center",color:C.muted,padding:40}}>No shortage recovery pending ✓</div>
          )}
          {/* History of all shortage deductions */}
          {payments.some(p=>(p.shortageTotal||0)>0) && (
            <div>
              <div style={{color:C.muted,fontWeight:700,fontSize:12,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>All Shortage Deductions</div>
              {payments.filter(p=>(p.shortageTotal||0)>0).map(p=>(
                <div key={p.id} style={{background:C.card,borderRadius:12,padding:"11px 14px",marginBottom:7}}>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <div style={{color:C.blue,fontSize:13,fontWeight:700}}>{p.invoiceNo}</div>
                    <div style={{color:C.red,fontWeight:800}}>{fmt(p.shortageTotal||0)}</div>
                  </div>
                  {(p.shortageLines||[]).filter(l=>+l.amount>0).map((l,i)=>(
                    <div key={i} style={{color:C.muted,fontSize:12,marginTop:3}}>{l.truckNo} · LR:{l.lrNo||"—"} · {l.shortMT}MT × ₹{l.rate} = {fmt(+l.amount)}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ADD PAYMENT SHEET ── */}
      {sheet && (
        <Sheet title="Record Payment from Shree" onClose={()=>{setSheet(false);setF(blankP);}}>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <div style={{background:C.blue+"11",border:`1px solid ${C.blue}33`,borderRadius:10,padding:"9px 12px",color:C.muted,fontSize:12}}>
              Fill from the payment advice PDF from Shree Cement. Shortage deductions can be linked to specific trucks for recovery tracking.
            </div>
            <div style={{display:"flex",gap:10}}>
              <Field label="Invoice No" value={f.invoiceNo} onChange={ff("invoiceNo")} placeholder="SMYE107026…" half />
              <Field label="Date" value={f.date} onChange={ff("date")} type="date" half />
            </div>
            <Field label="Total Bill Amount ₹" value={f.totalBill} onChange={ff("totalBill")} type="number" />
            <div style={{display:"flex",gap:10}}>
              <Field label="TDS ₹" value={f.tds} onChange={ff("tds")} type="number" half />
              <Field label="GST Hold ₹" value={f.gstHold} onChange={ff("gstHold")} type="number" half note="Released after GSTR-1 filing" />
            </div>

            {/* Shortage lines */}
            <div style={{background:C.bg,borderRadius:10,padding:"12px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{color:C.red,fontWeight:700,fontSize:12}}>Shortage Deductions (link to truck for recovery)</div>
                <Btn onClick={addShortLine} sm outline color={C.red}>+ Add</Btn>
              </div>
              {f.shortageLines.map((l,i)=>(
                <div key={i} style={{background:C.card,borderRadius:8,padding:"10px",marginBottom:8}}>
                  <div style={{display:"flex",gap:8,marginBottom:6}}>
                    <Field label="Truck No" value={l.truckNo} onChange={v=>updShortLine(i,"truckNo",v)} placeholder="KA34C4617" half />
                    <Field label="LR No" value={l.lrNo} onChange={v=>updShortLine(i,"lrNo",v)} placeholder="LR/MYE/001" half />
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                    <Field label="Short MT" value={l.shortMT} onChange={v=>updShortLine(i,"shortMT",v)} type="number" half />
                    <Field label="Shree Rate ₹" value={l.rate} onChange={v=>updShortLine(i,"rate",v)} type="number" half />
                    {f.shortageLines.length>1&&<button onClick={()=>delShortLine(i)} style={{background:"none",border:"none",color:C.red,fontSize:18,cursor:"pointer",paddingBottom:14}}>×</button>}
                  </div>
                  {+l.amount>0&&<div style={{color:C.red,fontWeight:700,fontSize:13,marginTop:4}}>Deduction: {fmt(+l.amount)}</div>}
                </div>
              ))}
              {totalShortage>0&&<div style={{display:"flex",justifyContent:"space-between",color:C.red,fontWeight:800,fontSize:13,marginTop:4}}>
                <span>Total shortage deducted</span><span>{fmt(totalShortage)}</span>
              </div>}
            </div>

            <div style={{display:"flex",gap:10}}>
              <Field label="Other Deduction ₹" value={f.otherDeduct} onChange={ff("otherDeduct")} type="number" half />
              <Field label="Label (e.g. Electricity)" value={f.otherDeductLabel} onChange={ff("otherDeductLabel")} half />
            </div>

            {/* Auto calculated net */}
            {+f.totalBill>0 && (
              <div style={{background:C.bg,borderRadius:10,padding:"12px 14px"}}>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Payment Breakdown</div>
                {[
                  {l:"Total Bill",       v:+f.totalBill||0,  c:C.blue},
                  {l:"(−) TDS",          v:+f.tds||0,        c:C.red},
                  {l:"(−) GST Hold",     v:+f.gstHold||0,    c:C.orange},
                  {l:"(−) Shortage",     v:totalShortage,    c:C.red},
                  {l:"(−) Other",        v:+f.otherDeduct||0,c:C.red},
                ].map(r=>(
                  <div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.border}22`}}>
                    <span style={{color:C.muted,fontSize:13}}>{r.l}</span>
                    <span style={{color:r.v>0?r.c:C.dim,fontWeight:r.v>0?700:400,fontSize:13}}>{r.v>0?fmt(r.v):"—"}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0 0"}}>
                  <span style={{fontWeight:800,fontSize:15}}>Net to Receive</span>
                  <span style={{color:C.green,fontWeight:900,fontSize:18}}>{fmt(netPaid)}</span>
                </div>
              </div>
            )}

            <div style={{display:"flex",gap:10}}>
              <Field label="Amount Actually Received ₹" value={f.paid} onChange={ff("paid")} type="number" half note="Leave blank to use calculated net" />
              <Field label="UTR / Reference" value={f.utr} onChange={ff("utr")} half />
            </div>
            <div style={{color:C.muted,fontSize:12}}>Recording as: <b style={{color:ROLES[user.role]?.color}}>{user.name}</b></div>
            <Btn onClick={savePayment} full color={C.green}>Save Payment</Btn>
          </div>
        </Sheet>
      )}

      {/* ── GST RELEASE SHEET ── */}
      {gstSheet && (
        <Sheet title="Record GST Release" onClose={()=>{setGstSheet(false);setGf(blankG);}}>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <div style={{background:C.orange+"11",border:`1px solid ${C.orange}33`,borderRadius:10,padding:"9px 12px",color:C.muted,fontSize:12}}>
              Paste the GST release payment advice from Shree. This will reduce the outstanding GST balance.
            </div>
            <div style={{display:"flex",gap:10}}>
              <Field label="Date" value={gf.date} onChange={gff("date")} type="date" half />
              <Field label="Amount ₹" value={gf.amount} onChange={gff("amount")} type="number" half />
            </div>
            <Field label="Invoice / Reference" value={gf.invoiceRef} onChange={gff("invoiceRef")} placeholder="Invoice or advice reference" />
            <Field label="UTR" value={gf.utr} onChange={gff("utr")} />
            <Field label="Notes" value={gf.notes} onChange={gff("notes")} placeholder="Optional notes" />
            <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0"}}>
              <span style={{color:C.muted,fontSize:13}}>Outstanding before this release</span>
              <span style={{color:C.orange,fontWeight:800}}>{fmt(gstOutstanding)}</span>
            </div>
            <Btn onClick={saveGst} full color={C.orange}>Record GST Release</Btn>
          </div>
        </Sheet>
      )}
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
  const [paySheet,  setPaySheet]  = useState(null); // trip being paid
  const [pf, setPf] = useState({amount:"", utr:"", date:today(), notes:""});
  const pff = k => v => setPf(p=>({...p,[k]:v}));

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
      amount:+pf.amount, utr:pf.utr, date:pf.date, notes:pf.notes,
      createdBy:user.username, createdAt:nowTs()};
    setDriverPays(prev=>[...(prev||[]),p]);
    log("DRIVER PAYMENT",`LR:${t.lrNo} ${t.truckNo} — ${fmt(+pf.amount)} UTR:${pf.utr}`);
    setPaySheet(null); setPf({amount:"",utr:"",date:today(),notes:""});
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{color:C.blue,fontWeight:800,fontSize:16}}>🏧 Driver Payments</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <KPI icon="⏳" label="Balance Due"  value={fmt(totalBalance)}    color={C.accent} sub={`${unpaidTrips.length} trips`} />
        <KPI icon="✅" label="Total Paid"   value={fmt((driverPays||[]).reduce((s,p)=>s+(p.amount||0),0))} color={C.green} />
      </div>

      <PillBar items={[
        {id:"unpaid",label:`Unpaid (${unpaidTrips.length})`,color:C.accent},
        {id:"paid",  label:`Paid (${paidTrips.length})`,    color:C.green},
        {id:"all",   label:"All",                           color:C.blue},
      ]} active={filter} onSelect={setFilter} />

      {(filter==="unpaid"?unpaidTrips:filter==="paid"?paidTrips:tripWithBalance).map(t=>(
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
            <div key={p.id} style={{background:C.green+"11",borderRadius:6,padding:"6px 10px",marginBottom:4,display:"flex",justifyContent:"space-between",fontSize:12}}>
              <span style={{color:C.muted}}>{p.date} · UTR: {p.utr}</span>
              <span style={{color:C.green,fontWeight:700}}>{fmt(p.amount)}</span>
            </div>
          ))}
          {t.balance>0&&<Btn onClick={()=>{setPaySheet(t);setPf({amount:String(t.balance),utr:"",date:today(),notes:""});}} full sm color={C.green}>+ Record Payment</Btn>}
        </div>
      ))}

      {paySheet && (
        <Sheet title={`Pay Driver — ${paySheet.truckNo}`} onClose={()=>setPaySheet(null)}>
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",fontSize:13}}>
              <div><b>{paySheet.truckNo}</b> · LR: {paySheet.lrNo||"—"}</div>
              <div style={{color:C.muted}}>{paySheet.from}→{paySheet.to} · {paySheet.qty}MT</div>
              <div style={{color:C.accent,fontWeight:800,fontSize:16,marginTop:4}}>Balance: {fmt(paySheet.balance)}</div>
            </div>
            <Field label="Amount ₹" value={pf.amount} onChange={pff("amount")} type="number" />
            <div style={{display:"flex",gap:10}}>
              <Field label="UTR / Reference" value={pf.utr} onChange={pff("utr")} half />
              <Field label="Date" value={pf.date} onChange={pff("date")} type="date" half />
            </div>
            <Field label="Notes" value={pf.notes} onChange={pff("notes")} placeholder="Bank name, NEFT/RTGS…" />
            <div style={{color:C.muted,fontSize:12}}>Recording as: <b style={{color:ROLES[user.role]?.color}}>{user.name}</b></div>
            <Btn onClick={()=>savePayment(paySheet)} full color={C.green}>✓ Confirm Payment — {fmt(+pf.amount)}</Btn>
          </div>
        </Sheet>
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
  const [df,setDf]=useState("2026-01-01"); const [dt,setDt]=useState(today());
  const fil=trips.filter(t=>t.date>=df&&t.date<=dt);
  const exportCSV=(rows,name)=>{if(!rows.length)return;const k=Object.keys(rows[0]);const csv=[k.join(","),...rows.map(r=>k.map(x=>`"${String(r[x]??"").replace(/"/g,'""')}"`).join(","))].join("\n");const b=new Blob([csv],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);};
  const printR=(html,title)=>{const w=window.open("","_blank");w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:monospace;padding:20px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#f0f0f0}h2{margin-bottom:4px}</style></head><body onload="window.print()">${html}</body></html>`);w.document.close();};
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{color:C.blue,fontWeight:800,fontSize:16}}>📤 Reports</div>
      <div style={{display:"flex",gap:10}}><Field label="From" value={df} onChange={setDf} type="date" half /><Field label="To" value={dt} onChange={setDt} type="date" half /></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <KPI label="Trips" value={fil.length} color={C.blue} />
        <KPI label="Billed" value={fmt(fil.reduce((s,t)=>s+t.qty*t.frRate,0))} color={C.green} />
        <KPI label="Margin" value={fmt(fil.reduce((s,t)=>s+t.qty*(t.frRate-t.givenRate),0))} color={C.accent} />
      </div>
      {[
        {l:"🚚 Trip Report CSV",     c:C.blue,   fn:()=>exportCSV(fil.map(t=>({Date:t.date,Type:t.type,LR:t.lrNo,Truck:t.truckNo,GR:t.grNo,DI:t.diNo,From:t.from,To:t.to,MT:t.qty,FR:t.frRate,Driver:t.givenRate,Margin:t.qty*(t.frRate-t.givenRate),TAFAL:t.tafal,Diesel:t.dieselEstimate,Advance:t.advance,Shortage:t.shortage,Status:t.status,By:t.createdBy})),"trips.csv")},
        {l:"🚛 Vehicle Loan CSV",    c:C.red,    fn:()=>exportCSV(vehicles.map(v=>({Truck:v.truckNo,Owner:v.ownerName,Loan:v.loan,Recovered:v.loanRecovered,Balance:v.loan-v.loanRecovered})),"loans.csv")},
        {l:"💵 Settlements CSV",     c:C.green,  fn:()=>exportCSV(settlements,"settlements.csv")},
        {l:"⛽ Diesel Indents CSV",  c:C.orange, fn:()=>exportCSV(indents.map(i=>({Date:i.date,Truck:i.truckNo,Indent:i.indentNo,Litres:i.litres,Rate:i.ratePerLitre,Amount:i.amount,Confirmed:i.confirmed,Paid:i.paid,PaidRef:i.paidRef})),"diesel.csv")},
        {l:"🖨 Print Trip Report",   c:C.blue,   fn:()=>{const rows=fil.map(t=>`<tr><td>${t.date}</td><td>${t.lrNo||"—"}</td><td>${t.truckNo}</td><td>${t.to}</td><td>${t.qty}</td><td>₹${(t.qty*t.frRate).toLocaleString("en-IN")}</td><td>₹${t.tafal}</td><td>${t.status}</td><td>${t.createdBy}</td></tr>`).join(""); printR(`<h2>M.YANTRA — Trip Report ${df} to ${dt}</h2><table><thead><tr><th>Date</th><th>LR</th><th>Truck</th><th>To</th><th>MT</th><th>Billed</th><th>TAFAL</th><th>Status</th><th>By</th></tr></thead><tbody>${rows}</tbody></table>`,"Trip Report");}},
        {l:"🖨 Print Loan Report",   c:C.red,    fn:()=>{const vr=vehicles.map(v=>`<tr><td>${v.truckNo}</td><td>${v.ownerName}</td><td>₹${v.loan.toLocaleString("en-IN")}</td><td>₹${v.loanRecovered.toLocaleString("en-IN")}</td><td>₹${(v.loan-v.loanRecovered).toLocaleString("en-IN")}</td></tr>`).join(""); printR(`<h2>M.YANTRA — Loan Report</h2><table><thead><tr><th>Truck</th><th>Owner</th><th>Loan</th><th>Recovered</th><th>Balance</th></tr></thead><tbody>${vr}</tbody></table>`,"Loan Report");}},
      ].map(r=>(
        <button key={r.l} onClick={r.fn} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"15px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",width:"100%"}}>
          <span style={{color:C.text,fontWeight:700,fontSize:14}}>{r.l}</span>
          <span style={{color:r.c,fontSize:18}}>→</span>
        </button>
      ))}
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

