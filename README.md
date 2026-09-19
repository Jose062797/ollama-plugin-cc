# ollama-plugin-cc

Delegate tasks and code reviews from Claude Code to a **local model served by Ollama**, using the same commands, flags and runtime as OpenAI's Codex plugin.

> **Unofficial fork.** This is a fork of [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc). It is not affiliated with, endorsed by, or supported by OpenAI, Ollama or Anthropic. All trademarks belong to their owners.

## What it is

OpenAI's plugin lets Claude Code hand work to Codex with `/codex:rescue`, `/codex:review` and friends. This fork keeps that code and changes one thing: the Codex CLI is started against a local provider, so the model that does the work runs on your machine.

| Official plugin | This fork |
|---|---|
| `/codex:rescue` | `/ollama:rescue` |
| `/codex:review` | `/ollama:review` |
| `/codex:adversarial-review` | `/ollama:adversarial-review` |
| `/codex:status`, `/codex:result`, `/codex:cancel` | `/ollama:status`, `/ollama:result`, `/ollama:cancel` |
| `/codex:setup`, `/codex:transfer` | `/ollama:setup`, `/ollama:transfer` |

The flags are the same: `--background`, `--wait`, `--resume`, `--fresh`, `--model`, `--effort`. The forwarding subagent is the same. Both plugins can be installed side by side; they keep separate state and do not interfere.

It still uses the **Codex CLI** as the agent harness (sandbox, tools, threads). Only the model behind it is local.

## Requirements

- Claude Code
- Node.js 18.18 or later
- [Codex CLI](https://github.com/openai/codex): `npm install -g @openai/codex` (tested with 0.154.0). No OpenAI login is needed for a local provider.
- [Ollama](https://ollama.com) running, with a tool-capable model pulled:

  ```bash
  ollama pull gpt-oss:20b
  ```

- A context window of at least 64K tokens. Ollama [recommends this for coding agents](https://docs.ollama.com/context-length) and defaults to 4K on GPUs under 24 GB, which silently drops most of the conversation. Set it in the Ollama app settings, or with the environment variable and then restart Ollama:

  ```bash
  OLLAMA_CONTEXT_LENGTH=64000
  ```

## Install

```
/plugin marketplace add Jose062797/ollama-plugin-cc
/plugin install ollama@ollama-plugin-cc
/reload-plugins
/ollama:setup
```

`/ollama:setup` should report that Ollama is configured and does not require OpenAI authentication.

## Use

```
/ollama:rescue fix the failing test in tests/test_backtest.py
/ollama:rescue --background --model gemma4:26b update CHANGELOG.md with the changes on this branch
/ollama:status
/ollama:result
/ollama:review
```

Everything else works as described in the [upstream README](docs/UPSTREAM_README.md), which is kept in this repository with the command names adapted.

## Configuration

| Environment variable | Default | Meaning |
|---|---|---|
| `OLLAMA_PLUGIN_CC_MODEL` | `gpt-oss:20b` | Model used when `--model` is not passed |
| `OLLAMA_PLUGIN_CC_PROVIDER` | `ollama` | Codex provider id. `ollama` is built into the Codex CLI. `lmstudio` is also built in but has not been tested here |

Pass `--model <tag>` to use another model for one call, for example `--model gemma4:26b`.

## What to expect

Measured on a laptop with a 6 GB GPU and 32 GB of RAM, with `gpt-oss:20b` and `gemma4:26b`:

- **It is slow.** A small read-only question takes about two minutes and a small bug fix about nine. Use `--background`, then `/ollama:status` and `/ollama:result`.
- **Small models invent details in prose.** In a documentation task, `gpt-oss:20b` stated things that had not happened in two runs out of three; `gemma4:26b` did not, but took six times longer. Code is checked by your tests; prose is not, so read it.
- `--effort` may have no effect with local models.
- The optional stop-time review gate (`/ollama:setup --enable-review-gate`) would add minutes to every turn. Leave it off.
- `/ollama:status` prints a `codex resume <id>` hint. Run as is, that command uses your default Codex provider. To stay local, pass the same overrides: `codex -c model_provider=ollama -c model=gpt-oss:20b resume <id>`.
- This is a Claude Code plugin, so it works while Claude Code works. It saves Claude usage; it is not a way to keep working without Claude. For that, run `ollama launch codex` or `ollama launch claude` from a terminal.

To confirm that nothing leaves your machine, look at Ollama's server log while a task runs: the requests appear as `POST "/v1/responses"` from `127.0.0.1`.

## How it differs from upstream

The whole difference is produced by [`scripts/apply-ollama-patch.mjs`](scripts/apply-ollama-patch.mjs) and listed in [MODIFICATIONS.md](MODIFICATIONS.md). In short:

1. `codex app-server` is started with `-c model_provider=ollama -c model=<model>`. The Codex CLI rejects `--profile` for `app-server`, so config overrides are the supported way. Upstream has open requests for the same capability ([#251](https://github.com/openai/codex-plugin-cc/issues/251), [#418](https://github.com/openai/codex-plugin-cc/issues/418), [#419](https://github.com/openai/codex-plugin-cc/pull/419)).
2. The command and subagent namespace is `ollama:` instead of `codex:`, two descriptions name the local backend, and the three internal skills have their own names (`ollama-cli-runtime`, `ollama-result-handling`, `ollama-prompting`). Claude Code resolves a subagent's preloaded skills by bare name, so identical names made the forwarder load the official plugin's skills when both were installed.
3. The temporary fallback state directory has its own name.

To audit it yourself:

```bash
git remote add upstream https://github.com/openai/codex-plugin-cc.git
git fetch upstream
git diff upstream/main -- plugins
```

## Updating from upstream

```bash
git fetch upstream
git merge upstream/main
node scripts/apply-ollama-patch.mjs
npm test
```

The patch script is idempotent and stops with an error if upstream changed one of the lines it edits. If `README.md` conflicts, keep this file and copy upstream's version to `docs/UPSTREAM_README.md`.

Upstream is developed on macOS and Linux. On Windows, 13 of its 91 tests fail on the untouched upstream code (Unix sockets, symlinks, temp paths and process cleanup), and exactly the same 13 fail after the patch, which is the acceptance rule used here: no new failures.

Also on Windows, the test suite does not clean up after itself: each run leaves about 60 `node.exe` processes (brokers and fake Codex servers) and their temp directories behind. After `npm test`, end the `node.exe` processes whose command line contains `app-server-broker.mjs` or `codex-plugin-test-`. Normal use of the plugin is not affected: its session-end hook shuts the broker down.

## License

Apache-2.0, like the original. Original work Copyright 2026 OpenAI. Modifications Copyright 2026 Jose Aguilar. See [LICENSE](LICENSE), [NOTICE](NOTICE) and [MODIFICATIONS.md](MODIFICATIONS.md).
