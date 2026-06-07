/// <reference path="../.sst/platform/config.d.ts" />
import { router } from "./router";
import { webDomain } from "./secrets";

const isProd = $app.stage === "production";
const isPR = $app.stage.startsWith("pr-");

export const marketing = new sst.aws.Nextjs("Marketing", {
  path: "packages/marketing",
  domain: isPR
    ? {
        name: $interpolate`${$app.stage}.${webDomain.value}`,
        dns: sst.cloudflare.dns({ proxy: false }),
      }
    : undefined,
  router: isProd
    ? {
        instance: router,
        domain: webDomain.value,
      }
    : undefined,
  environment: {
    NEXT_PUBLIC_APP_URL: isProd
      ? $interpolate`https://app.${webDomain.value}`
      : isPR
        ? $interpolate`https://app.${$app.stage}.${webDomain.value}`
        : "http://localhost:3002",
  },
});
