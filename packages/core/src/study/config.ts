import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from '../db/client.js';
import { aiConfigKeys } from '../db/keys.js';
import type { StudyMaterialType, StudyLanguage } from './types.js';

/** The four kinds of study material the generation engine can produce. */
export type MaterialType = StudyMaterialType;

/** AWS Polly synthesis engine options. */
export type PollyEngine = 'standard' | 'neural' | 'long-form' | 'generative';

/**
 * Runtime-configurable AI generation config (M19). The live values are stored
 * in the `CONFIG#AI` / `CURRENT` DynamoDB item and deep-merged over the
 * secret/env defaults from `buildSecretDefaults()`.
 *
 * DEVIATION from the M19 spec: `languageDefault` is typed as `StudyLanguage`
 * (`'auto' | 'pt-BR' | 'bilingual'`) rather than the spec's
 * `'pt-BR' | 'bilingual' | 'en'`. The generation engine (`generate.ts`) only
 * handles those three language directives — `'en'` is unsupported and `'auto'`
 * is the current default — so the type is aligned to what the engine accepts.
 */
export interface AiConfig {
  // ── Prompts ─────────────────────────────────────────────────────────
  /** Base system prompt used for all material types unless overridden. */
  baseSystemPrompt: string;
  /** Per-material-type prompt; if absent the base prompt is used. */
  promptOverrides: Partial<Record<MaterialType, string>>;

  // ── Model selection ─────────────────────────────────────────────────
  /** Default Bedrock model id (must be in AI_MODEL_ALLOWLIST). */
  modelId: string;
  /** Per-material-type model override; must also be in AI_MODEL_ALLOWLIST. */
  modelOverrides: Partial<Record<MaterialType, string>>;

  // ── Inference parameters ─────────────────────────────────────────────
  maxTokens: number; // 256–8192
  temperature: number; // 0.0–1.0
  topP: number; // 0.0–1.0

  // ── Language ─────────────────────────────────────────────────────────
  /**
   * Default generation language / locale. See the DEVIATION note on the
   * interface: `StudyLanguage` rather than the spec's `'pt-BR'|'bilingual'|'en'`.
   */
  languageDefault: StudyLanguage;

  // ── Guardrails ───────────────────────────────────────────────────────
  /** Max AI generation requests per user per UTC day. */
  perUserDailyGenerationCap: number; // 1–500
  /** Max notes processed in a single batch run. */
  maxNotesPerRun: number; // 1–100
  /** Approximate input token budget per call. */
  tokenBudget: number; // 256–32768

  // ── Audio (Polly) ────────────────────────────────────────────────────
  pollyVoiceId: string; // e.g. "Camila", "Vitoria", "Joanna"
  pollyEngine: PollyEngine;
  speedRate: string; // SSML rate: "slow"|"medium"|"fast"|"x-slow"|"x-fast"|"100%"

  // ── Feature flags ────────────────────────────────────────────────────
  /** Per-material-type generation toggle. */
  enabledMaterialTypes: Partial<Record<MaterialType, boolean>>;
  /** Global kill switch — when false, ALL AI generation is blocked. */
  generationEnabled: boolean;

  // ── Audit (set by the API, not editable by the form) ─────────────────
  version: number; // auto-incremented integer
  updatedBy: string; // Cognito sub of the admin who saved
  updatedAt: string; // ISO-8601
}

/**
 * Allowlist of Bedrock model ids accepted by the admin AI-config form/API.
 *
 * NOTE on inference-profile prefixes: the live `BEDROCK_MODEL_ID` secret is a
 * cross-region inference profile id (e.g.
 * `us.anthropic.claude-3-5-sonnet-20241022-v2:0`) — the bare foundation-model
 * id is `anthropic.claude-3-5-sonnet-20241022-v2:0`. A config can legitimately
 * carry either form, so BOTH the bare and the `us.`-prefixed variants are
 * allowlisted for the models actually deployed.
 */
export const AI_MODEL_ALLOWLIST: readonly string[] = [
  // Claude 3.5 Sonnet v2 — bare foundation-model id + us. inference profile.
  'anthropic.claude-3-5-sonnet-20241022-v2:0',
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  // Claude 3 Haiku — bare + us. inference profile.
  'anthropic.claude-3-haiku-20240307-v1:0',
  'us.anthropic.claude-3-haiku-20240307-v1:0',
  // Claude 3 Sonnet (legacy).
  'anthropic.claude-3-sonnet-20240229-v1:0',
  // add as new models are vetted
] as const;

