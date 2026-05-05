import { createClient } from '@supabase/supabase-js'

// ── Lazy-init Supabase client ───────────────────────────────────────────────
// db.js imports { supabase } at load time, but initSupabase() runs later
// (after runtime config loads). A simple let + reassign breaks because Vite
// doesn't preserve ES module live bindings.
//
// Fix: Proxy object that forwards every call to the real client once init'd.

let _client = null;

export function initSupabase(url, key) {
  _client = createClient(url, key);
  return _client;
}

export const supabase = new Proxy({}, {
  get(_, prop) {
    if (!_client) {
      throw new Error('Supabase not initialized. Call initSupabase() first.');
    }
    const val = _client[prop];
    return typeof val === 'function' ? val.bind(_client) : val;
  }
});
