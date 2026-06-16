import { describe, it, expect } from 'vitest';

import { parseMaxConcurrentStudyJobs } from '../guardrails';

describe('parseMaxConcurrentStudyJobs', () => {
  describe('throwing cases', () => {
    it('throws when undefined', () => {
      expect(() => parseMaxConcurrentStudyJobs(undefined)).toThrow(/MAX_CONCURRENT_STUDY_JOBS/);
    });

    it('throws when empty string', () => {
      expect(() => parseMaxConcurrentStudyJobs('')).toThrow(/MAX_CONCURRENT_STUDY_JOBS/);
    });

    it('throws when whitespace only', () => {
      expect(() => parseMaxConcurrentStudyJobs('   ')).toThrow(/MAX_CONCURRENT_STUDY_JOBS/);
    });

    it('throws for a non-numeric value', () => {
      expect(() => parseMaxConcurrentStudyJobs('abc')).toThrow(/MAX_CONCURRENT_STUDY_JOBS/);
    });

    it('throws for a non-integer value', () => {
      expect(() => parseMaxConcurrentStudyJobs('2.5')).toThrow(/MAX_CONCURRENT_STUDY_JOBS/);
    });

    it('throws for zero', () => {
      expect(() => parseMaxConcurrentStudyJobs('0')).toThrow(/MAX_CONCURRENT_STUDY_JOBS/);
    });

    it('throws for a negative value', () => {
      expect(() => parseMaxConcurrentStudyJobs('-1')).toThrow(/MAX_CONCURRENT_STUDY_JOBS/);
    });
  });

  describe('valid cases', () => {
    it('returns 3 for "3"', () => {
      expect(parseMaxConcurrentStudyJobs('3')).toBe(3);
    });

    it('returns 1 for "1"', () => {
      expect(parseMaxConcurrentStudyJobs('1')).toBe(1);
    });

    it('returns 10 for "10"', () => {
      expect(parseMaxConcurrentStudyJobs('10')).toBe(10);
    });
  });
});