/**
 * Per-material-type output token cap defaults (M13). No longer used by
 * `generate.ts` as of M19.2.2 — the single `AiConfig.maxTokens` runtime value
 * from `resolveAiConfig()` is used instead. Exported for backward-compatibility.
 */
export const MAX_TOKENS_BY_TYPE: Record<StudyMaterialType, number> = {
  flashcards: 4096,
  quiz: 4096,
  assignment: 2048,
  summary: 1024,
  glossary: 2048,
  study_guide: 4096,
};

/**
 * Reads an optional env var, returning `undefined` when unset/empty so callers
 * can omit a key rather than store an empty string.
 */
function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/**
 * Builds a complete `AiConfig` from env (SST secret bindings) + hardcoded
 * fallbacks. `modelId` and `baseSystemPrompt` have NO string fallback — they
 * resolve to '' when unset and `validateRequired()` fails loudly on them.
 * Absent per-type prompt overrides are omitted (not set to '') so consumers
 * treat them as "no override".
 */
export function buildSecretDefaults(): AiConfig {
  const promptOverrides: Partial<Record<MaterialType, string>> = {};
  const flashcards = optionalEnv('SST_RESOURCE_STUDY_FLASHCARDS_PROMPT_value');
  const quiz = optionalEnv('SST_RESOURCE_STUDY_QUIZ_PROMPT_value');
  const assignment = optionalEnv('SST_RESOURCE_STUDY_ASSIGNMENT_PROMPT_value');
  const summary = optionalEnv('SST_RESOURCE_STUDY_SUMMARY_PROMPT_value');
  const glossary = optionalEnv('SST_RESOURCE_STUDY_GLOSSARY_PROMPT_value');
  const study_guide = optionalEnv('SST_RESOURCE_STUDY_GUIDE_PROMPT_value');
  if (flashcards !== undefined) promptOverrides.flashcards = flashcards;
  if (quiz !== undefined) promptOverrides.quiz = quiz;
  if (assignment !== undefined) promptOverrides.assignment = assignment;
  if (summary !== undefined) promptOverrides.summary = summary;
  if (glossary !== undefined) promptOverrides.glossary = glossary;
  if (study_guide !== undefined) promptOverrides.study_guide = study_guide;

  return {
    baseSystemPrompt: process.env.SST_RESOURCE_STUDY_SYSTEM_PROMPT_value ?? '',
    promptOverrides,
    modelId: process.env.SST_RESOURCE_BEDROCK_MODEL_ID_value ?? '',
    modelOverrides: {},
    maxTokens: 4096,
    temperature: 0.5,
    topP: 0.9,
    languageDefault: 'auto',
    perUserDailyGenerationCap: 100,
    maxNotesPerRun: 25,
    tokenBudget: 8192,
    pollyVoiceId: 'Camila',
    pollyEngine: 'neural',
    speedRate: 'medium',
    enabledMaterialTypes: {
      flashcards: true,
      quiz: true,
      assignment: true,
      summary: true,
      glossary: true,
      study_guide: true,
    },
    generationEnabled: true,
    // Audit fields — overwritten by DB values when a CURRENT item is present.
    version: 0,
    updatedBy: 'system',
    updatedAt: '',
  };
}

/**
 * Deep-merges a partial DB override over the defaults. Top-level scalars: a
 * defined override wins, `undefined` is ignored (never blows away a default).
 * The three record fields (`promptOverrides`, `modelOverrides`,
 * `enabledMaterialTypes`) are merged per-key so a DB override of one type does
 * not drop the others.
 */
