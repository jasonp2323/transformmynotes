'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { moveItem, removeAt, buildBatchReviewUrl } from './pageTray';
import type { TrayPage } from './pageTray';
import { useRouter } from 'next/navigation';
import { Icon, Badge, Button } from '@/src/components/ui';
import { uploadImageForTranscription, CaptureUploadError, formatBytes, pickImage, readCameraCapabilities, clampZoom, normalizeFocusPoint, buildFocusConstraints, buildZoomConstraints, buildZoomPresets } from '@/lib/capture';
import type { ZoomRange } from '@/lib/capture';
import { enqueueCapture, getCurrentUserSub } from '@/src/lib/offline';
import { ProcessingScreen } from './ProcessingScreen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FacingMode = 'environment' | 'user';
type UploadStatus = 'idle' | 'processing' | 'done' | 'error' | 'queued';
type CaptureMode = 'single' | 'multi';
type MultiUploadStatus = 'idle' | 'uploading' | 'error';

// ---------------------------------------------------------------------------
// Pure helper — determines whether a failed upload should be queued offline
// rather than surfaced as an error. Exported for unit testing.
// ---------------------------------------------------------------------------

/**
 * Returns true when we should silently queue the capture instead of showing
 * the error overlay:
 *   - The browser is now offline, AND
 *   - The error (if any) is a CaptureUploadError from a network phase
 *     (presign or put) — not a local failure like resize or transcribe.
 *
 * When called for an up-front offline check (no error yet), pass `undefined`
 * for `err` and the function still returns true if `isOnline` is false.
 */
export function shouldQueueCapture(err: unknown, isOnline: boolean): boolean {
  if (isOnline) return false;
  // If there's no error (called before attempting upload), queue it.
  if (err === undefined || err === null) return true;
  // For a CaptureUploadError, only queue network-phase failures.
  if (err instanceof CaptureUploadError) {
    return err.phase === 'presign' || err.phase === 'put';
  }
  // For any other error type while offline, treat as a network failure and queue.
  return true;
}

// ---------------------------------------------------------------------------
// CircBtn — circular icon button matching the design's header controls
// ---------------------------------------------------------------------------

