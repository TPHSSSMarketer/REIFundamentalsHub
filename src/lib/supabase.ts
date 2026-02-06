import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const _configured = !!(supabaseUrl && supabaseAnonKey)

// Only create the real client when credentials are provided.
// Otherwise export a null placeholder — AuthContext checks isSupabaseConfigured() first.
export const supabase: SupabaseClient<Database> = _configured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : (null as unknown as SupabaseClient<Database>)

export function isSupabaseConfigured(): boolean {
  return _configured
}
