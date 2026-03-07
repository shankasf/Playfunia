import { randomBytes } from 'crypto';
import { supabaseAny } from '../config/supabase';
import { appConfig } from '../config/env';
import { logger } from '../utils/logger';

const BUCKET = 'waiver-signatures';
const MAX_SIZE = 500 * 1024; // 500KB

/**
 * Upload a base64-encoded PNG signature image to Supabase Storage.
 * Returns the public URL, or null on failure.
 */
export async function uploadSignatureImage(
  base64DataUrl: string,
  waiverId: number,
): Promise<string | null> {
  try {
    // Validate and extract the base64 data
    const match = base64DataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!match || !match[1]) {
      logger.warn({ waiverId }, 'Invalid signature image format - expected data:image/png;base64');
      return null;
    }

    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.length > MAX_SIZE) {
      logger.warn({ waiverId, size: buffer.length }, 'Signature image too large');
      return null;
    }

    // Generate a unique filename
    const uniqueId = randomBytes(8).toString('hex');
    const storagePath = `${waiverId}-${uniqueId}.png`;

    const { error } = await supabaseAny.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: false,
      });

    if (error) {
      logger.error({ error, waiverId }, 'Failed to upload signature image to storage');
      return null;
    }

    // Build public URL
    const publicUrl = `${appConfig.supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`;
    return publicUrl;
  } catch (err) {
    logger.error({ err, waiverId }, 'Error uploading signature image');
    return null;
  }
}
