import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TableNames } from './client.js';
import { userDataKeys } from './keys.js';
import type { UserProfileItem } from '../auth/profile.js';

/** Fetch a user profile from the UserData table by Cognito sub. Returns null if absent. */
export async function getUserProfileBySub(sub: string): Promise<UserProfileItem | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TableNames.UserData, Key: userDataKeys.profile(sub) }),
  );
  return (res.Item as UserProfileItem | undefined) ?? null;
}
