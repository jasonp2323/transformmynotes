/// <reference path="../.sst/platform/config.d.ts" />

export const userData = new sst.aws.Dynamo("UserData", {
  fields: { pk: "string", sk: "string" },
  primaryIndex: { hashKey: "pk", rangeKey: "sk" },
  stream: "new-and-old-images",
});

export const tables = { UserData: userData };
