'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Select, Textarea, Toast } from '@/src/components/ui';
import {
  CUSTOM_INSTRUCTIONS_MAX,
  FOCUS_MAX,
  GOALS_MAX,
  LEVEL_MAX,
  PREFERRED_LANGUAGES,
} from '@/src/lib/ai-profile-schema';
import {
  buildPutBody,
  DEFAULT_FORM_STATE,
  isFormDirty,
  profileToForm,
  validateForm,
  type AiFormState,
} from './ai-profile-form';

const LANGUAGE_OPTIONS = PREFERRED_LANGUAGES.map((lang) => {
  const labels: Record<string, string> = {
    auto: "Auto (match the note's language)",
    'pt-BR': 'Brazilian Portuguese',
    bilingual: 'Bilingual',
  };
  return { value: lang, label: labels[lang] ?? lang };
});

export function AiProfileSection() {
  const [form, setForm] = useState<AiFormState>(DEFAULT_FORM_STATE);
  const [saved, setSaved] = useState<AiFormState>(DEFAULT_FORM_STATE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof AiFormState, string>>>({});

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/profile/ai');
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(data.error ?? 'Failed to load profile');
        return;
      }
      const data = (await res.json()) as { aiProfile?: Record<string, unknown> };
      const state = profileToForm(data.aiProfile ?? {});
      setForm(state);
      setSaved(state);
    } catch {
      setLoadError('Network error — could not load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const dirty = isFormDirty(form, saved);

  function setField<K extends keyof AiFormState>(key: K, value: AiFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear per-field error on edit
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function handleSave() {
    const fieldErrors = validateForm(form);
    if (fieldErrors) {
      setErrors(fieldErrors);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/profile/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPutBody(form)),
      });
      const data = (await res.json()) as { ok: boolean; aiProfile?: Record<string, unknown>; error?: string };
      if (!res.ok || !data.ok) {
        setShowErrorToast(data.error ?? 'Unknown error');
        return;
      }
      const newState = data.aiProfile ? profileToForm(data.aiProfile) : form;
      setForm(newState);
      setSaved(newState);
      setShowSuccessToast(true);
    } catch {
      setShowErrorToast('Network error — please try again');
    } finally {
      setSaving(false);
    }
  }

  // Card shell — inline styles matching AccountScreen's VoiceSelector section
  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '20px',
    borderRadius: 16,
    background: 'var(--surface-raised)',
    boxSizing: 'border-box',
    width: '100%',
  };

  const headingStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-strong)',
  };

  const descriptionStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 13,
    color: 'var(--text-muted)',
  };

  const formStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={cardStyle}>
      <div style={headingStyle}>AI environment</div>
      <div style={descriptionStyle}>
        Personalize how study material is generated for you. These preferences are added to every AI generation.
      </div>

      {loading && (
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)', paddingTop: 8 }}>
          Loading…
        </div>
      )}

      {!loading && loadError && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--danger, #dc2626)' }}>
            {loadError}
          </div>
          <Button variant="secondary" size="sm" onClick={() => void loadProfile()}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !loadError && (
        <div style={formStyle}>
          <Input
            label="Focus"
            value={form.focus}
            onChange={(e) => setField('focus', e.target.value)}
            maxLength={FOCUS_MAX}
            hint={`${form.focus.length} / ${FOCUS_MAX}`}
            error={errors.focus}
          />
          <Input
            label="Level"
            value={form.level}
            onChange={(e) => setField('level', e.target.value)}
            maxLength={LEVEL_MAX}
            hint={`${form.level.length} / ${LEVEL_MAX}`}
            error={errors.level}
          />
          <Textarea
            label="Goals"
            value={form.goals}
            onChange={(e) => setField('goals', e.target.value)}
            maxLength={GOALS_MAX}
            rows={3}
            hint={`${form.goals.length} / ${GOALS_MAX}`}
            error={errors.goals}
          />
          <Select
            label="Preferred language"
            value={form.preferredLanguage}
            options={LANGUAGE_OPTIONS}
            onChange={(e) => setField('preferredLanguage', e.target.value)}
          />
          <Textarea
            label="Custom instructions"
            value={form.customInstructions}
            onChange={(e) => setField('customInstructions', e.target.value)}
            maxLength={CUSTOM_INSTRUCTIONS_MAX}
            rows={4}
            hint={`${form.customInstructions.length} / ${CUSTOM_INSTRUCTIONS_MAX}`}
            error={errors.customInstructions}
          />
          <div>
            <Button
              variant="primary"
              size="sm"
              disabled={!dirty || saving}
              loading={saving}
              onClick={() => void handleSave()}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {showSuccessToast && (
        <Toast
          tone="success"
          title="Study profile saved"
          onClose={() => setShowSuccessToast(false)}
          duration={2500}
        />
      )}

      {showErrorToast && (
        <Toast
          tone="danger"
          title="Failed to save"
          onClose={() => setShowErrorToast(null)}
          duration={4000}
        >
          {showErrorToast}
        </Toast>
      )}
    </div>
  );
}

AiProfileSection.displayName = 'AiProfileSection';
