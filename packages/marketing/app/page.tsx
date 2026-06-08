import Header from '../src/components/Header';
import Hero from '../src/components/Hero';
import RevealObserver from '../src/components/Reveal';

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        {/* RevealObserver is a client component that wires IntersectionObserver
            to all [data-reveal] elements — renders nothing to the DOM */}
        <RevealObserver />
      </main>
    </>
  );
}
