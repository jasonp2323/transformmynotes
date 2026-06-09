/// <reference path="../.sst/platform/config.d.ts" />

// Background jobs scaffold. No cron/stream consumers at M0 — future milestones
// add them here and link the UserData table (stream is already
// `new-and-old-images`) for DynamoDB Streams consumers.
//
// TODO(M4): When the transcription job / DynamoDB Streams consumer is added,
// import and link `notesBucket` (from "./storage") and the transcription tables
// (from "./db") here so the job has S3 read/write access and can consume
// DynamoDB Streams events.
export {};
