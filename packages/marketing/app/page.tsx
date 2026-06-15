import Header from '../src/components/Header';
import Hero from '../src/components/Hero';
import Capabilities from '../src/components/Capabilities';
import HowItWorks from '../src/components/HowItWorks';
import AndroidApp from '../src/components/AndroidApp';
import Closing from '../src/components/Closing';
import RevealObserver from '../src/components/Reveal';
import Footer from '../src/components/Footer';

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="main-content">
        <Hero />
        <Capabilities />
        <HowItWorks />
        <AndroidApp />
        <Closing />
        {/* RevealObserver is a client component that wires IntersectionObserver
            to all [data-reveal] elements — renders nothing to the DOM */}
        <RevealObserver />
      </main>
      <Footer />
    </>
  );
}
