/// <reference path="../.sst/platform/config.d.ts" />
import { router } from "./router";
import { webDomain, bedrockInferenceProfileId, resendApiKey, inviteFromAddress } from "./secrets";
import { userPool, userPoolClient } from "./auth";
import { userData, invites, groups, notes } from "./db";
import { notesBucket } from "./storage";

const isProd = $app.stage === "production";
const isPR = $app.stage.startsWith("pr-");

export const application = new sst.aws.Nextjs("Application", {
  path: "packages/application",
  link: [userPool, userPoolClient, userData, invites, groups, notes, notesBucket],
  environment: {
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPool.id,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: userPoolClient.id,
    SST_RESOURCE_UserData_name: userData.name,
    SST_RESOURCE_Invites_name: invites.name,
    SST_RESOURCE_Groups_name: groups.name,
    SST_RESOURCE_Notes_name: notes.name,
    SST_RESOURCE_NotesBucket_name: notesBucket.name,
    SST_STAGE: $app.stage,
    RESEND_API_KEY: resendApiKey.value,
    INVITE_FROM_ADDRESS: inviteFromAddress.value,
  },
  permissions: [
    {
      actions: [
        "cognito-idp:AdminInitiateAuth",
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminSetUserPassword",
        "cognito-idp:AdminAddUserToGroup",
        "cognito-idp:AdminListGroupsForUser",
        "cognito-idp:AdminRemoveUserFromGroup",
        "cognito-idp:AdminDeleteUser",
      ],
      resources: [userPool.arn],
    },
    {
      actions: [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
      ],
      resources: [
        $interpolate`arn:aws:bedrock:us-east-1::foundation-model/${bedrockInferenceProfileId.value}`,
      ],
    },
  ],
  domain: isPR
    ? {
        name: $interpolate`app.${$app.stage}.${webDomain.value}`,
        dns: sst.cloudflare.dns({ proxy: false }),
      }
    : undefined,
  router: isProd
    ? {
        instance: router,
        domain: $interpolate`app.${webDomain.value}`,
      }
    : undefined,
});
