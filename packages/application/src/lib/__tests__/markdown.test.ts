import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../markdown';

describe('renderMarkdown', () => {
  it('wraps a plain paragraph in <p>', () => {
    const html = renderMarkdown('Hello world');
    expect(html).toContain('<p>Hello world</p>');
  });

  it('renders ==highlight== as <mark class="md-hl">', () => {
    const html = renderMarkdown('==highlight==');
    expect(html).toContain('<mark class="md-hl">highlight</mark>');
  });

  it('renders **bold** as <strong>', () => {
    const html = renderMarkdown('**bold**');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders *italic* as <em>', () => {
    const html = renderMarkdown('*italic*');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders `code` as <code class="md-code">', () => {
    const html = renderMarkdown('`code`');
    expect(html).toContain('<code class="md-code">code</code>');
  });

  it('renders ## heading as <h3>', () => {
    const html = renderMarkdown('## heading');
    expect(html).toContain('<h3>heading</h3>');
  });

  it('renders # heading as <h2>', () => {
    const html = renderMarkdown('# heading');
    expect(html).toContain('<h2>heading</h2>');
  });

  it('renders ### heading as <h4>', () => {
    const html = renderMarkdown('### heading');
    expect(html).toContain('<h4>heading</h4>');
  });

  it('renders a markdown table with <table class="md-table">, <th>, and <td>', () => {
    const input = '| Name | Age |\n| --- | --- |\n| Alice | 30 |';
    const html = renderMarkdown(input);
    expect(html).toContain('<table class="md-table">');
    expect(html).toContain('<th>Name</th>');
    expect(html).toContain('<td>Alice</td>');
  });

  it('renders > blockquote as <blockquote>', () => {
    const html = renderMarkdown('> quote');
    expect(html).toContain('<blockquote>quote</blockquote>');
  });

  it('renders - unordered list item as <ul><li>', () => {
    const html = renderMarkdown('- item');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item</li>');
  });

  it('renders * unordered list item as <ul><li>', () => {
    const html = renderMarkdown('* item');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item</li>');
  });

  it('renders 1. ordered list item as <ol><li>', () => {
    const html = renderMarkdown('1. item');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>item</li>');
  });

  it('renders --- as <hr/>', () => {
    const html = renderMarkdown('---');
    expect(html).toContain('<hr/>');
  });

  it('escapes XSS — <script> tags are not emitted literally', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
