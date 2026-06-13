import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Tabs } from '../Tabs';
import { SegmentedControl } from '../SegmentedControl';
import { Toast } from '../Toast';
import { Dialog } from '../Dialog';

describe('Tabs', () => {
  const items = [
    { value: 'a', label: 'Tab A' },
    { value: 'b', label: 'Tab B' },
    { value: 'c', label: 'Tab C' },
  ];

  it('renders tmn-tab--active exactly once when value="b"', () => {
    const html = renderToStaticMarkup(
      React.createElement(Tabs, { items, value: 'b' }),
    );
    const matches = html.match(/tmn-tab--active/g);
    expect(matches).toHaveLength(1);
  });

  it('renders tmn-tab__underline for the active tab', () => {
    const html = renderToStaticMarkup(
      React.createElement(Tabs, { items, value: 'b' }),
    );
    expect(html).toContain('tmn-tab__underline');
  });

  it('sets aria-selected="true" on the active tab', () => {
    const html = renderToStaticMarkup(
      React.createElement(Tabs, { items, value: 'b' }),
    );
    expect(html).toContain('aria-selected="true"');
  });

  it('renders a count inside tmn-tab__count', () => {
    const itemsWithCount = [
      { value: 'a', label: 'Tab A', count: 5 },
      { value: 'b', label: 'Tab B' },
    ];
    const html = renderToStaticMarkup(
      React.createElement(Tabs, { items: itemsWithCount, value: 'a' }),
    );
    expect(html).toContain('tmn-tab__count');
    expect(html).toContain('5');
  });

  it('does NOT render tmn-tab__count when count is undefined', () => {
    const html = renderToStaticMarkup(
      React.createElement(Tabs, { items, value: 'a' }),
    );
    expect(html).not.toContain('tmn-tab__count');
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'x', label: 'X' },
    { value: 'y', label: 'Y' },
    { value: 'z', label: 'Z' },
  ];

  it('renders 3 tmn-seg__btn buttons', () => {
    const html = renderToStaticMarkup(
      React.createElement(SegmentedControl, { options, value: 'x' }),
    );
    const matches = html.match(/tmn-seg__btn/g);
    // Each button has the base class; active one also has tmn-seg__btn--active
    const btnMatches = html.match(/tmn-seg__btn(?!-)/g);
    expect(btnMatches).toHaveLength(3);
  });

  it('marks the second option as active with tmn-seg__btn--active and aria-checked="true"', () => {
    const html = renderToStaticMarkup(
      React.createElement(SegmentedControl, { options, value: 'y' }),
    );
    expect(html).toContain('tmn-seg__btn--active');
    // SegmentedControl is an ARIA radiogroup: the active option is the checked radio.
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-checked="true"');
  });

  it('renders tmn-seg__pill with correct gap-aware transform for second option', () => {
    const html = renderToStaticMarkup(
      React.createElement(SegmentedControl, { options, value: 'y' }),
    );
    expect(html).toContain('tmn-seg__pill');
    // activeIndex=1, n=2: translateX(calc(1 * (100% + 2px))) accounts for the 2px gap
    expect(html).toContain('translateX(calc(1 * (100% + 2px)))');
  });

  it('normalises string options and renders both labels', () => {
    const html = renderToStaticMarkup(
      React.createElement(SegmentedControl, { options: ['All', 'Mine'], value: 'All' }),
    );
    expect(html).toContain('All');
    expect(html).toContain('Mine');
  });
});

describe('Toast', () => {
  it('renders tmn-toast--success when tone="success"', () => {
    const html = renderToStaticMarkup(
      React.createElement(Toast, { tone: 'success' }, null),
    );
    expect(html).toContain('tmn-toast--success');
  });

  it('renders title text inside tmn-toast__title', () => {
    const html = renderToStaticMarkup(
      React.createElement(Toast, { title: 'Saved!' }, null),
    );
    expect(html).toContain('tmn-toast__title');
    expect(html).toContain('Saved!');
  });

  it('renders tmn-toast__close with aria-label="Dismiss" when onClose is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(Toast, { onClose: () => {} }, null),
    );
    expect(html).toContain('tmn-toast__close');
    expect(html).toContain('aria-label="Dismiss"');
  });

  it('does NOT render tmn-toast__close when onClose is not provided', () => {
    const html = renderToStaticMarkup(React.createElement(Toast, null, null));
    expect(html).not.toContain('tmn-toast__close');
  });
});

describe('Dialog', () => {
  it('renders tmn-dialog-native on the dialog element', () => {
    const html = renderToStaticMarkup(
      React.createElement(Dialog, { open: true, title: 'Remove member?' }),
    );
    expect(html).toContain('tmn-dialog-native');
  });

  it('renders tmn-dialog__title with the title text', () => {
    const html = renderToStaticMarkup(
      React.createElement(Dialog, { open: true, title: 'Remove member?' }),
    );
    expect(html).toContain('tmn-dialog__title');
    expect(html).toContain('Remove member?');
  });

  it('renders footer content in tmn-dialog__footer', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Dialog,
        { open: true, footer: React.createElement('button', null, 'Confirm') },
      ),
    );
    expect(html).toContain('tmn-dialog__footer');
    expect(html).toContain('Confirm');
  });

  it('does not crash when open is false (SSR stable)', () => {
    expect(() =>
      renderToStaticMarkup(React.createElement(Dialog, { open: false, title: 'Test' })),
    ).not.toThrow();
  });
});
