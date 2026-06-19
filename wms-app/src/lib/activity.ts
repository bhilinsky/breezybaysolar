import { supabase } from './supabase'

export async function logActivity(
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
) {
  const { data: userData } = await supabase.auth.getUser()
  await supabase.from('activity_log').insert({
    user_id: userData.user?.id ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  })
}

export function generateNumber(prefix: string) {
  const stamp = Date.now().toString(36).toUpperCase()
  const rand = Math.floor(Math.random() * 36 ** 2)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0')
  return `${prefix}-${stamp}${rand}`
}
