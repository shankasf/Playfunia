import type { ZodType } from 'zod';

import { appConfig } from '../config/env';
import * as SettingsService from '../services/chatbot-settings.service';
import * as KbService from '../services/knowledge-base.service';
import {
  CHATBOT_MODELS,
  chatbotTestSchema,
  createKbTextDocumentSchema,
  kbSearchSchema,
  updateChatbotSettingsSchema,
  updateKbDocumentSchema,
} from '../schemas/chatbot.schema';
import { asyncHandler } from '../utils/async-handler';
import { AppError } from '../utils/app-error';
import type { SupabaseAuthenticatedRequest } from '../middleware/supabase-auth.middleware';

function parseIdParam(value: string | undefined): number {
  const parsed = parseInt(value || '', 10);
  if (Number.isNaN(parsed) || parsed <= 0) throw new AppError('Invalid document id', 400);
  return parsed;
}

// Zod errors are not AppErrors (the error middleware would answer 500), so
// surface validation problems as readable 400s.
function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join('.');
    throw new AppError(`${field ? `${field}: ` : ''}${issue?.message ?? 'Invalid request'}`, 400);
  }
  return parsed.data;
}

function actor(req: unknown): string | null {
  const user = (req as SupabaseAuthenticatedRequest).user;
  return user?.email ?? (user?.id ? `user:${user.id}` : null);
}

// ---- Settings ----------------------------------------------------------------

export const getChatbotSettingsHandler = asyncHandler(async (_req, res) => {
  res.status(200).json(await SettingsService.getChatbotSettings());
});

export const updateChatbotSettingsHandler = asyncHandler(async (req, res) => {
  const input = parseBody(updateChatbotSettingsSchema, req.body);
  res.status(200).json(await SettingsService.updateChatbotSettings(input, actor(req)));
});

export const listChatbotModelsHandler = asyncHandler(async (_req, res) => {
  res.status(200).json({ models: [...CHATBOT_MODELS] });
});

export const testChatbotHandler = asyncHandler(async (req, res) => {
  const { message } = parseBody(chatbotTestSchema, req.body);
  const url = `${appConfig.chatbotServiceUrl}/chat/debug`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: message }] }),
    });
  } catch (error) {
    throw new AppError('Unable to reach the chatbot service', 502, { cause: error });
  }
  if (!response.ok) {
    const text = await response.text();
    throw new AppError(text || 'Chatbot service error', response.status >= 500 ? 502 : response.status);
  }
  const data = (await response.json()) as { reply?: string; tool_calls?: unknown[]; error?: string };
  res.status(200).json({ reply: data.reply ?? '', toolCalls: data.tool_calls ?? [], error: data.error ?? null });
});

// ---- Knowledge base ----------------------------------------------------------

export const listKbDocumentsHandler = asyncHandler(async (_req, res) => {
  res.status(200).json(await KbService.listDocuments());
});

export const getKbDocumentHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await KbService.getDocument(parseIdParam(req.params.id as string | undefined)));
});

export const createKbTextDocumentHandler = asyncHandler(async (req, res) => {
  const input = parseBody(createKbTextDocumentSchema, req.body);
  res.status(201).json(await KbService.createTextDocument(input, actor(req)));
});

export const uploadKbDocumentHandler = asyncHandler(async (req, res) => {
  const file = (req as unknown as { file?: KbService.UploadedFile }).file;
  if (!file) throw new AppError('Send the file as multipart/form-data in the "file" field.', 400);
  const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
  res.status(201).json(await KbService.uploadDocument(file, title, actor(req)));
});

export const replaceKbDocumentFileHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id as string | undefined);
  const file = (req as unknown as { file?: KbService.UploadedFile }).file;
  if (!file) throw new AppError('Send the file as multipart/form-data in the "file" field.', 400);
  res.status(200).json(await KbService.replaceDocumentFile(id, file));
});

export const updateKbDocumentHandler = asyncHandler(async (req, res) => {
  const id = parseIdParam(req.params.id as string | undefined);
  const input = parseBody(updateKbDocumentSchema, req.body);
  res.status(200).json(await KbService.updateDocument(id, input));
});

export const reindexKbDocumentHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await KbService.reindexDocument(parseIdParam(req.params.id as string | undefined)));
});

export const deleteKbDocumentHandler = asyncHandler(async (req, res) => {
  await KbService.deleteDocument(parseIdParam(req.params.id as string | undefined));
  res.status(200).json({ success: true });
});

export const searchKbHandler = asyncHandler(async (req, res) => {
  const { query, k } = parseBody(kbSearchSchema, req.body);
  res.status(200).json({ results: await KbService.searchKnowledgeBase(query, k ?? 5) });
});
