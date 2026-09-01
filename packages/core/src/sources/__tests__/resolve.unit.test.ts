/**
 * Unit test: resolveSourceText — S3 text resolution for note and document refs.
 *
 * Mocks @aws-sdk/client-s3, getNote, and getSource so no real AWS or DynamoDB
 * calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockS3Send = vi.hoisted(() => vi.fn());
const mockGetNote = vi.hoisted(() => vi.fn());
const mockGetSource = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockS3Send })),
  GetObjectCommand: vi.fn().mockImplementation((input: unknown) => input),
}));

vi.mock('../../db/notes.js', () => ({
  getNote: mockGetNote,
}));

vi.mock('../../db/sources.js', () => ({
  getSource: mockGetSource,
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { resolveSourceText } from '../resolve.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB = 'user-sub-resolve-test';
const NOTE_ID = 'note-resolve-001';
const SOURCE_ID = 'src-resolve-001';

const MOCK_NOTE = {
  pk: `USER#${SUB}`,
  sk: `NOTE#${NOTE_ID}`,
  noteId: NOTE_ID,
  sub: SUB,
  title: 'My Biology Notes',
  tags: [],
  status: 'clean' as const,
  words: 500,
  highlights: 0,
  langPair: 'en',
  ocrConfidence: 95,
  bodyS3Key: `markdown/users/${SUB}/${NOTE_ID}.md`,
  originalImageS3Key: `images/users/${SUB}/${NOTE_ID}.jpg`,
  gsi1pk: `USER#${SUB}`,
  gsi1sk: `NOTE#${NOTE_ID}`,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const MOCK_SOURCE = {
  pk: `USER#${SUB}`,
  sk: `SOURCE#${SOURCE_ID}`,
  gsi9pk: `USER#${SUB}`,
  gsi9sk: `SOURCE#${SOURCE_ID}`,
  sourceId: SOURCE_ID,
  type: 'document' as const,
  title: 'Biology Textbook',
  status: 'ready' as const,
  originalFormat: 'pdf' as const,
  originalS3Key: `sources/users/${SUB}/${SOURCE_ID}.pdf`,
  extractedTextS3Key: `sources/users/${SUB}/${SOURCE_ID}.md`,
  byteSize: 1024 * 512,
  createdAt: '2025-02-01T00:00:00.000Z',
  updatedAt: '2025-02-01T00:00:00.000Z',
};

function makeS3Body(text: string) {
  return {
    Body: {
      transformToString: vi.fn().mockResolvedValue(text),
    },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SST_RESOURCE_NotesBucket_name = 'test-bucket';
});

// ---------------------------------------------------------------------------
// Tests: note ref
// ---------------------------------------------------------------------------

describe('resolveSourceText — note ref', () => {
  it('returns text and provenanceLabel for a note ref', async () => {
    const noteText = '# Biology Notes\n\nCell structure is important.';
    mockGetNote.mockResolvedValue(MOCK_NOTE);
    mockS3Send.mockResolvedValue(makeS3Body(noteText));

    const result = await resolveSourceText(SUB, { type: 'note', id: NOTE_ID });

    expect(result.text).toBe(noteText);
    expect(result.provenanceLabel).toBe(MOCK_NOTE.title);
  });

  it("returns contentTrust 'user-authored' for a note ref", async () => {
    mockGetNote.mockResolvedValue(MOCK_NOTE);
    mockS3Send.mockResolvedValue(makeS3Body('# Notes'));

    const result = await resolveSourceText(SUB, { type: 'note', id: NOTE_ID });

    expect(result.contentTrust).toBe('user-authored');
  });

  it('throws a descriptive error when the note is not found', async () => {
    mockGetNote.mockResolvedValue(undefined);

    await expect(
      resolveSourceText(SUB, { type: 'note', id: NOTE_ID }),
    ).rejects.toThrow(/note not found/i);
  });

  it('throws loudly when SST_RESOURCE_NotesBucket_name is unset', async () => {
    delete process.env.SST_RESOURCE_NotesBucket_name;
    mockGetNote.mockResolvedValue(MOCK_NOTE);

    await expect(
      resolveSourceText(SUB, { type: 'note', id: NOTE_ID }),
    ).rejects.toThrow(/SST_RESOURCE_NotesBucket_name/);
  });
});

// ---------------------------------------------------------------------------
// Tests: document ref
// ---------------------------------------------------------------------------

describe('resolveSourceText — document ref', () => {
  it('returns text and provenanceLabel for a ready document ref', async () => {
    const docText = '# Biology Textbook\n\nChapter 1: Introduction.';
    mockGetSource.mockResolvedValue(MOCK_SOURCE);
    mockS3Send.mockResolvedValue(makeS3Body(docText));

    const result = await resolveSourceText(SUB, { type: 'document', id: SOURCE_ID });

    expect(result.text).toBe(docText);
    expect(result.provenanceLabel).toBe(MOCK_SOURCE.title);
  });

  it("returns contentTrust 'user-authored' for an uploaded document source (type 'document')", async () => {
    mockGetSource.mockResolvedValue(MOCK_SOURCE); // type: 'document'
    mockS3Send.mockResolvedValue(makeS3Body('# Doc'));

    const result = await resolveSourceText(SUB, { type: 'document', id: SOURCE_ID });

    expect(result.contentTrust).toBe('user-authored');
  });

  it("returns contentTrust 'web-fetched' for a web source (type 'web')", async () => {
    mockGetSource.mockResolvedValue({ ...MOCK_SOURCE, type: 'web' });
    mockS3Send.mockResolvedValue(makeS3Body('# Web article'));

    const result = await resolveSourceText(SUB, { type: 'document', id: SOURCE_ID });

    expect(result.contentTrust).toBe('web-fetched');
  });

  it('throws when a document source is not found', async () => {
    mockGetSource.mockResolvedValue(undefined);

    await expect(
      resolveSourceText(SUB, { type: 'document', id: SOURCE_ID }),
    ).rejects.toThrow(/source not found/i);
  });

  it("throws when a document source's status is not 'ready' (uploading)", async () => {
    mockGetSource.mockResolvedValue({ ...MOCK_SOURCE, status: 'uploading' });

    await expect(
      resolveSourceText(SUB, { type: 'document', id: SOURCE_ID }),
    ).rejects.toThrow(/not ready/i);
  });

  it("throws when a document source's status is not 'ready' (extracting)", async () => {
    mockGetSource.mockResolvedValue({ ...MOCK_SOURCE, status: 'extracting' });

    await expect(
      resolveSourceText(SUB, { type: 'document', id: SOURCE_ID }),
    ).rejects.toThrow(/not ready/i);
  });

  it("throws when a document source's status is not 'ready' (failed)", async () => {
    mockGetSource.mockResolvedValue({ ...MOCK_SOURCE, status: 'failed' });

    await expect(
      resolveSourceText(SUB, { type: 'document', id: SOURCE_ID }),
    ).rejects.toThrow(/not ready/i);
  });

  it('throws when a ready source has no extractedTextS3Key', async () => {
    const { extractedTextS3Key: _omit, ...sourceWithoutKey } = MOCK_SOURCE;
    mockGetSource.mockResolvedValue(sourceWithoutKey);

    await expect(
      resolveSourceText(SUB, { type: 'document', id: SOURCE_ID }),
    ).rejects.toThrow(/extractedTextS3Key/i);
  });
});
