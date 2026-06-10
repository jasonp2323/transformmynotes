/**
 * stamp — GitHub Project cycle-time stamper.
 *
 * Usage:
 *   npm run -s stamp --prefix packages/scripts -- <issue-number> start
 *   npm run -s stamp --prefix packages/scripts -- <issue-number> done
 *
 * `start`: If `Actual Start` is currently empty, sets `Actual Start` (DATE)
 *          and `Started At` (TEXT ISO-8601 seconds) on the Project item.
 *          Idempotent — exits 0 without rewriting if already stamped.
 *
 * `done`:  Sets `Actual Finish` (DATE) and `Completed At` (TEXT ISO-8601 seconds).
 *          If `Started At` exists, also computes and writes `Cycle Minutes` (NUMBER)
 *          and `Cycle Time` (TEXT). If `Started At` is missing, prints a warning
 *          and skips the two cycle fields.
 *
 * All Project field + item node IDs are resolved at runtime via `gh api graphql`.
 * No hardcoded PVT_* / PVTF_* node IDs.
 */

import { execFileSync } from 'node:child_process'
import {
  parseStampArgs,
  computeCycleMinutes,
  formatCycleTime,
  nowIsoSeconds,
  todayDate,
} from './stamp-pure.js'

// ---------------------------------------------------------------------------
// Constants — stable identifiers (project number + owner login), not node IDs.
// ---------------------------------------------------------------------------

const PROJECT_OWNER = 'jasonp2323'
const PROJECT_NUMBER = 5
const REPO = 'jasonp2323/transformmynotes'

// ---------------------------------------------------------------------------
// GraphQL helpers
// ---------------------------------------------------------------------------

/** Execute a `gh api graphql` query/mutation and return the parsed JSON. */
function ghGraphQL(query: string, variables: Record<string, string | number>): unknown {
  const args: string[] = ['api', 'graphql', '-f', `query=${query}`]
  for (const [key, value] of Object.entries(variables)) {
    // Use -F for typed (number) values, -f for strings.
    if (typeof value === 'number') {
      args.push('-F', `${key}=${value}`)
    } else {
      args.push('-f', `${key}=${value}`)
    }
  }
  const raw = execFileSync('gh', args, { encoding: 'utf-8' })
  return JSON.parse(raw)
}

/** Execute `gh api <path> -q <jqExpr>` and return the trimmed string result. */
function ghApi(path: string, jqExpr: string): string {
  return execFileSync('gh', ['api', path, '-q', jqExpr], { encoding: 'utf-8' }).trim()
}

// ---------------------------------------------------------------------------
// Field metadata
// ---------------------------------------------------------------------------

interface FieldMeta {
  id: string
  dataType: string
}

interface ProjectMeta {
  projectId: string
  fields: Map<string, FieldMeta>
}

/**
 * Fetch the project node ID and a name→{id,dataType} map for all fields.
 * One round-trip to the GitHub GraphQL API.
 */
function fetchProjectMeta(): ProjectMeta {
  const query = `
    query($login: String!, $number: Int!) {
      user(login: $login) {
        projectV2(number: $number) {
          id
          fields(first: 50) {
            nodes {
              ... on ProjectV2Field {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
              }
              ... on ProjectV2IterationField {
                id
                name
                dataType
              }
            }
          }
        }
      }
    }
  `

  const result = ghGraphQL(query, { login: PROJECT_OWNER, number: PROJECT_NUMBER }) as {
    data: {
      user: {
        projectV2: {
          id: string
          fields: {
            nodes: Array<{ id: string; name: string; dataType: string } | Record<string, never>>
          }
        }
      }
    }
  }

  const proj = result.data.user.projectV2
  const fields = new Map<string, FieldMeta>()
  for (const node of proj.fields.nodes) {
    if ('name' in node && 'id' in node && 'dataType' in node) {
      fields.set(node.name as string, { id: node.id as string, dataType: node.dataType as string })
    }
  }

  return { projectId: proj.id, fields }
}

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

/** Get the issue's GitHub node ID. */
function fetchIssueNodeId(issueNumber: number): string {
  return ghApi(`repos/${REPO}/issues/${issueNumber}`, '.node_id')
}

