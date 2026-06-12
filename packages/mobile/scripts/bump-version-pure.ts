/**
 * bump-version-pure — pure string transforms for updating versionName and versionCode
 * in an Android build.gradle file.
 *
 * No file I/O, no side-effects: easy to unit-test.
 */

/**
 * Replace the versionName value in build.gradle text with the given version string.
 *
 * Matches:  versionName "1.0"
 * Replaces: versionName "<version>"
 *
 * @throws Error if versionName is not found in the text.
 */
export function setVersionName(gradleText: string, version: string): string {
  const pattern = /(\bversionName\s+)"[^"]*"/
  if (!pattern.test(gradleText)) {
    throw new Error('bump-version: versionName field not found in build.gradle text.')
  }
  return gradleText.replace(pattern, `$1"${version}"`)
}

/**
 * Find the versionCode integer in build.gradle text and increment it by 1.
 *
 * Matches:  versionCode 1
 * Replaces: versionCode 2
 *
 * @throws Error if versionCode is not found in the text.
 */
export function incrementVersionCode(gradleText: string): string {
  const pattern = /(\bversionCode\s+)(\d+)/
  const match = gradleText.match(pattern)
  if (!match) {
    throw new Error('bump-version: versionCode field not found in build.gradle text.')
  }
  const current = parseInt(match[2], 10)
  const next = current + 1
  return gradleText.replace(pattern, `$1${next}`)
}
