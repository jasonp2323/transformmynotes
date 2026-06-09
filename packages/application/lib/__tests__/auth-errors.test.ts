import { describe, it, expect } from 'vitest';
import { authErrorMessage } from '../auth-errors';

describe('authErrorMessage', () => {
  it('returns generic message for NotAuthorizedException-shaped error', () => {
    const err = { name: 'NotAuthorizedException', message: 'Incorrect username or password.' };
    expect(authErrorMessage(err)).toBe('Incorrect email or password.');
  });

  it('returns generic message for UserNotFoundException-shaped error', () => {
    const err = { name: 'UserNotFoundException', message: 'User does not exist.' };
    expect(authErrorMessage(err)).toBe('Incorrect email or password.');
  });

  it('returns generic message for unknown error', () => {
    const err = new Error('Some unexpected network error');
    expect(authErrorMessage(err)).toBe('Incorrect email or password.');
  });
});
