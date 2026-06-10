# Changelog

## [1.22.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.21.0...transformmynotes-v1.22.0) (2026-06-10)


### 🚀 Features

* **application:** AdminPending registrations queue page (M3.7) ([#214](https://github.com/jasonp2323/transformmynotes/issues/214)) ([1fd37d9](https://github.com/jasonp2323/transformmynotes/commit/1fd37d9d1c555f1cfb05b323c7adb81b08854829))
* **application:** AdminUsers members management page (M3.8) ([#217](https://github.com/jasonp2323/transformmynotes/issues/217)) ([3e5cc35](https://github.com/jasonp2323/transformmynotes/commit/3e5cc351d88e294df2d89ff46693e1ad023c912b))
* **application:** POST /api/transcribe route handler (M4.6) ([#216](https://github.com/jasonp2323/transformmynotes/issues/216)) ([0c60839](https://github.com/jasonp2323/transformmynotes/commit/0c60839703d08e5482f580aefe71cb1ae7cca59b)), closes [#54](https://github.com/jasonp2323/transformmynotes/issues/54)

## [1.21.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.20.0...transformmynotes-v1.21.0) (2026-06-10)


### 🚀 Features

* **ocr:** Bedrock Converse transcription + retry + markdown post-processing (M4.5) ([#211](https://github.com/jasonp2323/transformmynotes/issues/211)) ([ceeec6d](https://github.com/jasonp2323/transformmynotes/commit/ceeec6dcc24f2caddd2d9cf9a6cb0b28d094dd93))

## [1.20.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.19.0...transformmynotes-v1.20.0) (2026-06-10)


### 🚀 Features

* **application:** admin DesktopShell layout + EmptyPanel + status tones (M3.6) ([#210](https://github.com/jasonp2323/transformmynotes/issues/210)) ([9e2a453](https://github.com/jasonp2323/transformmynotes/commit/9e2a453ecfd84dea3e719e79947c5b5531b9edb8))

## [1.19.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.18.0...transformmynotes-v1.19.0) (2026-06-10)


### 🚀 Features

* **capture:** client-side image resize + presigned upload pipeline (M4.4) ([#207](https://github.com/jasonp2323/transformmynotes/issues/207)) ([94320ec](https://github.com/jasonp2323/transformmynotes/commit/94320ecf9e319a26d6c055e9151f4a729e12b3a7))

## [1.18.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.17.0...transformmynotes-v1.18.0) (2026-06-10)


### 🚀 Features

* **application:** approve/reject + user management API routes (M3.5) ([#206](https://github.com/jasonp2323/transformmynotes/issues/206)) ([5c182be](https://github.com/jasonp2323/transformmynotes/commit/5c182be2baab9d56d6c424133637f9c8b64b42fb))

## [1.17.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.16.0...transformmynotes-v1.17.0) (2026-06-09)


### 🚀 Features

* **application:** admin invite create/revoke API routes (M3.4) ([#204](https://github.com/jasonp2323/transformmynotes/issues/204)) ([527f48b](https://github.com/jasonp2323/transformmynotes/commit/527f48b5ff15fb6fe3b020b7283f666f022a627b))

## [1.16.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.15.0...transformmynotes-v1.16.0) (2026-06-09)


### 🚀 Features

* **application:** POST /api/notes/upload-url presigned S3 route (M4.3) ([#202](https://github.com/jasonp2323/transformmynotes/issues/202)) ([301fdf5](https://github.com/jasonp2323/transformmynotes/commit/301fdf50471d1e566924d998a2d2ec6cdd327f94))
* **application:** Resend email helpers + INVITE_FROM_ADDRESS secret (M3.3) ([#201](https://github.com/jasonp2323/transformmynotes/issues/201)) ([b649f44](https://github.com/jasonp2323/transformmynotes/commit/b649f44db2b9a9e3c4789ece7ed9c80239fc649a)), closes [#47](https://github.com/jasonp2323/transformmynotes/issues/47)
* **core:** Groups table, key builders + integration tests (M3.2) ([#199](https://github.com/jasonp2323/transformmynotes/issues/199)) ([6da1853](https://github.com/jasonp2323/transformmynotes/commit/6da185332315f5266d45a383e79df6b0d25df8aa))
* **core:** TranscriptionJob + storage key builders + integration test (M4.2) ([#200](https://github.com/jasonp2323/transformmynotes/issues/200)) ([3baeb42](https://github.com/jasonp2323/transformmynotes/commit/3baeb42701f8e4f6629a9b5fdcd5c105d8776706)), closes [#32](https://github.com/jasonp2323/transformmynotes/issues/32)
* **infra:** NotesBucket S3 + BEDROCK_MODEL_ID secret + scoped Bedrock IAM (M4.1) ([#197](https://github.com/jasonp2323/transformmynotes/issues/197)) ([9f55355](https://github.com/jasonp2323/transformmynotes/commit/9f55355971a7e8ec4cd353357d05f68d61e6407d)), closes [#29](https://github.com/jasonp2323/transformmynotes/issues/29)


### 🐛 Fixes

* **release:** surface all conventional commit types in release-please changelog ([#203](https://github.com/jasonp2323/transformmynotes/issues/203)) ([3f0812e](https://github.com/jasonp2323/transformmynotes/commit/3f0812e109a357cd95dccdf859cd4d4ab89f6c41))


### ✅ Tests

* **core:** concurrent double-redemption guard for invite claims (M3.1) ([#196](https://github.com/jasonp2323/transformmynotes/issues/196)) ([ccc87f7](https://github.com/jasonp2323/transformmynotes/commit/ccc87f7b390fab3303a9338bee4ff86d6dbd870a))

## [1.15.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.14.0...transformmynotes-v1.15.0) (2026-06-09)


### Features

* **application:** route gating — admin claim gate + active-status server gate (M2.8) ([#192](https://github.com/jasonp2323/transformmynotes/issues/192)) ([f78f9c0](https://github.com/jasonp2323/transformmynotes/commit/f78f9c0d39e37ac9c577107cb744cdb35ff96968))

## [1.14.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.13.0...transformmynotes-v1.14.0) (2026-06-09)


### Features

* **application:** invite-accept page + redemption infra (M2.7) ([#191](https://github.com/jasonp2323/transformmynotes/issues/191)) ([c9164c9](https://github.com/jasonp2323/transformmynotes/commit/c9164c99d6c1efccb0a4147eb9933a08bb94ce71))
* **application:** Request Access page + capture endpoint (M2.5) ([#188](https://github.com/jasonp2323/transformmynotes/issues/188)) ([97fe87d](https://github.com/jasonp2323/transformmynotes/commit/97fe87d91361ae57245fb560b58328399d9778af))
* **application:** request-received confirmation page (/pending) (M2.6) ([#190](https://github.com/jasonp2323/transformmynotes/issues/190)) ([88ba0a6](https://github.com/jasonp2323/transformmynotes/commit/88ba0a6ad8079d242c991c8fb9b438b6c26c4151)), closes [#43](https://github.com/jasonp2323/transformmynotes/issues/43)

## [1.13.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.12.0...transformmynotes-v1.13.0) (2026-06-09)


### Features

* **marketing:** public /changelog page rendering GitHub Releases (M9.8) ([#163](https://github.com/jasonp2323/transformmynotes/issues/163)) ([e24fd37](https://github.com/jasonp2323/transformmynotes/commit/e24fd378373bf66415b879aeb2617877cd63fe9b))

## [1.12.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.11.0...transformmynotes-v1.12.0) (2026-06-09)


### Features

* **application:** login + forgot/reset-password pages (M2.4) ([#161](https://github.com/jasonp2323/transformmynotes/issues/161)) ([bd85445](https://github.com/jasonp2323/transformmynotes/commit/bd854459be173eee2b5a5d9263fb16ca229b9461))

## [1.11.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.10.0...transformmynotes-v1.11.0) (2026-06-09)


### Features

* **application:** centralize Amplify Auth config at app root (M2.3) ([#158](https://github.com/jasonp2323/transformmynotes/issues/158)) ([c4f73a9](https://github.com/jasonp2323/transformmynotes/commit/c4f73a9ea955646616011d00d4c05dec477bf17f))

## [1.10.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.9.0...transformmynotes-v1.10.0) (2026-06-09)


### Features

* **marketing:** SEO, Open Graph & sitemap (M9.6) ([9f7b83d](https://github.com/jasonp2323/transformmynotes/commit/9f7b83d9e89e1450834aad3c343812c082d258fb)), closes [#8](https://github.com/jasonp2323/transformmynotes/issues/8)

## [1.9.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.8.0...transformmynotes-v1.9.0) (2026-06-08)


### Features

* **auth:** Post-Confirmation Lambda for user provisioning (M2.2) ([#154](https://github.com/jasonp2323/transformmynotes/issues/154)) ([4e29224](https://github.com/jasonp2323/transformmynotes/commit/4e292242b94d24303c45ab85d009c9fb31f1e457))

## [1.8.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.7.0...transformmynotes-v1.8.0) (2026-06-08)


### Features

* **marketing:** "Request access" CTA strip (M9.5) ([#151](https://github.com/jasonp2323/transformmynotes/issues/151)) ([79126bc](https://github.com/jasonp2323/transformmynotes/commit/79126bcfb1c45fb15eda0d9a64da4131b83bd548)), closes [#7](https://github.com/jasonp2323/transformmynotes/issues/7)

## [1.7.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.6.0...transformmynotes-v1.7.0) (2026-06-08)


### Features

* **core:** add UserData GSI1 status index + key builders (M2.1) ([04f248d](https://github.com/jasonp2323/transformmynotes/commit/04f248d488fa735ade7b3f2608a59dbcbe5e21fd)), closes [#33](https://github.com/jasonp2323/transformmynotes/issues/33)

## [1.6.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.5.0...transformmynotes-v1.6.0) (2026-06-08)


### Features

* **marketing:** "How it works" three-step section (M9.4) ([#148](https://github.com/jasonp2323/transformmynotes/issues/148)) ([a9938b6](https://github.com/jasonp2323/transformmynotes/commit/a9938b6cfd5271e3cb8170575c04d9ae8e882363)), closes [#6](https://github.com/jasonp2323/transformmynotes/issues/6)

## [1.5.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.4.0...transformmynotes-v1.5.0) (2026-06-08)


### Features

* **application:** ds-test showcase route + M1 verification screenshots (M1.9) ([#146](https://github.com/jasonp2323/transformmynotes/issues/146)) ([f10fcda](https://github.com/jasonp2323/transformmynotes/commit/f10fcda98e4d1ff2fee62cbd79b6caec3bf820b1)), closes [#23](https://github.com/jasonp2323/transformmynotes/issues/23)

## [1.4.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.3.0...transformmynotes-v1.4.0) (2026-06-08)


### Features

* **marketing:** feature/benefit cards section (M9.3) ([#144](https://github.com/jasonp2323/transformmynotes/issues/144)) ([d70397a](https://github.com/jasonp2323/transformmynotes/commit/d70397a3337dc6e7f0bf8f4cd0de130ffe4253a9))

## [1.3.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.2.0...transformmynotes-v1.3.0) (2026-06-08)


### Features

* **application:** wire dashboard & login pages to design system (M1.8) ([#141](https://github.com/jasonp2323/transformmynotes/issues/141)) ([66513a7](https://github.com/jasonp2323/transformmynotes/commit/66513a7730c5718a5dcd7c4ee4cf0011f57f5dcd))

## [1.2.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.1.0...transformmynotes-v1.2.0) (2026-06-08)


### Features

* **application:** pure Markdown renderer + .md-body styles (M1.7) ([#136](https://github.com/jasonp2323/transformmynotes/issues/136)) ([c93aede](https://github.com/jasonp2323/transformmynotes/commit/c93aedec1e4598e3488c9bc214b3316a14304138)), closes [#19](https://github.com/jasonp2323/transformmynotes/issues/19)
* **marketing:** hero section — header, transform visual & CTAs (M9.2) ([#140](https://github.com/jasonp2323/transformmynotes/issues/140)) ([b921778](https://github.com/jasonp2323/transformmynotes/commit/b921778857141d3f7b08ea3242ec40a41096149f))
* **marketing:** page shell & scaffold from design tokens (M9.1) ([#134](https://github.com/jasonp2323/transformmynotes/issues/134)) ([07337c2](https://github.com/jasonp2323/transformmynotes/commit/07337c2ab00760a7dc085e7e38b7c8109885bb61))


### Bug Fixes

* **scripts:** add missing release-notes-pure module ([#139](https://github.com/jasonp2323/transformmynotes/issues/139)) ([e43a2f0](https://github.com/jasonp2323/transformmynotes/commit/e43a2f03102164aab2212d8d587a34875eed94a0)), closes [#137](https://github.com/jasonp2323/transformmynotes/issues/137)

## [1.1.0](https://github.com/jasonp2323/transformmynotes/compare/transformmynotes-v1.0.0...transformmynotes-v1.1.0) (2026-06-08)


### Features

* **application:** app shells — MobileShell, DesktopShell, AppShell (M1.6) ([#133](https://github.com/jasonp2323/transformmynotes/issues/133)) ([7470429](https://github.com/jasonp2323/transformmynotes/commit/7470429305e1dc4484b248034f4c43722194f326)), closes [#18](https://github.com/jasonp2323/transformmynotes/issues/18)

## 1.0.0 (2026-06-08)


### Features

* **application:** core form components — Button, IconButton, Input, Textarea, Select, Checkbox, Switch (M1.3) ([#125](https://github.com/jasonp2323/transformmynotes/issues/125)) ([f74d5d4](https://github.com/jasonp2323/transformmynotes/commit/f74d5d4f2fdb574bef9af35d2fa7d422397234f3))
* **application:** data-display components — Badge, Tag, Avatar, Card, NoteCard, HighlightText, HandNote (M1.4) ([#126](https://github.com/jasonp2323/transformmynotes/issues/126)) ([07d312d](https://github.com/jasonp2323/transformmynotes/commit/07d312d11a017d8723db32b1a95d50c54498249f)), closes [#15](https://github.com/jasonp2323/transformmynotes/issues/15)
* **application:** Icon component backed by lucide-react (M1.2) ([#124](https://github.com/jasonp2323/transformmynotes/issues/124)) ([858b21c](https://github.com/jasonp2323/transformmynotes/commit/858b21c21d166fcd25d9626d2414646df07ccc36)), closes [#12](https://github.com/jasonp2323/transformmynotes/issues/12)
* **application:** navigation components — Tabs, SegmentedControl, Toast, Dialog (M1.5) ([#130](https://github.com/jasonp2323/transformmynotes/issues/130)) ([a0d1647](https://github.com/jasonp2323/transformmynotes/commit/a0d16471671c1f0198cf4959f58879544acfc2fa)), closes [#16](https://github.com/jasonp2323/transformmynotes/issues/16)
* **application:** self-host fonts + CSS design tokens + Tailwind (M1.1) ([#123](https://github.com/jasonp2323/transformmynotes/issues/123)) ([4a52151](https://github.com/jasonp2323/transformmynotes/commit/4a52151fbca0377578ac86404814fb5799f78a0c))
* **core:** db client, table-name map, key builders + unit test (M0.3) ([#118](https://github.com/jasonp2323/transformmynotes/issues/118)) ([026b9ae](https://github.com/jasonp2323/transformmynotes/commit/026b9aed2fb91a78acbfc4b63f6b78c29b2fa51c))
