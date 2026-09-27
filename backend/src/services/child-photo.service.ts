import { supabaseAny } from '../config/supabase';
import { signStorageUrl } from './storage-url.service';
import { ChildRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';

const BUCKET_NAME = 'child-photos';

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

let bucketReady = false;

export async function ensureChildPhotosBucket() {
  if (bucketReady) return;

  try {
    const { data: buckets } = await supabaseAny.storage.listBuckets();
    const exists = buckets?.some((b: { name: string }) => b.name === BUCKET_NAME);

    const bucketOptions = {
      // Photos of children are never publicly readable. This runs on every
      // cold start, so leaving it `true` here silently re-opened the bucket
      // after any manual fix. Readers go through signStorageUrl().
      public: false,
      fileSizeLimit: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    };

    if (!exists) {
      const { error } = await supabaseAny.storage.createBucket(BUCKET_NAME, bucketOptions);
      if (error && !error.message?.includes('already exists')) {
        logger.error({ error }, 'Failed to create child-photos bucket');
        throw error;
      }
    } else {
      const { error } = await supabaseAny.storage.updateBucket(BUCKET_NAME, bucketOptions);
      if (error) {
        logger.warn({ error }, 'Failed to update child-photos bucket settings');
      }
    }

    bucketReady = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists')) {
      bucketReady = true;
      return;
    }
    throw err;
  }
}

function buildStoragePath(fileName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uuid = crypto.randomUUID();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `photos/${year}/${month}/${uuid}-${safeName}`;
}

export async function uploadChildPhoto(
  childId: number,
  file: UploadedFile,
): Promise<string> {
  await ensureChildPhotosBucket();

  const child = await ChildRepository.findById(childId);
  if (!child) {
    throw new AppError('Child not found', 404);
  }

  // Delete old photo if exists
  if (child.photo_storage_path) {
    try {
      await supabaseAny.storage.from(BUCKET_NAME).remove([child.photo_storage_path]);
    } catch (err) {
      logger.warn({ err, childId }, 'Failed to delete old child photo');
    }
  }

  const storagePath = buildStoragePath(file.originalname);

  const { error: uploadError } = await supabaseAny.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    logger.error({ error: uploadError }, 'Failed to upload child photo');
    throw new AppError('Failed to upload photo', 500);
  }

  // The bucket is private. Persist the object path (readers mint their own
  // short-lived signed URLs) and hand the caller a signed URL for immediate
  // display.
  await ChildRepository.update(childId, {
    photo_url: storagePath,
    photo_storage_path: storagePath,
  });

  const signedUrl = await signStorageUrl(BUCKET_NAME, storagePath);
  if (!signedUrl) {
    logger.error({ childId, storagePath }, 'Uploaded child photo but could not sign its URL');
    throw new AppError('Failed to prepare photo for display', 500);
  }
  return signedUrl;
}
