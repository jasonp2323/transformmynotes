/// <reference path="../.sst/platform/config.d.ts" />

const isProd = $app.stage === "production";

export const userPool = new sst.aws.CognitoUserPool("UserPool", {
  usernames: ["email"],
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

// TODO(prod): custom Hosted-UI domain auth.${WEB_DOMAIN} — add a
// userPool.addDomain(...) call here gated on isProd once the DNS is confirmed.
