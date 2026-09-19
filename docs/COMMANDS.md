# Command reference

This is the full reference for the commands of the Ollama plugin for Claude Code. It follows the structure of the upstream Codex plugin's documentation, adapted to a local model served by Ollama. See the [README](../README.md) for installation and background.

## What You Get

- `/ollama:review` for a normal read-only review by the local model
- `/ollama:adversarial-review` for a steerable challenge review
- `/ollama:rescue`, `/ollama:transfer`, `/ollama:status`, `/ollama:result`, and `/ollama:cancel` to delegate work, hand off sessions, and manage background jobs

## Requirements

- **Ollama** running locally, with a tool-capable model pulled, for example `ollama pull gpt-oss:20b`.
- **A context window of at least 64K tokens** in Ollama, set in the Ollama app or with `OLLAMA_CONTEXT_LENGTH`.
- **The Codex CLI**, which runs the agent: `npm install -g @openai/codex`.
- **Node.js 18.18 or later**

## Install

Add the marketplace in Claude Code:

```bash
/plugin marketplace add Jose062797/ollama-plugin-cc
```

Install the plugin:

```bash
/plugin install ollama@ollama-plugin-cc
```

Reload plugins:

```bash
/reload-plugins
```

Then run:

```bash
/ollama:setup
```

`/ollama:setup` will tell you whether the Codex CLI is installed and its provider is configured. It does not check the model itself, so make sure Ollama is running and the model is pulled. If the Codex CLI is missing and npm is available, it can offer to install the Codex CLI for you.

If you prefer to install the Codex CLI yourself, use:

```bash
npm install -g @openai/codex
```

If the model is not available yet, pull it:

```bash
ollama pull gpt-oss:20b
```

After install, you should see:

- the slash commands listed below
- the `ollama:ollama-rescue` subagent in `/agents`

One simple first run is:

```bash
/ollama:review --background
/ollama:status
/ollama:result
```

## Usage

### `/ollama:review`

Runs a normal review of your current work with the local model, through the Codex CLI's built-in reviewer.

> [!NOTE]
> A review with a local model takes minutes, especially for multi-file changes. It's generally recommended to run it in the background.

Use it when you want:

- a review of your current uncommitted changes
- a review of your branch compared to a base branch like `main`

