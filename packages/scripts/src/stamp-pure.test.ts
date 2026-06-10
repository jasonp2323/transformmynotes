import { describe, it, expect } from 'vitest'
import {
  parseStampArgs,
  computeCycleMinutes,
  formatCycleTime,
  nowIsoSeconds,
  todayDate,
} from './stamp-pure.js'

// ---------------------------------------------------------------------------
// parseStampArgs
// ---------------------------------------------------------------------------

describe('parseStampArgs', () => {
  it('parses a valid start action', () => {
    expect(parseStampArgs(['104', 'start'])).toEqual({ issue: 104, action: 'start' })
  })

  it('parses a valid done action', () => {
    expect(parseStampArgs(['42', 'done'])).toEqual({ issue: 42, action: 'done' })
  })

  it('throws on too few arguments', () => {
    expect(() => parseStampArgs([])).toThrow(/expected 2 arguments/)
    expect(() => parseStampArgs(['104'])).toThrow(/expected 2 arguments/)
  })

  it('throws on a non-numeric issue', () => {
    expect(() => parseStampArgs(['abc', 'start'])).toThrow(/positive integer/)
  })

  it('throws on a zero issue number', () => {
    expect(() => parseStampArgs(['0', 'start'])).toThrow(/positive integer/)
  })

  it('throws on a negative issue number', () => {
    expect(() => parseStampArgs(['-5', 'done'])).toThrow(/positive integer/)
  })

  it('throws on a float issue number', () => {
    expect(() => parseStampArgs(['1.5', 'done'])).toThrow(/positive integer/)
  })

  it('throws on an unknown action', () => {
    expect(() => parseStampArgs(['104', 'begin'])).toThrow(/"start" or "done"/)
  })

  it('throws on empty action string', () => {
    expect(() => parseStampArgs(['104', ''])).toThrow(/"start" or "done"/)
  })
})

// ---------------------------------------------------------------------------
// computeCycleMinutes
// ---------------------------------------------------------------------------

describe('computeCycleMinutes', () => {
  it('computes exact whole minutes', () => {
    expect(computeCycleMinutes('2026-06-10T10:00:00Z', '2026-06-10T10:45:00Z')).toBe(45)
  })

  it('rounds fractional minutes', () => {
    // 30 seconds over a minute boundary → rounds to 1
    expect(computeCycleMinutes('2026-06-10T10:00:00Z', '2026-06-10T10:01:30Z')).toBe(2)
    // 29 seconds → rounds down to 1
    expect(computeCycleMinutes('2026-06-10T10:00:00Z', '2026-06-10T10:01:29Z')).toBe(1)
  })

  it('clamps negative durations to 0', () => {
    expect(computeCycleMinutes('2026-06-10T10:45:00Z', '2026-06-10T10:00:00Z')).toBe(0)
  })

  it('returns 0 for identical timestamps', () => {
    expect(computeCycleMinutes('2026-06-10T10:00:00Z', '2026-06-10T10:00:00Z')).toBe(0)
  })

  it('handles multi-day durations', () => {
    // exactly 2 days = 2880 minutes
    expect(computeCycleMinutes('2026-06-08T10:00:00Z', '2026-06-10T10:00:00Z')).toBe(2880)
  })
})

// ---------------------------------------------------------------------------
// formatCycleTime
// ---------------------------------------------------------------------------

describe('formatCycleTime', () => {
  it('formats 0 minutes as "0m"', () => {
    expect(formatCycleTime(0)).toBe('0m')
  })

  it('formats 45 minutes as "45m"', () => {
    expect(formatCycleTime(45)).toBe('45m')
  })

  it('formats 60 minutes as "1h"', () => {
    expect(formatCycleTime(60)).toBe('1h')
  })

  it('formats 90 minutes as "1h 30m"', () => {
    expect(formatCycleTime(90)).toBe('1h 30m')
  })

  it('formats 150 minutes as "2h 30m"', () => {
    expect(formatCycleTime(150)).toBe('2h 30m')
  })

  it('formats 1440 minutes (1 day) as "1d"', () => {
    expect(formatCycleTime(1440)).toBe('1d')
  })

  it('formats 1500 minutes as "1d 1h" (omits trailing 0m)', () => {
    expect(formatCycleTime(1500)).toBe('1d 1h')
  })

  it('formats 1530 minutes as "1d 1h 30m"', () => {
    expect(formatCycleTime(1530)).toBe('1d 1h 30m')
  })

  it('formats 2880 minutes as "2d"', () => {
    expect(formatCycleTime(2880)).toBe('2d')
  })

  it('formats 2940 minutes as "2d 1h"', () => {
    expect(formatCycleTime(2940)).toBe('2d 1h')
  })

  it('formats 1 minute as "1m"', () => {
    expect(formatCycleTime(1)).toBe('1m')
  })

  it('handles large values (10 days + 3h + 15m)', () => {
    // 10*1440 + 3*60 + 15 = 14400 + 180 + 15 = 14595
    expect(formatCycleTime(14595)).toBe('10d 3h 15m')
  })
})

// ---------------------------------------------------------------------------
// nowIsoSeconds
// ---------------------------------------------------------------------------

describe('nowIsoSeconds', () => {
  const fixedDate = new Date('2026-06-10T17:47:05.123Z')

  it('strips milliseconds and returns second-precision ISO string', () => {
    expect(nowIsoSeconds(fixedDate)).toBe('2026-06-10T17:47:05Z')
  })

  it('does not contain a "." before the trailing Z', () => {
    expect(nowIsoSeconds(fixedDate)).not.toMatch(/\.\d+Z$/)
  })

  it('ends with Z (UTC)', () => {
    expect(nowIsoSeconds(fixedDate)).toMatch(/Z$/)
  })
})

// ---------------------------------------------------------------------------
// todayDate
// ---------------------------------------------------------------------------

describe('todayDate', () => {
  const fixedDate = new Date('2026-06-10T17:47:05.123Z')

  it('returns YYYY-MM-DD in UTC', () => {
    expect(todayDate(fixedDate)).toBe('2026-06-10')
  })

  it('returns exactly 10 characters', () => {
    expect(todayDate(fixedDate)).toHaveLength(10)
  })

  it('matches YYYY-MM-DD pattern', () => {
    expect(todayDate(fixedDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
