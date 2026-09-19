# Modifications to the original work

This repository is a fork of [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) (Apache-2.0, Copyright 2026 OpenAI), based on upstream version 1.0.6, commit `db52e28`.

This file is the notice of changes required by section 4(b) of the Apache License 2.0. Every modified `.md` and `.mjs` file also carries a one-line notice; JSON files cannot carry comments, so they are listed here.

Everything below except the files marked **new** is produced by `scripts/apply-ollama-patch.mjs` from an unmodified upstream checkout. The README explains how to regenerate the fork from a newer upstream version.

## Layout

| Upstream | This fork |
|---|---|
| `plugins/codex/` | `plugins/ollama/` |
| `scripts/codex-companion.mjs` | `scripts/ollama-companion.mjs` |
| `agents/codex-rescue.md` | `agents/ollama-rescue.md` |
| `skills/codex-cli-runtime/` | `skills/ollama-cli-runtime/` |
| `skills/codex-result-handling/` | `skills/ollama-result-handling/` |
| `skills/gpt-5-4-prompting/` | `skills/ollama-prompting/` |
| `references/codex-prompt-recipes.md`, `references/codex-prompt-antipatterns.md` | `references/prompt-recipes.md`, `references/prompt-antipatterns.md` |

Two files keep `codex` in their name because they are about the Codex CLI program, which this plugin still runs: `scripts/lib/codex.mjs`, the client for the Codex CLI's app server, and `tests/fake-codex-fixture.mjs`, a fake Codex CLI.

The skill names must differ from the official plugin's. Claude Code resolves a subagent's preloaded `skills:` by bare name, so with both plugins installed the forwarder loaded the official skills, which point at the official companion script, saw contradictory instructions and refused the local path. This was found in the first real `/ollama:rescue` run and fixed in 1.0.6-ollama.2.

## Behaviour

| File | Change |
|---|---|
| `scripts/lib/app-server.mjs` | `codex app-server` is started with `-c model_provider=<provider> -c model=<model>`, so the Codex CLI talks to a local provider. Defaults: `ollama` and `gpt-oss:20b`. Overridable with `OLLAMA_PLUGIN_CC_PROVIDER` and `OLLAMA_PLUGIN_CC_MODEL`; values are validated because the command line is assembled by a shell on Windows. |
| `scripts/lib/render.mjs`, `scripts/ollama-companion.mjs` | The printed resume command keeps the provider: `codex -c model_provider=ollama -c model=gpt-oss:20b resume <id>`. A plain `codex resume <id>` would continue the run with the user's default Codex CLI provider. |
| `scripts/lib/state.mjs` | The temporary fallback state directory is `ollama-companion` instead of `codex-companion`. The data folder is read from `OLLAMA_COMPANION_DATA`, never from `CLAUDE_PLUGIN_DATA`, which upstream exports to the whole session and which may therefore belong to the official plugin. |
| `scripts/session-lifecycle-hook.mjs`, `scripts/stop-review-gate-hook.mjs` | Hooks receive this plugin's own `CLAUDE_PLUGIN_DATA` from Claude Code and expose it as `OLLAMA_COMPANION_DATA`; the SessionStart hook exports that name to the session instead of `CLAUDE_PLUGIN_DATA`. Added in 1.0.6-ollama.3 after a real session showed the fork writing its jobs into the official plugin's data folder and offering to resume the official plugin's thread. |
| `scripts/session-lifecycle-hook.mjs`, `scripts/lib/tracked-jobs.mjs`, `scripts/lib/claude-session-transfer.mjs`, `scripts/lib/app-server.mjs`, `scripts/lib/broker-lifecycle.mjs` | Session variables `CODEX_COMPANION_*` renamed `OLLAMA_COMPANION_*`. |
| `scripts/lib/broker-lifecycle.mjs`, `scripts/lib/broker-endpoint.mjs`, `scripts/app-server-broker.mjs`, `scripts/lib/codex.mjs` | Own runtime names: broker folders `olc-*`, pipes `*-ollama-app-server`, broker user agent `ollama-companion-broker`, service name `claude_code_ollama_plugin`, and Codex CLI thread prefix `Ollama Companion Task`, so `--resume` never picks up the official plugin's threads from the shared Codex CLI history. |
| `scripts/lib/broker-lifecycle.mjs` | Upstream waits two seconds for a new broker to start. When it gives up, it deletes the broker's folder but leaves the broker and its `codex app-server` running, untracked by any later cleanup. This fork stops the broker it has just started instead. Only that fresh child process is stopped; a pid read back from disk is never used for this, because Windows reuses pids. It happened in all four real runs on the Windows test machine. |
| `scripts/lib/process.mjs` | `taskkill` runs directly instead of through `$SHELL`, as upstream already does for `git` in `scripts/lib/git.mjs`. When `$SHELL` is Git Bash, as in the Bash tool of Claude Code on Windows, `/PID`, `/T` and `/F` are rewritten as paths and every attempt to stop a process failed with "Invalid argument/option": `/ollama:cancel`, the session-end cleanup, closing a direct app server, and the broker stop above. |
| `scripts/ollama-companion.mjs`, `commands/rescue.md`, `agents/ollama-rescue.md`, `skills/ollama-cli-runtime/SKILL.md` | The `spark` model alias, which maps to an OpenAI model, is removed; `--model` is passed through unchanged. Model examples name local models. |
| `skills/ollama-prompting/` | Advice written for GPT-5.4 is addressed to "the local model". The prompt blocks and recipes themselves are unchanged. |
| `commands/setup.md` | The instruction to keep the `!codex login` guidance is phrased for any provider that needs a login. The default provider, Ollama, needs none. |

