'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AdminShell } from '@/src/components/admin';
import {
  Button,
  Card,
  Dialog,
  Icon,
  Input,
  Select,
  Switch,
  Textarea,
  Toast,
} from '@/src/components/ui';
import { relativeTime } from '@/src/lib/library';
import type { AiConfig, MaterialType, PollyEngine } from '@transformmynotes/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StudyLanguage = 'auto' | 'pt-BR' | 'bilingual';

type AiConfigInput = Omit<AiConfig, 'version' | 'updatedBy' | 'updatedAt'>;

interface ApiConfigResponse {
  ok: boolean;
  config: AiConfig | null;
  defaults: AiConfigInput | null;
  allowlist: string[];
  paramBounds: Record<string, { min: number; max: number }>;
}

interface VersionEntry {
  version: number;
  updatedBy: string;
  updatedAt: string;
}

interface ToastState {
  tone: 'success' | 'neutral' | 'danger' | 'warning' | 'brand';
  icon?: React.ReactNode;
  title: string;
  body: string;
}

interface ValidationErrors {
  baseSystemPrompt?: string;
  maxTokens?: string;
  temperature?: string;
  topP?: string;
  perUserDailyGenerationCap?: string;
  maxNotesPerRun?: string;
  tokenBudget?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MATERIAL_TYPES: MaterialType[] = [
  'flashcards',
  'quiz',
  'assignment',
  'summary',
  'glossary',
  'study_guide',
];

const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  flashcards: 'Flashcards',
  quiz: 'Quiz',
  assignment: 'Assignment',
  summary: 'Summary',
  glossary: 'Glossary',
  study_guide: 'Study guide',
};

const LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'pt-BR', label: 'Portuguese (pt-BR)' },
  { value: 'bilingual', label: 'Bilingual' },
];

const POLLY_ENGINE_OPTIONS: { value: PollyEngine; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'neural', label: 'Neural' },
  { value: 'long-form', label: 'Long-form' },
  { value: 'generative', label: 'Generative' },
];

const SPEED_RATE_OPTIONS = [
  { value: 'x-slow', label: 'X-slow' },
  { value: 'slow', label: 'Slow' },
  { value: 'medium', label: 'Medium' },
  { value: 'fast', label: 'Fast' },
  { value: 'x-fast', label: 'X-fast' },
];

const DEFAULT_BLANK_CONFIG: AiConfigInput = {
  baseSystemPrompt: '',
  promptOverrides: {},
  modelId: '',
  modelOverrides: {},
  maxTokens: 4096,
  temperature: 0.5,
  topP: 0.9,
  languageDefault: 'auto' as StudyLanguage,
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
};

