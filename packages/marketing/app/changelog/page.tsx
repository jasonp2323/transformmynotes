import type { Metadata } from 'next';
import Header from '../../src/components/Header';
import Footer from '../../src/components/Footer';
import RevealObserver from '../../src/components/Reveal';
import { fetchReleases } from '../../src/lib/releases';
import { releaseTitle, formatReleaseDate } from '../../src/lib/releases';
import { renderMarkdown } from '../../src/lib/markdown';

// ISR: revalidate the page every hour so new releases appear without a full redeploy.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "What's new — TransformMyNotes",
  description:
    'Follow the latest updates, improvements, and new features shipping to TransformMyNotes.',
  alternates: {
    canonical: '/changelog',
  },
  openGraph: {
    type: 'website',
    title: "What's new — TransformMyNotes",
    description:
      'Follow the latest updates, improvements, and new features shipping to TransformMyNotes.',
    url: 'https://transformmynotes.com/changelog',
    siteName: 'TransformMyNotes',
  },
};

export default async function ChangelogPage() {
  const releases = await fetchReleases();

  return (
    <>
      <Header />
      <main>
        {/* ---- Page header ---- */}
        <section className="section-pad section-pad--sm">
          <div className="container">
            <span className="eyebrow" data-reveal>What&apos;s new</span>
            <h1 className="section-heading changelog-h1" data-reveal data-delay="1">
              Changelog
            </h1>
            <p className="changelog-sub" data-reveal data-delay="2">
              Every improvement, fix, and new feature — as it ships.
            </p>
          </div>
        </section>

        {/* ---- Releases ---- */}
        <section className="section-pad section-pad--sm">
          <div className="container">
            {releases.length === 0 ? (
              <div className="changelog-empty" data-reveal>
                <p>No releases yet — check back soon.</p>
              </div>
            ) : (
              <ol className="changelog" reversed>
                {releases.map((release, i) => {
                  const title = releaseTitle(release);
                  const dateIso = release.published_at ?? release.created_at;
                  const dateLabel = formatReleaseDate(dateIso);
                  const bodyHtml = renderMarkdown(release.body ?? '');
                  const delay = String(Math.min((i % 5) + 1, 5));

                  return (
                    <li key={release.tag_name}>
                      <article
                        className="changelog-entry"
                        data-reveal
                        data-delay={delay}
                      >
                        <header className="changelog-entry__header">
                          <h2 className="changelog-entry__version">{title}</h2>
                          <div className="changelog-entry__meta">
                            <time dateTime={dateIso} className="changelog-entry__date">
                              {dateLabel}
                            </time>
                            {release.tag_name !== title && (
                              <span className="changelog-entry__tag">{release.tag_name}</span>
                            )}
                            <a
                              className="changelog-entry__gh-link"
                              href={release.html_url}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              View on GitHub
                            </a>
                          </div>
                        </header>
                        {bodyHtml ? (
                          <div
                            className="changelog-entry__body"
                            // Safe: renderMarkdown escapes all input and only emits
                            // a constrained subset of HTML — no raw passthrough.
                            dangerouslySetInnerHTML={{ __html: bodyHtml }}
                          />
                        ) : null}
                      </article>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>

        {/* RevealObserver wires IntersectionObserver to all [data-reveal] elements */}
        <RevealObserver />
      </main>
      <Footer />
    </>
  );
}
