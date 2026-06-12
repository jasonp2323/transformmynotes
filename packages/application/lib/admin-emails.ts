/**
 * Resolves the email addresses of all members of the Cognito `admin` group.
 *
 * Uses ListUsersInGroupCommand with pagination. Reads the user pool id from
 * NEXT_PUBLIC_COGNITO_USER_POOL_ID. Returns an empty array (best-effort) when
 * the env var is unset or the Cognito call fails, so notification callers can
 * treat this as non-blocking.
 */
import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

/**
 * Lists members of the Cognito `admin` group and returns their email addresses.
 * Returns an empty array when the pool id is unset or a Cognito error occurs.
 */
export async function listAdminEmails(): Promise<string[]> {
  const UserPoolId = process.env['NEXT_PUBLIC_COGNITO_USER_POOL_ID'];
  if (!UserPoolId) {
    console.error(
      '[listAdminEmails] NEXT_PUBLIC_COGNITO_USER_POOL_ID is not set — returning empty admin list',
    );
    return [];
  }

  const cognito = new CognitoIdentityProviderClient({});
  const emails: string[] = [];
  let nextToken: string | undefined;

  do {
    const response = await cognito.send(
      new ListUsersInGroupCommand({
        UserPoolId,
        GroupName: 'admin',
        NextToken: nextToken,
      }),
    );

    for (const user of response.Users ?? []) {
      const emailAttr = (user.Attributes ?? []).find((a) => a.Name === 'email');
      if (emailAttr?.Value) {
        emails.push(emailAttr.Value);
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return emails;
}