export function deepMergeAiConfig(
  defaults: AiConfig,
  override: Partial<AiConfig>,
): AiConfig {
  const merged: AiConfig = { ...defaults };

  for (const [key, value] of Object.entries(override) as [
    keyof AiConfig,
    AiConfig[keyof AiConfig] | undefined,
  ][]) {
    if (value === undefined) continue;
    if (
      key === 'promptOverrides' ||
      key === 'modelOverrides' ||
      key === 'enabledMaterialTypes'
    ) {
      continue; // handled below with per-key merge
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (merged as any)[key] = value;
  }

  merged.promptOverrides = { ...defaults.promptOverrides, ...override.promptOverrides };
  merged.modelOverrides = { ...defaults.modelOverrides, ...override.modelOverrides };
  merged.enabledMaterialTypes = {
    ...defaults.enabledMaterialTypes,
    ...override.enabledMaterialTypes,
  };

  return merged;
}

/**
 * Fail-loud guard for the two fields that have no safe fallback. All other
 * fields are guaranteed populated by `buildSecretDefaults()`.
 */
export function validateRequired(config: AiConfig): void {
  if (!config.baseSystemPrompt || config.baseSystemPrompt.trim().length === 0) {
    throw new Error(
      'resolveAiConfig: baseSystemPrompt is empty — set the STUDY_SYSTEM_PROMPT ' +
        'secret (SST_RESOURCE_STUDY_SYSTEM_PROMPT_value) or a CONFIG#AI CURRENT item.',
    );
  }
  if (!config.modelId || config.modelId.trim().length === 0) {
    throw new Error(
      'resolveAiConfig: modelId is empty — set the BEDROCK_MODEL_ID secret ' +
        '(SST_RESOURCE_BEDROCK_MODEL_ID_value) or a CONFIG#AI CURRENT item.',
    );
  }
}

// Module-level cache. This variable is per-Lambda-instance: after a config
// write, concurrent instances may each serve a slightly stale config for up to
// CACHE_TTL_MS. That staleness is acceptable for a settings change (not a
// transactional operation); the writing instance calls bustAiConfigCache() so
// it sees the new value immediately.
let _cached: { config: AiConfig; expiresAt: number } | null = null;
const CACHE_TTL_MS = 45_000; // 45 s — safe for Lambda concurrency.

/**
 * Resolves the active `AiConfig`: reads the `CONFIG#AI` / `CURRENT` item from
 * the UserData table, deep-merges it over the secret/env defaults, validates
 * the required fields, caches the result, and returns it. Never returns an
 * incomplete config (throws via `validateRequired` instead).
 */
export async function resolveAiConfig(): Promise<AiConfig> {
  if (_cached && Date.now() < _cached.expiresAt) return _cached.config;

  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TableNames.UserData,
      Key: aiConfigKeys.current(),
    }),
  );
  const dbConfig = Item as Partial<AiConfig> | undefined;

  const defaults = buildSecretDefaults();
  const merged = deepMergeAiConfig(defaults, dbConfig ?? {});

  validateRequired(merged);
  _cached = { config: merged, expiresAt: Date.now() + CACHE_TTL_MS };
  return merged;
}

/**
 * Call this after a successful PUT so the next request sees the new config
 * within the same Lambda instance without waiting for TTL expiry.
 */
export function bustAiConfigCache(): void {
  _cached = null;
}

// ── A1: Validation helpers (M19.1.2) ────────────────────────────────────────

export const AI_PARAM_BOUNDS = {
  maxTokens: { min: 256, max: 8192 },
  temperature: { min: 0, max: 1 },
  topP: { min: 0, max: 1 },
  perUserDailyGenerationCap: { min: 1, max: 500 },
  maxNotesPerRun: { min: 1, max: 100 },
  tokenBudget: { min: 256, max: 32768 },
} as const;

export type AiConfigInput = Omit<AiConfig, 'version' | 'updatedBy' | 'updatedAt'>;

/**
 * Validates raw `unknown` input for the AI config admin API. Pure, fail-closed,
 * no I/O. Returns `{ ok: true, value }` on success (audit fields stripped) or
 * `{ ok: false, error }` on the first validation failure.
 */
