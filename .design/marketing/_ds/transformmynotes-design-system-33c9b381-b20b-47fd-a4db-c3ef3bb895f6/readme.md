# TransformMyNotes — Design System

A reusable design system for **TransformMyNotes**, a mobile-first app where language
learners turn handwritten study notes into clean, editable, searchable notes.

The whole system is built around one feeling: **a calm, warm, slightly organic place
to study and think** — not a busy productivity dashboard. Reading and writing comfort
come first. The visual story is a single idea: *a handwritten note being transformed
into clean, highlighted text.* That story drives the palette (teal → gold spectrum),
the type (a literary serif for reading, a handwriting accent for "your own words"),
and the core motif (the gold **highlighter**).

> **Audience:** solo learners and small invited groups.

---

## Sources

This system was authored from a written brand brief and a fixed colour palette — **no
codebase, Figma file, or existing screenshots were provided.** Everything here
(typography, components, the mobile UI kit, the logo) is an original interpretation of
that brief and is meant to be iterated on with the team.

- **Brief:** "calm, focused, warm, a little organic" mobile note-transformation app.
- **Palette:** the 10-stop teal→gold spectrum (see `tokens/colors.css`).

If a real codebase or Figma exists, re-attach it and these foundations should be
reconciled against the source of truth.

---

## Content fundamentals — how TransformMyNotes writes

The voice is **calm, encouraging, and quietly personal** — a patient study companion,
never a hype machine or a nagging productivity app.

- **Person:** Speak to the learner as **"you"** ("Search *your* notes", "ready to
  review"). Refer to the product as "we" rarely; mostly it's invisible.
- **Tone:** Warm and unhurried. Short, plain sentences. Encouraging without
  exclamation-mark energy. We say *"9 cards ready to review"*, not *"You crushed it! 🔥"*.
- **Casing:** **Sentence case everywhere** — buttons, titles, nav, menus
  ("Add to review deck", "Transform to clean note"). Reserve UPPERCASE for tiny
  eyebrow labels / metadata only, with letter-spacing.
- **The product's two states** have consistent names: **Original** (the raw scan /
  handwriting) and **Clean** (the transformed note). Always those two words.
- **Bilingual by nature.** Spanish/other-language fragments appear naturally inside
  English UI (e.g. *"Buenas tardes, Ana"*, *"que yo hable"*). Set foreign study text
  in the reading serif; let it breathe.
- **Numbers are gentle, not boastful.** Counts describe study state ("12 highlights",
  "1,204 words", "OCR 98%") — never vanity metrics, streaks, or pressure.
- **Emoji:** essentially none in the UI. The "handwriting" warmth comes from the Caveat
  accent font, not emoji. (A learner's *own* notes might contain a doodle ☂ — that's
  their content, not our chrome.)
- **Error/empty states** are reassuring: *"Offline — changes saved locally"*, not
  *"Sync failed."*

**Examples**
- Button: `Add to review deck` · `Transform to clean note` · `Retake`
- Greeting: `Buenas tardes, Ana — 9 cards ready to review.`
- Toast: `Note transformed — 12 highlights saved to your review deck.`
- Eyebrow: `SPANISH 201` · Meta: `es → en · 1,204 words · OCR 98%`

---

## Visual foundations

**Overall vibe:** warm paper, dark ink, a calm green-teal brand, and gold used like a
highlighter pen. Generous whitespace, soft edges, gentle motion. It should feel like an
open notebook on a sunlit desk.

- **Colour.** A single organic **spectrum** runs from deep stormy teal (`#16747e`) up
  through greens to bright **gold** (`#ffd700`) — the "transform" ramp, used as a
  gradient only for hero/mark moments. Day-to-day UI uses **teal** (`--brand`, jungle
  teal `#307f70`) for primary actions and **gold** strictly as the **highlighter
  accent** (translucent `--highlighter`), not as big fills. Functional red/amber are
  *derived* warm tones (terracotta, amber), flagged as additions to the palette.
- **Surfaces are warm paper, never stark white.** App background is warm ivory
  (`#f5f1e8`); cards are soft paper-white (`#fffdf8`). Text is warm ink (`#211e17`),
  never pure black. Neutrals are a sepia-tinted "stone" scale.
- **Type.** Reading & display = **Newsreader** (a warm literary serif). UI chrome =
  **Hanken Grotesk** (humanist sans). **Caveat** (handwriting) is a sparing accent for
  "your own words" / handwritten moments. **Spline Sans Mono** carries metadata
  (word counts, OCR, language pairs). Long-form reading uses a narrow measure (~66ch),
  18px serif, 1.7 line-height.
- **Backgrounds.** Mostly flat warm paper. The signature **gradient** (`--gradient-
  transform`) appears only on the logo mark, the capture FAB, and processing moments.
  The "handwriting" texture is faux notebook ruling (repeating-linear-gradient) behind
  Caveat text — used on the capture viewfinder and the Original view. No photographic
  hero images, no noisy textures.
- **Corner radii** are soft and generous: inputs/cards `12–16px`, sheets/dialogs
  `22px`, pills/avatars fully round. Buttons are **pill-shaped**.
