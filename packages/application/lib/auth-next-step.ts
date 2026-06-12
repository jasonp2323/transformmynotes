/**
 * Maps an unhandled Cognito signInStep to a user-facing message.
 * These steps only arise after a correct password, so it is safe to
 * acknowledge that the account needs an extra action.
 */
export function unhandledSignInStepMessage(step: string): string {
  switch (step) {
    case 'CONFIRM_SIGN_UP':
      return 'Your account has not been confirmed yet. Please check your email for a verification link, or use "Forgot password?" to reset your access.';
    case 'RESET_PASSWORD':
      return 'Your password must be reset before you can sign in. Please use "Forgot password?" to continue.';
    case 'CONFIRM_SIGN_IN_WITH_SMS_CODE':
    case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
    case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
    case 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION':
    case 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP':
    case 'CONTINUE_SIGN_IN_WITH_EMAIL_SETUP':
      return 'Your account requires an additional verification step that is not yet supported here. Please contact support for help signing in.';
    default:
      return 'Your account requires an additional step before you can sign in. Please contact support or use "Forgot password?" to continue.';
  }
}

/**
 * Returns an error message if the two password strings do not match,
 * or null if they match.
 */
export function passwordMatchError(password: string, confirm: string): string | null {
  if (password !== confirm) {
    return 'Passwords do not match.';
  }
  return null;
}
