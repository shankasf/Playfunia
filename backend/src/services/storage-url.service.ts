import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

/**
 * Signed-URL helpers for the private storage buckets.
 *
 * `waiver-signatures` and `child-photos` used to be public buckets, so the
 * URLs persisted in waiver_submissions.signature_image_url and
 * children.photo_url are of the form
 *   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
 * Those rows are not rewritten; `toStoragePath` accepts either that legacy
 * shape or a bare storage path, so old and new rows both resolve.
 */

const PUBLIC_MARKER = '/storage/v1/object/public/';

export const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes, matching resumes/videos

export function toStoragePath(
  bucket: string,
  pathOrUrl: string | null | undefined,
): string | null {
  if (!pathOrUrl) return null;

  const marker = `${PUBLIC_MARKER}${bucket}/`;
  const idx = pathOrUrl.indexOf(marker);
  if (idx !== -1) {
    const raw = pathOrUrl.slice(idx + marker.length).split('?')[0] ?? '';
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  // Anything else that still looks like a URL belongs to a different bucket or
  // an external host - refuse rather than guess.
  if (/^https?:\/\//i.test(pathOrUrl)) return null;

  return pathOrUrl;
}

export async function signStorageUrl(
  bucket: string,
  pathOrUrl: string | null | undefined,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const path = toStoragePath(bucket, pathOrUrl);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    logger.warn({ error, bucket, path }, 'Failed to create signed storage URL');
    return null;
  }
  return data.signedUrl;
}

/**
 * Batch variant. Returns one entry per input, in the same order, so callers can
 * zip it back onto their rows. Unresolvable entries come back as null.
 */
export async function signStorageUrls(
  bucket: string,
  pathsOrUrls: Array<string | null | undefined>,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<Array<string | null>> {
  const paths = pathsOrUrls.map(p => toStoragePath(bucket, p));
  const wanted = [...new Set(paths.filter((p): p is string => p !== null))];
  if (wanted.length === 0) return paths.map(() => null);

  const signedByPath = new Map<string, string>();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(wanted, expiresIn);

  if (error) {
    logger.warn({ error, bucket }, 'Failed to batch-create signed storage URLs');
    return paths.map(() => null);
  }

  for (const entry of data ?? []) {
    // createSignedUrls echoes the requested path back on each entry.
    const key = (entry as { path?: string | null }).path;
    if (key && entry.signedUrl) signedByPath.set(key, entry.signedUrl);
  }

  return paths.map(p => (p ? signedByPath.get(p) ?? null : null));
}
