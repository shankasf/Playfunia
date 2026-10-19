/**
 * Admin-managed chatbot knowledge base on pgvector (kb_documents / kb_chunks).
 *
 * WRITE side of the RAG store. The Python chatbot_service reads via kb_search()
 * with its read-only role; this module creates/updates documents, extracts text
 * from uploaded files, chunks it (TS port of chatbot_service/ingest.py) and
 * embeds with OpenAI text-embedding-3-large @ 1536 dims — identical to
 * chatbot_service/embeddings.py. Keep model + dims in lock-step.
 */
import crypto from 'crypto';
import path from 'path';

import OpenAI from 'openai';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { convert as htmlToText } from 'html-to-text';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> = require('pdf-parse');

import { appConfig } from '../config/env';
import { supabaseAny } from '../config/supabase';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';

export const EMBED_MODEL = 'text-embedding-3-large';
export const EMBED_DIMS = 1536;
const EMBED_BATCH = 64;
const CHUNK_MAX_CHARS = 1800;

export const KB_BUCKET = 'kb-files';
export const KB_SOURCE_TABLE = 'kb_admin';
export const KB_MAX_FILE_BYTES = 25 * 1024 * 1024;

export type KbStatus = 'processing' | 'ready' | 'failed' | 'unsearchable';

export type KbDocument = {
  id: number;
  title: string;
  sourceType: 'text' | 'file';
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  status: KbStatus;
  error: string | null;
  isEnabled: boolean;
  chunkCount: number;
  contentLength: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type KbDocumentDetail = KbDocument & { content: string; downloadUrl: string | null };

export type KbSearchResult = {
  chunkId: number;
  documentId: number;
  title: string;
  content: string;
  similarity: number;
};

export type UploadedFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

// ---- OpenAI --------------------------------------------------------------------

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!appConfig.openaiApiKey) {
    throw new AppError('OPENAI_API_KEY is not configured on the server.', 500);
  }
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: appConfig.openaiApiKey });
  return openaiClient;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getOpenAI();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const resp = await client.embeddings.create({ model: EMBED_MODEL, input: batch, dimensions: EMBED_DIMS });
    // API returns in input order, but sort by index defensively.
    const sorted = [...resp.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) out.push(item.embedding);
  }
  return out;
}

function vectorLiteral(vec: number[]): string {
  return '[' + vec.map((x) => Number(x).toString()).join(',') + ']';
}

// ---- Chunking (port of chatbot_service/ingest.py chunk_text) ------------------

export function chunkText(text: string, maxChars = CHUNK_MAX_CHARS): string[] {
  if (!text) return [];
  const sections: Array<[string | null, string]> = [];
  let currentHeader: string | null = null;
  let currentBody: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      if (currentHeader !== null || currentBody.length) {
        sections.push([currentHeader, currentBody.join('\n').trim()]);
      }
      currentHeader = line.trimEnd();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentHeader !== null || currentBody.length) {
    sections.push([currentHeader, currentBody.join('\n').trim()]);
  }

  const chunks: string[] = [];
  for (const [header, body] of sections) {
    if (!body && !header) continue;
    let paragraphs = body
      .split('\n\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const merged: string[] = [];
    let i = 0;
    while (i < paragraphs.length) {
      const p = paragraphs[i] as string;
      if (p.startsWith('### ') && !p.includes('\n') && i + 1 < paragraphs.length) {
        merged.push(p + '\n\n' + paragraphs[i + 1]);
        i += 2;
      } else {
        merged.push(p);
        i += 1;
      }
    }
    paragraphs = merged.length ? merged : [''];
    const headerPrefix = header ? header + '\n\n' : '';
    for (const p of paragraphs) {
      let chunk = headerPrefix + p;
      while (chunk.length > maxChars) {
        // rfind('. ', start=len(prefix), end=maxChars)
        let cut = chunk.lastIndexOf('. ', maxChars - 1);
        if (cut < headerPrefix.length) cut = -1;
        if (cut === -1) cut = maxChars;
        chunks.push(chunk.slice(0, cut + 1).trim());
        const rest = chunk.slice(cut + 1).trim();
        chunk = headerPrefix + rest;
      }
      if (chunk.trim()) chunks.push(chunk);
    }
  }
  return chunks;
}

// ---- Text extraction -----------------------------------------------------------

const TEXT_EXTS = new Set(['.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.log', '.yaml', '.yml', '.xml', '.rtf']);
const SHEET_EXTS = new Set(['.xlsx', '.xls', '.xlsm', '.ods']);
const IMAGE_MIMES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export class UnsupportedFileError extends Error {}

