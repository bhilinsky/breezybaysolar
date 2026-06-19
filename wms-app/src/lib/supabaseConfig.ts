const URL_STORAGE_KEY = 'bb-wms-supabase-url'
const ANON_KEY_STORAGE_KEY = 'bb-wms-supabase-anon-key'

export interface SupabaseConfig {
  url: string
  anonKey: string
}

export function getStoredSupabaseConfig(): SupabaseConfig | null {
  const url = localStorage.getItem(URL_STORAGE_KEY)
  const anonKey = localStorage.getItem(ANON_KEY_STORAGE_KEY)
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function setStoredSupabaseConfig(config: SupabaseConfig) {
  localStorage.setItem(URL_STORAGE_KEY, config.url)
  localStorage.setItem(ANON_KEY_STORAGE_KEY, config.anonKey)
}

export function clearStoredSupabaseConfig() {
  localStorage.removeItem(URL_STORAGE_KEY)
  localStorage.removeItem(ANON_KEY_STORAGE_KEY)
}
