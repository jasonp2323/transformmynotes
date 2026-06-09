import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

// ---------------------------------------------------------------------------
// Empty / whitespace
// ---------------------------------------------------------------------------
describe('renderMarkdown — empty/whitespace input', () => {
  it('returns "" for an empty string', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('returns "" for a whitespace-only string', () => {
    expect(renderMarkdown('   \n  \t  \n')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// HTML escaping (XSS prevention)
// ---------------------------------------------------------------------------
describe('renderMarkdown — HTML escaping', () => {
  it('escapes < > & characters in plain text', () => {
    const out = renderMarkdown('<script>alert("xss")</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('escapes & in plain text', () => {
    const out = renderMarkdown('Tom & Jerry');
    expect(out).toContain('Tom &amp; Jerry');
  });

  it('escapes < in a list item', () => {
    const out = renderMarkdown('- item with <b>bold</b>');
    expect(out).toContain('&lt;b&gt;');
    expect(out).not.toContain('<b>');
  });

  it('escapes < in a heading', () => {
    const out = renderMarkdown('## Heading <script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

// ---------------------------------------------------------------------------
// Heading mapping
// ---------------------------------------------------------------------------
describe('renderMarkdown — headings', () => {
  it('maps ## to <h3>', () => {
    const out = renderMarkdown('## Section title');
    expect(out).toBe('<h3>Section title</h3>');
  });

  it('maps ### to <h4>', () => {
    const out = renderMarkdown('### Subsection');
    expect(out).toBe('<h4>Subsection</h4>');
  });

  it('maps #### to <h5>', () => {
    const out = renderMarkdown('#### Deep subsection');
    expect(out).toBe('<h5>Deep subsection</h5>');
  });

  it('does NOT emit <h1> or <h2> from body markdown', () => {
    const out = renderMarkdown('## A\n### B\n#### C');
    expect(out).not.toMatch(/<h1|<h2/);
    expect(out).toContain('<h3>');
    expect(out).toContain('<h4>');
    expect(out).toContain('<h5>');
  });
});

// ---------------------------------------------------------------------------
// Unordered lists
// ---------------------------------------------------------------------------
describe('renderMarkdown — unordered lists', () => {
  it('renders "- " list items as <ul><li>', () => {
    const out = renderMarkdown('- alpha\n- beta\n- gamma');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>alpha</li>');
    expect(out).toContain('<li>beta</li>');
    expect(out).toContain('<li>gamma</li>');
    expect(out).toContain('</ul>');
  });

  it('renders "* " list items as <ul><li>', () => {
    const out = renderMarkdown('* first\n* second');
    expect(out).toContain('<li>first</li>');
    expect(out).toContain('<li>second</li>');
  });

  it('handles mixed - and * starters in the same list', () => {
    const out = renderMarkdown('- one\n* two');
    expect(out).toContain('<li>one</li>');
    expect(out).toContain('<li>two</li>');
  });
});

// ---------------------------------------------------------------------------
// Bold
// ---------------------------------------------------------------------------
describe('renderMarkdown — bold', () => {
  it('renders **text** as <strong>', () => {
    const out = renderMarkdown('This is **bold** text.');
    expect(out).toContain('<strong>bold</strong>');
  });

  it('renders multiple bold spans', () => {
    const out = renderMarkdown('**a** and **b**');
    expect(out).toContain('<strong>a</strong>');
    expect(out).toContain('<strong>b</strong>');
  });
});

// ---------------------------------------------------------------------------
// Inline code
// ---------------------------------------------------------------------------
describe('renderMarkdown — inline code', () => {
  it('renders `code` as <code>', () => {
    const out = renderMarkdown('Use `npm install` to install.');
    expect(out).toContain('<code>npm install</code>');
  });

  it('escapes HTML inside inline code', () => {
    const out = renderMarkdown('Run `<script>`');
    // The < > inside the backtick are escaped before inline render
    expect(out).toContain('<code>');
    expect(out).not.toContain('<script>');
  });
});

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------
describe('renderMarkdown — links', () => {
  it('renders [text](url) as <a href>', () => {
    const out = renderMarkdown('[Visit site](https://example.com)');
    expect(out).toContain('<a href="https://example.com"');
    expect(out).toContain('>Visit site</a>');
  });

  it('adds rel="noopener noreferrer" and target="_blank" to external links', () => {
    const out = renderMarkdown('[Ext](https://example.com)');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it('does NOT add target="_blank" to relative links', () => {
    const out = renderMarkdown('[Home](/changelog)');
    expect(out).not.toContain('target="_blank"');
  });

  it('drops javascript: URLs — replaces with #', () => {
    const out = renderMarkdown('[click](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('href="#"');
  });

  it('drops data: URLs', () => {
    const out = renderMarkdown('[img](data:text/html,<h1>)');
    expect(out).not.toContain('data:');
    expect(out).toContain('href="#"');
  });

  it('allows mailto: links', () => {
    const out = renderMarkdown('[Email](mailto:hello@example.com)');
    expect(out).toContain('href="mailto:hello@example.com"');
  });
});

// ---------------------------------------------------------------------------
// Paragraphs
// ---------------------------------------------------------------------------
describe('renderMarkdown — paragraphs', () => {
  it('wraps plain text in <p>', () => {
    const out = renderMarkdown('Hello world.');
    expect(out).toBe('<p>Hello world.</p>');
  });

  it('splits blank-line-separated text into separate <p> blocks', () => {
    const out = renderMarkdown('First para.\n\nSecond para.');
    expect(out).toContain('<p>First para.</p>');
    expect(out).toContain('<p>Second para.</p>');
  });
});

// ---------------------------------------------------------------------------
// Mixed content (realistic release note)
// ---------------------------------------------------------------------------
describe('renderMarkdown — mixed realistic content', () => {
  const input = `## What's changed

- Added **dark mode** support
- Fixed \`console.error\` on startup
- [See PR](https://github.com/example/repo/pull/42)

### Breaking changes

None.`;

  it('renders a realistic release note block without crashing', () => {
    const out = renderMarkdown(input);
    expect(out).toContain('<h3>What&#39;s changed</h3>');
    expect(out).toContain('<strong>dark mode</strong>');
    expect(out).toContain('<code>console.error</code>');
    expect(out).toContain('<a href="https://github.com/example/repo/pull/42"');
    expect(out).toContain('<h4>Breaking changes</h4>');
    expect(out).toContain('<p>None.</p>');
  });

  it('never produces a <h1> or <h2> in output', () => {
    const out = renderMarkdown(input);
    expect(out).not.toMatch(/<h1|<h2/);
  });
});
