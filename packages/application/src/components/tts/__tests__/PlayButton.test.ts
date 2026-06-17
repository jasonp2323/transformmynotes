import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayButton } from '../PlayButton';

describe('PlayButton', () => {
  it('renders an accessible button with the volume icon', () => {
    const el = React.createElement(PlayButton, { text: 'Olá' });
    const html = renderToStaticMarkup(el);
    expect(html).toContain('<button');
    expect(html).toContain('aria-label="Play pronunciation"');
    expect(html).toContain('<svg');
  });

  it('renders a custom aria-label and visible label', () => {
    const el = React.createElement(PlayButton, {
      text: 'Olá',
      label: 'Listen',
      ariaLabel: 'Play word',
    });
    const html = renderToStaticMarkup(el);
    expect(html).toContain('aria-label="Play word"');
    expect(html).toContain('Listen');
  });
});
