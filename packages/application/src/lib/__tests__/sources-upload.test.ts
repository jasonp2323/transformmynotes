import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mimeForFile, formatBytes, uploadSource } from '../sources-upload';

// ── mimeForFile ────────────────────────────────────────────────────────────────

describe('mimeForFile', () => {
  it('returns the correct MIME for a .pdf extension with correct browser type', () => {
    expect(mimeForFile({ name: 'doc.pdf', type: 'application/pdf' })).toBe('application/pdf');
  });

  it('falls back to extension when browser type is empty', () => {
    expect(mimeForFile({ name: 'doc.pdf', type: '' })).toBe('application/pdf');
  });

  it('falls back to extension when browser type is not in allowlist', () => {
    // Browser may report octet-stream for some files
    expect(mimeForFile({ name: 'report.docx', type: 'application/octet-stream' })).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('resolves .docx by extension', () => {
    expect(mimeForFile({ name: 'report.docx', type: '' })).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('resolves .epub by extension', () => {
    expect(mimeForFile({ name: 'book.epub', type: '' })).toBe('application/epub+zip');
  });

  it('resolves .txt by extension', () => {
    expect(mimeForFile({ name: 'notes.txt', type: '' })).toBe('text/plain');
  });

  it('resolves .md by extension', () => {
    expect(mimeForFile({ name: 'readme.md', type: '' })).toBe('text/markdown');
  });

  it('returns null for unsupported extension', () => {
    expect(mimeForFile({ name: 'photo.jpg', type: '' })).toBeNull();
  });

  it('returns null when both type and extension are unknown', () => {
    expect(mimeForFile({ name: 'archive.zip', type: 'application/zip' })).toBeNull();
  });

  it('handles uppercase extension via lowercasing', () => {
    expect(mimeForFile({ name: 'DOCUMENT.PDF', type: '' })).toBe('application/pdf');
  });

  it('accepts a valid MIME type directly even without matching extension', () => {
    // Browser reports the correct MIME
    expect(mimeForFile({ name: 'file.bin', type: 'text/plain' })).toBe('text/plain');
  });
});

// ── formatBytes ───────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('returns "0 B" for 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('returns "0 B" for negative values', () => {
    expect(formatBytes(-100)).toBe('0 B');
  });

  it('formats bytes under 1 KB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats 1024 as "1 KB"', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('formats kilobytes correctly', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024)).toBe('10 KB');
  });

  it('formats 1 MB exactly', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('formats megabytes correctly', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('formats 1 GB exactly', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });
});

// ── uploadSource (happy path) ─────────────────────────────────────────────────

describe('uploadSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('completes the full pipeline and returns { sourceId, status: "extracting" }', async () => {
    const mockFetch = vi
      .fn()
      // First call: POST /api/sources/upload-url
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          presignedUrl: 'https://s3.example.com/presigned',
          s3Key: 'sources/users/sub/id.pdf',
          sourceId: 'src-123',
        }),
      } as Response)
      // Second call: PUT to presignedUrl
      .mockResolvedValueOnce({ ok: true } as Response)
      // Third call: POST /api/sources/src-123/extract
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, status: 'extracting' }),
      } as Response);

    vi.stubGlobal('fetch', mockFetch);

    const file = new File(['hello'], 'test.pdf', { type: 'application/pdf' });
    const result = await uploadSource(file);

    expect(result).toEqual({ sourceId: 'src-123', status: 'extracting' });
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // First call must POST to upload-url
    expect(mockFetch.mock.calls[0][0]).toBe('/api/sources/upload-url');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({ method: 'POST' });

    // Second call must PUT to the presigned URL
    expect(mockFetch.mock.calls[1][0]).toBe('https://s3.example.com/presigned');
    expect(mockFetch.mock.calls[1][1]).toMatchObject({ method: 'PUT' });

    // Third call must POST to extract
    expect(mockFetch.mock.calls[2][0]).toBe('/api/sources/src-123/extract');
    expect(mockFetch.mock.calls[2][1]).toMatchObject({ method: 'POST' });
  });

  it('returns status "ready" when extract endpoint returns status: "ready"', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            presignedUrl: 'https://s3.example.com/p',
            s3Key: 'key',
            sourceId: 'src-456',
          }),
        } as Response)
        .mockResolvedValueOnce({ ok: true } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, status: 'ready', wordCount: 300 }),
        } as Response),
    );

    const file = new File(['data'], 'notes.md', { type: 'text/markdown' });
    const result = await uploadSource(file);
    expect(result.status).toBe('ready');
  });

  it('throws "unsupported_type" for an unrecognised file extension', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await expect(uploadSource(file)).rejects.toThrow('unsupported_type');
  });

  it('throws the API error key when upload-url returns non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'file_too_large' }),
      } as Response),
    );

    const file = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    await expect(uploadSource(file)).rejects.toThrow('file_too_large');
  });
});
