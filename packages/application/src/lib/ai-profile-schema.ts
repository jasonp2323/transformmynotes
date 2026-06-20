import { z } from 'zod';

/** Length caps for the AI study profile free-text fields (M24). */
export const FOCUS_MAX = 200;
export const LEVEL_MAX = 100;
export const GOALS_MAX = 500;
export const CUSTOM_INSTRUCTIONS_MAX = 1000;

/**
 * Allowed values for the preferred output language. Mirrors `PreferredLanguage` in
 * `@transformmynotes/core`, redeclared here so client components can import the runtime
 * value without pulling the core barrel (and its `node:`-builtin server modules) into the
 * browser bundle — the core barrel is safe to import only as `import type`.
 */
export const PREFERRED_LANGUAGES = ['auto', 'pt-BR', 'bilingual'] as const;
export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number];

/**
 * Validates a PUT to the AI study profile. All fields optional; free-text fields are
 * trimmed and length-capped; preferredLanguage is restricted to the allowed values.
 */
export const aiProfileUpdateSchema = z.object({
  focus: z.string().trim().max(FOCUS_MAX).optional(),
  level: z.string().trim().max(LEVEL_MAX).optional(),
  goals: z.string().trim().max(GOALS_MAX).optional(),
  customInstructions: z.string().trim().max(CUSTOM_INSTRUCTIONS_MAX).optional(),
  preferredLanguage: z.enum(PREFERRED_LANGUAGES).optional(),
});

export type AiProfileUpdateInput = z.infer<typeof aiProfileUpdateSchema>;
