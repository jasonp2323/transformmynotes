/// <reference path="../.sst/platform/config.d.ts" />

import { userData } from "./db";

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

// Cognito groups (`admin` / `member`) drive authorization via the cognito:groups
// claim. They are NOT provisioned here: the GitHub Actions deploy role lacks
// cognito-idp:CreateGroup, and granting it would broaden CI privileges. Instead the
// groups are bootstrapped by hand per deployed stage (see docs/runbooks/bootstrap-admin.md);
// the offline E2E pool seeds them in e2e/application/global-setup.ts. The invite-redeem
// route adds new users to `member`, so that group must exist in any pool that serves
// real sign-ups (production: create both `admin` and `member` once, by hand).

// TODO(prod): custom Hosted-UI domain auth.${WEB_DOMAIN} — add a
// userPool.addDomain(...) call here gated on isProd once the DNS is confirmed.
