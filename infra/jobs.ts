/// <reference path="../.sst/platform/config.d.ts" />
import { notes, userData, usage, studyEvents } from "./db";
import { notesBucket } from "./storage";
import {
  bedrockInferenceProfileId,
  multiNoteContextLimit,
  maxSourceNotes,
} from "./secrets";

const accountId = aws.getCallerIdentityOutput({}).accountId;

// The BEDROCK_MODEL_ID secret is a cross-region inference profile id (e.g.
// "us.anthropic.claude-sonnet-4-5-20250929-v1:0"). Strip the region prefix
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
    SST_RESOURCE_MULTI_NOTE_CONTEXT_LIMIT_value: multiNoteContextLimit.value,
    SST_RESOURCE_MAX_SOURCE_NOTES_value: maxSourceNotes.value,
  },
  permissions: [
    {
      actions: ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:PutItem"],
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
      actions: ["s3:PutObject"],
      resources: [$interpolate`arn:aws:s3:::${notesBucket.name}/activity/*`],
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

// M20.2 source-extraction stream consumer. The upload route marks a SOURCE item
// status → 'extracting'; this Lambda runs the actual text extraction (parse +
// S3 write + status update) off the DynamoDB stream.
export const sourceExtractionConsumer = new sst.aws.Function("SourceExtractionConsumer", {
  handler: "packages/application/jobs/source-extraction.handler",
  link: [notes, notesBucket],
  environment: {
    SST_RESOURCE_Notes_name: notes.name,
    SST_RESOURCE_NotesBucket_name: notesBucket.name,
  },
  permissions: [
    {
      actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
      resources: [notes.arn],
    },
    // Least privilege: read original upload files from sources/users/*
    {
      actions: ["s3:GetObject"],
      resources: [$interpolate`arn:aws:s3:::${notesBucket.name}/sources/users/*`],
    },
    // Write extracted Markdown text back to sources/users/*
    {
      actions: ["s3:PutObject"],
      resources: [$interpolate`arn:aws:s3:::${notesBucket.name}/sources/users/*`],
    },
  ],
});

// Subscribe the source-extraction consumer to the Notes table stream, filtered
// to SOURCE items in 'extracting' status (INSERT when large-file async path
// creates directly as extracting; MODIFY when the upload route flips status).
notes.subscribe("SourceExtractionConsumerSubscription", sourceExtractionConsumer.arn, {
  filters: [
    {
      eventName: ["INSERT", "MODIFY"],
      dynamodb: {
        NewImage: {
          sk: { S: [{ prefix: "SOURCE#" }] },
          status: { S: ["extracting"] },
        },
      },
    },
  ],
});

// M23.3.1 usage-stream aggregator. Consumes the Usage table stream and
// materialises daily AI aggregates (idempotent recompute-and-PUT) and maintains
// the per-user STORAGE#CURRENT gauge (processed-marker dedupe). Only EVT# INSERT
// records are processed; the aggregator's own writes (DAY#/STORAGE#/STORAGEPROC#)
// don't match the EVT# filter, so there is no re-trigger loop. See
// packages/application/jobs/usage-aggregator.ts.
export const usageAggregatorConsumer = new sst.aws.Function("UsageAggregatorConsumer", {
  handler: "packages/application/jobs/usage-aggregator.handler",
  link: [usage],
  environment: {
    SST_RESOURCE_Usage_name: usage.name,
  },
  permissions: [
    {
      // Base-table only: Query (re-sum raw events), Get/Put (aggregate + marker),
      // Update (storage gauge ADD). No GSI access needed.
      actions: [
        "dynamodb:Query",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
      ],
      resources: [usage.arn],
    },
  ],
});

// Subscribe to the Usage stream, filtered to raw-event INSERTs only
// (sk begins_with "EVT#"). Storage deltas and AI events share the EVT# prefix.
usage.subscribe("UsageAggregatorConsumerSubscription", usageAggregatorConsumer.arn, {
  filters: [
    { eventName: ["INSERT"], dynamodb: { NewImage: { sk: { S: [{ prefix: "EVT#" }] } } } },
  ],
});

// M25.2 study-progress stream consumer. Converts raw EVENT# INSERTs from the
// StudyEvents table into atomic counter increments on per-user DAY# snapshots.
// The nightly progress-finalize cron self-heals double-counts via rederiveDaySnapshot.
export const progressAggregatorConsumer = new sst.aws.Function("ProgressAggregatorConsumer", {
  handler: "packages/application/jobs/progress-aggregator.handler",
  link: [studyEvents],
  environment: {
    SST_RESOURCE_StudyEvents_name: studyEvents.name,
  },
  permissions: [
    {
      // Query (eventScanForDay for rederive backstop), GetItem (getDaySnapshot),
      // PutItem (rederiveDaySnapshot overwrite), UpdateItem (incrementDaySnapshot ADD).
      actions: [
        "dynamodb:Query",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
      ],
      resources: [studyEvents.arn],
    },
  ],
});

// Subscribe the consumer to the StudyEvents table stream, filtered to raw-event
// INSERTs only (sk begins_with "EVENT#"). DAY# snapshot writes by the consumer
// itself don't match this filter, so there is no re-trigger loop.
studyEvents.subscribe("ProgressAggregatorConsumerSubscription", progressAggregatorConsumer.arn, {
  filters: [
    { eventName: ["INSERT"], dynamodb: { NewImage: { sk: { S: [{ prefix: "EVENT#" }] } } } },
  ],
});

// M23.3.2 daily storage-snapshot cron. Once per day, enumerates active users
// (UserData GSI1 STATUS#active) and samples each one's STORAGE#CURRENT gauge
// into a DAY#<date>#storage aggregate, so GB-month can be derived as an average
// of daily byte snapshots. See packages/application/jobs/storage-snapshot.ts.
export const storageSnapshotCron = new sst.aws.Cron("StorageSnapshotCron", {
  schedule: "rate(1 day)",
  function: {
    handler: "packages/application/jobs/storage-snapshot.handler",
    link: [userData, usage],
    environment: {
      SST_RESOURCE_UserData_name: userData.name,
      SST_RESOURCE_Usage_name: usage.name,
    },
    permissions: [
      {
        // Active-user enumeration runs on UserData GSI1.
        actions: ["dynamodb:Query"],
        resources: [userData.arn, $interpolate`${userData.arn}/index/*`],
      },
      {
        // Read each user's storage gauge; write the daily storage aggregate.
        actions: ["dynamodb:GetItem", "dynamodb:PutItem"],
        resources: [usage.arn],
      },
    ],
  },
});

// M25.2 nightly progress-finalize cron. Enumerates all active users (UserData
// GSI1), self-heals the rolling 2-day window via rederiveDaySnapshot, then
// recomputes each user's streak + lifetime totals and writes them back to the
// UserData profile via updateProgressProfile.
// See packages/application/jobs/progress-finalize.ts.
export const progressFinalizeCron = new sst.aws.Cron("ProgressFinalizeCron", {
  schedule: "rate(1 day)",
  function: {
    handler: "packages/application/jobs/progress-finalize.handler",
    link: [userData, studyEvents],
    environment: {
      SST_RESOURCE_UserData_name: userData.name,
      SST_RESOURCE_StudyEvents_name: studyEvents.name,
    },
    permissions: [
      {
        // Active-user enumeration runs on UserData GSI1.
        actions: ["dynamodb:Query"],
        resources: [userData.arn, $interpolate`${userData.arn}/index/*`],
      },
      {
        // updateProgressProfile: conditional UpdateItem on the PROFILE item.
        // getUserProfileBySub (inside updateProgressProfile): GetItem on PROFILE.
        actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        resources: [userData.arn],
      },
      {
        // rederiveDaySnapshot: Query (eventScanForDay), PutItem (snapshot overwrite).
        // listDaySnapshots: Query (dayRangeQuery).
        // incrementDaySnapshot: UpdateItem (ADD on DAY# item).
        actions: [
          "dynamodb:Query",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
        ],
        resources: [studyEvents.arn],
      },
    ],
  },
});