function ext(name: string): string {
  return path.extname(name || '').toLowerCase();
}

function sheetToLines(wb: XLSX.WorkBook): string {
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    parts.push(`## ${name}`);
    for (const row of rows) {
      const line = Object.entries(row)
        .filter(([, v]) => v !== '' && v != null)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join('; ');
      if (line) parts.push(line);
    }
    parts.push('');
  }
  return parts.join('\n').trim();
}

async function describeImage(file: UploadedFile, mime: string): Promise<string> {
  const client = getOpenAI();
  const dataUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;
  const resp = await client.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'This image is being added to a customer-support knowledge base for an indoor kids play center. ' +
              'Transcribe ALL text in the image verbatim (prices, hours, rules, names), then describe the content ' +
              'and any visual information a support agent would need. Plain text, no markdown tables.',
          },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ],
  });
  return (resp.choices[0]?.message?.content ?? '').trim();
}

/** Extract plain text from an uploaded file. Throws UnsupportedFileError for unknown types. */
export async function extractText(file: UploadedFile): Promise<string> {
  const e = ext(file.originalname);
  const mime = (file.mimetype || '').toLowerCase();

  if (e === '.pdf' || mime === 'application/pdf') {
    const parsed = await pdfParse(file.buffer);
    return (parsed.text || '').trim();
  }
  if (e === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return (result.value || '').trim();
  }
  if (SHEET_EXTS.has(e) || mime.includes('spreadsheet') || mime === 'application/vnd.ms-excel') {
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    return sheetToLines(wb);
  }
  if (e === '.csv' || e === '.tsv' || mime === 'text/csv') {
    const wb = XLSX.read(file.buffer.toString('utf8'), { type: 'string' });
    return sheetToLines(wb);
  }
  if (e === '.html' || e === '.htm' || mime === 'text/html') {
    return htmlToText(file.buffer.toString('utf8'), {
      wordwrap: false,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
      ],
    }).trim();
  }
  if (IMAGE_MIMES[e] || mime.startsWith('image/')) {
    const imageMime = IMAGE_MIMES[e] || mime;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(imageMime)) {
      throw new UnsupportedFileError(`Unsupported image type: ${imageMime}`);
    }
    return describeImage(file, imageMime);
  }
  if (TEXT_EXTS.has(e) || mime.startsWith('text/') || mime === 'application/json') {
    const text = file.buffer.toString('utf8');
    // Reject binary masquerading as text.
    if (text.includes('\u0000')) throw new UnsupportedFileError('File appears to be binary.');
    return text.trim();
  }
  throw new UnsupportedFileError('Unsupported file type');
}

// ---- Mapping -------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): KbDocument {
  return {
    id: Number(row.document_id),
    title: (row.title as string) ?? '',
    sourceType: row.source_type === 'file' ? 'file' : 'text',
    fileName: (row.file_name as string) ?? null,
    mimeType: (row.mime_type as string) ?? null,
    fileSize: row.file_size == null ? null : Number(row.file_size),
    status: ((row.status as string) ?? 'ready') as KbStatus,
    error: (row.error as string) ?? null,
    isEnabled: row.is_enabled !== false,
    chunkCount: Number(row.chunk_count ?? 0),
    contentLength: typeof row.content === 'string' ? row.content.length : Number(row.content_length ?? 0),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: (row.created_by as string) ?? null,
  };
}

const LIST_COLUMNS =
  'document_id, title, source_type, file_name, mime_type, file_size, status, error, is_enabled, chunk_count, created_at, updated_at, created_by, content';

async function fetchRow(id: number): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAny.from('kb_documents').select('*').eq('document_id', id).maybeSingle();
  if (error) throw new AppError('Failed to load knowledge base document', 500, { cause: error });
  if (!data) throw new AppError('Knowledge base document not found', 404);
  return data as Record<string, unknown>;
}

async function toDetail(row: Record<string, unknown>): Promise<KbDocumentDetail> {
  const base = mapRow(row);
  let downloadUrl: string | null = null;
  const storagePath = row.storage_path as string | null;
  if (storagePath) {
    const { data, error } = await supabaseAny.storage.from(KB_BUCKET).createSignedUrl(storagePath, 3600, {
      download: base.fileName ?? undefined,
    });
    if (error) logger.warn({ error, storagePath }, 'KB: could not sign download URL');
    downloadUrl = data?.signedUrl ?? null;
  }
  return { ...base, content: (row.content as string) ?? '', downloadUrl };
}

// ---- Indexing ------------------------------------------------------------------

