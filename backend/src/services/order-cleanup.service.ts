/**
 * Order Cleanup Service
 *
 * Expires abandoned orders that remain in 'Pending' status
 * beyond a timeout threshold (30 minutes).
 */

import { supabaseAny } from '../config/supabase';
import { logger } from '../utils/logger';

const STALE_ORDER_TIMEOUT_MINUTES = 30;

/**
 * Mark orders stuck in 'Pending' status as 'Expired'.
 * These are abandoned checkouts where the user never completed payment.
 *
 * @returns Number of orders expired
 */
export async function expireStaleOrders(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - STALE_ORDER_TIMEOUT_MINUTES * 60 * 1000).toISOString();

    const { data, error } = await supabaseAny
      .from('orders')
      .update({ status: 'Expired', updated_at: new Date().toISOString() })
      .eq('status', 'Pending')
      .lt('created_at', cutoff)
      .select('order_id');

    if (error) {
      logger.error({ error }, 'Failed to expire stale orders');
      return 0;
    }

    const count = data?.length ?? 0;
    if (count > 0) {
      logger.info({ count }, 'Expired stale pending orders');
    }
    return count;
  } catch (err) {
    logger.error({ error: err }, 'Error expiring stale orders');
    return 0;
  }
}
