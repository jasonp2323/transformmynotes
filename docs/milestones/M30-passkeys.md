# M30 · Passkey / biometric sign-in (OUTLINE — not yet scheduled)

> Size: XL (estimate) · Depends on: M29 (MFA foundation), and a decision to adopt the paid Cognito **Essentials** feature tier
>
> **Status: outline only.** This milestone is parked on the roadmap. Do **not** start it without an
> explicit decision to (a) pay for the Cognito Essentials tier and (b) migrate the auth flow. The
> detailed phase/subtask decomposition is deferred until it's about to be picked up (per the
> "plan in detail only what you're about to build" convention).

## Goal

Let users sign in with a **passkey / biometric** (Touch ID, Windows Hello, or a hardware security
key) via **WebAuthn**, as a passwordless or stronger-than-TOTP authentication option — building on
the MFA foundation from M29.

## Why it's parked (the cost + migration caveats)

- **Paid feature tier.** Cognito passkey/WebAuthn support (`WebAuthnConfigurationType`,
  passkey-as-MFA / passwordless) requires the **Essentials** Cognito feature plan or higher — a
  per-MAU paid tier we are **not** currently on. This is the blocking decision.
- **Auth-flow migration.** Passkeys need the **new managed-login UI** and/or the **`USER_AUTH`
  choice-based auth flow**. The app currently uses `USER_PASSWORD_AUTH` / SRP via Amplify, so
  adopting passkeys means migrating the sign-in flow (and likely upgrading/realigning the Amplify
  auth integration) — a substantial change to the M2 auth surface, not an additive feature.
- **Relying-party + domain setup.** WebAuthn requires a configured relying-party ID (the app
  domain), user-verification policy, and platform/browser support handling.

## In scope (when adopted)

- Enable Cognito WebAuthn (`mfaConfiguration` / passkey config: relying-party ID, user
  verification, single-factor vs MFA treatment) on the Essentials tier.
- Migrate sign-in to the `USER_AUTH` choice-based flow (or managed login) supporting passkey +
  password fallback.
- Self-service passkey registration + management (list / rename / remove credentials) in
  `/account/mfa` alongside (or partly replacing) TOTP.
- Decide passkey's relationship to M29's enforcement model (does a registered passkey satisfy the
  "MFA required" policy? is it a first factor or a second factor?).

## Out of scope / open questions (to resolve before scheduling)

- Whether passkeys **replace** TOTP, **supplement** it, or are an alternative the user chooses.
- Whether to adopt Cognito **managed login** wholesale vs. only the `USER_AUTH` flow with our own
  UI.
- Cost modelling of the Essentials tier at expected MAU.
- Mobile (Capacitor WebView) passkey support + platform-authenticator behavior.

## Next step

When the team decides to pay for Essentials and migrate the auth flow, run the brainstorm skill
(Mode A) against this outline to produce the full phase/subtask decomposition and the GitHub epic.
