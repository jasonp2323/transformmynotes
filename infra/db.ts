/// <reference path="../.sst/platform/config.d.ts" />

export const userData = new sst.aws.Dynamo("UserData", {
  fields: { pk: "string", sk: "string", gsi1pk: "string", gsi1sk: "string" },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  globalIndexes: {
    GSI1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
  },
  stream: "new-and-old-images",
});

export const invites = new sst.aws.Dynamo("Invites", {
  fields: { pk: "string", sk: "string", gsi1pk: "string", gsi1sk: "string" },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  globalIndexes: {
    GSI1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
  },
  stream: "new-and-old-images",
});

export const tables = { UserData: userData, Invites: invites };
