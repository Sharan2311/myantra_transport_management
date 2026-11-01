// Builds apps_script/advice_reader.gs from the TESTED parser (src/advice_mail.js) + the Apps Script glue.
// usage: node scripts/build_apps_script.mjs <SUPABASE_URL> <SUPABASE_KEY> [outfile]
import fs from "node:fs";
const [url, key, out = "apps_script/advice_reader.gs"] = process.argv.slice(2);
if (!url || !key) { console.error("need SUPABASE_URL and SUPABASE_KEY"); process.exit(1); }
const parser = fs.readFileSync(new URL("../src/advice_mail.js", import.meta.url), "utf8").replace(/^export /gm, "");
const glue = fs.readFileSync(new URL("./apps_script_glue.gs.txt", import.meta.url), "utf8").replace("__SUPABASE_URL__", url).replace("__SUPABASE_KEY__", key);
fs.writeFileSync(out, "// Generated from src/advice_mail.js — do not edit by hand.\n" + parser + glue);
console.log("wrote", out);
