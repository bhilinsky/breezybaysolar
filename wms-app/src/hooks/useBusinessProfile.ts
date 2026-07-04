import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BusinessProfile } from '../types'
import { useAuth } from './useAuth'

export function useBusinessProfile() {
  const { session } = useAuth()
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!session?.user) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase.from('business_profile').select('*').eq('id', true).maybeSingle()
    setBusinessProfile(data ?? null)
    setLoading(false)
  }, [session?.user])

  useEffect(() => {
    void load()
  }, [load])

  return { businessProfile, loading, refresh: load }
}
