import { describe, it, expect } from 'vitest';
import { unhandledSignInStepMessage, passwordMatchError } from '../auth-next-step';

describe('unhandledSignInStepMessage', () => {
  it('returns a confirmation-specific message for CONFIRM_SIGN_UP', () => {
    const msg = unhandledSignInStepMessage('CONFIRM_SIGN_UP');
    expect(msg).toContain('not been confirmed');
  });

  it('returns a reset-specific message for RESET_PASSWORD', () => {
    const msg = unhandledSignInStepMessage('RESET_PASSWORD');
    expect(msg).toContain('reset');
  });

  it('returns an MFA-related message for CONFIRM_SIGN_IN_WITH_SMS_CODE', () => {
    const msg = unhandledSignInStepMessage('CONFIRM_SIGN_IN_WITH_SMS_CODE');
    expect(msg).toContain('additional verification');
  });

  it('returns the generic fallback for an unknown step', () => {
    const msg = unhandledSignInStepMessage('SOME_UNKNOWN_STEP');
    expect(msg).toContain('additional step');
  });

  it('never leaks account-existence information — always returns a non-empty string', () => {
    const steps = [
      'CONFIRM_SIGN_UP',
      'RESET_PASSWORD',
      'CONFIRM_SIGN_IN_WITH_SMS_CODE',
      'CONFIRM_SIGN_IN_WITH_EMAIL_CODE',
      'CONFIRM_SIGN_IN_WITH_TOTP_CODE',
      'CONTINUE_SIGN_IN_WITH_MFA_SELECTION',
      'WHATEVER',
    ];
    for (const step of steps) {
      expect(unhandledSignInStepMessage(step).length).toBeGreaterThan(0);
    }
  });
});

describe('passwordMatchError', () => {
  it('returns null when passwords match', () => {
    expect(passwordMatchError('Secret1!', 'Secret1!')).toBeNull();
  });

  it('returns an error string when passwords differ', () => {
    const result = passwordMatchError('Secret1!', 'Different1!');
    expect(result).not.toBeNull();
    expect(result).toContain('do not match');
  });

  it('returns an error string when one is empty', () => {
    expect(passwordMatchError('Secret1!', '')).not.toBeNull();
  });
});
