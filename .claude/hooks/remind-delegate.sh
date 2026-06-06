#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit|NotebookEdit): nudge the MAIN agent to delegate
# code edits to a subagent (CLAUDE.md orchestrator rule). Non-blocking — it only
# injects a reminder; it never denies a tool call.
#
# Subagent tool calls carry agent context (agent_id / agent_type); the main
# agent's calls do not. We only remind the main agent, and only for real code —
# docs/config (*.md, .claude/) are the orchestrator's to edit directly.

input=$(cat)

agent=$(printf '%s' "$input" | jq -r '.agent_id // .agent_type // empty' 2>/dev/null)
[ -n "$agent" ] && exit 0  # subagent edit — allow silently

file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)
case "$file" in
  *.md|*/.claude/*|.claude/*) exit 0 ;;  # docs/config — no nudge
esac

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: "Reminder (CLAUDE.md): you are the orchestrator — dispatch a Sonnet/Haiku subagent to make code edits rather than editing directly. Direct edits are only for docs/config (*.md, .claude/) or when delegation genuinely does not fit."
  }
}'
exit 0
