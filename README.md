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

The flags are the same: `--background`, `--wait`, `--resume`, `--fresh`, `--model`, `--effort`. The forwarding subagent is the same. Both plugins can be installed side by side: this fork has its own session variables, data folder, broker names and Codex CLI thread names, so neither plugin lists, resumes or reuses the other's jobs. Versions before 1.0.6-ollama.3 did share state with the official plugin; update if you run both.

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

`/ollama:setup` should report that the Codex CLI is available and that Ollama is configured and does not require a login. It does not check the model itself: a missing model only shows up when the first task fails.

## Use

```
/ollama:rescue fix the failing test in tests/test_backtest.py
/ollama:rescue --background --model gemma4:26b update CHANGELOG.md with the changes on this branch
/ollama:status
/ollama:result
/ollama:review
```

Every command, flag and flow is described in the [command reference](docs/COMMANDS.md).

## Configuration

| Environment variable | Default | Meaning |
|---|---|---|
| `OLLAMA_PLUGIN_CC_MODEL` | `gpt-oss:20b` | Model used when `--model` is not passed |
| `OLLAMA_PLUGIN_CC_PROVIDER` | `ollama` | Codex CLI provider id. `ollama` is built into the Codex CLI. `lmstudio` is also built in but has not been tested here |

Pass `--model <tag>` to use another model for one call, for example `--model gemma4:26b`.

## What to expect

Measured on a laptop with a 6 GB GPU and 32 GB of RAM, with `gpt-oss:20b` and `gemma4:26b`:

- **It is slow.** A small read-only question takes about two minutes and a small bug fix about nine. Use `--background`, then `/ollama:status` and `/ollama:result`.
- **Small models invent details in prose.** In a documentation task, `gpt-oss:20b` stated things that had not happened in two runs out of three; `gemma4:26b` did not, but took six times longer. Code is checked by your tests; prose is not, so read it.
- `--effort` may have no effect with local models.
- The optional stop-time review gate (`/ollama:setup --enable-review-gate`) would add minutes to every turn. Leave it off.
- `/ollama:status` and `/ollama:result` print the command to continue a run directly in the Codex CLI, with the local provider in it: `codex -c model_provider=ollama -c model=gpt-oss:20b resume <id>`.
- This is a Claude Code plugin, so it works while Claude Code works. It saves Claude usage; it is not a way to keep working without Claude. For that, run `ollama launch codex` or `ollama launch claude` from a terminal.

To confirm that nothing leaves your machine, look at Ollama's server log while a task runs: the requests appear as `POST "/v1/responses"` from `127.0.0.1`.

## How it differs from upstream

The whole difference is produced by [`scripts/apply-ollama-patch.mjs`](scripts/apply-ollama-patch.mjs) and listed in [MODIFICATIONS.md](MODIFICATIONS.md). In short:

