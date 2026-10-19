import { z } from 'zod';

export const CHATBOT_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5-mini', 'gpt-5'] as const;

export const quickPromptSchema = z.object({
  emoji: z.string().max(16).default(''),
  label: z.string().min(1).max(120),
  prompt: z.string().min(1).max(500),
});

export const updateChatbotSettingsSchema = z
  .object({
    enabled: z.boolean(),
    botName: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(80),
    temperature: z.coerce.number().min(0).max(2),
    systemPrompt: z.string().max(20000).nullable(),
    greeting: z.string().trim().min(1).max(1000),
    quickPrompts: z.array(quickPromptSchema).max(12),
    capabilityPhrases: z.array(z.string().trim().min(1).max(80)).max(12),
    maxToolTurns: z.coerce.number().int().min(1).max(12),
    kbEnabled: z.boolean(),
    kbTopK: z.coerce.number().int().min(1).max(10),
  })
  .partial()
  .strict();

export type UpdateChatbotSettingsInput = z.infer<typeof updateChatbotSettingsSchema>;

export const createKbTextDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(500_000),
});

export const updateKbDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    content: z.string().max(500_000),
    isEnabled: z.boolean(),
  })
  .partial()
  .strict();

export const kbSearchSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  k: z.coerce.number().int().min(1).max(10).optional(),
});

export const chatbotTestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});
