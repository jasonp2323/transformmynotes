import type { Metadata } from 'next';
import Header from '../../src/components/Header';
import Footer from '../../src/components/Footer';
import RevealObserver from '../../src/components/Reveal';
import Button from '../../src/components/ui/Button';

export const metadata: Metadata = {
  title: 'Download for Android — TransformMyNotes',
  description:
    'Download the TransformMyNotes Android app. Get the APK and follow the sideload instructions to install it on your device.',
  alternates: {
    canonical: '/download',
  },
  openGraph: {
    type: 'website',
    title: 'Download for Android — TransformMyNotes',
    description:
      'Download the TransformMyNotes Android app. Get the APK and follow the sideload instructions to install it on your device.',
    url: 'https://transformmynotes.com/download',
    siteName: 'TransformMyNotes',
  },
};

export default function DownloadPage() {
  return (
    <>
      <Header />
      <main id="main-content">
        <section className="section-pad section-pad--sm">
          <div className="container download-hero">
            <span className="eyebrow" data-reveal>Android app</span>
            <h1 className="section-heading changelog-h1" data-reveal data-delay="1">
              Get the Android app
            </h1>
            <p className="changelog-sub" data-reveal data-delay="2">
              TransformMyNotes is available as an Android APK. Download it directly
              and install it on your device in a few steps.
            </p>
            <div data-reveal data-delay="3" style={{ marginTop: '1.5rem' }}>
              <Button as="a" href="/download/android" variant="primary" size="lg">
                Download for Android
              </Button>
            </div>
          </div>
        </section>

        <section className="section-pad section-pad--sm">
          <div className="container">
            <h2 className="section-heading download-install__heading" data-reveal>
              How to install
            </h2>
            <div className="download-install__body" data-reveal data-delay="1">
              <ol>
                <li>
                  <strong>Download the APK.</strong> Tap the button above on your
                  Android device. Your browser will download the{' '}
                  <code>app-release.apk</code> file.
                </li>
                <li>
                  <strong>Allow installation from unknown sources.</strong> When
                  prompted, grant your browser or Files app permission to install
                  apps. On most Android devices: go to{' '}
                  <strong>Settings → Apps → Special app access → Install unknown apps</strong>
                  , then enable it for your browser or file manager.
                </li>
                <li>
                  <strong>Open the downloaded file.</strong> Open the APK from your
                  browser&rsquo;s downloads or your Files app and tap{' '}
                  <strong>Install</strong>.
                </li>
                <li>
                  <strong>Play Protect warning.</strong> On first install, Google
                  Play Protect may show a warning because the app isn&rsquo;t
                  distributed via the Play Store. This is expected. Tap{' '}
                  <strong>Install anyway</strong> (or{' '}
                  <strong>More details → Install anyway</strong>) to proceed.
                </li>
              </ol>
              <p>
                The app is a companion to{' '}
                <a href="https://app.transformmynotes.com">app.transformmynotes.com</a>{' '}
                and requires a network connection and a TransformMyNotes account.
              </p>
            </div>
          </div>
        </section>

        <RevealObserver />
      </main>
      <Footer />
    </>
  );
}
