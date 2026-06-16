/// <reference path="../.sst/platform/config.d.ts" />
import { notes, userData } from "./db";
import { notesBucket } from "./storage";
import {
  bedrockInferenceProfileId,
} from "./secrets";

const accountId = aws.getCallerIdentityOutput({}).accountId;

// The BEDROCK_MODEL_ID secret is a cross-region inference profile id (e.g.
// "us.anthropic.claude-3-5-sonnet-20241022-v2:0"). Strip the region prefix
// ("us.", "eu.", "apac.") to recover the underlying foundation-model id used in
// the per-region foundation-model ARNs. If no prefix is present the id is used
// as-is (a bare foundation-model id still works for both ARNs).
const foundationModelId = bedrockInferenceProfileId.value.apply((id) =>
  id.replace(/^(us|eu|apac)\./, ""),
);

// M13.2 study-generation stream consumer. The web server only enqueues a
// STUDYSET item on the Notes table; this Lambda runs the actual Bedrock
// generation off the DynamoDB stream. Study prompts are loaded at Lambda
// startup from bundled `prompts/` text files (via study-prompts.ts), which
// avoids the AWS Lambda 4 KB env-var limit — they are no longer SST secrets.
export const studyGenerationConsumer = new sst.aws.Function("StudyGenerationConsumer", {
  handler: "packages/application/jobs/study-generation.handler",
  // M19: resolveAiConfig() reads the CONFIG#AI item from the UserData table, so
  // the consumer must bind UserData (link + name env) and be granted read on it.
  // This fits the 4 KB env limit now that the study prompts are bundled as
  // `prompts/` files (copyFiles) rather than configured Lambda env vars.
  link: [notes, notesBucket, userData],
  copyFiles: [{ from: 'prompts', to: 'prompts' }],
  environment: {
    SST_RESOURCE_Notes_name: notes.name,
    SST_RESOURCE_NotesBucket_name: notesBucket.name,
    SST_RESOURCE_UserData_name: userData.name,
    SST_RESOURCE_BEDROCK_MODEL_ID_value: bedrockInferenceProfileId.value,
  },
  permissions: [
    {
      actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
      resources: [notes.arn],
    },
    // M19: read-only access to the CONFIG#AI item in UserData (resolveAiConfig).
    {
      actions: ["dynamodb:GetItem"],
      resources: [userData.arn],
    },
    // Least privilege: read the source note Markdown under markdown/, write the
    // generated study artifacts under study/ — no bucket-wide access.
    {
      actions: ["s3:GetObject"],
      resources: [$interpolate`arn:aws:s3:::${notesBucket.name}/markdown/*`],
    },
    {
      actions: ["s3:PutObject"],
      resources: [$interpolate`arn:aws:s3:::${notesBucket.name}/study/*`],
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
});

// Subscribe the consumer to the Notes table stream, filtered to STUDYSET INSERTs
// only — a new STUDYSET item (sk begins_with "STUDYSET#") is the enqueue signal.
notes.subscribe("StudyGenerationConsumerSubscription", studyGenerationConsumer.arn, {
  filters: [
    { eventName: ["INSERT"], dynamodb: { NewImage: { sk: { S: [{ prefix: "STUDYSET#" }] } } } },
  ],
});