Paths in this table are relative to `plugins/ollama/`. Nothing else in the runtime changes: job tracking, the broker protocol, hooks, prompts, schemas, sandbox and approval defaults are upstream's.

## Names and wording

| Files | Change |
|---|---|
| Every `.md` and `.mjs` file under `plugins/ollama/` and `tests/` | The slash-command and subagent namespace `codex:` becomes `ollama:` for `rescue`, `review`, `adversarial-review`, `status`, `result`, `cancel`, `setup`, `transfer` and the rescue subagent. |
| Same files | "Codex" as the product name becomes "Ollama", for example `# Ollama Review` or "No finished Ollama jobs". Where it means the program that runs the agent, it becomes "Codex CLI": installing, updating or authenticating it, its session IDs, importing Claude sessions into it. The setup messages say that a provider does or does not "require a login" instead of "require OpenAI authentication". Messages that come from the Codex CLI itself are passed through unchanged. |
| `plugins/ollama/scripts/lib/job-control.mjs`, `plugins/ollama/scripts/lib/tracked-jobs.mjs` | The lower-case copies of reworded messages follow them: a job's phase is inferred from log lines such as "Starting Ollama task thread." and "Ollama error: ...", and progress on stderr is prefixed `[ollama]` instead of `[codex]`. |
| `plugins/ollama/prompts/adversarial-review.md` | "You are Codex performing an adversarial software review" becomes "You are performing an adversarial software review". |
| `plugins/ollama/.claude-plugin/plugin.json` | `name` is `ollama`; description and author updated. |
| `.claude-plugin/marketplace.json` | Marketplace name `ollama-plugin-cc`; owner, description and plugin entry updated; source `./plugins/ollama`. |
| `package.json`, `package-lock.json` | Package name `ollama-plugin-cc` instead of `@openai/codex-plugin-cc`; description; build paths under `plugins/ollama`. |
| `package.json`, `package-lock.json`, the two manifests above | Version `1.0.6-ollama.N`, set with upstream's own `scripts/bump-version.mjs`. |
| `scripts/bump-version.mjs` | Manifest path under `plugins/ollama`; the marketplace entry is found under the name `ollama`. |
| `tsconfig.app-server.json`, `.gitignore` | Paths under `plugins/ollama`. |
| `plugins/ollama/CHANGELOG.md` | A note at the top points here; upstream's entries are kept as written. |
| `plugins/ollama/NOTICE` | A paragraph about this fork was appended; the original notice is intact. |

## Tests

| File | Change |
|---|---|
| All test files | The same renames and wording as the plugin. |
| `tests/fake-codex-fixture.mjs` | The fake `codex` binary skips leading `-c key=value` pairs before reading the subcommand, and recognises the `Ollama Companion Task` thread prefix. |
| `tests/commands.test.mjs` | Reads the command reference from `docs/COMMANDS.md` instead of upstream's `README.md`. Asserts that the `spark` alias is absent instead of present, the local model examples, the `ollama pull gpt-oss:20b` setup guidance instead of `!codex login`, and the `codex ... resume <session-id>` hint in `commands/transfer.md`. |
| `tests/runtime.test.mjs`, `tests/render.test.mjs` | Renamed session variables and data-folder variable; resume commands include the provider; `--model spark` is passed through as `spark`. |
| `tests/state.test.mjs`, `tests/broker-endpoint.test.mjs` | Data-folder variable and broker names. |
| `tests/bump-version.test.mjs` | The fixture uses this fork's package, plugin and path names. |
| `tests/ollama-independence.test.mjs` | **new**. Checks that the SessionStart hook exports `OLLAMA_COMPANION_DATA` and never `CLAUDE_PLUGIN_DATA`, that the runtime ignores another plugin's `CLAUDE_PLUGIN_DATA`, the provider arguments and their validation, and the broker names. |
| `tests/ollama-cleanup.test.mjs` | **new**. Checks that `taskkill` runs without a shell and that a broker which does not start in time is stopped. Both tests fail if either fix is removed. |

## Documentation

| File | Change |
|---|---|
| `README.md` | **new**, written for this fork. Upstream's README is not kept. |
| `docs/COMMANDS.md` | **new**. The command reference, adapted from upstream's README: same commands, flags, examples and structure, for a local model. |
| `MODIFICATIONS.md` | **new**, this file. |
| `scripts/apply-ollama-patch.mjs` | **new**, applies everything above. |
| `NOTICE` | A paragraph about this fork was appended; the original notice is intact. |

## Versions

| Version | Change |
|---|---|
| 1.0.6-ollama.1 | Local provider and the `ollama:` namespace. |
| 1.0.6-ollama.2 | Unique skill names. |
| 1.0.6-ollama.3 | No runtime state shared with the official plugin. |
| 1.0.6-ollama.4 | Own layout, file names, wording and command reference; resume commands keep the provider; the `spark` alias is removed; a broker that starts too slowly is stopped instead of orphaned; stopping processes works from Git Bash. |