async function setStatus(id: number, status: KbStatus, error: string | null, extra: Record<string, unknown> = {}) {
  const { error: dbError } = await supabaseAny
    .from('kb_documents')
    .update({ status, error, ...extra })
    .eq('document_id', id);
  if (dbError) logger.error({ dbError, id }, 'KB: failed to update status');
}

/** Re-chunk + re-embed the given content for a document, replacing its chunks. */
async function indexDocument(id: number, content: string): Promise<void> {
  await setStatus(id, 'processing', null);
  try {
    const chunks = chunkText(content);
    const vectors = await embedTexts(chunks);

    const { error: delError } = await supabaseAny.from('kb_chunks').delete().eq('document_id', id);
    if (delError) throw delError;

    if (chunks.length) {
      const rows = chunks.map((chunk, idx) => ({
        document_id: id,
        chunk_index: idx,
        content: chunk,
        token_count: Math.floor(chunk.length / 4),
        embedding: vectorLiteral(vectors[idx] as number[]),
      }));
      for (let i = 0; i < rows.length; i += 100) {
        const { error: insError } = await supabaseAny.from('kb_chunks').insert(rows.slice(i, i + 100));
        if (insError) throw insError;
      }
    }
    await setStatus(id, chunks.length ? 'ready' : 'unsearchable', chunks.length ? null : 'No text content to index', {
      chunk_count: chunks.length,
      content_hash: sha256(content),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, id }, 'KB: indexing failed');
    await setStatus(id, 'failed', message.slice(0, 1000), { chunk_count: 0 });
  }
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

// ---- Storage -------------------------------------------------------------------

function safeFileName(name: string): string {
  const base = path.basename(name || 'file').replace(/[^\w.\-() ]+/g, '_').slice(0, 150);
  return base || 'file';
}

async function uploadOriginal(file: UploadedFile): Promise<string> {
  const storagePath = `kb/${crypto.randomUUID()}/${safeFileName(file.originalname)}`;
  const { error } = await supabaseAny.storage
    .from(KB_BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype || 'application/octet-stream', upsert: false });
  if (error) {
    logger.error({ error }, 'KB: failed to upload original file');
    throw new AppError('Failed to store the uploaded file', 500, { cause: error });
  }
  return storagePath;
}

async function removeOriginal(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) return;
  const { error } = await supabaseAny.storage.from(KB_BUCKET).remove([storagePath]);
  if (error) logger.warn({ error, storagePath }, 'KB: failed to remove stored file');
}

// ---- Public API ----------------------------------------------------------------

export async function listDocuments(): Promise<{
  documents: KbDocument[];
  stats: { documents: number; chunks: number; readyDocuments: number };
}> {
  const { data, error } = await supabaseAny
    .from('kb_documents')
    .select(LIST_COLUMNS)
    .order('updated_at', { ascending: false });
  if (error) throw new AppError('Failed to list knowledge base documents', 500, { cause: error });
  const documents = ((data ?? []) as Record<string, unknown>[]).map(mapRow);
  const { count } = await supabaseAny.from('kb_chunks').select('chunk_id', { count: 'exact', head: true });
  return {
    documents,
    stats: {
      documents: documents.length,
      chunks: count ?? documents.reduce((s, d) => s + d.chunkCount, 0),
      readyDocuments: documents.filter((d) => d.status === 'ready' && d.isEnabled).length,
    },
  };
}

export async function getDocument(id: number): Promise<KbDocumentDetail> {
  return toDetail(await fetchRow(id));
}

export async function createTextDocument(
  input: { title: string; content: string },
  createdBy: string | null,
): Promise<KbDocumentDetail> {
  const { data, error } = await supabaseAny
    .from('kb_documents')
    .insert({
      source_table: KB_SOURCE_TABLE,
      entity_id: null,
      source_type: 'text',
      title: input.title,
      content: input.content,
      content_hash: sha256(input.content),
      metadata: { kind: 'admin_text' },
      status: 'processing',
      created_by: createdBy,
    })
    .select('document_id')
    .single();
  if (error) throw new AppError('Failed to create knowledge base document', 500, { cause: error });
  const id = Number((data as { document_id: number }).document_id);
  await indexDocument(id, input.content);
  return getDocument(id);
}

