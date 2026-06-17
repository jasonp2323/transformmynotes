import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAdminApiUserMock = vi.hoisted(() => vi.fn());
const getCurrentAiConfigMock = vi.hoisted(() => vi.fn());
const saveAiConfigMock = vi.hoisted(() => vi.fn());
const revertAiConfigMock = vi.hoisted(() => vi.fn());
const listAiConfigVersionsMock = vi.hoisted(() => vi.fn());
const bustAiConfigCacheMock = vi.hoisted(() => vi.fn());
const buildSecretDefaultsMock = vi.hoisted(() => vi.fn(() => ({
  baseSystemPrompt: 'DEFAULT BASE',
  promptOverrides: { flashcards: 'DEF FC' },
  modelId: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
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
  enabledMaterialTypes: {},
  generationEnabled: true,
  // Audit fields — must be stripped from the response
  version: 0,
  updatedBy: 'system',
  updatedAt: '',
})));

vi.mock('@/lib/require-admin', () => ({
  getAdminApiUser: getAdminApiUserMock,
}));

vi.mock('@/jobs/study-prompts', () => ({
  loadStudyPromptsIntoEnv: vi.fn(),
}));

// Keep the REAL validateAiConfigInput / AI_MODEL_ALLOWLIST / AI_PARAM_BOUNDS and
// the real error classes; stub only the DB functions + bustAiConfigCache.
vi.mock('@transformmynotes/core', async (importActual) => ({
  ...(await importActual<typeof import('@transformmynotes/core')>()),
  getCurrentAiConfig: getCurrentAiConfigMock,
  saveAiConfig: saveAiConfigMock,
  revertAiConfig: revertAiConfigMock,
  listAiConfigVersions: listAiConfigVersionsMock,
  bustAiConfigCache: bustAiConfigCacheMock,
  buildSecretDefaults: buildSecretDefaultsMock,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { GET, PUT } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN = { sub: 'admin-1', claims: {} };

const VALID_CONFIG = {
  modelId: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
  baseSystemPrompt: 'You are a helpful study assistant.',
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
  generationEnabled: true,
  promptOverrides: {},
  modelOverrides: {},
  enabledMaterialTypes: { flashcards: true, quiz: true, assignment: true, summary: true },
};

function jsonReq(body: unknown): Request {
  return new Request('http://localhost/api/admin/ai-config', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  getAdminApiUserMock.mockResolvedValue(ADMIN);
  getCurrentAiConfigMock.mockResolvedValue(null);
  saveAiConfigMock.mockResolvedValue({ version: 1 });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/admin/ai-config', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Forbidden');
  });

  it('returns config:null + allowlist + paramBounds + defaults when no config saved', async () => {
    getCurrentAiConfigMock.mockResolvedValueOnce(null);

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.config).toBeNull();
    expect(Array.isArray(body.allowlist)).toBe(true);
    expect((body.allowlist as string[]).length).toBeGreaterThan(0);
    expect(body.paramBounds).toBeTruthy();
    // defaults are populated from buildSecretDefaults() with audit fields stripped
    const defs = body.defaults as Record<string, unknown>;
    expect(defs.baseSystemPrompt).toBe('DEFAULT BASE');
    expect((defs.promptOverrides as Record<string, unknown>).flashcards).toBe('DEF FC');
    // Audit fields must NOT be present
    expect(defs.version).toBeUndefined();
    expect(defs.updatedBy).toBeUndefined();
    expect(defs.updatedAt).toBeUndefined();
  });

  it('returns the config object when present and includes defaults', async () => {
    getCurrentAiConfigMock.mockResolvedValueOnce(VALID_CONFIG);

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.config).toEqual(VALID_CONFIG);
    // defaults always present regardless of whether config is saved
    const defs = body.defaults as Record<string, unknown>;
    expect(defs.baseSystemPrompt).toBe('DEFAULT BASE');
    expect(defs.version).toBeUndefined();
  });

  it('returns 500 when getCurrentAiConfig throws', async () => {
    getCurrentAiConfigMock.mockRejectedValueOnce(new Error('DB error'));

    const res = await GET();
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

describe('PUT /api/admin/ai-config', () => {
  it('returns 403 when getAdminApiUser returns null', async () => {
    getAdminApiUserMock.mockResolvedValueOnce(null);

    const res = await PUT(jsonReq(VALID_CONFIG));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Forbidden');
    expect(saveAiConfigMock).not.toHaveBeenCalled();
  });

  it('returns 400 when modelId is not in the allowlist', async () => {
    const res = await PUT(jsonReq({ ...VALID_CONFIG, modelId: 'made-up-model' }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(saveAiConfigMock).not.toHaveBeenCalled();
  });

  it('returns 400 when maxTokens is out of range', async () => {
    const res = await PUT(jsonReq({ ...VALID_CONFIG, maxTokens: 9999 }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(saveAiConfigMock).not.toHaveBeenCalled();
  });

  it('saves a valid config and returns the new version', async () => {
    saveAiConfigMock.mockResolvedValueOnce({ version: 7 });

    const res = await PUT(jsonReq(VALID_CONFIG));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.version).toBe(7);
    expect(saveAiConfigMock).toHaveBeenCalledTimes(1);
    expect(saveAiConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: VALID_CONFIG.modelId }),
      ADMIN.sub,
    );
    expect(bustAiConfigCacheMock).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when saveAiConfig rejects with a version-conflict error', async () => {
    saveAiConfigMock.mockRejectedValueOnce(
      Object.assign(new Error('conflict'), { name: 'AiConfigVersionConflictError' }),
    );

    const res = await PUT(jsonReq(VALID_CONFIG));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(bustAiConfigCacheMock).not.toHaveBeenCalled();
  });

  it('returns 500 when saveAiConfig rejects with a generic error', async () => {
    saveAiConfigMock.mockRejectedValueOnce(new Error('DB down'));

    const res = await PUT(jsonReq(VALID_CONFIG));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });
});
