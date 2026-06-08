import { notFound } from 'next/navigation';
import { renderMarkdown } from '@/src/lib/markdown';
import {
  Button,
  Badge,
  Tag,
  HighlightText,
  HandNote,
} from '@/src/components/ui';

/** Spanish grammar note exercising all supported Markdown constructs. */
const SAMPLE_MD = `## El Subjuntivo — Spanish Grammar Notes

### What Is the Subjunctive?

The subjunctive is a ==mood== (not a tense) used to express **doubt**, *desire*, and
possibility. Mastering it is one of the biggest leaps toward fluency.

> "Quiero que tú **hables** más despacio." — I want you to speak more slowly.

### When to Use It

- After expressions of **will** or **desire**: \`querer que\`, \`esperar que\`
- After expressions of *doubt* or denial: \`dudar que\`, \`no creer que\`
- After impersonal expressions: \`es importante que\`, \`es posible que\`
- In \`ojalá\` constructions expressing ==hope==

### Formation — Present Subjunctive

| Pronoun | -ar (hablar) | -er (comer) | -ir (vivir) |
| --- | --- | --- | --- |
| yo | hable | coma | viva |
| tú | hables | comas | vivas |
| él/ella | hable | coma | viva |
| nosotros | hablemos | comamos | vivamos |

### The "WEIRDO" Trigger Categories

1. **W**ishes — querer, desear, esperar
2. **E**motion — alegrarse, temer, sorprender
3. **I**mpersonal expressions — es necesario, es raro
4. **R**ecommendations — recomendar, sugerir, aconsejar
5. **D**oubt / Denial — dudar, negar, no creer
6. **O**jalá — always triggers subjunctive

---

*Tip: If the main clause and the subordinate clause have ==different subjects==, use
\`que\` + subjunctive. Same subject? Use the infinitive instead.*
`;

export default function DesignSystemTestPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const noteHtml = renderMarkdown(SAMPLE_MD);

  return (
    <div className="bg-surface-app min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Page heading */}
        <h1 className="font-serif text-3xl font-semibold text-text-strong mb-2">
          Design System Showcase
        </h1>
        <p className="text-text-muted mb-8 text-sm">
          Dev-only · non-production gate active
        </p>

        {/* ── Component gallery ──────────────────────────────────────── */}
        <section className="mb-10 space-y-6">
          {/* Buttons */}
          <div>
            <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">
              Button variants
            </h2>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="soft">Soft</Button>
              <Button variant="accent">Accent</Button>
            </div>
          </div>

          {/* Badges */}
          <div>
            <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">
              Badge tones
            </h2>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">Neutral</Badge>
              <Badge tone="brand">Brand</Badge>
              <Badge tone="accent">Accent</Badge>
              <Badge tone="success" dot>Success</Badge>
              <Badge tone="warning" dot>Warning</Badge>
              <Badge tone="danger">Danger</Badge>
            </div>
          </div>

          {/* Tags */}
          <div>
            <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">
              Tags
            </h2>
            <div className="flex flex-wrap gap-2">
              <Tag hash>subjunctive</Tag>
              <Tag hash tone="brand">verbs</Tag>
              <Tag hash>grammar</Tag>
              <Tag hash tone="brand">B2</Tag>
            </div>
          </div>

          {/* HighlightText */}
          <div>
            <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">
              HighlightText variants
            </h2>
            <p className="font-serif text-lg text-text-body leading-relaxed space-x-2">
              <HighlightText variant="gold">Gold highlight</HighlightText>{' '}
              <HighlightText variant="teal">Teal highlight</HighlightText>{' '}
              <HighlightText variant="strong">Strong highlight</HighlightText>
            </p>
          </div>

          {/* HandNote */}
          <div>
            <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">
              HandNote
            </h2>
            <HandNote tilt={-1} />
          </div>
        </section>

        {/* ── Markdown note view ────────────────────────────────────── */}
        <section>
          <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-text-muted mb-4">
            Rendered Markdown note
          </h2>
          <div
            className="md-body"
            dangerouslySetInnerHTML={{ __html: noteHtml }}
          />
        </section>
      </div>
    </div>
  );
}
