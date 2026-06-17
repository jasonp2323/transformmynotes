import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLongPressController } from '../longPress';

describe('createLongPressController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onLongPress after delayMs', () => {
    const onLongPress = vi.fn();
    const ctrl = createLongPressController({ delayMs: 500, onLongPress });
    ctrl.start(0, 0);
    vi.advanceTimersByTime(499);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on quick release before delayMs', () => {
    const onLongPress = vi.fn();
    const ctrl = createLongPressController({ delayMs: 500, onLongPress });
    ctrl.start(0, 0);
    vi.advanceTimersByTime(300);
    ctrl.end();
    vi.advanceTimersByTime(300);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('end() returns true once after firing, then false', () => {
    const onLongPress = vi.fn();
    const ctrl = createLongPressController({ delayMs: 500, onLongPress });
    ctrl.start(0, 0);
    vi.advanceTimersByTime(500);
    expect(ctrl.end()).toBe(true);
    // start again and release quickly
    ctrl.start(0, 0);
    expect(ctrl.end()).toBe(false);
  });

  it('moving beyond moveTolerance cancels the timer (no fire)', () => {
    const onLongPress = vi.fn();
    const ctrl = createLongPressController({ delayMs: 500, moveTolerance: 10, onLongPress });
    ctrl.start(0, 0);
    vi.advanceTimersByTime(200);
    ctrl.move(11, 0); // exceeds tolerance
    vi.advanceTimersByTime(400);
    expect(onLongPress).not.toHaveBeenCalled();
    expect(ctrl.end()).toBe(false);
  });

  it('moving within tolerance does not cancel', () => {
    const onLongPress = vi.fn();
    const ctrl = createLongPressController({ delayMs: 500, moveTolerance: 10, onLongPress });
    ctrl.start(0, 0);
    vi.advanceTimersByTime(200);
    ctrl.move(5, 5); // within tolerance (sqrt(50) ≈ 7.07)
    vi.advanceTimersByTime(300);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('cancel() prevents firing', () => {
    const onLongPress = vi.fn();
    const ctrl = createLongPressController({ delayMs: 500, onLongPress });
    ctrl.start(0, 0);
    vi.advanceTimersByTime(200);
    ctrl.cancel();
    vi.advanceTimersByTime(400);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('can be reused after end()', () => {
    const onLongPress = vi.fn();
    const ctrl = createLongPressController({ delayMs: 500, onLongPress });
    ctrl.start(0, 0);
    ctrl.end();
    // reuse
    ctrl.start(0, 0);
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
