import { supabase } from '@/lib/supabase';

export async function getCommunityRoles(communityId: string) {
  const response = await supabase
    .from('community_member_roles')
    .select('*')
    .eq('community_id', communityId);

  if (response.error) {
    throw response.error;
  }

  return response.data ?? [];
}
