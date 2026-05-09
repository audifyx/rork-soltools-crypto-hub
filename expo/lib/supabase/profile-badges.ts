import { supabase } from '@/lib/supabase';

export async function fetchProfileBadges(userId: string) {
  const { data, error } = await supabase
    .from('profile_badges')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchHolderStatus(userId: string) {
  const { data, error } = await supabase
    .from('profile_holder_status')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    return null;
  }

  return data;
}
