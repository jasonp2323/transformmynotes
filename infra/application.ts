/// <reference path="../.sst/platform/config.d.ts" />
import { webDomain } from "./secrets";
import { userPool, userPoolClient } from "./auth";
import { userData } from "./db";

const isProd = $app.stage === "production";

export const application = new sst.aws.Nextjs("Application", {
  path: "packages/application",
  link: [userPool, userPoolClient, userData],
  environment: {
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPool.id,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: userPoolClient.id,
    SST_RESOURCE_UserData_name: userData.name,
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
  ],
  ...(isProd
    ? {
        domain: {
          name: webDomain.value.apply((d) => `app.${d}`),
          dns: sst.cloudflare.dns(),
        },
      }
    : {}),
});