function CircBtn({
  icon,
  label,
  onClick,
  active,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        border: 'none',
        background: active ? 'rgba(255,215,0,0.28)' : 'rgba(255,255,255,0.14)',
        width: 38,
        height: 38,
        borderRadius: '50%',
        color: active ? 'var(--gold-400)' : '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icon name={icon} size={icon === 'x' ? 20 : 18} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Corner bracket — one of the four gold edge affordance spans
// ---------------------------------------------------------------------------

/** c: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right */
function CornerBracket({ c }: { c: 0 | 1 | 2 | 3 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        width: 28,
        height: 28,
        borderColor: 'var(--gold-400)',
        borderStyle: 'solid',
        borderTopWidth: c < 2 ? 3 : 0,
        borderBottomWidth: c >= 2 ? 3 : 0,
        borderLeftWidth: c % 2 === 0 ? 3 : 0,
        borderRightWidth: c % 2 === 1 ? 3 : 0,
        top: c < 2 ? -12 : 'auto',
        bottom: c >= 2 ? -12 : 'auto',
        left: c % 2 === 0 ? -12 : 'auto',
        right: c % 2 === 1 ? -12 : 'auto',
        borderRadius:
          c === 0 ? '7px 0 0 0' :
          c === 1 ? '0 7px 0 0' :
          c === 2 ? '0 0 0 7px' :
                    '0 0 7px 0',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// CaptureScreen — main export
// ---------------------------------------------------------------------------

export function CaptureScreen() {
  const router = useRouter();

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [focusIndicator, setFocusIndicator] = useState<{ x: number; y: number; key: number } | null>(null);
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null); // null = unknown

  // Pinch-to-zoom refs
  const pinchPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const pinchingRef = useRef(false); // true while ≥2 pointers; briefly true after last pointer up to block click
  const zoomLevelRef = useRef(1);   // mirror of zoomLevel state — avoids stale closure in pointer handlers

  // "Edges detected" badge (cosmetic, appears ~1.5 s after video starts)
  const [edgesVisible, setEdgesVisible] = useState(false);

  // Upload status state machine
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [capturedJobId, setCapturedJobId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [resizedInfo, setResizedInfo] = useState<{ originalBytes: number; resizedBytes: number } | null>(null);

  // The blob to re-upload on retry
  const pendingBlobRef = useRef<Blob | null>(null);

  // Hidden file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pending callbacks for the web-fallback promise wired through pickImage.
  // When handleUploadClick uses pickImage on web, it clicks the hidden input
  // and parks resolve/reject here; handleFileChange picks them up so the file
  // travels through a single runUpload call — no double-trigger.
  const fileInputResolveRef = useRef<((f: File) => void) | null>(null);
  const fileInputRejectRef = useRef<((reason?: unknown) => void) | null>(null);

  // ---------------------------------------------------------------------------
  // Multi-page tray state
  // ---------------------------------------------------------------------------
  const [mode, setMode] = useState<CaptureMode>('single');
  // modeRef mirrors mode to avoid stale closures inside canvas.toBlob callbacks
  const modeRef = useRef<CaptureMode>('single');
  const [pages, setPages] = useState<TrayPage[]>([]);
  const [multiUploadStatus, setMultiUploadStatus] = useState<MultiUploadStatus>('idle');
  const [multiUploadError, setMultiUploadError] = useState<string | null>(null);
  const [batchInFlight, setBatchInFlight] = useState(false);
  // Track object URLs created for thumbnails so we can revoke them on unmount
  const thumbnailUrlsRef = useRef<string[]>([]);

  // Canvas used for shutter capture (off-screen)
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Reduced-motion preference
  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  // ---------------------------------------------------------------------------
  // Camera lifecycle
  // ---------------------------------------------------------------------------

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setEdgesVisible(false);
  }, []);

  const startCamera = useCallback(
    async (facing: FacingMode) => {
      stopStream();

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setCameraAvailable(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraAvailable(true);

        // Reset torch on every new stream (capability may differ per camera)
        setTorchOn(false);

        // Read camera capabilities (zoom, torch, focus)
        const track = stream.getVideoTracks()[0];
        if (track) {
          const caps = readCameraCapabilities(track);
          setTorchSupported(caps.torch);
          setZoomRange(caps.zoom);
          setZoomLevel(caps.zoom ? caps.zoom.min : 1);
          zoomLevelRef.current = caps.zoom ? caps.zoom.min : 1;
        }
        setFocusIndicator(null);

        // Cosmetic "Edges detected" badge — appears after 1.5 s
        const timer = setTimeout(() => setEdgesVisible(true), 1500);
        return () => clearTimeout(timer);
      } catch {
        setCameraAvailable(false);
      }
    },
    [stopStream],
  );

  // Start camera on mount; clean up on unmount
  useEffect(() => {
    const cleanup = startCamera(facingMode);
    return () => {
      cleanup?.then?.((fn) => fn?.());
      stopStream();
      // Revoke all thumbnail object URLs to avoid memory leaks
      thumbnailUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      thumbnailUrlsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restart camera when facingMode changes (after first mount)
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    startCamera(facingMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // ---------------------------------------------------------------------------
  // Torch
  // ---------------------------------------------------------------------------

  const applyTorch = useCallback(
    async (enabled: boolean) => {
      if (!streamRef.current) return;
      const track = streamRef.current.getVideoTracks()[0];
      if (!track) return;
      try {
        // @ts-expect-error — torch is not in the standard TS lib yet
        await track.applyConstraints({ advanced: [{ torch: enabled }] });
      } catch {
        // Silently ignore — torch unsupported on this device/browser
      }
    },
    [],
  );

  const handleTorchToggle = useCallback(() => {
    setTorchOn((prev) => {
      const next = !prev;
      applyTorch(next);
      return next;
    });
  }, [applyTorch]);

  // ---------------------------------------------------------------------------
  // Zoom
  // ---------------------------------------------------------------------------

  const applyZoom = useCallback((v: number) => {
    setZoomLevel(v);
    zoomLevelRef.current = v;
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      track.applyConstraints(buildZoomConstraints(v) as MediaTrackConstraints).catch(() => {});
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Flip camera
  // ---------------------------------------------------------------------------

  const handleFlip = useCallback(() => {
    setTorchOn(false);
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  // ---------------------------------------------------------------------------
  // Pinch-to-zoom
  // ---------------------------------------------------------------------------

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pinchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPointersRef.current.size === 2) {
      pinchingRef.current = true;
      const pts = [...pinchPointersRef.current.values()];
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      pinchStartDistRef.current = Math.sqrt(dx * dx + dy * dy);
      // Use the ref mirror to avoid a stale zoomLevel from the render closure
      pinchStartZoomRef.current = zoomLevelRef.current;
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pinchPointersRef.current.has(e.pointerId)) return;
    pinchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPointersRef.current.size !== 2 || pinchStartDistRef.current === null || !zoomRange) return;
    const pts = [...pinchPointersRef.current.values()];
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const scale = dist / pinchStartDistRef.current;
    const newZoom = clampZoom(pinchStartZoomRef.current * scale, zoomRange);
    applyZoom(newZoom);
  }, [zoomRange, applyZoom]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pinchPointersRef.current.delete(e.pointerId);
    if (pinchPointersRef.current.size < 2) {
      pinchStartDistRef.current = null;
    }
    if (pinchPointersRef.current.size === 0 && pinchingRef.current) {
      // Brief delay so the click event that fires after the final pointerup
      // is still suppressed (click fires synchronously before this timeout if
      // delay is 0, so use a short but non-zero window).
      setTimeout(() => { pinchingRef.current = false; }, 300);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Tap-to-focus
  // ---------------------------------------------------------------------------

  const handleViewfinderClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cameraAvailable) return;
    if (pinchingRef.current) return; // suppress focus tap immediately after a pinch
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = normalizeFocusPoint(e.clientX, e.clientY, rect, facingMode === 'user');

    // Show focus ring at raw pixel position within the container
    const pixelX = e.clientX - rect.left;
    const pixelY = e.clientY - rect.top;
    setFocusIndicator({ x: pixelX, y: pixelY, key: Date.now() });

    // Apply focus constraint
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      track.applyConstraints(buildFocusConstraints({ x, y }) as MediaTrackConstraints).catch(() => {});
    }
  }, [cameraAvailable, facingMode]);

  // ---------------------------------------------------------------------------
  // Upload pipeline helper
  // ---------------------------------------------------------------------------

  const runUpload = useCallback(async (blob: Blob) => {
    pendingBlobRef.current = blob;

    // ── Offline up-front check ──────────────────────────────────────────────
    // If the device has no connection, skip the network pipeline entirely and
    // queue the capture for replay on reconnect.
    if (shouldQueueCapture(undefined, navigator.onLine)) {
      const sub = await getCurrentUserSub();
      if (!sub) {
        // Can't identify the user — surface the error so they know.
        setUploadError('You appear to be offline and we could not identify your account. Please sign in and try again.');
        setUploadStatus('error');
        return;
      }
      await enqueueCapture({ sub, blob, contentType: blob.type || 'image/jpeg' });
      // Best-effort Background Sync registration so the SW drains the queue on reconnect.
      navigator.serviceWorker?.ready
        .then((r) => (r.sync as { register?: (tag: string) => Promise<void> } | undefined)?.register?.('tmn-sync'))
        .catch(() => {});
      setUploadStatus('queued');
      return;
    }

    // ── Online path ─────────────────────────────────────────────────────────
    setUploadStatus('processing');
    setUploadError(null);
    setUploadProgress(0);
    setIsRetrying(false);
    setResizedInfo(null);

    try {
      const { jobId } = await uploadImageForTranscription(blob, {
        onProgress: (fraction) => {
          setUploadProgress(Math.round(fraction * 100));
        },
        onResized: (info) => {
          setResizedInfo(info);
        },
      });
      setCapturedJobId(jobId);
      setUploadStatus('done');
    } catch (err) {
      // ── Mid-upload offline detection ───────────────────────────────────────
      // If a network-phase failure occurred and we're now offline, queue the
      // capture rather than surfacing an error.
      if (shouldQueueCapture(err, navigator.onLine)) {
        const sub = await getCurrentUserSub();
        if (sub) {
          await enqueueCapture({ sub, blob, contentType: blob.type || 'image/jpeg' });
          navigator.serviceWorker?.ready
            .then((r) => (r.sync as { register?: (tag: string) => Promise<void> } | undefined)?.register?.('tmn-sync'))
            .catch(() => {});
          setUploadStatus('queued');
          return;
        }
        // If we couldn't get a sub, fall through to the normal error overlay.
      }

      let msg = 'Something went wrong. Please try again.';
      if (err instanceof CaptureUploadError) {
        if (err.phase === 'resize') {
          msg = "Couldn't read that image — try a JPEG.";
        } else if (err.phase === 'presign') {
          msg = 'Could not start upload. Please check your connection.';
        } else if (err.phase === 'put') {
          msg = 'Upload failed. Please try again.';
        } else if (err.phase === 'transcribe') {
          msg = 'Transcription failed. Please try again.';
        }
      }
      setUploadError(msg);
      setUploadStatus('error');
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Multi-mode page upload — uploads one page and appends it to the tray
  // ---------------------------------------------------------------------------

  const runMultiUpload = useCallback(async (blob: Blob) => {
    setMultiUploadStatus('uploading');
    setMultiUploadError(null);

    // Generate thumbnail URL from the blob before upload (independent of resize)
    const thumbnailUrl = URL.createObjectURL(blob);
    thumbnailUrlsRef.current.push(thumbnailUrl);

    try {
      const { jobId } = await uploadImageForTranscription(blob, {
        onProgress: () => {},
        onResized: () => {},
      });
      setPages((prev) => [...prev, { jobId, thumbnailUrl }]);
      setMultiUploadStatus('idle');
    } catch {
      // Revoke the thumbnail URL since the page wasn't added
      URL.revokeObjectURL(thumbnailUrl);
      thumbnailUrlsRef.current = thumbnailUrlsRef.current.filter((u) => u !== thumbnailUrl);
      setMultiUploadError('Upload failed — please try again.');
      setMultiUploadStatus('error');
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Shutter handler — capture current video frame
  // ---------------------------------------------------------------------------

  const handleShutter = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror the frame if using front camera (to match the mirrored preview)
    if (facingMode === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        // Read mode from ref to avoid stale closure (canvas.toBlob is async)
        if (modeRef.current === 'multi') {
          runMultiUpload(blob);
        } else {
          runUpload(blob);
        }
      },
      'image/jpeg',
      0.95,
    );
  }, [facingMode, runUpload, runMultiUpload]);

  // ---------------------------------------------------------------------------
  // Upload file-input handler
  // ---------------------------------------------------------------------------

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so the same file can be re-selected
      e.target.value = '';
      if (!file) {
        // User cancelled — reject any waiting pickImage promise.
        fileInputRejectRef.current?.(new DOMException('No file chosen', 'AbortError'));
        fileInputResolveRef.current = null;
        fileInputRejectRef.current = null;
        return;
      }

      if (fileInputResolveRef.current) {
        // Resolve the promise created by the web-fallback inside pickImage.
        // runUpload will be called by the handleUploadClick await chain below.
        const resolve = fileInputResolveRef.current;
        fileInputResolveRef.current = null;
        fileInputRejectRef.current = null;
        resolve(file);
      } else {
        // Direct onChange (e.g. user activated the input without going through
        // handleUploadClick) — forward to the appropriate upload handler.
        if (modeRef.current === 'multi') {
          runMultiUpload(file);
        } else {
          runUpload(file);
        }
      }
    },
    [runUpload, runMultiUpload],
  );

  const handleUploadClick = useCallback(() => {
    /**
     * Web fallback: returns a Promise that resolves with the File the user
     * picks via the existing hidden <input>. We click the input and park the
     * resolve/reject callbacks in refs so handleFileChange can pick them up —
     * this avoids creating a second transient input and keeps the same resize /
     * upload pipeline active regardless of platform.
     */
    const webFallback = (): Promise<File> =>
      new Promise<File>((resolve, reject) => {
        fileInputResolveRef.current = resolve;
        fileInputRejectRef.current = reject;
        fileInputRef.current?.click();
      });

    // pickImage routes to native Capacitor camera on device, web fallback on
    // browser. Either way we get a File and hand it to the appropriate handler.
    const handler = modeRef.current === 'multi' ? runMultiUpload : runUpload;
    pickImage({ webFallback }).then(handler).catch(() => {
      // User cancelled or error — nothing to upload.
    });
  }, [runUpload, runMultiUpload]);

  // ---------------------------------------------------------------------------
  // Navigate to review screen when transcription is done
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (uploadStatus === 'done' && capturedJobId) {
      router.push(`/capture/review?jobId=${encodeURIComponent(capturedJobId)}`);
    }
  }, [uploadStatus, capturedJobId, router]);

  // Keep zoomLevelRef in sync with the zoomLevel state to avoid stale closure
  // captures in pointer event handlers.
  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  // Keep modeRef in sync with mode state to avoid stale closures inside
  // canvas.toBlob callbacks (same pattern as zoomLevelRef).
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Clear focus indicator when reduced motion (animation won't fire onAnimationEnd)
  useEffect(() => {
    if (!prefersReducedMotion || !focusIndicator) return;
    const t = setTimeout(() => setFocusIndicator(null), 700);
    return () => clearTimeout(t);
  }, [focusIndicator, prefersReducedMotion]);

  // ---------------------------------------------------------------------------
  // Retake / capture another
  // ---------------------------------------------------------------------------

  const handleRetake = useCallback(() => {
    setUploadStatus('idle');
    setUploadError(null);
    setCapturedJobId(null);
    setUploadProgress(0);
    setIsRetrying(false);
    setResizedInfo(null);
    pendingBlobRef.current = null;
    // Re-acquire camera if it was available
    if (cameraAvailable) {
      startCamera(facingMode);
    }
  }, [cameraAvailable, facingMode, startCamera]);

  // Retry the upload with the same blob
  const handleRetry = useCallback(() => {
    const blob = pendingBlobRef.current;
    if (!blob) {
      handleRetake();
      return;
    }
    setIsRetrying(true);
    runUpload(blob);
  }, [runUpload, handleRetake]);

  // ---------------------------------------------------------------------------
  // Mode toggle
  // ---------------------------------------------------------------------------

  const handleModeChange = useCallback((newMode: CaptureMode) => {
    if (newMode === mode) return;
    // Switching back to single: clear the tray and revoke all thumbnail URLs
    if (newMode === 'single') {
      setPages((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.thumbnailUrl));
        thumbnailUrlsRef.current = [];
        return [];
      });
      setMultiUploadStatus('idle');
      setMultiUploadError(null);
    }
    setMode(newMode);
  }, [mode]);

  // ---------------------------------------------------------------------------
  // Tray manipulation handlers
  // ---------------------------------------------------------------------------

  const handlePageDelete = useCallback((index: number) => {
    setPages((prev) => {
      const page = prev[index];
      if (page) {
        URL.revokeObjectURL(page.thumbnailUrl);
        thumbnailUrlsRef.current = thumbnailUrlsRef.current.filter((u) => u !== page.thumbnailUrl);
      }
      return removeAt(prev, index);
    });
  }, []);

  const handlePageMoveLeft = useCallback((index: number) => {
    setPages((prev) => moveItem(prev, index, index - 1));
  }, []);

  const handlePageMoveRight = useCallback((index: number) => {
    setPages((prev) => moveItem(prev, index, index + 1));
  }, []);

  // ---------------------------------------------------------------------------
  // Batch submit ("Done")
  // ---------------------------------------------------------------------------

  const handleBatchDone = useCallback(async () => {
    if (pages.length === 0 || batchInFlight || multiUploadStatus === 'uploading') return;
    setBatchInFlight(true);
    setMultiUploadError(null);
    try {
      const jobIds = pages.map((p) => p.jobId);
      const res = await fetch('/api/transcribe/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMultiUploadError((body as { error?: string }).error ?? 'Stitching failed — please try again.');
        setBatchInFlight(false);
        return;
      }
      const data = await res.json() as { jobId: string };
      const url = buildBatchReviewUrl(data.jobId, jobIds);
      router.push(url);
    } catch {
      setMultiUploadError('Stitching failed — please try again.');
      setBatchInFlight(false);
    }
  }, [pages, batchInFlight, multiUploadStatus, router]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const pct = uploadProgress;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'radial-gradient(120% 90% at 50% 0%, #16414a 0%, #0e2b2f 60%, #0a2023 100%)',
        color: '#fff',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes focusRingFade {
          0% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(1); }
        }
      `}</style>

      {/* ----------------------------------------------------------------- Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px 10px',
          flexShrink: 0,
        }}
      >
        <CircBtn
          icon="x"
          label="Close"
          onClick={() => {
            stopStream();
            router.back();
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Capture note
        </span>
        {torchSupported ? (
          <CircBtn
            icon={torchOn ? 'flashlight' : 'flashlight-off'}
            label={torchOn ? 'Light on' : 'Light off'}
            onClick={handleTorchToggle}
            active={torchOn}
          />
        ) : (
          <div style={{ width: 38 }} />
        )}
      </div>

      {/* ------------------------------------------------------- Mode toggle */}
      <div
        role="group"
        aria-label="Capture mode"
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '0 20px 10px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.10)',
            borderRadius: 999,
            padding: 3,
            gap: 2,
          }}
        >
          {(['single', 'multi'] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => handleModeChange(m)}
                style={{
                  borderRadius: 999,
                  padding: '6px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  border: 'none',
                  background: active ? 'rgba(255,215,0,0.28)' : 'transparent',
                  color: active ? 'var(--gold-400)' : 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {m === 'single' ? 'Single note' : 'Multi-page note'}
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------- Viewfinder / fallback */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 34px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {cameraAvailable === false ? (
          /* Camera unavailable fallback */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 18,
              textAlign: 'center',
              maxWidth: 280,
            }}
          >
            <Icon name="image-off" size={48} color="rgba(255,255,255,0.35)" />
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                color: 'rgba(255,255,255,0.7)',
                margin: 0,
                lineHeight: 1.55,
              }}
            >
              Camera unavailable — upload a photo instead
            </p>
            <Button
              variant="accent"
              size="md"
              leftIcon={<Icon name="image" size={18} />}
              onClick={handleUploadClick}
            >
              Upload photo
            </Button>
          </div>
        ) : (
          /* Live video viewfinder */
          <div
            onClick={handleViewfinderClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ position: 'relative', width: '100%', cursor: cameraAvailable ? 'crosshair' : 'default' }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                display: 'block',
                borderRadius: 8,
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
              }}
            />

            {/* Four gold corner brackets */}
            {([0, 1, 2, 3] as const).map((c) => (
              <CornerBracket key={c} c={c} />
            ))}

            {/* "Edges detected" badge */}
            {edgesVisible && (
              <div style={{ position: 'absolute', top: 12, right: 12 }}>
                <Badge tone="success" dot>
                  Edges detected
                </Badge>
              </div>
            )}

            {/* Tap-to-focus ring */}
            {focusIndicator && (
              <div
                key={focusIndicator.key}
                aria-hidden="true"
                onAnimationEnd={() => setFocusIndicator(null)}
                style={{
                  position: 'absolute',
                  left: focusIndicator.x,
                  top: focusIndicator.y,
                  width: 56,
                  height: 56,
                  marginLeft: -28,
                  marginTop: -28,
                  border: '2px solid var(--gold-400)',
                  borderRadius: 4,
                  pointerEvents: 'none',
                  animation: prefersReducedMotion ? 'none' : 'focusRingFade 0.7s ease-out forwards',
                }}
              />
            )}

          </div>
        )}
      </div>

      {/* ------------------------------------------------------- Helper caption */}
      {cameraAvailable !== false && (
        <div
          style={{
            textAlign: 'center',
            color: 'rgba(255,255,255,0.82)',
            fontFamily: 'var(--font-sans)',
            fontSize: 13.5,
            paddingBottom: 6,
            flexShrink: 0,
          }}
        >
          Hold steady — keep the whole page in frame.
        </div>
      )}

      {/* ------------------------------------------------------- Zoom preset pills */}
      {cameraAvailable !== false && zoomRange && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            paddingBottom: 8,
            flexShrink: 0,
          }}
        >
          {buildZoomPresets(zoomRange).map((preset) => {
            const active = Math.abs(zoomLevel - preset.value) < 0.01;
            return (
              <button
                key={preset.value}
                type="button"
                aria-label={`Zoom ${preset.label}`}
                aria-pressed={active}
                disabled={!preset.enabled}
                onClick={preset.enabled ? () => applyZoom(clampZoom(preset.value, zoomRange)) : undefined}
                style={{
                  borderRadius: 999,
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'var(--font-sans)',
                  minWidth: 44,
                  border: active ? '1px solid var(--gold-400)' : '1px solid transparent',
                  background: active ? 'rgba(255,215,0,0.28)' : 'rgba(255,255,255,0.14)',
                  color: active ? 'var(--gold-400)' : '#fff',
                  cursor: preset.enabled ? 'pointer' : 'default',
                  opacity: preset.enabled ? 1 : 0.35,
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------- Page tray (multi mode only) */}
      {mode === 'multi' && (
        <div
          style={{
            flexShrink: 0,
            padding: '0 16px 8px',
          }}
        >
          {/* Error banner */}
          {multiUploadError && (
            <p
              aria-live="assertive"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: '#ff8080',
                margin: '0 0 6px',
                textAlign: 'center',
              }}
            >
              {multiUploadError}
            </p>
          )}

          {/* Uploading indicator */}
          {multiUploadStatus === 'uploading' && (
            <p
              aria-live="polite"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: 'rgba(255,255,255,0.65)',
                margin: '0 0 6px',
                textAlign: 'center',
              }}
            >
              Adding page…
            </p>
          )}

          {/* Thumbnails */}
          {pages.length > 0 && (
            <div
              role="list"
              aria-label="Captured pages"
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 6,
              }}
            >
              {pages.map((page, idx) => (
                <div
                  key={page.jobId}
                  role="listitem"
                  style={{
                    position: 'relative',
                    flexShrink: 0,
                    width: 70,
                  }}
                >
                  {/* Thumbnail image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.thumbnailUrl}
                    alt={`Page ${idx + 1}`}
                    style={{
                      width: 70,
                      height: 90,
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: '1.5px solid rgba(255,255,255,0.22)',
                      display: 'block',
                    }}
                  />

                  {/* Page number badge */}
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                      fontSize: 11,
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 700,
                      borderRadius: 4,
                      padding: '1px 5px',
                      lineHeight: 1.4,
                    }}
                  >
                    {idx + 1}
                  </span>

                  {/* Delete button */}
                  <button
                    type="button"
                    aria-label={`Remove page ${idx + 1}`}
                    onClick={() => handlePageDelete(idx)}
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.65)',
                      border: 'none',
                      color: '#fff',
                      fontSize: 13,
                      lineHeight: 1,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                    }}
                  >
                    ×
                  </button>

                  {/* Reorder buttons */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: 3,
                    }}
                  >
                    <button
                      type="button"
                      aria-label={`Move page ${idx + 1} left`}
                      disabled={idx === 0}
                      onClick={() => handlePageMoveLeft(idx)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: idx === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.75)',
                        fontSize: 14,
                        cursor: idx === 0 ? 'default' : 'pointer',
                        padding: '2px 4px',
                      }}
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      aria-label={`Move page ${idx + 1} right`}
                      disabled={idx === pages.length - 1}
                      onClick={() => handlePageMoveRight(idx)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: idx === pages.length - 1 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.75)',
                        fontSize: 14,
                        cursor: idx === pages.length - 1 ? 'default' : 'pointer',
                        padding: '2px 4px',
                      }}
                    >
                      ▶
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Done button */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <Button
              variant="accent"
              size="md"
              disabled={pages.length === 0 || multiUploadStatus === 'uploading' || batchInFlight}
              onClick={handleBatchDone}
            >
              {batchInFlight
                ? `Stitching ${pages.length} page${pages.length !== 1 ? 's' : ''}…`
                : `Done (${pages.length} page${pages.length !== 1 ? 's' : ''})`}
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- Bottom control bar */}
      {cameraAvailable !== false && (
        <div
          style={{
            flexShrink: 0,
            padding: '14px 30px 30px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {/* Upload */}
            <button
              type="button"
              onClick={handleUploadClick}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                color: '#fff',
                padding: 0,
              }}
            >
              <Icon name="image" size={26} />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-sans)' }}>Upload</span>
            </button>

            {/* Shutter */}
            <button
              type="button"
              aria-label="Shutter"
              onClick={handleShutter}
              style={{
                width: 74,
                height: 74,
                borderRadius: '50%',
                border: '4px solid rgba(255,255,255,0.85)',
                background: '#fff',
                cursor: 'pointer',
                boxShadow: '0 0 0 3px rgba(255,255,255,0.22)',
                flexShrink: 0,
              }}
            />

            {/* Flip */}
            <button
              type="button"
              onClick={handleFlip}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                color: '#fff',
                padding: 0,
              }}
            >
              <Icon name="rotate-ccw" size={26} />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-sans)' }}>Flip</span>
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* ------------------------------------------------------- Hidden off-screen canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true" />

      {/* ------------------------------------------------------- Status overlays */}
      {uploadStatus === 'processing' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <ProcessingScreen prefersReducedMotion={prefersReducedMotion} />
          {/* Upload progress bar */}
          <div
            aria-live="polite"
            style={{
              position: 'absolute',
              bottom: 60,
              left: 0,
              right: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '0 32px',
            }}
          >
            {isRetrying && (
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.75)',
                  margin: 0,
                }}
              >
                Retrying…
              </p>
            )}
            <progress
              aria-label="Upload progress"
              max={100}
              value={pct}
              aria-valuenow={pct}
              style={{ width: '100%', maxWidth: 280 }}
            />
            {resizedInfo && (
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.55)',
                  margin: 0,
                }}
              >
                Optimized: {formatBytes(resizedInfo.originalBytes)} → {formatBytes(resizedInfo.resizedBytes)}
              </p>
            )}
          </div>
        </div>
      )}

      {uploadStatus === 'error' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,32,35,0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            zIndex: 10,
            padding: '0 32px',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              color: '#fff',
              margin: 0,
              textAlign: 'center',
            }}
          >
            {uploadError ?? 'Upload failed — please try again'}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button variant="accent" size="md" onClick={handleRetry}>
              Retry
            </Button>
            <Button variant="ghost" size="md" onClick={handleRetake}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {uploadStatus === 'done' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,32,35,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            zIndex: 10,
            padding: '0 32px',
          }}
        >
          <Icon name="check" size={48} color="var(--gold-400)" />
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 17,
              color: '#fff',
              margin: 0,
              fontWeight: 600,
            }}
          >
            Opening review…
          </p>
        </div>
      )}

      {uploadStatus === 'queued' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,32,35,0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            zIndex: 10,
            padding: '0 32px',
          }}
        >
          <Icon name="cloud-off" size={48} color="var(--gold-400)" />
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 17,
              color: '#fff',
              margin: 0,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            Saved — we&apos;ll process this when you&apos;re back online
          </p>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              color: 'rgba(255,255,255,0.65)',
              margin: 0,
              textAlign: 'center',
            }}
          >
            Your photo is stored on this device and will upload automatically on reconnect.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Button variant="accent" size="md" onClick={() => router.push('/dashboard')}>
              Done
            </Button>
            <Button variant="ghost" size="md" onClick={handleRetake}>
              Capture another
            </Button>
          </div>
        </div>
      )}

      {batchInFlight && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,32,35,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            zIndex: 10,
            padding: '0 32px',
          }}
        >
          <Icon name="loader-circle" size={48} color="var(--gold-400)" />
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 17,
              color: '#fff',
              margin: 0,
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            Stitching {pages.length} page{pages.length !== 1 ? 's' : ''}…
          </p>
        </div>
      )}
    </div>
  );
}
