/**
 * NOTE: Interaction tests (click/keyboard events, onOpenChange callback) are
 * verified at the integration/e2e layer because the unit suite runs in the
 * node environment — no DOM and no @testing-library/react available.
 * These tests cover SSR markup correctness and controlled-prop reflection via
 * renderToStaticMarkup, matching the pattern in Navigation.test.ts.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Collapsible } from '../Collapsible';

describe('Collapsible', () => {
  it('is collapsed by default (uncontrolled): aria-expanded="false" and region has hidden attribute', () => {
    const html = renderToStaticMarkup(
      React.createElement(Collapsible, { title: 'Section' }, 'Body'),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('role="region"');
    // renderToStaticMarkup emits hidden="" for the boolean hidden attribute
    expect(html).toContain('hidden=""');
  });

  it('defaultOpen=true renders expanded: aria-expanded="true", no hidden attribute, body visible', () => {
    const html = renderToStaticMarkup(
      React.createElement(Collapsible, { title: 'Section', defaultOpen: true }, 'Body'),
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Body');
    // When open, region must NOT have hidden
    expect(html).not.toContain('hidden=""');
    // Sanity: collapsed state marker must be absent
    expect(html).not.toContain('aria-expanded="false"');
  });

  it('aria-controls on trigger matches id on region, and aria-labelledby on region matches id on trigger', () => {
    const html = renderToStaticMarkup(
      React.createElement(Collapsible, { title: 'Section' }, 'Body'),
    );

    // Extract aria-controls value from the trigger button
    const controlsMatch = html.match(/aria-controls="([^"]+)"/);
    expect(controlsMatch).not.toBeNull();
    const controlsId = controlsMatch![1];

    // That id must appear on the region div
    expect(html).toContain(`id="${controlsId}"`);
    expect(html).toContain('role="region"');

    // Extract aria-labelledby from the region
    const labelledByMatch = html.match(/aria-labelledby="([^"]+)"/);
    expect(labelledByMatch).not.toBeNull();
    const labelledById = labelledByMatch![1];

    // That id must appear on the trigger button
    expect(html).toContain(`id="${labelledById}"`);
  });

  it('controlled open=false: aria-expanded="false" and region is hidden', () => {
    const html = renderToStaticMarkup(
      React.createElement(Collapsible, { title: 'Section', open: false }, 'Body'),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden=""');
  });

  it('controlled open=true: aria-expanded="true" and region is not hidden', () => {
    const html = renderToStaticMarkup(
      React.createElement(Collapsible, { title: 'Section', open: true }, 'Body'),
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('hidden=""');
  });

  it('disabled=true renders a disabled trigger button', () => {
    const html = renderToStaticMarkup(
      React.createElement(Collapsible, { title: 'Section', disabled: true }, 'Body'),
    );
    // renderToStaticMarkup emits disabled="" for boolean disabled attribute
    expect(html).toContain('disabled=""');
  });
});
