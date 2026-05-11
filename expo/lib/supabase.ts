import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const FALLBACK_SUPABASE_URL = "https://ffjipnkhcebjvttliptb.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmZmppcG5raGNlYmp2dHRsaXB0YiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc3NTI3OTQ4LCJleHAiOjIwOTMxMDM5NDh9.aXu8bbpVVwc8KOJf1-lHqO3cz_0GZD10_TE0GlKQ1BI";

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? FALLBACK_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? FALLBACK_SUPABASE_ANON_KEY;

export const SUPABASE_READY: boolean = SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.log("[supabase] Using bundled public Supabase config fallback");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});
