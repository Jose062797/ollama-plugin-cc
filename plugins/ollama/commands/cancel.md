---
description: Cancel an active background Ollama job in this repository
argument-hint: '[job-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/ollama-companion.mjs" cancel "$ARGUMENTS"`

<!-- Modified for ollama-plugin-cc (2026): routed to a local Ollama model. Original work Copyright 2026 OpenAI, Apache-2.0. -->
