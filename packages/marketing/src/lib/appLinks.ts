// Base URL of the authed application. Injected per-stage by infra/marketing.ts
// (NEXT_PUBLIC_APP_URL): production -> app.transformmynotes.com, PR preview ->
// app.pr-<N>.transformmynotes.com, local -> localhost:3002. Falls back to the
// production app URL when unset (e.g. plain `next dev` / offline E2E).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.transformmynotes.com';

export const SIGNUP_URL = `${APP_URL}/request-access`;
export const LOGIN_URL = `${APP_URL}/login`;
