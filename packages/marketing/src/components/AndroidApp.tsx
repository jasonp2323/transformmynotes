import Button from './ui/Button';

const ANDROID_RELEASE_URL =
  'https://github.com/jasonp2323/transformmynotes/releases/latest';

export default function AndroidApp() {
  return (
    <section className="section-pad">
      <div className="container" style={{ textAlign: 'center' }}>
        <h2 className="section-heading" data-reveal>
          Get the Android app
        </h2>
        <p className="changelog-sub" data-reveal data-delay="1">
          Download the APK directly from GitHub Releases and sideload it on your
          Android device to capture and transcribe notes on the go.
        </p>
        <div data-reveal data-delay="2" style={{ marginTop: '1.5rem' }}>
          <Button
            as="a"
            href={ANDROID_RELEASE_URL}
            variant="secondary"
            size="lg"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download APK from GitHub
          </Button>
        </div>
      </div>
    </section>
  );
}
