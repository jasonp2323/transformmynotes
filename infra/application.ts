/// <reference path="../.sst/platform/config.d.ts" />
import { router } from "./router";
import { webDomain, bedrockInferenceProfileId, resendApiKey, inviteFromAddress, turnstileSiteKey, turnstileSecretKey, multiNoteContextLimit, maxSourceNotes } from "./secrets";
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
  // NOTE: STUDY_*_PROMPT values are intentionally NOT linked/bound here.
  // The web server only enqueues a STUDYSET; generation runs in the M13.2 stream
  // consumer (infra/jobs.ts). Prompts are loaded at consumer startup from bundled
  // `prompts/` text files (via study-prompts.ts), bypassing the AWS Lambda 4 KB
  // env-var limit — they are no longer SST secrets or env vars on either runtime.
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
    // M17 multi-note context limit (mirrors the binding in infra/jobs.ts so
    // the route's resolveContextLimit() honours the seeded value consistently).
    // Empty/unset resolves to the built-in 60k default — never fails loud.
    SST_RESOURCE_MULTI_NOTE_CONTEXT_LIMIT_value: multiNoteContextLimit.value,
    SST_RESOURCE_MAX_SOURCE_NOTES_value: maxSourceNotes.value,
    // M13.2 per-user in-flight study-generation cap (route fails loud if unset/non-integer).
    // Set to 4 to allow all four study-material types (flashcards, quiz, assignment, summary)
    // to be generated concurrently for the same note.
    MAX_CONCURRENT_STUDY_JOBS: "4",
    SST_STAGE: $app.stage,
    RESEND_API_KEY: resendApiKey.value,
    INVITE_FROM_ADDRESS: inviteFromAddress.value,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: turnstileSiteKey.value,
    TURNSTILE_SECRET_KEY: turnstileSecretKey.value,
    // STUDY_*_PROMPT values are deliberately omitted from this env block — see the
    // note on `link` above. They load from bundled `prompts/` text files in the
    // M13.2 stream consumer (infra/jobs.ts), the only runtime that calls generateStudyMaterial.
    ...(process.env.ANDROID_SIGNING_FINGERPRINT
      ? { ANDROID_SIGNING_FINGERPRINT: process.env.ANDROID_SIGNING_FINGERPRINT }
      : {}),
  },
  permissions: [
    // NOTE (M18): no S3 block is added for the `audio/users/*` prefix. The
    // `notesBucket` is already in the `link:` array, which grants the app full
    // read/write to that bucket — including `audio/users/*`. A narrowly-scoped
    // additive S3 block here would provide NO restriction (IAM is a union with
    // the broad link grant) and would be misleading, so it is deliberately omitted.
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
    {
      // Polly TTS (M18). Polly's SynthesizeSpeech supports NEITHER resource-level
      // scoping (only lexicon ARNs are resources — synthesis itself is "*") NOR
      // request condition keys: it does not populate `polly:LanguageCode` (or any
      // synthesis condition key) into the request context, so a StringEquals
      // condition on it can never match and fails the statement closed →
      // AccessDeniedException. The minimal grant Polly's IAM model actually
      // accepts is the action on Resource "*" with no condition. LanguageCode is
      // pinned to pt-BR in the synthesizeSpeech() call itself (packages/core/src/tts/polly.ts).
      // Documented in docs/milestones/M18.md "Risks → Polly IAM resource ARN".
      actions: ["polly:SynthesizeSpeech"],
      resources: ["*"],
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
