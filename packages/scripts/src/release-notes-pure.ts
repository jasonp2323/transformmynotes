/**
 * release-notes-pure — pure helper functions for release-notes.ts.
 *
 * No external dependencies, no side-effects: easy to unit-test.
 */

/**
 * Extract the root-package version from the text of
 * `.release-please-manifest.json` (e.g. `{ ".": "1.1.0" }`).
 *
 * Throws if the `"."` key is absent or not a string.
 */
export function parseManifestVersion(manifestText: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(manifestText)
  } catch {
    throw new Error('release-please-manifest.json is not valid JSON')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('release-please-manifest.json must be a JSON object')
  }

  const obj = parsed as Record<string, unknown>
  if (!Object.prototype.hasOwnProperty.call(obj, '.')) {
    throw new Error('release-please-manifest.json is missing the "." key')
  }

  const version = obj['.']
  if (typeof version !== 'string') {
    throw new Error(`release-please-manifest.json "." key must be a string, got ${typeof version}`)
  }

  return version
}

// ---------------------------------------------------------------------------
// Semver helpers (plain X.Y.Z — no pre-release / build metadata)
// ---------------------------------------------------------------------------

interface SemVer {
  major: number
  minor: number
  patch: number
  raw: string
}

function parseSemVer(tag: string): SemVer | null {
  // Accept tags with or without a leading "v"
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    raw: tag,
  }
}

function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

/**
 * Return the highest semver tag from `allTags` that is STRICTLY LESS THAN
 * `currentVersion` (formatted as `v{version}`).
 *
 * Returns `null` when no such earlier tag exists (first release).
 */
export function resolvePreviousTag(allTags: string[], currentVersion: string): string | null {
  const current = parseSemVer(currentVersion)
  if (!current) {
    throw new Error(`currentVersion "${currentVersion}" is not a valid semver string`)
  }

  let best: SemVer | null = null

  for (const tag of allTags) {
    const sv = parseSemVer(tag)
    if (!sv) continue
    if (compareSemVer(sv, current) < 0) {
      if (best === null || compareSemVer(sv, best) > 0) {
        best = sv
      }
    }
  }

  return best ? best.raw : null
}

/**
 * Parse newline-separated `git log --pretty=%s` output into an array of
 * trimmed, non-empty subject strings.
 */
export function parseCommitSubjects(gitLogOutput: string): string[] {
  if (!gitLogOutput.trim()) return []
  return gitLogOutput
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

/**
 * Build the system and user prompts that instruct Claude Haiku to write
 * GitHub Release notes for the given version + commit subjects.
 */
export function buildNotesMessages(
  version: string,
  commitSubjects: string[],
): { system: string; user: string } {
  const system =
    'You are a release-notes writer for a software project. ' +
    'Given a version number and a list of commit subjects, produce clean Markdown release notes. ' +
    'Group changes by type where inferable from Conventional Commit prefixes ' +
    '(Features, Fixes, Other). ' +
    'Be concise. Do not include a preamble or surrounding code fences. ' +
    'Output only the Markdown content of the release notes.'

  let user: string
  if (commitSubjects.length === 0) {
    user =
      `Version: ${version}\n\n` +
      'There are no notable commit subjects for this release. ' +
      'Please produce a brief, generic release note.'
  } else {
    const bulletList = commitSubjects.map(s => `- ${s}`).join('\n')
    user = `Version: ${version}\n\nCommit subjects:\n${bulletList}`
  }

  return { system, user }
}

/**
 * Parse the stdout of `gh pr list --json number` (a JSON array like
 * `[{"number":12},{"number":34}]`) into an array of PR numbers.
 *
 * Returns `[]` for an empty array, malformed JSON, or a non-array value.
 * Entries without a numeric `number` field are ignored.
 */
export function parsePrNumbers(jsonText: string): number[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) return []

  const numbers: number[] = []
  for (const entry of parsed) {
    if (typeof entry === 'object' && entry !== null && 'number' in entry) {
      const n = (entry as Record<string, unknown>)['number']
      if (typeof n === 'number') {
        numbers.push(n)
      }
    }
  }
  return numbers
}
