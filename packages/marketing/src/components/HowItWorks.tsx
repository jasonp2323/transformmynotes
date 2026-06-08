interface Step {
  n: number;
  title: string;
  desc: string;
}

const STEPS: Step[] = [
  { n: 1, title: 'Snap', desc: 'Photograph your handwritten page with your phone. Any handwriting, any paper.' },
  { n: 2, title: 'Transform', desc: 'The AI reads your handwriting and produces clean, highlighted notes in seconds.' },
  { n: 3, title: 'Study', desc: 'Search, review with spaced repetition, and share in invite-gated groups.' },
];

export default function HowItWorks() {
  return (
    <section className="how section-pad">
      <div className="container">
        <div className="how-head" data-reveal>
          <span className="eyebrow">How it works</span>
          <h2 className="section-heading">Three calm steps</h2>
        </div>
        <div className="steps">
          <div className="steps__line" aria-hidden="true"></div>
          {STEPS.map((s, i) => (
            <div className="step" data-reveal data-delay={String(i + 1)} key={s.n}>
              <span className="step__num" aria-hidden="true">{s.n}</span>
              <h3 className="step__title">{s.title}</h3>
              <p className="step__desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
