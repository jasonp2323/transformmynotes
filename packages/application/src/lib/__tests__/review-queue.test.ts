import { describe, it, expect } from 'vitest';
import { parseStudySetIds } from '../review-queue';

describe('parseStudySetIds', () => {
  it('returns [] for null', () => {
    expect(parseStudySetIds(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(parseStudySetIds(undefined)).toEqual([]);
  });

  it('returns [] for empty string', () => {
    expect(parseStudySetIds('')).toEqual([]);
  });

  it('parses a single id', () => {
    expect(parseStudySetIds('abc')).toEqual(['abc']);
  });

  it('parses multiple ids in order', () => {
    expect(parseStudySetIds('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('removes duplicates while preserving order', () => {
    expect(parseStudySetIds('a,b,a,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace from each id', () => {
    expect(parseStudySetIds(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });

  it('skips empty segments from trailing/leading/double commas', () => {
    expect(parseStudySetIds('a,,b,')).toEqual(['a', 'b']);
  });

  it('handles whitespace-only segments as empty', () => {
    expect(parseStudySetIds('a, ,b')).toEqual(['a', 'b']);
  });
});
