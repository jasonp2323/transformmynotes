# Admin Bootstrap → moved

This runbook has been superseded by **[`bootstrap-admin.md`](./bootstrap-admin.md)**.

The M0-era version covered only the Cognito side (create the user, add them to the `admin`
group). As of M2.8, notebook routes also gate on a `UserData` profile with `status: "active"`
(`requireActiveUser` in `packages/application/lib/require-user.ts`), so a console-created admin
needs a **second** record — the profile item — or they're held at `/pending`. The full, current
procedure (Cognito user + `admin` group + the `UserData` profile seed, plus the member-account
variant) lives in `bootstrap-admin.md`.

➡️ **See [`docs/runbooks/bootstrap-admin.md`](./bootstrap-admin.md).**
