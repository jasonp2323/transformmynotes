/**
 * release-notes — create a GitHub release with AI-generated notes.
 *
 * Usage (in CI):
 *   npx tsx packages/scripts/src/release-notes.ts
 *
 * Requires:
 *   - `gh` CLI authenticated (GH_TOKEN env var, as provided by GITHUB_TOKEN in CI)
 *   - `git` available (full history + tags via fetch-depth: 0)
 *   - CLAUDE_CODE_OAUTH_TOKEN (optional — falls back to a plain notes body if absent or erroring)
 *
 * Behaviour:
 *   1. Reads .release-please-manifest.json from CWD to get the current version.
 *   2. Lists existing git tags. If v{version} already exists → exits 0 (idempotent).
 *   3. Determines the previous semver tag (for the git log range).
 *   4. Collects commit subjects since the previous tag.
 *   5. Generates release notes via Claude Code CLI (with fallback).
 *   6. Creates the GitHub release via `gh release create`.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import {
  parseManifestVersion,
  resolvePreviousTag,
  parseCommitSubjects,
  buildNotesMessages,
  parsePrNumbers,
} from './release-notes-pure.js'

const PENDING_LABEL = 'autorelease: pending'

// ---------------------------------------------------------------------------
// Git / shell helpers — use execFileSync/spawnSync with arg arrays (no shell
// string interpolation of untrusted data).
// ---------------------------------------------------------------------------

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim()
}

function ghRelease(args: string[]): void {
  const result = spawnSync('gh', args, { encoding: 'utf-8', stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`gh release failed with status ${result.status ?? 'null'}`)
  }
}

// release-please leaves the merged Release PR labeled `autorelease: pending`
// and only clears it when IT creates the release. Since this script creates
// the release instead, release-please never clears the label, which stalls the
// next Release PR. So we clear it here. Best-effort: never fail the release.
function clearPendingReleaseLabels(): void {
  try {
    const json = execFileSync('gh', ['pr', 'list', '--state', 'merged', '--label', PENDING_LABEL, '--json', 'number'], { encoding: 'utf-8' })
    const numbers = parsePrNumbers(json)
    if (numbers.length === 0) {
      console.log('No merged Release PRs labeled "autorelease: pending" to clear.')
      return
    }
    for (const n of numbers) {
      const res = spawnSync('gh', ['pr', 'edit', String(n), '--remove-label', PENDING_LABEL], { encoding: 'utf-8', stdio: 'inherit' })
      if (res.status === 0) console.log(`Cleared "${PENDING_LABEL}" from PR #${n}.`)
      else console.warn(`Could not clear "${PENDING_LABEL}" from PR #${n} (status ${res.status ?? 'null'}); continuing.`)
    }
  } catch (err) {
    console.warn('Label cleanup skipped (non-fatal):', err instanceof Error ? err.message : String(err))
  }
}

// ---------------------------------------------------------------------------
// Notes generation
// ---------------------------------------------------------------------------

function generateNotesWithClaude(version: string, commitSubjects: string[]): string {
  const { system, user } = buildNotesMessages(version, commitSubjects)
  const prompt = system + '\n\n' + user

  // Use a fresh temp dir as cwd so the CLI does NOT load this repo's
  // .claude settings/hooks/CLAUDE.md — the prompt is fully self-contained.
  const cwd = mkdtempSync(join(tmpdir(), 'rel-'))

  const stdout = execFileSync(
    'claude',
    [
      '-p',
      prompt,
      '--model',
      'claude-haiku-4-5-20251001',
      '--output-format',
      'text',
      '--no-session-persistence',
    ],
    {
      encoding: 'utf-8',
      cwd,
      maxBuffer: 10_000_000,
      env: process.env,
    },
  )

  return stdout.trim()
}

function fallbackNotes(version: string, commitSubjects: string[]): string {
  const lines = commitSubjects.length > 0
    ? commitSubjects.map(s => `- ${s}`).join('\n')
    : '- Various improvements and fixes.'
  return `Release v${version}.\n\n## Changes\n${lines}`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Determine current version from manifest.
  const manifestPath = join(process.cwd(), '.release-please-manifest.json')
  const manifestText = readFileSync(manifestPath, 'utf-8')
  const version = parseManifestVersion(manifestText)
  const tag = `v${version}`

  console.log(`Current version from manifest: ${version}`)

  // 2. List existing git tags.
  const tagsRaw = git(['tag', '--list', 'v*'])
  const allTags = tagsRaw.length > 0 ? tagsRaw.split('\n').map(t => t.trim()).filter(Boolean) : []

  // 3. Idempotency guard — if tag already exists, nothing to do.
  if (allTags.includes(tag)) {
    console.log(`Release ${tag} already exists; nothing to do.`)
    clearPendingReleaseLabels()
    return
  }

  console.log(`Tag ${tag} does not exist yet — proceeding to create release.`)

  // 4. Determine previous tag and collect commit subjects.
  const prevTag = resolvePreviousTag(allTags, version)
  console.log(prevTag ? `Previous tag: ${prevTag}` : 'No previous tag found — using all commits.')

  const logArgs = prevTag
    ? ['log', '--no-merges', '--pretty=%s', `${prevTag}..HEAD`]
    : ['log', '--no-merges', '--pretty=%s']
  const gitLogOutput = git(logArgs)
  const commitSubjects = parseCommitSubjects(gitLogOutput)

  console.log(`Found ${commitSubjects.length} commit(s) to summarise.`)

  // 5. Generate release notes (Claude Code CLI, with fallback).
  let notes: string
  const oauthToken = process.env['CLAUDE_CODE_OAUTH_TOKEN']

  if (!oauthToken) {
    console.log('CLAUDE_CODE_OAUTH_TOKEN not set — using fallback notes.')
    notes = fallbackNotes(version, commitSubjects)
  } else {
    try {
      console.log('Generating release notes with Claude Haiku via Claude Code CLI…')
      notes = generateNotesWithClaude(version, commitSubjects)
      console.log('Claude notes generated successfully.')
    } catch (err) {
      console.warn(
        'Claude CLI call failed; falling back to plain notes.',
        err instanceof Error ? err.message : String(err),
      )
      notes = fallbackNotes(version, commitSubjects)
    }
  }

  // 6. Get HEAD SHA for --target.
  const headSha = git(['rev-parse', 'HEAD'])
  console.log(`HEAD SHA: ${headSha}`)

  // Write notes to a temp file (avoids shell interpolation of notes content).
  const tmpFile = join(tmpdir(), `release-notes-${version}-${Date.now()}.md`)
  writeFileSync(tmpFile, notes, 'utf-8')

  // Create the GitHub release.
  console.log(`Creating GitHub release ${tag}…`)
  ghRelease([
    'release',
    'create',
    tag,
    '--target',
    headSha,
    '--title',
    tag,
    '--latest',
    '--notes-file',
    tmpFile,
  ])

  console.log(`Release ${tag} created successfully.`)
  clearPendingReleaseLabels()
}

main().catch(err => {
  console.error('Fatal error in release-notes script:', err instanceof Error ? err.message : err)
  process.exit(1)
})
