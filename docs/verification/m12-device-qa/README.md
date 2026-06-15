# M12.4 · Android device QA pass (#186)

Manual smoke-test of the signed Android shell on a **real device or AVD (API 33+, Pixel profile)**.
This is a human-run pass — it exercises camera, Cognito sign-in, and visual safe-area layout that
can't be verified headlessly. Capture a screenshot for each ✦ step and drop it in this folder using
the suggested filename, then tick the box. Resolve any P0/P1 bug before marking #186 Done.

## 0. Install (new on-domain download path — M12.5)

The APK is now distributed via the marketing site, not a raw GitHub link:

1. On the Android device, open **https://transformmynotes.com/download**.
2. Tap **Download for Android** (this hits `/download/android`, which 302-redirects to the latest
   `mobile-v*` release's `app-release.apk`). Confirm the browser downloads an `.apk` file.
3. Open the downloaded file. When prompted, allow the browser/Files app to **install unknown apps**
   (Settings → Apps → Special app access → Install unknown apps). Expected — first time only.
4. Tap **Install**. If **Play Protect** shows a scan/warning, choose to install anyway. Expected for
   non-Play apps.
   - ✦ `00-install-unknown-apps-prompt.png` (the "install unknown apps" gate)
   - ✦ `01-play-protect.png` (the Play Protect prompt, if shown)

> Note: `releases/latest` is the **web** release (no APK) — always test via `/download`, never `releases/latest`.

## 1. Launch / splash

- [ ] App launches; splash screen shows brand warm-ivory background + gold brandmark, then the WebView loads.
  - ✦ `02-splash.png`

## 2. Sign-in (Cognito)

- [ ] Sign in with a test account through the in-app flow; session completes and lands on the dashboard.
  - ✦ `03-dashboard.png` (dashboard rendered in the native shell)

## 3. Safe-area layout

- [ ] Top status bar and bottom nav bar do **not** obscure app content (safe-area insets respected) on a
      device with a notch/gesture bar.

## 4. Native camera capture

- [ ] From the capture flow, the **native Android camera picker** opens (not the browser file input).
  - ✦ `04-native-camera.png`
- [ ] Take/select a photo → upload → transform succeeds → a note card appears in the library.
  - ✦ `05-note-card.png`

## 5. Navigation / back button

- [ ] Android back button navigates **within** the app (WebView history) and does not exit on the first press
      from a deep screen.
  - ✦ `06-back-stays-in-app.png`

## 6. External links

- [ ] An external link (non-`transformmynotes.com`) opens in **Chrome / a Custom Tab**, not inside the shell WebView.
  - ✦ `07-external-link.png`

## 7. App Links

- [ ] Tapping an `app.transformmynotes.com` link from another app (e.g. a note/email) opens the **native app**,
      and a Cognito Hosted-UI redirect returns to the app correctly.

## 8. Session persistence

- [ ] Fully close and reopen the app — the session persists (no re-login required).

## 9. Offline graceful degradation

- [ ] With network disabled, the app shows a reasonable state (splash/offline indicator) rather than a raw
      WebView error; reconnecting recovers.

## 10. In-place update (same keystore)

- [ ] Installing a newer `mobile-v*` build over this one updates in place without an uninstall
      (only works because both are signed with the same release keystore).

---

## Exit criteria (from #186 / #383)

- All steps above exercised with expected results.
- Required ✦ screenshots committed under `docs/verification/m12-device-qa/`.
- No P0/P1 bugs open (layout not obscured by system bars; camera opens natively; Cognito sign-in completes).
- `npm run test:unit`, `npm run lint`, `npm run typecheck` green.

Committing screenshots here triggers `pr-screenshots.yml`, which embeds them in the PR comment.
