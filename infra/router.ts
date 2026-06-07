/// <reference path="../.sst/platform/config.d.ts" />
import { webDomain } from "./secrets";

const isProd = $app.stage === "production";

export const router = new sst.aws.Router("Router", {
  domain: isProd
    ? {
        name: webDomain.value,
        aliases: webDomain.value.apply((d) => [`app.${d}`]),
        redirects: webDomain.value.apply((d) => [`www.${d}`]),
        dns: sst.cloudflare.dns({ proxy: true }),
      }
    : undefined,
});
