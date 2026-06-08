import Header from '../src/components/Header';
import Hero from '../src/components/Hero';
import Capabilities from '../src/components/Capabilities';
import HowItWorks from '../src/components/HowItWorks';
import Closing from '../src/components/Closing';
import RevealObserver from '../src/components/Reveal';

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Capabilities />
        <HowItWorks />
        <Closing />
        {/* RevealObserver is a client component that wires IntersectionObserver
            to all [data-reveal] elements — renders nothing to the DOM */}
        <RevealObserver />
      </main>
    </>
  );
}