/** Add the issue to the project (idempotent) and return the item node ID. */
function upsertProjectItem(projectId: string, contentId: string): string {
  const mutation = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }
  `
  const result = ghGraphQL(mutation, { projectId, contentId }) as {
    data: { addProjectV2ItemById: { item: { id: string } } }
  }
  return result.data.addProjectV2ItemById.item.id
}

// ---------------------------------------------------------------------------
// Field-value reading
// ---------------------------------------------------------------------------

interface FieldValues {
  [fieldName: string]: string | number | null
}

/**
 * Read the current field values for a project item.
 * Returns a map from field name to the current value (or null if unset).
 */
function fetchItemFieldValues(_projectId: string, itemId: string): FieldValues {
  const query = `
    query($itemId: ID!) {
      node(id: $itemId) {
        ... on ProjectV2Item {
          fieldValues(first: 50) {
            nodes {
              ... on ProjectV2ItemFieldDateValue {
                date
                field { ... on ProjectV2Field { name } }
              }
              ... on ProjectV2ItemFieldTextValue {
                text
                field { ... on ProjectV2Field { name } }
              }
              ... on ProjectV2ItemFieldNumberValue {
                number
                field { ... on ProjectV2Field { name } }
              }
            }
          }
        }
      }
    }
  `

  const result = ghGraphQL(query, { itemId }) as {
    data: {
      node: {
        fieldValues: {
          nodes: Array<
            | { date: string; field: { name: string } }
            | { text: string; field: { name: string } }
            | { number: number; field: { name: string } }
            | Record<string, never>
          >
        }
      }
    }
  }

  const values: FieldValues = {}
  for (const node of result.data.node.fieldValues.nodes) {
    if (!('field' in node) || !node.field) continue
    const name = (node as { field: { name: string } }).field.name
    if ('date' in node) {
      values[name] = (node as { date: string; field: { name: string } }).date
    } else if ('text' in node) {
      values[name] = (node as { text: string; field: { name: string } }).text
    } else if ('number' in node) {
      values[name] = (node as { number: number; field: { name: string } }).number
    }
  }
  return values
}

// ---------------------------------------------------------------------------
// Field-value writing
// ---------------------------------------------------------------------------

/** Write a single field value on a project item. */
function setFieldValue(
  projectId: string,
  itemId: string,
  fieldId: string,
  dataType: string,
  value: string | number,
): void {
  // GitHub's GraphQL `value` input is a union; CLI `-f` flags are always
  // strings, so we use a dataType-specific mutation that declares `value` as the
  // right scalar (Date/Float/String) and pass it as a variable. No user-supplied
  // data ever lands in the query template — only in variables.
  const mutationTyped = buildTypedMutation(dataType)
  const args: string[] = [
    'api',
    'graphql',
    '-f', `query=${mutationTyped}`,
    '-f', `projectId=${projectId}`,
    '-f', `itemId=${itemId}`,
    '-f', `fieldId=${fieldId}`,
  ]

  // -F sends a typed (numeric) variable; -f sends a string (DATE + TEXT).
  if (dataType === 'NUMBER') {
    args.push('-F', `value=${value}`)
  } else {
    args.push('-f', `value=${value}`)
  }

  execFileSync('gh', args, { encoding: 'utf-8' })
}

/**
 * Build a typed mutation for the specific dataType so GitHub can parse the
 * `value` union field correctly without needing to embed JSON objects in
 * CLI `-f` flags (which are always strings).
 */
function buildTypedMutation(dataType: string): string {
  if (dataType === 'DATE') {
    return `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: Date!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { date: $value }
          }
        ) { projectV2Item { id } }
      }
    `
  }
  if (dataType === 'NUMBER') {
    return `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: Float!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { number: $value }
          }
        ) { projectV2Item { id } }
      }
    `
  }
  // TEXT (and fallback)
  return `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { text: $value }
        }
      ) { projectV2Item { id } }
    }
  `
}

/** Convenience: look up field meta by name and write it, or warn if missing. */
function writeField(
  projectId: string,
  itemId: string,
  fields: Map<string, FieldMeta>,
  fieldName: string,
  value: string | number,
): void {
  const meta = fields.get(fieldName)
  if (!meta) {
    console.warn(`warning: field "${fieldName}" not found on project — skipping.`)
    return
  }
  setFieldValue(projectId, itemId, meta.id, meta.dataType, value)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  let issue: number
  let action: 'start' | 'done'

  try {
    ;({ issue, action } = parseStampArgs(process.argv.slice(2)))
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const now = new Date()
  const todayStr = todayDate(now)
  const nowStr = nowIsoSeconds(now)

  console.log(`stamp: issue=#${issue} action=${action} at ${nowStr}`)

  // 1. Resolve project meta (IDs for all fields) and the issue's item on the board.
  let meta: ProjectMeta
  try {
    meta = fetchProjectMeta()
  } catch (err) {
    console.error(`stamp: failed to fetch project meta: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  let issueNodeId: string
  try {
    issueNodeId = fetchIssueNodeId(issue)
  } catch (err) {
    console.error(`stamp: failed to fetch issue #${issue}: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  let itemId: string
  try {
    itemId = upsertProjectItem(meta.projectId, issueNodeId)
  } catch (err) {
    console.error(`stamp: failed to add issue #${issue} to project: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  // 2. Read current field values (needed for idempotency / cycle time).
  let currentValues: FieldValues
  try {
    currentValues = fetchItemFieldValues(meta.projectId, itemId)
  } catch (err) {
    console.error(`stamp: failed to read current field values: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  // 3. Perform the stamping.
  if (action === 'start') {
    const alreadySet = currentValues['Actual Start'] != null && currentValues['Actual Start'] !== ''
    if (alreadySet) {
      console.log(`stamp: issue #${issue} already has Actual Start="${currentValues['Actual Start']}" — nothing to do (idempotent).`)
      process.exit(0)
    }

    writeField(meta.projectId, itemId, meta.fields, 'Actual Start', todayStr)
    writeField(meta.projectId, itemId, meta.fields, 'Started At', nowStr)
    console.log(`stamp: ✓ issue #${issue} — Actual Start=${todayStr}  Started At=${nowStr}`)

  } else {
    // action === 'done'
    writeField(meta.projectId, itemId, meta.fields, 'Actual Finish', todayStr)
    writeField(meta.projectId, itemId, meta.fields, 'Completed At', nowStr)

    const startedAt = currentValues['Started At']
    if (typeof startedAt === 'string' && startedAt.trim() !== '') {
      const cycleMinutes = computeCycleMinutes(startedAt, nowStr)
      const cycleTimeStr = formatCycleTime(cycleMinutes)
      writeField(meta.projectId, itemId, meta.fields, 'Cycle Minutes', cycleMinutes)
      writeField(meta.projectId, itemId, meta.fields, 'Cycle Time', cycleTimeStr)
      console.log(
        `stamp: ✓ issue #${issue} — Actual Finish=${todayStr}  Completed At=${nowStr}  Cycle Minutes=${cycleMinutes}  Cycle Time=${cycleTimeStr}`,
      )
    } else {
      console.warn(
        `warning: issue #${issue} has no "Started At" value — Actual Finish and Completed At were set, but Cycle Minutes and Cycle Time were skipped.`,
      )
    }
  }
}

main()
