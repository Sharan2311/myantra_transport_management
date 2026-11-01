// A vehicle is saved as one whole record from the phone's copy. If another device added a loan/shortage entry after this phone
// loaded the vehicle, saving would erase it (the 1 Nov 2026 KA28AB2091 loan). Before saving we therefore keep every entry that
//   - is in the database, and
//   - this phone does not have, and
//   - this phone never knew about (so it did not delete it on purpose).
// Totals follow the entries that are kept. `known` = ids this phone saw when it last loaded/saved the vehicle.
const r2 = (x) => Math.round(((+x || 0) + Number.EPSILON) * 100) / 100;

export const mergeVehicleForSave = (client, dbRow, known) => {
  if (!client || !dbRow || !known) return { vehicle: client, kept: [] };
  const out = { ...client };
  const kept = [];

  const take = (field, knownSet) => {
    const mine = client[field] || [];
    const have = new Set(mine.map((x) => x?.id));
    const extra = (dbRow[field] || []).filter((x) => x && x.id && !have.has(x.id) && !(knownSet && knownSet.has(x.id)));
    if (extra.length) out[field] = [...mine, ...extra];
    return extra;
  };

  const loanExtra = take("loanTxns", known.loan);
  loanExtra.forEach((x) => kept.push({ ledger: "loan", txn: x }));
  out.loan = r2(loanExtra.filter((x) => x.type === "given" || x.type === "loan").reduce((s, x) => s + (+x.amount || 0), client.loan || 0));
  out.loanRecovered = r2(loanExtra.filter((x) => x.type === "recovery").reduce((s, x) => s + (+x.amount || 0), client.loanRecovered || 0));

  const shortExtra = take("shortageTxns", known.shortage);
  shortExtra.forEach((x) => kept.push({ ledger: "shortage", txn: x }));
  out.shortageOwed = r2(shortExtra.filter((x) => x.type !== "recovery" && x.type !== "recovery_prev").reduce((s, x) => s + (+x.amount || 0), client.shortageOwed || 0));
  out.shortageRecovered = r2(shortExtra.filter((x) => x.type === "recovery").reduce((s, x) => s + (+x.amount || 0), client.shortageRecovered || 0));

  return { vehicle: kept.length ? out : client, kept };
};
