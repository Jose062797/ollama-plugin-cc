---
description: Check whether the local Codex CLI is ready and optionally toggle the stop-time review gate
argument-hint: '[--enable-review-gate|--disable-review-gate]'
allowed-tools: Bash(node:*), Bash(npm:*), AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ollama-companion.mjs" setup --json $ARGUMENTS
```

If the result says the Codex CLI is unavailable and npm is available:
- Use `AskUserQuestion` exactly once to ask whether Claude should install the Codex CLI now.
- Put the install option first and suffix it with `(Recommended)`.
- Use these two options:
  - `Install the Codex CLI (Recommended)`
  - `Skip for now`
- If the user chooses install, run:

```bash
npm install -g @openai/codex
```

- Then rerun:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ollama-companion.mjs" setup --json $ARGUMENTS
```

If the Codex CLI is already installed or npm is unavailable:
- Do not ask about installation.

Output rules:
- Present the final setup output to the user.
- If installation was skipped, present the original setup output.
- If the Codex CLI is installed but its provider requires a login, preserve the login guidance from the setup output.

<!-- Modified for ollama-plugin-cc (2026): routed to a local Ollama model. Original work Copyright 2026 OpenAI, Apache-2.0. -->