export function validateAiConfigInput(
  input: unknown,
): { ok: true; value: AiConfigInput } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const obj = input as Record<string, unknown>;

  if (typeof obj.baseSystemPrompt !== 'string' || obj.baseSystemPrompt.trim().length === 0) {
    return { ok: false, error: 'baseSystemPrompt must be a non-empty string.' };
  }

  if (typeof obj.modelId !== 'string' || !AI_MODEL_ALLOWLIST.includes(obj.modelId)) {
    return { ok: false, error: 'modelId is not in the allowlist.' };
  }

  if (obj.modelOverrides !== undefined) {
    if (
      typeof obj.modelOverrides !== 'object' ||
      obj.modelOverrides === null ||
      Array.isArray(obj.modelOverrides)
    ) {
      return { ok: false, error: 'modelOverrides contains a model not in the allowlist.' };
    }
    for (const v of Object.values(obj.modelOverrides as Record<string, unknown>)) {
      if (typeof v !== 'string' || !AI_MODEL_ALLOWLIST.includes(v)) {
        return { ok: false, error: 'modelOverrides contains a model not in the allowlist.' };
      }
    }
  }

  const numericFields = [
    'maxTokens',
    'temperature',
    'topP',
    'perUserDailyGenerationCap',
    'maxNotesPerRun',
    'tokenBudget',
  ] as const;
  for (const field of numericFields) {
    const value = obj[field];
    const bounds = AI_PARAM_BOUNDS[field];
    if (
      !Number.isFinite(value) ||
      (value as number) < bounds.min ||
      (value as number) > bounds.max
    ) {
      return {
        ok: false,
        error: `${field} must be a number between ${bounds.min} and ${bounds.max}.`,
      };
    }
  }

  const validLanguages: StudyLanguage[] = ['auto', 'pt-BR', 'bilingual'];
  if (!validLanguages.includes(obj.languageDefault as StudyLanguage)) {
    return { ok: false, error: 'languageDefault must be one of auto, pt-BR, bilingual.' };
  }

  const validEngines: PollyEngine[] = ['standard', 'neural', 'long-form', 'generative'];
  if (!validEngines.includes(obj.pollyEngine as PollyEngine)) {
    return { ok: false, error: 'pollyEngine must be one of standard, neural, long-form, generative.' };
  }

  if (typeof obj.pollyVoiceId !== 'string' || obj.pollyVoiceId.trim().length === 0) {
    return { ok: false, error: 'pollyVoiceId must be a non-empty string.' };
  }

  if (typeof obj.speedRate !== 'string' || obj.speedRate.trim().length === 0) {
    return { ok: false, error: 'speedRate must be a non-empty string.' };
  }

  if (typeof obj.generationEnabled !== 'boolean') {
    return { ok: false, error: 'generationEnabled must be a boolean.' };
  }

  if (obj.enabledMaterialTypes !== undefined) {
    if (
      typeof obj.enabledMaterialTypes !== 'object' ||
      obj.enabledMaterialTypes === null ||
      Array.isArray(obj.enabledMaterialTypes)
    ) {
      return { ok: false, error: 'enabledMaterialTypes must be an object of booleans.' };
    }
    const validMaterialTypes: MaterialType[] = ['flashcards', 'quiz', 'assignment', 'summary', 'glossary', 'study_guide'];
    for (const [k, v] of Object.entries(obj.enabledMaterialTypes as Record<string, unknown>)) {
      if (!validMaterialTypes.includes(k as MaterialType) || typeof v !== 'boolean') {
        return { ok: false, error: 'enabledMaterialTypes must be an object of booleans.' };
      }
    }
  }

  if (obj.promptOverrides !== undefined) {
    if (
      typeof obj.promptOverrides !== 'object' ||
      obj.promptOverrides === null ||
      Array.isArray(obj.promptOverrides)
    ) {
      return { ok: false, error: 'promptOverrides must be an object of strings.' };
    }
    for (const v of Object.values(obj.promptOverrides as Record<string, unknown>)) {
      if (typeof v !== 'string') {
        return { ok: false, error: 'promptOverrides must be an object of strings.' };
      }
    }
  }

  const value: AiConfigInput = {
    baseSystemPrompt: obj.baseSystemPrompt as string,
    promptOverrides: (obj.promptOverrides as Partial<Record<MaterialType, string>> | undefined) ?? {},
    modelId: obj.modelId as string,
    modelOverrides: (obj.modelOverrides as Partial<Record<MaterialType, string>> | undefined) ?? {},
    maxTokens: obj.maxTokens as number,
    temperature: obj.temperature as number,
    topP: obj.topP as number,
    languageDefault: obj.languageDefault as StudyLanguage,
    perUserDailyGenerationCap: obj.perUserDailyGenerationCap as number,
    maxNotesPerRun: obj.maxNotesPerRun as number,
    tokenBudget: obj.tokenBudget as number,
    pollyVoiceId: obj.pollyVoiceId as string,
    pollyEngine: obj.pollyEngine as PollyEngine,
    speedRate: obj.speedRate as string,
    enabledMaterialTypes: (obj.enabledMaterialTypes as Partial<Record<MaterialType, boolean>> | undefined) ?? {},
    generationEnabled: obj.generationEnabled as boolean,
  };

  return { ok: true, value };
}
