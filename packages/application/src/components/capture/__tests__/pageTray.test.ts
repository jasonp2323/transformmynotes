import { describe, it, expect } from 'vitest';
import { moveItem, removeAt, buildBatchReviewUrl, parsePageJobIds } from '../pageTray';

describe('moveItem', () => {
  it('moves an element left', () => {
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
  });

  it('moves an element right', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
  });

  it('clamps to the start of the array', () => {
    expect(moveItem([1, 2, 3], 1, -5)).toEqual([2, 1, 3]);
  });

  it('clamps to the end of the array', () => {
    expect(moveItem([1, 2, 3], 1, 99)).toEqual([1, 3, 2]);
  });

  it('returns a copy unchanged when from === to', () => {
    const arr = [1, 2, 3];
    const result = moveItem(arr, 1, 1);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(arr);
  });

  it('returns a copy unchanged when from is out of range', () => {
    const arr = [1, 2, 3];
    const result = moveItem(arr, 5, 0);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(arr);
  });

  it('handles an empty array', () => {
    expect(moveItem([], 0, 1)).toEqual([]);
  });
});

describe('removeAt', () => {
  it('removes the element at the given index', () => {
    expect(removeAt([1, 2, 3], 1)).toEqual([1, 3]);
  });

  it('removes the first element', () => {
    expect(removeAt([1, 2, 3], 0)).toEqual([2, 3]);
  });

  it('removes the last element', () => {
    expect(removeAt([1, 2, 3], 2)).toEqual([1, 2]);
  });

  it('returns a copy unchanged when index is out of range', () => {
    const arr = [1, 2, 3];
    const result = removeAt(arr, 5);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(arr);
  });

  it('returns a copy unchanged when index is negative', () => {
    const arr = [1, 2, 3];
    const result = removeAt(arr, -1);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(arr);
  });
});

describe('buildBatchReviewUrl', () => {
  it('builds a URL with a single page', () => {
    expect(buildBatchReviewUrl('job1', ['job1'])).toBe(
      '/capture/review?jobId=job1&pageJobIds=job1',
    );
  });

  it('builds a URL with multiple pages', () => {
    expect(buildBatchReviewUrl('job1', ['job1', 'job2', 'job3'])).toBe(
      '/capture/review?jobId=job1&pageJobIds=job1,job2,job3',
    );
  });

  it('URI-encodes ids that need encoding', () => {
    const url = buildBatchReviewUrl('a b', ['a b', 'c/d']);
    expect(url).toBe('/capture/review?jobId=a%20b&pageJobIds=a%20b,c%2Fd');
  });
});

describe('parsePageJobIds', () => {
  it('returns [] for undefined', () => {
    expect(parsePageJobIds(undefined)).toEqual([]);
  });

  it('returns [] for null', () => {
    expect(parsePageJobIds(null)).toEqual([]);
  });

  it('returns [] for empty string', () => {
    expect(parsePageJobIds('')).toEqual([]);
  });

  it('parses a single id', () => {
    expect(parsePageJobIds('job1')).toEqual(['job1']);
  });

  it('parses multiple ids in order', () => {
    expect(parsePageJobIds('job1,job2,job3')).toEqual(['job1', 'job2', 'job3']);
  });

  it('decodes URI-encoded ids', () => {
    expect(parsePageJobIds('a%20b,c%2Fd')).toEqual(['a b', 'c/d']);
  });

  it('drops empty segments', () => {
    expect(parsePageJobIds('job1,,job2')).toEqual(['job1', 'job2']);
  });

  it('caps at 20 ids', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `job${i}`);
    const param = ids.join(',');
    const result = parsePageJobIds(param);
    expect(result).toHaveLength(20);
    expect(result).toEqual(ids.slice(0, 20));
  });

  it('round-trips with buildBatchReviewUrl', () => {
    const primary = 'primary-job';
    const pageIds = ['job1', 'job2', 'job3'];
    const url = buildBatchReviewUrl(primary, pageIds);
    const params = new URLSearchParams(url.split('?')[1]);
    const parsed = parsePageJobIds(params.get('pageJobIds'));
    expect(parsed).toEqual(pageIds);
  });

  it('round-trips with URI-encoded ids', () => {
    const primary = 'a b';
    const pageIds = ['a b', 'c/d'];
    const url = buildBatchReviewUrl(primary, pageIds);
    const params = new URLSearchParams(url.split('?')[1]);
    const parsed = parsePageJobIds(params.get('pageJobIds'));
    expect(parsed).toEqual(pageIds);
  });
});
