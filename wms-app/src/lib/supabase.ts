import { createClient } from '@supabase/supabase-js'
import { getStoredSupabaseConfig } from './supabaseConfig'

const stored = getStoredSupabaseConfig()
const supabaseUrl = stored?.url || import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = stored?.anonKey || import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
)
