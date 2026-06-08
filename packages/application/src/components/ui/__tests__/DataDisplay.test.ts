import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Badge } from '../Badge';
import { Tag } from '../Tag';
import { Avatar } from '../Avatar';
import { Card } from '../Card';
import { NoteCard } from '../NoteCard';
import { HighlightText } from '../HighlightText';
import { HandNote } from '../HandNote';

describe('Badge', () => {
  it('renders tmn-badge--neutral by default', () => {
    const html = renderToStaticMarkup(React.createElement(Badge, null, 'Label'));
    expect(html).toContain('tmn-badge--neutral');
  });

  it('renders tmn-badge--<tone> for each tone', () => {
    const tones = ['neutral', 'brand', 'accent', 'success', 'warning', 'danger', 'solid'] as const;
    for (const tone of tones) {
      const html = renderToStaticMarkup(React.createElement(Badge, { tone }, tone));
      expect(html).toContain(`tmn-badge--${tone}`);
    }
  });

  it('renders tmn-badge--dot when dot is true', () => {
    const html = renderToStaticMarkup(React.createElement(Badge, { dot: true }, 'Active'));
    expect(html).toContain('tmn-badge--dot');
  });

  it('does NOT render tmn-badge--dot when dot is false (default)', () => {
    const html = renderToStaticMarkup(React.createElement(Badge, null, 'Active'));
    expect(html).not.toContain('tmn-badge--dot');
  });
});

describe('Tag', () => {
  it('renders tmn-tag base class', () => {
    const html = renderToStaticMarkup(React.createElement(Tag, null, 'react'));
    expect(html).toContain('tmn-tag');
  });

  it('renders tmn-tag--brand when tone="brand"', () => {
    const html = renderToStaticMarkup(React.createElement(Tag, { tone: 'brand' }, 'react'));
    expect(html).toContain('tmn-tag--brand');
  });

  it('does NOT render tmn-tag--brand for default tone', () => {
    const html = renderToStaticMarkup(React.createElement(Tag, null, 'react'));
    expect(html).not.toContain('tmn-tag--brand');
  });

  it('renders # hash span when hash is true', () => {
    const html = renderToStaticMarkup(React.createElement(Tag, { hash: true }, 'react'));
    expect(html).toContain('tmn-tag__hash');
    expect(html).toContain('#');
  });

  it('does NOT render hash span when hash is false (default)', () => {
    const html = renderToStaticMarkup(React.createElement(Tag, null, 'react'));
    expect(html).not.toContain('tmn-tag__hash');
  });

  it('renders the remove button (tmn-tag__x) when onRemove is given', () => {
    const html = renderToStaticMarkup(
      React.createElement(Tag, { onRemove: () => {} }, 'react'),
    );
    expect(html).toContain('tmn-tag__x');
  });

  it('does NOT render the remove button when onRemove is not given', () => {
    const html = renderToStaticMarkup(React.createElement(Tag, null, 'react'));
    expect(html).not.toContain('tmn-tag__x');
  });
});

describe('Avatar', () => {
  it('renders initials from a two-word name', () => {
    const html = renderToStaticMarkup(React.createElement(Avatar, { name: 'Ana Ruiz' }));
    expect(html).toContain('AR');
  });

  it('renders initials from a single-word name', () => {
    const html = renderToStaticMarkup(React.createElement(Avatar, { name: 'Carlos' }));
    expect(html).toContain('C');
  });

  it('renders tmn-avatar--lg when size="lg"', () => {
    const html = renderToStaticMarkup(React.createElement(Avatar, { name: 'Ana Ruiz', size: 'lg' }));
    expect(html).toContain('tmn-avatar--lg');
  });

  it('renders tmn-avatar--sm when size="sm"', () => {
    const html = renderToStaticMarkup(React.createElement(Avatar, { size: 'sm' }));
    expect(html).toContain('tmn-avatar--sm');
  });

  it('renders tmn-avatar--md by default', () => {
    const html = renderToStaticMarkup(React.createElement(Avatar, { name: 'Ana' }));
    expect(html).toContain('tmn-avatar--md');
  });

  it('renders tmn-avatar__ring when ring is true', () => {
    const html = renderToStaticMarkup(React.createElement(Avatar, { name: 'Ana', ring: true }));
    expect(html).toContain('tmn-avatar__ring');
  });

  it('renders an img tag when src is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(Avatar, { name: 'Ana', src: '/avatar.jpg' }),
    );
    expect(html).toContain('<img');
    expect(html).toContain('/avatar.jpg');
  });
});