1. `codex app-server` is started with `-c model_provider=ollama -c model=<model>`. The Codex CLI rejects `--profile` for `app-server`, so config overrides are the supported way. Upstream has open requests for the same capability ([#251](https://github.com/openai/codex-plugin-cc/issues/251), [#418](https://github.com/openai/codex-plugin-cc/issues/418), [#419](https://github.com/openai/codex-plugin-cc/pull/419)).
2. The fork has its own names: the `ollama:` namespace, the `plugins/ollama` directory, the `ollama-companion.mjs` script, the `ollama-rescue` subagent and the `ollama-*` skills. "Codex" as the product name reads "Ollama"; where it means the program that runs the agent, it reads "Codex CLI". The skill names are not cosmetic: Claude Code resolves a subagent's preloaded skills by bare name, so identical names made the forwarder load the official plugin's skills when both were installed.
3. Nothing used at runtime is shared with the official plugin. Upstream's SessionStart hook exports `CLAUDE_PLUGIN_DATA` to the whole session, where the last plugin to start wins; this fork exports its data folder as `OLLAMA_COMPANION_DATA` instead and never reads the session-wide variable. Its session variables are `OLLAMA_COMPANION_*` instead of `CODEX_COMPANION_*`, and its broker folders (`olc-*`), pipes (`*-ollama-app-server`), service name and Codex CLI thread prefix (`Ollama Companion Task`) are its own. The thread prefix matters: the Codex CLI history in `~/.codex` is shared by everything that uses the Codex CLI, and `--resume` finds the latest thread by that prefix.
4. A few small fixes. The printed resume commands keep the local provider. The `spark` model alias, which maps to an OpenAI model, is removed. A broker that takes longer than upstream's two-second wait to start is stopped instead of being left running untracked. And on Windows, stopping a process works from Git Bash, the shell Claude Code uses there: upstream ran `taskkill` through `$SHELL`, and Git Bash turns `/PID` into a path, so from there `/ollama:cancel` and the cleanup could not stop anything.

Everything else is upstream's code. To see the full difference, compare with the upstream commit this fork is based on:

```bash
git diff -M db52e28 HEAD -- plugins tests
```

## Updating from upstream

The fork is regenerated rather than merged: upstream's files are taken as they are and the patch script transforms them again. This avoids resolving conflicts by hand in lines the script rewrites.

```bash
git remote add upstream https://github.com/openai/codex-plugin-cc.git   # once
git fetch upstream
git merge --no-commit --strategy=ours upstream/main
git rm -r -q plugins/ollama tests
git checkout upstream/main -- . ":(exclude)README.md" ":(exclude)NOTICE"
git checkout HEAD -- "tests/ollama-*.test.mjs"
node scripts/apply-ollama-patch.mjs
node scripts/bump-version.mjs <upstream version>-ollama.1
npm test
```

The merge with `--strategy=ours` records upstream's commits as merged without taking their changes; the next three lines replace the tree with upstream's files, keeping this fork's own ones (README, NOTICE, MODIFICATIONS.md, `docs/`, the patch script and the `tests/ollama-*.test.mjs` tests). Review what changed with `git diff -M HEAD`, then `git add -A` and `git commit`.

If the patch script exits with code 2, upstream changed a line the script edits: nothing was written, and the script lists what to review. If upstream's tests start asserting README text, add it to `docs/COMMANDS.md`, which the tests read instead.

The acceptance rule is: no new test failures compared with untouched upstream. Upstream is developed on macOS and Linux. From Git Bash on Windows 11 with Node 24, 9 of its 91 tests fail on the untouched code (Unix sockets, symlinks, native session transfer, and `taskkill` run through Git Bash). In this fork 7 of those 9 still fail and no other test does: the `taskkill` fix makes the other two pass. This fork's own 7 tests pass.

Run the tests from a plain terminal, not from inside a Claude Code session. Inside a session the plugins export their session variables: this fork's `OLLAMA_COMPANION_*`, and the official plugin's `CLAUDE_PLUGIN_DATA` and `CODEX_COMPANION_*`. The tests inherit them, write their state into those folders and filter jobs by the real session id, which makes tests fail that pass in a clean environment. If you must run them there, unset them first:

```bash
env -u OLLAMA_COMPANION_DATA -u OLLAMA_COMPANION_SESSION_ID -u OLLAMA_COMPANION_TRANSCRIPT_PATH -u CLAUDE_PLUGIN_DATA -u CLAUDE_PLUGIN_ROOT -u CODEX_COMPANION_SESSION_ID -u CODEX_COMPANION_TRANSCRIPT_PATH npm test
```

The `tests/ollama-*.test.mjs` files are this fork's own: they check that the two plugins cannot share state and that the plugin stops the processes it starts.

On Windows the test suite also leaves about 60 `node.exe` processes (brokers and fake Codex CLI servers started by upstream's tests, which never end their sessions) and a few hundred temp directories behind on every run. Afterwards, end the `node.exe` processes whose command line contains `app-server-broker.mjs` or `codex-plugin-test-`.

## License

Apache-2.0, like the original. Original work Copyright 2026 OpenAI. Modifications Copyright 2026 Jose Aguilar. See [LICENSE](LICENSE), [NOTICE](NOTICE) and [MODIFICATIONS.md](MODIFICATIONS.md).
