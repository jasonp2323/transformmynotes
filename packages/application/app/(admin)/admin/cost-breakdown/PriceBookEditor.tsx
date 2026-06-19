'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Icon, Input, Toast } from '@/src/components/ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelPrice {
  inputPer1k: number;
  outputPer1k: number;
}

export interface PriceBook {
  models: Record<string, ModelPrice>;
  defaultModel: ModelPrice;
  s3PerGbMonth: number;
}

interface ToastState {
  tone: 'success' | 'neutral' | 'danger';
  icon: React.ReactNode;
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Section heading (matches ai-settings pattern)
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
// ModelPriceRow
// ---------------------------------------------------------------------------

interface ModelPriceRowProps {
  modelId: string;
  inputPer1k: number;
  outputPer1k: number;
  disabled?: boolean;
  onInputChange: (v: number) => void;
  onOutputChange: (v: number) => void;
  inputError?: string;
  outputError?: string;
}

function ModelPriceRow({
  modelId,
  inputPer1k,
  outputPer1k,
  disabled,
  onInputChange,
  onOutputChange,
  inputError,
  outputError,
}: ModelPriceRowProps) {
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-strong)',
          marginBottom: 8,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {modelId}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <Input
            label="$/1K input tokens"
            type="number"
            min={0}
            step={0.0001}
            value={String(inputPer1k)}
            onChange={(e) => onInputChange(Number(e.target.value))}
            disabled={disabled}
            error={inputError}
          />
        </div>
        <div>
          <Input
            label="$/1K output tokens"
            type="number"
            min={0}
            step={0.0001}
            value={String(outputPer1k)}
            onChange={(e) => onOutputChange(Number(e.target.value))}
            disabled={disabled}
            error={outputError}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PriceBookEditor
// ---------------------------------------------------------------------------

interface PriceBookEditorProps {
  initial: PriceBook;
  defaults: PriceBook;
  unpricedModels: string[];
  onSaved: () => void; // called after a successful PUT so parent can refetch
}

export function PriceBookEditor({
  initial,
  defaults,
  unpricedModels,
  onSaved,
}: PriceBookEditorProps) {
  const [form, setForm] = useState<PriceBook>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep form in sync if the parent re-fetches and provides new initial data
  useEffect(() => {
    setForm(initial);
  }, [initial]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = useCallback((next: ToastState) => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setToast(next);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  // Add an unpriced model to the form using the default rate
  const addUnpricedModel = (modelId: string) => {
    if (form.models[modelId] !== undefined) return;
    setForm((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        [modelId]: { ...prev.defaultModel },
      },
    }));
  };

  // Update a model's input price
  const setModelInput = (modelId: string, v: number) => {
    setForm((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        [modelId]: { ...(prev.models[modelId] ?? prev.defaultModel), inputPer1k: v },
      },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${modelId}-input`];
      return next;
    });
  };

  // Update a model's output price
  const setModelOutput = (modelId: string, v: number) => {
    setForm((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        [modelId]: { ...(prev.models[modelId] ?? prev.defaultModel), outputPer1k: v },
      },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`${modelId}-output`];
      return next;
    });
  };

  const setDefaultInput = (v: number) => {
    setForm((prev) => ({ ...prev, defaultModel: { ...prev.defaultModel, inputPer1k: v } }));
    setErrors((prev) => { const n = { ...prev }; delete n['default-input']; return n; });
  };

  const setDefaultOutput = (v: number) => {
    setForm((prev) => ({ ...prev, defaultModel: { ...prev.defaultModel, outputPer1k: v } }));
    setErrors((prev) => { const n = { ...prev }; delete n['default-output']; return n; });
  };

  const setS3Rate = (v: number) => {
    setForm((prev) => ({ ...prev, s3PerGbMonth: v }));
    setErrors((prev) => { const n = { ...prev }; delete n['s3']; return n; });
  };

  // Client-side validation
  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    const check = (key: string, v: number) => {
      if (!Number.isFinite(v) || v < 0) {
        errs[key] = 'Must be a non-negative number.';
      }
    };
    check('default-input', form.defaultModel.inputPer1k);
    check('default-output', form.defaultModel.outputPer1k);
    check('s3', form.s3PerGbMonth);
    for (const [id, mp] of Object.entries(form.models)) {
      check(`${id}-input`, mp.inputPer1k);
      check(`${id}-output`, mp.outputPer1k);
    }
    return errs;
  }

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const res = await fetch('/api/admin/cost/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (res.ok && data.ok) {
        showToast({
          tone: 'success',
          icon: <Icon name="check" size={20} />,
          title: 'Price book saved',
          body: 'Cost estimates will reflect the new rates.',
        });
        onSaved();
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
  };

  const handleResetToDefaults = () => {
    setForm(defaults);
    setErrors({});
  };

  const modelIds = Object.keys(form.models);
  // Models that are in unpricedModels but not yet in the form
  const missingModels = unpricedModels.filter((m) => !(m in form.models));

  return (
    <Card padded>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <SectionHeading>Price book</SectionHeading>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Icon name="rotate-ccw" size={14} />}
          onClick={handleResetToDefaults}
          disabled={saving}
        >
          Reset to defaults
        </Button>
      </div>

      <p
        style={{
          fontSize: 12.5,
          color: 'var(--text-subtle)',
          marginTop: -8,
          marginBottom: 18,
        }}
      >
        Edit the per-model token rates and S3 storage rate used to estimate costs.
        Changes take effect immediately after saving.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Default model rate */}
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-subtle)',
              marginBottom: 10,
            }}
          >
            Default model rate (fallback for unlisted models)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="$/1K input tokens"
              type="number"
              min={0}
              step={0.0001}
              value={String(form.defaultModel.inputPer1k)}
              onChange={(e) => setDefaultInput(Number(e.target.value))}
              disabled={saving}
              error={errors['default-input']}
            />
            <Input
              label="$/1K output tokens"
              type="number"
              min={0}
              step={0.0001}
              value={String(form.defaultModel.outputPer1k)}
              onChange={(e) => setDefaultOutput(Number(e.target.value))}
              disabled={saving}
              error={errors['default-output']}
            />
          </div>
        </div>

        {/* S3 rate */}
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-subtle)',
              marginBottom: 10,
            }}
          >
            S3 storage rate
          </div>
          <Input
            label="$/GB-month"
            type="number"
            min={0}
            step={0.0001}
            value={String(form.s3PerGbMonth)}
            onChange={(e) => setS3Rate(Number(e.target.value))}
            disabled={saving}
            error={errors['s3']}
          />
        </div>

        {/* Per-model rates */}
        {modelIds.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-subtle)',
                marginBottom: 10,
              }}
            >
              Per-model rates
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {modelIds.map((id) => (
                <ModelPriceRow
                  key={id}
                  modelId={id}
                  inputPer1k={form.models[id]?.inputPer1k ?? 0}
                  outputPer1k={form.models[id]?.outputPer1k ?? 0}
                  disabled={saving}
                  onInputChange={(v) => setModelInput(id, v)}
                  onOutputChange={(v) => setModelOutput(id, v)}
                  inputError={errors[`${id}-input`]}
                  outputError={errors[`${id}-output`]}
                />
              ))}
            </div>
          </div>
        )}

        {/* Unpriced models — add price entry */}
        {missingModels.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-subtle)',
                marginBottom: 10,
              }}
            >
              Unpriced models — click to add a price entry
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {missingModels.map((m) => (
                <Button
                  key={m}
                  variant="soft"
                  size="sm"
                  leftIcon={<Icon name="dollar-sign" size={13} />}
                  onClick={() => addUnpricedModel(m)}
                  disabled={saving}
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Save button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            size="md"
            loading={saving}
            onClick={() => void handleSave()}
            leftIcon={<Icon name="check" size={17} />}
          >
            Save price book
          </Button>
        </div>
      </div>

      {/* Toast */}
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
    </Card>
  );
}
