import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { secureStorage } from '@/utils/storage';

// Polyfill WebSocket in Node.js environments to prevent build-time crashes
if (typeof window === 'undefined' && typeof (globalThis as any).WebSocket === 'undefined') {
  class DummyWebSocket {}
  (globalThis as any).WebSocket = DummyWebSocket;
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient<Database>(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: secureStorage,
      autoRefreshToken: isSupabaseConfigured,
      persistSession: isSupabaseConfigured,
      detectSessionInUrl: false,
    },
  },
);
