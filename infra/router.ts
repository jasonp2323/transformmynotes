/// <reference path="../.sst/platform/config.d.ts" />
import { webDomain } from "./secrets";

const isProd = $app.stage === "production";

export const router = isProd
  ? new sst.aws.Router("Router", {
      domain: {
        name: webDomain.value,
        aliases: [webDomain.value.apply((d) => `*.${d}`)],
        dns: sst.cloudflare.dns(),
      },
    })
  : undefined;
