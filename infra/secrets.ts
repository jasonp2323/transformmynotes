/// <reference path="../.sst/platform/config.d.ts" />

// All values are seeded per-stage via the SST Console (production env + the
// fallback env that covers pr-<N>). No empty/placeholder fallbacks — a missing
// value fails loudly at deploy when its .value is accessed (production only at M0).
export const webDomain = new sst.Secret("WEB_DOMAIN");
export const turnstileSiteKey = new sst.Secret("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
export const turnstileSecret = new sst.Secret("TURNSTILE_SECRET");
export const resendApiKey = new sst.Secret("RESEND_API_KEY");
export const contactToAddress = new sst.Secret("CONTACT_TO_ADDRESS");
export const contactFromAddress = new sst.Secret("CONTACT_FROM_ADDRESS");
