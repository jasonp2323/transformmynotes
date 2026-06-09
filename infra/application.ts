/// <reference path="../.sst/platform/config.d.ts" />
import { router } from "./router";
import { webDomain, bedrockInferenceProfileId } from "./secrets";
import { userPool, userPoolClient } from "./auth";
import { userData, invites, groups } from "./db";
import { notesBucket } from "./storage";

const isProd = $app.stage === "production";
const isPR = $app.stage.startsWith("pr-");

export const application = new sst.aws.Nextjs("Application", {
  path: "packages/application",
  link: [userPool, userPoolClient, userData, invites, groups, notesBucket],
  environment: {
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPool.id,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: userPoolClient.id,
    SST_RESOURCE_UserData_name: userData.name,
    SST_RESOURCE_Invites_name: invites.name,
    SST_RESOURCE_Groups_name: groups.name,
    SST_RESOURCE_NotesBucket_name: notesBucket.name,
    SST_STAGE: $app.stage,
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
