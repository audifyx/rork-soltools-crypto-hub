import { supabase } from '@/lib/supabase';

export async function getHolderSync(walletAddress: string) {
  const response = await supabase
    .from('holder_sync_metadata')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (response.error) {
    return null;
  }

  return response.data;
}