// ---------------------------------------------------------------------------
// Section heading component
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--text-subtle)',
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AiSettingsPage() {
  // ── Remote state ─────────────────────────────────────────────────────────
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [paramBounds, setParamBounds] = useState<
    Record<string, { min: number; max: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [defaults, setDefaults] = useState<AiConfigInput | null>(null);

  // ── Form state ───────────────────────────────────────────────────────────
  const [form, setForm] = useState<AiConfigInput>(DEFAULT_BLANK_CONFIG);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);

  // ── Collapsible sections ──────────────────────────────────────────────────
  const [promptOverridesOpen, setPromptOverridesOpen] = useState(false);
  const [modelOverridesOpen, setModelOverridesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ── Version history ───────────────────────────────────────────────────────
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [revertConfirm, setRevertConfirm] = useState<VersionEntry | null>(null);
  const [reverting, setReverting] = useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const showToast = useCallback((next: ToastState) => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setToast(next);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // ── Load config on mount ─────────────────────────────────────────────────

  const applyConfig = useCallback(
    (
      config: AiConfig | null,
      defs: AiConfigInput | null,
      list: string[],
      bounds: Record<string, { min: number; max: number }>,
    ) => {
      setAllowlist(list);
      setParamBounds(bounds);
      setDefaults(defs);
      if (config) {
        const { version: _v, updatedBy: _u, updatedAt: _a, ...rest } = config;
        setForm(rest);
      } else {
        // No saved config yet — prefill from server-side defaults so the admin
        // sees the preprogrammed prompts rather than empty fields.
        setForm({
          ...DEFAULT_BLANK_CONFIG,
          ...(defs ?? {}),
          modelId: defs?.modelId || list[0] || '',
        });
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/admin/ai-config')
      .then((r) => r.json())
      .then((data: ApiConfigResponse) => {
        if (cancelled) return;
        if (data.ok) {
          applyConfig(data.config, data.defaults ?? null, data.allowlist, data.paramBounds);
        } else {
          setFetchError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [applyConfig]);

  // ── Load versions ─────────────────────────────────────────────────────────

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const r = await fetch('/api/admin/ai-config/versions');
      const data = await r.json() as { ok: boolean; versions?: VersionEntry[] };
      if (data.ok && Array.isArray(data.versions)) {
        setVersions(data.versions);
      }
    } catch {
      // non-fatal
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  const handleHistoryToggle = useCallback(() => {
    setHistoryOpen((prev) => {
      if (!prev) {
        void loadVersions();
      }
      return !prev;
    });
  }, [loadVersions]);

  // ── Inline validation ─────────────────────────────────────────────────────

  function validateForm(): ValidationErrors {
    const errors: ValidationErrors = {};
    const bounds = paramBounds;

    if (!form.baseSystemPrompt || form.baseSystemPrompt.trim().length === 0) {
      errors.baseSystemPrompt = 'Base system prompt is required.';
    }

    const numericChecks: Array<[keyof ValidationErrors & keyof AiConfigInput, number]> = [
      ['maxTokens', form.maxTokens],
      ['temperature', form.temperature],
      ['topP', form.topP],
      ['perUserDailyGenerationCap', form.perUserDailyGenerationCap],
      ['maxNotesPerRun', form.maxNotesPerRun],
      ['tokenBudget', form.tokenBudget],
    ];

    for (const [field, value] of numericChecks) {
      const b = bounds[field];
      if (b) {
        if (!Number.isFinite(value) || value < b.min || value > b.max) {
          errors[field as keyof ValidationErrors] = `Must be between ${b.min} and ${b.max}.`;
        }
      }
    }

    return errors;
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    setSaving(true);

    try {
      const res = await fetch('/api/admin/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { ok: boolean; version?: number; error?: string };

      if (res.ok && data.ok) {
        showToast({
          tone: 'success',
          icon: <Icon name="check-circle-2" size={20} />,
          title: `AI config saved — version ${data.version ?? ''}`,
          body: 'Changes are now active.',
        });
        // Refresh version history if open
        if (historyOpen) {
          void loadVersions();
        }
      } else {
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: 'Save failed',
          body: data.error ?? `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      showToast({
        tone: 'danger',
        icon: <Icon name="x" size={20} />,
        title: 'Save failed',
        body: String(err),
      });
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, historyOpen, loadVersions, showToast]);

  // ── Revert ────────────────────────────────────────────────────────────────

  const doRevert = useCallback(async (entry: VersionEntry | null) => {
    if (!entry) return;
    setReverting(true);
    setRevertConfirm(null);

    try {
      const res = await fetch('/api/admin/ai-config/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: entry.version }),
      });
      const data = await res.json() as { ok: boolean; version?: number; error?: string };

      if (res.ok && data.ok) {
        // Re-fetch the full config to repopulate the form
        const configRes = await fetch('/api/admin/ai-config');
        const configData = await configRes.json() as ApiConfigResponse;
        if (configData.ok) {
          applyConfig(configData.config, configData.defaults ?? null, configData.allowlist, configData.paramBounds);
        }
        void loadVersions();
        showToast({
          tone: 'success',
          icon: <Icon name="rotate-ccw" size={20} />,
          title: `Restored to version ${data.version ?? ''}`,
          body: 'The form has been updated with the restored config.',
        });
      } else {
        showToast({
          tone: 'danger',
          icon: <Icon name="x" size={20} />,
          title: 'Restore failed',
          body: data.error ?? `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      showToast({
        tone: 'danger',
        icon: <Icon name="x" size={20} />,
        title: 'Restore failed',
        body: String(err),
      });
    } finally {
      setReverting(false);
    }
  }, [applyConfig, loadVersions, showToast]);

  // ── Form field helpers ────────────────────────────────────────────────────

  function setField<K extends keyof AiConfigInput>(key: K, value: AiConfigInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear validation error for this field
    if (key in validationErrors) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[key as keyof ValidationErrors];
        return next;
      });
    }
  }

  function setPromptOverride(type: MaterialType, value: string) {
    setForm((prev) => {
      const next = { ...prev.promptOverrides };
      if (value.trim() === '') {
        delete next[type];
      } else {
        next[type] = value;
      }
      return { ...prev, promptOverrides: next };
    });
  }

  function setModelOverride(type: MaterialType, value: string) {
    setForm((prev) => {
      const next = { ...prev.modelOverrides };
      if (value === '') {
        delete next[type];
      } else {
        next[type] = value;
      }
      return { ...prev, modelOverrides: next };
    });
  }

  function setMaterialTypeEnabled(type: MaterialType, enabled: boolean) {
    setForm((prev) => ({
      ...prev,
      enabledMaterialTypes: {
        ...prev.enabledMaterialTypes,
        [type]: enabled,
      },
    }));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const allInputsDisabled = saving || loading;

  const modelOptions = allowlist.map((m) => ({ value: m, label: m }));
  const modelOptionsWithDefault = [
    { value: '', label: '— use default —' },
    ...modelOptions,
  ];

  const boundsFor = (field: string) => paramBounds[field] ?? { min: 0, max: 99999 };

  return (
    <AdminShell title="AI Settings">
      {loading && (
        <Card padded style={{ textAlign: 'center', padding: '40px 24px' }}>
          <span style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>Loading…</span>
        </Card>
      )}

      {fetchError && !loading && (
        <Card padded style={{ textAlign: 'center', padding: '40px 24px' }}>
          <span style={{ fontSize: 14.5, color: 'var(--danger-500)' }}>
            Failed to load AI config. Please refresh to try again.
          </span>
        </Card>
      )}

      {!loading && !fetchError && (
        <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Global kill switch banner ─────────────────────────────────── */}
          {!form.generationEnabled && (
            <div
              role="alert"
              style={{
                background: 'var(--danger-50, #fff1f2)',
                border: '1px solid var(--danger-200, #fecdd3)',
                borderRadius: 10,
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--danger-700, #be123c)',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <Icon name="x" size={18} style={{ color: 'var(--danger-500)' }} />
              All AI generation is currently disabled globally.
            </div>
          )}

          {/* ── Feature flags ─────────────────────────────────────────────── */}
          <Card padded>
            <SectionHeading>Feature flags</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Switch
                label={
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    AI generation enabled (global)
                  </span>
                }
                checked={form.generationEnabled}
                onChange={(e) => setField('generationEnabled', e.target.checked)}
                disabled={allInputsDisabled}
              />
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px 16px',
                }}
              >
                {MATERIAL_TYPES.map((type) => (
                  <Switch
                    key={type}
                    label={MATERIAL_TYPE_LABELS[type]}
                    checked={form.enabledMaterialTypes[type] ?? false}
                    onChange={(e) => setMaterialTypeEnabled(type, e.target.checked)}
                    disabled={allInputsDisabled}
                  />
                ))}
              </div>
            </div>
          </Card>

          {/* ── System prompts ────────────────────────────────────────────── */}
          <Card padded>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <SectionHeading>System prompts</SectionHeading>
              <Button
                variant="ghost"
                size="sm"
                disabled={allInputsDisabled || !defaults}
                onClick={() => {
                  if (!defaults) return;
                  setForm((prev) => ({
                    ...prev,
                    baseSystemPrompt: defaults.baseSystemPrompt,
                    promptOverrides: { ...defaults.promptOverrides },
                  }));
                  setValidationErrors((prev) => {
                    const next = { ...prev };
                    delete next.baseSystemPrompt;
                    return next;
                  });
                  setPromptOverridesOpen(true);
                }}
                leftIcon={<Icon name="rotate-ccw" size={14} />}
              >
                Restore default prompts
              </Button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', marginTop: -8, marginBottom: 14 }}>
              These are the preprogrammed default prompts — edit as needed, or restore the originals.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Textarea
                label="Base system prompt"
                rows={6}
                value={form.baseSystemPrompt}
                onChange={(e) => setField('baseSystemPrompt', e.target.value)}
                disabled={allInputsDisabled}
                aria-describedby={validationErrors.baseSystemPrompt ? 'err-base-prompt' : undefined}
              />
              {validationErrors.baseSystemPrompt && (
                <span
                  id="err-base-prompt"
                  style={{ fontSize: 12.5, color: 'var(--danger-500)' }}
                  role="alert"
                >
                  {validationErrors.baseSystemPrompt}
                </span>
              )}

              {/* Collapsible per-type overrides */}
              <button
                type="button"
                onClick={() => setPromptOverridesOpen((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 500,
                }}
                aria-expanded={promptOverridesOpen}
              >
                <Icon
                  name="chevron-left"
                  size={14}
                  style={{
                    transform: promptOverridesOpen ? 'rotate(-90deg)' : 'rotate(180deg)',
                    transition: 'transform 0.15s',
                  }}
                />
                Per-type prompt overrides
              </button>

              {promptOverridesOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {MATERIAL_TYPES.map((type) => (
                    <Textarea
                      key={type}
                      label={`${MATERIAL_TYPE_LABELS[type]} override (leave empty to use base)`}
                      rows={3}
                      value={form.promptOverrides[type] ?? ''}
                      onChange={(e) => setPromptOverride(type, e.target.value)}
                      disabled={allInputsDisabled}
                    />
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* ── Model selection ───────────────────────────────────────────── */}
          <Card padded>
            <SectionHeading>Model selection</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Select
                label="Default model"
                value={form.modelId}
                options={modelOptions}
                onChange={(e) => setField('modelId', e.target.value)}
                disabled={allInputsDisabled}
              />

              <button
                type="button"
                onClick={() => setModelOverridesOpen((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 500,
                }}
                aria-expanded={modelOverridesOpen}
              >
                <Icon
                  name="chevron-left"
                  size={14}
                  style={{
                    transform: modelOverridesOpen ? 'rotate(-90deg)' : 'rotate(180deg)',
                    transition: 'transform 0.15s',
                  }}
                />
                Per-type model overrides
              </button>

              {modelOverridesOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {MATERIAL_TYPES.map((type) => (
                    <Select
                      key={type}
                      label={`${MATERIAL_TYPE_LABELS[type]} model override`}
                      value={form.modelOverrides[type] ?? ''}
                      options={modelOptionsWithDefault}
                      onChange={(e) => setModelOverride(type, e.target.value)}
                      disabled={allInputsDisabled}
                    />
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* ── Inference parameters ──────────────────────────────────────── */}
          <Card padded>
            <SectionHeading>Inference parameters</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* maxTokens */}
              <div>
                <Input
                  label={`Max tokens (${boundsFor('maxTokens').min}–${boundsFor('maxTokens').max})`}
                  type="number"
                  min={boundsFor('maxTokens').min}
                  max={boundsFor('maxTokens').max}
                  value={String(form.maxTokens)}
                  onChange={(e) => setField('maxTokens', Number(e.target.value))}
                  disabled={allInputsDisabled}
                  aria-describedby={validationErrors.maxTokens ? 'err-max-tokens' : undefined}
                />
                {validationErrors.maxTokens && (
                  <span
                    id="err-max-tokens"
                    style={{ fontSize: 12.5, color: 'var(--danger-500)', display: 'block', marginTop: 4 }}
                    role="alert"
                  >
                    {validationErrors.maxTokens}
                  </span>
                )}
              </div>

              {/* temperature */}
              <div>
                <label
                  htmlFor="range-temperature"
                  style={{ display: 'block', fontSize: 13.5, fontWeight: 500, marginBottom: 8, color: 'var(--text-strong)' }}
                >
                  Temperature: <strong>{form.temperature.toFixed(2)}</strong>
                </label>
                <input
                  id="range-temperature"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.temperature}
                  onChange={(e) => setField('temperature', Number(e.target.value))}
                  disabled={allInputsDisabled}
                  style={{ width: '100%', accentColor: 'var(--brand-strong)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 2 }}>
                  <span>0 (deterministic)</span>
                  <span>1 (creative)</span>
                </div>
                {validationErrors.temperature && (
                  <span style={{ fontSize: 12.5, color: 'var(--danger-500)', display: 'block', marginTop: 4 }} role="alert">
                    {validationErrors.temperature}
                  </span>
                )}
              </div>

              {/* topP */}
              <div>
                <label
                  htmlFor="range-top-p"
                  style={{ display: 'block', fontSize: 13.5, fontWeight: 500, marginBottom: 8, color: 'var(--text-strong)' }}
                >
                  Top P: <strong>{form.topP.toFixed(2)}</strong>
                </label>
                <input
                  id="range-top-p"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.topP}
                  onChange={(e) => setField('topP', Number(e.target.value))}
                  disabled={allInputsDisabled}
                  style={{ width: '100%', accentColor: 'var(--brand-strong)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 2 }}>
                  <span>0</span>
                  <span>1</span>
                </div>
                {validationErrors.topP && (
                  <span style={{ fontSize: 12.5, color: 'var(--danger-500)', display: 'block', marginTop: 4 }} role="alert">
                    {validationErrors.topP}
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* ── Language ──────────────────────────────────────────────────── */}
          <Card padded>
            <SectionHeading>Language</SectionHeading>
            <Select
              label="Default generation language"
              value={form.languageDefault}
              options={LANGUAGE_OPTIONS}
              onChange={(e) => setField('languageDefault', e.target.value as StudyLanguage)}
              disabled={allInputsDisabled}
            />
          </Card>

          {/* ── Guardrails ────────────────────────────────────────────────── */}
          <Card padded>
            <SectionHeading>Guardrails</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <Input
                  label={`Per-user daily generation cap (${boundsFor('perUserDailyGenerationCap').min}–${boundsFor('perUserDailyGenerationCap').max})`}
                  type="number"
                  min={boundsFor('perUserDailyGenerationCap').min}
                  max={boundsFor('perUserDailyGenerationCap').max}
                  value={String(form.perUserDailyGenerationCap)}
                  onChange={(e) => setField('perUserDailyGenerationCap', Number(e.target.value))}
                  disabled={allInputsDisabled}
                />
                {validationErrors.perUserDailyGenerationCap && (
                  <span style={{ fontSize: 12.5, color: 'var(--danger-500)', display: 'block', marginTop: 4 }} role="alert">
                    {validationErrors.perUserDailyGenerationCap}
                  </span>
                )}
              </div>

              <div>
                <Input
                  label={`Max notes per run (${boundsFor('maxNotesPerRun').min}–${boundsFor('maxNotesPerRun').max})`}
                  type="number"
                  min={boundsFor('maxNotesPerRun').min}
                  max={boundsFor('maxNotesPerRun').max}
                  value={String(form.maxNotesPerRun)}
                  onChange={(e) => setField('maxNotesPerRun', Number(e.target.value))}
                  disabled={allInputsDisabled}
                />
                {validationErrors.maxNotesPerRun && (
                  <span style={{ fontSize: 12.5, color: 'var(--danger-500)', display: 'block', marginTop: 4 }} role="alert">
                    {validationErrors.maxNotesPerRun}
                  </span>
                )}
              </div>

              <div>
                <Input
                  label={`Token budget per call (${boundsFor('tokenBudget').min}–${boundsFor('tokenBudget').max})`}
                  type="number"
                  min={boundsFor('tokenBudget').min}
                  max={boundsFor('tokenBudget').max}
                  value={String(form.tokenBudget)}
                  onChange={(e) => setField('tokenBudget', Number(e.target.value))}
                  disabled={allInputsDisabled}
                />
                {validationErrors.tokenBudget && (
                  <span style={{ fontSize: 12.5, color: 'var(--danger-500)', display: 'block', marginTop: 4 }} role="alert">
                    {validationErrors.tokenBudget}
                  </span>
                )}
              </div>
            </div>
          </Card>

          {/* ── Audio (Polly) ─────────────────────────────────────────────── */}
          <Card padded>
            <SectionHeading>Audio (Polly)</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input
                label="Polly voice ID"
                value={form.pollyVoiceId}
                onChange={(e) => setField('pollyVoiceId', e.target.value)}
                disabled={allInputsDisabled}
              />
              <Select
                label="Polly engine"
                value={form.pollyEngine}
                options={POLLY_ENGINE_OPTIONS}
                onChange={(e) => setField('pollyEngine', e.target.value as PollyEngine)}
                disabled={allInputsDisabled}
              />
              <Select
                label="Speech rate"
                value={form.speedRate}
                options={SPEED_RATE_OPTIONS}
                onChange={(e) => setField('speedRate', e.target.value)}
                disabled={allInputsDisabled}
              />
            </div>
          </Card>

          {/* ── Save button ───────────────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={allInputsDisabled}
              onClick={() => void handleSave()}
              leftIcon={<Icon name="check" size={17} />}
            >
              Save configuration
            </Button>
          </div>

          {/* ── Version history panel ─────────────────────────────────────── */}
          <Card padded={false}>
            <button
              type="button"
              onClick={handleHistoryToggle}
              aria-expanded={historyOpen}
              style={{
                background: 'none',
                border: 'none',
                width: '100%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 20px',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-strong)',
                borderRadius: historyOpen ? '10px 10px 0 0' : 10,
                textAlign: 'left',
              }}
            >
              <Icon
                name="chevron-left"
                size={15}
                style={{
                  transform: historyOpen ? 'rotate(-90deg)' : 'rotate(180deg)',
                  transition: 'transform 0.15s',
                  flexShrink: 0,
                }}
              />
              Version history
            </button>

            {historyOpen && (
              <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                {versionsLoading && (
                  <div style={{ padding: '18px 20px', fontSize: 13.5, color: 'var(--text-muted)' }}>
                    Loading versions…
                  </div>
                )}
                {!versionsLoading && versions.length === 0 && (
                  <div style={{ padding: '18px 20px', fontSize: 13.5, color: 'var(--text-muted)' }}>
                    No versions saved yet.
                  </div>
                )}
                {!versionsLoading && versions.length > 0 && (
                  <div>
                    {/* Header row */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '80px 1fr 1fr auto',
                        gap: 12,
                        padding: '10px 20px',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--text-subtle)',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span>Version</span>
                      <span>Saved</span>
                      <span>By</span>
                      <span />
                    </div>

                    {versions.map((v, idx) => (
                      <div
                        key={v.version}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '80px 1fr 1fr auto',
                          gap: 12,
                          padding: '12px 20px',
                          alignItems: 'center',
                          fontSize: 13.5,
                          borderBottom:
                            idx < versions.length - 1
                              ? '1px solid var(--border-subtle)'
                              : 'none',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-strong)',
                            fontWeight: 600,
                          }}
                        >
                          v{v.version}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {relativeTime(v.updatedAt)}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-subtle)',
                            fontSize: 12.5,
                          }}
                          title={v.updatedBy}
                        >
                          {v.updatedBy.slice(0, 8)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={reverting}
                          onClick={() => setRevertConfirm(v)}
                        >
                          Restore
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Revert confirmation dialog ─────────────────────────────────────── */}
      <Dialog
        open={!!revertConfirm}
        onClose={() => setRevertConfirm(null)}
        title={`Restore config to version ${revertConfirm?.version ?? ''}?`}
        description={
          revertConfirm
            ? `Restore the config saved by ${revertConfirm.updatedBy.slice(0, 8)} on ${new Date(revertConfirm.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}? This creates a new version pointing to the restored values.`
            : ''
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevertConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={reverting}
              onClick={() => void doRevert(revertConfirm)}
            >
              Confirm restore
            </Button>
          </>
        }
      />

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            right: 28,
            bottom: 28,
            width: 340,
            zIndex: 50,
          }}
        >
          <Toast
            tone={toast.tone}
            icon={toast.icon}
            title={toast.title}
            onClose={dismissToast}
            duration={4000}
          >
            {toast.body}
          </Toast>
        </div>
      )}
    </AdminShell>
  );
}
