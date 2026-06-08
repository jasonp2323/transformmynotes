import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with variant class for each supported variant', () => {
    const variants = [
      'primary',
      'secondary',
      'ghost',
      'danger',
      'soft',
      'accent',
    ] as const;
    for (const variant of variants) {
      const el = React.createElement(Button, { variant }, 'Click me');
      const html = renderToStaticMarkup(el);
      expect(html).toContain(`tmn-btn--${variant}`);
    }
  });

  it('renders with tmn-btn--md by default (no size prop)', () => {
    const el = React.createElement(Button, null, 'Click me');
    const html = renderToStaticMarkup(el);
    expect(html).toContain('tmn-btn--md');
  });

  it('renders with tmn-btn--full when fullWidth is true', () => {
    const el = React.createElement(Button, { fullWidth: true }, 'Click me');
    const html = renderToStaticMarkup(el);
    expect(html).toContain('tmn-btn--full');
  });

  it('does NOT render tmn-btn--full when fullWidth is false (default)', () => {
    const el = React.createElement(Button, null, 'Click me');
    const html = renderToStaticMarkup(el);
    expect(html).not.toContain('tmn-btn--full');
  });

  it('renders the disabled attribute when disabled is true', () => {
    const el = React.createElement(Button, { disabled: true }, 'Click me');
    const html = renderToStaticMarkup(el);
    expect(html).toContain('disabled');
  });

  it('renders tmn-btn--loading and the spinner span when loading is true', () => {
    const el = React.createElement(Button, { loading: true }, 'Click me');
    const html = renderToStaticMarkup(el);
    expect(html).toContain('tmn-btn--loading');
    expect(html).toContain('tmn-btn__spinner');
  });

  it('renders disabled attribute when loading is true (loading implies disabled)', () => {
    const el = React.createElement(Button, { loading: true }, 'Click me');
    const html = renderToStaticMarkup(el);
    expect(html).toContain('disabled');
  });
});
