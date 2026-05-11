import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const SUPABASE_READY: boolean = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

if (!SUPABASE_READY) {
  console.log("[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY");
}

const safeSupabaseUrl = SUPABASE_READY ? SUPABASE_URL : "https://placeholder.supabase.co";
const safeSupabaseAnonKey = SUPABASE_READY ? SUPABASE_ANON_KEY : "placeholder-anon-key";

export const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});
