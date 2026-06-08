import { describe, it, expect } from 'vitest';
import { buildAmplifyAuthConfig } from '../amplify-config-builder';

describe('buildAmplifyAuthConfig', () => {
  it('returns null when userPoolId is missing', () => {
    const result = buildAmplifyAuthConfig({
      userPoolClientId: 'client-id',
    });
    expect(result).toBeNull();
  });

  it('returns null when userPoolClientId is missing', () => {
    const result = buildAmplifyAuthConfig({
      userPoolId: 'us-east-1_abc123',
    });
    expect(result).toBeNull();
  });

  it('returns config with Cognito.userPoolId and userPoolClientId when endpoint is absent', () => {
    const result = buildAmplifyAuthConfig({
      userPoolId: 'us-east-1_abc123',
      userPoolClientId: 'client-id-456',
    });
    expect(result).not.toBeNull();
    expect(result!.Cognito.userPoolId).toBe('us-east-1_abc123');
    expect(result!.Cognito.userPoolClientId).toBe('client-id-456');
    expect(result!.Cognito).not.toHaveProperty('userPoolEndpoint');
  });

  it('includes userPoolEndpoint when endpoint is provided', () => {
    const result = buildAmplifyAuthConfig({
      userPoolId: 'us-east-1_abc123',
      userPoolClientId: 'client-id-456',
      endpoint: 'http://127.0.0.1:9229',
    });
    expect(result).not.toBeNull();
    expect(result!.Cognito.userPoolEndpoint).toBe('http://127.0.0.1:9229');
  });
});