Use `--base <ref>` for branch review. It also supports `--wait` and `--background`. It is not steerable and does not take custom focus text. Use [`/ollama:adversarial-review`](#ollamaadversarial-review) when you want to challenge a specific decision or risk area.

Examples:

```bash
/ollama:review
/ollama:review --base main
/ollama:review --background
```

This command is read-only and will not perform any changes. When run in the background you can use [`/ollama:status`](#ollamastatus) to check on the progress and [`/ollama:cancel`](#ollamacancel) to cancel the ongoing task.

### `/ollama:adversarial-review`

Runs a **steerable** review that questions the chosen implementation and design.

It can be used to pressure-test assumptions, tradeoffs, failure modes, and whether a different approach would have been safer or simpler.

It uses the same review target selection as `/ollama:review`, including `--base <ref>` for branch review.
It also supports `--wait` and `--background`. Unlike `/ollama:review`, it can take extra focus text after the flags.

Use it when you want:

- a review before shipping that challenges the direction, not just the code details
- review focused on design choices, tradeoffs, hidden assumptions, and alternative approaches
- pressure-testing around specific risk areas like auth, data loss, rollback, race conditions, or reliability

Examples:

```bash
/ollama:adversarial-review
/ollama:adversarial-review --base main challenge whether this was the right caching and retry design
/ollama:adversarial-review --background look for race conditions and question the chosen approach
```

This command is read-only. It does not fix code.

### `/ollama:rescue`

Hands a task to the local model through the `ollama:ollama-rescue` subagent.

Use it when you want the local model to:

- investigate a bug
- try a fix
- continue a previous Ollama task
- take a pass with a different local model

> [!NOTE]
> Local models are slow: a small fix can take several minutes. It's generally recommended to run the task in the background.

It supports `--background`, `--wait`, `--resume`, and `--fresh`. If you omit `--resume` and `--fresh`, the plugin can offer to continue the latest rescue thread for this repo.

Examples:

```bash
/ollama:rescue investigate why the tests started failing
/ollama:rescue fix the failing test with the smallest safe patch
/ollama:rescue --resume apply the top fix from the last run
/ollama:rescue --model gemma4:26b --effort medium investigate the flaky integration test
/ollama:rescue --background investigate the regression
```

You can also just ask for a task to be delegated:

```text
Ask Ollama to redesign the database connection to be more resilient.
```

**Notes:**

- if you do not pass `--model`, the plugin uses its default model: `gpt-oss:20b`, or the value of `OLLAMA_PLUGIN_CC_MODEL`.
- `--effort` may have no effect with local models.
- follow-up rescue requests can continue the latest Ollama task in the repo

### `/ollama:transfer`

Creates a persistent Codex CLI thread from the current Claude Code session and prints the command to resume it with the local model.

Use it when you started a debugging or implementation conversation in Claude Code and want to continue that same context directly in the Codex CLI.

Examples:

```bash
/ollama:transfer
/ollama:transfer --source ~/.claude/projects/-Users-me-repo/<session-id>.jsonl
```

The plugin's `SessionStart` hook supplies the current transcript path automatically; `--source` is available as a manual override. The transfer uses the Codex CLI's external-agent session importer. The source must be under `~/.claude/projects`, and older Codex CLI versions that do not expose session import must be upgraded before using this command.

### `/ollama:status`

Shows running and recent Ollama jobs for the current repository.

Examples:

```bash
/ollama:status
/ollama:status task-abc123
```

Use it to:

- check progress on background work
- see the latest completed job
- confirm whether a task is still running

### `/ollama:result`

Shows the final stored output for a finished job.
When available, it also includes the Codex CLI session ID and the command to reopen that run in the Codex CLI with the local model.

Examples:

```bash
/ollama:result
/ollama:result task-abc123
```

### `/ollama:cancel`

Cancels an active background Ollama job.

Examples:

```bash
/ollama:cancel
/ollama:cancel task-abc123
```

### `/ollama:setup`

Checks whether the Codex CLI is installed and its provider is configured. It does not check that Ollama is serving the model.
If the Codex CLI is missing and npm is available, it can offer to install the Codex CLI for you.

You can also use `/ollama:setup` to manage the optional review gate.

#### Enabling review gate

```bash
/ollama:setup --enable-review-gate
/ollama:setup --disable-review-gate
```

When the review gate is enabled, the plugin uses a `Stop` hook to run a targeted review with the local model based on Claude's response. If that review finds issues, the stop is blocked so Claude can address them first.

> [!WARNING]
> With a local model the review gate adds minutes to every Claude turn and can create a long-running Claude/Ollama loop. Only enable it when you plan to actively monitor the session.

## Typical Flows

### Review Before Shipping

```bash
/ollama:review
```

### Hand A Problem To The Local Model

```bash
/ollama:rescue investigate why the build is failing in CI
```

### Start Something Long-Running

```bash
/ollama:adversarial-review --background
/ollama:rescue --background investigate the flaky test
```

Then check in with:

```bash
/ollama:status
/ollama:result
```

## How It Works

The plugin wraps the Codex app server of your local Codex CLI and starts it with a local provider:

```bash
codex -c model_provider=ollama -c model=gpt-oss:20b app-server
```

`ollama` is a provider built into the Codex CLI. The provider and model given by the plugin take precedence; the rest of your Codex CLI configuration in `~/.codex/config.toml`, such as sandbox settings, still applies.

### Configuration

| Environment variable | Default | Meaning |
|---|---|---|
| `OLLAMA_PLUGIN_CC_MODEL` | `gpt-oss:20b` | Model used when `--model` is not passed |
| `OLLAMA_PLUGIN_CC_PROVIDER` | `ollama` | Codex CLI provider id. `lmstudio` is also built in, but untested here |

### Moving The Work Over To The Codex CLI

Delegated tasks and any stop gate run can be resumed directly in the Codex CLI with the session ID you received from `/ollama:result` or `/ollama:status`. Keep the local provider when you do:

```bash
codex -c model_provider=ollama -c model=gpt-oss:20b resume <session-id>
```

Plain `codex resume <session-id>` would continue with your default Codex CLI provider instead.

## FAQ

### Do I need an OpenAI account?

No. The model runs on your machine through Ollama; the Codex CLI only runs the agent loop and needs no sign-in for a local provider.

### Does it share anything with the official Codex plugin?

No. Both can be installed side by side. This plugin keeps its own data folder, session variables, broker processes and Codex CLI thread names, so neither plugin lists, resumes or reuses the other's jobs.

### Does it use the same Codex CLI install?

Yes. It uses the `codex` binary installed in your environment, the same repository checkout and the same machine-local environment. Its threads are stored in the Codex CLI history in `~/.codex` like any other Codex CLI thread, named `Ollama Companion Task`.
