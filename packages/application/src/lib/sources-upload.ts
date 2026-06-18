/**
 * sources-upload.ts
 *
 * Client-side upload helper for document sources (M20).
 * Framework-agnostic — no React imports.
 */

// ── MIME allowlist ─────────────────────────────────────────────────────────────

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  txt: 'text/plain',
  md: 'text/markdown',
};

const ALLOWED_MIMES = new Set(Object.values(EXTENSION_TO_MIME));

/**
 * Derive the canonical MIME type for a file.
 * Tries the browser-reported `file.type` first (if it is in the allowlist),
 * then falls back to the file extension.
 * Returns `null` when neither produces an allowed MIME type.
 */
export function mimeForFile(file: { name: string; type: string }): string | null {
  if (file.type && ALLOWED_MIMES.has(file.type)) {
    return file.type;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TO_MIME[ext] ?? null;
}

/**
 * Human-readable byte size, e.g. 0 → "0 B", 1536 → "1.5 KB", 5_242_880 → "5 MB".
 * Uses binary (1024) units and trims trailing ".0".
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const rounded = exponent === 0 ? String(bytes) : value.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${units[exponent]}`;
}

// ── Upload flow ────────────────────────────────────────────────────────────────

export interface UploadSourceOptions {
  onProgress?: (fraction: number) => void;
}

export interface UploadSourceResult {
  sourceId: string;
  status: 'ready' | 'extracting';
}

/**
 * Full upload pipeline:
 * 1. Derive contentType (throws 'unsupported_type' if not in allowlist).
 * 2. POST /api/sources/upload-url → { presignedUrl, s3Key, sourceId }.
 * 3. PUT file bytes to presignedUrl.
 * 4. POST /api/sources/[sourceId]/extract → { status }.
 * 5. Return { sourceId, status }.
 */
export async function uploadSource(
  file: File,
  opts?: UploadSourceOptions,
): Promise<UploadSourceResult> {
  // 1. Resolve MIME type
  const contentType = mimeForFile(file);
  if (!contentType) {
    throw new Error('unsupported_type');
  }

  // 2. Get presigned upload URL
  const urlRes = await fetch('/api/sources/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType,
      byteSize: file.size,
      title: file.name,
    }),
  });

  if (!urlRes.ok) {
    let errorKey = 'upload_failed';
    try {
      const body = (await urlRes.json()) as { error?: string };
      if (body.error) errorKey = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(errorKey);
  }

  const { presignedUrl, sourceId } = (await urlRes.json()) as {
    presignedUrl: string;
    s3Key: string;
    sourceId: string;
  };

  // 3. PUT file to S3 via presigned URL
  await fetch(presignedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });

  // Report progress as complete after the PUT
  opts?.onProgress?.(1);

  // 4. Trigger extraction
  const extractRes = await fetch(`/api/sources/${sourceId}/extract`, {
    method: 'POST',
  });

  if (!extractRes.ok) {
    let errorKey = 'extract_failed';
    try {
      const body = (await extractRes.json()) as { error?: string };
      if (body.error) errorKey = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(errorKey);
  }

  const extractData = (await extractRes.json()) as { ok: boolean; status: string };

  return {
    sourceId,
    status: extractData.status === 'ready' ? 'ready' : 'extracting',
  };
}
