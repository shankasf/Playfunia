/**
 * Chatbot settings — single row (id = 1) in public.chatbot_settings.
 *
 * Read by: the admin panel (full row), the public widget (subset via
 * getPublicChatbotConfig, cached 30s) and the Python chatbot_service (reads the
 * same table directly with its read-only role).
 */
import { supabaseAny } from '../config/supabase';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import type { UpdateChatbotSettingsInput } from '../schemas/chatbot.schema';

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

export type PublicChatbotConfig = Pick<
  ChatbotSettings,
  'enabled' | 'botName' | 'greeting' | 'quickPrompts' | 'capabilityPhrases'
>;

const DEFAULTS: ChatbotSettings = {
  enabled: true,
  botName: 'Playfunia Assistant',
  model: 'gpt-4o-mini',
  temperature: 0.2,
  systemPrompt: null,
  greeting: "Hi there! 👋 I'm the Playfunia assistant. Ask me about hours, tickets, parties, memberships or deals!",
  quickPrompts: [],
  capabilityPhrases: [],
  maxToolTurns: 6,
  kbEnabled: true,
  kbTopK: 5,
  updatedBy: null,
  updatedAt: new Date(0).toISOString(),
};

function toQuickPrompts(raw: unknown): QuickPrompt[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      emoji: typeof p.emoji === 'string' ? p.emoji : '',
      label: typeof p.label === 'string' ? p.label : '',
      prompt: typeof p.prompt === 'string' ? p.prompt : '',
    }))
    .filter((p) => p.label && p.prompt);
}

function mapRow(row: Record<string, unknown>): ChatbotSettings {
  return {
    enabled: row.enabled !== false,
    botName: (row.bot_name as string) || DEFAULTS.botName,
    model: (row.model as string) || DEFAULTS.model,
    temperature: row.temperature == null ? DEFAULTS.temperature : Number(row.temperature),
    systemPrompt: typeof row.system_prompt === 'string' && row.system_prompt.trim() ? row.system_prompt : null,
    greeting: (row.greeting as string) || DEFAULTS.greeting,
    quickPrompts: toQuickPrompts(row.quick_prompts),
    capabilityPhrases: Array.isArray(row.capability_phrases)
      ? (row.capability_phrases as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [],
    maxToolTurns: row.max_tool_turns == null ? DEFAULTS.maxToolTurns : Number(row.max_tool_turns),
    kbEnabled: row.kb_enabled !== false,
    kbTopK: row.kb_top_k == null ? DEFAULTS.kbTopK : Number(row.kb_top_k),
    updatedBy: (row.updated_by as string) ?? null,
    updatedAt: (row.updated_at as string) ?? DEFAULTS.updatedAt,
  };
}

export async function getChatbotSettings(): Promise<ChatbotSettings> {
  const { data, error } = await supabaseAny.from('chatbot_settings').select('*').eq('id', 1).maybeSingle();
  if (error) {
    logger.error({ error }, 'Failed to load chatbot settings');
    throw new AppError('Failed to load chatbot settings', 500, { cause: error });
  }
  if (!data) {
    // Row missing (migration not seeded) — create it with defaults.
    const { data: created, error: insertError } = await supabaseAny
      .from('chatbot_settings')
      .insert({ id: 1 })
      .select('*')
      .single();
    if (insertError) throw new AppError('Failed to initialise chatbot settings', 500, { cause: insertError });
    return mapRow(created as Record<string, unknown>);
  }
  return mapRow(data as Record<string, unknown>);
}

export async function updateChatbotSettings(
  input: UpdateChatbotSettingsInput,
  updatedBy: string | null,
): Promise<ChatbotSettings> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: updatedBy };
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.botName !== undefined) patch.bot_name = input.botName;
  if (input.model !== undefined) patch.model = input.model;
  if (input.temperature !== undefined) patch.temperature = input.temperature;
  if (input.systemPrompt !== undefined) patch.system_prompt = input.systemPrompt?.trim() ? input.systemPrompt : null;
  if (input.greeting !== undefined) patch.greeting = input.greeting;
  if (input.quickPrompts !== undefined) patch.quick_prompts = input.quickPrompts;
  if (input.capabilityPhrases !== undefined) patch.capability_phrases = input.capabilityPhrases;
  if (input.maxToolTurns !== undefined) patch.max_tool_turns = input.maxToolTurns;
  if (input.kbEnabled !== undefined) patch.kb_enabled = input.kbEnabled;
  if (input.kbTopK !== undefined) patch.kb_top_k = input.kbTopK;

  // Make sure the row exists before patching.
  await getChatbotSettings();

  const { data, error } = await supabaseAny
    .from('chatbot_settings')
    .update(patch)
    .eq('id', 1)
    .select('*')
    .single();
  if (error) {
    logger.error({ error }, 'Failed to update chatbot settings');
    throw new AppError('Failed to update chatbot settings', 500, { cause: error });
  }
  invalidatePublicConfigCache();
  return mapRow(data as Record<string, unknown>);
}

// ---- Public config (widget) with a short in-memory cache -------------------

const PUBLIC_CACHE_TTL_MS = 30_000;
let publicCache: { value: PublicChatbotConfig; expiresAt: number } | null = null;

export function invalidatePublicConfigCache(): void {
  publicCache = null;
}

export async function getPublicChatbotConfig(): Promise<PublicChatbotConfig> {
  const now = Date.now();
  if (publicCache && publicCache.expiresAt > now) return publicCache.value;
  let settings: ChatbotSettings;
  try {
    settings = await getChatbotSettings();
  } catch (error) {
    logger.warn({ error }, 'Chatbot public config: falling back to defaults');
    settings = DEFAULTS;
  }
  const value: PublicChatbotConfig = {
    enabled: settings.enabled,
    botName: settings.botName,
    greeting: settings.greeting,
    quickPrompts: settings.quickPrompts,
    capabilityPhrases: settings.capabilityPhrases,
  };
  publicCache = { value, expiresAt: now + PUBLIC_CACHE_TTL_MS };
  return value;
}

export async function isChatbotEnabled(): Promise<boolean> {
  return (await getPublicChatbotConfig()).enabled;
}
