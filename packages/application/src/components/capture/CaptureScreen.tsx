'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, Badge, Button } from '@/src/components/ui';
import { uploadImageForTranscription, CaptureUploadError } from '@/lib/capture';
import type { TranscribeResult } from '@/lib/capture';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FacingMode = 'environment' | 'user';
type UploadStatus = 'idle' | 'processing' | 'done' | 'error';

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
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null); // null = unknown

  // "Edges detected" badge (cosmetic, appears ~1.5 s after video starts)
  const [edgesVisible, setEdgesVisible] = useState(false);

  // Upload status state machine
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadResult, setUploadResult] = useState<TranscribeResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Hidden file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  // Flash / torch
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

  const handleFlipToggle = useCallback(() => {
    setFlashEnabled((prev) => {
      const next = !prev;
      applyTorch(next);
      return next;
    });
  }, [applyTorch]);

  // ---------------------------------------------------------------------------
  // Flip camera
  // ---------------------------------------------------------------------------

  const handleFlip = useCallback(() => {
    setFlashEnabled(false);
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  // ---------------------------------------------------------------------------
  // Upload pipeline helper
  // ---------------------------------------------------------------------------

  const runUpload = useCallback(async (blob: Blob) => {
    setUploadStatus('processing');
    setUploadError(null);
    setUploadResult(null);

    try {
      const { result } = await uploadImageForTranscription(blob);
      setUploadResult(result);
      setUploadStatus('done');
    } catch (err) {
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
        if (blob) runUpload(blob);
      },
      'image/jpeg',
      0.95,
    );
  }, [facingMode, runUpload]);

  // ---------------------------------------------------------------------------
  // Upload file-input handler
  // ---------------------------------------------------------------------------

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      runUpload(file);
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [runUpload],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ---------------------------------------------------------------------------
  // Retake / capture another
  // ---------------------------------------------------------------------------

  const handleRetake = useCallback(() => {
    setUploadStatus('idle');
    setUploadError(null);
    setUploadResult(null);
    // Re-acquire camera if it was available
    if (cameraAvailable) {
      startCamera(facingMode);
    }
  }, [cameraAvailable, facingMode, startCamera]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isProcessingOrDone = uploadStatus === 'processing' || uploadStatus === 'done' || uploadStatus === 'error';

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
        <CircBtn
          icon="zap"
          label={flashEnabled ? 'Flash on' : 'Flash off'}
          onClick={handleFlipToggle}
          active={flashEnabled}
        />
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
          <div style={{ position: 'relative', width: '100%' }}>
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
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* ------------------------------------------------------- Hidden off-screen canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true" />

      {/* ------------------------------------------------------- Status overlays */}
      {isProcessingOrDone && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,32,35,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            zIndex: 10,
            padding: '0 32px',
          }}
        >
          {/* ---- processing ---- */}
          {uploadStatus === 'processing' && (
            // M4.8 will replace this minimal overlay with the full ProcessingScreen.
            <>
              <Icon name="sparkles" size={48} color="var(--gold-400)" />
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 17,
                  color: '#fff',
                  margin: 0,
                  fontWeight: 600,
                }}
              >
                Transforming…
              </p>
              {!prefersReducedMotion && (
                <div
                  style={{
                    width: 200,
                    height: 4,
                    borderRadius: 2,
                    background: 'rgba(255,255,255,0.15)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: '40%',
                      height: '100%',
                      background: 'var(--gold-400)',
                      borderRadius: 2,
                      animation: 'tmn-capture-slide 1.4s ease-in-out infinite',
                    }}
                  />
                </div>
              )}
              {/* Inline keyframe (scoped) */}
              <style>{`
                @keyframes tmn-capture-slide {
                  0%   { transform: translateX(-100%); }
                  50%  { transform: translateX(250%); }
                  100% { transform: translateX(-100%); }
                }
              `}</style>
            </>
          )}

          {/* ---- error ---- */}
          {uploadStatus === 'error' && (
            // M4.8 will replace this with the full ErrorScreen.
            <>
              <Icon name="image-off" size={48} color="rgba(255,255,255,0.6)" />
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 15,
                  color: 'rgba(255,255,255,0.85)',
                  margin: 0,
                  textAlign: 'center',
                  lineHeight: 1.55,
                }}
              >
                {uploadError ?? 'Something went wrong.'}
              </p>
              <Button variant="secondary" size="md" onClick={handleRetake}>
                Retake
              </Button>
            </>
          )}

          {/* ---- done ---- */}
          {uploadStatus === 'done' && (
            // M5 will route this into the editor; for now just confirm success.
            <>
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
                Transcribed {uploadResult?.wordCount ?? 0} words
              </p>
              <Button variant="accent" size="md" onClick={handleRetake}>
                Capture another
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
