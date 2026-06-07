/// <reference path="../.sst/platform/config.d.ts" />
import { webDomain } from "./secrets";

const isProd = $app.stage === "production";

export const marketing = new sst.aws.Nextjs("Marketing", {
  path: "packages/marketing",
  ...(isProd
    ? { domain: { name: webDomain.value, dns: sst.cloudflare.dns() } }
    : {}),
});
