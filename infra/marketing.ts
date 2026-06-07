/// <reference path="../.sst/platform/config.d.ts" />
import { webDomain } from "./secrets";

const isProd = $app.stage === "production";

export const marketing = new sst.aws.Nextjs("Marketing", {
  path: "packages/marketing",
  // Turnstile/Resend/Contact secrets are NOT bound at M0 — the contact route
  // is a stub until M3. Binding them here would force seeding secrets just to
  // deploy an ephemeral pr-<N> stage.
  ...(isProd
    ? { domain: { name: webDomain.value, dns: sst.cloudflare.dns() } }
    : {}),
});
