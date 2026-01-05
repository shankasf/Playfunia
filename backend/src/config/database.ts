/**
 * Database connection module - Now uses Supabase
 * MongoDB connection has been replaced with Supabase PostgreSQL
 */

import { supabase } from './supabase';

export async function connectDatabase(): Promise<void> {
  try {
    // Test Supabase connection by making a simple query to faqs table
    const { error } = await supabase.from('faqs').select('faq_id').limit(1);
    
    if (error) {
      console.error('Failed to connect to Supabase:', error.message);
      throw error;
    }

    console.info('Connected to Supabase PostgreSQL database');
  } catch (error) {
    console.error('Failed to connect to Supabase database', error);
    throw error;
  }
}

