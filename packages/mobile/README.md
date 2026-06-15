# packages/mobile — Capacitor Android Shell

## Overview

`packages/mobile` (`@transformmynotes/mobile`) is the Capacitor Android shell that wraps the live hosted app at `https://app.transformmynotes.com` in a native WebView via `server.url`. There is no static web bundle shipped inside the APK — the app is a server-side-rendered Next.js application, and the shell simply points the WebView at the live URL. This makes it a pure client artifact: it has no SST entrypoint, is excluded from the SST deploy path, and does not appear in `infra/`. Release builds run in a separate `.github/workflows/android.yml`, triggered by a `mobile-v*` tag push or `workflow_dispatch`, completely independent of `deploy.yml`.

---

## Prerequisites

Before working with this package, ensure the following are installed and configured:

- **JDK 17 (Temurin recommended)** — required by Android Gradle Plugin 8+. Other JDK 17 distributions work, but Temurin is the most widely tested.
- **Android Studio** (recommended) or the Android command-line tools. Either way you need:
  - An installed Android SDK platform (e.g. API 35) and matching build-tools.
  - A configured emulator image or a physical device with USB debugging enabled.
- **Environment variables** — set in your shell profile:
  ```bash
  export ANDROID_HOME=$HOME/Library/Android/sdk   # adjust to your SDK location
  export ANDROID_SDK_ROOT=$ANDROID_HOME            # some tools read this alias
  export JAVA_HOME=$(/usr/libexec/java_home -v 17) # macOS; adjust for Linux
  export PATH=$PATH:$ANDROID_HOME/emulator
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```
- **Node 22** — run `npm ci` from the repo root first to install all workspace dependencies.

---

## Pointing the Shell at a URL (`CAPACITOR_SERVER_URL`)

`capacitor.config.ts` reads `process.env.CAPACITOR_SERVER_URL` at sync time to set `server.url`. If the variable is unset the config falls back to the production URL.

| Target | `CAPACITOR_SERVER_URL` value |
|---|---|
| Production (default) | *(unset — the shell uses `https://app.transformmynotes.com`)* |
| A PR stage | `https://pr-5.pr.transformmynotes.com` |
| Local dev server | `http://192.168.x.x:3002` *(see note below)* |

**Local dev server note:** use your machine's LAN IP address, not `localhost` — a device or emulator cannot reach the host machine via `localhost`. The `dev:application` server runs on port **3002** (`npm run dev:application` from the repo root). When the URL starts with `http://`, `capacitor.config.ts` automatically sets `cleartext: true`, so you do not need to make any config edits.

The env var is consumed only at `cap sync` time (when `capacitor.config.ts` is evaluated and written into the Android project). Changing the URL requires a fresh sync.

---

## Run on an Android Emulator or Device

Run the following from the `packages/mobile` directory, substituting the URL you want to target:

```bash
# Target a PR stage
CAPACITOR_SERVER_URL=https://pr-5.pr.transformmynotes.com npx cap sync android
npx cap run android

# Target production (default)
npx cap sync android
npx cap run android

# Target a local dev server (use your machine's LAN IP)
CAPACITOR_SERVER_URL=http://192.168.1.42:3002 npx cap sync android
npx cap run android
```

**Shortcuts from the repo root:**

```bash
# Sync only (wraps `cap sync android`)
CAPACITOR_SERVER_URL=https://pr-5.pr.transformmynotes.com npm run sync -w packages/mobile
```

`npx cap run android` lists all available connected devices and running emulators and lets you choose one interactively. To target a specific device non-interactively, pass `--target <device-id>` (the id comes from `adb devices`).

---

## Build a Debug APK

From the `packages/mobile/android` directory:

```bash
./gradlew assembleDebug
```

Output APK:

```
packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Install directly onto a connected device or running emulator:

```bash
adb install -r packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Release Keystore

### Generate the keystore

Run this once and store the output file securely:

```bash
keytool -genkey -v -keystore release.jks -alias transformmynotes -keyalg RSA -keysize 2048 -validity 10000
```

> **The keystore is unrecoverable if lost.** Android ties an installed app's identity to its signing certificate — an update signed with a different key will NOT install over an existing install (users would have to uninstall and reinstall, losing nothing server-side but a poor UX). Back it up securely (e.g. AWS Secrets Manager or an encrypted offline backup). **Never commit `release.jks` to the repository.**

### Gradle signing properties

The `release` signingConfig in `android/app/build.gradle` reads four Gradle project properties (applied only when `RELEASE_STORE_FILE` is present):

| Property | Description |
|---|---|
| `RELEASE_STORE_FILE` | Absolute path to `release.jks` |
| `RELEASE_STORE_PASSWORD` | Password set when the keystore was created |
| `RELEASE_KEY_ALIAS` | Key alias — `transformmynotes` |
| `RELEASE_KEY_PASSWORD` | Key password (may match `RELEASE_STORE_PASSWORD`) |

Pass them via `-P` flags on the Gradle command line, or place them in an uncommitted `gradle.properties` or `local.properties` file inside `packages/mobile/android/` (add these files to `.gitignore` — they must never be committed).

