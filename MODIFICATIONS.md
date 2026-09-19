# Modifications to the original work

This repository is a fork of [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) (Apache-2.0, Copyright 2026 OpenAI), based on upstream version 1.0.6, commit `db52e28`.

This file is the notice of changes required by section 4(b) of the Apache License 2.0. Every modified text file also carries a one-line notice; JSON files cannot carry comments, so they are listed here.

All changes below except the files marked **new** are produced by `scripts/apply-ollama-patch.mjs`, which can be re-run after merging a new upstream version.

## Behaviour

| File | Change |
|---|---|
| `plugins/codex/scripts/lib/app-server.mjs` | `codex app-server` is started with `-c model_provider=<provider> -c model=<model>`, so the Codex CLI talks to a local provider. Defaults: `ollama` and `gpt-oss:20b`. Overridable with `OLLAMA_PLUGIN_CC_PROVIDER` and `OLLAMA_PLUGIN_CC_MODEL`; values are validated because the command line is assembled by a shell on Windows. |
| `plugins/codex/scripts/lib/state.mjs` | The temporary fallback state directory is `ollama-companion` instead of `codex-companion`, so it never collides with the official plugin. |

Nothing else in the runtime changes: job tracking, the broker, hooks, prompts, schemas, sandbox and approval defaults are upstream's.

## Names and wording

| Files | Change |
|---|---|
| Every `.md` and `.mjs` file under `plugins/codex/`, `tests/` and `docs/` that mentions them | The slash-command and subagent namespace `codex:` becomes `ollama:` for `rescue`, `review`, `adversarial-review`, `status`, `result`, `cancel`, `setup`, `transfer` and the `codex-rescue` subagent. |
| `plugins/codex/skills/*`, `plugins/codex/agents/codex-rescue.md`, `tests/commands.test.mjs` | The three internal skills are renamed: `codex-cli-runtime` to `ollama-cli-runtime`, `codex-result-handling` to `ollama-result-handling`, `gpt-5-4-prompting` to `ollama-prompting` (directories, `name:` fields and references). Claude Code resolves a subagent's preloaded `skills:` by bare name, so with both plugins installed the forwarder loaded the official skills, which point at the OpenAI companion script, saw contradictory instructions and refused the local path. Found in the first real `/ollama:rescue` run; fixed in 1.0.6-ollama.2. |
| `plugins/codex/agents/codex-rescue.md`, `plugins/codex/commands/rescue.md` | The description names the local Ollama backend. Without this, Claude would see two subagents with identical descriptions when both plugins are installed. |
| `plugins/codex/.claude-plugin/plugin.json` | `name` is `ollama`; description and author updated. |
| `.claude-plugin/marketplace.json` | Marketplace name `ollama-plugin-cc`; owner, description and plugin entry updated. |
| `package.json`, `package-lock.json`, the two manifests above | Version `1.0.6-ollama.N`, set with upstream's own `scripts/bump-version.mjs`. |
| `scripts/bump-version.mjs` | The marketplace entry is found under the name `ollama` as well as `codex`, so upstream's version tool and its tests both keep working. |

The directory is still called `plugins/codex` and the subagent file `codex-rescue.md` on purpose: the Codex CLI is still the agent harness, and keeping upstream's paths makes merges clean.

## Tests

| File | Change |
|---|---|
| `tests/fake-codex-fixture.mjs` | The fake `codex` binary skips leading `-c key=value` pairs before reading the subcommand. |
| `tests/commands.test.mjs` | Reads the preserved upstream README from `docs/UPSTREAM_README.md`. |

## Documentation

| File | Change |
|---|---|
| `README.md` | **new**, written for this fork. |
| `docs/UPSTREAM_README.md` | Upstream's `README.md`, moved here, with the command names adapted. |
| `MODIFICATIONS.md` | **new**, this file. |
| `scripts/apply-ollama-patch.mjs` | **new**, applies everything above. |
| `NOTICE` | A paragraph about this fork was appended; the original notice is intact. |
