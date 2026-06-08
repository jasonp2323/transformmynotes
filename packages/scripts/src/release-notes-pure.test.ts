import { describe, it, expect } from 'vitest'
import {
  parseManifestVersion,
  resolvePreviousTag,
  parseCommitSubjects,
  buildNotesMessages,
  parsePrNumbers,
} from './release-notes-pure.js'

// ---------------------------------------------------------------------------
// parseManifestVersion
// ---------------------------------------------------------------------------

describe('parseManifestVersion', () => {
  it('returns the version for the "." key', () => {
    expect(parseManifestVersion('{ ".": "1.1.0" }')).toBe('1.1.0')
  })

  it('handles extra keys in the manifest', () => {
    expect(parseManifestVersion('{ ".": "2.3.4", "packages/foo": "0.1.0" }')).toBe('2.3.4')
  })

  it('throws when the "." key is missing', () => {
    expect(() => parseManifestVersion('{ "packages/foo": "1.0.0" }')).toThrow(
      /missing the "\." key/,
    )
  })

  it('throws when the "." key is not a string', () => {
    expect(() => parseManifestVersion('{ ".": 123 }')).toThrow(/must be a string/)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseManifestVersion('not json')).toThrow(/not valid JSON/)
  })

  it('throws when parsed value is not an object', () => {
    expect(() => parseManifestVersion('"just a string"')).toThrow(/must be a JSON object/)
  })
})

// ---------------------------------------------------------------------------
// resolvePreviousTag
// ---------------------------------------------------------------------------

describe('resolvePreviousTag', () => {
  it('returns the highest tag strictly less than the current version', () => {
    const tags = ['v1.0.0', 'v1.1.0', 'v1.2.0']
    // v1.2.0 is NOT strictly less than 1.2.0, so highest strictly-less is v1.1.0
    expect(resolvePreviousTag(tags, '1.2.0')).toBe('v1.1.0')
    // for 1.3.0 the highest strictly-less tag is v1.2.0
    expect(resolvePreviousTag(tags, '1.3.0')).toBe('v1.2.0')
  })

  it('picks the highest strictly-less tag correctly', () => {
    const tags = ['v1.0.0', 'v1.1.0']
    expect(resolvePreviousTag(tags, '1.2.0')).toBe('v1.1.0')
  })

  it('uses numeric semver ordering — v1.10.0 > v1.9.0', () => {
    const tags = ['v1.9.0', 'v1.10.0']
    // current is v1.11.0; previous should be v1.10.0, not v1.9.0
    expect(resolvePreviousTag(tags, '1.11.0')).toBe('v1.10.0')
  })

  it('returns null when there are no earlier tags', () => {
    expect(resolvePreviousTag(['v1.0.0'], '1.0.0')).toBeNull()
  })

  it('returns null for an empty tag list', () => {
    expect(resolvePreviousTag([], '1.0.0')).toBeNull()
  })

  it('ignores tags that are not valid semver', () => {
    const tags = ['not-a-version', 'v1.0.0']
    expect(resolvePreviousTag(tags, '1.1.0')).toBe('v1.0.0')
  })

  it('returns null when all tags equal the current version', () => {
    expect(resolvePreviousTag(['v2.0.0'], '2.0.0')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseCommitSubjects
// ---------------------------------------------------------------------------

describe('parseCommitSubjects', () => {
  it('returns subjects from newline-separated output', () => {
    const input = 'feat: add login\nfix: correct typo\nchore: bump deps'
    expect(parseCommitSubjects(input)).toEqual([
      'feat: add login',
      'fix: correct typo',
      'chore: bump deps',
    ])
  })

  it('trims leading/trailing whitespace from each line', () => {
    expect(parseCommitSubjects('  feat: foo  \n  fix: bar  ')).toEqual([
      'feat: foo',
      'fix: bar',
    ])
  })

  it('filters out blank and whitespace-only lines', () => {
    expect(parseCommitSubjects('feat: a\n\n   \nfix: b')).toEqual(['feat: a', 'fix: b'])
  })

  it('returns an empty array for empty input', () => {
    expect(parseCommitSubjects('')).toEqual([])
  })

  it('returns an empty array for whitespace-only input', () => {
    expect(parseCommitSubjects('   \n  \n')).toEqual([])
  })

  it('returns a single-element array for a single subject', () => {
    expect(parseCommitSubjects('feat: single')).toEqual(['feat: single'])
  })
})

// ---------------------------------------------------------------------------
// buildNotesMessages
// ---------------------------------------------------------------------------

describe('buildNotesMessages', () => {
  it('returns both system and user fields', () => {
    const { system, user } = buildNotesMessages('1.2.3', ['feat: something'])
    expect(typeof system).toBe('string')
    expect(typeof user).toBe('string')
  })

  it('includes the version in the user prompt', () => {
    const { user } = buildNotesMessages('2.0.0', ['feat: thing'])
    expect(user).toContain('2.0.0')
  })

  it('includes commit subjects in the user prompt', () => {
    const { user } = buildNotesMessages('1.0.0', ['feat: new feature', 'fix: bug fix'])
    expect(user).toContain('feat: new feature')
    expect(user).toContain('fix: bug fix')
  })

  it('mentions "no notable commit subjects" when list is empty', () => {
    const { user } = buildNotesMessages('1.0.0', [])
    expect(user).toMatch(/no notable commit subjects/i)
  })

  it('still includes the version even when the commit list is empty', () => {
    const { user } = buildNotesMessages('3.1.4', [])
    expect(user).toContain('3.1.4')
  })

  it('system prompt instructs grouping by Conventional Commit type', () => {
    const { system } = buildNotesMessages('1.0.0', [])
    expect(system.toLowerCase()).toContain('conventional commit')
  })

  it('is deterministic — same inputs produce identical outputs', () => {
    const a = buildNotesMessages('1.0.0', ['feat: x'])
    const b = buildNotesMessages('1.0.0', ['feat: x'])
    expect(a.system).toBe(b.system)
    expect(a.user).toBe(b.user)
  })
})

// ---------------------------------------------------------------------------
// parsePrNumbers
// ---------------------------------------------------------------------------

describe('parsePrNumbers', () => {
  it('parses a normal array of PR objects', () => {
    expect(parsePrNumbers('[{"number":12},{"number":34}]')).toEqual([12, 34])
  })

  it('returns an empty array for an empty JSON array', () => {
    expect(parsePrNumbers('[]')).toEqual([])
  })

  it('returns an empty array for malformed JSON', () => {
    expect(parsePrNumbers('not json')).toEqual([])
  })

  it('returns an empty array when the root value is not an array', () => {
    expect(parsePrNumbers('{"number":1}')).toEqual([])
  })

  it('ignores entries without a numeric "number" field', () => {
    expect(parsePrNumbers('[{"number":"string"},{"other":1},{"number":5}]')).toEqual([5])
  })

  it('handles entries with extra fields alongside "number"', () => {
    expect(parsePrNumbers('[{"number":7,"title":"foo"}]')).toEqual([7])
  })
})
