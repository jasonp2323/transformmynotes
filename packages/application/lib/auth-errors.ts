/**
 * Returns a safe, generic error message for sign-in failures.
 * Never exposes whether the email exists (avoids user enumeration).
 */
export function authErrorMessage(_err: unknown): string {
  return 'Incorrect email or password.';
}
