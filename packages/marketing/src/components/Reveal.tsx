'use client';

import { useEffect } from 'react';

/**
 * RevealObserver — mounts once on the page and wires IntersectionObserver
 * to all [data-reveal] elements, adding `.is-in` when they enter the viewport.
 * Renders nothing to the DOM; purely a side-effect hook carrier.
 */
export default function RevealObserver() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]');

    if (!('IntersectionObserver' in window)) {
      // No IO support — show everything immediately
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
