/**
 * Cognito Post-Confirmation trigger handler (M2).
 *
 * **M2 behavior:** The M3 Invites table does not exist yet. When no invite
 * code is present, or the Invites table env var is not set, all newly confirmed
 * users are created with `status: 'pending'` and must be manually activated.
 * When a valid invite code IS supplied (and the Invites table env var is set),
 * the user is activated immediately (`status: 'active'`) and added to the
 * Cognito `member` group.
 *
 * **Never-throw contract:** This handler must NEVER throw. Cognito will block
 * the user's confirmation if the trigger Lambda throws. Any error is caught,
 * logged, and the event is returned so the user can still sign in.
 */

import type {
  PostConfirmationTriggerEvent,
  PostConfirmationTriggerHandler,
} from 'aws-lambda';
import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ddb, TableNames } from '../db/client.js';
import { userDataKeys } from '../db/keys.js';
import { buildUserProfileItem } from '../auth/profile.js';
import { evaluateInvite, hashInviteCode, type InviteRecord } from '../auth/invite.js';

const cognito = new CognitoIdentityProviderClient({});

const MEMBER_GROUP = 'member';

export const handler: PostConfirmationTriggerHandler = async (
  event: PostConfirmationTriggerEvent,
) => {
  try {
    // Only handle the ConfirmSignUp trigger — ignore ForgotPassword confirmation, etc.
    if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') {
      return event;
    }

    const attrs = event.request.userAttributes ?? {};
    const sub = attrs['sub'];
    const email = attrs['email'];
    const name = attrs['name'];
    const inviteCode = attrs['custom:inviteCode'];

    if (!sub || !email) {
      console.error('[post-confirmation] Missing required attributes: sub or email', {
        triggerSource: event.triggerSource,
        userName: event.userName,
        hasSub: !!sub,
        hasEmail: !!email,
      });
      return event;
    }

    let status: 'active' | 'pending' = 'pending';
    const groupIds: string[] = [];
    let activate = false;

    // Invite path — only attempt if an invite code was supplied AND the Invites
    // table env var is set (the M3 table may not exist yet; absence ⇒ skip).
    const invitesTable = process.env['SST_RESOURCE_Invites_name'];
    if (inviteCode && typeof inviteCode === 'string' && inviteCode.trim() !== '' && invitesTable) {
      let inviteItem: InviteRecord | undefined;
      try {
        const codeHash = hashInviteCode(inviteCode);
        // M3 owns the Invites table + its real key builder; this is the agreed read shape.
        const { Item } = await ddb.send(
          new GetCommand({
            TableName: invitesTable,
            Key: { pk: `INVITE#${codeHash}`, sk: 'INVITE' },
          }),
        );
        inviteItem = Item as InviteRecord | undefined;
      } catch (err) {
        // ResourceNotFoundException or any other error → treat as no invite.
        console.error('[post-confirmation] Failed to read invite record; treating as no invite', err);
        inviteItem = undefined;
      }

      const evaluation = evaluateInvite(inviteItem);

      if (evaluation.valid) {
        status = 'active';
        activate = true;
        if (evaluation.groupId) {
          groupIds.push(evaluation.groupId);
        }

        // Mark invite as used — increment usedCount. Failure is non-blocking.
        if (invitesTable && inviteItem) {
          try {
            const codeHash = hashInviteCode(inviteCode);
            await ddb.send(
              new UpdateCommand({
                TableName: invitesTable,
                Key: { pk: `INVITE#${codeHash}`, sk: 'INVITE' },
                UpdateExpression: 'SET usedCount = if_not_exists(usedCount, :zero) + :one',
                ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
              }),
            );
          } catch (err) {
            console.error('[post-confirmation] Failed to increment invite usedCount; continuing', err);
          }
        }
      } else {
        console.warn('[post-confirmation] Invite evaluation failed', {
          reason: evaluation.reason,
          sub,
          email,
        });
      }
    }

    // Build and write the user profile item.
    const profile = buildUserProfileItem({ sub, email, name, status, role: 'member', groupIds });
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: profile,
      }),
    );

    // If activated via invite, add the user to the Cognito member group.
    if (activate) {
      try {
        await cognito.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: event.userPoolId,
            Username: event.userName,
            GroupName: MEMBER_GROUP,
          }),
        );
      } catch (err) {
        console.error('[post-confirmation] Failed to add user to Cognito group; continuing', err);
      }
    }

    return event;
  } catch (err) {
    // Never throw — a throw would block Cognito confirmation.
    console.error('[post-confirmation] Unhandled error in handler; returning event to unblock Cognito', err);
    return event;
  }
};
