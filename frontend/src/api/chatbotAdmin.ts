import { API_BASE_URL, apiDelete, apiGet, apiPatch, apiPost, getAuthToken } from './client';

// ---- Settings -----------------------------------------------------------------

export type QuickPrompt = { emoji: string; label: string; prompt: string };

export type ChatbotSettings = {
  enabled: boolean;
  botName: string;
  model: string;
  temperature: number;
  systemPrompt: string | null;
  greeting: string;
  quickPrompts: QuickPrompt[];
  capabilityPhrases: string[];
  maxToolTurns: number;
  kbEnabled: boolean;
  kbTopK: number;
  updatedBy: string | null;
  updatedAt: string;
};

export type ChatbotSettingsPatch = Partial<Omit<ChatbotSettings, 'updatedBy' | 'updatedAt'>>;

export type ChatbotToolCall = {
  tool: string;
  arguments: string;
  result_preview?: string;
};

export type ChatbotTestResult = { reply: string; toolCalls: ChatbotToolCall[] };

/** Public widget config (no auth). */
export type PublicChatConfig = {
  enabled: boolean;
  botName: string;
  greeting: string;
  quickPrompts: QuickPrompt[];
  capabilityPhrases: string[];
};

export async function fetchChatbotSettings() {
  return apiGet<ChatbotSettings>('/admin/chatbot/settings');
}

export async function updateChatbotSettings(patch: ChatbotSettingsPatch) {
  return apiPatch<ChatbotSettings, ChatbotSettingsPatch>('/admin/chatbot/settings', patch);
}

export async function fetchChatbotModels() {
  const data = await apiGet<{ models: string[] }>('/admin/chatbot/models');
  return data.models ?? [];
}

export async function testChatbot(message: string) {
  return apiPost<ChatbotTestResult, { message: string }>('/admin/chatbot/test', { message });
}

export async function fetchPublicChatConfig(): Promise<PublicChatConfig> {
  const response = await fetch(`${API_BASE_URL}/chatbot/config`);
  if (!response.ok) throw new Error('Failed to load chat config');
  return response.json() as Promise<PublicChatConfig>;
}

// ---- Knowledge base -------------------------------------------------------------

export type KbDocumentStatus = 'processing' | 'ready' | 'failed' | 'unsearchable';

export type KbDocument = {
  id: number;
  title: string;
  sourceType: 'text' | 'file';
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  status: KbDocumentStatus;
  error: string | null;
  isEnabled: boolean;
  chunkCount: number;
  contentLength: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
};

export type KbDocumentDetail = KbDocument & { content: string; downloadUrl: string | null };

export type KbStats = { documents: number; chunks: number; readyDocuments: number };

export type KbSearchResult = {
  chunkId: number;
  documentId: number;
  title: string;
  content: string;
  similarity: number;
};

export async function fetchKbDocuments() {
  return apiGet<{ documents: KbDocument[]; stats: KbStats }>('/admin/chatbot/kb/documents');
}

export async function fetchKbDocument(id: number) {
  return apiGet<KbDocumentDetail>(`/admin/chatbot/kb/documents/${id}`);
}

export async function createKbTextDocument(payload: { title: string; content: string }) {
  return apiPost<KbDocumentDetail, typeof payload>('/admin/chatbot/kb/documents', payload);
}

export async function updateKbDocument(
  id: number,
  patch: { title?: string; content?: string; isEnabled?: boolean },
) {
  return apiPatch<KbDocumentDetail, typeof patch>(`/admin/chatbot/kb/documents/${id}`, patch);
}

export async function reindexKbDocument(id: number) {
  return apiPost<KbDocumentDetail, Record<string, never>>(`/admin/chatbot/kb/documents/${id}/reindex`, {});
}

export async function deleteKbDocument(id: number) {
  return apiDelete<{ success: boolean }>(`/admin/chatbot/kb/documents/${id}`);
}

export async function searchKb(query: string, k = 5) {
  const data = await apiPost<{ results: KbSearchResult[] }, { query: string; k: number }>(
    '/admin/chatbot/kb/search',
    { query, k },
  );
  return data.results ?? [];
}

async function multipartPost<T>(path: string, form: FormData, fallback: string): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text || fallback;
    try {
      const json = JSON.parse(text);
      if (json && typeof json.message === 'string' && json.message) message = json.message;
      else if (json && typeof json.error === 'string' && json.error) message = json.error;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

/** Upload any file as a new knowledge-base document (text is extracted server-side). */
export async function uploadKbFile(file: File, title?: string) {
  const form = new FormData();
  form.append('file', file);
  if (title && title.trim()) form.append('title', title.trim());
  return multipartPost<KbDocumentDetail>('/admin/chatbot/kb/upload', form, 'Failed to upload file');
}

/** Replace the file behind an existing document and re-index it. */
export async function replaceKbFile(id: number, file: File) {
  const form = new FormData();
  form.append('file', file);
  return multipartPost<KbDocumentDetail>(`/admin/chatbot/kb/documents/${id}/replace`, form, 'Failed to replace file');
}