describe('Card', () => {
  it('renders tmn-card base class', () => {
    const html = renderToStaticMarkup(React.createElement(Card, null, 'Content'));
    expect(html).toContain('tmn-card');
  });

  it('renders tmn-card--interactive when variant="interactive"', () => {
    const html = renderToStaticMarkup(
      React.createElement(Card, { variant: 'interactive' }, 'Content'),
    );
    expect(html).toContain('tmn-card--interactive');
  });

  it('renders tmn-card--flat when variant="flat"', () => {
    const html = renderToStaticMarkup(
      React.createElement(Card, { variant: 'flat' }, 'Content'),
    );
    expect(html).toContain('tmn-card--flat');
  });

  it('renders tmn-card--ghost when variant="ghost"', () => {
    const html = renderToStaticMarkup(
      React.createElement(Card, { variant: 'ghost' }, 'Content'),
    );
    expect(html).toContain('tmn-card--ghost');
  });

  it('renders tmn-card__accent div when accentBar is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(Card, { accentBar: true }, 'Content'),
    );
    expect(html).toContain('tmn-card__accent');
  });

  it('does NOT render tmn-card__accent when accentBar is false (default)', () => {
    const html = renderToStaticMarkup(React.createElement(Card, null, 'Content'));
    expect(html).not.toContain('tmn-card__accent');
  });

  it('renders tmn-card--pad by default (padded=true)', () => {
    const html = renderToStaticMarkup(React.createElement(Card, null, 'Content'));
    expect(html).toContain('tmn-card--pad');
  });

  it('does NOT render tmn-card--pad when padded=false', () => {
    const html = renderToStaticMarkup(
      React.createElement(Card, { padded: false }, 'Content'),
    );
    expect(html).not.toContain('tmn-card--pad');
  });

  it('renders as the specified element type', () => {
    const html = renderToStaticMarkup(
      React.createElement(Card, { as: 'article' }, 'Content'),
    );
    expect(html).toContain('<article');
  });
});

describe('NoteCard', () => {
  it('renders the title', () => {
    const html = renderToStaticMarkup(
      React.createElement(NoteCard, { title: 'My Note Title' }),
    );
    expect(html).toContain('My Note Title');
    expect(html).toContain('tmn-note__title');
  });

  it('renders the course label', () => {
    const html = renderToStaticMarkup(
      React.createElement(NoteCard, { course: 'Biology 101' }),
    );
    expect(html).toContain('Biology 101');
    expect(html).toContain('tmn-note__course');
  });

  it('renders a snippet with a <mark> passed through via dangerouslySetInnerHTML', () => {
    const html = renderToStaticMarkup(
      React.createElement(NoteCard, { snippet: 'a <mark>b</mark>' }),
    );
    expect(html).toContain('<mark>');
    expect(html).toContain('b</mark>');
  });

  it('renders tags with hash prefix', () => {
    const html = renderToStaticMarkup(
      React.createElement(NoteCard, { tags: ['science', 'exam'] }),
    );
    expect(html).toContain('science');
    expect(html).toContain('tmn-tag__hash');
  });

  it('renders a "Synced" badge by default', () => {
    const html = renderToStaticMarkup(React.createElement(NoteCard, null));
    expect(html).toContain('Synced');
  });

  it('renders an "Original" badge when status="original"', () => {
    const html = renderToStaticMarkup(
      React.createElement(NoteCard, { status: 'original' }),
    );
    expect(html).toContain('Original');
  });

  it('renders the when meta-item', () => {
    const html = renderToStaticMarkup(
      React.createElement(NoteCard, { when: 'Today · 2:14 PM' }),
    );
    expect(html).toContain('Today · 2:14 PM');
  });

  it('renders an interactive card when onClick is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(NoteCard, { onClick: () => {} }),
    );
    expect(html).toContain('tmn-card--interactive');
  });
});

