import { supabaseAny } from '../config/supabase';
import { EventPhotoRepository } from '../repositories';
import { logger } from '../utils/logger';

const BUCKET_NAME = 'event-images';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

let bucketReady = false;

export async function ensureEventImagesBucket() {
  if (bucketReady) return;

  try {
    const { data: buckets } = await supabaseAny.storage.listBuckets();
    const exists = buckets?.some((b: { name: string }) => b.name === BUCKET_NAME);

    const bucketOptions = {
      public: true,
      fileSizeLimit: 100 * 1024 * 1024, // 100MB (for videos)
      allowedMimeTypes: [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/quicktime', 'video/webm',
      ],
    };

    if (!exists) {
      const { error } = await supabaseAny.storage.createBucket(BUCKET_NAME, bucketOptions);
      if (error && !error.message?.includes('already exists')) {
        logger.error({ error }, 'Failed to create event-images bucket');
        throw error;
      }
    } else {
      // Update existing bucket to allow videos
      const { error } = await supabaseAny.storage.updateBucket(BUCKET_NAME, bucketOptions);
      if (error) {
        logger.warn({ error }, 'Failed to update event-images bucket settings');
      }
    }

    bucketReady = true;
  } catch (err) {
    // Bucket may already exist from a previous run
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists')) {
      bucketReady = true;
      return;
    }
    throw err;
  }
}

function buildStoragePath(folder: string, fileName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${folder}/${year}/${month}/${uuid}-${safeName}`;
}

export async function uploadEventPoster(file: UploadedFile): Promise<string> {
  await ensureEventImagesBucket();

  const storagePath = buildStoragePath('posters', file.originalname);

  const { error: uploadError } = await supabaseAny.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    logger.error({ error: uploadError }, 'Failed to upload event poster');
    throw uploadError;
  }

  const { data: urlData } = supabaseAny.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath);

  return urlData.publicUrl;
}

function deriveMediaType(mimetype: string): 'image' | 'video' {
  return mimetype.startsWith('video/') ? 'video' : 'image';
}

export async function uploadEventPhotos(
  eventId: number,
  files: UploadedFile[],
): Promise<Array<{ photo_id: number; photo_url: string; storage_path: string; caption: string | null; display_order: number | null; media_type: string }>> {
  await ensureEventImagesBucket();

  const results = [];

  for (const file of files) {
    const mediaType = deriveMediaType(file.mimetype);
    const folder = mediaType === 'video' ? 'videos' : 'photos';
    const storagePath = buildStoragePath(folder, file.originalname);

    const { error: uploadError } = await supabaseAny.storage
      .from(BUCKET_NAME)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      logger.error({ error: uploadError }, `Failed to upload event media: ${file.originalname}`);
      continue; // Skip failed uploads, don't block the whole batch
    }

    const { data: urlData } = supabaseAny.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    const photo = await EventPhotoRepository.create({
      event_id: eventId,
      photo_url: urlData.publicUrl,
      storage_path: storagePath,
      display_order: results.length,
      media_type: mediaType,
    });

    results.push(photo);
  }

  return results;
}

export async function deleteEventPhoto(photoId: number): Promise<void> {
  const storagePath = await EventPhotoRepository.delete(photoId);

  if (storagePath) {
    const { error } = await supabaseAny.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);
    if (error) {
      logger.error({ error }, `Failed to delete photo from storage: ${storagePath}`);
    }
  }
}

export async function deleteAllEventPhotos(eventId: number): Promise<void> {
  const storagePaths = await EventPhotoRepository.deleteByEventId(eventId);

  if (storagePaths.length > 0) {
    const { error } = await supabaseAny.storage
      .from(BUCKET_NAME)
      .remove(storagePaths);
    if (error) {
      logger.error({ error }, `Failed to bulk delete photos from storage for event ${eventId}`);
    }
  }
}
