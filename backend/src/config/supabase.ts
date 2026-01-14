import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';
import { appConfig } from './env';

const supabaseUrl = appConfig.supabaseUrl;
const supabaseServiceKey = appConfig.supabaseServiceRoleKey;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

// Use 'any' as a temporary workaround for type mismatches between generated types and actual schema
// TODO: Regenerate types from Supabase CLI: npx supabase gen types typescript --project-id <project-id> > src/types/database.types.ts
export const supabase: SupabaseClient<Database, 'public', any> = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Type-safe helper for bypassing strict type checking when needed
export const supabaseAny = supabase as SupabaseClient<any>;

export default supabase;
