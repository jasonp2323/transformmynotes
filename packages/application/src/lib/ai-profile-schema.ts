import { z } from 'zod';

/** Length caps for the AI study profile free-text fields (M24). */
export const FOCUS_MAX = 200;
export const LEVEL_MAX = 100;
export const GOALS_MAX = 500;
export const CUSTOM_INSTRUCTIONS_MAX = 1000;

/**
 * Validates a PUT to the AI study profile. All fields optional; free-text fields are
 * trimmed and length-capped; preferredLanguage is restricted to the allowed values.
 */
export const aiProfileUpdateSchema = z.object({
  focus: z.string().trim().max(FOCUS_MAX).optional(),
  level: z.string().trim().max(LEVEL_MAX).optional(),
  goals: z.string().trim().max(GOALS_MAX).optional(),
  customInstructions: z.string().trim().max(CUSTOM_INSTRUCTIONS_MAX).optional(),
  preferredLanguage: z.enum(['auto', 'pt-BR', 'bilingual']).optional(),
});

export type AiProfileUpdateInput = z.infer<typeof aiProfileUpdateSchema>;
