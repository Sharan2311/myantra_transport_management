import { createClient } from '@supabase/supabase-js'
import CLIENT_CONFIG from './client.config.js'

// Read from CLIENT_CONFIG first, fall back to env vars (for backward compatibility)
const SUPABASE_URL = CLIENT_CONFIG.supabaseUrl || import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = CLIENT_CONFIG.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Set them in client.config.js or as VITE_ env vars.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
