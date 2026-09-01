import {
  FOCUS_MAX,
  LEVEL_MAX,
  GOALS_MAX,
  CUSTOM_INSTRUCTIONS_MAX,
} from '@/src/lib/ai-profile-schema';

export interface AiFormState {
  focus: string;
  level: string;
  goals: string;
  preferredLanguage: string;
  customInstructions: string;
}

export const DEFAULT_FORM_STATE: AiFormState = {
  focus: '',
  level: '',
  goals: '',
  preferredLanguage: 'auto',
  customInstructions: '',
};

/** Returns an AiFormState populated from a raw API aiProfile response. Missing fields default to '' / 'auto'. */
export function profileToForm(aiProfile: Record<string, unknown>): AiFormState {
  return {
    focus: typeof aiProfile.focus === 'string' ? aiProfile.focus : '',
    level: typeof aiProfile.level === 'string' ? aiProfile.level : '',
    goals: typeof aiProfile.goals === 'string' ? aiProfile.goals : '',
    preferredLanguage:
      typeof aiProfile.preferredLanguage === 'string'
        ? aiProfile.preferredLanguage
        : 'auto',
    customInstructions:
      typeof aiProfile.customInstructions === 'string'
        ? aiProfile.customInstructions
        : '',
  };
}

/**
 * Validates form state and returns per-field errors.
 * Returns null if valid, or a Record<fieldName, errorMessage> if any field exceeds its cap.
 */
export function validateForm(
  form: AiFormState,
): Partial<Record<keyof AiFormState, string>> | null {
  const errors: Partial<Record<keyof AiFormState, string>> = {};
  if (form.focus.length > FOCUS_MAX) errors.focus = `Max ${FOCUS_MAX} characters`;
  if (form.level.length > LEVEL_MAX) errors.level = `Max ${LEVEL_MAX} characters`;
  if (form.goals.length > GOALS_MAX) errors.goals = `Max ${GOALS_MAX} characters`;
  if (form.customInstructions.length > CUSTOM_INSTRUCTIONS_MAX)
    errors.customInstructions = `Max ${CUSTOM_INSTRUCTIONS_MAX} characters`;
  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Builds the PUT body for /api/profile/ai.
 * Omits empty-string fields (sends undefined rather than ""), so an empty input clears rather than stores "".
 * Trims strings.
 */
export function buildPutBody(
  form: AiFormState,
): Record<string, string | undefined> {
  const body: Record<string, string | undefined> = {};
  const trimmed = {
    focus: form.focus.trim(),
    level: form.level.trim(),
    goals: form.goals.trim(),
    customInstructions: form.customInstructions.trim(),
  };
  if (trimmed.focus) body.focus = trimmed.focus;
  if (trimmed.level) body.level = trimmed.level;
  if (trimmed.goals) body.goals = trimmed.goals;
  if (trimmed.customInstructions) body.customInstructions = trimmed.customInstructions;
  // Always include preferredLanguage (it has a default)
  body.preferredLanguage = form.preferredLanguage;
  return body;
}

/**
 * Returns true if the current form state differs from the saved baseline
 * (i.e. the user has made unsaved changes).
 */
export function isFormDirty(
  form: AiFormState,
  saved: AiFormState,
): boolean {
  return (
    form.focus !== saved.focus ||
    form.level !== saved.level ||
    form.goals !== saved.goals ||
    form.preferredLanguage !== saved.preferredLanguage ||
    form.customInstructions !== saved.customInstructions
  );
}
