/// <reference path="../.sst/platform/config.d.ts" />

import { userData } from "./db";

const isProd = $app.stage === "production";

export const userPool = new sst.aws.CognitoUserPool("UserPool", {
  usernames: ["email"],
  triggers: {
    postConfirmation: {
      handler: "packages/core/src/handlers/post-confirmation.handler",
      link: [userData],
      permissions: [
        {
          actions: ["cognito-idp:AdminAddUserToGroup"],
          // Scoped to any user pool in this account/region. We deliberately do
          // NOT reference userPool.arn here: the trigger function is created as
          // part of this very pool, so referencing the pool's own ARN would form
          // a dependency cycle. The handler reads the concrete pool id from the
          // Cognito trigger event at runtime.
          resources: ["arn:aws:cognito-idp:*:*:userpool/*"],
        },
      ],
    },
  },
  transform: {
    userPool: (args) => {
      // Invite/admin only — no public self sign-up. Core product constraint.
      args.adminCreateUserConfig = { allowAdminCreateUserOnly: true };
    },
  },
});

export const userPoolClient = userPool.addClient("Web", {
  transform: {
    client: (args) => {
      args.explicitAuthFlows = [
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_USER_SRP_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
      ];
    },
  },
});

// Cognito groups drive admin/member authorization (cognito:groups claim).
// Production's groups are bootstrapped by hand (see docs/runbooks/bootstrap-admin.md)
// to avoid a deploy-time collision with the manually-created admin group; ephemeral
// stages provision them here so invite registration + admin gating work out of the box.
if (!isProd) {
  new aws.cognito.UserGroup("AdminGroup", {
    userPoolId: userPool.id,
    name: "admin",
    description: "Administrators — full admin panel access.",
  });
  new aws.cognito.UserGroup("MemberGroup", {
    userPoolId: userPool.id,
    name: "member",
    description: "Members — standard authenticated users.",
  });
}

// TODO(prod): custom Hosted-UI domain auth.${WEB_DOMAIN} — add a
// userPool.addDomain(...) call here gated on isProd once the DNS is confirmed.
