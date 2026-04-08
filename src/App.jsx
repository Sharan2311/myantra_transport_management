import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { DB } from "./db.js";
import { supabase } from "./supabase.js";


// ─── LOGO ────────────────────────────────────────────────────────────────────
const LOGO_SRC = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5Ojf/2wBDAQoKCg0MDRoPDxo3JR8lNzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzf/wAARCAB4AHgDASIAAhEBAxEB/8QAHAAAAgIDAQEAAAAAAAAAAAAAAAYEBQIDBwEI/8QAQhAAAQMDAQUEBwYDBgcBAAAAAQIDBAAFESEGEjFBURMiYXEUMoGRocHRFSMzUrGyQmJyQ4KSovDxBxYkJTVjwuH/xAAYAQADAQEAAAAAAAAAAAAAAAAAAgMBBP/EACkRAAICAgIBAgQHAAAAAAAAAAABAhEDIRIxQSIycbHB8DNRYZGh0eH/2gAMAwEAAhEDEQA/AOG0UUUAFFWtntqLhGllRKVt7m4vkknPHw0qF6FJ9M9ESwtUgnAbSMknwxxra1YXujH0Z70USQglnfKN8cAdDj41prolmsjsG1mFcEN9spRccY3gopQoJA3h4lJ/3rZE2e7B9DdttjTql8HXjvEHpr/+Vso1DmtoyLTnwlpnPWYz75www44f5EE/pUoWO7qGRapxHURl/SussWqWzhM++QYOP4ApAI9hzTHbW7cy2N7bNWccUOBI/ZiudZb6+/4LOEV3Z89SIkmKcSY7rR6OIKf1rRX1Gyw5MT2UDaiHP3uDLwZez7Bumk/aTZi3yn3Y8yy29MhHrSYClN4V+UpGmfacedUg5SdJE5cYq2ziRivCKJRbIZK9wLPAqxnFaa6ftDs6/c7eLdaEMqksEPJjBYSS2AUndB8SPjXOxbZnp5gqjuIkg4U2sbpT554Dxqkkoy4oSDco8mRKKtb3bW7c3F3FFZcSoqWdAog8h0qqpWqGTsKKKKACiip1mtr12ntxWNM6rVjRCeZobo1K3SLrZFpSoc5QBx2rQBxpwWcUwxHFRnVLaIaWUhtTm6CpAJz3c8v0zVxaILH2cqNDa3YrSwELP9orB3lZ5641+WKWptyRA2omQpZCGQtPZu4z2Z3U5z1SefTj1qiSeNNom245Gk+hhu8CKZsb/lyXvP8AYr9IkPoI7YgjROdVYzhROnD2TNmLnGuL7lsnthiWk7imXNN/y8+X1qkmQn32m1RHixJjkLbXvDGccD/KRz8uIqQy3H2sZLS/+37RQxhORjOOvVPhyzkaUY3wVdmTXPsZJmz4tKwuM0OwUcJWE6pPRR6+PPzpl2aU4UAbyseZpU2P2yEl1yw7RBCZzRLRUpQKXCNME8/P503R4ymSWG1lDBOqgT2mPy+H9XHHjrTOF7iIp1qRLnxWLoVR0x2VoSd119TSVEHmlBI9bqf4fPgibXbRNQ3kWTZ1pL849wBvVLYHHXw5n51p/wCIG34hsLtGz6khQTuOPN6BI/KjHxPu60mbI31UGNJaiQBIvMhWEPFWdPEHkOPTrwrb46QVz2y4Sl6wymmZTibhPkJCylKihbRHMHknHDgdOlbblJdnOIW+oOrCezS5up3lDOdcDUfrjOleRLeISHX5TpkTH8qefUeJ4kZPBI688dKrLTdBddrokOMSqN95vuYx2h3FYPgnTTrx8AiSbRRtqLKnbWOpqLAWUnBU6CrGme6aU67dc4TDkH0WayHIDqylxXNpRCd1WeXPXlx4Zrkd/tD9kuTkORrjVC8YC08j/rmDSTaU3EaCbxqRW0UUVhoV0XZC0OIhRojKSJtzUN480N/7H/N4UkWSIJ11jRleotY3/wCkan4A11mzSFRG7teEgB1hAjRR0cVpn2E/Co5ZVr7/AELYlpstZlwhMyGrXE3ER4gLTKubyk/iK8grT2E8KQ9r7I7cb3JejHC0gLxjidPpVtKisvWtDKgoFDo7N5H4jRSkneB+JHOt9sceTdXYtwSDLZaQHnE+o5kkpKf7uPbmuiOocTma9XIVbBeHILghzgUpbOE7wyWvqjw5ceGRTBc4DdxQJER0sS209x9KsYB/hJH8Ouh5Z6VltJs9GnrKop7GZkdkrOEq0Bweh6Glq2XN+1vqhzEKR2ZwpKhqjXXA6dRy+FanZrJe0jiJdmYedXHhz7cRHSyEbqnBjOAEgJAHHXJJJPDi/wAuS6nYxaQ692voXr75387mcZ+FLHY224usOS2Q4hA9dPFKeevDHTp7avnpCVMFpaVbijlSRjO5z8PVq2Jdkcvg59s7aEXWakzFqbjAjeIGq/AdDTr6FAtgW/GaQloDc7VSd1QxyXnUdTyPkK0tRG1sPJhoLUJoHcKsknpwGvz8q9mXaA7dvs1K1upcZKUKcAWlfRDmOKcjIPEeNcWTK1Ols6YQTjsU7/eHrq/6BACihZ1AGC70J6J6DnxPIC62NsLtnvLS5B3nCN855dxwfOrnZ+w262XBS2wVPrQpxaFrDnZA43QFDiNTrxxxrVeXpLl2ESB3ZL7RCXj6rKU5KlHr3c4HMkVaE06kuhJRaTRe226xHZrlrkhC4snDLy8Z7FxX4ZPgTke0cjSltnZnJVukxHU5n2sktqPFxrp46D3p8amwocaPbVsNoUlLjig46s5ccJAO+o9dc+FWl3kKlM2i9EfevJMWUP8A2A4z/iTUMz9fJefmv8LYF6eDOGUVY7Qwk2+8yoyBhtK8o/pOo+BFFVWxGqdFjsO2FXVxw/2bJI8yQn9CaeVO9nsrC6yJa3lePrEfKkfYtYTLk9ezSf8AOmmyUsq2Ytn8hKT4aK+lRl718V9Sq/D/AH+hml4Lt2uNXl8T/IPrU+dIxtBJQTohKQKpI6z9moGcZfc5Z/hQK1zJTjt7luE6k/oSPlV/JAYJL6XkoJUE5cKRnnokVBcm2CU64zeIpdy1lM1vJWhI/KeZzgZ4jgciorATKiNBxaQUyN4AnBUcp4UmszewnPxn95UftlEYPebOeKfpzrPJpcrcfsz7a1MvIt8oFyOXdTuHy59R7RVqu4NIY7ZS09iO8BxT/tVva58a9QE2W/JQtSxmO+juh8ciPyrHx+FKK7C4q9C2ImIdhIc3g+pW6jHMZwe9xGmRnWnUhXEkQ59yltSFtBTUJZAKte8RyA5n4D4VZwpdvZbfMOMlp/st193fJUsnQAE9eZ51BvU9ayqLDDcaO22EqxjCQNMqxp4AjVWmc0txrg4i4x0Q94ICtwFXrLJ0yffwqcl212Mn1Z0q1utwZT7Diz2wCd5IIO5lPAnkfCtkaQlV6Rg+s24D/gV9aX4hEaHugOB9Tqe2Cxg5KSQfIis4ry/tOPjOcmsxx4wo2T5SssHHwiAlQI/FxgcPUFS0PB7Y+4a6xpaXk+GQkn45qkmLzbgQrOH0Dhj+zP0qbb1kbJ3rX1ykD3J+tLl9q+K+ZuPt/AUNv0AXZl1I/EYGfMKUP0Aoo25VmTEHMNq/eaK2HtQ2X3sr9mHezuSkji40pI8x3h+2nVr76yymk6mO6VpH8p737VK91c4ivqjSWn0es2oKHjiugWaUhuW3g5ZfSG9eB5oz5glNJkT7X3Q0Nxo8a/8AHMgZz2jvD+4PdWdwbSNorghA0Qr5qzWU2P6G3HZJBbCnFJVn+HeTg+fh515OkNPzJD6MIaUsuKW4BqkknKvfoKsnatEWq0YoYaDjK1L3Go6y6pStAAcZPloMDjVXOsrEiAJjBO84tawcYyCo4qDdbkqWoR4wUlgK0TzWep8f0pghBTNqZYc4ge6tRguQZvYJMOajtI5OqeaT1T0NMrnof2ZgrQiIMKSUaYPLHjVTLtK5hUpkDfAz51UKEleInezvernnRQBcJJlK7GOkpZCs4JypZ/Mo8zUyBHiRUMOSAUuIfQpZIz3c64qZHs/oqB2wys8a2TofpEQobH3iR3T8q0CzZZLKlpfcDodV2yXk6hQ1wrPMYPsrbb2wL/CbUMbxV+0kUt2i7GMPQpu8Y5Jwcd5pXUfMc6YYr6Y0yOt8BSG1h1DjeCAOqeqTnUcqUDU53rWr1sh5rj4oVU1JDWzrDPAynwo/05z+1I99RIzCpUNTCRhJdaK1DXdTuryf9cyKyu0lCpCkhQSxHSW9OAOMr9yQBUsjtpflv+iuJeRQ2se7W5pTnVtpIPmcq/8AqiqybIVKluvqGC4sqx08KKolSoWTuTZoq+skwOMGI6TlAO7jiU8dPEHUVQ1k2tTS0rbJSpJyCOVDVoIypnQLg65KYhOP4SUtr318jhXre3pS3cbgZBDDAUlkHRPNR6nx/SthVPuENhxtIbjoSpRG8ME5OTjjjj5Va22xtusiUCW3SdA7wJzjX60t8ewcb6IlrhJYAddGXOQ/LVkHt44rW5FkhbiOzIU0neKSRnHUdRpyrW0076OZRADKVhG8VAZJ5Ac/ZVLEGC1ITulWBnFVyY7f2qHN0ZzzqyYjyY1ualOtFLDw+7Wcd6oSo8lDSLgpvEVaylLmQdRn2jga0CVdUgkKHSqlxzdOlW8qFMc3EhoZW0HE99OqTwPGqp+2TUJ31tpCcgZDiTqSAOfUigLKa4RUvEuNgBzn41hbLiWf+im7ymCrukDKm1dR8xzq9dslwaPeYB8EuJJ/WoMu3xWH0DeD80pJLSDpjHXl5n2UkpUalZZw3HoUaV2eFLUpvs1g93Xe73kONLm0ExLLAiNE5WNc8d3OdfFR1rH7Ql25p5iUd5JIKGzzP069aoXnVvOqddUVLUcknnSpW7KXxjRhRRRTkwooooAcLC6hFripcTntFLR+4/Wpsl9tNtkx+0IbY7JO+k7p5a55cjSW3PktNtNodIQ0vfQMDQ6/U1k5cZbqHkLdyl4guDA1xjH6CgBvbuEtDsZaiHw2oYVkJUUnQgjgeuR0qZJZiTbp9nLfEdqIApppJ9ckZUryAz8aRIcmU0cMLO6Nd1WqR76to96mjJWX0vLwe1QUkkHTgR4UijSpFG03Y9vzxOjzYQkRiwoN+gtpX3mylOMEePzrKK/2Gz0OHLQlUZ5Tjby0qB7IlWUKHtPszSMzNiMKQ5FQqNIHquhGVePMg8+VbjPacjiO8864wkkpbAUnBOp4YznPlrRyYOC8MZNqLW5cURPv20CLFCCVEjJHl5VHvLUH7ZivOuqEoBncbToPW4kAUvvXJEgYl9pLUkbqCtv1E+eQOR1PStDl5l7gS2HVr3u6txYzkHoOho2zKSGuV6GvaJ59vtVTWglYbCglKu6ANcajgDrzqrhuJcMqQksMuqUoZX3Rv8Tx1ODuilh67XEzBIckqLyeeBjhjhwOla5dzmS2y3IdCklW8cISMnroKfyLeqLTapgKU1KSpCz+G4UHIzxHzH92l+pBmSDF9FLmWfy4HXPH2mo9BgUVktCm1bq0lJwDgjGhGR8KKAMaKKKAPa8oooA2suqZUSkA5GDqflWQlOAAYTgFJGnDFFFAAmStLaUADu5wdeefrR6U7kHIGDk+PDj7qKKAPRKcBBIBOmuoOmennXplrOMoRorIxkfOiigDS64XXCtQAJ6VhRRQAVk2tTbiVpxlJyMgEe40UUAWF7u794kIefbaQUICAEJA4DXXz91FFFAH/9k=";

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

// ─── FINANCIAL YEAR HELPERS ───────────────────────────────────────────────────
// Indian FY: April 1 → March 31. FY2025 = Apr 2024–Mar 2025, FY2026 = Apr 2025–Mar 2026
const getFY = (dateStr) => {
  if(!dateStr) return null;
  const [y,m] = dateStr.split("-").map(Number);
  return m >= 4 ? y+1 : y; // Apr onwards = next year's FY
};
const getFYRange = (fy) => ({
  from: `${fy-1}-04-01`,
  to:   `${fy}-03-31`,
});
const currentFY = () => getFY(today());
const FY_LABEL  = fy => `FY ${fy-1}–${String(fy).slice(2)}`; // "FY 2025–26"



// ─── ROLES ────────────────────────────────────────────────────────────────────
const ROLES = {
  owner:         {label:"Owner",               color:C.accent,  perms:["trips","inbound","billing","settlement","vehicles","employees","payments","reports","reminders","diesel","tafal","admin","driverPay"]},
  manager:       {label:"Manager",             color:C.blue,    perms:["trips","inbound","billing","settlement","vehicles","employees","payments","reports","reminders","diesel","tafal","driverPay"]},
  fleet_manager: {label:"Cement Fleet Manager",color:C.teal,    perms:["cement_trips","billing","diesel_view","driverPay_view"]},
  operator:      {label:"Trip Operator",       color:C.teal,    perms:["trips","billing","diesel"]},
  accounts:      {label:"Accounts",            color:C.purple,  perms:["billing","payments","reports","diesel","tafal"]},
  pump_operator: {label:"Pump Operator",       color:C.orange,  perms:["pump_portal"]},
  viewer:        {label:"Viewer",              color:C.muted,   perms:["reports"]},
};
const can = (user, p) => {
  if(!user) return false;
  const perms = ROLES[user.role]?.perms || [];
  if(perms.includes(p)) return true;
  // cement_trips grants access to "trips" (outbound only) but NOT "inbound"
  if(p==="trips" && perms.includes("cement_trips")) return true;
  // diesel_view grants access to diesel tab (read-only); driverPay_view grants driverPay tab (read-only)
  if(p==="diesel"    && perms.includes("diesel_view"))    return true;
  if(p==="driverPay" && perms.includes("driverPay_view")) return true;
  return false;
};
const canEdit = (user, p) => {
  // Returns false for view-only perms — fleet_manager cannot add/edit diesel or driver pay
  if(!user) return false;
  const perms = ROLES[user.role]?.perms || [];
  if(p==="diesel"    && perms.includes("diesel_view")    && !perms.includes("diesel"))    return false;
  if(p==="driverPay" && perms.includes("driverPay_view") && !perms.includes("driverPay")) return false;
  return perms.includes(p);
};

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
  // loanDeduct = deductPerTrip is only for display reference — NOT subtracted from net
  // The actual per-trip deduction is recorded as loanRecovery on the trip itself
  const loanDeduct       = vehicle ? (vehicle.deductPerTrip||0) : 0;
  const diesel           = confirmedDiesel != null ? confirmedDiesel : (t.dieselEstimate||0);
  const advance          = t.advance || 0;
  const shortageRecovery = t.shortageRecovery || 0;
  const loanRecovery     = t.loanRecovery || 0;
  // Do NOT subtract loanDeduct — it's already captured in loanRecovery on the saved trip
  const net              = gross - advance - tafal - diesel - shortageRecovery - loanRecovery;
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

const Sheet = ({title, onClose, children, noBackdropClose}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}
    onClick={e=>{if(!noBackdropClose && e.target===e.currentTarget)onClose();}}>
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
  const isFleet = user?.role === "fleet_manager";
  const isPump  = user?.role === "pump_operator";
  const items = isPump ? [
    {id:"pump_portal", icon:"⛽", label:"Indents", perm:"pump_portal"},
  ] : isFleet ? [
    {id:"dashboard", icon:"⊞", label:"Home",       perm:null},
    {id:"trips",     icon:"🚚", label:"Trips",      perm:"trips"},
    {id:"billing",   icon:"🧾", label:"Billing",    perm:"billing"},
    {id:"diesel",    icon:"⛽", label:"Diesel",     perm:"diesel"},
    {id:"more",      icon:"⋯",  label:"More",       perm:null},
  ] : [
    {id:"dashboard",icon:"⊞",label:"Home",    perm:null},
    {id:"trips",    icon:"🚚",label:"Trips",   perm:"trips"},
    {id:"billing",  icon:"🧾",label:"Billing", perm:"billing"},
    {id:"diesel",   icon:"⛽",label:"Diesel",  perm:"diesel"},
    {id:"more",     icon:"⋯", label:"More",    perm:null},
  ];
  const visibleItems = items.filter(n => !n.perm || can(user, n.perm));

  // Badge counts
  const pendingBills = (trips||[]).filter(t=>t.status==="Pending Bill").length;
  const unsettledDrivers = (trips||[]).filter(t=>{
    if(t.driverSettled) return false;
    const veh = (vehicles||[]).find(v=>v.truckNo===t.truckNo);
    const gross = (t.qty||0)*(t.givenRate||0);
    const deducts = (t.advance||0)+(t.tafal||0)+(t.dieselEstimate||0)+(t.shortageRecovery||0)+(t.loanRecovery||0);
    const netDue = Math.max(0, gross-deducts);
    const paid = (driverPays||[]).filter(p=>p.tripId===t.id).reduce((s,p)=>s+(p.amount||0),0);
    return netDue>0 && paid<netDue;
  }).length;
  // Only billing and more tabs get badges — trips/diesel tabs don't need them
  const badges = {billing:pendingBills||null, more:unsettledDrivers||null};

  return (
    <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:600,background:C.card,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom,6px)"}}>
      {visibleItems.map(n => {
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
  {id:"inbound",   icon:"🏭",label:"Raw Material",   perm:"inbound",      group:"ops"},
  {id:"driverPay", icon:"🏧",label:"Driver Pay",     perm:"driverPay",    group:"money"},
  {id:"settlement",icon:"💵",label:"Settlement",     perm:"settlement",   group:"money"},
  {id:"tafal",     icon:"🤝",label:"TAFAL",          perm:"tafal",        group:"money"},
  {id:"vehicles",  icon:"🚛",label:"Vehicles",       perm:"vehicles",     group:"fleet"},
  {id:"employees", icon:"👥",label:"Employees",      perm:"employees",    group:"fleet"},
  {id:"payments",  icon:"💰",label:"Payments",        perm:"payments",   group:"finance"},
  {id:"expenses",  icon:"🧮",label:"Expenses",       perm:"payments",     group:"finance"},
  {id:"reports",   icon:"📤",label:"Reports",        perm:"reports",      group:"info"},
  {id:"reminders", icon:"📲",label:"Reminders",      perm:"reminders",    group:"info"},
  {id:"activity",  icon:"📋",label:"Activity Log",   perm:"reports",      group:"info"},
  {id:"admin",     icon:"⚙", label:"User Admin",     perm:"admin",        group:"info"},
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
    const netDue=Math.max(0,(t.qty||0)*(t.givenRate||0)-(t.advance||0)-(t.tafal||0)-(t.dieselEstimate||0)-(t.shortageRecovery||0)-(t.loanRecovery||0));
    return netDue>0 && (driverPays||[]).filter(p=>p.tripId===t.id).reduce((s,p)=>s+(p.amount||0),0)<netDue;
  }).length;
  const tabBadge = {driverPay:unsettled||null, settlement:unsettled||null};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18}}>

      {/* Company card at top of More menu */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,
        padding:"16px",display:"flex",alignItems:"center",gap:14,marginBottom:4}}>
        <img src={LOGO_SRC} alt="M Yantra Logo"
          style={{width:56,height:56,borderRadius:"50%",objectFit:"cover",flexShrink:0,
            border:`2px solid ${C.border}`,boxShadow:"0 2px 8px rgba(0,0,0,0.12)"}} />
        <div>
          <div style={{color:C.accent,fontWeight:900,fontSize:16,letterSpacing:0.5}}>M. YANTRA ENTERPRISES</div>
          <div style={{color:C.muted,fontSize:11,letterSpacing:2,marginTop:2}}>TRANSPORT MANAGEMENT</div>
          <div style={{color:C.text,fontSize:12,marginTop:4,fontWeight:600}}>
            {user.name} · <span style={{color:C.muted,textTransform:"capitalize"}}>{user.role}</span>
          </div>
        </div>
      </div>

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
  const [hints, setHints] = useState([]);

  // Load active usernames on mount for the hint row
  React.useEffect(() => {
    supabase.from('mye_users').select('username,active').then(({data}) => {
      if(data) setHints(data.filter(u=>u.active!==false).map(u=>u.username));
    });
  }, []);

  const go = async () => {
    const username = un.trim();
    if (!username || !pin) { setErr("Enter username and PIN."); return; }
    setBusy(true); setErr("");
    try {
      // Query case-insensitively — usernames may be stored with any casing (Wasim, wasim, WASIM)
      const { data: rows, error } = await supabase
        .from('mye_users')
        .select('*')
        .ilike('username', username);
      const data = (rows||[]).find(u => u.pin === pin && u.active !== false);
      if (error) throw new Error(error.message);
      if (!data) {
        // Give a more helpful message — distinguish wrong user vs wrong PIN
        const anyUser = (rows||[]).find(u => u.active !== false);
        setErr(anyUser ? "Wrong PIN. Try again." : "Username not found. Check spelling.");
      } else {
        const u = {
          id: data.id, name: data.name, username: data.username,
          pin: data.pin, role: data.role, active: data.active,
          createdAt: data.created_at,
          assignedClients: data.assigned_clients || [],
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
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1628 0%,#0d2348 40%,#0f2d5c 70%,#071020 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,-apple-system,sans-serif",overflow:"hidden",position:"relative"}}>

      {/* Animated background particles */}
      <style>{`
        @keyframes floatUp {
          0%   { transform:translateY(100vh) rotate(0deg); opacity:0; }
          10%  { opacity:0.6; }
          90%  { opacity:0.3; }
          100% { transform:translateY(-20px) rotate(360deg); opacity:0; }
        }
        @keyframes pulseRing {
          0%   { transform:scale(0.85); opacity:0.7; }
          50%  { transform:scale(1.08); opacity:0.3; }
          100% { transform:scale(0.85); opacity:0.7; }
        }
        @keyframes pulseRing2 {
          0%   { transform:scale(0.9); opacity:0.5; }
          50%  { transform:scale(1.18); opacity:0.1; }
          100% { transform:scale(0.9); opacity:0.5; }
        }
        @keyframes rotateSlow {
          from { transform:rotate(0deg); }
          to   { transform:rotate(360deg); }
        }
        @keyframes logoGlow {
          0%,100% { box-shadow:0 0 30px 8px #1565c055, 0 0 60px 20px #1565c022, 0 8px 32px rgba(0,0,0,0.5); }
          50%      { box-shadow:0 0 50px 16px #1976d088, 0 0 90px 30px #1976d044, 0 8px 32px rgba(0,0,0,0.5); }
        }
        @keyframes titleShimmer {
          0%   { background-position:200% center; }
          100% { background-position:-200% center; }
        }
        @keyframes truckMove {
          0%   { left:-10%; opacity:0; }
          8%   { opacity:1; }
          92%  { opacity:1; }
          100% { left:110%; opacity:0; }
        }
        @keyframes fadeSlideUp {
          from { opacity:0; transform:translateY(24px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>

      {/* Floating bg particles */}
      {[...Array(8)].map((_,i)=>(
        <div key={i} style={{
          position:"absolute",
          left:`${10+i*11}%`,
          bottom:"-10px",
          width: i%3===0?8:i%3===1?5:11,
          height: i%3===0?8:i%3===1?5:11,
          borderRadius:"50%",
          background: i%2===0?"rgba(21,101,192,0.4)":"rgba(255,167,38,0.3)",
          animation:`floatUp ${6+i*1.4}s ${i*0.9}s infinite linear`,
          pointerEvents:"none",
        }} />
      ))}

      {/* Rotating dashed orbit ring */}
      <div style={{
        position:"absolute",
        width:280,height:280,
        borderRadius:"50%",
        border:"1.5px dashed rgba(21,101,192,0.25)",
        animation:"rotateSlow 18s linear infinite",
        pointerEvents:"none",
      }} />
      <div style={{
        position:"absolute",
        width:340,height:340,
        borderRadius:"50%",
        border:"1px dashed rgba(255,167,38,0.12)",
        animation:"rotateSlow 28s linear infinite reverse",
        pointerEvents:"none",
      }} />

      <div style={{width:"100%",maxWidth:380,position:"relative",zIndex:10}}>

        {/* Logo section */}
        <div style={{textAlign:"center",marginBottom:28,animation:"fadeSlideUp 0.7s ease both"}}>

          {/* Pulse rings behind logo */}
          <div style={{position:"relative",display:"inline-block",marginBottom:16}}>
            <div style={{
              position:"absolute",inset:-18,borderRadius:"50%",
              background:"rgba(21,101,192,0.18)",
              animation:"pulseRing 2.4s ease-in-out infinite",
            }} />
            <div style={{
              position:"absolute",inset:-34,borderRadius:"50%",
              background:"rgba(21,101,192,0.08)",
              animation:"pulseRing2 2.4s ease-in-out infinite",
            }} />
            {/* Logo image */}
            <img src={LOGO_SRC} alt="M Yantra Logo"
              style={{
                width:148,height:148,
                borderRadius:"50%",
                objectFit:"cover",
                display:"block",
                position:"relative",
                animation:"logoGlow 2.4s ease-in-out infinite",
                border:"3px solid rgba(255,255,255,0.15)",
              }} />
          </div>

          {/* Animated truck strip */}
          <div style={{
            height:22,
            overflow:"hidden",
            position:"relative",
            marginBottom:12,
          }}>
            {["🚛","🚚","🚛"].map((t,i)=>(
              <span key={i} style={{
                position:"absolute",
                top:"50%",
                transform:"translateY(-50%) scaleX(-1)",
                fontSize:18,
                animation:`truckMove ${3.8+i*0.5}s ${i*1.3}s infinite linear`,
              }}>{t}</span>
            ))}
          </div>

          {/* Shimmer title */}
          <div style={{
            fontSize:22,
            fontWeight:900,
            letterSpacing:1.5,
            background:"linear-gradient(90deg,#90caf9,#ffffff,#ffd54f,#ffffff,#90caf9)",
            backgroundSize:"200% auto",
            WebkitBackgroundClip:"text",
            WebkitTextFillColor:"transparent",
            backgroundClip:"text",
            animation:"titleShimmer 3s linear infinite",
            marginBottom:4,
          }}>M. YANTRA ENTERPRISES</div>

          <div style={{
            color:"rgba(255,255,255,0.45)",
            fontSize:11,
            letterSpacing:4,
            fontWeight:600,
            textTransform:"uppercase",
          }}>Transport Management</div>
        </div>

        {/* Login card */}
        <div style={{
          background:"rgba(255,255,255,0.06)",
          backdropFilter:"blur(12px)",
          WebkitBackdropFilter:"blur(12px)",
          borderRadius:20,
          border:"1px solid rgba(255,255,255,0.12)",
          padding:24,
          display:"flex",
          flexDirection:"column",
          gap:14,
          boxShadow:"0 20px 60px rgba(0,0,0,0.4)",
          animation:"fadeSlideUp 0.7s 0.2s ease both",
        }}>
          {/* Username */}
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <label style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Username</label>
            <input value={un} onChange={e=>setUn(e.target.value)} placeholder="owner / raju / suresh"
              onKeyDown={e=>e.key==="Enter"&&go()}
              style={{background:"rgba(255,255,255,0.08)",border:"1.5px solid rgba(255,255,255,0.15)",borderRadius:10,
                color:"#fff",padding:"12px 14px",fontSize:15,outline:"none",
                transition:"border-color 0.2s",
              }}
              onFocus={e=>e.target.style.borderColor="rgba(21,101,192,0.8)"}
              onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.15)"}
            />
          </div>
          {/* PIN */}
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <label style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>PIN</label>
            <input value={pin} onChange={e=>setPin(e.target.value)} type="password" placeholder="4-digit PIN"
              onKeyDown={e=>e.key==="Enter"&&go()}
              style={{background:"rgba(255,255,255,0.08)",border:"1.5px solid rgba(255,255,255,0.15)",borderRadius:10,
                color:"#fff",padding:"12px 14px",fontSize:15,outline:"none",letterSpacing:4,
              }}
              onFocus={e=>e.target.style.borderColor="rgba(21,101,192,0.8)"}
              onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.15)"}
            />
          </div>
          {err && (
            <div style={{color:"#ff8a80",fontSize:13,background:"rgba(183,28,28,0.2)",
              border:"1px solid rgba(183,28,28,0.4)",borderRadius:10,padding:"10px 14px"}}>
              ⚠ {err}
            </div>
          )}
          <button onClick={go} disabled={busy}
            style={{
              background:busy?"rgba(21,101,192,0.5)":"linear-gradient(135deg,#1565c0,#1976d2)",
              border:"none",borderRadius:12,color:"#fff",
              padding:"14px",fontSize:15,fontWeight:800,
              cursor:busy?"not-allowed":"pointer",
              letterSpacing:0.5,
              boxShadow:busy?"none":"0 4px 20px rgba(21,101,192,0.5)",
              transition:"all 0.2s",
            }}>
            {busy ? "🔄 Checking…" : "Login →"}
          </button>
        </div>

        <div style={{textAlign:"center",color:"rgba(255,255,255,0.25)",fontSize:11,marginTop:16}}>
          {hints.length > 0
            ? `Users: ${hints.join(" · ")}`
            : "Enter your username and PIN to continue"}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
// ─── ERROR BOUNDARY ──────────────────────────────────────────────────────────
// Catches render crashes and shows a recoverable error screen instead of blank
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError:false, error:null }; }
  static getDerivedStateFromError(error) { return { hasError:true, error }; }
  componentDidCatch(error, info) { console.error("Render crash:", error, info); }
  render() {
    if(this.state.hasError) {
      return (
        <div style={{padding:32,textAlign:"center",fontFamily:"sans-serif"}}>
          <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
          <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Something went wrong</div>
          <div style={{fontSize:13,color:"#666",marginBottom:24,maxWidth:320,margin:"0 auto 24px"}}>
            {this.state.error?.message||"A display error occurred"}
          </div>
          <button onClick={()=>{ this.setState({hasError:false,error:null}); window.location.reload(); }}
            style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:8,
              padding:"10px 24px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem("mye_user");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [tab,  setTab]  = useState("dashboard");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [selectedFY, setSelectedFY] = useState(currentFY()); // Financial year filter
  const [selectedClient, setSelectedClient] = useState(""); // "" = All clients

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
  const [dieselRequests, setDieselRequests, rDR, reloadDieselRequests] = useDB(DB.getDieselRequests, []);
  const dbSetPumpPayments = async (val) => { setPumpPayments(val); }; // pump payments saved individually via recordPumpPayment
  const [settings,    setSettings,    rSt,reloadSettings]    = useDB(DB.getSettings,    {tafalPerTrip:300});
  const [driverPays,  setDriverPays,  rDP,reloadDriverPays]  = useDB(DB.getDriverPays,  []);
  const [expenses,       setExpenses,       rEx, reloadExpenses]      = useDB(DB.getExpenses,       []);
  const [gstReleases,    setGstReleases,    rGR, reloadGst]           = useDB(DB.getGstReleases,    []);
  const [cashTransfers,  setCashTransfers,  rCT, reloadCashTransfers] = useDB(DB.getCashTransfers,  []);
  const [paymentRequests, setPaymentRequests, rPR] = useDB(DB.getPaymentRequests, []);

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
      const prevIds = new Set((prev||[]).map(t=>t.id));
      const nextIds = new Set(next.map(t=>t.id));
      // Delete removed trips
      (prev||[]).filter(t=>!nextIds.has(t.id)).forEach(t => DB.deleteTrip(t.id).catch(e=>setSaveErr(e.message)));
      // Save new/changed trips
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
      const nextIds = new Set(next.map(v=>v.id));
      (prev||[]).filter(v=>!nextIds.has(v.id)).forEach(v => DB.deleteVehicle(v.id).catch(e=>setSaveErr(e.message)));
      next.forEach(v => DB.saveVehicle(v).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetEmployees = (updater) => {
    setEmployees(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const nextIds = new Set(next.map(e=>e.id));
      (prev||[]).filter(e=>!nextIds.has(e.id)).forEach(e => DB.deleteEmployee(e.id).catch(err=>setSaveErr(err.message)));
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
      const prevIds = new Set((prev||[]).map(i=>i.id));
      const nextIds = new Set(next.map(i=>i.id));
      (prev||[]).filter(i=>!nextIds.has(i.id)).forEach(i => DB.deleteIndent(i.id).catch(e=>setSaveErr(e.message)));
      next.forEach(i => DB.saveIndent(i).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetDieselRequests = (updater) => {
    setDieselRequests(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set((prev||[]).map(r=>r.id));
      const nextIds = new Set(next.map(r=>r.id));
      (prev||[]).filter(r=>!nextIds.has(r.id)).forEach(r => DB.deleteDieselRequest(r.id).catch(e=>setSaveErr(e.message)));
      next.forEach(r => DB.saveDieselRequest(r).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetDriverPays = (updater) => {
    setDriverPays(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set((prev||[]).map(p=>p.id));
      const nextIds = new Set(next.map(p=>p.id));
      (prev||[]).filter(p=>!nextIds.has(p.id)).forEach(p => DB.deleteDriverPay(p.id).catch(e=>setSaveErr(e.message)));
      next.filter(p => !prevIds.has(p.id)).forEach(p => DB.saveDriverPay(p).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const dbSetExpenses = (updater) => {
    setExpenses(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const prevIds = new Set((prev||[]).map(e=>e.id));
      next.filter(e => !prevIds.has(e.id)).forEach(e => DB.saveExpense(e).catch(err => setSaveErr(err.message)));

      // ── Dedup by UTR: keep oldest, delete all exact duplicates from DB ──
      // Handles: e.utr field directly, or notes field like "UTR:151493411"
      const extractUtr = e => {
        if(e.utr && e.utr.trim()) return e.utr.trim().toLowerCase();
        const m = (e.notes||"").match(/UTR[:\s]*([\w]+)/i);
        return m ? m[1].toLowerCase() : "";
      };
      const seenUtr = new Map();
      const toDelete = [];
      // Sort oldest-first so we keep the first occurrence
      [...next]
        .sort((a,b)=>(a.createdAt||a.date||"").localeCompare(b.createdAt||b.date||""))
        .forEach(e => {
          const rawUtr = extractUtr(e);
          if(!rawUtr) return; // no UTR — always keep
          if(seenUtr.has(rawUtr)) {
            toDelete.push(e.id);
          } else {
            seenUtr.set(rawUtr, e.id);
          }
        });
      if(toDelete.length > 0) {
        toDelete.forEach(id => DB.deleteExpense(id).catch(err => console.warn("dedup delete:", err)));
        console.log("[Expenses] Auto-removed", toDelete.length, "duplicate UTR expense(s) from DB");
        return next.filter(e => !toDelete.includes(e.id));
      }
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
      const nextIds = new Set(next.map(u=>u.id));
      (prev||[]).filter(u=>!nextIds.has(u.id)).forEach(u => DB.deleteUser(u.id).catch(e=>setSaveErr(e.message)));
      next.forEach(u => DB.saveUser(u).catch(e => setSaveErr(e.message)));
      return next;
    });
  };

  const fyRange = getFYRange(selectedFY);
  const fyTrips = trips.filter(t => t.date >= fyRange.from && t.date <= fyRange.to);
  // Role-filtered trips — non-owners only see trips for their assigned clients
  // This is the single source of truth used by ALL tabs via sp.trips
  const roleTrips = trips.filter(t => userCanSeeClient(user, t.client||DEFAULT_CLIENT));
  const roleFyTrips = fyTrips.filter(t => userCanSeeClient(user, t.client||DEFAULT_CLIENT));

  const sp = {
    trips: roleTrips, setTrips:dbSetTrips,
    fyTrips: roleFyTrips, selectedFY, setSelectedFY,
    selectedClient, setSelectedClient,
    vehicles, setVehicles:dbSetVehicles,
    employees, setEmployees:dbSetEmployees,
    payments, setPayments:dbSetPayments,
    settlements, setSettlements:dbSetSettlements,
    activity, setActivity,
    pumps, setPumps:dbSetPumps,
    indents, setIndents:dbSetIndents,
    pumpPayments, setPumpPayments:dbSetPumpPayments,
    dieselRequests, setDieselRequests:dbSetDieselRequests,
    settings:settings||{tafalPerTrip:300}, setSettings:dbSetSettings,
    driverPays, setDriverPays:dbSetDriverPays,
    expenses, setExpenses:dbSetExpenses,
    gstReleases, setGstReleases:dbSetGstReleases,
    cashTransfers, setCashTransfers:dbSetCashTransfers,
    paymentRequests, setPaymentRequests,
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
      const deducts = (t.advance||0)+(t.tafal||0)+(t.dieselEstimate||0)+((t.shortage||0)*(t.givenRate||0))+(t.shortageRecovery||0)+(t.loanRecovery||0);
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
      const deducts = (t.advance||0)+(t.tafal||0)+(t.dieselEstimate||0)+((t.shortage||0)*(t.givenRate||0))+(t.shortageRecovery||0)+(t.loanRecovery||0);
      const netDue  = Math.max(0, gross - deducts);
      return {...t, driverSettled:true, settledBy:"auto", netPaid:netDue};
    }));
  }, [trips, driverPays, vehicles, allTripsLoaded]);

  if (!user) {
    if (loading) return (
      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0a1628 0%,#0d2348 40%,#0f2d5c 70%,#071020 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:0,fontFamily:"system-ui",overflow:"hidden",position:"relative"}}>
        <style>{`
          @keyframes dbPulseRing {
            0%,100% { transform:scale(0.88); opacity:0.6; }
            50%      { transform:scale(1.12); opacity:0.2; }
          }
          @keyframes dbPulseRing2 {
            0%,100% { transform:scale(0.8); opacity:0.4; }
            50%      { transform:scale(1.22); opacity:0.08; }
          }
          @keyframes dbLogoGlow {
            0%,100% { box-shadow:0 0 30px 8px #1565c055,0 0 60px 20px #1565c022,0 8px 32px rgba(0,0,0,0.5); }
            50%      { box-shadow:0 0 55px 18px #1976d088,0 0 90px 30px #1976d044,0 8px 32px rgba(0,0,0,0.5); }
          }
          @keyframes dbDotBounce {
            0%,80%,100% { transform:translateY(0); opacity:0.4; }
            40%          { transform:translateY(-10px); opacity:1; }
          }
          @keyframes dbTruckLoad {
            0%   { left:-5%; opacity:0; }
            8%   { opacity:1; }
            92%  { opacity:1; }
            100% { left:105%; opacity:0; }
          }
          @keyframes dbRotate {
            from { transform:rotate(0deg); }
            to   { transform:rotate(360deg); }
          }
          @keyframes dbShimmer {
            0%   { background-position:200% center; }
            100% { background-position:-200% center; }
          }
          @keyframes dbFloat {
            0%,100% { transform:translateY(0px); }
            50%      { transform:translateY(-8px); }
          }
        `}</style>

        {/* Rotating orbit rings */}
        <div style={{position:"absolute",width:280,height:280,borderRadius:"50%",border:"1.5px dashed rgba(21,101,192,0.2)",animation:"dbRotate 18s linear infinite",pointerEvents:"none"}} />
        <div style={{position:"absolute",width:360,height:360,borderRadius:"50%",border:"1px dashed rgba(255,167,38,0.1)",animation:"dbRotate 28s linear infinite reverse",pointerEvents:"none"}} />

        {/* Logo with pulse rings */}
        <div style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:28,animation:"dbFloat 3s ease-in-out infinite"}}>
          <div style={{position:"absolute",inset:-20,borderRadius:"50%",background:"rgba(21,101,192,0.15)",animation:"dbPulseRing 2.2s ease-in-out infinite"}} />
          <div style={{position:"absolute",inset:-38,borderRadius:"50%",background:"rgba(21,101,192,0.07)",animation:"dbPulseRing2 2.2s ease-in-out infinite"}} />
          <img src={LOGO_SRC} alt="M Yantra"
            style={{width:130,height:130,borderRadius:"50%",objectFit:"cover",position:"relative",
              border:"3px solid rgba(255,255,255,0.15)",
              animation:"dbLogoGlow 2.2s ease-in-out infinite"}} />
        </div>

        {/* Title */}
        <div style={{fontSize:20,fontWeight:900,letterSpacing:1.5,
          background:"linear-gradient(90deg,#90caf9,#ffffff,#ffd54f,#ffffff,#90caf9)",
          backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
          backgroundClip:"text",animation:"dbShimmer 3s linear infinite",marginBottom:6}}>
          M. YANTRA ENTERPRISES
        </div>

        {/* Truck animation strip */}
        <div style={{width:220,height:28,position:"relative",overflow:"hidden",marginBottom:18}}>
          {["🚛","🚚","🚛"].map((_,i)=>(
            <span key={i} style={{position:"absolute",top:"50%",
              transform:"translateY(-50%) scaleX(-1)",fontSize:18,
              animation:`dbTruckLoad ${3.6+i*0.5}s ${i*1.2}s infinite linear`}}>🚛</span>
          ))}
        </div>

        {/* Connecting text + bouncing dots */}
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{color:"rgba(255,255,255,0.5)",fontSize:13,letterSpacing:1}}>Connecting to database</span>
          {[0,1,2].map(i=>(
            <span key={i} style={{display:"inline-block",width:6,height:6,borderRadius:"50%",
              background:"#90caf9",
              animation:`dbDotBounce 1.2s ${i*0.2}s infinite ease-in-out`}} />
          ))}
        </div>
      </div>
    );
    return <Login onLogin={u=>{
      try { sessionStorage.setItem("mye_user", JSON.stringify(u)); } catch{}
      setUser(u);
      if(u.role==="pump_operator") setTab("pump_portal");
      log("LOGIN",`${u.name} signed in`);
    }} />;
  }

  return (
    <div style={{background:C.bg,minHeight:"100vh",fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif",color:C.text,maxWidth:600,margin:"0 auto",paddingBottom:80,position:"relative"}}>
        {/* Watermark removed */}
      {/* TOP BAR */}
      <div style={{position:"sticky",top:0,zIndex:50,background:C.card,borderBottom:`1px solid ${C.border}`,padding:"8px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <img src={LOGO_SRC} alt="M Yantra"
            style={{width:36,height:36,borderRadius:"50%",objectFit:"cover",flexShrink:0}} />
          <div>
            <div style={{color:C.accent,fontWeight:900,fontSize:14}}>M. YANTRA</div>
            <div style={{color:C.muted,fontSize:10,letterSpacing:1}}>TRANSPORT MANAGEMENT</div>
          </div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:C.green,animation:"pulse 2s infinite"}} />
            <span style={{color:C.muted,fontSize:11}}>Live</span>
          </div>
          <Av name={user.name} role={user.role} />
          <button onClick={()=>{
            log("LOGOUT",`${user.name} signed out`);
            try { sessionStorage.removeItem("mye_user"); } catch{}
            setUser(null);
          }}
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

      {/* FY + CLIENT FILTER BAR */}
      {(()=>{
        // Build FY list from data
        const fySet = new Set([currentFY()]);
        (trips||[]).forEach(t=>{ const fy=getFY(t.date); if(fy) fySet.add(fy); });
        const fyList = [...fySet].sort((a,b)=>b-a);
        // Build client list — always show (even single client, so user knows filter is active)
        const clientsInData = CLIENTS.filter(c=>
          userCanSeeClient(user,c) && (trips||[]).some(t=>(t.client||DEFAULT_CLIENT)===c)
        );
        const showBar = fyList.length > 1 || clientsInData.length >= 1;
        if(!showBar) return null;
        return (
          <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"8px 16px",display:"flex",flexDirection:"column",gap:6}}>
            {/* FY row */}
            {fyList.length > 1 && (
              <div style={{display:"flex",alignItems:"center",gap:6,overflowX:"auto"}}>
                <span style={{color:C.muted,fontSize:10,fontWeight:700,flexShrink:0,letterSpacing:0.5}}>📅 FY</span>
                {fyList.map(fy=>(
                  <button key={fy} onClick={()=>setSelectedFY(fy)}
                    style={{padding:"3px 9px",borderRadius:14,fontSize:11,fontWeight:700,
                      cursor:"pointer",flexShrink:0,whiteSpace:"nowrap",
                      border:`1.5px solid ${selectedFY===fy?C.accent:C.border}`,
                      background:selectedFY===fy?C.accent+"22":"transparent",
                      color:selectedFY===fy?C.accent:C.muted}}>
                    {FY_LABEL(fy)}{fy===currentFY()?" ←":""}
                  </button>
                ))}
              </div>
            )}
            {/* Client row — always shown */}
            <div style={{display:"flex",alignItems:"center",gap:6,overflowX:"auto"}}>
              <span style={{color:C.muted,fontSize:10,fontWeight:700,flexShrink:0,letterSpacing:0.5}}>🏭 Client</span>
              {["", ...clientsInData].map(c=>{
                const label = c==="" ? "All" : c.replace("Shree Cement ","SC ").replace("Ultratech ","UT ");
                const col = c===""?C.muted:c.includes("Ultratech")?C.orange:c.includes("Guntur")?C.purple:C.blue;
                const active = selectedClient===c;
                return (
                  <button key={c||"all"} onClick={()=>setSelectedClient(c)}
                    style={{padding:"3px 9px",borderRadius:14,fontSize:11,fontWeight:700,
                      cursor:"pointer",flexShrink:0,whiteSpace:"nowrap",
                      border:`1.5px solid ${active?col:C.border}`,
                      background:active?col+"22":"transparent",
                      color:active?col:C.muted}}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div style={{padding:"14px 16px 8px"}}>
        <ErrorBoundary>
        {tab==="dashboard"  && <Dashboard {...sp} setTab={setTab} />}
        {tab==="trips"      && can(user,"trips")      && <Trips      {...sp} tripType="outbound" />}
        {tab==="inbound"    && can(user,"inbound")    && <Trips      {...sp} tripType="inbound" />}
        {tab==="billing"    && can(user,"billing")    && <Billing    {...sp} />}
        {tab==="settlement" && can(user,"settlement") && <Settlement {...sp} />}
        {tab==="tafal"      && can(user,"tafal")      && <TafalMod   {...sp} />}
        {tab==="diesel"     && can(user,"diesel")     && <DieselMod  {...sp} viewOnly={!canEdit(user,"diesel")} />}
        {tab==="pump_portal"&& can(user,"pump_portal")&& <PumpPortal {...sp} />}
        {tab==="vehicles"   && can(user,"vehicles")   && <Vehicles   {...sp} />}
        {tab==="employees"  && can(user,"employees")  && <Employees  {...sp} />}
        {tab==="payments"   && can(user,"payments")   && <Payments   {...sp} />}
        {tab==="driverPay"  && can(user,"driverPay") && <DriverPayments {...sp} viewOnly={!canEdit(user,"driverPay")} />}
        {tab==="expenses"   && can(user,"payments")   && <ExpensesLedger {...sp} />}
        {tab==="reports"    && can(user,"reports")    && <Reports    {...sp} />}
        {tab==="reminders"  && can(user,"reminders")  && <Reminders  {...sp} />}
        {tab==="activity"   && can(user,"reports")    && <ActivityLog activity={activity} />}
        {tab==="admin"      && can(user,"admin")      && <UserAdmin  users={users} setUsers={dbSetUsers} user={user} log={log} />}
        {tab==="more"       && <MoreMenu user={user} setTab={setTab} trips={roleTrips} driverPays={driverPays} vehicles={vehicles} />}
        </ErrorBoundary>
      </div>
      <BottomNav tab={tab} setTab={setTab} user={user} trips={roleTrips} driverPays={driverPays} vehicles={vehicles} />
    </div>
  );
}
// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({trips, fyTrips, payments, vehicles, employees, indents, pumps, pumpPayments, driverPays, activity, settings, setTab, user, selectedFY}) {
  const displayTrips = fyTrips || trips; // use FY-filtered if available
  const todayStr    = today();
  const todayTrips  = displayTrips.filter(t => t.date===todayStr);
  const pending     = displayTrips.filter(t => t.status==="Pending Bill");
  const weekAgo     = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
  const weekAgoStr  = weekAgo.toISOString().split("T")[0];
  const oldUnsettled = displayTrips.filter(t => !t.driverSettled && t.date < weekAgoStr && (t.qty||0)*(t.givenRate||0)>0);
  const margin      = displayTrips.reduce((s,t) => s + t.qty*(t.frRate-t.givenRate), 0);
  const todayMargin = todayTrips.reduce((s,t) => s + t.qty*(t.frRate-t.givenRate), 0);
  const confirmedIndents = indents.filter(i => i.confirmed);
  const totalDieselOwed = confirmedIndents.reduce((s,i) => s+(+(i.amount)||0), 0);
  const totalDieselPaid = (pumpPayments||[]).reduce((s,p) => s+(+(p.amount)||0), 0);
  const unpaidDiesel = Math.max(0, totalDieselOwed - totalDieselPaid);
  const tafalPool   = displayTrips.reduce((s,t) => s+(t.tafal||0), 0);
  const vLoan       = vehicles.reduce((s,v) => s + Math.max(0, v.loan-v.loanRecovered), 0);
  const fyLabel     = selectedFY ? FY_LABEL(selectedFY) : "";

  // ── Owner-only: pending receivables from clients ──────────────────────────
  const totalBilled   = displayTrips.filter(t=>t.type==="outbound").reduce((s,t)=>s+(t.qty||0)*(t.frRate||0),0);
  const totalReceived = (payments||[]).reduce((s,p)=>s+Number(p.totalPaid||0),0);
  const pendingReceivable = Math.max(0, totalBilled - totalReceived);

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

      {/* Quick Actions — fleet_manager sees no RM Trip button */}
      {can(user,"trips") && (
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setTab("trips")}   style={{flex:1,background:C.accent+"22",border:`1.5px solid ${C.accent}`,color:C.accent,borderRadius:12,padding:"12px 6px",fontSize:13,fontWeight:700,cursor:"pointer"}}>🚚 + Cement</button>
          {user.role!=="fleet_manager" && <button onClick={()=>setTab("inbound")} style={{flex:1,background:C.teal+"22",  border:`1.5px solid ${C.teal}`,  color:C.teal,  borderRadius:12,padding:"12px 6px",fontSize:13,fontWeight:700,cursor:"pointer"}}>🏭 + RM Trip</button>}
          {can(user,"diesel") && <button onClick={()=>setTab("diesel")} style={{flex:1,background:C.orange+"22",border:`1.5px solid ${C.orange}`,color:C.orange,borderRadius:12,padding:"12px 6px",fontSize:13,fontWeight:700,cursor:"pointer"}}>⛽ Indent</button>}
        </div>
      )}

      {/* Today's summary */}
      <div style={{background:C.card,borderRadius:14,padding:"14px 16px"}}>
        <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
          Today — {todayStr}
          {fyLabel && <span style={{color:C.accent,marginLeft:8,fontWeight:600}}>· {fyLabel}</span>}
        </div>
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

      {/* ── OWNER SUMMARY: Client × Material breakdown + Receivables ── */}
      {(user.role==="owner"||user.role==="manager") && (()=>{
        const outbound = displayTrips.filter(t=>t.type==="outbound");
        const inbound  = displayTrips.filter(t=>t.type==="inbound");
        // Cement by client
        const clientData = CLIENTS.map(c=>({
          name: c,
          short: c.replace("Shree Cement ","SC ").replace("Ultratech ","UT "),
          color: c.includes("Ultratech")?C.orange:c.includes("Guntur")?C.purple:C.blue,
          cement: outbound.filter(t=>(t.client||DEFAULT_CLIENT)===c),
        })).filter(cd=>cd.cement.length>0);
        const huskTrips = outbound.filter(t=>(t.grade||"").toLowerCase().includes("husk"));
        return (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>
              Business Summary {fyLabel && <span style={{color:C.accent}}>· {fyLabel}</span>}
            </div>

            {/* Receivables card */}
            <div style={{background:C.card,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`}}>
              <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:0.5,marginBottom:8}}>💰 RECEIVABLES</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  {l:"Total Billed",   v:fmt(totalBilled),         c:C.blue},
                  {l:"Received",       v:fmt(totalReceived),       c:C.green},
                  {l:"Pending",        v:fmt(pendingReceivable),   c:pendingReceivable>0?C.red:C.muted},
                ].map(x=>(
                  <div key={x.l} style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}>
                    <div style={{color:x.c,fontWeight:800,fontSize:13}}>{x.v}</div>
                    <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",marginTop:2}}>{x.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Client × Cement breakdown */}
            {clientData.length>0 && (
              <div style={{background:C.card,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                <div style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:0.5,marginBottom:8}}>🏭 CEMENT BY CLIENT</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {clientData.map(cd=>{
                    const billed   = cd.cement.reduce((s,t)=>s+(t.qty||0)*(t.frRate||0),0);
                    const received = (payments||[]).filter(p=>p.client===cd.name||!p.client).reduce((s,p)=>s+Number(p.totalPaid||0),0);
                    const pending  = cd.cement.filter(t=>t.status==="Pending Bill");
                    return (
                      <div key={cd.name} style={{display:"flex",alignItems:"center",gap:10,
                        background:C.bg,borderRadius:8,padding:"8px 10px",
                        borderLeft:`3px solid ${cd.color}`}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:cd.color,fontWeight:700,fontSize:12}}>{cd.short}</div>
                          <div style={{color:C.muted,fontSize:10}}>{cd.cement.length} trips · {cd.cement.reduce((s,t)=>s+(t.qty||0),0)} MT</div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{color:C.blue,fontWeight:700,fontSize:12}}>{fmt(billed)}</div>
                          <div style={{color:C.muted,fontSize:9}}>billed</div>
                        </div>
                        {pending.length>0 && (
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <div style={{color:C.orange,fontWeight:700,fontSize:12}}>{pending.length}</div>
                            <div style={{color:C.muted,fontSize:9}}>pending</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Raw Material + Husk row */}
            {(inbound.length>0||huskTrips.length>0) && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {inbound.length>0 && (
                  <div style={{background:C.card,borderRadius:12,padding:"10px 12px",borderTop:`3px solid ${C.teal}`}}>
                    <div style={{color:C.teal,fontWeight:700,fontSize:10,marginBottom:4}}>🏭 RAW MATERIAL</div>
                    <div style={{color:C.text,fontWeight:800,fontSize:16}}>{inbound.length}</div>
                    <div style={{color:C.muted,fontSize:10}}>{inbound.reduce((s,t)=>s+(t.qty||0),0)} MT</div>
                  </div>
                )}
                {huskTrips.length>0 && (
                  <div style={{background:C.card,borderRadius:12,padding:"10px 12px",borderTop:`3px solid ${C.orange}`}}>
                    <div style={{color:C.orange,fontWeight:700,fontSize:10,marginBottom:4}}>🌾 HUSK</div>
                    <div style={{color:C.text,fontWeight:800,fontSize:16}}>{huskTrips.length}</div>
                    <div style={{color:C.muted,fontSize:10}}>{huskTrips.reduce((s,t)=>s+(t.qty||0),0)} MT</div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* KPI grid — fleet_manager sees only total trips + tafal pool */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <KPI icon="🚚" label="Total Trips"     value={displayTrips.filter(t=>t.type==="outbound").length} color={C.blue} sub={fyLabel||"cement trips"} />
        <KPI icon="🤝" label="TAFAL Pool"      value={fmt(tafalPool)}   color={C.purple} sub={`₹${settings?.tafalPerTrip||300}/trip`} />
        {user.role!=="fleet_manager" && <>
          <KPI icon="📈" label="Total Margin"  value={fmt(margin)}      color={C.green} sub={fyLabel||"all time"} />
          <KPI icon="🔴" label="Vehicle Loans" value={fmt(vLoan)}       color={C.red} />
        </>}
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





// ─── BATCH DI SCANNER ─────────────────────────────────────────────────────────
// Flow: Upload DIs → AI scans → Auto-group by vehicle → User reviews groups
// (select which DIs merge, set order type + driver rate per DI, group-level fields)
// → Save All → DB.getNextLR() assigns LR atomically per group
function BatchDIScanner({ trips, vehicles, setVehicles, setTrips, settings, user, log, onClose, employees=[], cashTransfers=[], setCashTransfers, dieselRequests=[], setDieselRequests }) {

  // ── Raw scanned items (one per uploaded file) ────────────────────────────────
  // item: { id, file, status, extracted, error }
  const [items,      setItems]      = useState([]);
  const [saving,     setSaving]     = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [savedLRs,   setSavedLRs]   = useState([]); // [{lrNo, truckNo, qty, diCount}]
  const [lrError,    setLrError]    = useState(""); // LR assignment error
  const inputRef = useRef();

  // ── Groups (built from items after scanning) ─────────────────────────────────
  // group: {
  //   id,                    // uid
  //   truckNo,               // vehicle
  //   diIds: [itemId, ...],  // which items are IN this group (checked)
  //   client,                // client override
  //   tafal, diesel, dieselIndentNo, advance, cashEmpId,
  //   shortageRecovery, loanRecovery
  // }
  // Each item also carries: orderType, givenRate, grFile, invoiceFile (per-DI)
  const [groups, setGroups] = useState([]); // set after all scans done
  const [groupsBuilt, setGroupsBuilt] = useState(false);

  // ── DI SCAN PROMPT (unchanged) ───────────────────────────────────────────────
  const DI_PROMPT = `You are reading a Delivery Instruction (DI) or GR copy for a cement transport company in India.
Extract the following fields and return ONLY a JSON object:
{
  "diNo": "DI number",
  "grNo": "GR number (e.g. 1070/MYE/3969)",
  "truckNo": "Vehicle registration number — uppercase no spaces",
  "consignee": "Consignee name",
  "consignor": "Consignor/plant name",
  "from": "Loading location",
  "to": "Destination",
  "grade": "Material grade — exactly 'Cement Packed' or 'Cement Bulk' for cement",
  "district": "Destination district from consignee address",
  "state": "Destination state name",
  "qty": "Quantity in MT as number only",
  "bags": "Number of bags as number only",
  "frRate": "Freight rate per MT — look in Rate PMT column, number only",
  "date": "Date in YYYY-MM-DD format"
}
Rules: Return ONLY the JSON. Empty string for missing text fields, 0 for missing numbers.`;

  const fileToBase64 = file => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const userClients = getUserClients(user); // clients this user is allowed to see/use

  const detectClient = ex => {
    const hay = [ex.consignee||"",ex.consignor||"",ex.from||"",ex.to||""].join(" ").toLowerCase();
    if(hay.includes("ultratech")) return "Ultratech Malkhed";
    if(hay.includes("guntur"))    return "Shree Cement Guntur";
    return "Shree Cement Kodla";
  };

  const scanFile = async (id, file) => {
    setItems(prev => prev.map(x => x.id===id ? {...x, status:"scanning"} : x));
    try {
      const base64 = await fileToBase64(file);
      const resp = await fetch("/.netlify/functions/scan-di", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ base64, mediaType: file.type, prompt: DI_PROMPT }),
      });
      const data = await resp.json();
      if(!resp.ok||data.error) throw new Error(data.error||"Scan failed");
      const extracted = JSON.parse(data.text.replace(/```json|```/g,"").trim());
      const client = detectClient(extracted);
      // Check if scanned client is in user's allowed clients
      if(userClients.length < CLIENTS.length && !userClients.includes(client)) {
        setItems(prev => prev.map(x => x.id===id
          ? {...x, status:"error",
              error:`You are not assigned to "${client}". Contact owner to get access.`}
          : x));
        return;
      }
      setItems(prev => {
        // First mark this item done
        const updated = prev.map(x => x.id===id
          ? {...x, status:"done", extracted:{...extracted, client}, error:null}
          : x);
        // Then auto-remove duplicate diNo within this batch session
        // Keep the FIRST occurrence (lowest index), remove subsequent ones
        const diNo = (extracted.diNo||"").trim();
        if(!diNo) return updated;
        let firstSeen = false;
        return updated.filter(x => {
          const xDiNo = (x.extracted?.diNo||"").trim();
          if(xDiNo !== diNo) return true; // different DI — keep
          if(!firstSeen) { firstSeen = true; return true; } // first occurrence — keep
          return false; // duplicate — auto-remove
        });
      });
    } catch(e) {
      setItems(prev => prev.map(x => x.id===id ? {...x, status:"error", error:e.message} : x));
    }
  };

  const addFiles = files => {
    // Filter out files already in the queue (same name + size = same file uploaded twice)
    const existingFileKeys = new Set(items.map(x=>x.file?`${x.file.name}|${x.file.size}`:""));
    const uniqueFiles = Array.from(files).filter(f => !existingFileKeys.has(`${f.name}|${f.size}`));
    if(uniqueFiles.length === 0) return; // all duplicates — nothing to do
    const newItems = uniqueFiles.map(file => ({
      id:uid(), file, status:"pending",
      extracted:null, error:null,
      // per-DI fields
      orderType:"godown", givenRate:"", grFile:null, invoiceFile:null,
    }));
    setItems(prev => [...prev, ...newItems]);
    setGroupsBuilt(false); // new files = rebuild groups
    setSavedLRs([]);       // clear previous LR results
    const scanSequentially = async (items) => {
      for(let i = 0; i < items.length; i++) {
        await scanFile(items[i].id, items[i].file);
        if(i < items.length - 1) await new Promise(res => setTimeout(res, 1200));
      }
    };
    scanSequentially(newItems);
  };

  // ── Auto-build groups when all scans complete ─────────────────────────────────
  const doneItems  = items.filter(x => x.status==="done");
  const scanningNow = items.some(x => x.status==="scanning"||x.status==="pending");

  useEffect(() => {
    if(scanningNow || items.length===0 || groupsBuilt) return;
    if(items.some(x=>x.status==="pending"||x.status==="scanning")) return;
    // All done (or error) — build groups by truckNo
    const byTruck = {};
    doneItems.forEach(item => {
      const tn = (item.extracted?.truckNo||"UNKNOWN").toUpperCase().trim();
      if(!byTruck[tn]) byTruck[tn] = [];
      byTruck[tn].push(item.id);
    });
    const newGroups = Object.entries(byTruck).map(([truckNo, diIds]) => {
      const firstItem = doneItems.find(x=>x.id===diIds[0]);
      const client = firstItem?.extracted?.client || DEFAULT_CLIENT;
      // Auto loan recovery from owner's deductPerTrip, capped at balance
      const vehG = (vehicles||[]).find(v=>v.truckNo===truckNo);
      const ownerNameG = (vehG?.ownerName||"").trim();
      const ownerVehsG = ownerNameG?(vehicles||[]).filter(x=>(x.ownerName||"").trim()===ownerNameG):(vehG?[vehG]:[]);
      const ownerDeductG = ownerVehsG[0]?.deductPerTrip||0;
      const ownerBalG = ownerVehsG.reduce((s,x)=>s+Math.max(0,(x.loan||0)-(x.loanRecovered||0)),0);
      const autoLoanG = ownerBalG<=0 ? 0 : (ownerDeductG>0 ? Math.min(ownerDeductG, ownerBalG) : ownerBalG);
      return {
        id: uid(),
        truckNo,
        diIds,
        client,
        tafal: String(settings?.tafalPerTrip||300),
        diesel: "0",
        dieselIndentNo: "",
        advance: "0",
        cashEmpId: "",
        shortageRecovery: "0",
        loanRecovery: String(autoLoanG),
        driverPhone: vehG?.driverPhone || "",
      };
    });
    setGroups(newGroups);
    setGroupsBuilt(true);
  }, [scanningNow, items.length, groupsBuilt]);

  // Re-build if new items arrive (user uploads more after first batch)
  const itemCount = items.length;
  useEffect(() => { setGroupsBuilt(false); }, [itemCount]);

  // ── Group helpers ─────────────────────────────────────────────────────────────
  const updateGroup = (gid, field, val) =>
    setGroups(prev => prev.map(g => g.id===gid ? {...g,[field]:val} : g));

  const toggleDI = (gid, itemId) => {
    setGroups(prev => {
      const g = prev.find(x=>x.id===gid);
      if(!g) return prev;
      const checked = g.diIds.includes(itemId);
      if(checked && g.diIds.length===1) return prev; // can't uncheck last — already solo

      if(checked) {
        // Uncheck: remove from group AND spawn new solo group for this DI
        const updated = prev.map(x => x.id===gid ? {...x, diIds:x.diIds.filter(id=>id!==itemId)} : x);
        const item = doneItems.find(x=>x.id===itemId);
        const vehT2 = (vehicles||[]).find(v=>v.truckNo===(item?.extracted?.truckNo||"").toUpperCase().trim());
        const ownerN2 = (vehT2?.ownerName||"").trim();
        const ownerVs2 = ownerN2?(vehicles||[]).filter(x=>(x.ownerName||"").trim()===ownerN2):(vehT2?[vehT2]:[]);
        const ownerDed2 = ownerVs2[0]?.deductPerTrip||0;
        const ownerBal2 = ownerVs2.reduce((s,x)=>s+Math.max(0,(x.loan||0)-(x.loanRecovered||0)),0);
        const autoLR2 = ownerBal2<=0?0:Math.min(ownerDed2,ownerBal2);
        const solo = {
          id:uid(), truckNo:g.truckNo, diIds:[itemId],
          client:g.client, tafal:g.tafal,
          diesel:"0", dieselIndentNo:"",
          advance:"0", cashEmpId:"",
          shortageRecovery:"0", loanRecovery:String(autoLR2),
          _splitFrom:gid,
        };
        return [...updated, solo];
      } else {
        // Re-check: merge back into parent group, remove its solo group
        const soloGroup = prev.find(x=>x.diIds.length===1&&x.diIds[0]===itemId&&x._splitFrom===gid);
        const filtered = soloGroup ? prev.filter(x=>x.id!==soloGroup.id) : prev;
        return filtered.map(x => x.id===gid ? {...x, diIds:[...x.diIds, itemId]} : x);
      }
    });
  };

  // ── Per-item helpers ──────────────────────────────────────────────────────────
  const updateItem = (id, field, val) =>
    setItems(prev => prev.map(x => x.id===id ? {...x,[field]:val} : x));

  // ── Duplicate DI check (same as original) ────────────────────────────────────
  const checkDupDI = (diNo) => {
    const d = (diNo||"").trim();
    if(!d) return null;
    const inTrips = (trips||[]).find(t => {
      if(t.diLines&&t.diLines.length>0) return t.diLines.some(x=>x.diNo===d);
      return (t.diNo||"").split("+").map(s=>s.trim()).includes(d);
    });
    if(inTrips) return {source:"saved", trip:inTrips};
    return null;
  };

  // ── Readiness check per group ─────────────────────────────────────────────────
  const groupReady = (g) => {
    const groupItems = doneItems.filter(x=>g.diIds.includes(x.id));
    if(groupItems.length===0) return false;
    for(const item of groupItems) {
      if(!item.givenRate || +item.givenRate<=0) return false;
      const frRate = +item.extracted?.frRate||0;
      if(frRate - (+item.givenRate) < 30) return false;
      if(item.orderType==="party" && (!item.grFile||!item.invoiceFile)) return false;
      // Block if DI already exists in saved trips
      if(checkDupDI(item.extracted?.diNo)) return false;
    }
    if(+g.diesel > 0 && !g.dieselIndentNo.trim()) return false;
    return true;
  };

  const readyGroups = groups.filter(groupReady);
  const canSave = readyGroups.length > 0 && !saving;

  // ── Save All ──────────────────────────────────────────────────────────────────
  const saveAll = async () => {
    setLrError("");
    // ── Pre-validate all groups (preserve all original validations) ──────────
    try {
    for(const g of readyGroups) {
      const groupItems = doneItems.filter(x=>g.diIds.includes(x.id));

      // Duplicate DI check
      for(const item of groupItems) {
        const diNo = (item.extracted?.diNo||"").trim();
        if(diNo) {
          const dupSaved = checkDupDI(diNo);
          if(dupSaved) {
            alert(`DI ${diNo} (truck ${g.truckNo}) is already recorded in LR ${dupSaved.trip.lrNo}.\nCannot save.`);
            return;
          }
          // Dup within other groups in this batch
          const dupInBatch = readyGroups.flatMap(og=>
            og.id!==g.id ? doneItems.filter(x=>og.diIds.includes(x.id)) : []
          ).find(x=>(x.extracted?.diNo||"").trim()===diNo);
          if(dupInBatch) {
            alert(`DI ${diNo} appears in another group. Two trips cannot share the same DI.`);
            return;
          }
        }
      }

      // Margin check per DI
      for(const item of groupItems) {
        const margin = (+item.extracted?.frRate||0) - (+item.givenRate||0);
        if(margin < 30) {
          alert(`Truck ${g.truckNo} · DI ${item.extracted?.diNo||"?"}: Margin ₹${margin}/MT is below ₹30 minimum.`);
          return;
        }
      }

      // Diesel indent
      if(+g.diesel > 0 && !g.dieselIndentNo.trim()) {
        alert(`Truck ${g.truckNo}: Diesel Indent No is required when Diesel Estimate is entered.`);
        return;
      }
      if(g.dieselIndentNo.trim()) {
        const dupIndent = (trips||[]).some(t =>
          t.dieselIndentNo && t.dieselIndentNo.trim() === g.dieselIndentNo.trim()
        );
        if(dupIndent) {
          alert(`Truck ${g.truckNo}: Diesel Indent No "${g.dieselIndentNo}" already exists on another trip.`);
          return;
        }
      }

      // Party files per DI
      for(const item of groupItems) {
        if(item.orderType==="party") {
          if(!item.grFile)      { alert(`Truck ${g.truckNo} · DI ${item.extracted?.diNo||"?"}: GR Copy required for Party order.`); return; }
          if(!item.invoiceFile) { alert(`Truck ${g.truckNo} · DI ${item.extracted?.diNo||"?"}: Invoice required for Party order.`); return; }
        }
      }

      // Net to driver check per group
      const totalQty  = groupItems.reduce((s,x)=>s+(+x.extracted?.qty||0),0);
      const totalGross = groupItems.reduce((s,x)=>s+(+x.extracted?.qty||0)*(+x.givenRate||0),0);
      const tafalVal  = +g.tafal || (settings?.tafalPerTrip||300);
      const _net = totalGross - (+g.advance||0) - tafalVal - (+g.diesel||0)
                 - (+g.shortageRecovery||0) - (+g.loanRecovery||0);
      if(_net < 0) {
        const isOnlyDiesel = (+g.diesel||0)>0 && (+g.advance||0)===0
          && (+g.shortageRecovery||0)===0 && (+g.loanRecovery||0)===0;
        if(isOnlyDiesel) {
          if(!window.confirm(`Truck ${g.truckNo}: Est. Net to Driver is ₹${_net.toLocaleString("en-IN")} (negative — likely diesel across DIs).\nSave anyway?`)) return;
        } else {
          alert(`Truck ${g.truckNo}: Est. Net to Driver is ₹${_net.toLocaleString("en-IN")} (negative).\nReduce Advance / Diesel / Recoveries.`);
          return;
        }
      }
    }

    setSaving(true);
    setLrError(""); // clear any previous error
    const tafal = settings?.tafalPerTrip||300;
    const createdTrucksThisBatch = new Set();
    const savedLRsThisBatch = [];
    let count = 0;

    // Use DI date as-is — the FY filter in the app handles display
    // If DI date is empty fall back to today
    const safeTripDate = (diDate) => diDate || today();

    for(const g of readyGroups) {
      const groupItems = doneItems.filter(x=>g.diIds.includes(x.id));
      const primary    = groupItems[0];
      const ex0        = primary.extracted;
      const client     = g.client || ex0.client || DEFAULT_CLIENT;
      const material   = gradeToMaterial(ex0.grade, "outbound");

      // ── Get auto-assigned LR from DB ──────────────────────────────────────
      let lrNo;
      try {
        // Timeout after 10s to prevent infinite hang
        const lrPromise = DB.getNextLR(client, material);
        const timeout = new Promise((_,rej) => setTimeout(()=>rej(new Error("Timed out — check internet connection and try again")), 10000));
        lrNo = await Promise.race([lrPromise, timeout]);
      } catch(e) {
        setLrError(`LR assignment failed for ${g.truckNo}: ${e.message}`);
        setSaving(false);
        return;
      }
      // Race condition guard: verify LR not already in local state or DB
      if((trips||[]).some(t=>t.lrNo===lrNo)) {
        setLrError(`LR ${lrNo} already exists (possible parallel save). Please try again.`);
        setSaving(false);
        return;
      }

      // ── Ensure vehicles registered ────────────────────────────────────────
      const truckNo = g.truckNo;
      const existingVeh = vehicles.find(v=>v.truckNo===truckNo);

      // Validate driver phone for new vehicles
      const resolvedPhone = existingVeh?.driverPhone
        || g.driverPhone
        || groupItems.map(x=>x.extracted?.driverPhone).find(p=>p&&p.trim())
        || "";
      if(!existingVeh || !existingVeh.driverPhone) {
        if(!resolvedPhone || resolvedPhone.replace(/\D/g,"").length!==10) {
          setLrError(`Truck ${truckNo}: Enter a valid 10-digit driver phone number.`);
          setSaving(false);
          return;
        }
      }

      if(truckNo && !existingVeh && !createdTrucksThisBatch.has(truckNo)) {
        const nv = { id:uid(), truckNo, ownerName:"", phone:"",
          driverName:"", driverPhone:resolvedPhone, driverLicense:"",
          accountNo:"", ifsc:"", loan:0, loanRecovered:0, deductPerTrip:0,
          tafalExempt:false, shortageOwed:0, shortageRecovered:0,
          loanTxns:[], shortageTxns:[], createdBy:user.username };
        setVehicles(p=>[...(p||[]),nv]);
        createdTrucksThisBatch.add(truckNo);
        log("AUTO-CREATE VEHICLE", truckNo);
      } else if(existingVeh) {
        // Update driver phone if missing
        const firstWithPhone = resolvedPhone ? {extracted:{driverPhone:resolvedPhone}} : groupItems.find(x=>x.extracted?.driverPhone);
        if(firstWithPhone && !existingVeh.driverPhone) {
          setVehicles(p=>p.map(v=>v.truckNo===truckNo
            ?{...v,driverPhone:firstWithPhone.extracted.driverPhone}:v));
        }
      }

      const tafalVal = +g.tafal!==undefined&&g.tafal!==""
        ? +g.tafal : tafal;

      if(groupItems.length === 1) {
        // ── SINGLE DI ──────────────────────────────────────────────────────
        const item   = groupItems[0];
        const ex     = item.extracted;
        const tripId = uid();
        let grUrl="", invUrl="";
        if(item.orderType==="party" && item.grFile) {
          try { grUrl = (await uploadPartyFile(tripId,"gr",item.grFile)).path; }
          catch(e) { console.warn("GR upload failed:",e.message); }
        }
        if(item.orderType==="party" && item.invoiceFile) {
          try { invUrl = (await uploadPartyFile(tripId,"invoice",item.invoiceFile)).path; }
          catch(e) { console.warn("Invoice upload failed:",e.message); }
        }
        const trip = {
          id:tripId, type:"outbound",
          lrNo, diNo:ex.diNo||"", grNo:ex.grNo||"",
          truckNo, consignee:ex.consignee||"", from:ex.from||"Kodla", to:ex.to||"",
          grade:ex.grade||"Cement Packed",
          district:ex.district||"", state:ex.state||"",
          qty:+ex.qty||0, bags:+ex.bags||0,
          frRate:+ex.frRate||0, givenRate:+item.givenRate||0,
          date:safeTripDate(ex.date), client,
          status:"Pending Bill", shortage:0,
          advance:+g.advance||0,
          shortageRecovery:+g.shortageRecovery||0,
          loanRecovery:+g.loanRecovery||0,
          tafal:tafalVal,
          dieselEstimate:+g.diesel||0,
          dieselIndentNo:g.dieselIndentNo.trim()||"",
          cashEmpId:g.cashEmpId||"",
          orderType:item.orderType||"godown", diLines:[],
          grFilePath:grUrl, invoiceFilePath:invUrl,
          emailSentAt:"", partyEmail:"", batchId:"",
          mergedPdfPath:"", receiptFilePath:"", receiptUploadedAt:"",
          sealedInvoicePath:"",
          createdBy:user.username, createdAt:nowTs(),
        };
        // Atomic DB save — checks for duplicate DI before inserting
        const saveResult = await Promise.race([
          DB.saveTripSafe(trip),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error("Save timed out — check connection")),15000))
        ]).catch(e=>({success:false, duplicateDI:null, existingLR:null, existingTruck:null, error:e.message}));
        if(!saveResult.success) {
          setLrError(saveResult.duplicateDI
            ? `DI ${saveResult.duplicateDI} already exists in LR ${saveResult.existingLR} (${saveResult.existingTruck}). This trip was not saved — another device may have saved it first.`
            : `Save failed: ${saveResult.error||"Unknown error"}`);
          setSaving(false);
          return;
        }
        setTrips(p=>[trip,...(p||[])]);
        // ── Auto-attach open diesel request for this truck ────────────────
        if (typeof setDieselRequests === "function") {
          const openReq = (dieselRequests||[]).find(r => r.truckNo===truckNo && r.status==="open");
          if (openReq) {
            const effAmt = openReq.confirmedAmount??openReq.amount;
            const changed = openReq.confirmedAmount!=null && openReq.confirmedAmount!==openReq.amount;
            const attach = window.confirm(
              `⛽ Open Diesel Request found for ${truckNo}\nIndent #${openReq.indentNo} · ₹${effAmt.toLocaleString("en-IN")}${changed?" ⚠ (AMOUNT CHANGED AT PUMP)":""}\n\nAttach to LR ${lrNo}?`
            );
            if (attach) {
              const updReq = {...openReq, status:"attached", tripId:trip.id, lrNo};
              setDieselRequests(p=>p.map(r=>r.id===openReq.id?updReq:r));
              await DB.saveDieselRequest(updReq);
              const updTrip = {...trip, dieselEstimate:effAmt, dieselIndentNo:String(openReq.indentNo)};
              setTrips(p=>p.map(t=>t.id===trip.id?updTrip:t));
              await DB.saveTrip(updTrip);
              log("DIESEL ATTACH", `Indent #${openReq.indentNo} → LR ${lrNo} · ₹${effAmt}`);
            }
          }
        }
        // Wallet advance
        if(trip.cashEmpId && trip.advance>0 && setCashTransfers) {
          const empName = employees.find(e=>e.id===trip.cashEmpId)?.name||trip.cashEmpId;
          const wxn={id:"WX-"+trip.id,empId:trip.cashEmpId,amount:-trip.advance,
            date:trip.date||today(),
            note:`Advance — LR ${lrNo} · ${truckNo}`,
            lrNo, tripId:trip.id, createdBy:user.username, createdAt:nowTs()};
          setCashTransfers(prev=>[wxn,...(Array.isArray(prev)?prev:[])]);
          log("WALLET ADVANCE",`${empName} −₹${trip.advance} LR:${lrNo}`);
        }
        // Loan/shortage ledger
        if(+g.shortageRecovery>0 || +g.loanRecovery>0) {
          setVehicles(prev=>prev.map(veh=>{
            if(veh.truckNo!==truckNo) return veh;
            let upd={...veh};
            if(+g.shortageRecovery>0){const txn={id:uid(),type:"recovery",date:trip.date||today(),qty:0,amount:+g.shortageRecovery,lrNo,note:"Batch DI"};upd={...upd,shortageRecovered:(upd.shortageRecovered||0)+(+g.shortageRecovery),shortageTxns:[...(upd.shortageTxns||[]),txn]};}
            if(+g.loanRecovery>0){const txn={id:uid(),type:"recovery",date:trip.date||today(),amount:+g.loanRecovery,lrNo,note:"Batch DI"};upd={...upd,loanRecovered:(upd.loanRecovered||0)+(+g.loanRecovery),loanTxns:[...(upd.loanTxns||[]),txn]};}
            return upd;
          }));
        }
        log("BATCH TRIP",`LR:${lrNo} DI:${ex.diNo} ${truckNo} ${ex.qty}MT [${item.orderType}]`);
      } else {
        // ── MULTI-DI on new LR ─────────────────────────────────────────────
        // Upload party files per DI
        const tripId = uid();
        const diLines = [];
        for(const item of groupItems) {
          const ex = item.extracted;
          let grUrl="", invUrl="";
          if(item.orderType==="party" && item.grFile) {
            try { grUrl=(await uploadPartyFile(tripId,`gr_${ex.diNo||item.id}`,item.grFile)).path; }
            catch(e) { console.warn("GR upload failed:",e.message); }
          }
          if(item.orderType==="party" && item.invoiceFile) {
            try { invUrl=(await uploadPartyFile(tripId,`inv_${ex.diNo||item.id}`,item.invoiceFile)).path; }
            catch(e) { console.warn("Invoice upload failed:",e.message); }
          }
          diLines.push({
            diNo:  ex.diNo||"",
            grNo:  ex.grNo||"",
            qty:   +ex.qty||0,
            bags:  +ex.bags||0,
            givenRate: +item.givenRate||0,
            frRate:    +ex.frRate||0,
            orderType: item.orderType||"godown",
            grFilePath:  grUrl,
            invoiceFilePath: invUrl,
          });
        }
        const totalQty  = diLines.reduce((s,d)=>s+(d.qty||0),0);
        const totalBags = diLines.reduce((s,d)=>s+(d.bags||0),0);
        const allDiNos  = diLines.map(d=>d.diNo).filter(Boolean).join(" + ");
        const allGrNos  = [...new Set(diLines.map(d=>d.grNo).filter(Boolean))].join(" + ");

        const trip = {
          id:tripId, type:"outbound",
          lrNo, diNo:allDiNos, grNo:allGrNos,
          truckNo, consignee:ex0.consignee||"", from:ex0.from||"Kodla", to:ex0.to||"",
          grade:ex0.grade||"Cement Packed",
          district:ex0.district||"", state:ex0.state||"",
          qty:totalQty, bags:totalBags,
          frRate:diLines[0]?.frRate||0, givenRate:diLines[0]?.givenRate||0,
          date:safeTripDate(ex0.date), client,
          status:"Pending Bill", shortage:0,
          advance:+g.advance||0,
          tafal:tafalVal,
          dieselEstimate:+g.diesel||0,
          dieselIndentNo:g.dieselIndentNo.trim()||"",
          shortageRecovery:+g.shortageRecovery||0,
          loanRecovery:+g.loanRecovery||0,
          cashEmpId:g.cashEmpId||"",
          orderType:primary.orderType||"godown",
          diLines,
          emailSentAt:"", partyEmail:"", batchId:"",
          mergedPdfPath:"", receiptFilePath:"", receiptUploadedAt:"",
          sealedInvoicePath:"",
          createdBy:user.username, createdAt:nowTs(),
        };
        // Atomic DB save — checks for duplicate DI before inserting
        const saveResultM = await Promise.race([
          DB.saveTripSafe(trip),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error("Save timed out — check connection")),15000))
        ]).catch(e=>({success:false, duplicateDI:null, error:e.message}));
        if(!saveResultM.success) {
          setLrError(saveResultM.duplicateDI
            ? `DI ${saveResultM.duplicateDI} already exists in LR ${saveResultM.existingLR} (${saveResultM.existingTruck}). This trip was not saved — another device may have saved it first.`
            : `Save failed: ${saveResultM.error||"Unknown error"}`);
          setSaving(false);
          return;
        }
        setTrips(p=>[trip,...(p||[])]);
        // ── Auto-attach open diesel request for this truck ────────────────
        if (typeof setDieselRequests === "function") {
          const openReq = (dieselRequests||[]).find(r => r.truckNo===truckNo && r.status==="open");
          if (openReq) {
            const effAmt = openReq.confirmedAmount??openReq.amount;
            const changed = openReq.confirmedAmount!=null && openReq.confirmedAmount!==openReq.amount;
            const attach = window.confirm(
              `⛽ Open Diesel Request found for ${truckNo}\nIndent #${openReq.indentNo} · ₹${effAmt.toLocaleString("en-IN")}${changed?" ⚠ (AMOUNT CHANGED AT PUMP)":""}\n\nAttach to LR ${lrNo}?`
            );
            if (attach) {
              const updReq = {...openReq, status:"attached", tripId:trip.id, lrNo};
              setDieselRequests(p=>p.map(r=>r.id===openReq.id?updReq:r));
              await DB.saveDieselRequest(updReq);
              const updTrip = {...trip, dieselEstimate:effAmt, dieselIndentNo:String(openReq.indentNo)};
              setTrips(p=>p.map(t=>t.id===trip.id?updTrip:t));
              await DB.saveTrip(updTrip);
              log("DIESEL ATTACH", `Indent #${openReq.indentNo} → LR ${lrNo} · ₹${effAmt}`);
            }
          }
        }
        // Wallet advance
        if(trip.cashEmpId && trip.advance>0 && setCashTransfers) {
          const empName = employees.find(e=>e.id===trip.cashEmpId)?.name||trip.cashEmpId;
          const wxn={id:"WX-"+trip.id,empId:trip.cashEmpId,amount:-trip.advance,
            date:trip.date||today(),
            note:`Advance — LR ${lrNo} · ${truckNo}`,
            lrNo, tripId:trip.id, createdBy:user.username, createdAt:nowTs()};
          setCashTransfers(prev=>[wxn,...(Array.isArray(prev)?prev:[])]);
          log("WALLET ADVANCE",`${empName} −₹${trip.advance} LR:${lrNo}`);
        }
        // Loan/shortage ledger
        if(+g.shortageRecovery>0 || +g.loanRecovery>0) {
          setVehicles(prev=>prev.map(veh=>{
            if(veh.truckNo!==truckNo) return veh;
            let upd={...veh};
            if(+g.shortageRecovery>0){const txn={id:uid(),type:"recovery",date:trip.date||today(),qty:0,amount:+g.shortageRecovery,lrNo,note:"Batch multi-DI"};upd={...upd,shortageRecovered:(upd.shortageRecovered||0)+(+g.shortageRecovery),shortageTxns:[...(upd.shortageTxns||[]),txn]};}
            if(+g.loanRecovery>0){const txn={id:uid(),type:"recovery",date:trip.date||today(),amount:+g.loanRecovery,lrNo,note:"Batch multi-DI"};upd={...upd,loanRecovered:(upd.loanRecovered||0)+(+g.loanRecovery),loanTxns:[...(upd.loanTxns||[]),txn]};}
            return upd;
          }));
        }
        log("BATCH MULTI-DI",`LR:${lrNo} ${allDiNos} ${truckNo} ${totalQty}MT`);
      }
      savedLRsThisBatch.push({lrNo, truckNo, qty: groupItems.reduce((s,x)=>s+(+x.extracted?.qty||0),0), diCount: groupItems.length});
      count++;
    }
    } catch(err) {
      console.error("saveAll error:", err);
      setLrError(`Error: ${err.message || "Unknown error — check internet connection"}. Please try again.`);
      setSaving(false);
      return;
    }


    setSavedCount(c=>c+count);
    setSavedLRs(prev=>[...savedLRsThisBatch,...prev]);
    setSaving(false);
    // Remove saved groups' items from list
    const savedItemIds = new Set(readyGroups.flatMap(g=>g.diIds));
    setItems(prev=>prev.filter(x=>!savedItemIds.has(x.id)));
    setGroups(prev=>prev.filter(g=>!readyGroups.find(r=>r.id===g.id)));
  };

  const scanningCount = items.filter(x=>x.status==="scanning"||x.status==="pending").length;

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* How-to */}
      <div style={{background:C.teal+"11",border:`1px solid ${C.teal}33`,borderRadius:12,padding:"12px 14px"}}>
        <div style={{color:C.teal,fontWeight:800,fontSize:13,marginBottom:4}}>📋 How it works</div>
        <div style={{color:C.muted,fontSize:12,lineHeight:1.7}}>
          1. Upload 1 or more GR/DI PDFs — AI scans each one<br/>
          2. DIs for the <b>same vehicle</b> are auto-grouped (select which to merge)<br/>
          3. Set <b>Order type + Driver rate</b> per DI · Set Tafal / Diesel / Advance per group<br/>
          4. Tap <b>Save</b> — LR number auto-assigned from DB sequence
        </div>
      </div>

      {/* Upload zone */}
      <div style={{border:`2px dashed ${C.teal}`,borderRadius:14,padding:"20px",
          background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
        <div style={{fontSize:32}}>📂</div>
        <div style={{color:C.teal,fontWeight:800,fontSize:14}}>Upload GR PDFs</div>
        <div style={{color:C.muted,fontSize:12}}>Upload 1 DI for a single trip · Upload multiple for batch — auto-grouped by vehicle</div>
        <div style={{display:"flex",gap:10,width:"100%",maxWidth:320}}>
          <button onClick={()=>inputRef.current?.click()}
            style={{flex:1,background:C.teal+"22",border:`1.5px solid ${C.teal}66`,
              borderRadius:10,padding:"10px 8px",color:C.teal,fontWeight:700,
              fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",
              justifyContent:"center",gap:6}}>
            📁 Local / Camera
          </button>
          <button onClick={async()=>{
              try { await openGoogleDrivePicker(f=>addFiles([f])); }
              catch(e) { alert("Google Drive: "+(e.message||"Could not open.")); }
            }}
            style={{flex:1,background:"#1a73e822",border:"1.5px solid #1a73e866",
              borderRadius:10,padding:"10px 8px",color:"#4285f4",fontWeight:700,
              fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",
              justifyContent:"center",gap:6}}>
            🔵 Google Drive
          </button>
        </div>
        <input ref={inputRef} type="file" multiple accept="application/pdf,image/*"
          style={{display:"none"}}
          onChange={e=>{if(e.target.files?.length)addFiles(e.target.files);e.target.value="";}} />
      </div>

      {/* Scanning progress */}
      {scanningCount>0&&(
        <div style={{background:C.blue+"11",border:`1px solid ${C.blue}33`,
          borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:18,height:18,border:`2px solid ${C.blue}`,borderTopColor:"transparent",
            borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}} />
          <div style={{color:C.blue,fontSize:13}}>
            Scanning {scanningCount} file{scanningCount>1?"s":""}… LR numbers will be auto-assigned on save
          </div>
        </div>
      )}

      {/* Error items */}
      {items.filter(x=>x.status==="error").map(item=>(
        <div key={item.id} style={{background:C.red+"11",border:`1px solid ${C.red}33`,
          borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:C.red,fontWeight:700,fontSize:12}}>⚠ Scan failed: {item.file?.name}</div>
            <div style={{color:C.muted,fontSize:11}}>{item.error}</div>
          </div>
          <button onClick={()=>setItems(prev=>prev.filter(x=>x.id!==item.id))}
            style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18}}>✕</button>
        </div>
      ))}

      {/* LR assignment error */}
      {lrError&&(
        <div style={{background:C.red+"11",border:`1px solid ${C.red}44`,borderRadius:10,padding:"10px 14px",color:C.red,fontSize:13}}>
          ⚠ {lrError}
        </div>
      )}

      {/* Success banner — shows assigned LR numbers prominently */}
      {savedLRs.length>0&&(
        <div style={{background:C.green+"11",border:`2px solid ${C.green}66`,borderRadius:12,padding:"14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:22}}>✅</span>
            <div style={{color:C.green,fontWeight:800,fontSize:14}}>
              {savedCount} trip{savedCount>1?"s":""} saved!
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {savedLRs.map((r,i)=>(
              <div key={i} style={{background:C.card,borderRadius:10,padding:"10px 14px",
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:20,fontWeight:900,color:C.blue,letterSpacing:1}}>{r.lrNo}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                    {r.truckNo} · {r.qty} MT{r.diCount>1?` · ${r.diCount} DIs`:""}
                  </div>
                </div>
                <span style={{fontSize:24}}>🎫</span>
              </div>
            ))}
          </div>
          <div style={{color:C.muted,fontSize:11,marginTop:8,textAlign:"center"}}>
            {groups.length>0?`${groups.length} group(s) remaining`:"All done — you can close"}
          </div>
        </div>
      )}

      {/* ── GROUP CARDS ─────────────────────────────────────────────────────── */}
      {groups.map(g => {
        const groupItems = doneItems.filter(x=>g.diIds.includes(x.id));
        // All items for this truck (including unchecked — shown greyed out)
        const allTruckItems = doneItems.filter(x=>{
          const tn = (x.extracted?.truckNo||"UNKNOWN").toUpperCase().trim();
          return tn===g.truckNo;
        });
        if(groupItems.length===0) return null;
        const totalQty = groupItems.reduce((s,x)=>s+(+x.extracted?.qty||0),0);
        const isReady  = groupReady(g);
        const material = gradeToMaterial(groupItems[0]?.extracted?.grade,"outbound");
        const prefix   = getLRPrefix(g.client, material);

        return (
          <div key={g.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",
            border:`2px solid ${isReady?C.green+"66":C.border}`,marginBottom:4}}>

            {/* Group header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{fontWeight:800,fontSize:15,color:C.text}}>🚛 {g.truckNo}</div>
                {g._splitFrom&&<div style={{fontSize:10,color:C.teal,fontWeight:700,marginBottom:2}}>✂ Split into separate trip</div>}
                <div style={{color:C.muted,fontSize:11,marginTop:2}}>
                  {groupItems.length} DI{groupItems.length>1?"s":""} selected · {totalQty} MT total
                  {allTruckItems.length>groupItems.length&&
                    <span style={{color:C.orange}}> · {allTruckItems.length-groupItems.length} unselected</span>}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                {prefix
                  ? <Badge label={`→ ${prefix}XXX`} color={C.teal} />
                  : <Badge label="⚠ No sequence" color={C.red} />}
              </div>
            </div>

            {/* DI checkboxes with per-DI fields */}
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
              {allTruckItems.map(item => {
                const ex      = item.extracted;
                const checked = g.diIds.includes(item.id);
                const dup     = checkDupDI(ex?.diNo);
                const margin  = (+ex?.frRate||0) - (+item.givenRate||0);
                const marginOk = !item.givenRate || +item.givenRate<=0 || margin>=30;
                return (
                  <div key={item.id} style={{background:dup?(C.red+"11"):(checked?C.bg:C.dim+"44"),
                    borderRadius:10,padding:"10px 12px",opacity:checked?1:0.55,
                    border:`2px solid ${dup?C.red:checked?C.border:"transparent"}`}}>

                    {/* DI header row: checkbox + info */}
                    <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:checked?8:0}}>
                      <input type="checkbox" checked={checked}
                        onChange={()=>toggleDI(g.id, item.id)}
                        style={{width:18,height:18,marginTop:2,flexShrink:0,cursor:"pointer"}} />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:13,color:C.text}}>
                          DI: {ex?.diNo||"—"} · {ex?.qty||0} MT
                        </div>
                        <div style={{color:C.muted,fontSize:11}}>
                          {ex?.from||"—"} → {ex?.to||"—"} · {ex?.grade||"—"} · {ex?.date||"—"}
                        </div>
                        {dup&&<div style={{color:C.red,fontSize:12,fontWeight:800,
                          background:C.red+"22",borderRadius:6,padding:"4px 8px",marginTop:4}}>
                          🚫 DUPLICATE — Already in LR {dup.trip.lrNo} ({dup.trip.truckNo}). Will not be saved.
                        </div>}
                        {!dup && ex?.date && getFY(ex.date)!==getFY(today()) && (
                          <div style={{color:C.blue,fontSize:11,fontWeight:700,
                            background:C.blue+"11",borderRadius:6,padding:"4px 8px",marginTop:4}}>
                            📅 DI date {ex.date} — trip will be saved with this date (FY {getFY(ex.date)-1}–{String(getFY(ex.date)).slice(2)})
                          </div>
                        )}
                      </div>
                      <div style={{fontSize:11,color:C.blue,fontWeight:700,flexShrink:0}}>
                        FR: ₹{ex?.frRate||0}/MT
                      </div>
                    </div>

                    {/* Per-DI fields (only when checked) */}
                    {checked&&(
                      <div style={{display:"flex",flexDirection:"column",gap:8,marginLeft:28}}>
                        {/* Order type + Driver rate */}
                        <div style={{display:"flex",gap:8}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>ORDER TYPE</div>
                            <select value={item.orderType||"godown"}
                              onChange={e=>updateItem(item.id,"orderType",e.target.value)}
                              style={{width:"100%",background:C.card,border:`1.5px solid ${C.border}`,
                                borderRadius:8,color:C.text,padding:"7px 8px",fontSize:13,outline:"none"}}>
                              <option value="godown">🏭 Godown</option>
                              <option value="party">🤝 Party</option>
                            </select>
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:10,color:marginOk?C.muted:C.red,fontWeight:700,marginBottom:3}}>
                              DRIVER RATE ₹/MT{!marginOk&&` (margin ₹${margin} < ₹30)`}
                            </div>
                            <input type="text" inputMode="decimal"
                              value={item.givenRate||""}
                              onChange={e=>{const v=e.target.value;if(v===""||/^\d*\.?\d*$/.test(v))updateItem(item.id,"givenRate",v);}}
                              placeholder="e.g. 980"
                              style={{width:"100%",background:C.card,
                                border:`1.5px solid ${(!item.givenRate||+item.givenRate<=0||!marginOk)?C.red:C.border}`,
                                borderRadius:8,color:C.text,padding:"7px 8px",fontSize:13,
                                outline:"none",boxSizing:"border-box"}} />
                          </div>
                        </div>

                        {/* Party files */}
                        {item.orderType==="party"&&(
                          <div style={{display:"flex",gap:8}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>
                                GR COPY {item.grFile?<span style={{color:C.green}}>✓</span>:<span style={{color:C.red}}>* required</span>}
                              </div>
                              <label style={{display:"flex",alignItems:"center",gap:6,background:item.grFile?C.green+"11":C.bg,
                                border:`1.5px solid ${item.grFile?C.green:C.border}`,borderRadius:8,
                                padding:"7px 10px",cursor:"pointer",fontSize:12}}>
                                <span>{item.grFile?"📄 "+item.grFile.name:"📎 Upload GR"}</span>
                                <input type="file" accept="application/pdf,image/*" style={{display:"none"}}
                                  onChange={e=>e.target.files?.[0]&&updateItem(item.id,"grFile",e.target.files[0])} />
                              </label>
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>
                                INVOICE {item.invoiceFile?<span style={{color:C.green}}>✓</span>:<span style={{color:C.red}}>* required</span>}
                              </div>
                              <label style={{display:"flex",alignItems:"center",gap:6,background:item.invoiceFile?C.green+"11":C.bg,
                                border:`1.5px solid ${item.invoiceFile?C.green:C.border}`,borderRadius:8,
                                padding:"7px 10px",cursor:"pointer",fontSize:12}}>
                                <span>{item.invoiceFile?"📄 "+item.invoiceFile.name:"📎 Upload Invoice"}</span>
                                <input type="file" accept="application/pdf,image/*" style={{display:"none"}}
                                  onChange={e=>e.target.files?.[0]&&updateItem(item.id,"invoiceFile",e.target.files[0])} />
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Group-level divider */}
            <div style={{height:1,background:C.border,marginBottom:12}} />

            {/* Group-level fields */}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>

              {/* Client */}
              <div>
                <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>CLIENT / PLANT</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {userClients.map(c=>(
                    <button key={c} onClick={()=>updateGroup(g.id,"client",c)}
                      style={{background:g.client===c?C.teal+"33":"transparent",
                        border:`1px solid ${g.client===c?C.teal:C.border}`,borderRadius:20,
                        padding:"4px 10px",fontSize:11,fontWeight:700,color:g.client===c?C.teal:C.muted,cursor:"pointer"}}>
                      {c.replace("Shree Cement ","SC ").replace("Ultratech ","UT ")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Driver phone — shown only when vehicle has no phone on record */}
              {(()=>{
                const existVeh = (vehicles||[]).find(v=>v.truckNo===g.truckNo);
                const needsPhone = !existVeh || !existVeh.driverPhone;
                if(!needsPhone) return null;
                const phoneOk = (g.driverPhone||"").replace(/\D/g,"").length===10;
                return (
                  <div>
                    <div style={{fontSize:10,fontWeight:700,marginBottom:3,
                      color:g.driverPhone&&!phoneOk?C.red:C.orange}}>
                      📱 DRIVER PHONE * (new vehicle — not on record)
                    </div>
                    <input type="tel" inputMode="numeric" value={g.driverPhone||""}
                      onChange={e=>updateGroup(g.id,"driverPhone",e.target.value.replace(/\D/g,"").slice(0,10))}
                      placeholder="10-digit mobile number"
                      style={{width:"100%",background:C.bg,
                        border:`1.5px solid ${g.driverPhone&&!phoneOk?C.red:g.driverPhone?C.green:C.orange}`,
                        borderRadius:8,color:C.text,padding:"7px 8px",fontSize:13,
                        outline:"none",boxSizing:"border-box"}} />
                    {g.driverPhone&&phoneOk&&(
                      <div style={{fontSize:10,color:C.green,marginTop:2,fontWeight:700}}>
                        ✓ Will be saved to vehicle record
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Tafal + Diesel */}
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>TAFAL ₹</div>
                  <input type="text" inputMode="decimal" value={g.tafal}
                    onChange={e=>updateGroup(g.id,"tafal",e.target.value)}
                    style={{width:"100%",background:C.bg,border:`1.5px solid ${C.border}`,
                      borderRadius:8,color:C.text,padding:"7px 8px",fontSize:13,outline:"none",boxSizing:"border-box"}} />
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>DIESEL EST. ₹</div>
                  <input type="text" inputMode="decimal" value={g.diesel}
                    onChange={e=>updateGroup(g.id,"diesel",e.target.value)}
                    style={{width:"100%",background:C.bg,border:`1.5px solid ${C.border}`,
                      borderRadius:8,color:C.text,padding:"7px 8px",fontSize:13,outline:"none",boxSizing:"border-box"}} />
                </div>
              </div>

              {/* Diesel indent */}
              {+g.diesel>0&&(
                <div>
                  <div style={{fontSize:10,color:+g.diesel>0&&!g.dieselIndentNo.trim()?C.red:C.muted,fontWeight:700,marginBottom:3}}>
                    DIESEL INDENT NO {+g.diesel>0&&!g.dieselIndentNo.trim()&&"* required"}
                  </div>
                  <input type="text" value={g.dieselIndentNo}
                    onChange={e=>updateGroup(g.id,"dieselIndentNo",e.target.value)}
                    placeholder="Indent number"
                    style={{width:"100%",background:C.bg,border:`1.5px solid ${+g.diesel>0&&!g.dieselIndentNo.trim()?C.red:C.border}`,
                      borderRadius:8,color:C.text,padding:"7px 8px",fontSize:13,outline:"none",boxSizing:"border-box"}} />
                </div>
              )}

              {/* Advance */}
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>ADVANCE ₹</div>
                  <input type="text" inputMode="decimal" value={g.advance}
                    onChange={e=>updateGroup(g.id,"advance",e.target.value)}
                    style={{width:"100%",background:C.bg,border:`1.5px solid ${C.border}`,
                      borderRadius:8,color:C.text,padding:"7px 8px",fontSize:13,outline:"none",boxSizing:"border-box"}} />
                </div>
                {+g.advance>0&&employees.length>0&&(
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>DEDUCT FROM WALLET</div>
                    <select value={g.cashEmpId||""}
                      onChange={e=>updateGroup(g.id,"cashEmpId",e.target.value)}
                      style={{width:"100%",background:C.bg,border:`1.5px solid ${C.border}`,
                        borderRadius:8,color:g.cashEmpId?C.text:C.muted,padding:"7px 8px",fontSize:13,outline:"none"}}>
                      <option value="">— None —</option>
                      {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Shortage + Loan recovery */}
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>SHORTAGE RECOVERY ₹</div>
                  <input type="text" inputMode="decimal" value={g.shortageRecovery}
                    onChange={e=>updateGroup(g.id,"shortageRecovery",e.target.value)}
                    style={{width:"100%",background:C.bg,border:`1.5px solid ${C.border}`,
                      borderRadius:8,color:C.text,padding:"7px 8px",fontSize:13,outline:"none",boxSizing:"border-box"}} />
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>
                    LOAN RECOVERY ₹{user?.role!=="owner"&&<span style={{color:C.orange,fontSize:9,marginLeft:4}}>🔒</span>}
                  </div>
                  {user?.role==="owner" ? (
                    <input type="text" inputMode="decimal" value={g.loanRecovery}
                      onChange={e=>updateGroup(g.id,"loanRecovery",e.target.value)}
                      style={{width:"100%",background:C.bg,border:`1.5px solid ${C.border}`,
                        borderRadius:8,color:C.text,padding:"7px 8px",fontSize:13,outline:"none",boxSizing:"border-box"}} />
                  ) : (
                    <div style={{background:C.dim,border:`1.5px solid ${C.border}`,borderRadius:8,
                      padding:"7px 8px",fontSize:13,color:C.text,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span>₹{(+g.loanRecovery||0).toLocaleString("en-IN")}</span>
                      <span style={{fontSize:10,color:C.muted}}>🔒</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Net preview */}
              {(()=>{
                const totalGross = groupItems.reduce((s,x)=>s+(+x.extracted?.qty||0)*(+x.givenRate||0),0);
                const tafalVal   = +g.tafal||(settings?.tafalPerTrip||300);
                const net = totalGross-(+g.advance||0)-tafalVal-(+g.diesel||0)-(+g.shortageRecovery||0)-(+g.loanRecovery||0);
                if(!totalGross) return null;
                return (
                  <div style={{background:net>=0?C.green+"11":C.red+"11",borderRadius:8,
                    padding:"7px 10px",display:"flex",justifyContent:"space-between",fontSize:12}}>
                    <span style={{color:C.muted}}>Est. Net to Driver</span>
                    <span style={{color:net>=0?C.green:C.red,fontWeight:800}}>
                      ₹{net.toLocaleString("en-IN")}
                    </span>
                  </div>
                );
              })()}

              {/* Ready indicator */}
              {(()=>{
                const dupItems = groupItems.filter(x=>checkDupDI(x.extracted?.diNo));
                const noRate   = groupItems.filter(x=>!x.givenRate||+x.givenRate<=0);
                const lowMargin= groupItems.filter(x=>x.givenRate&&+x.givenRate>0&&(+x.extracted?.frRate||0)-(+x.givenRate)<30);
                if(dupItems.length>0) return (
                  <div style={{color:C.red,fontSize:12,fontWeight:800,textAlign:"center",
                    background:C.red+"11",borderRadius:8,padding:"8px"}}>
                    🚫 {dupItems.length} duplicate DI{dupItems.length>1?"s":""} — remove from group or uncheck to proceed
                  </div>
                );
                if(noRate.length>0) return (
                  <div style={{color:C.muted,fontSize:11,textAlign:"center"}}>
                    Enter driver rate for {noRate.length} DI{noRate.length>1?"s":""} to enable save
                  </div>
                );
                if(lowMargin.length>0) return (
                  <div style={{color:C.red,fontSize:11,textAlign:"center"}}>
                    ⚠ Margin below ₹30/MT on {lowMargin.length} DI{lowMargin.length>1?"s":""}
                  </div>
                );
                return <div style={{color:C.green,fontSize:12,fontWeight:700,textAlign:"center"}}>✅ Ready to save · LR will be auto-assigned</div>;
              })()}
            </div>
          </div>
        );
      })}

      {/* Save All */}
      {readyGroups.length>0&&(
        <button onClick={saveAll} disabled={saving||!canSave}
          style={{background:saving?C.muted:C.green,color:"#fff",border:"none",
            borderRadius:12,padding:"15px",fontSize:16,fontWeight:800,cursor:saving?"not-allowed":"pointer",
            width:"100%",opacity:saving?0.7:1}}>
          {saving
            ? "⏳ Saving & assigning LRs…"
            : `💾 Save ${readyGroups.length} Group${readyGroups.length>1?"s":""} (${readyGroups.reduce((s,g)=>s+g.diIds.length,0)} DIs)`}
        </button>
      )}

      {items.length===0&&savedCount===0&&(
        <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:"20px 0"}}>
          Upload GR PDFs above to get started
        </div>
      )}
    </div>
  );
}


// ─── ASK LR SHEET ─────────────────────────────────────────────────────────────
// Shown after scanning a single DI.
// No manual LR entry — LR is auto-assigned on save.
// If truck has existing unsettled same-vehicle trips, offer to merge.
// onConfirm(existingTripOrNull, driverPhone)
function AskLRSheet({ extracted, trips, vehicles, onConfirm, onCancel }) {
  const [driverPhone, setDriverPhone] = useState("");
  const [selectedMerge, setSelectedMerge] = useState(null); // trip id to merge into, or "new"
  const truckNo = (extracted.truckNo||"").toUpperCase().trim();
  const existingVehicle = vehicles ? vehicles.find(v => v.truckNo === truckNo) : null;
  const needsDriverPhone = !existingVehicle || !existingVehicle.driverPhone;

  // Check for duplicate DI
  const scannedDiNo = (extracted.diNo||"").trim();
  const duplicateDI = scannedDiNo ? trips.find(t => {
    if(t.diLines&&t.diLines.length>0) return t.diLines.some(d=>d.diNo===scannedDiNo);
    return (t.diNo||"").split("+").map(s=>s.trim()).includes(scannedDiNo);
  }) : null;

  // Find unsettled trips for this truck (same vehicle = merge candidates)
  const mergeCandidates = !duplicateDI ? (trips||[]).filter(t =>
    !t.driverSettled &&
    (t.truckNo===truckNo||t.truck===truckNo) &&
    t.type==="outbound"
  ) : [];

  // Default: if no candidates → "new", if candidates → show choice
  useEffect(()=>{
    if(mergeCandidates.length===0) setSelectedMerge("new");
  }, [mergeCandidates.length]);

  const selectedTrip = selectedMerge && selectedMerge!=="new"
    ? trips.find(t=>t.id===selectedMerge) : null;

  // Check if selected trip's DI already contains this DI
  const diAlreadyInSelected = selectedTrip && scannedDiNo && (() => {
    if(selectedTrip.diLines&&selectedTrip.diLines.length>0)
      return selectedTrip.diLines.some(d=>d.diNo===scannedDiNo);
    return (selectedTrip.diNo||"").split("+").map(s=>s.trim()).includes(scannedDiNo);
  })();

  const canConfirm = !duplicateDI && selectedMerge &&
    !diAlreadyInSelected && !(needsDriverPhone&&!driverPhone.trim());

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Scanned summary */}
      <div style={{background:C.green+"11",border:`1px solid ${C.green}33`,borderRadius:12,padding:"14px"}}>
        <div style={{color:C.green,fontWeight:800,fontSize:13,marginBottom:8}}>✓ Document Scanned</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:12}}>
          {[["Truck",extracted.truckNo],["DI No",extracted.diNo],["GR No",extracted.grNo],
            ["Qty",`${extracted.qty} MT`],["Bags",String(extracted.bags)],["Fr.Rate",`₹${extracted.frRate}/MT`],
          ].map(([l,v]) => v&&v!=="0" ? (
            <div key={l}><span style={{color:C.muted}}>{l}: </span><b style={{color:C.text}}>{v}</b></div>
          ):null)}
        </div>
      </div>

      {/* Vehicle pending balances */}
      {existingVehicle && !duplicateDI && (()=>{
        const ownerN2=(existingVehicle.ownerName||"").trim();
        const ownerVs2=ownerN2?(vehicles||[]).filter(x=>(x.ownerName||"").trim()===ownerN2):[existingVehicle];
        const loanBal=ownerVs2.reduce((s,x)=>s+Math.max(0,(x.loan||0)-(x.loanRecovered||0)),0);
        const shortBal=(existingVehicle.shortageOwed||0)-(existingVehicle.shortageRecovered||0);
        if(loanBal<=0&&shortBal<=0) return null;
        const loanLabel=ownerVs2.length>1?`OWNER LOAN BAL (${ownerVs2.length} vehs)`:"LOAN BALANCE";
        return (
          <div style={{background:`${C.orange}11`,border:`2px solid ${C.orange}66`,borderRadius:12,padding:"12px 14px"}}>
            <div style={{color:C.orange,fontWeight:800,fontSize:12,marginBottom:8}}>⚠ Pending Dues on {ownerN2||truckNo}</div>
            <div style={{display:"flex",gap:16,fontSize:12}}>
              {loanBal>0&&<div><div style={{color:C.red,fontWeight:700}}>₹{loanBal.toLocaleString("en-IN")}</div><div style={{color:C.muted,fontSize:10}}>{loanLabel}</div></div>}
              {shortBal>0&&<div><div style={{color:C.red,fontWeight:700}}>₹{shortBal.toLocaleString("en-IN")}</div><div style={{color:C.muted,fontSize:10}}>SHORTAGE BALANCE</div></div>}
            </div>
            <div style={{color:C.muted,fontSize:11,marginTop:6}}>Enter Shortage/Loan Recovery in the trip form.</div>
          </div>
        );
      })()}

      {/* Duplicate DI block */}
      {duplicateDI && (
        <div style={{background:C.red+"11",border:`1px solid ${C.red}44`,borderRadius:10,padding:"12px 14px"}}>
          <div style={{color:C.red,fontWeight:800,fontSize:13,marginBottom:4}}>🚫 Duplicate DI — Already Exists!</div>
          <div style={{color:C.muted,fontSize:12}}>DI <b style={{color:C.text}}>{scannedDiNo}</b> is already in LR <b style={{color:C.text}}>{duplicateDI.lrNo||"—"}</b> · {duplicateDI.truckNo} · {duplicateDI.qty}MT</div>
          <div style={{color:C.red,fontSize:11,marginTop:6,fontWeight:700}}>You cannot add the same DI number twice.</div>
        </div>
      )}

      {/* Merge choice — only if not dup */}
      {!duplicateDI && (
        <div style={{background:C.bg,borderRadius:12,padding:"14px",border:`2px solid ${C.blue}44`}}>
          <div style={{color:C.blue,fontWeight:800,fontSize:13,marginBottom:10}}>
            📋 {mergeCandidates.length>0 ? "Add to existing trip or create new?" : "LR will be auto-assigned on save"}
          </div>

          {mergeCandidates.length>0 && (
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
              {/* New trip option */}
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",
                background:selectedMerge==="new"?C.green+"11":"transparent",
                border:`1.5px solid ${selectedMerge==="new"?C.green:C.border}`,
                borderRadius:10,padding:"10px 12px"}}>
                <input type="radio" name="merge" value="new" checked={selectedMerge==="new"}
                  onChange={()=>setSelectedMerge("new")} style={{width:16,height:16}} />
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:C.green}}>🆕 New Trip</div>
                  <div style={{fontSize:11,color:C.muted}}>Auto-assign next LR number for {extracted.client||DEFAULT_CLIENT}</div>
                </div>
              </label>

              {/* Existing trip options */}
              {mergeCandidates.map(t=>{
                const diAlready = scannedDiNo && (() => {
                  if(t.diLines&&t.diLines.length>0) return t.diLines.some(d=>d.diNo===scannedDiNo);
                  return (t.diNo||"").split("+").map(s=>s.trim()).includes(scannedDiNo);
                })();
                return (
                  <label key={t.id} style={{display:"flex",alignItems:"center",gap:10,
                    cursor:diAlready?"not-allowed":"pointer",opacity:diAlready?0.5:1,
                    background:selectedMerge===t.id?C.orange+"11":"transparent",
                    border:`1.5px solid ${selectedMerge===t.id?C.orange:C.border}`,
                    borderRadius:10,padding:"10px 12px"}}>
                    <input type="radio" name="merge" value={t.id} checked={selectedMerge===t.id}
                      disabled={diAlready} onChange={()=>!diAlready&&setSelectedMerge(t.id)}
                      style={{width:16,height:16}} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,color:C.orange}}>
                        ➕ Add to LR {t.lrNo||"—"}
                      </div>
                      <div style={{fontSize:11,color:C.muted}}>
                        {t.truckNo} · {t.qty}MT · DI: {t.diNo||"—"} · {t.date}
                      </div>
                      {diAlready&&<div style={{fontSize:11,color:C.red,fontWeight:700}}>DI already in this trip</div>}
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {mergeCandidates.length===0&&(
            <div style={{color:C.green,fontSize:12,fontWeight:700}}>
              ✓ New trip — LR will be auto-assigned from the sequence
            </div>
          )}
        </div>
      )}

      {/* Driver phone */}
      {!duplicateDI && needsDriverPhone && (
        <div style={{background:`${C.orange}08`,border:`1px solid ${C.orange}44`,borderRadius:12,padding:"14px"}}>
          <div style={{color:C.orange,fontWeight:800,fontSize:13,marginBottom:8}}>📞 Driver Phone Required</div>
          <div style={{color:C.muted,fontSize:12,marginBottom:10}}>
            Truck <b style={{color:C.text}}>{truckNo}</b> has no driver phone. Please add it now.
          </div>
          <Field label="Driver Phone *" value={driverPhone} onChange={setDriverPhone} type="tel" placeholder="9XXXXXXXXX" />
        </div>
      )}

      {!duplicateDI&&(
        <Btn onClick={()=>onConfirm(selectedTrip||null, driverPhone)} full color={C.blue}
          disabled={!canConfirm}>
          {selectedTrip ? "Continue → Merge into LR "+selectedTrip.lrNo : "Continue → Fill trip details"}
        </Btn>
      )}
      <Btn onClick={onCancel} full outline color={C.muted}>{duplicateDI?"Close":"Cancel"}</Btn>
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
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type=number] {
          -moz-appearance: textfield;
          appearance: textfield;
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

// Get the list of clients a user is allowed to see (defined early — used throughout)
const getUserClients = (user) => {
  if(!user) return CLIENTS;
  if(user.role==="owner"||user.role==="manager") return CLIENTS;
  const ac = user.assignedClients||[];
  return ac.length>0 ? CLIENTS.filter(c=>ac.includes(c)) : CLIENTS;
};

// Returns true if the user can see trips for the given client
const userCanSeeClient = (user, client) => {
  if(!user) return false;
  if(user.role==="owner"||user.role==="manager") return true;
  const ac = user.assignedClients||[];
  if(ac.length===0) return true; // no restriction set → see all
  return ac.includes(client||DEFAULT_CLIENT);
};

// ─── MATERIAL / LR SEQUENCE HELPERS ─────────────────────────────────────────
// Maps (client, material) → LR prefix. Must match mye_lr_sequences table.
const LR_PREFIXES = {
  "Shree Cement Kodla|Cement":   "SKLC",
  "Shree Cement Kodla|Gypsum":   "SKLGP",
  "Shree Cement Kodla|Husk":     "SKLH",
  "Shree Cement Guntur|Cement":  "SGNC",
  "Shree Cement Guntur|Gypsum":  "SGNGP",
  "Shree Cement Guntur|Husk":    "SGNH",
  "Ultratech Malkhed|Cement":    "UTCC",
  "Ultratech Malkhed|Gypsum":    "UTCGP",
  "Ultratech Malkhed|Husk":      "UTCH",
  "Inbound|Gypsum":              "INBGP",
  "Inbound|Husk":                "INBH",
  "Inbound|Limestone":           "INBL",
};

// Derive material category from grade string
const gradeToMaterial = (grade, tripType) => {
  const g = (grade||"").toLowerCase();
  if(tripType==="inbound") {
    if(g.includes("gypsum"))    return "Gypsum";
    if(g.includes("husk"))      return "Husk";
    if(g.includes("limestone")) return "Limestone";
    return "Limestone"; // default inbound
  }
  // outbound
  if(g.includes("gypsum"))  return "Gypsum";
  if(g.includes("husk"))    return "Husk";
  return "Cement"; // default outbound
};

// Get LR prefix for a (client, material) pair
const getLRPrefix = (client, material) => LR_PREFIXES[`${client}|${material}`] || null;

// Shree Cement plants (used to decide if Shree Payments tab is relevant)
const SHREE_CLIENTS = ["Shree Cement Kodla","Shree Cement Guntur"];

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
  const [sealedTrip, setSealedTrip] = useState(null); // trip object for inline SealedInvoiceSheet

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

      {step==="sealed" && !sealedTrip && (<>
        <button onClick={()=>setStep("select")}
          style={{background:"none",border:"none",color:C.blue,fontSize:12,
            cursor:"pointer",textAlign:"left",padding:"0 0 4px"}}>
          ← Back to selection
        </button>
        <div style={{background:C.orange+"11",border:`1px solid ${C.orange}33`,borderRadius:10,padding:"12px 14px",color:C.orange,fontSize:12,fontWeight:700}}>
          🏷️ Upload Sealed Invoice for {selected.size} trip{selected.size!==1?"s":""}
        </div>
        <div style={{color:C.muted,fontSize:12}}>
          Tap <b style={{color:C.orange}}>🏷️ Upload</b> on each trip to upload its sealed invoice. It will be merged with GR + Invoice into one PDF.
        </div>
        {selTrips.map(t=>(
          <div key={t.id} style={{background:C.card,border:`1px solid ${t.mergedPdfPath?C.green:C.border}`,
            borderRadius:12,padding:"11px 14px",
            display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13}}>{t.truckNo} <span style={{color:C.blue,fontSize:12}}>LR:{t.lrNo||"—"}</span></div>
              <div style={{color:C.muted,fontSize:11}}>{t.consignee||"—"} · {t.qty}MT</div>
            </div>
            {t.mergedPdfPath
              ? <span style={{color:C.green,fontSize:11,fontWeight:700,flexShrink:0}}>✅ Done</span>
              : <button onClick={()=>setSealedTrip(t)}
                  style={{background:C.orange+"11",border:`1.5px solid ${C.orange}`,
                    color:C.orange,borderRadius:10,padding:"7px 12px",
                    fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>
                  🏷️ Upload
                </button>
            }
          </div>
        ))}
        <Btn onClick={onClose} full color={C.green}>Done</Btn>
      </>)}

      {step==="sealed" && sealedTrip && (
        <SealedInvoiceSheet
          trip={sealedTrip}
          onMerge={(tripId, sealedPath, mergedPath) => {
            setTrips(prev => prev.map(t => t.id===tripId
              ? {...t, sealedInvoicePath:sealedPath, mergedPdfPath:mergedPath,
                  receiptFilePath:sealedPath, receiptUploadedAt:nowTs()}
              : t));
            log("SEALED INVOICE", `LR:${sealedTrip.lrNo} merged (batch email)`);
            setSealedTrip(null);
          }}
          onClose={()=>setSealedTrip(null)}
          embedded
        />
      )}

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
function SealedInvoiceSheet({ trip, onMerge, onClose, embedded=false }) {
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
      {embedded && (
        <button onClick={onClose}
          style={{background:"none",border:"none",color:C.blue,fontSize:12,
            cursor:"pointer",textAlign:"left",padding:"0 0 4px"}}>
          ← Back to trip list
        </button>
      )}
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
function Trips({trips, setTrips, fyTrips, selectedClient, vehicles, setVehicles, indents, settings, tripType, user, log, driverPays, employees, cashTransfers, setCashTransfers, allTripsLoaded, loadingAllTrips, loadAllTrips, dieselRequests=[], setDieselRequests}) {
  const isIn = tripType === "inbound";
  const ac   = isIn ? C.teal : C.accent;

  const [addSheet,    setAddSheet]    = useState(false);
  const [editSheet,   setEditSheet]   = useState(null);
  const [filter,      setFilter]      = useState("All");
  const [orderTypeFilter, setOrderTypeFilter] = useState("All"); // "All"|"godown"|"party"
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
  const [batchDISheet,  setBatchDISheet]  = useState(false); // morning batch GR scanner
  const [manualLrMode,  setManualLrMode]  = useState(false); // allow manual LR entry for old data

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

  const baseTrips = fyTrips || trips; // use FY-filtered if available
  const list   = baseTrips.filter(t => t.type===tripType);
  // Role-based client restriction — non-owners only see their assigned clients
  // trips already role-filtered via sp — list is safe to use directly
  const olist  = orderTypeFilter==="All" ? list : orderTypeFilter==="party" ? list.filter(t=>t.orderType==="party") : list.filter(t=>!t.orderType||t.orderType==="godown");
  const clist  = selectedClient ? olist.filter(t => (t.client||DEFAULT_CLIENT)===selectedClient) : (clientFilter ? olist.filter(t => (t.client||DEFAULT_CLIENT)===clientFilter) : olist);
  const dlist  = (dateFrom||dateTo) ? clist.filter(t => t.date>=(dateFrom||"2000-01-01") && t.date<=(dateTo||"2099-12-31")) : clist;
  const slist  = search ? dlist.filter(t => {
    const q = search.trim().toLowerCase();
    if(!q) return true;
    const lrFull = (t.lrNo||"").toLowerCase();
    // Exact LR match
    if(lrFull === q) return true;
    // Prefix match (e.g. "SKLC" matches "SKLC020")
    if(lrFull.startsWith(q)) return true;
    // Numeric suffix match — strip leading zeros from both sides
    // e.g. "SKLC020", "SKLC0020", "SKLC20" all match each other
    const lrAlpha = lrFull.replace(/[^a-z]/g,"");   // "sklc"
    const lrDigits = lrFull.replace(/[^0-9]/g,"");  // "020" → numeric value 20
    const qAlpha   = q.replace(/[^a-z]/g,"");
    const qDigits  = q.replace(/[^0-9]/g,"");
    if(lrAlpha && qAlpha && lrAlpha===qAlpha && lrDigits && qDigits &&
       parseInt(lrDigits,10)===parseInt(qDigits,10)) return true;
    // Legacy LR: match from end of number (e.g. "2910" matches "MYE/2526/2910")
    const lrNum = lrFull.split("/").pop();
    if(lrNum === q) return true;
    // Truck: exact or prefix match (e.g. "KA29" matches "KA29A9502")
    if((t.truckNo||"").toLowerCase().startsWith(q)) return true;
    if((t.truckNo||"").toLowerCase() === q) return true;
    // GR: exact or contains full query
    if((t.grNo||"").toLowerCase().includes(q)) return true;
    // DI: check diNo field AND all diLines for multi-DI trips
    if((t.diNo||"").toLowerCase().includes(q)) return true;
    if((t.diLines||[]).some(d=>(d.diNo||"").toLowerCase().includes(q))) return true;
    // Destination: word-start match
    if((t.to||"").toLowerCase().startsWith(q)) return true;
    if((t.to||"").toLowerCase().split(/\s+/).some(w=>w.startsWith(q))) return true;
    // Consignee: word-start match
    if((t.consignee||"").toLowerCase().startsWith(q)) return true;
    if((t.consignee||"").toLowerCase().split(/\s+/).some(w=>w.startsWith(q))) return true;
    // Client: contains match
    if((t.client||"").toLowerCase().includes(q)) return true;
    // Grade
    if((t.grade||"").toLowerCase().includes(q)) return true;
    return false;
  }) : dlist;
  const shown  = filter==="All" ? slist : slist.filter(t => t.status===filter);

  // When truck number changes, check if tafalExempt
  const onTruckChange = v => {
    const tn  = v.toUpperCase().trim();
    const veh = vehicles.find(x => x.truckNo===tn);
    // Owner-level loan: compute auto loanRecovery from deductPerTrip capped at balance
    const ownerNameT = (veh?.ownerName||"").trim();
    const ownerVehsT = ownerNameT?(vehicles||[]).filter(x=>(x.ownerName||"").trim()===ownerNameT):(veh?[veh]:[]);
    const ownerDeductT = ownerVehsT[0]?.deductPerTrip||0;
    const ownerBalT = ownerVehsT.reduce((s,x)=>s+Math.max(0,(x.loan||0)-(x.loanRecovered||0)),0);
    // If deductPerTrip is set: cap recovery at that amount. If not set but balance exists: recover full balance.
    const autoLoanRecov = ownerBalT<=0 ? 0 : (ownerDeductT>0 ? Math.min(ownerDeductT, ownerBalT) : ownerBalT);
    // Find last trip with this truck to pre-fill rate and destination
    const lastTrip = [...trips].filter(t=>t.truckNo===tn&&t.type===tripType).sort((a,b)=>b.date.localeCompare(a.date))[0];
    setF(p => ({
      ...p,
      truckNo: v,
      tafal: veh?.tafalExempt ? "0" : String(settings?.tafalPerTrip||300),
      loanRecovery: String(autoLoanRecov),
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

  // Called when user confirms after scanning — existingTrip is non-null if merging, null for new trip
  const onLRConfirmed = (existingTrip, driverPhone) => {
    const { extracted } = diConflict;

    // Auto-create/update vehicle record
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
      setVehicles(p => p.map(v => v.truckNo===truckNo ? {...v, driverPhone} : v));
      log("UPDATE DRIVER PHONE", `${truckNo} → ${driverPhone}`);
    }

    if (existingTrip) {
      // Merge into existing trip — pass to MergeDISheet
      setDiConflict({ extracted: { ...extracted, lrNo: existingTrip.lrNo }, existingTrip, askLR: false });
    } else {
      // New trip — lrNo will be auto-assigned on saveNew; store empty for now
      setF(p => ({ ...p, ...extracted, lrNo: "", district:extracted.district||p.district||"", state:extracted.state||p.state||"" }));
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
    // ── LR assignment: auto from DB sequence, or manual entry ─────────────────
    const tripClient   = isIn ? "Inbound" : (f.client || DEFAULT_CLIENT);
    const tripMaterial = gradeToMaterial(f.grade, tripType);
    let assignedLR = "";
    if(manualLrMode) {
      // Manual mode: use what the user typed — validate it's not empty or duplicate
      if(!f.lrNo || !f.lrNo.trim()) {
        alert("LR Number is required in Manual LR mode.\nPlease enter the LR number from the paper LR book.");
        return;
      }
      assignedLR = f.lrNo.trim().toUpperCase();
      // Check duplicate
      if((trips||[]).some(t=>t.lrNo===assignedLR)) {
        alert(`LR "${assignedLR}" already exists in the system.\nPlease check the LR number and try again.`);
        return;
      }
    } else {
      // Auto mode: get next LR from DB sequence
      try {
        assignedLR = await DB.getNextLR(tripClient, tripMaterial);
      } catch(e) {
        alert(`Could not assign LR number: ${e.message}\nCheck that a sequence exists for ${tripClient} / ${tripMaterial}.`);
        return;
      }
    }

    // Validate: driver phone mandatory when truck is new or has no phone on record
    {
      const existVeh = (vehicles||[]).find(v=>v.truckNo===(f.truckNo||"").toUpperCase().trim());
      if(!existVeh || !existVeh.driverPhone) {
        if(!f.driverPhone || !f.driverPhone.trim()) {
          alert("Driver Phone number is mandatory for new vehicles.\nPlease enter a 10-digit mobile number.\n\nಡ್ರೈವರ್ ಫೋನ್ ನಂಬರ್ ಕಡ್ಡಾಯ.");
          return;
        }
        if(f.driverPhone.replace(/\D/g,"").length !== 10) {
          alert("Driver Phone must be a 10-digit mobile number.\n\nಡ್ರೈವರ್ ಫೋನ್ 10 ಅಂಕಿಗಳ ಮೊಬೈಲ್ ನಂಬರ್ ಆಗಿರಬೇಕು.");
          return;
        }
      }
    }
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
      lrNo: assignedLR,  // auto-assigned from DB sequence
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
    // If net-to-driver is negative (advance > gross), record excess as a loan
    try {
      const _gross = (+t.qty||0)*(+t.givenRate||0);
      const _net   = _gross-(+t.advance||0)-(+t.tafal||0)-(+t.dieselEstimate||0)-(+t.shortageRecovery||0)-(+t.loanRecovery||0);
      if(_net < 0) {
        const overpaid = Math.abs(_net);
        const tn = (t.truckNo||"").toUpperCase().trim();
        const veh = (vehicles||[]).find(v=>v.truckNo===tn);
        if(veh) {
          const loanTxn = { id:uid(), type:"loan", date:t.date||today(), amount:overpaid,
            lrNo:t.lrNo, note:`Excess advance on LR ${t.lrNo} — ₹${overpaid.toLocaleString("en-IN")}` };
          setVehicles(prev=>prev.map(v=>v.truckNo!==tn?v:{
            ...v, loan:(v.loan||0)+overpaid, loanTxns:[...(v.loanTxns||[]),loanTxn]
          }));
          log("ADVANCE→LOAN",`LR:${t.lrNo} ${tn} — ₹${overpaid} excess added as loan`);
        }
      }
    } catch(e) { console.error("Loan backfill error:", e); }
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

      {/* ── HEADER CARD ── */}
      <div style={{background:C.card,borderRadius:16,padding:"14px 16px",
        border:`1px solid ${C.border}`,
        boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>

        {/* Title row */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <div style={{color:ac,fontWeight:900,fontSize:18,letterSpacing:0.2}}>
              {isIn ? "🏭 Raw Material" : "🚛 Cement Trips"}
            </div>
            <div style={{color:C.muted,fontSize:11,marginTop:1}}>
              {shown.length} trip{shown.length!==1?"s":""} · {shown.reduce((s,t)=>s+(t.qty||0),0)} MT
            </div>
          </div>
          {/* Date filter toggle */}
          <button onClick={()=>setShowDateFilter(v=>!v)}
            style={{background:(showDateFilter||(dateFrom||dateTo))?C.orange+"22":"transparent",
              border:`1.5px solid ${(showDateFilter||(dateFrom||dateTo))?C.orange:C.border}`,
              borderRadius:10,color:(showDateFilter||(dateFrom||dateTo))?C.orange:C.muted,
              padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer",
              display:"flex",alignItems:"center",gap:4}}>
            📅{(dateFrom||dateTo)?" Filtered":""}
          </button>
        </div>

        {/* Action buttons row */}
        <div style={{display:"flex",gap:8}}>
          {!isIn && (() => {
            const pendingEmail = trips.filter(t=>t.orderType==="party"&&!t.emailSentAt);
            return pendingEmail.length>0 ? (
              <button onClick={()=>setPartyEmailSheet(true)}
                style={{flex:1,background:pendingEmail.length>5?C.red+"11":C.accent+"11",
                  border:`1.5px solid ${pendingEmail.length>5?C.red:C.accent}`,
                  borderRadius:10,color:pendingEmail.length>5?C.red:C.accent,
                  padding:"8px 4px",fontSize:12,fontWeight:700,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                📧 <span style={{background:pendingEmail.length>5?C.red:C.accent,
                  color:"#fff",borderRadius:8,padding:"1px 6px",fontSize:11}}>
                  {pendingEmail.length}
                </span>
              </button>
            ) : null;
          })()}
          {/* Manual LR mode toggle — owner only, for entering old/historical data */}
          {user.role==="owner" && !isIn && (
            <button onClick={()=>setManualLrMode(p=>!p)}
              title={manualLrMode?"Switch back to auto LR":"Enter old trips with manual LR numbers"}
              style={{background:manualLrMode?C.orange+"33":"transparent",
                border:`1.5px solid ${manualLrMode?C.orange:C.border}`,
                borderRadius:10,color:manualLrMode?C.orange:C.muted,
                padding:"8px 10px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              {manualLrMode?"🖊 Manual LR":"🔢 Auto LR"}
            </button>
          )}
          <button onClick={()=>{
              if(isIn){
                setOrderTypeStep("godown"); setF(blankForm(false)); setAddSheet(true);
              } else if(manualLrMode) {
                // Manual LR mode: open regular form (not batch scanner)
                setOrderTypeStep("selecting"); setF(blankForm(false)); setAddSheet(true);
              } else {
                setBatchDISheet(true);
              }
            }}
            style={{flex:2,background:ac,border:"none",borderRadius:10,color:"#fff",
              padding:"9px 8px",fontSize:13,fontWeight:800,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            ＋ Add Trip
          </button>
        </div>
      </div>

      {/* Warning banner: >5 pending party emails */}
      {!isIn && (() => {
        const pending = trips.filter(t=>t.orderType==="party"&&!t.emailSentAt);
        if(!["owner","manager"].includes(user?.role)) return null;
        return pending.length>5 ? (
          <div style={{background:C.red+"11",border:`1px solid ${C.red}44`,borderRadius:12,
            padding:"10px 14px",display:"flex",flexWrap:"wrap",alignItems:"center",gap:8}}>
            <span style={{color:C.red,fontSize:12,fontWeight:700,flex:1,minWidth:120}}>
              ⚠ {pending.length} party trips waiting for email
            </span>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setWaSheet(true)}
                style={{background:"#25D366",border:"none",color:"#fff",borderRadius:8,
                  padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                📲 Remind
              </button>
              <button onClick={()=>setPartyEmailSheet(true)}
                style={{background:C.blue,border:"none",color:"#fff",borderRadius:8,
                  padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                📧 Email
              </button>
              <button onClick={()=>{
                  const t=(trips||[]).find(x=>x.orderType==="party"&&x.grFilePath&&!x.mergedPdfPath);
                  setSealedSheet(t||(trips||[]).find(x=>x.orderType==="party"&&!x.mergedPdfPath)||null);
                }}
                style={{background:C.orange,border:"none",color:"#fff",borderRadius:8,
                  padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
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

      {/* Order type filter — only for outbound trips */}
      {!isIn && (
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{color:C.muted,fontSize:11,fontWeight:700,flexShrink:0}}>Order:</span>
          {[
            {id:"All",    label:"All",           icon:"📦"},
            {id:"godown", label:`Godown (${list.filter(t=>!t.orderType||t.orderType==="godown").length})`, icon:"🏭"},
            {id:"party",  label:`Party (${list.filter(t=>t.orderType==="party").length})`,  icon:"🤝"},
          ].map(o=>(
            <button key={o.id} onClick={()=>setOrderTypeFilter(o.id)}
              style={{padding:"5px 10px",borderRadius:20,border:`1.5px solid ${orderTypeFilter===o.id?C.accent:C.border}`,
                background:orderTypeFilter===o.id?C.accent+"22":"transparent",
                color:orderTypeFilter===o.id?C.accent:C.muted,
                fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              {o.icon} {o.label}
            </button>
          ))}
        </div>
      )}

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

                  {(t.orderType==="party"||t.grFilePath||t.invoiceFilePath||(t.diLines||[]).some(dl=>dl.grFilePath||dl.invoiceFilePath)) && (
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
                      {/* Single-trip GR/Invoice download */}
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
                      {/* Per-DI GR/Invoice download (multi-DI trips where files stored on diLines) */}
                      {(t.diLines||[]).filter(dl=>dl.grFilePath||dl.invoiceFilePath).map((dl,di)=>(
                        <React.Fragment key={dl.diNo||di}>
                          {dl.grFilePath&&(
                            <button onClick={async()=>{try{const url=await getSignedUrl(dl.grFilePath,3600);const a=document.createElement("a");a.href=url;a.download="GR_DI"+(dl.diNo||di)+"_"+(t.lrNo||t.id);a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(e){alert("GR download failed: "+e.message);}}}
                              style={{background:C.teal+"22",color:C.teal,border:"1px solid "+C.teal+"44",borderRadius:20,
                                padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                              ⬇ GR {dl.diNo?`(DI ${dl.diNo.slice(-4)})`:di+1}
                            </button>
                          )}
                          {dl.invoiceFilePath&&(
                            <button onClick={async()=>{try{const url=await getSignedUrl(dl.invoiceFilePath,3600);const a=document.createElement("a");a.href=url;a.download="Inv_DI"+(dl.diNo||di)+"_"+(t.lrNo||t.id);a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);}catch(e){alert("Invoice download failed: "+e.message);}}}
                              style={{background:C.blue+"22",color:C.blue,border:"1px solid "+C.blue+"44",borderRadius:20,
                                padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                              ⬇ Inv {dl.diNo?`(DI ${dl.diNo.slice(-4)})`:di+1}
                            </button>
                          )}
                        </React.Fragment>
                      ))}
                      {/* Warning: party trip missing files — show upload hint */}
                      {t.orderType==="party" && !t.grFilePath && !(t.diLines||[]).some(dl=>dl.grFilePath) && (
                        <Badge label="⚠ No GR uploaded" color={C.red} />
                      )}
                      {t.orderType==="party" && !t.invoiceFilePath && !(t.diLines||[]).some(dl=>dl.invoiceFilePath) && (
                        <Badge label="⚠ No Invoice uploaded" color={C.red} />
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

      {/* ── BATCH DI SCANNER SHEET ── */}
      {batchDISheet && (
        <Sheet title="📋 Add Trip — Scan GR / DI Copies" onClose={()=>setBatchDISheet(false)} noBackdropClose>
          <BatchDIScanner
            trips={trips} vehicles={vehicles} setVehicles={setVehicles}
            setTrips={setTrips} settings={settings} user={user} log={log}
            employees={employees||[]} cashTransfers={cashTransfers||[]} setCashTransfers={setCashTransfers}
            dieselRequests={dieselRequests||[]} setDieselRequests={setDieselRequests}
            onClose={()=>setBatchDISheet(false)}
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
          {manualLrMode && (
            <div style={{background:C.orange+"15",border:`2px solid ${C.orange}`,borderRadius:10,
              padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>🖊</span>
              <div>
                <div style={{color:C.orange,fontWeight:800,fontSize:13}}>Manual LR Mode — Historical Data Entry</div>
                <div style={{color:C.muted,fontSize:11}}>Enter the LR number from your paper LR book. Sequence will NOT be incremented.</div>
              </div>
            </div>
          )}

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
                      user={user} wasScanned={wasScanned} trips={trips||[]} indents={indents||[]}
                      manualLrMode={manualLrMode} />
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
                        Skip for now — upload files before saving
                      </button>
                      <div style={{fontSize:10,color:C.red,marginTop:2}}>
                        ⚠ GR and Invoice are mandatory before saving
                      </div>
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
                    onConfirm={(existingTrip, driverPhone)=>{
                      // Carry party fields through confirm
                      onLRConfirmed(existingTrip, driverPhone);
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
                      manualLrMode={manualLrMode}
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
                        // LR is auto-assigned from DB — no manual duplicate check needed
                        const _gross=(+f.qty||0)*(+f.givenRate||0);
                        const _net=_gross-(+f.advance||0)-(+f.tafal||0)-(+f.dieselEstimate||0)-(+f.shortageRecovery||0)-(+f.loanRecovery||0);
                        if(_net<0){
                          const isOnlyDiesel=(+f.dieselEstimate||0)>0&&(+f.advance||0)===0&&(+f.shortageRecovery||0)===0&&(+f.loanRecovery||0)===0;
                          if(isOnlyDiesel){if(!window.confirm(`Est. Net to Driver is negative (likely diesel spans multiple DIs). Save anyway?`))return;}
                          else{alert("Cannot save: Est. Net to Driver is negative.\nಡ್ರೈವರ್‌ಗೆ ನಿವ್ವಳ ಮೊತ್ತ ಋಣಾತ್ಮಕ — ಸೇವ್ ಸಾಧ್ಯವಿಲ್ಲ.");return;}
                        }
                        if(!f.district||!f.state){alert("District and State are required for Party orders.\nಪಾರ್ಟಿ ಆರ್ಡರ್‌ಗೆ ಜಿಲ್ಲೆ ಮತ್ತು ರಾಜ್ಯ ಕಡ್ಡಾಯ.");return;}
                        // Validate GR and Invoice files are present for party orders
                        {
                          const _grCount  = Array.isArray(grFileRef.current)  ? grFileRef.current.length  : (grFileRef.current  ? 1 : 0);
                          const _invCount = Array.isArray(invoiceFileRef.current) ? invoiceFileRef.current.length : (invoiceFileRef.current ? 1 : 0);
                          if(_grCount === 0) {
                            alert("GR Copy is mandatory for Party orders.\nPlease upload the GR copy before saving.\n\nಪಾರ್ಟಿ ಆರ್ಡರ್‌ಗೆ GR Copy ಕಡ್ಡಾಯ. ಉಳಿಸುವ ಮೊದಲು GR Copy ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.");
                            return;
                          }
                          if(_invCount === 0) {
                            alert("Invoice is mandatory for Party orders.\nPlease upload the Invoice before saving.\n\nಪಾರ್ಟಿ ಆರ್ಡರ್‌ಗೆ Invoice ಕಡ್ಡಾಯ. ಉಳಿಸುವ ಮೊದಲು Invoice ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.");
                            return;
                          }
                        }
                        // LR: manual or auto
                        const _partyClient   = f.client || DEFAULT_CLIENT;
                        const _partyMaterial = gradeToMaterial(f.grade, tripType);
                        let _partyLR = "";
                        if(manualLrMode) {
                          if(!f.lrNo||!f.lrNo.trim()){alert("LR Number is required in Manual LR mode.");return;}
                          _partyLR = f.lrNo.trim().toUpperCase();
                          if((trips||[]).some(t=>t.lrNo===_partyLR)){alert(`LR "${_partyLR}" already exists.`);return;}
                        } else {
                          try {
                            _partyLR = await DB.getNextLR(_partyClient, _partyMaterial);
                          } catch(e) {
                            alert(`Could not assign LR: ${e.message}`);
                            return;
                          }
                        }
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
                            lrNo: _partyLR,  // auto-assigned from DB sequence
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
                      isParty={true} trips={trips||[]} indents={indents||[]} />
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
          {/* Order type toggle — owner switches freely; non-owner can only upgrade godown→party */}
          {(user.role==="owner" || editSheet.orderType!=="party") && (
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:4}}>
              <div style={{display:"flex",gap:8}}>
                {["godown","party"].map(ot=>{
                  const canSelect = user.role==="owner" || ot==="party";
                  const isActive  = editSheet.orderType===ot;
                  return (
                    <button key={ot}
                      onClick={()=>{ if(canSelect) setEditSheet(p=>({...p,orderType:ot})); }}
                      style={{flex:1,padding:"10px",borderRadius:10,
                        cursor:canSelect?"pointer":"not-allowed",fontWeight:700,fontSize:13,
                        background: isActive?(ot==="party"?C.accent+"33":C.teal+"33"):C.bg,
                        border:`2px solid ${isActive?(ot==="party"?C.accent:C.teal):C.border}`,
                        color: isActive?(ot==="party"?C.accent:C.teal):(canSelect?C.muted:C.border),
                        opacity: canSelect?1:0.45}}>
                      {ot==="party"?"🤝 Party Order":"🏭 Godown Order"}
                    </button>
                  );
                })}
              </div>
              {user.role!=="owner" && editSheet.orderType==="godown" && (
                <div style={{fontSize:11,color:C.orange,textAlign:"center"}}>
                  Tap Party Order to convert — GR and Invoice upload will be required
                </div>
              )}
            </div>
          )}
          {/* ── Party file upload section — shown when GR or Invoice is missing ── */}
          {editSheet.orderType==="party" && (
            <PartyFileEditSection
              trip={editSheet}
              onUpdate={updates => setEditSheet(p=>({...p,...updates}))}
            />
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

// ─── PARTY FILE EDIT SECTION ─────────────────────────────────────────────────
// Shown in Edit Trip for party orders — allows uploading GR/Invoice per DI
// when they were skipped at save time
function PartyFileEditSection({ trip, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [status,    setStatus]    = useState("");
  const diLines = trip.diLines && trip.diLines.length > 0
    ? trip.diLines
    : [{ diNo: trip.diNo, grNo: trip.grNo }];

  // For single-DI trips: single GR + Invoice upload
  // For multi-DI trips: one GR + Invoice per DI line

  const uploadFile = async (tripId, role, file) => {
    const result = await uploadPartyFile(tripId, role, file);
    return result.path;
  };

  const handleSingleGR = async (file) => {
    if(!file) return;
    setUploading(true); setStatus("Uploading GR…");
    try {
      const path = await uploadFile(trip.id, "gr", file);
      onUpdate({ grFilePath: path });
      setStatus("✓ GR uploaded");
    } catch(e) { setStatus("✗ Upload failed: " + e.message); }
    finally { setUploading(false); }
  };

  const handleSingleInv = async (file) => {
    if(!file) return;
    setUploading(true); setStatus("Uploading Invoice…");
    try {
      const path = await uploadFile(trip.id, "invoice", file);
      onUpdate({ invoiceFilePath: path });
      setStatus("✓ Invoice uploaded");
    } catch(e) { setStatus("✗ Upload failed: " + e.message); }
    finally { setUploading(false); }
  };

  const handleDiGR = async (diLine, file) => {
    if(!file) return;
    setUploading(true); setStatus(`Uploading GR for DI ${diLine.diNo||"—"}…`);
    try {
      const role = `gr_${diLine.diNo||diLine.id||"di"}`;
      const path = await uploadFile(trip.id, role, file);
      // Update diLines with new grFilePath for this DI
      const newLines = (trip.diLines||[]).map(d =>
        d.diNo===diLine.diNo ? {...d, grFilePath: path} : d
      );
      onUpdate({ diLines: newLines });
      setStatus(`✓ GR uploaded for DI ${diLine.diNo||"—"}`);
    } catch(e) { setStatus("✗ Upload failed: " + e.message); }
    finally { setUploading(false); }
  };

  const handleDiInv = async (diLine, file) => {
    if(!file) return;
    setUploading(true); setStatus(`Uploading Invoice for DI ${diLine.diNo||"—"}…`);
    try {
      const role = `inv_${diLine.diNo||diLine.id||"di"}`;
      const path = await uploadFile(trip.id, role, file);
      const newLines = (trip.diLines||[]).map(d =>
        d.diNo===diLine.diNo ? {...d, invoiceFilePath: path} : d
      );
      onUpdate({ diLines: newLines });
      setStatus(`✓ Invoice uploaded for DI ${diLine.diNo||"—"}`);
    } catch(e) { setStatus("✗ Upload failed: " + e.message); }
    finally { setUploading(false); }
  };

  const isMulti = diLines.length > 1;
  const hasAllFiles = isMulti
    ? diLines.every(d => d.grFilePath && d.invoiceFilePath)
    : (trip.grFilePath && trip.invoiceFilePath);

  if(hasAllFiles) return (
    <div style={{background:C.green+"11",border:`1px solid ${C.green}33`,borderRadius:10,
      padding:"10px 14px",marginBottom:8,fontSize:12,color:C.green,fontWeight:700}}>
      ✅ GR and Invoice uploaded for all DIs
    </div>
  );

  return (
    <div style={{background:C.accent+"08",border:`2px solid ${C.accent}44`,borderRadius:12,
      padding:"14px",marginBottom:12}}>
      <div style={{color:C.accent,fontWeight:800,fontSize:13,marginBottom:10}}>
        📎 Upload Missing Files
      </div>

      {!isMulti ? (
        // Single DI — simple two-button upload
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <FileUploadRow
            label="GR Copy"
            path={trip.grFilePath}
            disabled={uploading}
            onFile={handleSingleGR}
          />
          <FileUploadRow
            label="Invoice"
            path={trip.invoiceFilePath}
            disabled={uploading}
            onFile={handleSingleInv}
          />
        </div>
      ) : (
        // Multi-DI — one row per DI
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {diLines.map((dl, idx) => (
            <div key={dl.diNo||idx} style={{background:C.bg,borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontWeight:700,fontSize:12,color:C.text,marginBottom:8}}>
                DI {dl.diNo||`#${idx+1}`} · {dl.qty||0} MT
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <FileUploadRow
                  label="GR Copy"
                  path={dl.grFilePath}
                  disabled={uploading}
                  onFile={f=>handleDiGR(dl,f)}
                />
                <FileUploadRow
                  label="Invoice"
                  path={dl.invoiceFilePath}
                  disabled={uploading}
                  onFile={f=>handleDiInv(dl,f)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {status && (
        <div style={{marginTop:8,fontSize:12,color:status.startsWith("✓")?C.green:status.startsWith("✗")?C.red:C.muted,fontWeight:700}}>
          {status}
        </div>
      )}
      {uploading && (
        <div style={{marginTop:6,fontSize:11,color:C.muted}}>Uploading… please wait</div>
      )}
    </div>
  );
}

// Small helper — single file upload row with status indicator
function FileUploadRow({ label, path, onFile, disabled }) {
  const hasFile = !!path;
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <label style={{flex:1,display:"flex",alignItems:"center",gap:8,cursor:disabled?"not-allowed":"pointer",
        background:hasFile?C.green+"11":C.card,
        border:`1.5px solid ${hasFile?C.green:C.border}`,
        borderRadius:8,padding:"7px 10px",opacity:disabled?0.6:1}}>
        <span style={{fontSize:14}}>{hasFile?"📄":"📎"}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:700,color:hasFile?C.green:C.text}}>{label}</div>
          {hasFile
            ? <div style={{fontSize:10,color:C.green}}>✓ Uploaded</div>
            : <div style={{fontSize:10,color:C.muted}}>Tap to upload</div>
          }
        </div>
        {!hasFile && <span style={{fontSize:11,color:C.accent,fontWeight:700}}>Upload →</span>}
        <input type="file" accept="application/pdf,image/*" style={{display:"none"}}
          disabled={disabled}
          onChange={e=>e.target.files?.[0]&&onFile(e.target.files[0])} />
      </label>
      {hasFile && (
        <a href={`https://rtwhmjeibvhoytakaqka.supabase.co/storage/v1/object/public/party-trip-files/${path}`}
          target="_blank" rel="noreferrer"
          style={{background:C.blue+"22",border:`1px solid ${C.blue}44`,borderRadius:6,
            padding:"5px 8px",fontSize:11,color:C.blue,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>
          View
        </a>
      )}
    </div>
  );
}

// Shared form for add + edit
function TripForm({f, ff, isIn, ac, vehicles, settings, onTruckChange, onSubmit, submitLabel, user, showStatus=false, wasScanned=false, isParty=false, employees=[], cashTransfers=[], recentDestinations=[], recentGrades=[], trips=[], indents=[], manualLrMode=false}) {
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

      {/* LR Number - auto-assigned or manual depending on mode */}
      <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",border:`1.5px solid ${manualLrMode?C.orange:C.blue}44`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{color:manualLrMode?C.orange:C.blue,fontWeight:700,fontSize:12}}>📄 LR NUMBER (Lorry Receipt)</div>
          {manualLrMode && <div style={{fontSize:10,color:C.orange,fontWeight:700}}>🖊 Manual Entry Mode</div>}
        </div>
        {manualLrMode ? (
          // Manual entry — for historical/old data
          <div>
            <input value={f.lrNo||""} onChange={e=>ff("lrNo")(e.target.value.toUpperCase())}
              placeholder="e.g. SKLC020 or 2867"
              style={{width:"100%",background:C.bg,border:`1.5px solid ${C.orange}`,borderRadius:8,
                color:C.text,padding:"10px 12px",fontSize:15,fontWeight:700,outline:"none",
                boxSizing:"border-box",letterSpacing:1}} />
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>
              Enter the LR number exactly as written on the paper LR book
            </div>
          </div>
        ) : f.lrNo ? (
          <div style={{background:C.blue+"11",border:`1.5px solid ${C.blue}44`,borderRadius:8,
            padding:"10px 12px",fontSize:15,fontWeight:800,color:C.blue,letterSpacing:1}}>
            {f.lrNo}
          </div>
        ) : (
          <div style={{background:C.dim,border:`1.5px solid ${C.border}`,borderRadius:8,
            padding:"10px 12px",fontSize:13,color:C.muted,fontStyle:"italic"}}>
            🔢 Will be auto-assigned when saved
          </div>
        )}
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
          {getUserClients(user).map(c => (
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
          <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>
            Loan Recovery ₹{user?.role!=="owner"&&<span style={{color:C.orange,fontSize:10,marginLeft:6}}>🔒 Owner-set</span>}
          </label>
          {(()=>{
            const ownerN3 = (veh?.ownerName||"").trim();
            const ownerVs3 = veh ? (ownerN3 ? (vehicles||[]).filter(x=>(x.ownerName||"").trim()===ownerN3) : [veh]) : [];
            const loanBal = ownerVs3.length > 0 ? ownerVs3.reduce((s,x)=>s+Math.max(0,(x.loan||0)-(x.loanRecovered||0)),0) : null;
            const loanLabel = ownerVs3.length>1 ? `Owner pending (${ownerVs3.length} vehs)` : "Pending";
            const overLimit = loanBal !== null && (+f.loanRecovery||0) > loanBal;
            const isOwnerUser = user?.role==="owner";
            if(!isOwnerUser) return (
              <div style={{background:C.dim,border:`1.5px solid ${C.border}`,borderRadius:10,
                padding:"13px 12px",fontSize:15,color:C.text,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>₹{(+f.loanRecovery||0).toLocaleString("en-IN")}</span>
                <span style={{fontSize:11,color:C.muted}}>🔒 Owner only</span>
              </div>
            );
            return (<>
              <input type="text" inputMode="decimal" value={f.loanRecovery===undefined||f.loanRecovery===null?"":String(f.loanRecovery)}
                onChange={e=>{const raw=e.target.value;if(raw!==""&&!/^\d*\.?\d*$/.test(raw))return;ff("loanRecovery")(raw);}}
                onBlur={e=>{const val=parseFloat(e.target.value)||0;if(loanBal!==null&&val>loanBal)ff("loanRecovery")(String(loanBal));}}
                style={{background:C.bg,border:`1.5px solid ${overLimit?C.red:C.border}`,borderRadius:10,color:C.text,padding:"13px 12px",fontSize:15,outline:"none",width:"100%",boxSizing:"border-box",MozAppearance:"textfield",WebkitAppearance:"none"}} />
              {loanBal!==null&&loanBal>0&&(
                <div style={{color:overLimit?C.red:C.muted,fontSize:11}}>
                  {overLimit?`⚠ Max allowed: ₹${loanBal.toLocaleString("en-IN")}`:`${loanLabel}: ₹${loanBal.toLocaleString("en-IN")}`}
                </div>
              )}
              {loanBal!==null&&loanBal===0&&<div style={{color:C.green,fontSize:11}}>✓ Loan fully cleared</div>}
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
      {(()=>{
        const val = (f.dieselIndentNo||"").trim();
        if(!val) return null;
        const dupTrip = trips.find(t => t.id !== f.id && t.dieselIndentNo && t.dieselIndentNo.trim() === val);
        const dupIndent = indents.find(i => i.indentNo && String(i.indentNo).trim() === val);
        if(dupTrip) return (
          <div style={{background:C.red+"11",border:`1px solid ${C.red}33`,borderRadius:8,
            padding:"8px 12px",fontSize:12,color:C.red,fontWeight:600}}>
            ⚠ Indent No "{val}" already used on LR {dupTrip.lrNo||"—"} ({dupTrip.truckNo} · {dupTrip.date}). Each indent must be unique.
          </div>
        );
        if(dupIndent) return (
          <div style={{background:C.red+"11",border:`1px solid ${C.red}33`,borderRadius:8,
            padding:"8px 12px",fontSize:12,color:C.red,fontWeight:600}}>
            ⚠ Indent No "{val}" already exists in Diesel records ({dupIndent.truckNo} · {dupIndent.date}). Each indent must be unique.
          </div>
        );
        return null;
      })()}
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
function Billing({trips, setTrips, fyTrips, selectedClient, user, log}) {
  const baseTrips = fyTrips || trips; // already role-filtered via sp
  const filteredTrips = selectedClient ? baseTrips.filter(t=>(t.client||DEFAULT_CLIENT)===selectedClient) : baseTrips;
  const pending = filteredTrips.filter(t => t.status==="Pending Bill");
  const billed  = filteredTrips.filter(t => t.status==="Billed");
  const paid    = filteredTrips.filter(t => t.status==="Paid");
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
                ...(calc.loanDeduct>0 && calc.loanDeduct!==calc.loanRecovery ? [{l:"(−) Loan Deduction / Trip", v:calc.loanDeduct, c:C.red, s:"−"}] : []),
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
function TafalMod({trips, vehicles, setVehicles, employees, settings, setSettings, user, dieselRequests=[]}) {
  const [month, setMonth] = useState(today().slice(0,7));
  const tafalRate = settings?.tafalPerTrip || 300;

  const monthTrips  = trips.filter(t => t.date.startsWith(month) && t.tafal>0);
  const collected   = monthTrips.reduce((s,t) => s+(t.tafal||0), 0);
  const activeEmps  = employees.length || 1;
  const perEmployee = activeEmps>0 ? collected/activeEmps : 0;

  // Indent book range — local state so saves only on button press
  const ibStart = settings?.indentBookStart || null;
  const ibEnd   = settings?.indentBookEnd   || null;
  const [ibStartLocal, setIbStartLocal] = useState(String(ibStart||""));
  const [ibEndLocal,   setIbEndLocal]   = useState(String(ibEnd||""));
  const [ibSaved,      setIbSaved]      = useState(false);
  // Sync local state when settings load from DB
  React.useEffect(()=>{ if(ibStart) setIbStartLocal(String(ibStart)); },[ibStart]);
  React.useEffect(()=>{ if(ibEnd)   setIbEndLocal(String(ibEnd));     },[ibEnd]);

  const usedNos = (dieselRequests||[]).map(r=>r.indentNo).filter(Boolean);
  const maxUsed = usedNos.length > 0 ? Math.max(...usedNos) : (ibStart ? ibStart - 1 : 0);
  const nextIndentNo = ibStart ? maxUsed + 1 : null;
  const remaining    = ibStart && ibEnd ? ibEnd - maxUsed : null;

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
          <Field label="₹ Per Trip (all vehicles)" value={String(tafalRate)} onChange={v=>setSettings(p=>{
            const updated={...(p||{}),tafalPerTrip:+v};
            DB.saveSettings(updated).catch(e=>console.error("saveSettings:",e));
            return updated;
          })} type="number" />
          <div style={{color:C.muted,fontSize:12,paddingBottom:14}}>applies to new trips</div>
        </div>
      </div>

      {/* Indent Book Range */}
      <div style={{background:C.card,borderRadius:12,padding:"14px 16px"}}>
        <div style={{color:C.muted,fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>⛽ Diesel Indent Book Range</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:12}}>
          Set the serial number range from your current indent book. Numbers are assigned serially — once the range is exhausted, update to the next book's range.
        </div>
        <div style={{display:"flex",gap:10,marginBottom:10}}>
          <div style={{flex:1}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:4}}>START NUMBER</div>
            <input type="number" value={ibStartLocal} onChange={e=>setIbStartLocal(e.target.value)}
              placeholder="e.g. 200"
              style={{width:"100%",background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,
                color:C.text,padding:"9px 12px",fontSize:15,boxSizing:"border-box"}} />
          </div>
          <div style={{flex:1}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:4}}>END NUMBER</div>
            <input type="number" value={ibEndLocal} onChange={e=>setIbEndLocal(e.target.value)}
              placeholder="e.g. 300"
              style={{width:"100%",background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:8,
                color:C.text,padding:"9px 12px",fontSize:15,boxSizing:"border-box"}} />
          </div>
        </div>
        <Btn onClick={()=>{
          const s = parseInt(ibStartLocal,10);
          const e = parseInt(ibEndLocal,10);
          if(!s||!e||isNaN(s)||isNaN(e)) { alert("Enter valid start and end numbers"); return; }
          if(s>=e) { alert("Start must be less than end"); return; }
          setSettings(p=>{
            const updated = {...(p||{}), indentBookStart:s, indentBookEnd:e};
            DB.saveSettings(updated).catch(e=>console.error("saveSettings:",e));
            return updated;
          });
          setIbSaved(true); setTimeout(()=>setIbSaved(false),2000);
        }} full color={ibSaved?C.green:C.teal}>{ibSaved?"✓ Saved!":"Save Indent Book Range"}</Btn>
        {ibStart && ibEnd && (
          <div style={{background:C.bg,borderRadius:10,padding:"10px 14px",display:"flex",flexDirection:"column",gap:6,marginTop:10}}>
            <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:13}}>
              <span style={{color:C.muted}}>Active Range: <b style={{color:C.text}}>{ibStart}–{ibEnd}</b></span>
              <span style={{color:C.muted}}>Next No: <b style={{color:C.orange}}>#{nextIndentNo}</b></span>
              <span style={{color:C.muted}}>Used: <b style={{color:C.text}}>{usedNos.length}</b></span>
              <span style={{color:remaining<=10?C.red:C.green,fontWeight:700}}>Remaining: {remaining}</span>
            </div>
            {remaining <= 10 && remaining > 0 && (
              <div style={{color:C.red,fontSize:12,fontWeight:700}}>
                ⚠ Only {remaining} indent number{remaining!==1?"s":""} left — update range soon
              </div>
            )}
            {remaining <= 0 && (
              <div style={{color:C.red,fontSize:12,fontWeight:700}}>
                🚫 Indent book exhausted. Update Start/End range to a new book.
              </div>
            )}
          </div>
        )}
        {(!ibStart || !ibEnd) && (
          <div style={{color:C.orange,fontSize:12,marginTop:8}}>⚠ Save start and end numbers to enable auto indent numbering</div>
        )}
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
function DieselAlertBanner({ alerts, trips, indents, user, onLink, onDismiss, onDelete, viewOnly=false }) {
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
              {user.role==="owner" && !viewOnly && (
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

              {viewOnly ? (
                <div style={{background:C.orange+"11",border:`1px solid ${C.orange}33`,
                  borderRadius:8,padding:"10px 12px",color:C.orange,fontSize:12,fontWeight:600,textAlign:"center"}}>
                  👁 View Only — contact owner to resolve this alert
                </div>
              ) : (<>

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
              </>)}
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
function SplitPaymentSheet({ scanData, trips, tripWithBalance: tripWithBalanceProp, driverPays=[], employees, setCashTransfers, user, log, onSave, onCancel }) {
  // Recompute live balance using current driverPays (tripWithBalance prop may be stale)
  const tripWithBalance = React.useMemo(() => (tripWithBalanceProp||[]).map(t => {
    const paidSoFar = driverPays.filter(p=>p.tripId===t.id).reduce((s,p)=>s+(p.amount||0),0);
    const balance   = Math.max(0, (t.netDue||0) - paidSoFar);
    return {...t, paidSoFar, balance};
  }), [tripWithBalanceProp, driverPays]);
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
  // Prefer unsettled trips (balance > 0) over settled when multiple match same LR
  const initRows = scannedLRs.map(lr => {
    const lrLow = lr.toLowerCase();
    const lrD = parseInt(lrLow.replace(/[^0-9]/g,""),10)||0;
    const lrA = lrLow.replace(/[^a-z]/g,"");
    const allMatched = tripWithBalance.filter(t => {
      const tLr = (t.lrNo||"").toLowerCase();
      if(tLr === lrLow) return true;
      // Numeric fuzzy: SKLC0021 matches SKLC021
      const tD = parseInt(tLr.replace(/[^0-9]/g,""),10)||0;
      const tA = tLr.replace(/[^a-z]/g,"");
      return lrD && tD && lrD===tD && (!lrA||!tA||lrA===tA);
    });
    // Prefer: unsettled first, then by most recent date
    const matched = allMatched.sort((a,b) => {
      if(a.balance>0 && b.balance<=0) return -1;
      if(a.balance<=0 && b.balance>0) return 1;
      return (b.date||"").localeCompare(a.date||"");
    })[0];
    return { lr, tripId: matched?.id||"", amount: matched ? String(matched.balance) : "" };
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
      return !t || Math.round(+r.amount) <= Math.round(t.balance) + 1;
    }) && rows.length > 0 && Math.abs(remaining) <= 1;

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
                      // auto-match — exact, contains, or numeric fuzzy (SKLC0021 = SKLC021)
                      if(q.length>=2) {
                        const qLow = q.toLowerCase();
                        const qDigits = parseInt(qLow.replace(/[^0-9]/g,""),10)||0;
                        const qAlpha  = qLow.replace(/[^a-z]/g,"");
                        const allM = tripWithBalance.filter(t=>{
                          const lr = (t.lrNo||"").toLowerCase();
                          if(lr===qLow) return true;
                          if(lr.includes(qLow)) return true;
                          if((t.truckNo||"").toLowerCase().includes(qLow)) return true;
                          // Numeric fuzzy: SKLC0021 matches SKLC021
                          const lrDigits = parseInt(lr.replace(/[^0-9]/g,""),10)||0;
                          const lrAlpha  = lr.replace(/[^a-z]/g,"");
                          if(qDigits && lrDigits && qDigits===lrDigits && (!qAlpha||!lrAlpha||qAlpha===lrAlpha)) return true;
                          return false;
                        }).sort((a,b)=>{
                          const aExact = (a.lrNo||"").toLowerCase()===qLow;
                          const bExact = (b.lrNo||"").toLowerCase()===qLow;
                          if(aExact && !bExact) return -1;
                          if(!aExact && bExact) return 1;
                          if(a.balance>0 && b.balance<=0) return -1;
                          if(a.balance<=0 && b.balance>0) return 1;
                          return 0;
                        });
                        const matchedTrip = allM[0];
                        updateRow(i,"tripId", matchedTrip?.id||"");
                        // Auto-fill amount with balance if amount is empty
                        if(matchedTrip && !row.amount) {
                          updateRow(i,"amount", String(matchedTrip.balance));
                        }
                      } else {
                        updateRow(i,"tripId","");
                      }
                    }}
                    placeholder="Type LR number or truck…"
                    style={{background:C.card,border:`1px solid ${row.tripId?C.green:C.border}`,borderRadius:7,
                      color:C.text,padding:"7px 10px",fontSize:13,width:"100%",
                      boxSizing:"border-box",outline:"none"}} />
                  {/* Matching dropdown */}
                  {row.lr && !row.tripId && (() => {
                    const q = row.lr.toLowerCase();
                    const qD = parseInt(q.replace(/[^0-9]/g,""),10)||0;
                    const qA = q.replace(/[^a-z]/g,"");
                    const matches = tripWithBalance.filter(t=>{
                      const lr=(t.lrNo||"").toLowerCase();
                      const lrD=parseInt(lr.replace(/[^0-9]/g,""),10)||0;
                      const lrA=lr.replace(/[^a-z]/g,"");
                      const numMatch = qD&&lrD&&qD===lrD&&(!qA||!lrA||qA===lrA);
                      return t.balance>0&&(lr.includes(q)||numMatch||(t.truckNo||"").toLowerCase().includes(q));
                    }).slice(0,5);
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
                    trip && Math.round(+row.amount) > Math.round(trip.balance) ? C.red :
                    +row.amount > 0 ? C.green : C.border
                  }`,borderRadius:7,
                    color:C.text,padding:"8px 10px",fontSize:14,width:"100%",
                    boxSizing:"border-box",outline:"none"}} />
                {trip && Math.round(+row.amount) > Math.round(trip.balance) + 1 && (
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
// ─── PUMP PORTAL ─────────────────────────────────────────────────────────────
// Dedicated view for pump_operator role — shows only open diesel requests
// Pump operator can update amount + reason using driver's PIN
// Once confirmed, PIN is invalidated and request is locked
function PumpPortal({dieselRequests=[], setDieselRequests, pumps=[], user, log}) {
  const [lrSearch,    setLrSearch]    = useState("");
  const [selected,    setSelected]    = useState(null); // the request being edited
  const [newAmount,   setNewAmount]   = useState("");
  const [reason,      setReason]      = useState("");
  const [pinEntry,    setPinEntry]    = useState("");
  const [pinError,    setPinError]    = useState(false);
  const [confirmed,   setConfirmed]   = useState(null); // last confirmed request snapshot
  const [step,        setStep]        = useState("list"); // list | review | pin | done

  const openRequests = (dieselRequests||[])
    .filter(r => r.status==="open")
    .filter(r => !lrSearch.trim() || r.truckNo.includes(lrSearch.trim().toUpperCase()) || String(r.indentNo).includes(lrSearch.trim()))
    .sort((a,b)=>b.indentNo-a.indentNo);

  const resetFlow = () => {
    setSelected(null); setNewAmount(""); setReason("");
    setPinEntry(""); setPinError(false); setStep("list");
  };

  const startEdit = (req) => {
    setSelected(req);
    setNewAmount(String(req.amount));
    setReason("");
    setPinEntry(""); setPinError(false);
    setStep("review");
  };

  const keyPress = (k) => {
    if(pinEntry.length >= 4) return;
    const next = pinEntry + k;
    setPinEntry(next);
    setPinError(false);
    if(next.length === 4) validatePin(next);
  };

  const keyDel = () => { setPinEntry(p=>p.slice(0,-1)); setPinError(false); };

  const validatePin = async (pin) => {
    if(!selected) return;
    if(pin !== selected.pin) {
      setPinError(true);
      setPinEntry("");
      return;
    }
    // PIN correct — confirm the request
    const effAmt = newAmount && +newAmount > 0 ? +newAmount : selected.amount;
    const changed = effAmt !== selected.amount;
    const updReq = {
      ...selected,
      status: "confirmed",
      confirmedAmount: effAmt,
      confirmedReason: changed ? (reason||"Changed at pump") : null,
      confirmedAt: nowTs(),
      pin: "****",  // invalidate PIN — no further edits possible
    };
    setDieselRequests(p=>p.map(r=>r.id===selected.id ? updReq : r));
    await DB.saveDieselRequest(updReq);
    log("PUMP CONFIRM", `Indent #${selected.indentNo} · ${selected.truckNo} · ₹${effAmt}${changed?` (was ₹${selected.amount})`:""}`)
    setConfirmed({...updReq, changed, originalAmount: selected.amount});
    setStep("done");
  };

  const pump = selected ? pumps.find(p=>p.id===selected?.pumpId) : null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
        <div style={{fontSize:22}}>⛽</div>
        <div>
          <div style={{fontWeight:800,fontSize:16,color:C.orange}}>Diesel Indent Portal</div>
          <div style={{color:C.muted,fontSize:12}}>{user.name} · Pump Operator</div>
        </div>
      </div>

      {/* ── STEP: LIST ── */}
      {step==="list" && (
        <>
          <div style={{background:C.card,borderRadius:10,padding:"8px 12px",
            display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:C.muted}}>🔍</span>
            <input value={lrSearch} onChange={e=>setLrSearch(e.target.value)}
              placeholder="Search by truck no or indent no…"
              style={{flex:1,background:"none",border:"none",outline:"none",
                fontSize:14,color:C.text}} />
            {lrSearch && <span onClick={()=>setLrSearch("")}
              style={{color:C.muted,cursor:"pointer",fontSize:18}}>×</span>}
          </div>

          {openRequests.length===0 && (
            <div style={{textAlign:"center",color:C.muted,padding:48,fontSize:14}}>
              {lrSearch ? "No matching open requests" : "No open diesel requests"}
            </div>
          )}

          {openRequests.map(req=>{
            const p = pumps.find(x=>x.id===req.pumpId);
            return (
              <div key={req.id} style={{background:C.card,borderRadius:12,padding:"14px 16px",
                borderLeft:`3px solid ${C.orange}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15}}>
                      <span style={{color:C.orange}}>#{req.indentNo}</span>
                      {" · "}{req.truckNo}
                    </div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>
                      {req.date}{p?" · "+p.name:""}
                    </div>
                  </div>
                  <div style={{fontWeight:800,fontSize:18,color:C.text}}>{fmt(req.amount)}</div>
                </div>
                <Btn onClick={()=>startEdit(req)} full color={C.orange}>
                  Open & Confirm
                </Btn>
              </div>
            );
          })}
        </>
      )}

      {/* ── STEP: REVIEW ── */}
      {step==="review" && selected && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button onClick={resetFlow}
            style={{background:"none",border:"none",color:C.muted,fontSize:13,
              cursor:"pointer",textAlign:"left",padding:0}}>
            ← Back to list
          </button>

          {/* Indent details */}
          <div style={{background:C.card,borderRadius:12,padding:"14px 16px"}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:10,
              textTransform:"uppercase",letterSpacing:1}}>Indent Details</div>
            {[
              ["Indent No",  `#${selected.indentNo}`],
              ["Truck",       selected.truckNo],
              ["Date",        selected.date],
              ["Pump",        pump?.name||"—"],
            ].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",
                padding:"7px 0",borderBottom:`1px solid ${C.border}22`,fontSize:13}}>
                <span style={{color:C.muted}}>{k}</span>
                <span style={{fontWeight:600}}>{v}</span>
              </div>
            ))}
          </div>

          {/* Authorised amount */}
          <div style={{background:C.orange+"11",border:`2px solid ${C.orange}`,
            borderRadius:12,padding:"16px",textAlign:"center"}}>
            <div style={{color:C.orange,fontSize:11,fontWeight:700,
              textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>
              Authorised Amount
            </div>
            <div style={{fontWeight:800,fontSize:38,color:C.orange}}>{fmt(selected.amount)}</div>
            <div style={{color:C.muted,fontSize:12,marginTop:4}}>
              Fill exactly this amount OR enter the actual amount below if different
            </div>
          </div>

          {/* Actual amount (only if different) */}
          <div style={{background:C.card,borderRadius:12,padding:"14px 16px",
            display:"flex",flexDirection:"column",gap:10}}>
            <div style={{color:C.text,fontWeight:700,fontSize:13}}>
              ⚠ Amount Different? Enter Actual
            </div>
            <Field label="Actual Amount Filled (₹)"
              value={newAmount} onChange={setNewAmount} type="number"
              placeholder={String(selected.amount)} />
            <Field label="Reason for Change"
              value={reason} onChange={setReason}
              opts={[
                {v:"",           l:"— select reason —"},
                {v:"no_cash",    l:"No cash available at pump"},
                {v:"partial",    l:"Partial fill only"},
                {v:"extra_fill", l:"Extra diesel filled"},
                {v:"driver_req", l:"Driver requested change"},
                {v:"other",      l:"Other"},
              ]} />
            {newAmount && +newAmount !== selected.amount && !reason && (
              <div style={{color:C.red,fontSize:12}}>⚠ Select a reason when amount is different</div>
            )}
          </div>

          <Btn onClick={()=>{
            if(newAmount && +newAmount !== selected.amount && !reason) {
              alert("Select a reason for the amount change"); return;
            }
            setStep("pin");
          }} full color={C.teal}>
            Proceed to Driver PIN Verification →
          </Btn>
        </div>
      )}

      {/* ── STEP: PIN ── */}
      {step==="pin" && selected && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button onClick={()=>setStep("review")}
            style={{background:"none",border:"none",color:C.muted,fontSize:13,
              cursor:"pointer",textAlign:"left",padding:0}}>
            ← Back
          </button>

          {/* Summary of what will be confirmed */}
          <div style={{background:C.card,borderRadius:12,padding:"14px 16px"}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:8,
              textTransform:"uppercase",letterSpacing:1}}>Confirming</div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:4}}>
              <span style={{color:C.muted}}>Indent</span>
              <span style={{fontWeight:700}}>#{selected.indentNo} · {selected.truckNo}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:14}}>
              <span style={{color:C.muted}}>Amount</span>
              <div style={{textAlign:"right"}}>
                {newAmount && +newAmount !== selected.amount ? (
                  <>
                    <span style={{color:C.muted,textDecoration:"line-through",fontSize:12,marginRight:6}}>
                      {fmt(selected.amount)}
                    </span>
                    <span style={{fontWeight:800,color:C.orange,fontSize:16}}>{fmt(+newAmount)}</span>
                  </>
                ) : (
                  <span style={{fontWeight:800,fontSize:16}}>{fmt(selected.amount)}</span>
                )}
              </div>
            </div>
          </div>

          {/* PIN entry */}
          <div style={{background:C.card,borderRadius:12,padding:"16px",textAlign:"center"}}>
            <div style={{color:C.text,fontWeight:700,fontSize:14,marginBottom:4}}>
              Driver PIN Required
            </div>
            <div style={{color:C.muted,fontSize:12,marginBottom:16}}>
              Ask the driver for his 4-digit PIN to confirm this transaction
            </div>

            {/* PIN display */}
            <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:20}}>
              {[0,1,2,3].map(i=>(
                <div key={i} style={{width:48,height:56,borderRadius:10,
                  background:C.bg,border:`2px solid ${pinError?C.red:pinEntry.length>i?C.teal:C.border}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:28,fontWeight:800,color:C.teal,
                  transition:"border-color 0.15s"}}>
                  {pinEntry.length>i?"●":""}
                </div>
              ))}
            </div>

            {pinError && (
              <div style={{color:C.red,fontWeight:700,fontSize:13,marginBottom:12}}>
                ❌ Incorrect PIN — try again
              </div>
            )}

            {/* Keypad */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:280,margin:"0 auto"}}>
              {["1","2","3","4","5","6","7","8","9"].map(k=>(
                <button key={k} onClick={()=>keyPress(k)}
                  style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,
                    padding:"16px 8px",fontSize:22,fontWeight:700,cursor:"pointer",color:C.text}}>
                  {k}
                </button>
              ))}
              <div/>
              <button onClick={()=>keyPress("0")}
                style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,
                  padding:"16px 8px",fontSize:22,fontWeight:700,cursor:"pointer",color:C.text}}>
                0
              </button>
              <button onClick={keyDel}
                style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,
                  padding:"16px 8px",fontSize:20,cursor:"pointer",color:C.red}}>
                ⌫
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP: DONE ── */}
      {step==="done" && confirmed && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:C.green+"11",border:`2px solid ${C.green}`,
            borderRadius:14,padding:"24px 20px",textAlign:"center"}}>
            <div style={{fontSize:44,marginBottom:8}}>✅</div>
            <div style={{fontWeight:800,fontSize:18,color:C.green,marginBottom:4}}>
              Confirmed & Locked
            </div>
            <div style={{fontWeight:800,fontSize:32,color:C.text,marginBottom:8}}>
              {fmt(confirmed.confirmedAmount)}
            </div>
            {confirmed.changed && (
              <div style={{color:C.orange,fontSize:13,marginBottom:8}}>
                Original: {fmt(confirmed.originalAmount)} → Changed to {fmt(confirmed.confirmedAmount)}
                {confirmed.confirmedReason && <div style={{color:C.muted,fontSize:12,marginTop:2}}>{confirmed.confirmedReason}</div>}
              </div>
            )}
            <div style={{color:C.muted,fontSize:12,marginBottom:16}}>
              Indent #{confirmed.indentNo} · {confirmed.truckNo}<br/>
              This indent is now locked. PIN is no longer valid.
            </div>
            <Btn onClick={()=>{ setConfirmed(null); setStep("list"); }} full color={C.teal}>
              ← Back to Requests
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function DieselMod({trips, setTrips, vehicles, indents, setIndents, pumpPayments, setPumpPayments, pumps, setPumps, driverPays, setDriverPays, user, log, viewOnly=false, dieselRequests=[], setDieselRequests, settings}) {
  const [view,        setView]        = useState("requests");
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
  const [expandPump,  setExpandPump]  = useState(null);
  const [filterFrom,  setFilterFrom]  = useState("");
  const [filterTo,    setFilterTo]    = useState("");
  const [showFilter,  setShowFilter]  = useState(false);

  // ── Diesel Request state ──────────────────────────────────────────────────
  const [staleAlertsOpen, setStaleAlertsOpen] = useState(false);
  const [drSheet,        setDrSheet]        = useState(false);
  const [drTruckNo,      setDrTruckNo]      = useState("");
  const [drAmount,       setDrAmount]       = useState("");
  const [drPumpId,       setDrPumpId]       = useState("");
  const [drPinDisplay,   setDrPinDisplay]   = useState(null);
  const [drLastIndentNo, setDrLastIndentNo] = useState(null);

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
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{color:C.orange,fontWeight:800,fontSize:16}}>⛽ Diesel & Pump</div>
          {viewOnly && <span style={{background:C.orange+"22",color:C.orange,fontSize:10,fontWeight:700,borderRadius:8,padding:"2px 8px"}}>VIEW ONLY</span>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>setShowFilter(v=>!v)} sm outline color={showFilter?C.orange:C.muted}>📅 Filter</Btn>
          {!viewOnly && <Btn onClick={()=>setScanSheet(true)} sm outline color={C.blue}>📷 Scan Slip</Btn>}
          {!viewOnly && <Btn onClick={()=>setPumpSheet(true)} sm outline color={C.muted}>+ Pump</Btn>}
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
          viewOnly={viewOnly}
          onLink={(alertId, tripId) => linkAlertToTrip(alertId, tripId)}
          onDismiss={(alertId, reason) => dismissAlert(alertId, reason)}
          onDelete={deleteAlert}
        />
      )}

      {/* Stale indent alerts — trips with diesel estimate but no indent scanned */}
      {staleIndentAlerts.length > 0 && (
        <div style={{background:C.orange+"11",border:`1.5px solid ${C.orange}55`,borderRadius:12,overflow:"hidden"}}>
          {/* Header row — always visible, tap to expand/collapse */}
          <div onClick={()=>setStaleAlertsOpen(p=>!p)}
            style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"12px 14px",cursor:"pointer"}}>
            <div>
              <div style={{color:C.orange,fontWeight:800,fontSize:13}}>
                ⏰ {staleIndentAlerts.length} Trip{staleIndentAlerts.length>1?"s":""} Missing Diesel Indent
              </div>
              {!staleAlertsOpen && (
                <div style={{color:C.muted,fontSize:11,marginTop:2}}>Tap to view details</div>
              )}
            </div>
            <div style={{color:C.orange,fontSize:18,fontWeight:700,lineHeight:1}}>
              {staleAlertsOpen ? "▲" : "▼"}
            </div>
          </div>
          {/* Collapsible list */}
          {staleAlertsOpen && (
            <div style={{padding:"0 14px 12px",borderTop:`1px solid ${C.orange}33`}}>
              <div style={{color:C.muted,fontSize:12,marginBottom:8,marginTop:8}}>
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
        {id:"requests", label:`Requests (${(dieselRequests||[]).filter(r=>r.status!=="attached").length})`, color:C.teal},
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

      {/* ── DIESEL REQUESTS VIEW ── */}
      {view==="requests" && (()=>{
        const ibStart = settings?.indentBookStart||null;
        const ibEnd   = settings?.indentBookEnd||null;
        const usedNos = (dieselRequests||[]).map(r=>r.indentNo).filter(Boolean);
        const maxUsed = usedNos.length>0 ? Math.max(...usedNos) : (ibStart ? ibStart-1 : 0);
        const nextNo  = ibStart ? maxUsed+1 : null;
        const remaining = (ibStart&&ibEnd) ? ibEnd-maxUsed : null;

        const createRequest = async () => {
          if (!drTruckNo.trim()) { alert("Enter truck number"); return; }
          if (!drAmount || +drAmount<=0) { alert("Enter indent amount"); return; }
          if (!ibStart||!ibEnd) { alert("Set Indent Book range in Settings → TAFAL tab first."); return; }
          if (nextNo>ibEnd) { alert(`Indent book exhausted (${ibStart}–${ibEnd}). Update range in Settings → TAFAL tab.`); return; }
          const pin = String(Math.floor(1000+Math.random()*9000));
          const req = {
            id:uid(), indentNo:nextNo,
            truckNo:drTruckNo.trim().toUpperCase(),
            pumpId:drPumpId||null,
            amount:+drAmount,
            date:today(), pin, status:"open",
            confirmedAmount:null, confirmedReason:null, confirmedAt:null,
            tripId:null, lrNo:null,
            createdBy:user.username, createdAt:nowTs(),
          };
          setDieselRequests(p=>[req,...(p||[])]);
          await DB.saveDieselRequest(req);
          log("DIESEL REQUEST",`Indent #${nextNo} · ${req.truckNo} · ₹${req.amount}`);
          setDrPinDisplay(pin); setDrLastIndentNo(nextNo);
          setDrTruckNo(""); setDrAmount(""); setDrPumpId("");
        };

        return (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>

            {/* Indent book status bar */}
            {(ibStart&&ibEnd) ? (
              <div style={{background:C.card,borderRadius:10,padding:"10px 14px",
                display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <div style={{fontSize:12,color:C.muted}}>
                  Book <b style={{color:C.text}}>{ibStart}–{ibEnd}</b>
                  {" · "}Next: <b style={{color:C.orange}}>#{nextNo}</b>
                  {" · "}Remaining: <b style={{color:remaining<=10?C.red:C.green}}>{remaining}</b>
                </div>
                {remaining<=10&&remaining>0&&<Badge label={`Only ${remaining} left!`} color={C.red}/>}
                {remaining<=0&&<Badge label="Book Exhausted" color={C.red}/>}
              </div>
            ) : (
              <div style={{background:C.orange+"11",border:`1px solid ${C.orange}44`,
                borderRadius:10,padding:"10px 14px",fontSize:12,color:C.orange}}>
                ⚠ Set Indent Book Start/End in Settings → TAFAL tab before creating requests
              </div>
            )}

            {/* Create request form */}
            {!viewOnly && (
              <div style={{background:C.card,borderRadius:12,padding:"14px 16px",
                display:"flex",flexDirection:"column",gap:10}}>
                <div style={{color:C.teal,fontWeight:700,fontSize:13}}>+ New Diesel Request</div>
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1}}>
                    <Field label="Truck No" value={drTruckNo} onChange={setDrTruckNo} placeholder="KA32AB1234"/>
                  </div>
                  <div style={{flex:1}}>
                    <Field label="Amount ₹" value={drAmount} onChange={setDrAmount} type="number" placeholder="10000"/>
                  </div>
                </div>
                <Field label="Petrol Pump (optional)"
                  value={drPumpId} onChange={setDrPumpId}
                  opts={[{v:"",l:"— No pump selected —"},...(pumps||[]).map(p=>({v:p.id,l:p.name}))]}/>
                <Btn onClick={createRequest} full color={C.teal}>
                  ⛽ Generate Indent #{nextNo||"—"} + Driver PIN
                </Btn>

                {/* PIN reveal after creation */}
                {drPinDisplay && (
                  <div style={{background:C.teal+"11",border:`2px solid ${C.teal}`,
                    borderRadius:12,padding:"16px",textAlign:"center"}}>
                    <div style={{color:C.muted,fontSize:11,marginBottom:4}}>
                      INDENT #{drLastIndentNo} · DRIVER PIN
                    </div>
                    <div style={{fontFamily:"monospace",fontSize:44,fontWeight:800,
                      color:C.teal,letterSpacing:10}}>{drPinDisplay}</div>
                    <div style={{color:C.muted,fontSize:11,marginTop:8,lineHeight:1.5}}>
                      Tell this PIN to the driver before he leaves.<br/>
                      Pump must enter this PIN to change the amount.
                    </div>
                    <Btn onClick={()=>setDrPinDisplay(null)} sm outline color={C.muted}
                      style={{marginTop:10}}>Dismiss</Btn>
                  </div>
                )}
              </div>
            )}

            {/* Requests list */}
            {(dieselRequests||[]).length===0 && (
              <div style={{textAlign:"center",color:C.muted,padding:40}}>
                No diesel requests yet. Create one above before dispatching a truck.
              </div>
            )}
            {[...(dieselRequests||[])].sort((a,b)=>b.indentNo-a.indentNo).map(req=>{
              const pump    = pumps.find(p=>p.id===req.pumpId);
              const statusColor = req.status==="attached"?C.green:req.status==="confirmed"?C.teal:C.orange;
              const effAmt  = req.confirmedAmount??req.amount;
              const changed = req.confirmedAmount!=null && req.confirmedAmount!==req.amount;
              return (
                <div key={req.id} style={{background:C.card,borderRadius:12,padding:"12px 14px",
                  borderLeft:`3px solid ${statusColor}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:14}}>
                        <span style={{color:C.orange}}>#{req.indentNo}</span>
                        {" · "}{req.truckNo}
                      </div>
                      <div style={{color:C.muted,fontSize:12,marginTop:2}}>
                        {req.date}{pump?" · "+pump.name:""}
                      </div>
                      {req.status==="open" && (
                        <div style={{color:C.muted,fontSize:11,marginTop:2}}>
                          Driver PIN: <b style={{fontFamily:"monospace",fontSize:15,color:C.teal,letterSpacing:3}}>{req.pin}</b>
                        </div>
                      )}
                      {req.status==="confirmed" && (
                        <div style={{color:C.teal,fontSize:11,marginTop:2}}>
                          ✓ Confirmed by pump — PIN invalidated
                        </div>
                      )}
                      {req.lrNo && (
                        <div style={{color:C.green,fontSize:11,marginTop:2}}>✓ Attached to LR {req.lrNo}</div>
                      )}
                      {changed && (
                        <div style={{color:C.orange,fontSize:11,marginTop:2}}>
                          ⚠ Amount changed: ₹{req.amount.toLocaleString("en-IN")} → ₹{req.confirmedAmount.toLocaleString("en-IN")}
                          {req.confirmedReason&&<span style={{color:C.muted}}> ({req.confirmedReason})</span>}
                        </div>
                      )}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0,marginLeft:10}}>
                      <div style={{fontWeight:800,fontSize:16,color:statusColor}}>
                        {fmt(effAmt)}
                      </div>
                      <Badge label={req.status.toUpperCase()} color={statusColor}/>
                      {user.role==="owner" && req.status==="open" && (
                        <div style={{marginTop:6}}>
                          <button onClick={async()=>{
                            if(!window.confirm(`Delete indent #${req.indentNo} for ${req.truckNo}? This cannot be undone.`)) return;
                            setDieselRequests(p=>p.filter(r=>r.id!==req.id));
                            await DB.deleteDieselRequest(req.id);
                            log("DELETE DIESEL REQUEST",`Indent #${req.indentNo} · ${req.truckNo}`);
                          }} style={{background:"none",border:`1px solid ${C.red}55`,borderRadius:6,
                            color:C.red,fontSize:11,padding:"3px 8px",cursor:"pointer"}}>
                            🗑 Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

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

// ─── DEDUCT PER TRIP FIELD (save button prevents per-keystroke DB writes) ────────
function DeductPerTripField({ownerVehs, ownerTruckNos, ownerDeductPerTrip, setVehicles}) {
  const [val, setVal] = useState(String(ownerDeductPerTrip));
  const changed = (+val) !== ownerDeductPerTrip;
  return (
    <div style={{background:C.bg,borderRadius:12,padding:14}}>
      <div style={{color:C.blue,fontWeight:700,fontSize:12,marginBottom:8}}>
        ✂ Deduct Per Trip{ownerVehs.length>1?` — applies to all ${ownerVehs.length} vehicles`:""}
      </div>
      <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
        <div style={{flex:1}}>
          <Field label="Amount ₹" value={val} onChange={setVal} type="number" />
        </div>
        <div style={{paddingBottom:10}}>
          <Btn onClick={()=>{
            if(!changed) return;
            setVehicles(p=>p.map(x=>ownerTruckNos.has(x.truckNo)?{...x,deductPerTrip:+val}:x));
          }} sm color={changed?C.blue:C.muted}>Save</Btn>
        </div>
      </div>
      {ownerVehs.length>1&&(
        <div style={{fontSize:10,color:C.muted,marginTop:4}}>
          Syncs to: {[...ownerTruckNos].join(", ")}
        </div>
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
  const [pdfFrom,  setPdfFrom]  = useState("");
  const [pdfTo,    setPdfTo]    = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Loan txn form
  const [lAmt,  setLAmt]  = useState(""); const [lDate,  setLDate]  = useState(new Date().toISOString().slice(0,10));
  const [lRef,  setLRef]  = useState(""); const [lAcct,  setLAcct]  = useState("");
  const [lAcct2,setLAcct2]= useState(""); // vehicle selector for multi-vehicle owner
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
    if((v.truckNo||"").toLowerCase().includes(q))    return true;
    if((v.ownerName||"").toLowerCase().includes(q))  return true;
    if((v.driverName||"").toLowerCase().includes(q)) return true;
    if((v.phone||"").includes(q))       return true;
    if((v.driverPhone||"").includes(q)) return true;
    if((v.accountNo||"").includes(q))   return true;
    // Search within accounts[] array
    if((v.accounts||[]).some(a=>(a.accountNo||"").includes(q)||(a.name||"").toLowerCase().includes(q))) return true;
    return false;
  });

  const resetLoanForm = () => { setLAmt(""); setLDate(today()); setLRef(""); setLAcct(""); setLAcct2(""); setRAmt(""); setRDate(today()); setRLR(""); setRRef(""); };
  const resetShForm   = () => { setShAmt(""); setShTrip(""); setSrAmt(""); setSrLR(""); };

  // Phone-only edit for non-owners
  const [phoneEditId,  setPhoneEditId]  = useState(null);
  const [phoneEditVal, setPhoneEditVal] = useState("");

  // ── PDF EXPORT ──────────────────────────────────────────────────────────────
  const exportVehiclePDF = (v, pdfFrom="", pdfTo="") => {
    const vtrips = (trips||[]).filter(t => (t.truckNo===v.truckNo || t.truck===v.truckNo)
                               && (!pdfFrom || t.date>=pdfFrom) && (!pdfTo || t.date<=pdfTo))
                               .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    const pays = (driverPays||[]).filter(p => p.truckNo===v.truckNo
                               && (!pdfFrom || p.date>=pdfFrom) && (!pdfTo || p.date<=pdfTo));
    const totalPaid = pays.reduce((s,p)=>s+(p.amount||0),0);
    const ownerNamePDF = (v.ownerName||"").trim();
    const ownerVehsPDF = ownerNamePDF ? (vehicles||[]).filter(x=>(x.ownerName||"").trim()===ownerNamePDF) : [v];
    const ownerLoanGivenPDF = ownerVehsPDF.reduce((s,x)=>s+(x.loan||0),0);
    const ownerLoanRecovPDF = ownerVehsPDF.reduce((s,x)=>s+(x.loanRecovered||0),0);
    const loanBal = ownerLoanGivenPDF - ownerLoanRecovPDF;
    const isMultiVehOwner = ownerVehsPDF.length > 1;
    // Collect all loan txns across owner's vehicles for the PDF, tagged with truck
    const loanTxns = ownerVehsPDF.flatMap(x=>(x.loanTxns||[]).map(tx=>({...tx,_truckNo:x.truckNo}))).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    const vLoanTxns = v.loanTxns||[]; // this vehicle only (for per-vehicle section)
    const shortageTxns = v.shortageTxns||[];

    const tripRows = vtrips.map(t => {
      const isMultiDI = t.diLines&&t.diLines.length>1;
      const gross = isMultiDI ? t.diLines.reduce((s,d)=>s+(d.qty||0)*(d.givenRate||0),0) : (t.qty||0)*(t.givenRate||0);
      // Use actual recorded values — NOT deductPerTrip (which would double-count loanRecovery)
      const net = gross-(t.advance||0)-(t.tafal||0)-(t.dieselEstimate||0)-(t.shortageRecovery||0)-(t.loanRecovery||0);
      const shortAmt = (t.shortage||0)*(t.givenRate||0);
      return `<tr>
        <td>${t.lrNo||"—"}</td><td>${fmtD(t.date)}</td>
        <td>${t.from||"—"} → ${t.to||"—"}</td><td>${t.qty||0} MT</td>
        <td>₹${fmt(t.billedToShree||t.qty*(t.frRate||0)||0)}</td><td>₹${fmt(gross)}</td>
        <td>${(t.shortage||0)>0?`${t.shortage}MT (₹${fmt(shortAmt)})`:"—"}</td>
        <td>${t.loanRecovery>0?`-₹${fmt(t.loanRecovery||0)} loan`:""}</td>
        <td>₹${fmt(Math.max(0,net))}</td>
        <td style="color:${t.driverSettled?"#1a7f37":"#b45309"}">${t.driverSettled?"Settled":"Pending"}</td>
      </tr>`;
    }).join("");

    const loanGivenRows = loanTxns.filter(x=>x.type==="given").map(x=>`<tr>
      <td>${fmtD(x.date)}</td><td>₹${fmt(x.amount)}</td>
      <td>${x.ref||"—"}</td><td>${x.accountName||"—"}</td>
      ${isMultiVehOwner?`<td>${x._truckNo||"—"}</td>`:""}
      <td>${x.note||"—"}</td>
    </tr>`).join("");

    const loanRecoveryRows = loanTxns.filter(x=>x.type==="recovery").map(x=>`<tr>
      <td>${fmtD(x.date)}</td><td>₹${fmt(x.amount)}</td>
      <td>${x.lrNo||"—"}</td><td>${x.ref||"—"}</td>
      ${isMultiVehOwner?`<td>${x._truckNo||"—"}</td>`:""}
      <td>${x.note||"—"}</td>
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
      <td>${p.utr||p.referenceNo||"—"}</td><td>₹${fmt(p.amount)}</td>
      <td>${p.paidTo||"—"}</td><td>${p.notes||p.note||"—"}</td>
    </tr>`).join("");

    const html = `<style>
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;margin:20px}
      h1{font-size:18px;margin-bottom:2px;display:flex;align-items:center}
      h2{font-size:13px;color:#333;margin:18px 0 5px;border-bottom:2px solid #eee;padding-bottom:4px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;margin:10px 0 16px;font-size:11px}
      .meta span{color:#555} .meta b{color:#111}
      .kpis{display:flex;gap:12px;margin:12px 0;flex-wrap:wrap}
      .kpi{border:1px solid #ddd;border-radius:6px;padding:8px 14px;min-width:90px;text-align:center}
      .kpi .val{font-size:15px;font-weight:800} .kpi .lbl{font-size:9px;color:#888;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:10px}
      th{background:#1565c0;color:white;padding:5px 7px;text-align:left;border:1px solid #1565c0;font-size:9px;text-transform:uppercase}
      td{padding:4px 7px;border:1px solid #e0e0e0} tr:nth-child(even){background:#f0f6fc}
      .footer{margin-top:20px;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:8px}
      .empty{color:#999;font-style:italic;font-size:11px;padding:6px 0}
      @media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } }
    </style>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid #1565c0">
      <div style="width:48px;height:48px;background:#1565c0;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;print-color-adjust:exact;-webkit-print-color-adjust:exact">
        <span style="color:white;font-size:18px;font-weight:900;font-family:Arial,sans-serif;letter-spacing:-1px">MY</span>
      </div>
      <div>
        <div style="font-size:7px;text-transform:uppercase;letter-spacing:2px;color:#1565c0;font-weight:700">M Yantra Enterprises</div>
        <div style="font-size:20px;font-weight:800;line-height:1.2">Vehicle Report — ${v.truckNo}</div>
        <div style="font-size:10px;color:#888">Generated ${new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}${pdfFrom||pdfTo ? ` &nbsp;·&nbsp; Period: <b>${pdfFrom||"start"}</b> to <b>${pdfTo||"today"}</b>` : ""}</div>
      </div>
    </div>
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
      <div class="kpi"><div class="val" style="color:${loanBal>0?"#dc2626":"#15803d"}">₹${fmt(loanBal)}</div><div class="lbl">${isMultiVehOwner?"OWNER LOAN BAL":"LOAN BALANCE"}</div></div>
      <div class="kpi"><div class="val" style="color:#d97706">₹${fmt((v.shortageOwed||0)-(v.shortageRecovered||0))}</div><div class="lbl">SHORTAGE BALANCE</div></div>
      <div class="kpi"><div class="val" style="color:#7c3aed">${vtrips.filter(t=>!t.driverSettled).length}</div><div class="lbl">UNSETTLED</div></div>
    </div>

    <h2>📦 Trip History (${vtrips.length})</h2>
    ${vtrips.length===0?'<div class="empty">No trips recorded.</div>':`<table><tr><th>LR No</th><th>Date</th><th>Route</th><th>Qty</th><th>Billed</th><th>Gross</th><th>Shortage</th><th>Loan Recov.</th><th>Net Pay</th><th>Status</th></tr>${tripRows}</table>`}

    <h2>💳 Driver Payment History (${pays.length})</h2>
    ${pays.length===0?'<div class="empty">No payments recorded.</div>':`<table><tr><th>Date</th><th>LR No</th><th>UTR / Reference</th><th>Amount</th><th>Paid To</th><th>Note</th></tr>${payRows}</table>`}

    <h2>🏦 ${isMultiVehOwner?"Owner ":""}Loan Ledger — Given (${loanTxns.filter(x=>x.type==="given").length})</h2>
    ${loanGivenRows?`<table><tr><th>Date</th><th>Amount</th><th>Reference</th><th>Account</th>${isMultiVehOwner?"<th>Vehicle</th>":""}<th>Note</th></tr>${loanGivenRows}</table>`:'<div class="empty">No loan disbursements recorded.</div>'}

    <h2>🏦 ${isMultiVehOwner?"Owner ":""}Loan Ledger — Recoveries (${loanTxns.filter(x=>x.type==="recovery").length})</h2>
    ${loanRecoveryRows?`<table><tr><th>Date</th><th>Amount</th><th>LR No</th><th>Reference</th>${isMultiVehOwner?"<th>Vehicle</th>":""}<th>Note</th></tr>${loanRecoveryRows}</table>`:'<div class="empty">No loan recoveries recorded.</div>'}

    <table style="max-width:380px;margin-top:8px">
      <tr><th>${isMultiVehOwner?"Owner Total Loan Given":"Total Loan Given"}</th><td>₹${fmt(ownerLoanGivenPDF)}</td></tr>
      <tr><th>Recovered</th><td>₹${fmt(ownerLoanRecovPDF)}</td></tr>
      <tr><th style="color:#dc2626">Balance Due</th><td style="font-weight:800;color:${loanBal>0?"#dc2626":"#15803d"}">₹${fmt(loanBal)}</td></tr>
      ${isMultiVehOwner?`<tr><th>This Vehicle Given</th><td>₹${fmt(v.loan||0)}</td></tr><tr><th>This Vehicle Recovered</th><td>₹${fmt(v.loanRecovered||0)}</td></tr>`:""}
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
        <div style={{display:"flex",gap:8}}>
          {isOwner && (
            <Btn sm outline color={C.orange} onClick={()=>{
              const withPhone = (vehicles||[]).filter(v=>v.driverPhone);
              if(withPhone.length===0){alert("No driver phone numbers to clear.");return;}
              if(!window.confirm(`Clear driver phone numbers from ${withPhone.length} vehicle${withPhone.length>1?"s":""}?\n\nThey will be re-added automatically on the next batch DI scan.\n\nThis cannot be undone.`)) return;
              setVehicles(prev=>prev.map(v=>v.driverPhone?{...v,driverPhone:""}:v));
              log("CLEAR DRIVER PHONES",`Cleared ${withPhone.length} driver phone numbers`);
            }}>
              🗑 Clear Phones
            </Btn>
          )}
          {isOwner && <Btn onClick={()=>{setEditId(null);setF(blank);setSheet(true);}} sm>+ Add</Btn>}
          {isOwner && (
            <Btn sm outline color={C.red} onClick={()=>{
              // Backfill: scan all trips for negative net and add to vehicle loan
              // Skip trips that already have a loanTxn referencing that LR (already processed)
              let addedCount = 0;
              const updatedVehicles = [...(vehicles||[])];
              (trips||[]).forEach(t => {
                const gross = (t.diLines&&t.diLines.length>1)
                  ? t.diLines.reduce((s,d)=>s+(d.qty||0)*(d.givenRate||0),0)
                  : (t.qty||0)*(t.givenRate||0);
                const net = gross-(t.advance||0)-(t.tafal||0)-(t.dieselEstimate||0)
                           -(t.shortageRecovery||0)-(t.loanRecovery||0);
                if(net >= 0) return; // only negative net trips
                const overpaid = Math.abs(net);
                const tn = (t.truckNo||"").toUpperCase().trim();
                const vIdx = updatedVehicles.findIndex(v=>v.truckNo===tn);
                if(vIdx<0) return;
                const veh = updatedVehicles[vIdx];
                // Skip if already recorded (loan txn with this LR exists)
                if((veh.loanTxns||[]).some(tx=>tx.lrNo===t.lrNo&&tx.type==="loan")) return;
                const loanTxn = { id:uid(), type:"loan", date:t.date||today(),
                  amount:overpaid, lrNo:t.lrNo,
                  note:`Backfill: negative net on LR ${t.lrNo} — ₹${overpaid.toLocaleString("en-IN")}` };
                updatedVehicles[vIdx] = {
                  ...veh,
                  loan: (veh.loan||0)+overpaid,
                  loanTxns: [...(veh.loanTxns||[]),loanTxn],
                };
                addedCount++;
              });
              if(addedCount===0){
                alert("No unrecorded negative-net trips found. All negative balances are already in loan records.");
                return;
              }
              if(!window.confirm(`Found ${addedCount} trip${addedCount>1?"s":""} with negative net balance.

These will be added to the respective vehicle loan records.

Proceed?`)) return;
              setVehicles(updatedVehicles);
              log("BACKFILL LOANS",`Added ${addedCount} negative-net trips to vehicle loans`);
              alert(`✅ Done — ${addedCount} trip${addedCount>1?"s":""} added to vehicle loan records.

The loan recovery will auto-fill on the next trip for each affected vehicle.`);
            }}>
              🔄 Backfill Loans
            </Btn>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <KPI icon="🔴" label="Loan Due"       value={fmt((vehicles||[]).reduce((s,v)=>s+Math.max(0,(v.loan||0)-(v.loanRecovered||0)),0))} color={C.red} />
        <KPI icon="🚛" label="Total Vehicles"  value={(vehicles||[]).length} color={C.blue} />
      </div>

      {/* Search + Date Filter */}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{position:"relative"}}>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:C.muted,pointerEvents:"none"}}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search truck no, owner, driver…"
          style={{width:"100%",boxSizing:"border-box",background:C.bg,border:`1px solid ${C.border}`,
            borderRadius:10,padding:"9px 12px 9px 34px",color:C.text,fontSize:13,outline:"none"}}/>
        {search&&<button onClick={()=>setSearch("")}
          style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
            background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button>}
      </div>
      {search&&<div style={{fontSize:11,color:C.muted}}>{filtered.length} of {(vehicles||[]).length} vehicles</div>}


      {/* Date filter for PDF export */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <button onClick={()=>setShowDateFilter(p=>!p)}
          style={{background:showDateFilter?C.blue+"22":"transparent",border:`1px solid ${showDateFilter?C.blue:C.border}`,
            borderRadius:8,color:showDateFilter?C.blue:C.muted,fontSize:11,fontWeight:700,
            cursor:"pointer",padding:"5px 10px"}}>
          📅 {showDateFilter?"Hide Date Filter":"PDF Date Filter"}
        </button>
        {(pdfFrom||pdfTo) && (
          <span style={{fontSize:11,color:C.orange,fontWeight:700}}>
            {pdfFrom||"start"} → {pdfTo||"today"}
            <button onClick={()=>{setPdfFrom("");setPdfTo("");}}
              style={{marginLeft:6,background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:12}}>✕</button>
          </span>
        )}
      </div>
      {showDateFilter && (
        <div style={{background:C.card,borderRadius:10,padding:"10px 14px",display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{flex:1,minWidth:120}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>FROM DATE</div>
            <input type="date" value={pdfFrom} onChange={e=>setPdfFrom(e.target.value)}
              onClick={e=>e.target.showPicker?.()}
              style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,
                color:pdfFrom?C.text:C.muted,padding:"7px 8px",fontSize:12,boxSizing:"border-box"}} />
          </div>
          <div style={{flex:1,minWidth:120}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>TO DATE</div>
            <input type="date" value={pdfTo} onChange={e=>setPdfTo(e.target.value)}
              onClick={e=>e.target.showPicker?.()}
              style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,
                color:pdfTo?C.text:C.muted,padding:"7px 8px",fontSize:12,boxSizing:"border-box"}} />
          </div>
          <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>PDF will filter trips/payments by date range</div>
        </div>
      )}
      </div>
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

      {/* ── LOAN MANAGEMENT SHEET (OWNER-LEVEL) ── */}
      {lSheet&&(()=>{
        const v = vehicles.find(x=>x.id===lSheet);
        if(!v) return null;

        // ── Owner group: all vehicles with same ownerName (or just this one if no owner set)
        const ownerName = (v.ownerName||"").trim();
        const ownerVehs = ownerName
          ? (vehicles||[]).filter(x=>(x.ownerName||"").trim()===ownerName)
          : [v];
        const ownerTruckNos = new Set(ownerVehs.map(x=>x.truckNo));

        // ── Owner-level aggregated loan totals
        const ownerLoanGiven     = ownerVehs.reduce((s,x)=>s+(x.loan||0),0);
        const ownerLoanRecovered = ownerVehs.reduce((s,x)=>s+(x.loanRecovered||0),0);
        const ownerBal           = ownerLoanGiven - ownerLoanRecovered;

        // ── All transactions across owner's vehicles (tagged with truckNo)
        const allOwnerTxns = ownerVehs.flatMap(x=>
          (x.loanTxns||[]).map(tx=>({...tx, _vehicleId:x.id, _truckNo:x.truckNo}))
        ).sort((a,b)=>(b.date||"").localeCompare(a.date||""));

        // ── Eligible trips: unsettled, from any of owner's vehicles
        const vtrips = (trips||[]).filter(t=>
          !t.driverSettled &&
          (ownerTruckNos.has(t.truckNo)||ownerTruckNos.has(t.truck))
        );

        // ── Deduct/trip — read from first owner vehicle (all are synced on save)
        const ownerDeductPerTrip = ownerVehs[0]?.deductPerTrip || 0;

        return (
          <Sheet title={`🏦 Loan — ${ownerName||v.truckNo}${ownerVehs.length>1?` (${ownerVehs.length} vehicles)`:""}`} onClose={()=>{setLSheet(null);resetLoanForm();}}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>

              {/* Owner vehicle chips */}
              {ownerVehs.length>1&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {ownerVehs.map(x=>{
                    const vBal=(x.loan||0)-(x.loanRecovered||0);
                    return (
                      <div key={x.id} style={{background:vBal>0?C.red+"22":C.green+"22",
                        border:`1px solid ${vBal>0?C.red:C.green}44`,borderRadius:20,
                        padding:"3px 10px",fontSize:11,fontWeight:700,
                        color:vBal>0?C.red:C.green}}>
                        {x.truckNo} {vBal>0?`₹${fmt(vBal)}`:"✓"}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Owner-level Balance summary */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                {[
                  {l:"Total Given",  v:"₹"+fmt(ownerLoanGiven),     c:C.red},
                  {l:"Recovered",    v:"₹"+fmt(ownerLoanRecovered),  c:C.green},
                  {l:"Balance",      v:"₹"+fmt(ownerBal),            c:ownerBal>0?C.accent:C.green},
                ].map(x=>(
                  <div key={x.l} style={{background:C.bg,borderRadius:10,padding:12,textAlign:"center"}}>
                    <div style={{color:x.c,fontWeight:800,fontSize:13}}>{x.v}</div>
                    <div style={{color:C.muted,fontSize:10}}>{x.l}</div>
                  </div>
                ))}
              </div>

              {/* Give Loan */}
              <div style={{background:C.bg,borderRadius:12,padding:14}}>
                <div style={{color:C.red,fontWeight:700,fontSize:12,marginBottom:10}}>➕ Give Loan to {ownerName||v.truckNo}</div>
                <div style={{display:"flex",gap:10}}>
                  <Field label="Amount ₹ *" value={lAmt} onChange={setLAmt} type="number" half />
                  <Field label="Date"        value={lDate} onChange={setLDate} type="date"   half />
                </div>
                <div style={{display:"flex",gap:10}}>
                  <Field label="Reference / Cheque No" value={lRef}  onChange={setLRef}  half />
                  <Field label="Account Name"           value={lAcct} onChange={setLAcct} half />
                </div>
                {ownerVehs.length>1&&(
                  <Field label="Attach to Vehicle" value={lAcct2||v.id}
                    onChange={val=>setLAcct2(val)}
                    opts={ownerVehs.map(x=>({v:x.id,l:x.truckNo}))} />
                )}
                <Btn onClick={()=>{
                  if(!lAmt||+lAmt<=0){alert("Enter loan amount.\nಸಾಲದ ಮೊತ್ತ ನಮೂದಿಸಿ.");return;}
                  const targetId = (ownerVehs.length>1 && lAcct2) ? lAcct2 : v.id;
                  const txn={id:uid(),type:"given",date:lDate,amount:+lAmt,ref:lRef,accountName:lAcct,note:""};
                  setVehicles(p=>p.map(x=>x.id===targetId?{...x,
                    loan:(x.loan||0)+ +lAmt,
                    loanTxns:[...(x.loanTxns||[]),txn]}:x));
                  const targetTruck = ownerVehs.find(x=>x.id===targetId)?.truckNo||v.truckNo;
                  log("ADD LOAN",`${ownerName||targetTruck} via ${targetTruck} ₹${fmt(+lAmt)} ref:${lRef||"—"}`);
                  setLAmt(""); setLDate(today()); setLRef(""); setLAcct(""); setLAcct2("");
                }} color={C.red} full>Add Loan</Btn>
              </div>

              {/* Record Recovery */}
              <div style={{background:C.bg,borderRadius:12,padding:14}}>
                <div style={{color:C.green,fontWeight:700,fontSize:12,marginBottom:10}}>💰 Record Recovery</div>
                {ownerBal<=0&&<div style={{background:C.green+"11",borderRadius:8,padding:"7px 10px",fontSize:11,color:C.green,marginBottom:8}}>✓ Loan fully recovered — no balance pending</div>}
                {ownerBal>0&&<div style={{background:"#1a0a00",borderRadius:8,padding:"7px 10px",fontSize:11,color:C.orange,marginBottom:8}}>
                  Outstanding: ₹{fmt(ownerBal)}{+rAmt>0?` · Entering: ₹${fmt(+rAmt)}${+rAmt>ownerBal?" ⚠ exceeds balance":" ✓"}`:""}</div>}
                <div style={{display:"flex",gap:10}}>
                  <Field label="Amount ₹ *" value={rAmt}  onChange={setRAmt}  type="number" half />
                  <Field label="Date"        value={rDate} onChange={setRDate} type="date"   half />
                </div>
                <div style={{display:"flex",gap:10}}>
                  <SearchSelect label="Link LR No (any owner vehicle)" value={rLR} onChange={setRLR}
                    opts={[{v:"",l:"— None —"},...vtrips.map(t=>({v:t.lrNo||t.id,l:`${t.lrNo||"—"} · ${t.truckNo} · ${t.date}`}))]}
                    half placeholder={`Search LR… (${vtrips.length} trips)`} />
                  <Field label="Reference" value={rRef} onChange={setRRef} half />
                </div>
                <Btn onClick={()=>{
                  if(!rAmt||+rAmt<=0){alert("Enter recovery amount.\nವಸೂಲಾತಿ ಮೊತ್ತ ನಮೂದಿಸಿ.");return;}
                  if(+rAmt > ownerBal){alert(`Recovery ₹${fmt(+rAmt)} exceeds owner loan balance ₹${fmt(ownerBal)}.\nMax: ₹${fmt(ownerBal)}`);return;}
                  if(rLR){
                    const linkedTrip = (trips||[]).find(t=>(t.lrNo||t.id)===rLR);
                    if(linkedTrip){
                      const tripNet = (linkedTrip.qty||0)*(linkedTrip.givenRate||0)
                        - (linkedTrip.advance||0) - (linkedTrip.tafal||0)
                        - (linkedTrip.dieselEstimate||0)
                        - (linkedTrip.shortageRecovery||0)
                        - (linkedTrip.loanRecovery||0);
                      if(+rAmt > Math.max(0,tripNet)){
                        alert(`Recovery ₹${fmt(+rAmt)} would make Est. Net to Driver negative for LR: ${rLR}.\nMax from this trip: ₹${fmt(Math.max(0,tripNet))}`);
                        return;
                      }
                    }
                  }
                  // Attach recovery to the vehicle that ran the linked LR; else clicked vehicle
                  const linkedTrip2 = rLR ? (trips||[]).find(t=>(t.lrNo||t.id)===rLR) : null;
                  const targetVeh = linkedTrip2
                    ? ownerVehs.find(x=>x.truckNo===(linkedTrip2.truckNo||"").toUpperCase().trim())
                    : null;
                  const targetRecovId = targetVeh ? targetVeh.id : v.id;
                  const txn={id:uid(),type:"recovery",date:rDate,amount:+rAmt,lrNo:rLR,ref:rRef,note:""};
                  setVehicles(p=>p.map(x=>x.id===targetRecovId?{...x,
                    loanRecovered:(x.loanRecovered||0)+ +rAmt,
                    loanTxns:[...(x.loanTxns||[]),txn]}:x));
                  if(rLR){
                    setTrips(p=>p.map(t=>{
                      if((t.lrNo||t.id)!==rLR) return t;
                      return {...t, loanRecovery:(t.loanRecovery||0)+ +rAmt};
                    }));
                  }
                  const usedTruck = targetVeh?.truckNo||v.truckNo;
                  log("LOAN RECOVERY",`${ownerName||usedTruck} via ${usedTruck} ₹${fmt(+rAmt)} LR:${rLR||"—"}`);
                  setRAmt(""); setRDate(today()); setRLR(""); setRRef("");
                }} color={C.green} full>Record Recovery</Btn>
              </div>

              {/* Deduct per trip — synced to ALL owner vehicles (save button prevents per-keystroke DB writes) */}
              <DeductPerTripField
                ownerVehs={ownerVehs}
                ownerTruckNos={ownerTruckNos}
                ownerDeductPerTrip={ownerDeductPerTrip}
                setVehicles={setVehicles}
              />

              {/* Combined transaction history across all owner vehicles */}
              {allOwnerTxns.length>0&&(
                <>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:1,marginTop:4}}>
                    TRANSACTION HISTORY ({allOwnerTxns.length})
                  </div>
                  {allOwnerTxns.map(tx=>(
                    <div key={tx.id} style={{background:C.bg,borderRadius:10,padding:"10px 12px",
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      borderLeft:`3px solid ${tx.type==="given"?C.red:C.green}`}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:tx.type==="given"?C.red:C.green}}>
                          {tx.type==="given"?"➕ Given":"💰 Recovery"} · ₹{fmt(tx.amount)}
                        </div>
                        <div style={{fontSize:11,color:C.muted}}>{fmtD(tx.date)}{tx.ref?` · Ref: ${tx.ref}`:""}</div>
                        {tx.accountName&&<div style={{fontSize:11,color:C.muted}}>Acct: {tx.accountName}</div>}
                        {tx._truckNo&&ownerVehs.length>1&&<div style={{fontSize:11,color:C.blue}}>🚛 {tx._truckNo}</div>}
                        {tx.lrNo&&<div style={{fontSize:11,color:C.teal}}>LR: {tx.lrNo}</div>}
                      </div>
                      {isOwner&&<button onClick={()=>{
                        if(tx.type==="recovery"){
                          const linkedTrip = tx.lrNo?(trips||[]).find(t=>t.lrNo===tx.lrNo):null;
                          const warn = linkedTrip
                            ? `Delete ₹${fmt(tx.amount)} recovery?\nLinked LR: ${tx.lrNo} — trip loanRecovery will be reduced.`
                            : `Delete ₹${fmt(tx.amount)} recovery?\nOwner loan balance will increase by ₹${fmt(tx.amount)}.`;
                          if(!window.confirm(warn)) return;
                          setVehicles(p=>p.map(x=>x.id===tx._vehicleId?{...x,
                            loanRecovered:Math.max(0,(x.loanRecovered||0)-tx.amount),
                            loanTxns:(x.loanTxns||[]).filter(t=>t.id!==tx.id)}:x));
                          if(linkedTrip){
                            setTrips(p=>p.map(t=>t.id!==linkedTrip.id?t:
                              {...t,loanRecovery:Math.max(0,(t.loanRecovery||0)-tx.amount)}));
                          }
                        } else {
                          if(!window.confirm(`Delete ₹${fmt(tx.amount)} loan entry?\nOwner loan total will decrease by ₹${fmt(tx.amount)}.`)) return;
                          setVehicles(p=>p.map(x=>x.id===tx._vehicleId?{...x,
                            loan:Math.max(0,(x.loan||0)-tx.amount),
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
                  if(owedMT===0) return <div style={{background:C.green+"11",borderRadius:8,padding:"7px 10px",fontSize:11,color:C.green,marginBottom:8}}>✓ No shortage recorded — nothing to recover</div>;
                  if(balMT<=0)  return <div style={{background:C.green+"11",borderRadius:8,padding:"7px 10px",fontSize:11,color:C.green,marginBottom:8}}>✓ Shortage fully recovered</div>;
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

      {(()=>{
        // Track which ownerNames we've already rendered the owner-loan header for
        const seenOwners = new Set();
        return filtered.map(v=>{
        const ownerName2 = (v.ownerName||"").trim();
        const ownerVehs2 = ownerName2 ? (vehicles||[]).filter(x=>(x.ownerName||"").trim()===ownerName2) : [v];
        const ownerLoanG2 = ownerVehs2.reduce((s,x)=>s+(x.loan||0),0);
        const ownerLoanR2 = ownerVehs2.reduce((s,x)=>s+(x.loanRecovered||0),0);
        const ownerBal2 = ownerLoanG2 - ownerLoanR2;
        const vBal=(v.loan||0)-(v.loanRecovered||0); // per-vehicle
        const isFirstOfOwner = ownerName2 ? !seenOwners.has(ownerName2) : true;
        if(ownerName2) seenOwners.add(ownerName2);
        const bal = ownerBal2; // alias for WA button
        const vt=(trips||[]).filter(t=>t.truckNo===v.truckNo||t.truck===v.truckNo);
        const short=vt.reduce((s,t)=>s+(t.shortage||0),0);
        return (
          <div key={v.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",
            borderLeft:`4px solid ${ownerBal2>0?C.red:C.green}`,marginBottom:8}}>
            {/* Truck + owner row */}
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div>
                <div style={{fontWeight:800,fontSize:15}}>{v.truckNo}</div>
                <div style={{color:C.muted,fontSize:12}}>{v.ownerName||"—"}{v.phone?` · ${v.phone}`:""}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <Badge label={ownerBal2>0?"Loan Due":"Clear"} color={ownerBal2>0?C.red:C.green} />
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
            {ownerVehs2.length>1 ? (
              // Multi-vehicle owner: show owner-total on first card, per-vehicle note on rest
              isFirstOfOwner ? (
                <>
                  <div style={{background:C.orange+"11",border:`1px solid ${C.orange}44`,borderRadius:8,
                    padding:"5px 10px",fontSize:10,color:C.orange,fontWeight:700,marginBottom:6}}>
                    👥 Owner total across {ownerVehs2.length} vehicles
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                    {[
                      {l:"Owner Loan",  v:fmt(ownerLoanG2), c:C.red},
                      {l:"Recovered",   v:fmt(ownerLoanR2), c:C.green},
                      {l:"Balance",     v:fmt(ownerBal2),   c:ownerBal2>0?C.accent:C.green},
                    ].map(x=>(
                      <div key={x.l} style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}>
                        <div style={{color:x.c,fontWeight:700,fontSize:12}}>{x.v}</div>
                        <div style={{color:C.muted,fontSize:9}}>{x.l.toUpperCase()}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{background:C.bg,borderRadius:8,padding:"7px 10px",fontSize:11,
                  color:C.muted,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>Owner loan balance: <b style={{color:ownerBal2>0?C.accent:C.green}}>₹{fmt(ownerBal2)}</b></span>
                  <span style={{fontSize:10}}>tap 🏦 Loan to manage</span>
                </div>
              )
            ) : (
              // Single vehicle owner: show normal per-vehicle KPIs
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                {[
                  {l:"Loan",       v:fmt(v.loan||0),          c:C.red},
                  {l:"Recovered",  v:fmt(ownerLoanR2),        c:C.green},
                  {l:"Balance",    v:fmt(ownerBal2),           c:ownerBal2>0?C.accent:C.green},
                ].map(x=>(
                  <div key={x.l} style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}>
                    <div style={{color:x.c,fontWeight:700,fontSize:12}}>{x.v}</div>
                    <div style={{color:C.muted,fontSize:9}}>{x.l.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            )}

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
              <Btn onClick={()=>exportVehiclePDF(v,pdfFrom,pdfTo)} sm outline color={C.orange}>📄 PDF</Btn>
              {v.driverPhone&&(
                <Btn onClick={()=>window.open(`https://wa.me/91${v.driverPhone.replace(/\D/g,"")}?text=${encodeURIComponent(`Dear ${v.driverName||"Driver"}, this is M Yantra Enterprises. - 9606477257`)}`,`_blank`)} sm outline color={C.teal}>📲 Driver</Btn>
              )}
              {v.phone&&(
                <Btn onClick={()=>window.open(`https://wa.me/91${v.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Dear ${v.ownerName}, loan balance ₹${fmt(bal)}. - M.Yantra 9606477257`)}`,`_blank`)} sm outline color={C.green}>📲 Owner</Btn>
              )}
            </div>
          </div>
        );
      }); // end filtered.map
      })()} {/* end owner-tracking IIFE */}

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

              <Btn onClick={()=>exportVehiclePDF(v,pdfFrom,pdfTo)} full outline color={C.orange}>📄 Export {pdfFrom||pdfTo?"Filtered":"Full"} PDF Report</Btn>

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
      th{background:#1565c0;color:#fff;padding:7px 8px;text-align:left;font-size:11px}
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
    <div style={{background:C.green+"11",border:`1px solid ${C.green}33`,borderRadius:10,
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
        <span style={{color:C.muted,fontSize:12}}>{open?"▲":"▼"}</span>
      </button>
      {open && (
        <div style={{padding:"0 14px 14px",display:"flex",flexDirection:"column",gap:10}}>
          {/* Invoice selector */}
          <div>
            <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",
              letterSpacing:1,display:"block",marginBottom:4}}>Invoice *</label>
            <select value={inv} onChange={e=>{ setInv(e.target.value);
              const g=gstHoldItems.find(x=>x.invoiceNo===e.target.value);
              if(g) setAmt(String(g.balance)); }}
              style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,
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
                <span style={{color:C.muted}}>Total Held</span>
                <span style={{color:"#c67c00",fontWeight:700}}>₹{Number(selectedItem.holdAmount).toLocaleString("en-IN",{maximumFractionDigits:2})}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                <span style={{color:C.muted}}>Balance</span>
                <span style={{color:"#b91c1c",fontWeight:700}}>₹{Number(selectedItem.balance).toLocaleString("en-IN",{maximumFractionDigits:2})}</span>
              </div>
            </div>
          )}
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",
                letterSpacing:1,display:"block",marginBottom:4}}>Release Amount ₹ *</label>
              <input type="number" value={amt} onChange={e=>setAmt(e.target.value)}
                style={{width:"100%",boxSizing:"border-box",background:C.card2,border:`1px solid ${C.border}`,
                  borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,outline:"none"}} />
            </div>
            <div style={{flex:1}}>
              <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",
                letterSpacing:1,display:"block",marginBottom:4}}>Date *</label>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)}
                onClick={e=>e.target.showPicker?.()}
                style={{width:"100%",boxSizing:"border-box",background:C.card2,border:`1px solid ${C.border}`,
                  borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,outline:"none",colorScheme:"light"}} />
            </div>
          </div>
          <div>
            <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",
              letterSpacing:1,display:"block",marginBottom:4}}>UTR Number *</label>
            <input value={utr} onChange={e=>setUtr(e.target.value)} placeholder="e.g. 1527531918"
              style={{width:"100%",boxSizing:"border-box",background:C.card2,border:`1px solid ${C.border}`,
                borderRadius:8,color:C.text,padding:"10px 12px",fontSize:13,outline:"none"}} />
          </div>
          <div>
            <label style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",
              letterSpacing:1,display:"block",marginBottom:4}}>Notes</label>
            <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"
              style={{width:"100%",boxSizing:"border-box",background:C.card2,border:`1px solid ${C.border}`,
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

  // GST Payments — stored in localStorage under key "mye_gst_payments"
  const [gstPaymentsLocal, setGstPaymentsLocal] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("mye_gst_payments")||"[]"); } catch{ return []; }
  });
  const saveGstPayment = (entry) => {
    const updated = [...gstPaymentsLocal.filter(g=>g.id!==entry.id), entry]
      .sort((a,b)=>b.month.localeCompare(a.month));
    setGstPaymentsLocal(updated);
    localStorage.setItem("mye_gst_payments", JSON.stringify(updated));
  };
  const deleteGstPayment = (id) => {
    const updated = gstPaymentsLocal.filter(g=>g.id!==id);
    setGstPaymentsLocal(updated);
    localStorage.setItem("mye_gst_payments", JSON.stringify(updated));
  };
  const [gstPayForm, setGstPayForm] = React.useState({month:"", cgst:"", sgst:"", igst:"", notes:""});
  const [showGstForm, setShowGstForm] = React.useState(false);

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

  // Client selector — "" = All
  const [payClient, setPayClient] = useState("");
  const [payMaterial, setPayMaterial] = useState("All"); // All | Cement | RawMaterial | Husk
  const payTrips = (trips||[]).filter(t=> {
    if(payClient && (t.client||DEFAULT_CLIENT)!==payClient) return false;
    if(payMaterial!=="All") {
      if(payMaterial==="Cement"      && t.type!=="outbound") return false;
      if(payMaterial==="RawMaterial" && t.type!=="inbound")  return false;
      if(payMaterial==="Husk"        && !(t.grade||"").toLowerCase().includes("husk")) return false;
    }
    return true;
  });

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
    const dupPayment = (payments||[]).find(p=>p.utr===utr);
    if(dupPayment) {
      setScanError(`UTR ${utr} was already recorded on ${dupPayment.paymentDate||dupPayment.date||"—"}. This payment is already in the system — discard this scan.`);
      return;
    }
    const invList=scanResult.invoices||[], shorts=scanResult.shortages||[], exps=scanResult.expenses||[];

    // Block save if any referenced invoice has NOT been uploaded yet
    const savedInvoiceNos = new Set((trips||[]).filter(t=>t.invoiceNo).map(t=>t.invoiceNo.trim()));
    const missingInvoices = invList.filter(i => {
      const invNo = (i.invoiceNo||"").trim();
      return invNo && !savedInvoiceNos.has(invNo);
    });
    if(missingInvoices.length > 0) {
      const missing = missingInvoices.map(i=>i.invoiceNo).join(", ");
      setScanError(`Invoice${missingInvoices.length>1?"s":""} not uploaded: ${missing}. Please upload ${missingInvoices.length>1?"these invoices":"this invoice"} in the Invoices tab first, then scan the payment advice again.`);
      return;
    }

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

    // Save expenses — skip entirely if this UTR already has expenses saved
    if(exps.length>0&&setExpenses){
      // Check manual expenses for same UTR
      const utrAlreadyInManual = (Array.isArray(expenses)?expenses:[])
        .some(e => e.notes && e.notes.includes("UTR:"+utr));
      // Check shree payment advice expenses (stored inside payments) for same UTR
      const utrAlreadyInPayments = (payments||[])
        .some(p => p.utr===utr && (p.expenses||[]).length>0);
      if(utrAlreadyInManual || utrAlreadyInPayments) {
        log && log("EXPENSE SKIP: UTR "+utr+" already has expenses saved — skipping duplicate");
      } else {
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
    const c={pending:{bg:C.bg,col:C.muted,txt:"Pending"},
             billed:{bg:C.green+"11",col:C.green,txt:"Billed"},
             paid:{bg:C.blue+"11",col:C.blue,txt:"Paid"}}[status]||{bg:C.bg,col:C.muted,txt:"Pending"};
    return <span style={{display:"inline-flex",alignItems:"center",gap:3}}>
      <span style={{background:c.bg,color:c.col,border:`1px solid ${c.col}40`,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:700}}>{c.txt}</span>
      {shortage&&<span style={{background:C.red+"11",color:C.red,border:`1px solid ${C.red}40`,borderRadius:4,padding:"2px 5px",fontSize:10,fontWeight:700}}>⚠SHORT</span>}
    </span>;
  };

  const SearchBar = ({value,onChange,placeholder}) => (
    <div style={{position:"relative",marginBottom:12}}>
      <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,color:C.muted,pointerEvents:"none"}}>🔍</span>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:"100%",boxSizing:"border-box",background:C.bg,border:`1px solid ${C.border}`,
          borderRadius:8,padding:"9px 32px 9px 32px",color:C.text,fontSize:13,outline:"none"}}/>
      {value&&<button onClick={()=>onChange("")}
        style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
          background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1}}>✕</button>}
    </div>
  );

  const EmptyState = ({icon,text}) => (
    <div style={{textAlign:"center",padding:"40px 20px",color:"#444"}}>
      <div style={{fontSize:32,marginBottom:8}}>{icon}</div>
      <div style={{fontSize:13}}>{text}</div>
    </div>
  );

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"}}>

      {/* header + KPIs */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"14px 16px"}}>
        <div style={{fontSize:10,letterSpacing:3,color:C.muted,marginBottom:2}}>M YANTRA ENTERPRISES</div>
        <div style={{fontSize:17,fontWeight:800,color:C.text,marginBottom:12}}>💰 Payments</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
          {[
            {label:"Total Billed",   val:`₹${fmtINR(totalBilled)}`,   col:C.blue},
            {label:"Total Received", val:`₹${fmtINR(totalReceived)}`, col:C.green},
            {label:"On Hold",        val:`₹${fmtINR(totalHold)}`,     col:C.orange},
            {label:"Shortage Lost",  val:`₹${fmtINR(totalShortage)}`, col:C.red},
          ].map(m=>(
            <div key={m.label} style={{background:C.card2,borderRadius:6,padding:"8px 12px",border:`1px solid ${C.border}`}}>
              <div style={{fontSize:9,color:C.muted,letterSpacing:1}}>{m.label}</div>
              <div style={{fontWeight:800,color:m.col,fontSize:15}}>{m.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* shortage alert */}
      {showAlert&&allShortages.length>0&&(
        <div style={{background:"#fef2f2",borderBottom:`1px solid ${C.red}30`,padding:"8px 16px",
          display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span>🚨</span>
          <span style={{color:"#b91c1c",fontWeight:700,fontSize:12}}>
            {allShortages.length} shortage{allShortages.length>1?"s":""} — ₹{fmtINR(totalShortage)} deducted
          </span>
          <button onClick={()=>setActiveTab("shortages")}
            style={{background:C.red+"15",border:`1px solid ${C.red}50`,color:C.red,
              padding:"2px 10px",borderRadius:4,cursor:"pointer",fontSize:11}}>View</button>
          <button onClick={()=>setShowAlert(false)}
            style={{marginLeft:"auto",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button>
        </div>
      )}

      {/* Client / Plant switcher — All + per-client */}
      <div style={{padding:"10px 14px 0",display:"flex",flexDirection:"column",gap:6}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:0.5}}>CLIENT</span>
          {[{v:"", l:"All Clients"},...CLIENTS.map(c=>({v:c,l:c.replace("Shree Cement ","SC ").replace("Ultratech ","UT ")}))].map(({v,l})=>{
            const col = v===""?C.muted:v.includes("Ultratech")?C.orange:v.includes("Guntur")?C.purple:C.blue;
            const cnt = v===""?(trips||[]).filter(t=>t.billedToShree).length:(trips||[]).filter(t=>(t.client||DEFAULT_CLIENT)===v&&t.billedToShree).length;
            const active = payClient===v;
            return (
              <button key={v||"all"} onClick={()=>setPayClient(v)}
                style={{padding:"5px 12px",borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",
                  border:`1.5px solid ${active?col:C.border}`,
                  background:active?col+"22":"transparent",
                  color:active?col:C.muted}}>
                {l} <span style={{opacity:0.7,fontSize:10}}>({cnt})</span>
              </button>
            );
          })}
        </div>
        {/* Material filter */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{color:C.muted,fontSize:10,fontWeight:700,letterSpacing:0.5}}>MATERIAL</span>
          {["All","Cement","RawMaterial","Husk"].map(m=>(
            <button key={m} onClick={()=>setPayMaterial(m)}
              style={{padding:"4px 10px",borderRadius:14,fontSize:11,fontWeight:700,cursor:"pointer",
                border:`1.5px solid ${payMaterial===m?C.teal:C.border}`,
                background:payMaterial===m?C.teal+"22":"transparent",
                color:payMaterial===m?C.teal:C.muted}}>
              {m==="RawMaterial"?"Raw Material":m}
            </button>
          ))}
        </div>
      </div>

      {/* tabs with badges */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,
        display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
        {[
          {id:"overview",  label:"Overview",  badge:null},
          {id:"invoices",  label:"Invoices",  badge:shreeInvoices.length||null},
          {id:"payments",  label:"Advice",    badge:shreePayments.length||null},
          {id:"shortages", label:"Shortages", badge:allShortages.length||null},
          {id:"gst",       label:"GST Hold",  badge:gstHoldPending>0?gstHoldItems.filter(g=>g.balance>0).length:null},
          {id:"gstpay",    label:"GST Recon", badge:null},
          {id:"profit",    label:"Profit",    badge:null},
        ].map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            background:"none",border:"none",padding:"11px 14px",cursor:"pointer",
            whiteSpace:"nowrap",flexShrink:0,
            fontSize:13,fontWeight:activeTab===t.id?700:400,
            color:activeTab===t.id?C.accent:C.muted,
            borderBottom:activeTab===t.id?`2px solid ${C.accent}`:"2px solid transparent",
          }}>
            {t.label}
            {t.badge!=null&&(
              <span style={{marginLeft:5,background:activeTab===t.id?C.accent+"22":C.dim,
                color:activeTab===t.id?C.accent:C.muted,borderRadius:10,
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
                {label:"Shree Trips",     val:shreeTrips.length,                                                               col:C.blue},
                {label:"Pending Billing", val:shreeTrips.filter(t=>!t.shreeStatus||t.shreeStatus==="pending").length,          col:C.orange},
                {label:"Billed / Paid",   val:`${shreeTrips.filter(t=>t.shreeStatus==="billed").length} / ${shreeTrips.filter(t=>t.shreeStatus==="paid").length}`, col:C.green},
                {label:"Shortage Alerts", val:allShortages.length,                                                             col:C.red},
              ].map(c=>(
                <div key={c.label} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
                  <div style={{fontSize:10,color:C.muted,letterSpacing:1,marginBottom:4}}>{c.label}</div>
                  <div style={{fontSize:24,fontWeight:800,color:c.col}}>{c.val}</div>
                </div>
              ))}
            </div>

            {/* scan zone */}
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:14,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>📤 Scan with AI</div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[
                  {icon:"📄",label:"Upload Invoice PDF",      sub:"Extracts LR-wise FRT amounts → marks trips Billed",   type:"invoice"},
                  {icon:"💳",label:"Upload Payment Advice",   sub:"Marks trips Paid + saves electricity/penalty expenses",type:"payment"},
                ].map(btn=>(
                  <div key={btn.type} style={{border:`1.5px dashed ${C.border}`,borderRadius:8,
                    padding:"14px",textAlign:"center",background:C.card2}}>
                    <div style={{fontSize:24,marginBottom:4}}>{btn.icon}</div>
                    <div style={{color:C.text,fontWeight:600,fontSize:13,marginBottom:4}}>{btn.label}</div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:10}}>{btn.sub}</div>
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
                <div style={{marginTop:10,background:"#fef2f2",border:`1px solid ${C.red}40`,borderRadius:6,
                  padding:"10px 12px",color:"#b91c1c",fontSize:12,display:"flex",justifyContent:"space-between",gap:8}}>
                  <span>✕ {scanError}</span>
                  <button onClick={()=>{setScanError(null);setScanResult(null);}}
                    style={{background:"none",border:"none",color:"#b91c1c",cursor:"pointer",flexShrink:0}}>Dismiss</button>
                </div>
              )}

              {scanResult&&!scanError&&(
                <div style={{marginTop:12,background:C.green+"11",border:`1px solid ${C.green}44`,borderRadius:8,padding:12}}>
                  <div style={{fontWeight:700,color:C.green,marginBottom:10,fontSize:13}}>
                    ✅ {scanResult.type==="invoice"?"Invoice":"Payment Advice"} scanned
                  </div>

                  {scanResult.type==="invoice"&&(
                    <>
                      <div style={{fontSize:12,color:C.muted,marginBottom:10,display:"flex",gap:12,flexWrap:"wrap"}}>
                        <b style={{color:C.text}}>{scanResult.invoiceNo||"—"}</b>
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
                                {st.grNo && <span style={{fontFamily:"monospace",color:C.muted,fontSize:10,marginLeft:8}}>GR: {st.grNo}</span>}
                              </div>
                              <span style={{fontFamily:"monospace",color:C.text,flexShrink:0}}>₹{fmtINR(st.frtAmt)}</span>
                              <span style={{flexShrink:0,fontSize:11}}>
                                {trip
                                  ? <span style={{color:"#1b6e3a"}}>✓ LR {trip.lrNo||trip.lr}</span>
                                  : <span style={{color:"#b91c1c"}}>✗ no trip</span>}
                              </span>
                            </div>
                            {/* Amount validation row */}
                            {trip && (
                              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,fontSize:11}}>
                                <span style={{color:C.muted}}>Amount:</span>
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
                            fontSize:11,borderTop:`1px solid ${C.border}`}}>
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
                          {/* Client + Material override */}
                          <div style={{display:"flex",gap:8,marginTop:6}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>CLIENT OVERRIDE</div>
                              <select value={payClient} onChange={e=>setPayClient(e.target.value)}
                                style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,
                                  color:C.text,padding:"6px 8px",fontSize:12,outline:"none"}}>
                                <option value="">Auto-detect</option>
                                {CLIENTS.map(c=><option key={c} value={c}>{c.replace("Shree Cement ","SC ").replace("Ultratech ","UT ")}</option>)}
                              </select>
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:3}}>MATERIAL</div>
                              <select value={payMaterial} onChange={e=>setPayMaterial(e.target.value)}
                                style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,
                                  color:C.text,padding:"6px 8px",fontSize:12,outline:"none"}}>
                                {["All","Cement","RawMaterial","Husk"].map(m=><option key={m} value={m}>{m==="RawMaterial"?"Raw Material":m}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={{display:"flex",gap:8,marginTop:8}}>
                            <button onClick={applyInvoiceScan} disabled={!allOk||alreadySaved}
                              style={{flex:1,background:allOk&&!alreadySaved?C.green:C.dim,
                                color:allOk&&!alreadySaved?"#000":"#666",border:"none",borderRadius:6,
                                padding:"10px",fontWeight:700,
                                cursor:allOk&&!alreadySaved?"pointer":"not-allowed",fontSize:13}}>
                              {alreadySaved ? "Already Saved" : allOk ? "✓ Apply — Mark Billed" : "Fix issues above first"}
                            </button>
                            <button onClick={()=>setScanResult(null)}
                              style={{background:"#e8f0fa",color:C.muted,border:"1px solid #ccddf0",borderRadius:6,
                                padding:"10px 14px",cursor:"pointer",fontSize:12}}>Discard</button>
                          </div>
                        </>);
                      })()}
                    </>
                  )}

                  {scanResult.type==="payment"&&(
                    <>
                      <div style={{fontSize:12,color:C.muted,marginBottom:10,display:"flex",gap:12,flexWrap:"wrap"}}>
                        <span>UTR: <b style={{color:C.text}}>{scanResult.utr||"—"}</b></span>
                        <span>{scanResult.paymentDate||"—"}</span>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:6,marginBottom:10}}>
                        {[
                          {l:"Net Paid",   v:scanResult.totalPaid,   c:"#1b6e3a"},
                          {l:"TDS",        v:scanResult.tdsDeducted, c:"#c67c00"},
                          {l:"Hold",       v:scanResult.holdAmount,  c:"#c67c00"},
                          {l:"Total Bill", v:scanResult.totalBilled, c:"#aaa"},
                        ].map(m=>(
                          <div key={m.l} style={{background:C.card2,borderRadius:4,padding:"6px 8px",border:`1px solid ${C.border}`}}>
                            <div style={{fontSize:9,color:C.muted}}>{m.l}</div>
                            <div style={{fontWeight:700,color:m.c,fontSize:13}}>₹{fmtINR(m.v)}</div>
                          </div>
                        ))}
                      </div>
                      {(scanResult.shortages||[]).length>0&&(
                        <div style={{background:"#fef2f2",borderRadius:6,padding:"8px 10px",marginBottom:8,border:`1px solid ${C.red}30`}}>
                          <div style={{color:"#b91c1c",fontWeight:700,fontSize:11,marginBottom:4}}>⚠ Shortages</div>
                          {(scanResult.shortages||[]).map((s,i)=>(
                            <div key={i} style={{fontSize:11,color:C.red,padding:"2px 0"}}>
                              {s.lrNo} — {s.tonnes} TO — ₹{fmtINR(s.deduction)}
                            </div>
                          ))}
                        </div>
                      )}
                      {(scanResult.expenses||[]).length>0&&(
                        <div style={{background:"#fffbeb",borderRadius:6,padding:"8px 10px",marginBottom:8,border:`1px solid ${C.orange}30`}}>
                          <div style={{color:"#c67c00",fontWeight:700,fontSize:11,marginBottom:4}}>
                            📋 Debit Notes → will save as Expenses
                          </div>
                          {(scanResult.expenses||[]).map((e,i)=>(
                            <div key={i} style={{fontSize:11,color:C.orange,padding:"2px 0",
                              display:"flex",justifyContent:"space-between"}}>
                              <span>{e.description||e.ref}</span>
                              <span style={{fontFamily:"monospace"}}>₹{fmtINR(e.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {(()=>{
                        const savedInvoiceNos = new Set((trips||[]).filter(t=>t.invoiceNo).map(t=>t.invoiceNo.trim()));
                        const missingInvs = (scanResult.invoices||[]).filter(i=>{
                          const n=(i.invoiceNo||"").trim();
                          return n && !savedInvoiceNos.has(n);
                        });
                        const dupUtr = (payments||[]).find(p=>p.utr===scanResult.utr);
                        const canApply = missingInvs.length===0 && !dupUtr;
                        return (<>
                          {dupUtr && (
                            <div style={{background:C.red+"11",border:`1px solid ${C.red}44`,
                              borderRadius:10,padding:"12px 14px",marginBottom:8}}>
                              <div style={{color:C.red,fontWeight:800,fontSize:13,marginBottom:4}}>🚫 Already Scanned</div>
                              <div style={{color:C.text,fontSize:12}}>UTR <b>{scanResult.utr}</b> was recorded on <b>{dupUtr.paymentDate||dupUtr.date||"—"}</b></div>
                              <div style={{color:C.muted,fontSize:11,marginTop:2}}>This payment is already in the system. Discard this scan.</div>
                            </div>
                          )}
                          {missingInvs.length>0 && (
                            <div style={{background:"#fffbeb",border:`1px solid ${C.orange}`,borderRadius:10,
                              padding:"12px 14px",marginBottom:8}}>
                              <div style={{color:C.orange,fontWeight:800,fontSize:13,marginBottom:6}}>
                                ⚠ Invoice{missingInvs.length>1?"s":""} not uploaded yet
                              </div>
                              {missingInvs.map(i=>(
                                <div key={i.invoiceNo} style={{display:"flex",alignItems:"center",gap:6,
                                  background:C.card,borderRadius:6,padding:"6px 10px",marginBottom:4,
                                  border:`1px solid ${C.border}`}}>
                                  <span style={{fontSize:16}}>📄</span>
                                  <div>
                                    <div style={{fontWeight:700,fontSize:12,color:C.text}}>{i.invoiceNo}</div>
                                    <div style={{fontSize:11,color:C.muted}}>₹{fmtINR(i.totalAmt||i.paymentAmt)}</div>
                                  </div>
                                </div>
                              ))}
                              <div style={{fontSize:12,color:C.text,marginTop:8,lineHeight:1.5}}>
                                Go to the <b>Invoices tab</b> → scan or upload{" "}
                                {missingInvs.length>1?"each invoice":"this invoice"} first,
                                then come back and scan this payment advice again.
                              </div>
                            </div>
                          )}
                          <div style={{display:"flex",gap:8}}>
                            <button onClick={applyPaymentScan} disabled={!canApply}
                              style={{flex:1,background:canApply?C.accent:C.dim,
                                color:canApply?"#fff":C.muted,border:"none",borderRadius:6,
                                padding:"10px",fontWeight:700,
                                cursor:canApply?"pointer":"not-allowed",fontSize:12}}>
                              {dupUtr ? "Already Saved" : missingInvs.length>0 ? `Upload ${missingInvs.length} invoice${missingInvs.length>1?"s":""} first` : "✓ Apply — Mark Paid"}
                            </button>
                            <button onClick={()=>setScanResult(null)}
                              style={{background:C.card2,color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,
                                padding:"10px 14px",cursor:"pointer",fontSize:12}}>Discard</button>
                          </div>
                        </>);
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* recent trips */}
            <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
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
                  <div key={t.id} style={{padding:"10px 14px",borderBottom:`1px solid ${C.border}`,
                    background:t.shreeShortage?C.red+"08":"transparent"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{fontFamily:"monospace",fontSize:12,color:"#ccc"}}>{t.lr||t.lrNo}</span>
                      <Pill status={t.shreeStatus||"pending"} shortage={t.shreeShortage}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted}}>
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
            <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
              {filteredInvoices.length} of {shreeInvoices.length} invoice{shreeInvoices.length!==1?"s":""}
              {searchInv&&` · "${searchInv}"`}
            </div>
            {filteredInvoices.length===0
              ? <EmptyState icon="🧾" text={searchInv?"No invoices match your search.":"No invoices yet. Upload an invoice PDF."}/>
              : filteredInvoices.map(inv=>{
                const isOpen = expandedInv===inv.invoiceNo;
                return (
                  <div key={inv.invoiceNo} style={{background:C.bg,border:`1px solid ${C.border}`,
                    borderRadius:8,marginBottom:10,overflow:"hidden"}}>
                    <div onClick={()=>setExpandedInv(isOpen?null:inv.invoiceNo)}
                      style={{padding:"12px 14px",cursor:"pointer",
                        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                          <span style={{fontFamily:"monospace",fontWeight:700,color:C.text,fontSize:13}}>
                            {inv.invoiceNo}
                          </span>
                          <Pill status={inv.status}/>
                        </div>
                        <div style={{display:"flex",gap:10,fontSize:11,color:C.muted,flexWrap:"wrap"}}>
                          <span>{fmtDate(inv.invoiceDate)}</span>
                          <span>{inv.trips.length} trip{inv.trips.length!==1?"s":""}</span>
                          <span style={{color:"#1565c0",fontWeight:700}}>₹{fmtINR(inv.totalAmt)}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        {isOwner&&(
                          <button onClick={e=>{e.stopPropagation();deleteInvoice(inv.invoiceNo);}}
                            style={{background:"#fef2f2",border:`1px solid ${C.red}30`,color:C.red,
                              borderRadius:5,padding:"5px 9px",fontSize:12,cursor:"pointer"}}>🗑</button>
                        )}
                        <span style={{color:C.muted,fontSize:16,fontWeight:700}}>{isOpen?"▲":"▼"}</span>
                      </div>
                    </div>
                    {isOpen&&(
                      <div style={{borderTop:"1px solid #1e1e1e"}}>
                        {inv.trips.map(t=>(
                          <div key={t.id} style={{padding:"9px 14px",borderBottom:`1px solid ${C.border}`,
                            background:t.shreeShortage?"#fef2f2":C.card2}}>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                              <span style={{fontFamily:"monospace",color:C.muted}}>{t.lr||t.lrNo}</span>
                              <span style={{fontFamily:"monospace",color:"#ccc",fontWeight:700}}>
                                ₹{fmtINR(t.billedToShree)}
                              </span>
                            </div>
                            <div style={{display:"flex",gap:10,fontSize:10,color:C.muted,marginTop:2}}>
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
                          fontSize:11,background:C.card,borderTop:`1px solid ${C.border}`}}>
                          <span style={{color:C.muted}}>Invoice Total</span>
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
            <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
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
                  <div key={key} style={{background:C.bg,border:`1px solid ${C.border}`,
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
                        <div style={{display:"flex",gap:10,fontSize:11,color:C.muted,flexWrap:"wrap"}}>
                          <span>{fmtDate(p.paymentDate||p.date)}</span>
                          <span style={{color:"#1b6e3a",fontWeight:700}}>₹{fmtINR(p.totalPaid||p.paid)}</span>
                          <span>{frtInvoices.length} invoice{frtInvoices.length!==1?"s":""}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                        {isOwner&&(
                          <button onClick={e=>{e.stopPropagation();deleteAdvice(p.utr,p.id);}}
                            style={{background:"#fef2f2",border:`1px solid ${C.red}30`,color:C.red,
                              borderRadius:5,padding:"5px 9px",fontSize:12,cursor:"pointer"}}>🗑</button>
                        )}
                        <span style={{color:C.muted,fontSize:16,fontWeight:700}}>{isOpen?"▲":"▼"}</span>
                      </div>
                    </div>

                    {isOpen&&(
                      <div style={{borderTop:"1px solid #1e1e1e"}}>
                        {/* amounts grid */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)"}}>
                          {[
                            {l:"Total Billed",  v:p.totalBilled||p.totalBill, c:C.muted},
                            {l:"Net Paid",      v:p.totalPaid||p.paid,        c:"#1b6e3a"},
                            {l:"TDS Deducted",  v:p.tdsDeducted||p.tds,      c:"#c67c00"},
                            {l:"On Hold",       v:p.holdAmount||p.gstHold,    c:"#c67c00"},
                          ].map((m,i)=>(
                            <div key={m.l} style={{padding:"10px 14px",background:C.card,
                              borderRight:i%2===0?`1px solid ${C.border}`:"none",
                              borderBottom:i<2?`1px solid ${C.border}`:"none"}}>
                              <div style={{fontSize:9,color:C.muted,letterSpacing:1}}>{m.l}</div>
                              <div style={{fontWeight:800,color:m.c,fontSize:14}}>₹{fmtINR(m.v)}</div>
                            </div>
                          ))}
                        </div>
                        {/* invoices */}
                        {frtInvoices.length>0&&(
                          <>
                            <div style={{padding:"6px 14px",fontSize:10,fontWeight:700,color:C.muted,
                              letterSpacing:1,background:C.card,borderTop:`1px solid ${C.border}`}}>INVOICES</div>
                            {frtInvoices.map((inv,i)=>(
                              <div key={i} style={{padding:"8px 14px",borderTop:`1px solid ${C.border}`,
                                display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}>
                                <span style={{fontFamily:"monospace",color:C.muted}}>{inv.invoiceNo}</span>
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
                              letterSpacing:1,background:C.red+"11",borderTop:`1px solid ${C.red}33`}}>⚠ SHORTAGES</div>
                            {(p.shortages||[]).map((s,i)=>(
                              <div key={i} style={{padding:"8px 14px",borderTop:"1px solid #1a0a0a",
                                background:C.red+"08",display:"flex",justifyContent:"space-between",fontSize:12}}>
                                <div>
                                  <div style={{fontFamily:"monospace",color:C.red}}>{s.lrNo||s.lr}</div>
                                  <div style={{fontSize:10,color:C.red}}>{s.tonnes} TO · {s.ref}</div>
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
                                background:C.orange+"08",display:"flex",justifyContent:"space-between",
                                alignItems:"center",fontSize:12}}>
                                <div>
                                  <div style={{color:C.orange}}>{e.description||e.ref}</div>
                                  {e.ref&&<div style={{fontSize:10,color:C.orange}}>{e.ref}</div>}
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
            <div style={{background:C.red+"08",border:`1px solid ${C.red}22`,borderRadius:8,
              padding:"12px 14px",marginBottom:14,
              display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,textAlign:"center"}}>
              {[
                {l:"Count",    v:allShortages.length,                                                         c:"#b91c1c"},
                {l:"Deducted", v:`₹${fmtINR(totalShortage)}`,                                                c:"#b91c1c"},
                {l:"Tonnes",   v:`${allShortages.reduce((s,sh)=>s+Number(sh.tonnes||0),0).toFixed(2)} TO`,   c:C.red},
              ].map(m=>(
                <div key={m.l}>
                  <div style={{fontSize:9,color:C.red,letterSpacing:1,marginBottom:3}}>{m.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:m.c}}>{m.v}</div>
                </div>
              ))}
            </div>

            <SearchBar value={searchShort} onChange={setSearchShort} placeholder="Search LR, ref, UTR…"/>
            <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
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
                <div key={i} style={{background:C.card,border:`1px solid ${linkedTrip?C.red+"33":C.orange+"33"}`,
                  borderRadius:8,padding:"11px 14px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <span style={{fontFamily:"monospace",color:C.red,fontSize:13,fontWeight:700}}>
                      {lrKey||"— No LR —"}
                    </span>
                    <span style={{color:"#b91c1c",fontWeight:800,fontFamily:"monospace",fontSize:14}}>
                      ₹{fmtINR(s.deduction)}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:8,fontSize:11,color:C.muted,flexWrap:"wrap",marginBottom:4}}>
                    <span>📦 {s.tonnes} TO</span>
                    {s.ref&&<span>Ref: {s.ref}</span>}
                    {s.utr&&<span>UTR: {s.utr}</span>}
                    {s.paymentDate&&<span>{fmtDate(s.paymentDate)}</span>}
                  </div>
                  {linkedTrip?(
                    <div style={{background:"#f0fdf4",borderRadius:6,padding:"5px 8px",fontSize:11,
                      display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:"#1b6e3a"}}>✓ Linked · {linkedTrip.truckNo||linkedTrip.truck} · {linkedTrip.to}</span>
                      {linkedVeh&&<span style={{color:C.muted}}>Balance: ₹{fmtINR((linkedVeh.shortageOwed||0)-(linkedVeh.shortageRecovered||0))}</span>}
                    </div>
                  ):(
                    <div style={{background:C.orange+"11",borderRadius:6,padding:"5px 8px",fontSize:11,color:C.orange}}>
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
                {label:"Total Held",    val:fmtINR(gstTotalHeld),     col:C.orange},
                {label:"Released",      val:fmtINR(gstTotalReleased),  col:C.green},
                {label:"Pending",       val:fmtINR(gstHoldPending),    col:C.red},
              ].map(k=>(
                <div key={k.label} style={{background:C.card,border:"1px solid #21262d",
                  borderRadius:10,padding:"12px 10px",textAlign:"center"}}>
                  <div style={{color:k.col,fontWeight:800,fontSize:15}}>{k.val}</div>
                  <div style={{color:C.muted,fontSize:10,marginTop:3,textTransform:"uppercase",letterSpacing:0.5}}>{k.label}</div>
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
                    <div style={{color:C.muted,fontSize:11,marginTop:2}}>Tap to mark held invoices as released</div>
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
              <div style={{textAlign:"center",padding:"30px 0",color:C.muted}}>
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
                      {g.invDate&&<div style={{color:C.muted,fontSize:11,marginTop:1}}>{fmtDate(parseDD(g.invDate))}</div>}
                      {g.sapDoc&&<div style={{color:C.muted,fontSize:11}}>SAP: {g.sapDoc}</div>}
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
                        <div style={{color:C.muted,fontSize:9,textTransform:"uppercase",letterSpacing:0.5}}>{x.l}</div>
                      </div>
                    ))}
                  </div>
                  {g.releaseUtr&&(
                    <div style={{marginTop:8,color:C.muted,fontSize:11}}>
                      Released via UTR: <b style={{color:"#1b6e3a"}}>{g.releaseUtr}</b>
                      {g.releaseDate&&" on "+fmtDate(g.releaseDate)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ══ GST RECONCILIATION ══════════════════════════════════════ */}
        {activeTab==="gstpay"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontWeight:800,fontSize:15,color:C.text}}>🧾 GST Reconciliation</div>
                <div style={{color:C.muted,fontSize:11,marginTop:2}}>Record GST paid monthly · compare with client releases</div>
              </div>
              <button onClick={()=>setShowGstForm(v=>!v)}
                style={{background:showGstForm?C.muted+"22":C.accent,border:"none",color:showGstForm?C.muted:"#fff",
                  borderRadius:10,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {showGstForm?"Cancel":"+ Record GST"}
              </button>
            </div>

            {showGstForm && (
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,
                display:"flex",flexDirection:"column",gap:10}}>
                <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:2}}>Record GST Payment</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div>
                    <div style={{color:C.muted,fontSize:10,fontWeight:700,marginBottom:3}}>MONTH *</div>
                    <input type="month" value={gstPayForm.month} onChange={e=>setGstPayForm(p=>({...p,month:e.target.value}))}
                      style={{width:"100%",boxSizing:"border-box",background:C.bg,border:`1px solid ${C.border}`,
                        borderRadius:8,color:C.text,padding:"8px 10px",fontSize:13,outline:"none",colorScheme:"light"}} />
                  </div>
                  <div>
                    <div style={{color:C.muted,fontSize:10,fontWeight:700,marginBottom:3}}>CGST ₹</div>
                    <input type="text" inputMode="decimal" value={gstPayForm.cgst} onChange={e=>setGstPayForm(p=>({...p,cgst:e.target.value}))}
                      placeholder="0" style={{width:"100%",boxSizing:"border-box",background:C.bg,border:`1px solid ${C.border}`,
                        borderRadius:8,color:C.text,padding:"8px 10px",fontSize:13,outline:"none"}} />
                  </div>
                  <div>
                    <div style={{color:C.muted,fontSize:10,fontWeight:700,marginBottom:3}}>SGST ₹</div>
                    <input type="text" inputMode="decimal" value={gstPayForm.sgst} onChange={e=>setGstPayForm(p=>({...p,sgst:e.target.value}))}
                      placeholder="0" style={{width:"100%",boxSizing:"border-box",background:C.bg,border:`1px solid ${C.border}`,
                        borderRadius:8,color:C.text,padding:"8px 10px",fontSize:13,outline:"none"}} />
                  </div>
                  <div>
                    <div style={{color:C.muted,fontSize:10,fontWeight:700,marginBottom:3}}>IGST ₹</div>
                    <input type="text" inputMode="decimal" value={gstPayForm.igst} onChange={e=>setGstPayForm(p=>({...p,igst:e.target.value}))}
                      placeholder="0" style={{width:"100%",boxSizing:"border-box",background:C.bg,border:`1px solid ${C.border}`,
                        borderRadius:8,color:C.text,padding:"8px 10px",fontSize:13,outline:"none"}} />
                  </div>
                </div>
                <div>
                  <div style={{color:C.muted,fontSize:10,fontWeight:700,marginBottom:3}}>NOTES</div>
                  <input value={gstPayForm.notes} onChange={e=>setGstPayForm(p=>({...p,notes:e.target.value}))}
                    placeholder="e.g. Challan ref, bank UTR…"
                    style={{width:"100%",boxSizing:"border-box",background:C.bg,border:`1px solid ${C.border}`,
                      borderRadius:8,color:C.text,padding:"8px 10px",fontSize:13,outline:"none"}} />
                </div>
                <button onClick={()=>{
                  if(!gstPayForm.month){alert("Please select a month.");return;}
                  const total = (parseFloat(gstPayForm.cgst)||0)+(parseFloat(gstPayForm.sgst)||0)+(parseFloat(gstPayForm.igst)||0);
                  if(total<=0){alert("Enter at least one GST component > 0.");return;}
                  saveGstPayment({
                    id:"GSTP"+Date.now(),
                    month:gstPayForm.month,
                    cgst:parseFloat(gstPayForm.cgst)||0,
                    sgst:parseFloat(gstPayForm.sgst)||0,
                    igst:parseFloat(gstPayForm.igst)||0,
                    total,
                    notes:gstPayForm.notes,
                    createdAt:new Date().toISOString(),
                  });
                  setGstPayForm({month:"",cgst:"",sgst:"",igst:"",notes:""});
                  setShowGstForm(false);
                }} style={{background:C.accent,border:"none",borderRadius:10,color:"#fff",
                  padding:"10px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  ✓ Save GST Payment
                </button>
              </div>
            )}

            {/* Month-wise reconciliation table */}
            {(()=>{
              // Build monthly GST releases from shreePayments across ALL clients
              const monthlyReleases = {};
              shreePayments.forEach(pa => {
                const m = (pa.paymentDate||pa.date||"").slice(0,7); // YYYY-MM
                if(!m) return;
                if(!monthlyReleases[m]) monthlyReleases[m]={released:0,clients:new Set()};
                (pa.invoices||[]).forEach(inv => {
                  const hold = Number(inv.hold||0);
                  if(hold===0) { // This payment has no hold = release event
                    monthlyReleases[m].released += Number(inv.paymentAmt||inv.totalAmt||0)*0.05; // ~5% GST est
                  }
                });
                // Use gstReleases for more accurate tracking
              });
              // Build from gstReleases (more accurate)
              const monthlyReleasesAccurate = {};
              (gstReleases||[]).forEach(r => {
                const m = (r.date||"").slice(0,7);
                if(!m) return;
                if(!monthlyReleasesAccurate[m]) monthlyReleasesAccurate[m]={released:0,count:0};
                monthlyReleasesAccurate[m].released += Number(r.amount||0);
                monthlyReleasesAccurate[m].count++;
              });

              // Merge paid months + release months
              const allMonths = new Set([
                ...gstPaymentsLocal.map(g=>g.month),
                ...Object.keys(monthlyReleasesAccurate),
              ]);
              const sorted = [...allMonths].sort((a,b)=>b.localeCompare(a));

              if(sorted.length===0) return (
                <div style={{textAlign:"center",padding:"40px 20px",color:C.muted}}>
                  <div style={{fontSize:32,marginBottom:8}}>🧾</div>
                  <div>No GST data yet. Record your first GST payment above.</div>
                </div>
              );

              return (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {sorted.map(m=>{
                    const paid = gstPaymentsLocal.find(g=>g.month===m);
                    const release = monthlyReleasesAccurate[m];
                    const paidTotal = paid?.total||0;
                    const releasedTotal = release?.released||0;
                    // Difference: positive = more released than paid (good), negative = paid more than released (GST credit waiting)
                    const diff = releasedTotal - paidTotal;
                    const [yr,mo] = m.split("-");
                    const monthLabel = new Date(parseInt(yr),parseInt(mo)-1,1).toLocaleDateString("en-IN",{month:"short",year:"numeric"});
                    return (
                      <div key={m} style={{background:C.card,borderRadius:12,padding:"12px 14px",
                        border:`1px solid ${Math.abs(diff)<1?C.green+"44":diff<0?C.orange+"44":C.blue+"44"}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <div style={{fontWeight:700,fontSize:13,color:C.text}}>{monthLabel}</div>
                          {Math.abs(diff)<1
                            ? <span style={{background:C.green+"22",color:C.green,borderRadius:8,padding:"2px 8px",fontSize:11,fontWeight:700}}>✓ Matched</span>
                            : diff<0
                              ? <span style={{background:C.orange+"22",color:C.orange,borderRadius:8,padding:"2px 8px",fontSize:11,fontWeight:700}}>⚠ Paid > Released</span>
                              : <span style={{background:C.blue+"22",color:C.blue,borderRadius:8,padding:"2px 8px",fontSize:11,fontWeight:700}}>ℹ Released > Paid</span>
                          }
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                          <div style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}>
                            <div style={{color:C.red,fontWeight:800,fontSize:13}}>{paidTotal>0?fmt(paidTotal):"—"}</div>
                            <div style={{color:C.muted,fontSize:9,textTransform:"uppercase"}}>GST Paid</div>
                            {paid && <div style={{color:C.muted,fontSize:9,marginTop:2}}>
                              C:{fmt(paid.cgst)} S:{fmt(paid.sgst)} I:{fmt(paid.igst)}
                            </div>}
                          </div>
                          <div style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}>
                            <div style={{color:C.green,fontWeight:800,fontSize:13}}>{releasedTotal>0?fmt(releasedTotal):"—"}</div>
                            <div style={{color:C.muted,fontSize:9,textTransform:"uppercase"}}>Released</div>
                            {release && <div style={{color:C.muted,fontSize:9,marginTop:2}}>{release.count} release{release.count!==1?"s":""}</div>}
                          </div>
                          <div style={{background:C.bg,borderRadius:8,padding:"8px",textAlign:"center"}}>
                            <div style={{color:Math.abs(diff)<1?C.green:diff<0?C.orange:C.blue,fontWeight:800,fontSize:13}}>
                              {diff===0?"₹0":diff>0?"+"+fmt(diff):fmt(diff)}
                            </div>
                            <div style={{color:C.muted,fontSize:9,textTransform:"uppercase"}}>Diff</div>
                          </div>
                        </div>
                        {paid?.notes && <div style={{color:C.muted,fontSize:11,marginTop:6}}>📝 {paid.notes}</div>}
                        {paid && isOwner && (
                          <button onClick={()=>deleteGstPayment(paid.id)}
                            style={{background:"none",border:"none",color:C.muted,fontSize:11,
                              cursor:"pointer",marginTop:4,padding:0,textDecoration:"underline"}}>
                            Delete
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab==="profit"&&(
          <div>
            {shreeTrips.length>0&&(
              <div style={{background:"#f0fdf4",border:"1px solid #1a3a1a",borderRadius:8,
                padding:"12px 14px",marginBottom:14,
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:10,color:C.green,letterSpacing:1,marginBottom:2}}>TOTAL PROFIT</div>
                  <div style={{fontSize:22,fontWeight:800,color:"#1b6e3a"}}>
                    ₹{fmtINR(shreeTrips.reduce((s,t)=>s+tripProfit(t),0))}
                  </div>
                </div>
                <div style={{textAlign:"right",fontSize:11,color:C.muted}}>
                  <div>{shreeTrips.filter(t=>t.shreeStatus==="paid").length} paid trips</div>
                  <div>{shreeTrips.filter(t=>t.shreeShortage).length} with shortages</div>
                </div>
              </div>
            )}

            <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:14}}>
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
                  style={{background:C.bg,border:"1px solid #ccddf0",borderRadius:6,
                    padding:"8px 10px",color:"#ccc",fontSize:13}}/>
                <div style={{display:"flex",gap:8}}>
                  <input value={newExp.amount} onChange={e=>setNewExp({...newExp,amount:e.target.value})}
                    type="number" placeholder="₹ Amount"
                    style={{flex:1,background:C.bg,border:"1px solid #ccddf0",borderRadius:6,
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
            <div style={{fontSize:11,color:C.muted,marginBottom:10}}>
              {filteredTrips.length} of {shreeTrips.length} trip{shreeTrips.length!==1?"s":""}
            </div>

            {filteredTrips.length===0
              ? <EmptyState icon="📊" text={searchTrip?"No trips match your search.":"No Shree trips yet."}/>
              : filteredTrips.map(t=>{
                const profit=tripProfit(t);
                return (
                  <div key={t.id} style={{background:C.bg,border:`1px solid ${C.border}`,
                    borderRadius:8,padding:"11px 14px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div>
                        <span style={{fontFamily:"monospace",fontSize:12,color:"#ccc"}}>{t.lr||t.lrNo}</span>
                        <span style={{fontSize:11,color:C.muted,marginLeft:8}}>{t.truck||t.truckNo}</span>
                      </div>
                      <span style={{fontWeight:800,fontSize:15,color:profit>=0?"#1b6e3a":"#b91c1c"}}>
                        ₹{fmtINR(profit)}
                      </span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4,fontSize:11}}>
                      <div><span style={{color:C.muted,display:"block"}}>Billed</span>
                        <span style={{color:"#ccc",fontFamily:"monospace"}}>₹{fmtINR(t.billedToShree)}</span></div>
                      <div><span style={{color:C.muted,display:"block"}}>Shortage</span>
                        <span style={{color:t.shreeShortage?"#b91c1c":"#444",fontFamily:"monospace"}}>
                          {t.shreeShortage?`₹${fmtINR(t.shreeShortage.deduction)}`:"—"}</span></div>
                      <div><span style={{color:C.muted,display:"block"}}>Expenses</span>
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

// ─── REQUEST PAYMENT SHEET ───────────────────────────────────────────────────
function RequestPaymentSheet({trip, vehicles, setVehicles, employees, paymentRequests, setPaymentRequests, driverPays=[], user, log, onClose}) {
  const t = trip;
  const veh = (vehicles||[]).find(v=>v.truckNo===t.truckNo);
  // Compute actual balance (trip may not have .balance if coming from raw trips array)
  const _diGross = (t.diLines&&t.diLines.length>1)
    ? t.diLines.reduce((s,d)=>s+(d.qty||0)*(d.givenRate||0),0)
    : (t.qty||0)*(t.givenRate||0);
  const _deducts = (t.advance||0)+(t.tafal||0)+(t.dieselEstimate||0)+(t.shortageRecovery||0)+(t.loanRecovery||0);
  const _netDue  = Math.max(0, _diGross - _deducts);
  const _paidSoFar = (driverPays||[]).filter(p=>p.tripId===t.id).reduce((s,p)=>s+(p.amount||0),0);
  const _balance = Math.max(0, _netDue - _paidSoFar);

  // Build account lists — collect accounts from ALL vehicles of the same owner
  const ownerNameForAcct = (veh?.ownerName||"").trim();
  const ownerVehicles = ownerNameForAcct
    ? (vehicles||[]).filter(v=>(v.ownerName||"").trim()===ownerNameForAcct)
    : (veh ? [veh] : []);
  // Merge accounts from all owner's vehicles, deduped by accountNo
  const allOwnerRawAccounts = ownerVehicles.flatMap(v=>v.accounts||[]);
  const seenAccNos = new Set();
  const dedupedOwnerAccounts = allOwnerRawAccounts.filter(a=>{
    if(seenAccNos.has(a.accountNo)) return false;
    seenAccNos.add(a.accountNo); return true;
  });
  // Also include legacy single accountNo from vehicle record
  const legacyVehAcc = veh?.accountNo && !seenAccNos.has(veh.accountNo)
    ? [{id:"veh_main",name:veh.ownerName||"Owner",accountNo:veh.accountNo,ifsc:veh.ifsc||"",isPrimary:true}]
    : [];
  const ownerAccounts = [...dedupedOwnerAccounts, ...legacyVehAcc];
  const allEmpAccounts = (employees||[]).flatMap(e=>(e.accounts||[]).map(a=>({...a,_empId:e.id,_empName:e.name})));

  const editingReq = trip._editingReq || null;
  const isEditing  = !!editingReq;

  // Find primary account to pre-select (editing: use saved accountId; new: use first/primary account)
  const primaryOwnerAcc = (() => {
    if(editingReq?.accountId) return editingReq.accountId;
    // Pre-select primary (isPrimary flag) or first account
    const primAcc = ownerAccounts.find(a=>a.isPrimary) || ownerAccounts[0];
    return primAcc?.id || "";
  })();

  const [recipType,  setRecipType]  = useState(editingReq?.recipientType||"vehicle_owner");
  const [accId,      setAccId]      = useState(primaryOwnerAcc);
  const [accSearch,  setAccSearch]  = useState(""); // search within account list
  const [accOpen,    setAccOpen]    = useState(false); // dropdown open
  const [showOther,  setShowOther]  = useState(!!editingReq?.accountId && editingReq.accountId!==primaryOwnerAcc); // show alternate accounts
  const [amount,     setAmount]     = useState(String(editingReq?.amount||_balance||0));
  const [notes,      setNotes]      = useState(editingReq?.notes||"");
  const [newAcc,     setNewAcc]     = useState({name:"",accountNo:"",ifsc:""});
  const [newAccEmpId,setNewAccEmpId]= useState(""); // which employee to save new account to
  const [submitted,  setSubmitted]  = useState(false);

  const recipAccounts = recipType==="vehicle_owner" ? ownerAccounts : allEmpAccounts;
  const selAcc = recipAccounts.find(a=>a.id===accId);

  const hasPending = !isEditing && (paymentRequests||[]).some(r=>r.tripId===t.id&&r.status==="pending");

  const save = () => {
    const effectiveAccId = (!showOther && recipType==="vehicle_owner") ? (accId||primaryOwnerAcc) : accId;
    if(!effectiveAccId)              { alert("Select an account."); return; }
    if(!amount||+amount<=0) { alert("Enter amount."); return; }

    // Resolve the account — when primary is shown (not showOther), use the displayed primary
    const resolvedAccId = (!showOther && recipType==="vehicle_owner" && !accId) ? primaryOwnerAcc : accId;
    const resolvedSelAcc = recipAccounts.find(a=>a.id===resolvedAccId);
    let finalAcc = resolvedSelAcc || selAcc;
    if(resolvedAccId==="new" || accId==="new") {
      if(!newAcc.name||!newAcc.accountNo||!newAcc.ifsc) {
        alert("Fill all account fields: Name, Account No, IFSC."); return;
      }
      const newId = "ACC"+uid();
      finalAcc = {...newAcc, id:newId, isPrimary:false};
      // Persist new account to ALL vehicles of same owner (so it appears for all their trucks)
      // Also update primary accountNo/ifsc if not already set
      if(recipType==="vehicle_owner" && veh) {
        setVehicles(prev=>prev.map(v=>{
          const vOwner = (v.ownerName||"").trim();
          const shouldAdd = ownerNameForAcct
            ? vOwner===ownerNameForAcct
            : v.id===veh.id;
          if(!shouldAdd) return v;
          // Don't add to accounts[] if already exists (same accountNo)
          const alreadyInAccounts = (v.accounts||[]).some(a=>a.accountNo===finalAcc.accountNo);
          const updAccounts = alreadyInAccounts
            ? (v.accounts||[])
            : [...(v.accounts||[]), {...finalAcc, isPrimary: !(v.accountNo)}];
          // Update primary accountNo/ifsc if vehicle has none yet
          const updPrimary = !v.accountNo
            ? {accountNo: finalAcc.accountNo, ifsc: finalAcc.ifsc||""}
            : {};
          return {...v, ...updPrimary, accounts: updAccounts};
        }));
      } else if(recipType==="employee") {
        if(!newAccEmpId) { alert("Select which employee this account belongs to."); return; }
        // Save to employee — need setEmployees prop, so save via DB directly and update
        const targetEmp = (employees||[]).find(e=>e.id===newAccEmpId);
        if(targetEmp) {
          const updEmp = {...targetEmp, accounts:[...(targetEmp.accounts||[]), finalAcc]};
          DB.saveEmployee(updEmp).catch(e=>console.error("saveEmployee:",e));
          // Update local recipientId
          finalAcc._empId   = newAccEmpId;
          finalAcc._empName = targetEmp.name;
        }
      }
    }
    if(!finalAcc) { alert("Could not find selected account."); return; }

    const recipientId   = recipType==="vehicle_owner" ? (veh?.id||"") : (selAcc?._empId||"");
    const recipientName = recipType==="vehicle_owner"
      ? (veh?.ownerName||t.truckNo)
      : (selAcc?._empName||finalAcc.name||"—");

    const pr = isEditing ? {
      ...editingReq,
      amount:+amount, recipientType:recipType,
      recipientId, recipientName,
      accountId:finalAcc.id, accountName:finalAcc.name,
      accountNo:finalAcc.accountNo, ifsc:finalAcc.ifsc||"",
      notes,
    } : {
      id:"PR"+uid(), tripId:t.id, lrNo:t.lrNo, truckNo:t.truckNo,
      amount:+amount, recipientType:recipType,
      recipientId, recipientName,
      accountId:finalAcc.id, accountName:finalAcc.name,
      accountNo:finalAcc.accountNo, ifsc:finalAcc.ifsc||"",
      status:"pending", notes,
      createdBy:user.username, createdAt:nowTs(),
      paidAt:"", paidBy:"",
    };
    if(isEditing) {
      setPaymentRequests(prev=>(prev||[]).map(r=>r.id===pr.id?pr:r));
    } else {
      setPaymentRequests(prev=>[pr,...(prev||[])]);
    }
    DB.savePaymentRequest(pr).catch(e=>console.error("savePaymentRequest:",e));
    log(isEditing?"PAY REQUEST EDITED":"PAY REQUEST",`LR:${t.lrNo} ${recipientName} ₹${Number(amount).toLocaleString("en-IN")}`);
    setSubmitted(true);
  };

  if(submitted) return (
    <Sheet title="📋 Request Submitted" onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:16,alignItems:"center",padding:"20px 0",textAlign:"center"}}>
        <div style={{fontSize:48}}>✅</div>
        <div style={{color:C.green,fontWeight:800,fontSize:18}}>Request Submitted!</div>
        <div style={{color:C.text,fontSize:14}}>
          Payment request for <b style={{color:C.blue}}>{t.lrNo}</b> has been sent.
        </div>
        <div style={{background:C.purple+"11",border:`1px solid ${C.purple}33`,borderRadius:12,
          padding:"12px 16px",fontSize:13,color:C.purple,width:"100%"}}>
          Owner can see this in <b>Driver Pay → Requests</b> tab
        </div>
        <Btn onClick={onClose} full color={C.purple}>Done</Btn>
      </div>
    </Sheet>
  );

  return (
    <Sheet title={isEditing?`✏ Edit Request — ${t.lrNo||t.truckNo}`:`📋 Request Payment — ${t.lrNo||t.truckNo}`} onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {/* Trip summary */}
        <div style={{background:C.bg,borderRadius:10,padding:"12px 14px",fontSize:13}}>
          <div><b>{t.truckNo}</b> · LR: <b style={{color:C.blue}}>{t.lrNo||"—"}</b></div>
          <div style={{color:C.muted}}>{t.from}→{t.to} · {t.qty}MT · {t.date}</div>
          <div style={{color:C.accent,fontWeight:800,fontSize:15,marginTop:4}}>
            Balance: ₹{_balance.toLocaleString("en-IN")}
          </div>
        </div>

        {hasPending && (
          <div style={{background:C.red+"11",border:`1px solid ${C.red}44`,borderRadius:10,
            padding:"12px 14px",fontSize:13,color:C.red,fontWeight:700}}>
            🚫 A pending request already exists for this trip.<br/>
            <span style={{fontWeight:400,fontSize:12}}>Cancel the existing request first, or wait for it to be marked Done.</span>
          </div>
        )}

        {/* Rest of form — hidden if pending exists */}
        {!hasPending && <>

        {/* Amount */}
        <Field label="Amount ₹ *" value={amount} onChange={setAmount} type="number" />

        {/* Recipient type */}
        <div>
          <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",marginBottom:8}}>Pay To</div>
          <div style={{display:"flex",gap:8}}>
            {[{v:"vehicle_owner",l:"🚛 Truck Owner"},{v:"employee",l:"👤 Employee"}].map(opt=>(
              <button key={opt.v} onClick={()=>{setRecipType(opt.v);setAccId("");setAccSearch("");setAccOpen(false);}}
                style={{flex:1,padding:"10px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:13,
                  background:recipType===opt.v?C.purple+"33":"transparent",
                  border:`2px solid ${recipType===opt.v?C.purple:C.border}`,
                  color:recipType===opt.v?C.purple:C.muted}}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        {/* Account section — show primary by default, toggle for other */}
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,textTransform:"uppercase"}}>Bank Account</div>
            {!showOther && recipType==="vehicle_owner" && (
              <button onClick={()=>setShowOther(true)}
                style={{background:"none",border:`1px solid ${C.blue}`,borderRadius:8,
                  color:C.blue,fontSize:11,fontWeight:700,cursor:"pointer",padding:"3px 10px"}}>
                {recipAccounts.length>1 ? "🔄 Other Account" : "➕ Add Account"}
              </button>
            )}
            {showOther && (
              <button onClick={()=>{
                setShowOther(false);
                setAccId(primaryOwnerAcc);
                setAccSearch(""); setAccOpen(false);
              }}
                style={{background:"none",border:`1px solid ${C.muted}`,borderRadius:8,
                  color:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",padding:"3px 10px"}}>
                ← Primary Account
              </button>
            )}
          </div>

          {/* Primary account card — shown when not in "other" mode */}
          {!showOther && recipType==="vehicle_owner" && (()=>{
            const primAcc = recipAccounts.find(a=>a.id===accId) || recipAccounts.find(a=>a.isPrimary) || recipAccounts[0];
            if(!primAcc) return (
              <div style={{background:C.orange+"11",border:`1px solid ${C.orange}33`,borderRadius:8,
                padding:"10px 12px",fontSize:12,color:C.orange}}>
                No saved accounts for this truck owner yet.
                <button onClick={()=>setAccId("new")}
                  style={{marginLeft:8,background:"none",border:`1px solid ${C.green}`,borderRadius:6,
                    color:C.green,fontSize:11,fontWeight:700,cursor:"pointer",padding:"2px 8px"}}>
                  ➕ Add Account
                </button>
              </div>
            );
            return (
              <div style={{background:C.purple+"11",border:`2px solid ${C.purple}44`,borderRadius:10,
                padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14,color:C.text}}>{primAcc.name}</div>
                  <div style={{fontFamily:"monospace",fontSize:13,color:C.blue,marginTop:2}}>{primAcc.accountNo}</div>
                  <div style={{fontSize:11,color:C.muted}}>{primAcc.ifsc||"—"}</div>
                </div>
                <div style={{color:C.purple,fontSize:20}}>✓</div>
              </div>
            );
          })()}

          {/* Searchable dropdown — shown in "other account" mode or for Employee */}
          {(showOther || recipType==="employee") && (
          <>
          <div style={{color:C.muted,fontSize:11,marginBottom:6}}>
            {showOther?"Select a different account:":"Select employee account:"}
          </div>
          {/* Searchable account picker */}
          {(()=>{
            const selAcc2 = recipAccounts.find(a=>a.id===accId);
            const filtered = accSearch
              ? recipAccounts.filter(a=>
                  (a.name||"").toLowerCase().includes(accSearch.toLowerCase()) ||
                  (a.accountNo||"").includes(accSearch) ||
                  (a.ifsc||"").toLowerCase().includes(accSearch.toLowerCase()) ||
                  (a._empName||"").toLowerCase().includes(accSearch.toLowerCase()))
              : recipAccounts;
            return (
              <div style={{position:"relative"}}>
                {/* Trigger button — shows selection or placeholder */}
                <div onClick={()=>setAccOpen(p=>!p)}
                  style={{background:C.card,border:`1.5px solid ${selAcc2?C.purple:accId==="new"?C.green:C.border}`,
                    borderRadius:10,padding:"12px 14px",cursor:"pointer",
                    display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  {selAcc2 ? (
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,color:C.text}}>{selAcc2.name}</div>
                      <div style={{fontFamily:"monospace",fontSize:11,color:C.blue}}>{selAcc2.accountNo} · {selAcc2.ifsc||"—"}</div>
                      {selAcc2._empName&&<div style={{fontSize:10,color:C.muted}}>{selAcc2._empName}</div>}
                    </div>
                  ) : accId==="new" ? (
                    <span style={{color:C.green,fontWeight:700}}>➕ Add New Account</span>
                  ) : (
                    <span style={{color:C.muted}}>— Select account —</span>
                  )}
                  <span style={{color:C.muted,fontSize:12}}>{accOpen?"▲":"▼"}</span>
                </div>

                {/* Dropdown */}
                {accOpen && (
                  <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,
                    background:C.card,border:`1.5px solid ${C.border}`,borderRadius:10,
                    boxShadow:"0 4px 20px rgba(0,0,0,0.15)",marginTop:4,overflow:"hidden"}}>
                    {/* Search input */}
                    <div style={{padding:"8px 10px",borderBottom:`1px solid ${C.border}33`}}>
                      <input autoFocus value={accSearch} onChange={e=>setAccSearch(e.target.value)}
                        placeholder="🔍 Search name, account no, IFSC…"
                        style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,
                          borderRadius:7,color:C.text,padding:"7px 10px",fontSize:13,
                          outline:"none",boxSizing:"border-box"}} />
                    </div>
                    {/* Account list */}
                    <div style={{maxHeight:240,overflowY:"auto"}}>
                      {filtered.length===0 && (
                        <div style={{padding:"12px 14px",color:C.muted,fontSize:12,textAlign:"center"}}>
                          No accounts match "{accSearch}"
                        </div>
                      )}
                      {filtered.map(acc=>(
                        <div key={acc.id}
                          onClick={()=>{setAccId(acc.id);setAccOpen(false);setAccSearch("");}}
                          style={{padding:"10px 14px",cursor:"pointer",
                            background:accId===acc.id?C.purple+"11":"transparent",
                            borderBottom:`1px solid ${C.border}22`,
                            display:"flex",alignItems:"center",gap:10}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:700,fontSize:13,color:C.text}}>{acc.name}
                              {acc.isPrimary&&<span style={{marginLeft:6,fontSize:10,color:C.teal}}>★ Primary</span>}
                            </div>
                            <div style={{fontFamily:"monospace",fontSize:11,color:C.blue}}>{acc.accountNo}</div>
                            <div style={{fontSize:11,color:C.muted}}>{acc.ifsc||"—"}{acc._empName?` · ${acc._empName}`:""}</div>
                          </div>
                          {accId===acc.id&&<span style={{color:C.purple,fontSize:16}}>✓</span>}
                        </div>
                      ))}
                      {/* Add new option */}
                      <div onClick={()=>{setAccId("new");setAccOpen(false);setAccSearch("");}}
                        style={{padding:"10px 14px",cursor:"pointer",
                          background:accId==="new"?C.green+"11":"transparent",
                          display:"flex",alignItems:"center",gap:8,
                          borderTop:`1px solid ${C.border}33`}}>
                        <span style={{color:C.green,fontSize:16}}>➕</span>
                        <span style={{fontWeight:700,color:C.green,fontSize:13}}>Add New Account</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {/* No accounts warning */}
          {recipAccounts.length===0 && accId!=="new" && (
            <div style={{background:C.orange+"11",border:`1px solid ${C.orange}33`,borderRadius:8,
              padding:"10px 12px",fontSize:12,color:C.orange}}>
              No saved accounts yet. Select ➕ Add New Account above.
            </div>
          )}
          </> /* end showOther/employee dropdown */
          )}
        </div>

        {/* New account form — shown regardless of showOther mode */}
        {accId==="new" && (
          <div style={{background:C.bg,borderRadius:12,padding:14,display:"flex",flexDirection:"column",gap:10}}>
            <div style={{color:C.green,fontWeight:700,fontSize:12}}>New Account Details</div>
            {recipType==="employee" && (
              <div>
                <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:4}}>SAVE ACCOUNT TO EMPLOYEE *</div>
                <select value={newAccEmpId} onChange={e=>setNewAccEmpId(e.target.value)}
                  style={{width:"100%",background:C.card,border:`1.5px solid ${newAccEmpId?C.green:C.red}`,
                    borderRadius:8,color:newAccEmpId?C.text:C.muted,padding:"9px 10px",fontSize:13,outline:"none"}}>
                  <option value="">— Select employee —</option>
                  {(employees||[]).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}
            <Field label="Account Name (as per passbook) *" value={newAcc.name}
              onChange={v=>setNewAcc(p=>({...p,name:v}))} placeholder="e.g. ISMAIL KHABULA MUJAWAR" />
            <div style={{display:"flex",gap:10}}>
              <Field label="Account Number *" value={newAcc.accountNo}
                onChange={v=>setNewAcc(p=>({...p,accountNo:v}))} half />
              <Field label="IFSC Code *" value={newAcc.ifsc}
                onChange={v=>setNewAcc(p=>({...p,ifsc:v.toUpperCase()}))} half placeholder="e.g. SBIN0001234" />
            </div>
            <div style={{fontSize:11,color:C.muted}}>
              Will be saved to {recipType==="vehicle_owner"?"vehicle owner's":"selected employee's"} profile for future use.
            </div>
          </div>
        )}

        <Field label="Notes (optional)" value={notes} onChange={setNotes} placeholder="Any additional info…" />

        <Btn onClick={save} full color={C.purple} disabled={!accId||!amount||+amount<=0}>
          {isEditing?"💾 Update Request":"📋 Submit Payment Request"}
        </Btn>
        </>} {/* end !hasPending */}
      </div>
    </Sheet>
  );
}

// ─── DRIVER PAYMENTS ──────────────────────────────────────────────────────────
// Driver payment is separate from settlement.
// Record bank transfers against a trip. "Balance due" auto-updates.
function DriverPayments({trips, setTrips, driverPays, setDriverPays, vehicles, setVehicles, employees, cashTransfers, setCashTransfers, paymentRequests=[], setPaymentRequests, user, log, viewOnly=false}) {
  const [filter,    setFilter]    = useState("unpaid");
  const [paySheet,  setPaySheet]  = useState(null);
  const [payReqSheet,   setPayReqSheet]   = useState(null); // trip for request payment
  const [reqSubFilter,  setReqSubFilter]  = useState("pending"); // pending|done|all
  const [reqSearch,     setReqSearch]     = useState("");
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
    // Multi-DI: use actual per-DI gross (sum of qty×givenRate per DI line)
    const gross    = (t.diLines&&t.diLines.length>1)
      ? t.diLines.reduce((s,d)=>s+(d.qty||0)*(d.givenRate||0),0)
      : (t.qty||0)*(t.givenRate||0);
    const deducts  = (t.advance||0)+(t.tafal||0)
                   +(t.dieselEstimate||0)+((t.shortage||0)*(t.givenRate||0))
                   +(t.shortageRecovery||0)+(t.loanRecovery||0);
    const netDue   = Math.max(0, gross - deducts);
    const paidSoFar= (driverPays||[]).filter(p=>p.tripId===t.id).reduce((s,p)=>s+(p.amount||0),0);
    const balance  = Math.max(0, netDue - paidSoFar);
    return {...t, gross, netDue, paidSoFar, balance, veh};
  });

  const unpaidTrips  = tripWithBalance.filter(t=>t.balance>0);
  const paidTrips    = tripWithBalance.filter(t=>t.balance<=0 && t.netDue>0);

  // "My Requests" — trips in last 4 days where employee has NOT yet sent a payment request
  // (non-owners only; helps employee know which trips still need a request)
  const fourDaysAgo = new Date(Date.now()-4*24*60*60*1000).toISOString().split("T")[0];
  const myReqTrips = user.role!=="owner" ? tripWithBalance.filter(t=>{
    if(t.date < fourDaysAgo) return false;        // only last 4 days
    if(t.balance<=0) return false;                // already fully paid
    if(t.netDue<=0)  return false;                // nothing owed
    const hasPendingReq = (paymentRequests||[]).some(r=>r.tripId===t.id&&r.status==="pending");
    const hasDoneReq    = (paymentRequests||[]).some(r=>r.tripId===t.id&&r.status==="done");
    return !hasPendingReq && !hasDoneReq;          // no request sent yet
  }) : [];
  const totalBalance = unpaidTrips.reduce((s,t)=>s+t.balance,0);

  // Auto-settle: trips with balance=0 but not marked settled
  React.useEffect(() => {
    const toSettle = tripWithBalance.filter(t=>
      t.balance<=0 && t.netDue>0 && !t.driverSettled && t.paidSoFar>0
    );
    if(toSettle.length>0) {
      setTrips(prev=>prev.map(t=>{
        const tw = toSettle.find(x=>x.id===t.id);
        if(!tw) return t;
        return {...t, driverSettled:true, settledBy:"auto", netPaid:tw.netDue};
      }));
      toSettle.forEach(tw=>{
        const updated = {...tw, driverSettled:true, settledBy:"auto", netPaid:tw.netDue};
        DB.saveTrip(updated).catch(e=>console.warn("auto-settle saveTrip:",e));
      });
    }
  // eslint-disable-next-line
  }, [JSON.stringify(tripWithBalance.map(t=>({id:t.id,balance:t.balance,settled:t.driverSettled})))]);

  // Auto-settle: called after any payment save — marks trip settled if balance reaches 0
  const autoSettle = (tripId, extraAmount) => {
    const tw = tripWithBalance.find(t=>t.id===tripId);
    if(!tw) return;
    const newBalance = tw.balance - extraAmount;
    if(newBalance <= 0 && !tw.driverSettled) {
      setTrips(prev => prev.map(t => t.id===tripId
        ? {...t, driverSettled:true, settledBy:user.username, netPaid:tw.netDue}
        : t));
      log("AUTO SETTLED", `LR:${tw.lrNo} ${tw.truckNo} — balance reached ₹0`);
    }
    // ── Overpayment detection: paid more than owed → add to owner's loan ──────
    // e.g. owed ₹30,000 but paid ₹35,000 → ₹5,000 negative balance = advance/loan
    if(newBalance < 0) {
      const overpaid = Math.abs(newBalance);
      const truckNo  = tw.truckNo;
      const veh      = (vehicles||[]).find(v=>v.truckNo===truckNo);
      if(veh) {
        const loanTxn = {
          id: uid(),
          type: "loan",
          date: today(),
          amount: overpaid,
          lrNo: tw.lrNo,
          note: `Overpayment on LR ${tw.lrNo} — ₹${overpaid.toLocaleString("en-IN")} excess paid`,
        };
        const updatedVeh = {
          ...veh,
          loan: (veh.loan||0) + overpaid,
          loanTxns: [...(veh.loanTxns||[]), loanTxn],
        };
        setVehicles(prev => prev.map(v => v.truckNo===truckNo ? updatedVeh : v));
        log("OVERPAYMENT→LOAN", `LR:${tw.lrNo} ${truckNo} — ₹${overpaid} added to loan`);
        alert(`⚠ Overpayment Detected

Paid ₹${extraAmount.toLocaleString("en-IN")} but owed ₹${tw.balance.toLocaleString("en-IN")}.
Excess ₹${overpaid.toLocaleString("en-IN")} has been added as a loan for ${veh.ownerName||truckNo} (ref: LR ${tw.lrNo}).

This will auto-recover in the next trip.`);
      }
    }
  };

  const savePayment = (t) => {
    // Check for duplicate UTR
    if(pf.utr) {
      const dupUtr = (driverPays||[]).find(p=>p.utr===pf.utr);
      if(dupUtr) {
        alert(`🚫 Duplicate UTR\n\nUTR ${pf.utr} was already recorded on ${dupUtr.date||"—"}.\nThis payment is already in the system.`);
        return;
      }
    }
    const p = {id:uid(), tripId:t.id, truckNo:t.truckNo, lrNo:t.lrNo,
      amount:+pf.amount, utr:pf.utr, date:pf.date, paidTo:pf.paidTo, notes:pf.notes,
      createdBy:user.username, createdAt:nowTs()};
    setDriverPays(prev=>[...(prev||[]),p]);
    log("DRIVER PAYMENT",`LR:${t.lrNo} ${t.truckNo} — ${fmt(+pf.amount)} UTR:${pf.utr}`);
    autoSettle(t.id, +pf.amount);
    // Auto-mark pending payment requests for this LR as done
    const pendingReqs = (paymentRequests||[]).filter(r=>r.lrNo===t.lrNo&&r.status==="pending");
    if(pendingReqs.length>0 && setPaymentRequests) {
      setPaymentRequests(prev=>(prev||[]).map(r=>{
        if(r.lrNo!==t.lrNo||r.status!=="pending") return r;
        const updated={...r,status:"done",paidAt:today(),paidBy:user.username};
        DB.savePaymentRequest(updated).catch(e=>console.error("savePaymentRequest:",e));
        return updated;
      }));
      log("PAY REQUEST AUTO-DONE",`LR:${t.lrNo} — ${pendingReqs.length} request(s) marked done`);
    }
    setPaySheet(null); setPf({amount:"",utr:"",date:today(),paidTo:"",notes:""});
  };

  const saveMultiPayment = async (payments) => {
    // Check for duplicate UTR before saving (app-level)
    const utrToCheck = (payments[0]?.utr||"").trim();
    if(utrToCheck) {
      const dupUtr = (driverPays||[]).find(p=>(p.utr||"").trim()===utrToCheck);
      if(dupUtr) {
        alert(`🚫 Duplicate UTR\n\nUTR ${utrToCheck} was already recorded on ${dupUtr.date||"—"} for LR ${dupUtr.lrNo||"—"}.\nThis payment is already in the system — do not save again.`);
        setSplitSheet(null);
        return;
      }
    }
    const withMeta = payments.map(p => ({...p, createdBy:user.username, createdAt:nowTs()}));
    setDriverPays(prev=>[...(prev||[]),...withMeta]);
    for (const p of withMeta) {
      log("DRIVER PAYMENT",`LR:${p.lrNo} ${p.truckNo} — ${fmt(p.amount)} UTR:${p.utr}`);
      try {
        await DB.saveDriverPay(p);
      } catch(e) {
        // DB unique constraint violation on UTR
        if(e.message?.includes("unique") || e.code==="23505") {
          setDriverPays(prev=>prev.filter(x=>!withMeta.find(m=>m.id===x.id)));
          alert(`🚫 DB Rejected: UTR ${p.utr} already exists in database.\nThis payment was not saved.`);
          setSplitSheet(null);
          return;
        }
        throw e;
      }
      autoSettle(p.tripId, p.amount);
    }
    setSplitSheet(null);
  };

  const deleteDriverPay = async (id) => {
    // Find the payment being deleted so we can check its trip
    const pay = (driverPays||[]).find(p=>p.id===id);
    const updatedPays = (driverPays||[]).filter(p=>p.id!==id);
    setDriverPays(updatedPays);
    await DB.deleteDriverPay(id);

    // If the deleted payment was linked to a trip, recalculate balance
    // and un-settle the trip if balance is now > 0
    if(pay?.tripId) {
      const trip = (trips||[]).find(t=>t.id===pay.tripId);
      if(trip && trip.driverSettled) {
        const veh = (vehicles||[]).find(v=>v.truckNo===trip.truckNo);
        const gross   = (trip.qty||0)*(trip.givenRate||0);
        const deducts = (trip.advance||0)+(trip.tafal||0)
                       +(trip.dieselEstimate||0)+((trip.shortage||0)*(trip.givenRate||0))
                       +(trip.shortageRecovery||0)+(trip.loanRecovery||0);
        const netDue  = Math.max(0, gross - deducts);
        const paidNow = updatedPays.filter(p=>p.tripId===trip.id).reduce((s,p)=>s+(p.amount||0),0);
        const newBal  = Math.max(0, netDue - paidNow);
        if(newBal > 0) {
          // Balance is no longer 0 — un-settle the trip
          setTrips(prev=>prev.map(t=>t.id===trip.id
            ? {...t, driverSettled:false, settledBy:"", netPaid:0}
            : t));
          // Persist to DB
          const revertedTrip = {...trip, driverSettled:false, settledBy:"", netPaid:0};
          try { await DB.saveTrip(revertedTrip); } catch(e){ console.error("revert trip on pay delete:",e); }
          log && log("UNSETTLE", `LR:${trip.lrNo} ${trip.truckNo} — payment deleted, balance restored ₹${newBal.toLocaleString("en-IN")}`);
        }
      }
    }
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
      // ── UTR duplicate check before opening sheet ──────────────────────────
      const scannedUtr = (data.referenceNo||"").trim();
      if(scannedUtr) {
        const dupPay = (driverPays||[]).find(p=>(p.utr||"").trim()===scannedUtr);
        if(dupPay) {
          alert(`🚫 Already Recorded\n\nUTR ${scannedUtr} was already saved on ${dupPay.date||"—"} for LR ${dupPay.lrNo||"—"} (${dupPay.truckNo||"—"}).\n\nThis payment is already in the system. Do not save again.`);
          return; // don't open the sheet at all
        }
      }
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
  // Filter history to only payments for trips this user can see (role-filtered)
  const allowedTripIds = new Set((trips||[]).map(t=>t.id));
  const allowedLRs     = new Set((trips||[]).map(t=>t.lrNo).filter(Boolean));
  const allPays = [...(driverPays||[])]
    .filter(p => allowedTripIds.has(p.tripId) || allowedLRs.has(p.lrNo))
    .sort((a,b)=>b.date.localeCompare(a.date));
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
        {viewOnly
          ? <span style={{background:C.orange+"22",color:C.orange,fontSize:11,fontWeight:700,borderRadius:8,padding:"4px 10px"}}>👁 View Only</span>
          : <FileSourcePicker onFile={scanGlobal} accept="image/*,application/pdf"
              label={scanningGlobal?"Reading…":"Scan Payment"}
              color={C.purple||"#7c3aed"} icon="📷" compact={true} />
        }
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <KPI icon="⏳" label="Balance Due"  value={fmt(totalBalance)}    color={C.accent} sub={`${unpaidTrips.length} trips`} />
        <KPI icon="✅" label="Total Paid"   value={fmt(allPays.reduce((s,p)=>s+(p.amount||0),0))} color={C.green} />
      </div>

      <PillBar items={[
        ...(user.role!=="owner" && myReqTrips.length>0 ? [{id:"myreqs", label:`📋 Send Request (${myReqTrips.length})`, color:C.orange}] : []),
        {id:"unpaid",  label:`Unpaid (${unpaidTrips.length})`, color:C.accent},
        {id:"paid",    label:`Paid (${paidTrips.length})`,     color:C.green},
        {id:"all",     label:"All",                            color:C.blue},
        {id:"history", label:`History (${allPays.length})`,    color:C.muted},
        {id:"requests",label:`Requests (${(paymentRequests||[]).length})`, color:C.purple},
      ]} active={filter} onSelect={setFilter} />

      {/* Search bar for trip tabs */}
      {filter!=="history" && filter!=="requests" && (
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
                      <button onClick={()=>{if(window.confirm(`Delete payment of ${fmt(p.amount)} for LR ${p.lrNo}?\nBalance will be restored. If this was the final payment, the trip will be un-settled.`)) deleteDriverPay(p.id);}}
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

      {/* ── TRIP LIST (unpaid / paid / all / myreqs) ── */}
      {filter!=="history" && filter!=="requests" && (()=>{
        const base = filter==="myreqs"?myReqTrips:filter==="unpaid"?unpaidTrips:filter==="paid"?paidTrips:tripWithBalance;
        const shown = histLR ? base.filter(t=>(t.lrNo+t.truckNo).toLowerCase().includes(histLR.toLowerCase())) : base;
        return (<>
          {filter==="myreqs" && (
            <div style={{background:C.orange+"11",border:`1px solid ${C.orange}33`,borderRadius:10,
              padding:"10px 14px",fontSize:12,color:C.orange,marginBottom:4}}>
              📋 <b>Trips from the last 4 days</b> with no payment request sent yet.<br/>
              Tap <b>Request Payment</b> on each trip to notify the owner.
            </div>
          )}
          {shown.map(t=>(
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
              {l:"(−) Loan Recovery",  v:t.loanRecovery||0, c:C.red},
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
                  <button onClick={()=>{if(window.confirm(`Delete payment of ${fmt(p.amount)}?\nBalance will be restored. If this was the final payment, the trip will be un-settled.`)) deleteDriverPay(p.id);}}
                    style={{background:"none",border:`1px solid ${C.red}44`,borderRadius:4,
                      color:C.red,fontSize:10,padding:"1px 6px",cursor:"pointer"}}>
                    🗑
                  </button>
                )}
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:4}}>
            {t.balance>0&&!viewOnly&&(
              <Btn onClick={()=>{setPaySheet(t);setPf({amount:String(t.balance),utr:"",date:today(),paidTo:"",notes:""});}} full sm color={C.green}>+ Record Payment</Btn>
            )}
            {t.balance>0&&(
              <Btn onClick={()=>setPayReqSheet(t)} sm outline color={C.purple}>📋 Request Payment</Btn>
            )}
          </div>
        </div>
          ))}
        </>);
      })()}

      {/* ── REQUESTS TAB ── */}
      {filter==="requests" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {/* Sub-filter: Pending / History */}
          {(()=>{
            const pendingCount = (paymentRequests||[]).filter(r=>r.status==="pending").length;
            const doneCount    = (paymentRequests||[]).filter(r=>r.status==="done").length;
            return (
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                {[
                  {id:"pending", label:`⏳ Pending (${pendingCount})`, color:C.purple},
                  {id:"done",    label:`✓ History (${doneCount})`,     color:C.green},
                  {id:"all",     label:`All (${(paymentRequests||[]).length})`, color:C.muted},
                ].map(s=>(
                  <button key={s.id}
                    onClick={()=>setReqSubFilter(s.id)}
                    style={{padding:"5px 12px",borderRadius:16,fontSize:12,fontWeight:700,cursor:"pointer",
                      background:reqSubFilter===s.id?s.color+"22":"transparent",
                      border:`1.5px solid ${reqSubFilter===s.id?s.color:C.border}`,
                      color:reqSubFilter===s.id?s.color:C.muted}}>
                    {s.label}
                  </button>
                ))}
                <input value={reqSearch} onChange={e=>setReqSearch(e.target.value)}
                  placeholder="🔍 Search LR, employee…"
                  style={{flex:1,minWidth:120,background:C.card,border:`1px solid ${C.border}`,
                    borderRadius:8,color:C.text,padding:"5px 10px",fontSize:12,outline:"none"}} />
              </div>
            );
          })()}
          {(paymentRequests||[]).length===0 && (
            <div style={{textAlign:"center",color:C.muted,padding:"30px 0",fontSize:13}}>No payment requests yet</div>
          )}
          {[...(paymentRequests||[])].filter(pr=>{
            // Sub-filter
            const isPaid = (driverPays||[]).some(p=>p.lrNo===pr.lrNo&&p.amount>0);
            const eff = isPaid?"done":pr.status;
            if(reqSubFilter==="pending" && eff!=="pending") return false;
            if(reqSubFilter==="done"    && eff!=="done")    return false;
            // Search
            if(reqSearch) {
              const q = reqSearch.toLowerCase();
              if(!(pr.lrNo||"").toLowerCase().includes(q) &&
                 !(pr.truckNo||"").toLowerCase().includes(q) &&
                 !(pr.createdBy||"").toLowerCase().includes(q) &&
                 !(pr.recipientName||"").toLowerCase().includes(q) &&
                 !(pr.accountNo||"").toLowerCase().includes(q)) return false;
            }
            return true;
          }).sort((a,b)=>{
            // Stable sort: pending first, then by createdAt desc
            if(a.status==="pending" && b.status!=="pending") return -1;
            if(a.status!=="pending" && b.status==="pending") return 1;
            return (b.createdAt||"").localeCompare(a.createdAt||"");
          }).map(pr=>{
            const trip = (trips||[]).find(t=>t.id===pr.tripId);
            const isPaid = (driverPays||[]).some(p=>p.lrNo===pr.lrNo&&p.amount>0);
            const effectiveStatus = isPaid ? "done" : pr.status;
            return (
              <div key={pr.id} style={{background:C.card,borderRadius:14,padding:"14px 16px",
                borderLeft:`4px solid ${effectiveStatus==="done"?C.green:C.purple}`,marginBottom:4}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>{pr.lrNo||"—"} · {pr.truckNo}</div>
                    <div style={{color:C.muted,fontSize:11}}>{trip?`${trip.from}→${trip.to} · ${trip.qty}MT`:"—"}</div>
                    <div style={{color:C.muted,fontSize:11}}>Requested by: {pr.createdBy||"—"} · {pr.createdAt||""}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{color:effectiveStatus==="done"?C.green:C.purple,fontWeight:800,fontSize:15}}>{fmt(pr.amount)}</div>
                    <Badge label={effectiveStatus==="done"?"✓ Done":"Pending"} color={effectiveStatus==="done"?C.green:C.purple} />
                  </div>
                </div>
                <div style={{background:C.bg,borderRadius:8,padding:"8px 10px",fontSize:12,marginBottom:8}}>
                  <div><span style={{color:C.muted}}>Recipient: </span><b>{pr.recipientName||"—"}</b> ({pr.recipientType==="employee"?"Employee":"Vehicle Owner"})</div>
                  <div><span style={{color:C.muted}}>Account: </span><b>{pr.accountName||"—"}</b></div>
                  <div style={{fontFamily:"monospace",fontSize:11,color:C.blue}}>{pr.accountNo||"—"}{pr.ifsc?` · ${pr.ifsc}`:""}</div>
                  {pr.notes&&<div style={{color:C.muted,marginTop:4}}>{pr.notes}</div>}
                </div>
                {effectiveStatus==="done" && (
                  <div style={{background:C.green+"11",border:`1px solid ${C.green}33`,
                    borderRadius:8,padding:"8px 10px",fontSize:12}}>
                    <div style={{color:C.green,fontWeight:700,marginBottom:4}}>✓ Payment Done</div>
                    <div style={{color:C.muted}}>
                      Requested by <b style={{color:C.text}}>{pr.createdBy||"—"}</b> on {(pr.createdAt||"").slice(0,10)}
                    </div>
                    {pr.paidAt && (
                      <div style={{color:C.muted,marginTop:2}}>
                        Marked done by <b style={{color:C.text}}>{pr.paidBy||"—"}</b> on {pr.paidAt}
                      </div>
                    )}
                    <div style={{marginTop:4,fontFamily:"monospace",fontSize:11,color:C.blue}}>
                      {pr.accountNo||"—"}{pr.ifsc?` · ${pr.ifsc}`:""}
                    </div>
                  </div>
                )}
                {effectiveStatus!=="done" && (()=>{
                  const isOwner = user.role==="owner";
                  const isMyRequest = pr.createdBy===user.username;
                  const canEdit = isOwner || isMyRequest;
                  const canDelete = isOwner || isMyRequest;
                  if(!canEdit && !canDelete) return null;
                  return (
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {isOwner && (
                        <Btn onClick={()=>{
                          const updated={...pr,status:"done",paidAt:today(),paidBy:user.username};
                          setPaymentRequests(prev=>(prev||[]).map(r=>r.id===pr.id?updated:r));
                          DB.savePaymentRequest(updated).catch(e=>console.error("savePaymentRequest:",e));
                          log("PAY REQUEST DONE",`LR:${pr.lrNo} ${pr.recipientName} ₹${fmt(pr.amount)}`);
                        }} sm color={C.green}>✓ Mark Done</Btn>
                      )}
                      {canEdit && (
                        <Btn onClick={()=>setPayReqSheet({
                          ...((trips||[]).find(t=>t.id===pr.tripId)||{}),
                          _editingReqId: pr.id,
                          _editingReq: pr,
                        })} sm outline color={C.blue}>✏ Edit</Btn>
                      )}
                      {canDelete && (
                        <Btn onClick={()=>{
                          if(!window.confirm("Delete this payment request?")) return;
                          setPaymentRequests(prev=>(prev||[]).filter(r=>r.id!==pr.id));
                          DB.deletePaymentRequest(pr.id).catch(e=>console.error("deletePaymentRequest:",e));
                          log("PAY REQUEST DELETED",`LR:${pr.lrNo}`);
                        }} sm outline color={C.red}>🗑</Btn>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* ── REQUEST PAYMENT SHEET ── */}
      {payReqSheet && (
        <RequestPaymentSheet
          trip={payReqSheet}
          vehicles={vehicles}
          setVehicles={setVehicles}
          employees={employees||[]}
          paymentRequests={paymentRequests||[]}
          setPaymentRequests={setPaymentRequests}
          driverPays={driverPays||[]}
          user={user}
          log={log}
          onClose={()=>setPayReqSheet(null)}
        />
      )}

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
          driverPays={driverPays||[]}
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
              if(!f.label.trim()) { alert("Enter a description."); return; }
              if(!f.amount||+f.amount<=0) { alert("Enter a valid amount."); return; }
              if(f.utr.trim()) {
                const utrLower = f.utr.trim().toLowerCase();
                // Check manual expenses
                const dupManual = (Array.isArray(expenses)?expenses:[])
                  .some(e => e.utr && e.utr.trim().toLowerCase()===utrLower);
                // Check shree payment-advice expenses (notes field contains "UTR:XXXX")
                const dupShree = (payments||[])
                  .some(p => p.utr && p.utr.trim().toLowerCase()===utrLower && (p.expenses||[]).length>0);
                if(dupManual||dupShree) {
                  alert("⚠️ An expense with UTR \"" + f.utr.trim() + "\" already exists.\nDuplicate not saved.");
                  return;
                }
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
function Reports({trips, vehicles, employees, payments, settlements, indents, user}) {
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
  // trips already role-filtered via sp
  const base = trips.filter(t => t.type==="outbound" && t.date>=df && t.date<=dt);

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
  const blank={name:"",username:"",pin:"",role:"operator",active:true,assignedClients:[]};
  const [f,setF]=useState(blank); const ff=k=>v=>setF(p=>({...p,[k]:v}));
  const toggleClient = c => setF(p=>{
    const cur = p.assignedClients||[];
    return {...p, assignedClients: cur.includes(c)?cur.filter(x=>x!==c):[...cur,c]};
  });
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
          {/* Assigned Clients — owner sees all, non-owner restricted to assigned */}
          <div style={{background:C.bg,borderRadius:10,padding:"10px 12px"}}>
            <div style={{color:C.muted,fontSize:11,fontWeight:700,marginBottom:6}}>ASSIGNED CLIENTS <span style={{color:C.teal,fontWeight:400}}>(leave all unchecked = sees all)</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {CLIENTS.map(c=>{
                const checked=(f.assignedClients||[]).includes(c);
                return(
                  <label key={c} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                    <input type="checkbox" checked={checked} onChange={()=>toggleClient(c)}
                      style={{width:16,height:16}} />
                    <span style={{fontSize:13,color:checked?C.text:C.muted}}>{c}</span>
                  </label>
                );
              })}
            </div>
            {(f.assignedClients||[]).length===0&&(
              <div style={{color:C.muted,fontSize:11,marginTop:4}}>✓ No restriction — can see all clients</div>
            )}
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
              <div>
                <div style={{fontWeight:800,fontSize:15}}>{u.name} {isMe&&<Badge label="You" color={C.accent} />}</div>
                <div style={{color:C.muted,fontSize:12}}>@{u.username} · PIN: {u.pin}</div>
                <Badge label={r?.label||u.role} color={r?.color||C.muted} />
                {(u.assignedClients||[]).length>0&&(
                  <div style={{marginTop:4,display:"flex",gap:4,flexWrap:"wrap"}}>
                    {(u.assignedClients||[]).map(c=>(
                      <Badge key={c} label={c.replace("Shree Cement ","SC ").replace("Ultratech ","UT ")} color={C.teal} />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <Badge label={u.active?"Active":"Off"} color={u.active?C.green:C.muted} />
          </div>
          {!isMe&&<div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>{setF({name:u.name,username:u.username,pin:u.pin,role:u.role,active:u.active,assignedClients:u.assignedClients||[]});setEdit(u);setSheet(true);}} sm outline color={C.blue}>Edit</Btn>
            <Btn onClick={()=>{setUsers(p=>p.map(x=>x.id===u.id?{...x,active:!x.active}:x));log("TOGGLE USER",`${u.name} ${u.active?"disabled":"enabled"}`);}} sm outline color={u.active?C.red:C.green}>{u.active?"Disable":"Enable"}</Btn>
          </div>}
        </div>
      );})}
    </div>
  );
}

