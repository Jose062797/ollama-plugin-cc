---
description: Transfer the current Claude Code session into a resumable Codex CLI thread
argument-hint: "[--source <claude-jsonl>]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/ollama-companion.mjs" transfer "$ARGUMENTS"`

Present the command output to the user exactly as returned. Preserve the Codex CLI session ID and the `codex ... resume <session-id>` command.

<!-- Modified for ollama-plugin-cc (2026): routed to a local Ollama model. Original work Copyright 2026 OpenAI, Apache-2.0. -->
