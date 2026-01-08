import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://wzmcmbkouodsfbfxaozd.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

if (!supabaseAnonKey) {
  console.warn('REACT_APP_SUPABASE_ANON_KEY is not set. Supabase Auth will not work.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storageKey: 'playfunia_auth',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});
