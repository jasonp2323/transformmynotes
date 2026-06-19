import { describe, it, expect } from 'vitest';
import {
  profileToForm,
  validateForm,
  buildPutBody,
  isFormDirty,
  DEFAULT_FORM_STATE,
  type AiFormState,
} from '../ai-profile-form';

describe('profileToForm', () => {
  it('maps all fields from a full profile', () => {
    const form = profileToForm({
      focus: 'Vocabulary',
      level: 'B2',
      goals: 'Read novels',
      preferredLanguage: 'pt-BR',
      customInstructions: 'Keep it simple',
    });
    expect(form.focus).toBe('Vocabulary');
    expect(form.level).toBe('B2');
    expect(form.goals).toBe('Read novels');
    expect(form.preferredLanguage).toBe('pt-BR');
    expect(form.customInstructions).toBe('Keep it simple');
  });

  it('defaults missing fields to empty strings and preferredLanguage to auto', () => {
    const form = profileToForm({});
    expect(form.focus).toBe('');
    expect(form.level).toBe('');
    expect(form.goals).toBe('');
    expect(form.preferredLanguage).toBe('auto');
    expect(form.customInstructions).toBe('');
  });
});

describe('validateForm', () => {
  it('returns null for a valid form', () => {
    expect(validateForm(DEFAULT_FORM_STATE)).toBeNull();
  });

  it('returns an error when focus exceeds cap', () => {
    const form: AiFormState = { ...DEFAULT_FORM_STATE, focus: 'a'.repeat(201) };
    const errors = validateForm(form);
    expect(errors).not.toBeNull();
    expect(errors?.focus).toMatch(/200/);
  });

  it('returns an error when customInstructions exceeds cap', () => {
    const form: AiFormState = {
      ...DEFAULT_FORM_STATE,
      customInstructions: 'x'.repeat(1001),
    };
    const errors = validateForm(form);
    expect(errors?.customInstructions).toMatch(/1000/);
  });

  it('reports multiple field errors at once', () => {
    const form: AiFormState = {
      ...DEFAULT_FORM_STATE,
      level: 'L'.repeat(101),
      goals: 'G'.repeat(501),
    };
    const errors = validateForm(form);
    expect(errors?.level).toBeDefined();
    expect(errors?.goals).toBeDefined();
    expect(errors?.focus).toBeUndefined();
  });
});

describe('buildPutBody', () => {
  it('omits empty-string fields', () => {
    const body = buildPutBody(DEFAULT_FORM_STATE);
    expect(body.focus).toBeUndefined();
    expect(body.level).toBeUndefined();
    expect(body.goals).toBeUndefined();
    expect(body.customInstructions).toBeUndefined();
    expect(body.preferredLanguage).toBe('auto');
  });

  it('includes non-empty fields, trimmed', () => {
    const form: AiFormState = {
      ...DEFAULT_FORM_STATE,
      focus: '  Grammar  ',
      level: 'B1',
    };
    const body = buildPutBody(form);
    expect(body.focus).toBe('Grammar');
    expect(body.level).toBe('B1');
    expect(body.goals).toBeUndefined();
  });
});

describe('isFormDirty', () => {
  it('returns false when form equals saved', () => {
    expect(isFormDirty(DEFAULT_FORM_STATE, DEFAULT_FORM_STATE)).toBe(false);
  });

  it('returns true when a field differs', () => {
    expect(
      isFormDirty({ ...DEFAULT_FORM_STATE, focus: 'changed' }, DEFAULT_FORM_STATE),
    ).toBe(true);
  });

  it('returns true when preferredLanguage changes', () => {
    expect(
      isFormDirty(
        { ...DEFAULT_FORM_STATE, preferredLanguage: 'pt-BR' },
        DEFAULT_FORM_STATE,
      ),
    ).toBe(true);
  });
});