- **Cards** = soft paper surface, 1px warm hairline border (`--border-subtle`), small
  diffuse shadow (`--shadow-sm`), 16–20px padding. Interactive cards lift 2px on hover.
  An optional gradient accent bar can sit across the top.
- **Shadows** are **warm-tinted** (brown-grey, not blue-grey), low and diffuse — paper
  resting on a warm desk. Inset shadow for sunken input wells. A soft teal "brand glow"
  marks active/primary emphasis.
- **Motion** is gentle and unhurried. Default easing `--ease-soft`
  `cubic-bezier(.32,.72,.26,1)` — a soft settle, nothing bounces or snaps. Durations
  140/240/380ms. Dialogs fade + rise 12px; toasts rise 10px; the highlighter can
  *swipe* left-to-right on mount. All motion respects `prefers-reduced-motion`.
- **States.** Hover = slightly darker brand / soft tinted background. Press = subtle
  shrink (`scale .92–.99`) + translateY, never a colour flash. Focus = 3px soft teal
  ring (`--focus-ring`). Disabled = reduced opacity.
- **Transparency & blur** are used deliberately for floating chrome only — the bottom
  nav and the note action bar use `rgba` paper + `backdrop-filter: blur(14px)`. The
  dialog overlay is warm ink at 42% with a small blur. Not used decoratively elsewhere.
- **Imagery vibe.** Warm, sunlit, calm. When real imagery is added it should skew warm
  and soft, never cold or high-contrast. Faux handwriting reads in a deep teal ink on
  cream paper.

---

## Iconography

**No icon set was provided in the brief.** The system standardises on
**[Lucide](https://lucide.dev)** — its calm, rounded, even-stroke outline style suits
the warm/organic feel. **This is a substitution; flag it for review** and swap to the
team's real icon set if one exists.

- **Style:** outline, 2px stroke, round caps/joins, 24px grid. Use Lucide at 18–26px.
- **Colour:** icons inherit `currentColor` — muted ink in chrome, white on brand fills,
  teal in soft buttons, gold only for the highlighter action.
- **Delivery:** loaded from the Lucide CDN
  (`https://unpkg.com/lucide@0.460.0`). In React surfaces, icons are rendered
  **as real React SVG elements** (built from `lucide.icons` data) rather than via
  DOM-replacing `createIcons()`, so they survive re-render/unmount. See the `Ico`
  helper in `ui_kits/mobile-app/app.jsx` for the safe pattern.
- **Common glyphs:** `scan-line` (capture), `sparkles` (transform), `highlighter`,
  `languages` (translate), `layers` (review deck), `book-open`, `search`, `user`,
  `check-circle-2`, `cloud-off`.
- **Emoji / unicode:** not used as UI icons. (User content may contain its own.)
- **Logo:** original mark in `assets/logo-mark.svg` (gradient squircle holding a page
  whose handwritten top line resolves into clean, highlighted lines) and
  `assets/logo-wordmark.svg`. The mark *is* the brand story in miniature.

---

## Index / manifest

**Foundations**
- `styles.css` — the single entry point consumers link (imports only).
- `tokens/colors.css` — spectrum, teal & gold scales, warm neutrals, semantic aliases.
- `tokens/typography.css` — families, scale, semantic type roles.
- `tokens/spacing.css` — 4px spacing grid, layout, reading measure.
- `tokens/effects.css` — radius, warm shadows, motion easing/durations.
- `tokens/fonts.css` — webfont loading (Google Fonts CDN — see caveat below).
- `guidelines/cards/*.html` — foundation specimen cards (Design System tab).

**Components** (`window.TransformMyNotesDesignSystem_33c9b3.*`)
- `components/buttons/` — **Button**, **IconButton**
- `components/forms/` — **Input**, **Textarea**, **Select**, **Checkbox**, **Switch**
- `components/data-display/` — **Card**, **Badge**, **Tag**, **Avatar**
- `components/navigation/` — **Tabs**, **SegmentedControl**
- `components/feedback/` — **Toast**, **Dialog**
- `components/brand/` — **HighlightText** (the highlighter motif), **NoteCard** (the
  signature library tile)

**UI kit**
- `ui_kits/mobile-app/` — interactive click-through of the app: Library → Capture →
  Transform → Clean note. `index.html` mounts it inside an iOS frame.

**Assets**
- `assets/logo-mark.svg`, `assets/logo-wordmark.svg`

**Other**
- `SKILL.md` — makes this system usable as a downloadable Agent Skill.

---

## ⚠️ Caveats / open questions for the team

1. **Fonts load from Google Fonts CDN, not self-hosted.** The sandbox can't download
   binaries, so `tokens/fonts.css` `@import`s Newsreader / Hanken Grotesk / Caveat /
   Spline Sans Mono from Google. The compiler therefore reports **0 self-hosted fonts**.
   *Send the real font files (or confirm these four families) and I'll self-host them.*
2. **Type choices are proposals.** Newsreader + Hanken Grotesk + Caveat + Spline Sans
   Mono fit the brief but weren't specified. Easy to swap.
3. **Icons = Lucide (substitution).** Confirm or replace with the brand's real set.
4. **Functional colours (danger/warning/info) are derived**, not from the source
   palette — confirm the terracotta/amber tones.
5. **The logo is an original proposal**, not a supplied asset — treat as a starting point.
