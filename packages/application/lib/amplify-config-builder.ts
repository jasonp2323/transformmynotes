export interface AmplifyAuthEnv {
  userPoolId?: string;
  userPoolClientId?: string;
  /** Optional custom Cognito endpoint, e.g. http://127.0.0.1:9229 for cognito-local. */
  endpoint?: string;
}

export interface CognitoAuthConfig {
  Cognito: {
    userPoolId: string;
    userPoolClientId: string;
    userPoolEndpoint?: string;
  };
}

/**
 * Build the Amplify `Auth` resources config from env values. Returns `null`
 * when the required pool/client ids are absent (so callers can no-op instead
 * of throwing — e.g. during a build with no Cognito binding).
 */
export function buildAmplifyAuthConfig(env: AmplifyAuthEnv): CognitoAuthConfig | null {
  const { userPoolId, userPoolClientId, endpoint } = env;
  if (!userPoolId || !userPoolClientId) return null;
  return {
    Cognito: {
      userPoolId,
      userPoolClientId,
      ...(endpoint ? { userPoolEndpoint: endpoint } : {}),
    },
  };
}
