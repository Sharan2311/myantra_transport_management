import { createClient } from '@supabase/supabase-js'

// Start with null — initialized after runtime config loads
let supabase = null;

export function initSupabase(url, key) {
  supabase = createClient(url, key);
  return supabase;
}

export { supabase }
