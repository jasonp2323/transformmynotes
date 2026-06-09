/// <reference path="../.sst/platform/config.d.ts" />
import { webDomain } from "./secrets";

const isProd = $app.stage === "production";

// NotesBucket: stores uploaded note images and the processed markdown per user.
// Public access is blocked by default (no `access` prop set).
// CORS allows presigned-URL direct uploads (PUT) and downloads (GET) from the app origin only.
export const notesBucket = new sst.aws.Bucket("NotesBucket", {
  cors: {
    allowOrigins: [
      isProd
        ? $interpolate`https://app.${webDomain.value}`
        : $interpolate`https://app.${$app.stage}.${webDomain.value}`,
    ],
    allowMethods: ["PUT", "GET"],
    allowHeaders: ["*"],
    exposeHeaders: ["ETag"],
    maxAge: "1 day",
  },
  transform: {
    bucket: (args) => {
      args.tags = {
        Project: "TransformMyNotes",
        Stage: $app.stage,
      };
    },
  },
});
