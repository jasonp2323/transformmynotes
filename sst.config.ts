/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    const isProd = input?.stage === "production";
    return {
      name: "transformmynotes",
      removal: isProd ? "retain" : "remove",
      protect: isProd,
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1"
        },
        cloudflare: {
          version: "6.15.0",
          apiToken: process.env.CLOUDFLARE_API_TOKEN,
        },
      },
    };
  },
  async run() {
    await import("./infra/secrets");
    await import("./infra/router");
    await import("./infra/db");
    await import("./infra/auth");
    await import("./infra/storage");
    const { marketing } = await import("./infra/marketing");
    const { application } = await import("./infra/application");
    await import("./infra/jobs");
    return {
      marketing: marketing.url,
      application: application.url,
    };
  },
});