describe('HighlightText', () => {
  it('renders the base tmn-mark class', () => {
    const html = renderToStaticMarkup(
      React.createElement(HighlightText, null, 'highlighted text'),
    );
    expect(html).toContain('tmn-mark');
    expect(html).toContain('highlighted text');
  });

  it('renders only tmn-mark (no modifier) for variant="gold" (default)', () => {
    const html = renderToStaticMarkup(
      React.createElement(HighlightText, { variant: 'gold' }, 'gold'),
    );
    expect(html).toContain('tmn-mark');
    expect(html).not.toContain('tmn-mark--');
  });

  it('renders tmn-mark--teal for variant="teal"', () => {
    const html = renderToStaticMarkup(
      React.createElement(HighlightText, { variant: 'teal' }, 'teal'),
    );
    expect(html).toContain('tmn-mark--teal');
  });

  it('renders tmn-mark--strong for variant="strong"', () => {
    const html = renderToStaticMarkup(
      React.createElement(HighlightText, { variant: 'strong' }, 'strong'),
    );
    expect(html).toContain('tmn-mark--strong');
  });

  it('renders tmn-mark--underline for variant="underline"', () => {
    const html = renderToStaticMarkup(
      React.createElement(HighlightText, { variant: 'underline' }, 'underline'),
    );
    expect(html).toContain('tmn-mark--underline');
  });

  it('renders tmn-mark--swipe when animate=true', () => {
    const html = renderToStaticMarkup(
      React.createElement(HighlightText, { animate: true }, 'animated'),
    );
    expect(html).toContain('tmn-mark--swipe');
  });

  it('does NOT render tmn-mark--swipe when animate=false (default)', () => {
    const html = renderToStaticMarkup(
      React.createElement(HighlightText, null, 'plain'),
    );
    expect(html).not.toContain('tmn-mark--swipe');
  });

  it('renders as a <mark> element', () => {
    const html = renderToStaticMarkup(
      React.createElement(HighlightText, null, 'text'),
    );
    expect(html).toContain('<mark');
  });
});

describe('HandNote', () => {
  it('renders default lines containing "subjuntivo"', () => {
    const html = renderToStaticMarkup(React.createElement(HandNote, null));
    expect(html).toContain('subjuntivo');
  });

  it('renders custom lines when provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(HandNote, { lines: ['Line one', 'Line two'] }),
    );
    expect(html).toContain('Line one');
    expect(html).toContain('Line two');
    expect(html).not.toContain('subjuntivo');
  });

  it('applies the rotate transform when tilt is non-zero', () => {
    const html = renderToStaticMarkup(
      React.createElement(HandNote, { tilt: 3 }),
    );
    expect(html).toContain('rotate(3deg)');
  });

  it('applies rotate(0deg) when tilt is 0 (default)', () => {
    const html = renderToStaticMarkup(React.createElement(HandNote, null));
    expect(html).toContain('rotate(0deg)');
  });

  it('renders tmn-hand base class', () => {
    const html = renderToStaticMarkup(React.createElement(HandNote, null));
    expect(html).toContain('tmn-hand');
  });

  it('renders tmn-hand__line for each line', () => {
    const html = renderToStaticMarkup(
      React.createElement(HandNote, { lines: ['A', 'B', 'C'] }),
    );
    const matches = html.match(/tmn-hand__line/g);
    expect(matches).toHaveLength(3);
  });
});
