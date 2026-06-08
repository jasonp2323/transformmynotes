# M9 Design Prompt — TransformMyNotes Marketing Landing Page

This file is a prompt for **Claude Design** to produce the visual designs for the TransformMyNotes marketing landing page. The resulting design files will be saved into `.design/marketing/` and used by engineers to implement the page.

---

## What we're building

**TransformMyNotes** is an invite-gated app that turns a photo of handwritten notes into clean, highlighted, searchable digital notes. AI reads the handwriting and does the transformation work; the result is a personal, searchable note library with study and sharing features.

This page is the **public marketing landing page** at `transformmynotes.com`. It has no login, no forms, and no interactive features — its single job is to tell the brand story and drive qualified visitors to request access to the app. Access is invite-gated.

The two calls-to-action used throughout the page are:
- **Primary: "Request access"** — links to `https://app.transformmynotes.com/signup`
- **Secondary: "Sign in"** — links to `https://app.transformmynotes.com/login`

---

## Constraints for you (the designer)

This brief covers **layout, structure, and content only**. Apply your own design system, type choices, and color palette. Do not expect any direction on fonts, colors, spacing tokens, border treatments, shadows, animation timing, or visual styling — those decisions are entirely yours.

---

## Section-by-section breakdown

---

### Section 1 — Header / Navigation

**Structure**

A slim, persistent header bar across the full width of the page. The logo lockup ("TransformMyNotes") sits on the left. Navigation actions sit on the right.

The header contains two actions: a primary "Request access" button and a "Sign in" link.

On narrow screens: the logo and a single primary "Request access" button remain visible; "Sign in" may be tucked into a menu or hidden to reduce clutter — designer's call.

**Open design question (for designer to decide):** Should "Sign in" appear in the header at all times, or only after the visitor scrolls past the hero? Either approach is valid; the goal is to surface it without distracting from the primary CTA during first impressions.

**Content**
- Logo: the wordmark "TransformMyNotes"
- Primary action label: "Request access" → `https://app.transformmynotes.com/signup`
- Secondary action label: "Sign in" → `https://app.transformmynotes.com/login`

**Responsive behavior**

On wide screens: logo left-aligned, both actions right-aligned in a single row. On narrow screens: logo left, at minimum one action (primary "Request access") on the right; "Sign in" can be deprioritized or moved.

---

### Section 2 — Hero

**Structure**

The hero is the first full-width section below the header. On wide screens it is a two-column layout: the left column holds all the text content; the right column holds an illustrative visual depicting a handwritten page being transformed into a clean digital note (the "before / after" motif). On narrow screens the two columns collapse into a single vertical stack, text above illustration.

Within the text column (from top to bottom):
1. A short handwritten-style accent phrase — a one-liner that foreshadows the headline
2. The main display headline — large, prominent, one key word visually emphasized (e.g. marked or highlighted in some way to draw the eye)
3. A supporting sub-headline — one to two sentences
4. Two CTA actions side by side (or stacked on very narrow screens): a primary button and a secondary link

The illustrative visual on the right (wide screens) depicts the transformation concept: a photograph or sketch of a handwritten page on one side, and a clean formatted note — with highlighted text — on the other. This can be treated as a stylized illustration rather than a real photo; the concept is more important than literal photography.

**Content** *(suggested — designer may refine)*

- Accent phrase (handwriting-style): *"your notes, transformed"*
- Main headline: **"Your handwriting, transformed"** — with the word *transformed* visually emphasized (e.g. highlighted, underlined, or otherwise set apart)
- Sub-headline: *Snap a photo of your handwritten notes. AI reads your handwriting and turns it into clean, searchable, highlighted notes — ready to study and share.*
- Primary CTA: "Request access" → `https://app.transformmynotes.com/signup`
- Secondary CTA: "Sign in" → `https://app.transformmynotes.com/login`

**Responsive behavior**

On wide screens: two-column, text left, illustration right, both columns vertically centered. On narrow screens: single column, text first, illustration below (or illustration may be condensed / hidden if it crowds the content on very small viewports).

