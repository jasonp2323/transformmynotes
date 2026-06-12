# GitHub Secret Scanning & Push Protection

## Overview

Secret scanning and Push protection are enabled for `jasonp2323/transformmynotes` under **Settings → Security → Code security and analysis**.

Secret scanning automatically matches commits (including repository history) against GitHub's built-in partner secret-pattern database, detecting exposed API keys, tokens, cloud credentials, and other sensitive values. Push protection blocks any future push that introduces a new matching secret pattern, preventing credential leakage before code reaches the remote.

## Why

Part of M11 security hardening (Pillar 3: GitHub-native code scanning), alongside CodeQL SAST and Dependabot. Both features are free on public repositories.

## Verify It's Enabled

Check the GitHub UI:
- Navigate to **Security tab → "Secret scanning alerts"** and confirm "Enabled"

Or via CLI:
```bash
gh api repos/jasonp2323/transformmynotes \
  -q ".security_and_analysis.secret_scanning.status"       # returns "enabled"

gh api repos/jasonp2323/transformmynotes \
  -q ".security_and_analysis.secret_scanning_push_protection.status"  # returns "enabled"
```

## Handling a Push-Protection Block

If `git push` is blocked by push protection:

1. **Prefer removing or rotating the value.** Any secret committed to version control is compromised by definition — even if removed later, it remains in history.
2. **If it's genuinely safe** (e.g., a documented Cloudflare Turnstile test key or a public Cognito user-pool ID):
   - The GitHub UI will prompt you to **bypass with a reason**.
   - Document why in the bypass reason (e.g., "Test fixture, no production use").
   - Do not bypass real credentials — rotate and revoke instead.

## Handling a Secret-Scanning Alert

When an alert surfaces in the **Security → Secret scanning** tab:

- **If it's a real leaked credential:** The secret is **already compromised** (it was committed at some point, even if now removed). Immediately revoke and rotate it from its service (API provider, cloud console, etc.), then close the alert as **"Revoked"**.
- **If it's a false positive or test fixture:** Close it as **"Used in tests"** or **"False positive"** with a brief note (e.g., "Cognito test pool ID, public by design").

## No Workflow Required

Secret scanning and push protection are repo-settings features, enabled once by the repository administrator. No GitHub Actions workflow or configuration is needed.
