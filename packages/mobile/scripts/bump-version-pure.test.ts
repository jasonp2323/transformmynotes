import { describe, it, expect } from 'vitest'
import { setVersionName, incrementVersionCode } from './bump-version-pure.js'

// Minimal inline sample of build.gradle text — no real file I/O
const SAMPLE_GRADLE = `
android {
    defaultConfig {
        applicationId "com.transformmynotes.app"
        versionCode 1
        versionName "1.0"
    }
}
`

// ---------------------------------------------------------------------------
// setVersionName
// ---------------------------------------------------------------------------

describe('setVersionName', () => {
  it('sets versionName to the given version string', () => {
    const result = setVersionName(SAMPLE_GRADLE, '1.40.1')
    expect(result).toContain('versionName "1.40.1"')
    expect(result).not.toContain('versionName "1.0"')
  })

  it('leaves versionCode unchanged', () => {
    const result = setVersionName(SAMPLE_GRADLE, '2.0.0')
    expect(result).toContain('versionCode 1')
  })

  it('handles multi-segment semver versions', () => {
    const result = setVersionName(SAMPLE_GRADLE, '10.20.300')
    expect(result).toContain('versionName "10.20.300"')
  })

  it('throws if versionName is not found in the text', () => {
    const noVersionName = 'android { defaultConfig { versionCode 1 } }'
    expect(() => setVersionName(noVersionName, '1.0.0')).toThrow(
      /versionName field not found/,
    )
  })
})

// ---------------------------------------------------------------------------
// incrementVersionCode
// ---------------------------------------------------------------------------

describe('incrementVersionCode', () => {
  it('increments versionCode by 1', () => {
    const result = incrementVersionCode(SAMPLE_GRADLE)
    expect(result).toContain('versionCode 2')
    expect(result).not.toContain('versionCode 1\n')
  })

  it('increments versionCode twice correctly (1 → 2 → 3)', () => {
    const after1 = incrementVersionCode(SAMPLE_GRADLE)
    expect(after1).toContain('versionCode 2')

    const after2 = incrementVersionCode(after1)
    expect(after2).toContain('versionCode 3')
    expect(after2).not.toContain('versionCode 2\n')
  })

  it('leaves versionName unchanged', () => {
    const result = incrementVersionCode(SAMPLE_GRADLE)
    expect(result).toContain('versionName "1.0"')
  })

  it('handles larger version codes', () => {
    const gradle = SAMPLE_GRADLE.replace('versionCode 1', 'versionCode 99')
    const result = incrementVersionCode(gradle)
    expect(result).toContain('versionCode 100')
  })

  it('throws if versionCode is not found in the text', () => {
    const noVersionCode = 'android { defaultConfig { versionName "1.0" } }'
    expect(() => incrementVersionCode(noVersionCode)).toThrow(
      /versionCode field not found/,
    )
  })
})