---

### Section 3 — Feature / Benefit Cards

**Structure**

A grid of six cards. Each card contains: a small icon, a short bold title, and a one-sentence benefit description. The cards are purely informational — no links, no actions.

The grid is responsive: on wide screens it displays three cards per row (two rows of three); on mid-size screens it displays two cards per row; on narrow screens it collapses to a single column (one card per row, stacked).

**Content** *(suggested — designer may refine the phrasing)*

1. **Capture** — *Snap a photo of any handwritten page with your phone camera.*
2. **Transform** — *AI reads your handwriting and produces clean, highlighted notes — no manual typing.*
3. **Search** — *Full-text search across every note you've ever transformed.*
4. **Review** — *A built-in spaced-repetition study deck keeps your learning active.*
5. **Groups** — *Share notes inside invite-gated groups — your knowledge, with your people.*
6. **Invite-gated access** — *A calm, members-only space — no noise, no open sign-ups.*

**Responsive behavior**

Three columns on wide screens, two columns on mid-size screens, one column on narrow screens.

---

### Section 4 — How It Works (Three Steps)

**Structure**

A numbered three-step sequence that walks the visitor through the core flow. On wide screens the three steps are arranged in a horizontal row, left to right, with a visual connector (a line or arrow motif) between them. On narrow screens the steps collapse into a vertical stack, top to bottom.

Each step contains:
- A large step number (1, 2, 3) — treated decoratively, not as a heading
- A short step title
- A one-sentence description

The section has its own heading above the steps.

**Content** *(suggested — designer may refine)*

Section heading: **"How it works"**

1. **Snap** — *Photograph your handwritten page with your phone. Any handwriting, any paper.*
2. **Transform** — *The AI reads your handwriting and produces clean, highlighted notes in seconds.*
3. **Study** — *Search, review with spaced repetition, and share in invite-gated groups.*

**Responsive behavior**

On wide screens: three steps in a horizontal row, each step taking roughly equal width, with a decorative connector element between them. On narrow screens: three steps stacked vertically, each occupying the full width.

---

### Section 5 — "Request Access" Call-to-Action Strip

**Structure**

A full-width section near the bottom of the page, visually distinct from the surrounding sections (different background treatment or added weight). Contains a short headline, a supporting sub-headline below it, and the two CTAs: a prominent primary button and a secondary text link. No form, no input fields.

The elements are center-aligned on both wide and narrow screens.

**Content** *(suggested — designer may refine)*

- Headline: **"Ready to transform your notes?"**
- Sub-headline: *Access is invite-gated. Request your spot and we'll be in touch.*
- Primary CTA: "Request access" → `https://app.transformmynotes.com/signup`
- Secondary CTA: "Sign in" → `https://app.transformmynotes.com/login`

**Responsive behavior**

Full-width on all screen sizes. On narrow screens the headline, sub-headline, and CTAs stack vertically and remain center-aligned. The primary button and secondary link may be stacked vertically on very narrow screens if side-by-side placement is too tight.

---

### Section 6 — Footer

**Structure**

A minimal footer across the full page width. Contains the logo (mark or wordmark) on the left or centered, a short tagline, and a small set of links. Keep the footer visually quiet — it should not compete with the CTA strip directly above it.

**Content** *(suggested — designer may refine)*

- Logo: the TransformMyNotes logo mark or wordmark
- Tagline: *Your handwriting, transformed.*
- Links: "Sign in" → `https://app.transformmynotes.com/login` · "Request access" → `https://app.transformmynotes.com/signup`

**Responsive behavior**

On wide screens: logo and tagline on the left, links on the right, all in a single row. On narrow screens: stack into a single centered column (logo / tagline / links).

---

## Deliverables

Full landing page design — responsive, covering both phone (narrow) and wide-screen layouts — for all six sections above: header/nav, hero, feature cards, how it works, CTA strip, and footer.
