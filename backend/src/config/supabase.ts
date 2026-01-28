import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';
import { appConfig } from './env';

const supabaseUrl = appConfig.supabaseUrl;
const supabaseServiceKey = appConfig.supabaseServiceRoleKey;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

// Service role client - BYPASSES RLS (Row Level Security)
// Use this for all backend operations that need unrestricted database access
// The service_role key has full access and bypasses all RLS policies
export const supabase: SupabaseClient<Database, 'public', any> = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      // Ensure service role is used for all requests
      'x-supabase-role': 'service_role',
    },
  },
});

// Type-safe helper for bypassing strict type checking when needed
export const supabaseAny = supabase as SupabaseClient<any>;

// Alias for clarity - use this when you need to explicitly bypass RLS
export const supabaseAdmin = supabase;

export default supabase;
