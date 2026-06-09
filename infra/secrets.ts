/// <reference path="../.sst/platform/config.d.ts" />

// Seeded per-stage via the SST Console (production env + the fallback env that
// covers pr-<N>). No empty/placeholder fallbacks — a missing value fails loudly
// at deploy when its .value is accessed (WEB_DOMAIN is used for the production
// custom domain only). App-specific secrets (e.g. transactional email) are added
// in the milestone that introduces the feature that consumes them.
export const webDomain = new sst.Secret("WEB_DOMAIN");

export const bedrockInferenceProfileId = new sst.Secret("BEDROCK_MODEL_ID");