async function ingestFile(
  file: UploadedFile,
  opts: { id?: number; title?: string; createdBy: string | null },
): Promise<number> {
  if (!file || !file.buffer?.length) throw new AppError('The uploaded file is empty.', 400);
  if (file.size > KB_MAX_FILE_BYTES) throw new AppError('File is too large. The maximum size is 25 MB.', 400);

  const storagePath = await uploadOriginal(file);
  const baseTitle = opts.title?.trim() || path.basename(file.originalname, path.extname(file.originalname)) || file.originalname;

  let id = opts.id;
  const fileFields = {
    source_type: 'file',
    file_name: file.originalname,
    mime_type: file.mimetype || null,
    file_size: file.size,
    storage_path: storagePath,
    status: 'processing',
    error: null,
    chunk_count: 0,
  };

  if (id == null) {
    const { data, error } = await supabaseAny
      .from('kb_documents')
      .insert({
        source_table: KB_SOURCE_TABLE,
        entity_id: null,
        title: baseTitle,
        content: '',
        content_hash: '',
        metadata: { kind: 'admin_file' },
        created_by: opts.createdBy,
        ...fileFields,
      })
      .select('document_id')
      .single();
    if (error) {
      await removeOriginal(storagePath);
      throw new AppError('Failed to create knowledge base document', 500, { cause: error });
    }
    id = Number((data as { document_id: number }).document_id);
  } else {
    const existing = await fetchRow(id);
    const { error } = await supabaseAny
      .from('kb_documents')
      .update({ ...fileFields, ...(opts.title?.trim() ? { title: opts.title.trim() } : {}) })
      .eq('document_id', id);
    if (error) {
      await removeOriginal(storagePath);
      throw new AppError('Failed to update knowledge base document', 500, { cause: error });
    }
    await removeOriginal(existing.storage_path as string | null);
  }

  let text: string;
  try {
    text = await extractText(file);
  } catch (err) {
    if (err instanceof UnsupportedFileError) {
      await setStatus(id, 'unsearchable', err.message || 'Unsupported file type', { content: '', chunk_count: 0 });
      return id;
    }
    const message = err instanceof Error ? err.message : String(err);
    await setStatus(id, 'failed', `Text extraction failed: ${message}`.slice(0, 1000), { content: '', chunk_count: 0 });
    return id;
  }

  const { error: contentError } = await supabaseAny
    .from('kb_documents')
    .update({ content: text, content_hash: sha256(text) })
    .eq('document_id', id);
  if (contentError) throw new AppError('Failed to save extracted text', 500, { cause: contentError });

  await indexDocument(id, text);
  return id;
}

export async function uploadDocument(
  file: UploadedFile,
  title: string | undefined,
  createdBy: string | null,
): Promise<KbDocumentDetail> {
  const id = await ingestFile(file, { title, createdBy });
  return getDocument(id);
}

export async function replaceDocumentFile(id: number, file: UploadedFile): Promise<KbDocumentDetail> {
  await fetchRow(id);
  await ingestFile(file, { id, createdBy: null });
  return getDocument(id);
}

export async function updateDocument(
  id: number,
  input: { title?: string; content?: string; isEnabled?: boolean },
): Promise<KbDocumentDetail> {
  const existing = await fetchRow(id);
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.isEnabled !== undefined) patch.is_enabled = input.isEnabled;
  const contentChanged = input.content !== undefined && input.content !== (existing.content as string);
  if (contentChanged) {
    patch.content = input.content;
    patch.content_hash = sha256(input.content as string);
  }
  if (Object.keys(patch).length) {
    const { error } = await supabaseAny.from('kb_documents').update(patch).eq('document_id', id);
    if (error) throw new AppError('Failed to update knowledge base document', 500, { cause: error });
  }
  if (contentChanged) await indexDocument(id, input.content as string);
  return getDocument(id);
}

export async function reindexDocument(id: number): Promise<KbDocumentDetail> {
  const row = await fetchRow(id);
  await indexDocument(id, (row.content as string) ?? '');
  return getDocument(id);
}

export async function deleteDocument(id: number): Promise<void> {
  const row = await fetchRow(id);
  const { error } = await supabaseAny.from('kb_documents').delete().eq('document_id', id); // cascades to kb_chunks
  if (error) throw new AppError('Failed to delete knowledge base document', 500, { cause: error });
  await removeOriginal(row.storage_path as string | null);
}

export async function searchKnowledgeBase(query: string, k = 5): Promise<KbSearchResult[]> {
  const [vec] = await embedTexts([query]);
  if (!vec) return [];
  const { data, error } = await supabaseAny.rpc('kb_search', {
    query_embedding: vectorLiteral(vec),
    match_count: Math.max(1, Math.min(10, k)),
    source_filter: null,
  });
  if (error) throw new AppError('Knowledge base search failed', 500, { cause: error });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    chunkId: Number(r.chunk_id),
    documentId: Number(r.document_id),
    title: (r.title as string) ?? '',
    content: (r.content as string) ?? '',
    similarity: Math.round(Number(r.similarity ?? 0) * 10000) / 10000,
  }));
}