### Build a signed release APK

From the `packages/mobile/android` directory:

```bash
./gradlew assembleRelease \
  -PRELEASE_STORE_FILE=/absolute/path/to/release.jks \
  -PRELEASE_STORE_PASSWORD=your_store_password \
  -PRELEASE_KEY_ALIAS=transformmynotes \
  -PRELEASE_KEY_PASSWORD=your_key_password
```

Output APK (the file end users sideload — distributed via GitHub Releases, not an app store):

```
packages/mobile/android/app/build/outputs/apk/release/app-release.apk
```

---

## SHA-256 Fingerprint for `assetlinks.json`

Android App Links (and Cognito Hosted-UI redirect-URI handling) require a Digital Asset Links document at `/.well-known/assetlinks.json` on the domain. That document must contain the SHA-256 fingerprint of the release signing certificate. Extract it from the keystore:

```bash
keytool -list -v -keystore release.jks -alias transformmynotes | grep SHA256
```

Copy the `SHA256:` line into the `assetlinks.json` document. This is wired up on the application side in M12.2.

---

## Version Bumping Before a Release

Before cutting a release, bump the version from the repo root:

```bash
npm run bump-version -w packages/mobile
```

`scripts/bump-version.ts` reads the root `package.json` `version` field, sets `versionName` to match, and increments `versionCode` by 1 in `android/app/build.gradle`. After running it:

1. Review the diff to confirm `versionCode` and `versionName` look correct.
2. Commit the change with a message like `chore(mobile): bump version to x.y.z`.
3. Push and tag: `git tag mobile-vx.y.z && git push origin mobile-vx.y.z`.

**Important:** `versionCode` must be monotonically increasing for every published release and must never be auto-incremented by CI — doing so creates drift risk if a CI run fails mid-build. Always bump on the release coordinator's machine and commit the result.

Current values (as of last commit): `versionCode 2`, `versionName "1.40.1"`.

---

## CI — Android Release Builds

Android release builds run in `.github/workflows/android.yml`, added in M12.3. That workflow is triggered by a `mobile-v*` tag push or `workflow_dispatch`. It builds the signed release APK, uploads it as a workflow artifact and attaches it to the GitHub Release for the tag, and is completely independent of `deploy.yml` — it has no SST or AWS deploy steps. The SST/Pulumi deploy path (PR stages, `production`) is never aware of the mobile package.

---

## APK distribution & install (sideload) runbook

### Cutting a release

1. Bump the version from the repo root:
   ```bash
   npm run bump-version -w packages/mobile
   ```
   This script reads the root `package.json` `version` field, sets `versionName` to match, and increments `versionCode` by 1 in `android/app/build.gradle`. See the "## Version Bumping Before a Release" section above for full details on the bump process.

2. Commit the version bump:
   ```bash
   git commit -m "chore(mobile): bump version to x.y.z"
   ```
   Replace `x.y.z` with the actual version number.

3. Push a `mobile-v<x.y.z>` tag (e.g., for version 1.41.0):
   ```bash
   git tag mobile-v1.41.0 && git push origin mobile-v1.41.0
   ```

4. The tag push automatically triggers `.github/workflows/android.yml`, which:
   - Builds the signed `app-release.apk`
   - Uploads it as a workflow artifact
   - Attaches it to the GitHub Release for that tag, providing a stable public download URL on the Releases page

### Installing on an Android device (end users)

1. Download the `.apk` file on the Android device. You can find releases at `https://github.com/jasonp2323/transformmynotes/releases`.
2. When prompted, allow the browser or Files app to "install unknown apps" — the toggle is located under **Settings → Apps → Special app access → Install unknown apps**, granted per-app (e.g., to Chrome or Files).
3. Open the downloaded `.apk` file.
4. Tap **Install**.
5. On first launch, Android Play Protect may scan the app — this is expected and normal for sideloaded apps that aren't distributed through the Play Store.

### Updating in place (same keystore required)

A newer `mobile-v*` release carries a higher `versionCode`, so installing its APK over an existing installation updates the app **in place** without losing any data or requiring an uninstall — **provided the new APK is signed with the same release keystore**. An APK signed with a different key will be rejected by Android as a signature mismatch, and users would be forced to uninstall the old app and reinstall from scratch.

See the "## Release Keystore" section above for details on the keystore. The keystore is unrecoverable if lost and must be backed up securely — losing it means future APKs cannot be signed with the same certificate, breaking in-place updates.

### What requires a new APK (and what doesn't)

**No APK update needed for web/UI changes:** The WebView loads the UI from `server.url` (the live hosted application at `app.transformmynotes.com`). Web and UI changes ship instantly to all installed apps without requiring a new APK.

**APK update required only for native-shell changes:**
- Capacitor plugin updates or new plugins
- Android manifest modifications
- App icons or native resources
- Version code / version name bumps (required for Play Store compliance, release tracking, or app-update mechanics)

### Privacy policy

The app's privacy policy is published at `https://transformmynotes.com/privacy`.
