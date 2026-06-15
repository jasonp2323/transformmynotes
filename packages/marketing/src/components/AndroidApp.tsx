import Button from './ui/Button';

export default function AndroidApp() {
  return (
    <section className="section-pad">
      <div className="container" style={{ textAlign: 'center' }}>
        <h2 className="section-heading" data-reveal>
          Get the Android app
        </h2>
        <p className="changelog-sub" data-reveal data-delay="1">
          Visit our download page to get the APK and install it on your Android device.
        </p>
        <div data-reveal data-delay="2" style={{ marginTop: '1.5rem' }}>
          <Button
            as="a"
            href="/download"
            variant="secondary"
            size="lg"
          >
            Get the Android app
          </Button>
        </div>
      </div>
    </section>
  );
}
