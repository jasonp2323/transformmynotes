import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from '../Icon';

describe('Icon', () => {
  it('renders a non-empty SVG for a known icon name (scan-line, default size 22)', () => {
    const el = React.createElement(Icon, { name: 'scan-line', size: 22 });
    const html = renderToStaticMarkup(el);
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('<svg');
    expect(html).toContain('width="22"');
    expect(html).toContain('height="22"');
  });

  it('renders with the correct width and height when a custom size is given (size=40)', () => {
    const el = React.createElement(Icon, { name: 'scan-line', size: 40 });
    const html = renderToStaticMarkup(el);
    expect(html).toContain('width="40"');
    expect(html).toContain('height="40"');
  });

  it('returns empty string (null → no markup) for an unknown icon name', () => {
    const el = React.createElement(Icon, { name: 'nonexistent' });
    expect(() => renderToStaticMarkup(el)).not.toThrow();
    const html = renderToStaticMarkup(el);
    expect(html).toBe('');
  });
});
