import { useRef, useCallback, useMemo } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';

export interface LongPressController {
  start(x: number, y: number): void;
  move(x: number, y: number): void;
  end(): boolean;
  cancel(): void;
}

export function createLongPressController(opts: {
  delayMs?: number;
  moveTolerance?: number;
  onLongPress: () => void;
}): LongPressController {
  const delayMs = opts.delayMs ?? 500;
  const moveTolerance = opts.moveTolerance ?? 10;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let originX = 0;
  let originY = 0;
  let fired = false;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    start(x: number, y: number) {
      clearTimer();
      fired = false;
      originX = x;
      originY = y;
      timer = setTimeout(() => {
        fired = true;
        timer = null;
        opts.onLongPress();
      }, delayMs);
    },
    move(x: number, y: number) {
      if (timer === null) return;
      const dx = x - originX;
      const dy = y - originY;
      if (Math.sqrt(dx * dx + dy * dy) > moveTolerance) {
        clearTimer();
        fired = false;
      }
    },
    end(): boolean {
      clearTimer();
      const wasFired = fired;
      fired = false;
      return wasFired;
    },
    cancel() {
      clearTimer();
      fired = false;
    },
  };
}

export function useLongPress(
  onLongPress: () => void,
  opts?: { delayMs?: number; moveTolerance?: number },
) {
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const suppressNextClick = useRef(false);

  const controller = useMemo(
    () =>
      createLongPressController({
        delayMs: opts?.delayMs,
        moveTolerance: opts?.moveTolerance,
        onLongPress: () => onLongPressRef.current(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts?.delayMs, opts?.moveTolerance],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      controller.start(e.clientX, e.clientY);
    },
    [controller],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      controller.move(e.clientX, e.clientY);
    },
    [controller],
  );

  const onPointerUp = useCallback(
    (_e: ReactPointerEvent) => {
      const wasFired = controller.end();
      if (wasFired) {
        suppressNextClick.current = true;
      }
    },
    [controller],
  );

  const onPointerLeave = useCallback(
    (_e: ReactPointerEvent) => {
      controller.cancel();
    },
    [controller],
  );

  const onPointerCancel = useCallback(
    (_e: ReactPointerEvent) => {
      controller.cancel();
    },
    [controller],
  );

  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onClickCapture,
  };
}
