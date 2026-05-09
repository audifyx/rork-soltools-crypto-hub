import { supabase } from '@/lib/supabase';

export async function fetchHolderSync(walletAddress: string) {
  const { data, error } = await supabase
    .from('holder_sync_metadata')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (error) {
    return null;
  }

  return data;
}

export async function updateHolderSync(walletAddress: string, balance: number) {
  return supabase
    .from('holder_sync_metadata')
    .upsert({
      wallet_address: walletAddress,
      last_balance: balance,
      last_synced_at: new Date().toISOString(),
    });
}
