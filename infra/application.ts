/// <reference path="../.sst/platform/config.d.ts" />
import { router } from "./router";
import { webDomain, bedrockInferenceProfileId, resendApiKey, inviteFromAddress, turnstileSiteKey, turnstileSecretKey } from "./secrets";
import { userPool, userPoolClient } from "./auth";
import { userData, invites, groups, notes } from "./db";
import { notesBucket } from "./storage";

const accountId = aws.getCallerIdentityOutput({}).accountId;

// The BEDROCK_MODEL_ID secret is a cross-region inference profile id (e.g.
// "us.anthropic.claude-3-5-sonnet-20241022-v2:0"). Strip the region prefix
// ("us.", "eu.", "apac.") to recover the underlying foundation-model id used in
// the per-region foundation-model ARNs. If no prefix is present the id is used
// as-is (a bare foundation-model id still works for both ARNs).
const foundationModelId = bedrockInferenceProfileId.value.apply((id) =>
  id.replace(/^(us|eu|apac)\./, ""),
);

const isProd = $app.stage === "production";
const isPR = $app.stage.startsWith("pr-");

export const application = new sst.aws.Nextjs("Application", {
  path: "packages/application",
  // Prompt text files are bundled read-only so the admin AI-settings GET route
  // can surface the preprogrammed defaults via loadStudyPromptsIntoEnv() +
  // buildSecretDefaults(). Generation still runs only in the M13.2 stream
  // consumer (infra/jobs.ts); the web runtime never calls generateStudyMaterial.
  // Bundling mirrors infra/jobs.ts which uses the same copyFiles config.
  // STUDY_*_PROMPT values are NOT bound as Lambda env vars (4 KB limit) — they
  // are read directly from the bundled `prompts/` text files at request time.
  copyFiles: [{ from: "prompts", to: "prompts" }],
  link: [userPool, userPoolClient, userData, invites, groups, notes, notesBucket],
  environment: {
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPool.id,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: userPoolClient.id,
    SST_RESOURCE_UserData_name: userData.name,
    SST_RESOURCE_Invites_name: invites.name,
    SST_RESOURCE_Groups_name: groups.name,
    SST_RESOURCE_Notes_name: notes.name,
    SST_RESOURCE_NotesBucket_name: notesBucket.name,
    SST_RESOURCE_BEDROCK_MODEL_ID_value: bedrockInferenceProfileId.value,
    // M13.2 per-user in-flight study-generation cap (route fails loud if unset/non-integer).
    // Set to 4 to allow all four study-material types (flashcards, quiz, assignment, summary)
    // to be generated concurrently for the same note.
    MAX_CONCURRENT_STUDY_JOBS: "4",
    SST_STAGE: $app.stage,
    RESEND_API_KEY: resendApiKey.value,
    INVITE_FROM_ADDRESS: inviteFromAddress.value,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: turnstileSiteKey.value,
    TURNSTILE_SECRET_KEY: turnstileSecretKey.value,
    // STUDY_*_PROMPT values are deliberately omitted from this env block.
    // They are read directly from the bundled `prompts/` text files (copyFiles above)
    // via loadStudyPromptsIntoEnv() — not as Lambda env vars (4 KB limit applies).
    ...(process.env.ANDROID_SIGNING_FINGERPRINT
      ? { ANDROID_SIGNING_FINGERPRINT: process.env.ANDROID_SIGNING_FINGERPRINT }
      : {}),
  },
  permissions: [
    // Least privilege: scoped to this stage's user pool ARN only.
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
      // Least privilege: InvokeModel only, scoped to the specific Claude inference
      // profile + the underlying foundation model in each region the "us." profile
      // can route to. No bedrock:*:*:* wildcard.
      actions: [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
      ],
      resources: [
        // The cross-region inference profile itself.
        $interpolate`arn:aws:bedrock:us-east-1:${accountId}:inference-profile/${bedrockInferenceProfileId.value}`,
        // The underlying foundation model in each region the "us." profile spans.
        $interpolate`arn:aws:bedrock:us-east-1::foundation-model/${foundationModelId}`,
        $interpolate`arn:aws:bedrock:us-east-2::foundation-model/${foundationModelId}`,
        $interpolate`arn:aws:bedrock:us-west-2::foundation-model/${foundationModelId}`,
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
