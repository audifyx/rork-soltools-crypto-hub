import { supabase } from '@/lib/supabase';

export async function fetchProfileReputation(userId: string) {
  const { data, error } = await supabase
    .from('profile_reputation')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    return null;
  }

  return data;
}

export async function updateProfileXp(userId: string, xp: number) {
  return supabase
    .from('profile_reputation')
    .upsert({
      user_id: userId,
      xp,
      updated_at: new Date().toISOString(),
    });
}
