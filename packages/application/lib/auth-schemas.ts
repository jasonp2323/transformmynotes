/**
 * Zod request schemas for auth route handlers.
 *
 * Exported schemas validate incoming POST bodies; inferred types are used
 * inside route handlers. Parse failures always return a generic
 * `{ error: 'Invalid request.' }` 400 — never raw zod paths.
 */

import { z } from 'zod';

// ── Login ────────────────────────────────────────────────────────────────────

const loginPasswordStepSchema = z.object({
  step: z.literal('PASSWORD'),
  email: z.string().email(),
  password: z.string().min(1),
  turnstileToken: z.string().min(1),
});

const loginNewPasswordStepSchema = z.object({
  step: z.literal('NEW_PASSWORD'),
  email: z.string().email(),
  newPassword: z.string().min(1),
  session: z.string().min(1),
});

export const loginBodySchema = z.discriminatedUnion('step', [
  loginPasswordStepSchema,
  loginNewPasswordStepSchema,
]);

export type LoginBody = z.infer<typeof loginBodySchema>;
export type LoginPasswordStep = z.infer<typeof loginPasswordStepSchema>;
export type LoginNewPasswordStep = z.infer<typeof loginNewPasswordStepSchema>;

// ── Forgot password ───────────────────────────────────────────────────────────

export const forgotPasswordBodySchema = z.object({
  email: z.string().email(),
  turnstileToken: z.string().min(1),
});

export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;

// ── Reset password ────────────────────────────────────────────────────────────

export const resetPasswordBodySchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
  newPassword: z.string().min(1),
  turnstileToken: z.string().min(1),
});

export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

// ── Set session ───────────────────────────────────────────────────────────────

export const setSessionBodySchema = z.object({
  idToken: z.string().min(1),
});

export type SetSessionBody = z.infer<typeof setSessionBodySchema>;
