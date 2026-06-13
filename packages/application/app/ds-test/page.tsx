import { notFound } from 'next/navigation';
import { renderMarkdown } from '@/src/lib/markdown';
import {
  Button,
  Badge,
  Tag,
  HighlightText,
  HandNote,
} from '@/src/components/ui';

/** Brazilian Portuguese grammar note exercising all supported Markdown constructs. */
const SAMPLE_MD = `## O Subjuntivo — Notas de Gramática (Português)

### O Que É o Subjuntivo?

O subjuntivo é um ==modo== (não um tempo) usado para expressar **dúvida**, *desejo* e
possibilidade. Dominá-lo é um dos maiores saltos rumo à fluência.

> "Quero que você **fale** mais devagar." — I want you to speak more slowly.

### Quando Usá-lo

- Após expressões de **vontade** ou **desejo**: \`querer que\`, \`esperar que\`
- Após expressões de *dúvida* ou negação: \`duvidar que\`, \`não acreditar que\`
- Após expressões impessoais: \`é importante que\`, \`é possível que\`
- Em construções com \`tomara\` expressando ==esperança==

### Formação — Presente do Subjuntivo

| Pronome | -ar (falar) | -er (comer) | -ir (viver) |
| --- | --- | --- | --- |
| eu | fale | coma | viva |
| você | fale | coma | viva |
| ele/ela | fale | coma | viva |
| nós | falemos | comamos | vivamos |
| vocês | falem | comam | vivam |

### As Categorias "WEIRDO" de Gatilho

1. **W**ishes (Desejos) — querer, desejar, esperar
2. **E**motion (Emoção) — alegrar-se, temer, surpreender
3. **I**mpersonal expressions (Expressões impessoais) — é necessário, é raro
4. **R**ecommendations (Recomendações) — recomendar, sugerir, aconselhar
5. **D**oubt / Denial (Dúvida / Negação) — duvidar, negar, não acreditar
6. **O**jalá → Tomara — sempre aciona o subjuntivo

---

*Dica: Se a oração principal e a subordinada têm ==sujeitos diferentes==, use
\`que\` + subjuntivo. Mesmo sujeito? Use o \`infinitivo\` no lugar.*
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
