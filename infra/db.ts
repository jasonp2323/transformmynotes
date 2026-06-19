/// <reference path="../.sst/platform/config.d.ts" />

export const userData = new sst.aws.Dynamo("UserData", {
  fields: { pk: "string", sk: "string", gsi1pk: "string", gsi1sk: "string" },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  globalIndexes: {
    GSI1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
  },
  stream: "new-and-old-images",
  ttl: "expiresAt",
});

export const invites = new sst.aws.Dynamo("Invites", {
  fields: { pk: "string", sk: "string", gsi1pk: "string", gsi1sk: "string" },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  globalIndexes: {
    GSI1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
  },
  stream: "new-and-old-images",
});

export const groups = new sst.aws.Dynamo("Groups", {
  fields: { pk: "string", sk: "string", gsi1pk: "string", gsi1sk: "string" },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  globalIndexes: {
    GSI1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
  },
  stream: "new-and-old-images",
});

export const notes = new sst.aws.Dynamo("Notes", {
  fields: {
    pk: "string",
    sk: "string",
    gsi1pk: "string",
    gsi1sk: "string",
    gsi2pk: "string",
    gsi2sk: "string",
    gsi3pk: "string",
    gsi3sk: "string",
    gsi4pk: "string",
    gsi4sk: "string",
    gsi5pk: "string",
    gsi5sk: "string",
    gsi6pk: "string",
    gsi6sk: "string",
    gsi7pk: "string",
    gsi7sk: "string",
    gsi8pk: "string",
    gsi8sk: "string",
    gsi9pk: "string",
    gsi9sk: "string",
  },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  globalIndexes: {
    GSI1: { hashKey: "gsi1pk", rangeKey: "gsi1sk", projection: "all" },
    GSI2: { hashKey: "gsi2pk", rangeKey: "gsi2sk", projection: "keys-only" },
    GSI3: { hashKey: "gsi3pk", rangeKey: "gsi3sk", projection: "keys-only" },
    GSI4: { hashKey: "gsi4pk", rangeKey: "gsi4sk", projection: "all" },
    GSI5: { hashKey: "gsi5pk", rangeKey: "gsi5sk", projection: "all" },
    GSI6: { hashKey: "gsi6pk", rangeKey: "gsi6sk", projection: "all" },
    GSI7: { hashKey: "gsi7pk", rangeKey: "gsi7sk", projection: "all" },
    GSI8: { hashKey: "gsi8pk", rangeKey: "gsi8sk", projection: "all" },
    GSI9: { hashKey: "gsi9pk", rangeKey: "gsi9sk", projection: "all" },
  },
  stream: "new-and-old-images",
});

// M23 metering table: raw usage events (TTL'd) + daily aggregates + storage gauge + price-book config.
export const usage = new sst.aws.Dynamo("Usage", {
  fields: { pk: "string", sk: "string", gsi1pk: "string", gsi1sk: "string" },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  globalIndexes: {
    GSI1: { hashKey: "gsi1pk", rangeKey: "gsi1sk", projection: "all" },
  },
  stream: "new-and-old-images",
  ttl: "expiresAt",
});

export const tables = { UserData: userData, Invites: invites, Groups: groups, Notes: notes, Usage: usage };
