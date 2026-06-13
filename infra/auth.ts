/// <reference path="../.sst/platform/config.d.ts" />

import { userData } from "./db";

const isPR = $app.stage.startsWith("pr-");

function createOwnedPool() {
  return new sst.aws.CognitoUserPool("UserPool", {
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
}

// PR stages (pr-<N>) reference the single shared dev pool created+owned by the
// long-lived `dev` stage. Its id comes from the DEV_COGNITO_USER_POOL_ID env var
// (a public value, like NEXT_PUBLIC_COGNITO_USER_POOL_ID — NOT an sst.Secret,
// which would eager-throw on every stage; set it as a GitHub Actions variable in
// deploy.yml). Production and any other named stage OWN their pool. The
// post-confirmation trigger + invite-only transform live on the OWNED pool only;
// a referenced pool inherits whatever its owner configured.
export const userPool = isPR ? referenceSharedDevPool() : createOwnedPool();

function referenceSharedDevPool() {
  const id = process.env.DEV_COGNITO_USER_POOL_ID;
  if (!id) {
    // Fail loudly — never silently fall back to creating a per-PR pool.
    throw new Error(
      "DEV_COGNITO_USER_POOL_ID is required for pr-<N> stages (the shared dev Cognito pool id). " +
        "Set it as a GitHub Actions variable / shell env. See docs/runbooks/shared-dev-cognito-pool.md.",
    );
  }
  return sst.aws.CognitoUserPool.get("UserPool", id);
}

// addClient works on both an owned and a .get()-referenced pool. Each PR stage
// gets its own lightweight app client ON the shared pool (SST can't yet
// reference an existing client); a user in the pool can auth against any client.
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
