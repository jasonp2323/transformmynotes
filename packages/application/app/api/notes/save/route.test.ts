import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const getAuthenticatedSubMock = vi.hoisted(() => vi.fn());
const getTranscriptionJobMock = vi.hoisted(() => vi.fn());
const updateTranscriptionJobStatusMock = vi.hoisted(() => vi.fn());
const putNoteMock = vi.hoisted(() => vi.fn());
const putNoteTokensMock = vi.hoisted(() => vi.fn());
const tokeniseMock = vi.hoisted(() => vi.fn());
const postprocessMarkdownMock = vi.hoisted(() => vi.fn());
const countHighlightsMock = vi.hoisted(() => vi.fn());
const syncCardsForNoteMock = vi.hoisted(() => vi.fn());
const s3SendMock = vi.hoisted(() => vi.fn());
const putStorageDeltaEventMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/require-api-user', () => ({
  getAuthenticatedSub: getAuthenticatedSubMock,
}));

vi.mock('@transformmynotes/core', () => ({
  getTranscriptionJob: getTranscriptionJobMock,
  updateTranscriptionJobStatus: updateTranscriptionJobStatusMock,
  putNote: putNoteMock,
  putNoteTokens: putNoteTokensMock,
  tokenise: tokeniseMock,
  postprocessMarkdown: postprocessMarkdownMock,
  countHighlights: countHighlightsMock,
  syncCardsForNote: syncCardsForNoteMock,
  putStorageDeltaEvent: putStorageDeltaEventMock,
  storageKeys: {
    originalImage: (s: string, i: string) => `images/users/${s}/${i}.jpg`,
    noteMarkdown: (s: string, i: string) => `markdown/users/${s}/${i}.md`,
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function () { return { send: s3SendMock }; }),
  PutObjectCommand: vi.fn(function (input) { return { kind: 'PutObject', input }; }),
  HeadObjectCommand: vi.fn(function (input) { return { kind: 'HeadObject', input }; }),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import { POST } from './route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB = 'user-sub-1';
const JOB_ID = '01JABC';

const PENDING_JOB = {
  pk: `USER#${SUB}`,
  sk: `JOB#${JOB_ID}`,
  jobId: JOB_ID,
  status: 'pending' as const,
  s3Key: `images/users/${SUB}/${JOB_ID}.jpg`,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const DEFAULT_BODY = {
  jobId: JOB_ID,
  title: 'My Note',
  markdown: '## Notes\nSome content here.',
  tags: ['school', 'biology'],
};

function makeRequest(body: unknown = DEFAULT_BODY): Request {
  return new Request('http://localhost/api/notes/save', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env['SST_RESOURCE_NotesBucket_name'] = 'test-bucket';

  getAuthenticatedSubMock.mockResolvedValue(SUB);
  getTranscriptionJobMock.mockResolvedValue(PENDING_JOB);
  updateTranscriptionJobStatusMock.mockResolvedValue(undefined);
  putNoteMock.mockResolvedValue({});
  putNoteTokensMock.mockResolvedValue(undefined);
  syncCardsForNoteMock.mockResolvedValue({ created: 0, deleted: 0, unchanged: 0 });
  tokeniseMock.mockReturnValue(['my', 'note']);
  postprocessMarkdownMock.mockReturnValue({
    markdown: '## Notes\nSome content here.',
    wordCount: 4,
    detectedLang: 'unknown',
    ocrConfidence: 100,
  });
  countHighlightsMock.mockReturnValue(0);
  s3SendMock.mockResolvedValue({});
  putStorageDeltaEventMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/notes/save', () => {
  describe('auth', () => {
    it('returns 401 when getAuthenticatedSub returns null', async () => {
      getAuthenticatedSubMock.mockResolvedValueOnce(null);

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Unauthorized');
    });
  });

  describe('request validation', () => {
    it('returns 400 on invalid JSON body', async () => {
      const req = new Request('http://localhost/api/notes/save', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid request body.');
    });

    it('returns 400 when jobId is missing', async () => {
      const res = await POST(makeRequest({ title: 'T', markdown: 'x', tags: [] }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid jobId.');
    });

    it('returns 400 when jobId is not a string', async () => {
      const res = await POST(makeRequest({ jobId: 42, title: 'T', markdown: 'x' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid jobId.');
    });

    it('returns 400 when jobId is an empty string', async () => {
      const res = await POST(makeRequest({ jobId: '', title: 'T', markdown: 'x' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid jobId.');
    });

    it('returns 400 when markdown is not a string', async () => {
      const res = await POST(makeRequest({ jobId: JOB_ID, title: 'T', markdown: 42 }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid markdown.');
    });

    it('returns 400 when markdown is missing', async () => {
      const res = await POST(makeRequest({ jobId: JOB_ID, title: 'T' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid markdown.');
    });

    it('returns 400 when tags is not an array', async () => {
      const res = await POST(
        makeRequest({ jobId: JOB_ID, title: 'T', markdown: 'x', tags: 'school' }),
      );
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid tags.');
    });

    it('returns 400 when tags contains non-string elements', async () => {
      const res = await POST(
        makeRequest({ jobId: JOB_ID, title: 'T', markdown: 'x', tags: ['school', 42] }),
      );
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Invalid tags.');
    });

    it('returns 400 when more than 20 unique tags are provided', async () => {
      const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
      const res = await POST(makeRequest({ jobId: JOB_ID, title: 'T', markdown: 'x', tags }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('A note may have at most 20 tags.');
    });

    it('returns 400 when title is not a string', async () => {
      const res = await POST(
        makeRequest({ jobId: JOB_ID, title: 123, markdown: 'x' }),
      );
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Missing or invalid title.');
    });
  });

  describe('job lookup', () => {
    it('returns 404 when getTranscriptionJob returns null', async () => {
      getTranscriptionJobMock.mockResolvedValueOnce(null);

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(404);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Job not found.');
    });
  });

  describe('success path', () => {
    it('returns 200 with the expected payload', async () => {
      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.noteId).toBe(JOB_ID);
      expect(body.title).toBe('My Note');
      expect(body.wordCount).toBe(4);
      expect(body.highlights).toBe(0);
      expect(body.langPair).toBe('unknown');
      expect(body.ocrConfidence).toBe(100);
    });

    it('calls putNote with the right shape', async () => {
      postprocessMarkdownMock.mockReturnValueOnce({
        markdown: '## Notes\nSome content here.',
        wordCount: 7,
        detectedLang: 'pt-BR → en',
        ocrConfidence: 95,
      });
      countHighlightsMock.mockReturnValueOnce(2);

      await POST(makeRequest());

      expect(putNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: SUB,
          noteId: JOB_ID,
          title: 'My Note',
          tags: ['school', 'biology'],
          status: 'clean',
          words: 7,
          highlights: 2,
          langPair: 'pt-BR → en',
          ocrConfidence: 95,
          bodyS3Key: `markdown/users/${SUB}/${JOB_ID}.md`,
          originalImageS3Key: `images/users/${SUB}/${JOB_ID}.jpg`,
        }),
      );
    });

    it('calls PutObjectCommand with the markdown key and body', async () => {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');

      const md = '## Notes\nSome content here.';
      await POST(makeRequest({ ...DEFAULT_BODY, markdown: md }));

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: `markdown/users/${SUB}/${JOB_ID}.md`,
          Body: md,
          ContentType: 'text/markdown',
        }),
      );
    });

    it('calls getTranscriptionJob with sub and jobId', async () => {
      await POST(makeRequest());

      expect(getTranscriptionJobMock).toHaveBeenCalledWith(SUB, JOB_ID);
    });

    it('calls updateTranscriptionJobStatus with status "done"', async () => {
      await POST(makeRequest());

      expect(updateTranscriptionJobStatusMock).toHaveBeenCalledWith(
        expect.objectContaining({ sub: SUB, jobId: JOB_ID, status: 'done' }),
      );
    });

    it('de-duplicates tags before passing to putNote', async () => {
      const tagsWithDupes = ['school', 'biology', 'school'];
      await POST(makeRequest({ ...DEFAULT_BODY, tags: tagsWithDupes }));

      expect(putNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['school', 'biology'],
        }),
      );
    });

    it('calls putNoteTokens with tokenised title and markdown', async () => {
      await POST(makeRequest());

      expect(tokeniseMock).toHaveBeenCalled();
      expect(putNoteTokensMock).toHaveBeenCalledOnce();
    });

    it('calls syncCardsForNote with sub, noteId, and markdown after note is persisted', async () => {
      await POST(makeRequest());

      expect(syncCardsForNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: SUB,
          noteId: JOB_ID,
          markdownBody: DEFAULT_BODY.markdown,
        }),
      );
    });

    it('returns 200 even when syncCardsForNote rejects (best-effort)', async () => {
      syncCardsForNoteMock.mockRejectedValueOnce(new Error('card sync error'));

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.noteId).toBe(JOB_ID);
    });
  });

  describe('title defaulting', () => {
    it('defaults empty title to "Untitled note" in response and putNote', async () => {
      const res = await POST(makeRequest({ ...DEFAULT_BODY, title: '' }));
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.title).toBe('Untitled note');
      expect(putNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Untitled note' }),
      );
    });
  });

  describe('tags defaulting', () => {
    it('defaults to empty tags array when tags is omitted', async () => {
      const { tags: _tags, ...bodyWithoutTags } = DEFAULT_BODY;
      await POST(makeRequest(bodyWithoutTags));

      expect(putNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ tags: [] }),
      );
    });
  });

  describe('originalImageS3Keys', () => {
    it('passes valid keys through to putNote', async () => {
      const keys = [`images/users/${SUB}/01AAA.jpg`, `images/users/${SUB}/01BBB.jpg`];
      await POST(makeRequest({ ...DEFAULT_BODY, originalImageS3Keys: keys }));
      expect(putNoteMock).toHaveBeenCalledWith(expect.objectContaining({ originalImageS3Keys: keys }));
    });

    it('omitted field → putNote called WITHOUT originalImageS3Keys (undefined)', async () => {
      await POST(makeRequest(DEFAULT_BODY));
      const arg = putNoteMock.mock.calls[0][0] as Record<string, unknown>;
      expect(arg.originalImageS3Keys).toBeUndefined();
    });

    it('returns 400 when a key is outside the caller\'s prefix', async () => {
      const res = await POST(makeRequest({ ...DEFAULT_BODY, originalImageS3Keys: [`images/users/other-sub/01AAA.jpg`] }));
      const body = await res.json() as Record<string, unknown>;
      expect(res.status).toBe(400);
      expect(body.error).toBe('Invalid originalImageS3Keys.');
      expect(putNoteMock).not.toHaveBeenCalled();
    });
  });

  describe('best-effort job status', () => {
    it('returns 200 even if updateTranscriptionJobStatus rejects', async () => {
      updateTranscriptionJobStatusMock.mockRejectedValueOnce(
        new Error('ConditionalCheckFailed'),
      );

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(200);
      expect(body.noteId).toBe(JOB_ID);
    });
  });

  describe('env var validation', () => {
    it('returns 500 when SST_RESOURCE_NotesBucket_name is unset', async () => {
      delete process.env['SST_RESOURCE_NotesBucket_name'];

      const res = await POST(makeRequest());
      const body = await res.json() as Record<string, unknown>;

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Could not save note.');
    });
  });
});
