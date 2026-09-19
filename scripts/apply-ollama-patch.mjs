#!/usr/bin/env node
// apply-ollama-patch.mjs
//
// Turns a pristine openai/codex-plugin-cc tree into ollama-plugin-cc.
// Added by Jose Aguilar (2026); not part of the upstream project.
//
// The whole fork is this transformation plus a few fork-owned files (README.md,
// MODIFICATIONS.md, NOTICE, docs/COMMANDS.md, tests/ollama-*.test.mjs and this
// script). Steps, in order:
//
//   layout      plugins/codex -> plugins/ollama, ollama-companion.mjs, ollama-rescue.md,
//               ollama-* skills, prompt-* references
//   namespace   slash commands and subagent: codex: -> ollama:
//   tokens      file and skill names referenced from code, tests and config
//   provider    start `codex app-server` with `-c model_provider=... -c model=...`
//   independence  own session variables, data folder, broker and thread names
//   features    drop what only makes sense with OpenAI models (the `spark` alias,
//               OpenAI model examples, GPT-5.4-specific prompting advice)
//   resume      printed resume commands keep the local provider
//   cleanup     stop a broker that did not start in time instead of orphaning it, and
//               run taskkill without a shell so that stopping processes works from
//               Git Bash
//   wording     "Codex" as product name -> "Ollama"; "Codex CLI" where it means the
//               program that runs the agent
//   metadata    plugin, marketplace and package names, version-tool lookup,
//               changelog, notices
//
// It is idempotent and can start from pristine upstream or from an already
// transformed tree. All changes are staged and written only if every anchor was
// found and every post-condition holds; otherwise nothing is touched and the script
// exits 2, which is the signal that upstream changed and a human needs to look.
//
// Usage:  node scripts/apply-ollama-patch.mjs [--check]
//   --check  exit 1 if running the patch would change anything

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK_ONLY = process.argv.includes("--check");
const PLUGIN = "plugins/ollama";

const NOTICE_TEXT =
  "Modified for ollama-plugin-cc (2026): routed to a local Ollama model. Original work Copyright 2026 OpenAI, Apache-2.0.";
const NOTICE_MARK = "Modified for ollama-plugin-cc";
const FORK_NOTICE_MARK = "is a modified fork of the work above";
const FORK_NOTICE =
  "\n---\n\nThis plugin (ollama-plugin-cc) is a modified fork of the work above.\n" +
  "Modifications Copyright 2026 Jose Aguilar, licensed under the Apache License,\n" +
  "Version 2.0. The changes are listed in MODIFICATIONS.md at the repository root.\n" +
  "This fork is not affiliated with, endorsed by, or supported by OpenAI, Ollama or\n" +
  "Anthropic.\n";

// Applied in order, as prefix renames on repository-relative paths.
const LAYOUT_RULES = [
  ["plugins/codex", PLUGIN],
  [`${PLUGIN}/skills/codex-cli-runtime`, `${PLUGIN}/skills/ollama-cli-runtime`],
  [`${PLUGIN}/skills/codex-result-handling`, `${PLUGIN}/skills/ollama-result-handling`],
  [`${PLUGIN}/skills/gpt-5-4-prompting`, `${PLUGIN}/skills/ollama-prompting`],
  [`${PLUGIN}/skills/ollama-prompting/references/codex-prompt-recipes.md`, `${PLUGIN}/skills/ollama-prompting/references/prompt-recipes.md`],
  [`${PLUGIN}/skills/ollama-prompting/references/codex-prompt-antipatterns.md`, `${PLUGIN}/skills/ollama-prompting/references/prompt-antipatterns.md`],
  [`${PLUGIN}/scripts/codex-companion.mjs`, `${PLUGIN}/scripts/ollama-companion.mjs`],
  [`${PLUGIN}/agents/codex-rescue.md`, `${PLUGIN}/agents/ollama-rescue.md`]
];

// Claude Code resolves a subagent's preloaded `skills:` by bare name, so the skill
// names must differ from the official plugin's or the forwarder loads those instead.
const SKILL_RENAMES = [
  ["codex-cli-runtime", "ollama-cli-runtime"],
  ["codex-result-handling", "ollama-result-handling"],
  ["gpt-5-4-prompting", "ollama-prompting"]
];

const TOKEN_RENAMES = [
  ["plugins/codex", PLUGIN],
  ['"plugins", "codex"', '"plugins", "ollama"'],
  ["codex-companion", "ollama-companion"],
  ["codex-rescue", "ollama-rescue"],
  ["codex-prompt-recipes", "prompt-recipes"],
  ["codex-prompt-antipatterns", "prompt-antipatterns"],
  ...SKILL_RENAMES
];

const COMMANDS = ["codex-rescue", "ollama-rescue", "adversarial-review", "rescue", "review", "status", "result", "cancel", "setup", "transfer"];
const NAMESPACE_RE = new RegExp(`\\bcodex:(?=(?:${COMMANDS.join("|")})\\b)`, "g");

// This fork's own tests; they are written for the final layout and never transformed.
const FORK_OWNED = /^tests\/ollama-[^/]+\.test\.mjs$/;
const TEXT_FILE = /\.(md|mjs|json)$|\/(NOTICE|LICENSE)$/;

const problems = [];
const files = new Map(); // final relative path -> { abs, eol, text }

// ------------------------------------------------------------------ discovery

function toRel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

function finalRelOf(rel) {
  let out = rel;
  for (const [from, to] of LAYOUT_RULES) {
    if (out === from || out.startsWith(`${from}/`)) {
      out = to + out.slice(from.length);
    }
  }
  return out;
}

function load(abs) {
  const raw = fs.readFileSync(abs, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const finalRel = finalRelOf(toRel(abs));
  if (files.has(finalRel)) {
    problems.push(`two files map to ${finalRel}; the tree is half transformed, restore it with git first`);
  }
  files.set(finalRel, { abs, eol, text: raw.split("\r\n").join("\n") });
}

function walk(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".generated") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (TEXT_FILE.test(toRel(full))) {
      load(full);
    }
  }
}

if (fs.existsSync(path.join(ROOT, "plugins", "codex")) && fs.existsSync(path.join(ROOT, PLUGIN))) {
  problems.push("both plugins/codex and plugins/ollama exist; restore the tree with git first");
}
walk(path.join(ROOT, "plugins"));
walk(path.join(ROOT, "tests"));
for (const rel of [
  "package.json",
  "package-lock.json",
  "tsconfig.app-server.json",
  ".gitignore",
  ".claude-plugin/marketplace.json",
  "scripts/bump-version.mjs"
]) {
  if (fs.existsSync(path.join(ROOT, rel))) {
    load(path.join(ROOT, rel));
  }
}

const original = new Map([...files].map(([rel, f]) => [rel, f.text]));
const all = () => [...files.keys()];
const pluginFiles = () => all().filter((rel) => rel.startsWith(`${PLUGIN}/`));
const testFiles = () => all().filter((rel) => rel.startsWith("tests/") && !FORK_OWNED.test(rel));
// Upstream's history and legal texts stay as written.
const isHistory = (rel) => /\/(CHANGELOG\.md|NOTICE|LICENSE)$/.test(rel);
const wordingExcluded = (rel) => FORK_OWNED.test(rel) || isHistory(rel) || rel === `${PLUGIN}/.claude-plugin/plugin.json`;

// ------------------------------------------------------------------ helpers

function get(rel) {
  const file = files.get(rel);
  if (!file) {
    problems.push(`expected file not found: ${rel}`);
    return null;
  }
  return file.text;
}

function set(rel, text) {
  if (files.has(rel) && text !== null) {
    files.get(rel).text = text;
  }
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

/** Replace `anchor` exactly once, or accept a file where `marker` shows it was already done. */
function replaceOnce(rel, anchor, replacement, marker, label) {
  const text = get(rel);
  if (text === null || text.includes(marker)) {
    return;
  }
  const found = count(text, anchor);
  if (found !== 1) {
    problems.push(`${label} (${rel}): expected the anchor once, found ${found}`);
    return;
  }
  set(rel, text.replace(anchor, () => replacement));
}

/** Replace every occurrence, insisting on the count upstream has today; accept already applied. */
function replaceExactly(rel, pairs) {
  let text = get(rel);
  if (text === null) {
    return;
  }
  for (const [from, to, expected] of pairs) {
    const found = count(text, from);
    if (found === expected) {
      text = text.split(from).join(to);
    } else if (!(found === 0 && count(text, to) >= expected)) {
      problems.push(`${rel}: expected "${from}" ${expected} time(s), found ${found}`);
    }
  }
  set(rel, text);
}

function replaceAll(rels, pairs) {
  for (const rel of rels) {
    let text = get(rel);
    for (const [from, to] of pairs) {
      text = typeof from === "string" ? text.split(from).join(to) : text.replace(from, to);
    }
    set(rel, text);
  }
}

// ------------------------------------------------------------------ namespace and tokens

for (const rel of [...pluginFiles(), ...testFiles()].filter((rel) => !isHistory(rel))) {
  set(rel, get(rel).replace(NAMESPACE_RE, "ollama:"));
}
replaceAll(all().filter((rel) => !isHistory(rel) && !FORK_OWNED.test(rel)), TOKEN_RENAMES);

// ------------------------------------------------------------------ provider

const APP_SERVER = `${PLUGIN}/scripts/lib/app-server.mjs`;
replaceOnce(
  APP_SERVER,
  'this.proc = spawn("codex", ["app-server"], {',
  'this.proc = spawn("codex", [...buildProviderArgs(), "app-server"], {',
  'buildProviderArgs(), "app-server"',
  "app-server spawn"
);
replaceOnce(
  APP_SERVER,
  "class SpawnedCodexAppServerClient extends AppServerClientBase {",
  [
    "// ollama-plugin-cc: start the Codex CLI against a local provider instead of OpenAI.",
    "// `ollama` and `lmstudio` are providers built into the Codex CLI. Override with",
    "// OLLAMA_PLUGIN_CC_PROVIDER / OLLAMA_PLUGIN_CC_MODEL. Values are validated because",
    "// on Windows the command line is assembled by a shell.",
    "const SAFE_PROVIDER_VALUE = /^[A-Za-z0-9._:\\/-]+$/;",
    "",
    "function readProviderSetting(name, fallback) {",
    '  const value = (process.env[name] ?? "").trim() || fallback;',
    "  if (!SAFE_PROVIDER_VALUE.test(value)) {",
    "    throw new Error(`${name} contains unsupported characters: ${value}`);",
    "  }",
    "  return value;",
    "}",
    "",
    "export function buildProviderArgs() {",
    '  const provider = readProviderSetting("OLLAMA_PLUGIN_CC_PROVIDER", "ollama");',
    '  const model = readProviderSetting("OLLAMA_PLUGIN_CC_MODEL", "gpt-oss:20b");',
    '  return ["-c", `model_provider=${provider}`, "-c", `model=${model}`];',
    "}",
    "",
    "class SpawnedCodexAppServerClient extends AppServerClientBase {"
  ].join("\n"),
  "export function buildProviderArgs()",
  "app-server provider helper"
);

// ------------------------------------------------------------------ independence
// Nothing this plugin reads or writes at runtime may be shared with the official
// Codex plugin: session variables, data folder, broker names, Codex CLI thread names.

const DATA_ENV_GUARD =
  "if (!process.env.OLLAMA_COMPANION_DATA && process.env.CLAUDE_PLUGIN_DATA) {\n" +
  "  process.env.OLLAMA_COMPANION_DATA = process.env.CLAUDE_PLUGIN_DATA;\n" +
  "}";

for (const rel of [
  "scripts/session-lifecycle-hook.mjs",
  "scripts/lib/claude-session-transfer.mjs",
  "scripts/lib/app-server.mjs",
  "scripts/lib/broker-lifecycle.mjs",
  "scripts/lib/tracked-jobs.mjs"
]) {
  const file = `${PLUGIN}/${rel}`;
  const text = get(file);
  if (text !== null && count(text, "CODEX_COMPANION_") === 0 && !text.includes("OLLAMA_COMPANION_")) {
    problems.push(`${file}: expected CODEX_COMPANION_ variables, found none`);
  }
  replaceAll([file], [["CODEX_COMPANION_", "OLLAMA_COMPANION_"]]);
}

replaceOnce(
  `${PLUGIN}/scripts/lib/state.mjs`,
  'const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";',
  '// ollama-plugin-cc: never the session-wide CLAUDE_PLUGIN_DATA, which may belong to another plugin.\n' +
    'const PLUGIN_DATA_ENV = "OLLAMA_COMPANION_DATA";',
  'const PLUGIN_DATA_ENV = "OLLAMA_COMPANION_DATA";',
  "state data variable"
);
replaceOnce(
  `${PLUGIN}/scripts/session-lifecycle-hook.mjs`,
  'const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";',
  'const PLUGIN_DATA_ENV = "OLLAMA_COMPANION_DATA";\n\n' +
    "// ollama-plugin-cc: Claude Code gives each plugin's hooks their own CLAUDE_PLUGIN_DATA.\n" +
    "// Upstream re-exports that variable to the whole session, where the last plugin to start\n" +
    "// wins, so this plugin and the upstream plugin it was forked from would share one data\n" +
    "// folder when both are installed. Carry ours under a name that only this plugin uses.\n" +
    DATA_ENV_GUARD,
  'const PLUGIN_DATA_ENV = "OLLAMA_COMPANION_DATA";',
  "session hook data variable"
);
replaceOnce(
  `${PLUGIN}/scripts/stop-review-gate-hook.mjs`,
  "const STOP_REVIEW_TIMEOUT_MS = 15 * 60 * 1000;",
  "// ollama-plugin-cc: see session-lifecycle-hook.mjs; expose this plugin's data folder\n" +
    "// under the name the rest of the runtime reads.\n" +
    DATA_ENV_GUARD +
    "\n\nconst STOP_REVIEW_TIMEOUT_MS = 15 * 60 * 1000;",
  "OLLAMA_COMPANION_DATA = process.env.CLAUDE_PLUGIN_DATA",
  "stop hook data variable"
);
replaceExactly(`${PLUGIN}/scripts/lib/broker-lifecycle.mjs`, [['createBrokerSessionDir(prefix = "cxc-")', 'createBrokerSessionDir(prefix = "olc-")', 1]]);
replaceExactly(`${PLUGIN}/scripts/lib/broker-endpoint.mjs`, [["-codex-app-server`", "-ollama-app-server`", 1]]);
replaceExactly(`${PLUGIN}/scripts/lib/codex.mjs`, [
  ['const SERVICE_NAME = "claude_code_codex_plugin";', 'const SERVICE_NAME = "claude_code_ollama_plugin";', 1],
  ['const TASK_THREAD_PREFIX = "Codex Companion Task";', 'const TASK_THREAD_PREFIX = "Ollama Companion Task";', 1]
]);

replaceExactly("tests/runtime.test.mjs", [
  ["CODEX_COMPANION_", "OLLAMA_COMPANION_", 14],
  ["CLAUDE_PLUGIN_DATA", "OLLAMA_COMPANION_DATA", 2]
]);
replaceExactly("tests/state.test.mjs", [["CLAUDE_PLUGIN_DATA", "OLLAMA_COMPANION_DATA", 5]]);
replaceExactly("tests/broker-endpoint.test.mjs", [
  ["cxc-12345", "olc-12345", 6],
  ["-codex-app-server", "-ollama-app-server", 2]
]);
replaceOnce(
  "tests/fake-codex-fixture.mjs",
  "const args = process.argv.slice(2);",
  'const args = process.argv.slice(2);\nwhile (args[0] === "-c") {\n  args.splice(0, 2); // ollama-plugin-cc: provider overrides precede the subcommand\n}',
  'while (args[0] === "-c")',
  "fake codex arguments"
);
replaceExactly("tests/fake-codex-fixture.mjs", [['startsWith("Codex Companion Task")', 'startsWith("Ollama Companion Task")', 1]]);

// Upstream's tests read its README; this fork's command reference is docs/COMMANDS.md.
{
  const rel = "tests/commands.test.mjs";
  const text = get(rel);
  const source = 'fs.readFileSync(path.join(ROOT, "README.md"), "utf8")';
  const target = 'fs.readFileSync(path.join(ROOT, "docs", "COMMANDS.md"), "utf8")';
  if (text !== null && count(text, target) !== 2) {
    if (count(text, source) === 2) {
      set(rel, text.split(source).join(target));
    } else {
      problems.push(`${rel}: expected two README reads to redirect to docs/COMMANDS.md`);
    }
  }
}

// ------------------------------------------------------------------ descriptions

replaceOnce(
  `${PLUGIN}/agents/ollama-rescue.md`,
  "should hand a substantial coding task to Codex through the shared runtime",
  "should hand a substantial coding task to a local Ollama model (run by the Codex CLI) through the shared runtime",
  "to a local Ollama model (run by the Codex CLI)",
  "agent description"
);
replaceOnce(
  `${PLUGIN}/commands/rescue.md`,
  "follow-up rescue work to the Codex rescue subagent",
  "follow-up rescue work to a local Ollama model through the Codex rescue subagent",
  "to a local Ollama model through the",
  "rescue description"
);

// ------------------------------------------------------------------ features
// Remove what only exists for OpenAI: the `spark` alias for an OpenAI model, OpenAI
// model examples, GPT-5.4-specific prompting advice and the `codex login` step.

replaceOnce(`${PLUGIN}/commands/rescue.md`, "[--model <model|spark>]", "[--model <model>]", "[--model <model>]", "rescue model hint");
replaceOnce(
  `${PLUGIN}/commands/rescue.md`,
  " If they ask for `spark`, map it to `gpt-5.3-codex-spark`.",
  "",
  "- Leave the model unset unless the user explicitly asks for one.\n",
  "rescue spark rule"
);
replaceOnce(
  `${PLUGIN}/agents/ollama-rescue.md`,
  "- If the user asks for `spark`, map that to `--model gpt-5.3-codex-spark`.\n",
  "",
  "- Leave model unset by default. Only add `--model` when the user explicitly asks for a specific model.\n- If the user asks for a concrete",
  "agent spark rule"
);
replaceOnce(
  `${PLUGIN}/agents/ollama-rescue.md`,
  "such as `gpt-5.4-mini`, pass it through",
  "such as `gemma4:26b`, pass it through",
  "such as `gemma4:26b`",
  "agent model example"
);
replaceOnce(
  `${PLUGIN}/skills/ollama-cli-runtime/SKILL.md`,
  "- Map `spark` to `--model gpt-5.3-codex-spark`.\n",
  "",
  "asks for one.\n- Default to a write-capable",
  "runtime skill spark rule"
);
replaceOnce(
  `${PLUGIN}/skills/ollama-cli-runtime/SKILL.md`,
  "normalize `spark` to `gpt-5.3-codex-spark` and pass it through to `task`",
  "pass it through to `task`",
  "includes `--model`, pass it through to `task`",
  "runtime skill model normalization"
);
replaceOnce(
  `${PLUGIN}/scripts/ollama-companion.mjs`,
  'new Map([["spark", "gpt-5.3-codex-spark"]])',
  "new Map()",
  "const MODEL_ALIASES = new Map();",
  "companion model aliases"
);
replaceOnce(`${PLUGIN}/scripts/ollama-companion.mjs`, "[--model <model|spark>]", "[--model <model>]", "[--model <model>]", "companion usage");
replaceOnce(
  `${PLUGIN}/commands/setup.md`,
  "- If Codex is installed but not authenticated, preserve the guidance to run `!codex login`.",
  "- If the Codex CLI is installed but its provider requires a login, preserve the login guidance from the setup output.",
  "but its provider requires a login, preserve the login guidance",
  "setup login guidance"
);

// Upstream's tests assert the removed features; assert their absence instead.
{
  const rel = "tests/commands.test.mjs";
  const edits = [
    ["assert.match(rescue, /--model <model\\|spark>/);", "assert.match(rescue, /--model <model>/);"],
    ["assert.match(rescue, /If they ask for `spark`, map it to `gpt-5\\.3-codex-spark`/i);", "assert.doesNotMatch(rescue, /spark/i);"],
    ["assert.match(agent, /If the user asks for `spark`, map that to `--model gpt-5\\.3-codex-spark`/i);", "assert.doesNotMatch(agent, /spark/i);"],
    ["such as `gpt-5\\.4-mini`, pass it through", "such as `gemma4:26b`, pass it through"],
    ["assert.match(runtimeSkill, /Map `spark` to `--model gpt-5\\.3-codex-spark`/i);", "assert.doesNotMatch(runtimeSkill, /spark/i);"],
    [
      "assert.match(readme, /if you do not pass `--model` or `--effort`, Codex chooses its own defaults/i);",
      "assert.match(readme, /if you do not pass `--model`, the plugin uses its default model/i);"
    ],
    ["assert.match(readme, /--model gpt-5\\.4-mini --effort medium/i);", "assert.match(readme, /--model gemma4:26b --effort medium/i);"],
    ["assert.match(readme, /`spark`, the plugin maps that to `gpt-5\\.3-codex-spark`/i);", "assert.doesNotMatch(readme, /spark/i);"],
    ["and still points users to codex login", "and points users to Ollama"],
    ["assert.match(readme, /!codex login/);", "assert.match(readme, /ollama pull gpt-oss:20b/);"]
  ];
  for (const [anchor, replacement] of edits) {
    replaceOnce(rel, anchor, replacement, replacement, "commands test");
  }
}
replaceOnce(
  "tests/runtime.test.mjs",
  'assert.equal(fakeState.lastTurnStart.model, "gpt-5.3-codex-spark");',
  'assert.equal(fakeState.lastTurnStart.model, "spark"); // ollama-plugin-cc: no model aliases',
  "// ollama-plugin-cc: no model aliases",
  "runtime spark alias"
);

// ------------------------------------------------------------------ resume
// A plain `codex resume <id>` continues with the user's default provider; keep it local.

const RESUME_CMD = 'codex ${buildProviderArgs().join(" ")} resume ${';
replaceExactly(`${PLUGIN}/scripts/lib/render.mjs`, [["`codex resume ${", "`" + RESUME_CMD, 2]]);
replaceExactly(`${PLUGIN}/scripts/ollama-companion.mjs`, [["`codex resume ${", "`" + RESUME_CMD, 1]]);
{
  const rel = `${PLUGIN}/scripts/lib/render.mjs`;
  const text = get(rel);
  const line = 'import { buildProviderArgs } from "./app-server.mjs";';
  if (text !== null && !text.includes(line)) {
    const lines = text.split("\n");
    const at = lines.findIndex((l) => !l.startsWith("//") && !l.startsWith("#!"));
    lines.splice(at, 0, line);
    set(rel, lines.join("\n"));
  }
}
replaceOnce(
  `${PLUGIN}/scripts/ollama-companion.mjs`,
  'import { resolveClaudeSessionPath } from "./lib/claude-session-transfer.mjs";',
  'import { resolveClaudeSessionPath } from "./lib/claude-session-transfer.mjs";\nimport { buildProviderArgs } from "./lib/app-server.mjs";',
  'import { buildProviderArgs } from "./lib/app-server.mjs";',
  "companion provider import"
);
replaceAll(testFiles(), [["codex resume thr_", "codex -c model_provider=ollama -c model=gpt-oss:20b resume thr_"]]);
replaceOnce(
  "tests/commands.test.mjs",
  "assert.match(transfer, /codex resume <session-id>/);",
  "assert.match(transfer, /codex \\.\\.\\. resume <session-id>/);",
  "assert.match(transfer, /codex \\.\\.\\. resume <session-id>/);",
  "transfer resume hint test"
);

// ------------------------------------------------------------------ cleanup
// Upstream waits two seconds for its broker; when it gives up it deletes the broker's
// folder but leaves the process running, untracked. Stop the process it just started.
// Only that fresh child is stopped: a pid read back from disk could have been reused.
//
// Stopping processes on Windows goes through taskkill, which upstream runs through
// $SHELL. When that is Git Bash, as in the Bash tool of Claude Code on Windows, /PID,
// /T and /F are rewritten as paths and every taskkill fails: cancel, session-end
// cleanup, closing a direct app-server and the stop above. Run it directly, as
// upstream already does for git.

replaceOnce(
  `${PLUGIN}/scripts/lib/process.mjs`,
  '    const result = runCommandImpl("taskkill", ["/PID", String(pid), "/T", "/F"], {\n      cwd: options.cwd,\n      env: options.env\n    });',
  '    // ollama-plugin-cc: taskkill is directly executable, like git in git.mjs. Through Git Bash\n' +
    "    // (the SHELL of Claude Code on Windows) its options are rewritten as paths and it fails.\n" +
    '    const result = runCommandImpl("taskkill", ["/PID", String(pid), "/T", "/F"], {\n      cwd: options.cwd,\n      env: options.env,\n      shell: false\n    });',
  "// ollama-plugin-cc: taskkill is directly executable",
  "taskkill without a shell"
);
replaceOnce(
  `${PLUGIN}/scripts/lib/broker-lifecycle.mjs`,
  'import { resolveStateDir } from "./state.mjs";',
  'import { resolveStateDir } from "./state.mjs";\nimport { terminateProcessTree } from "./process.mjs";',
  'import { terminateProcessTree } from "./process.mjs";',
  "broker process import"
);
replaceOnce(
  `${PLUGIN}/scripts/lib/broker-lifecycle.mjs`,
  "      pid: child.pid ?? null,\n      killProcess: options.killProcess ?? null\n    });\n    return null;",
  "      pid: child.pid ?? null,\n" +
    "      // ollama-plugin-cc: stop the broker that did not start in time instead of orphaning it.\n" +
    "      killProcess: options.killProcess ?? terminateProcessTree\n    });\n    return null;",
  "killProcess: options.killProcess ?? terminateProcessTree",
  "broker start timeout"
);

// ------------------------------------------------------------------ wording
// "Codex" keeps meaning the Codex CLI where it is the program (installing it, its
// login, its sessions, its history); elsewhere it named the product and becomes
// "Ollama". The phrases below are the exceptions to that generic rule.

const PHRASES = [
  ["You are Codex performing", "You are performing"],
  ["before starting Codex, check", "before starting the task, check"],
  ["the `codex resume <session-id>` command", "the `codex ... resume <session-id>` command"],
  ["so Codex can refresh an expired session", "so the Codex CLI can refresh an expired session"],
  ["the actual Codex auth error", "the actual Codex CLI auth error"],
  ["Resume in Codex:", "Resume with the Codex CLI:"],
  ["Codex session", "Codex CLI session"],
  ["Codex Session", "Codex CLI Session"],
  ["into a Codex thread", "into a Codex CLI thread"],
  ["resumable Codex thread", "resumable Codex CLI thread"],
  ["Importing Claude session into Codex.", "Importing Claude session into the Codex CLI."],
  ["waiting for Codex to finish importing", "waiting for the Codex CLI to finish importing"],
  ["Codex can import Claude sessions", "The Codex CLI can import Claude sessions"],
  ["Codex reported that the Claude import", "The Codex CLI reported that the Claude import"],
  ["This Codex version", "This Codex CLI version"],
  ["Update Codex with", "Update the Codex CLI with"],
  ["Install Codex with", "Install the Codex CLI with"],
  ["Install Codex (Recommended)", "Install the Codex CLI (Recommended)"],
  ["install Codex now", "install the Codex CLI now"],
  ["install Codex for", "install the Codex CLI for"],
  ["offer Codex install", "offer to install the Codex CLI"],
  ["says Codex is unavailable", "says the Codex CLI is unavailable"],
  ["If Codex is already installed", "If the Codex CLI is already installed"],
  ["when Codex is already installed", "when the Codex CLI is already installed"],
  ["reports that Codex is missing or unauthenticated", "reports that the Codex CLI is missing or not ready"],
  ["or Codex cannot be invoked", "or the Codex CLI cannot be invoked"],
  ["does not require OpenAI authentication", "does not require a login"],
  ["requires OpenAI authentication", "requires a login"]
];

const PROMPTING = `${PLUGIN}/skills/ollama-prompting/`;
const PROMPTING_PHRASES = [
  ["composing Codex and GPT-5.4 prompts", "composing prompts for the local model"],
  ["inside the Codex Claude Code plugin", "inside the Ollama Claude Code plugin"],
  ["# GPT-5.4 Prompting", "# Prompting the local model"],
  ["needs to ask Codex or another GPT-5.4-based workflow for help", "needs to ask the local model for help"],
  ["# Codex Prompt Recipes", "# Prompt Recipes"],
  ["# Codex Prompt Anti-Patterns", "# Prompt Anti-Patterns"],
  ["Codex task prompts or other Codex/GPT-5.4 prompt construction", "Ollama task prompts or other prompts for the local model"],
  ["improve it for Codex or GPT-5.4", "improve it for the local model"],
  ["prompting Codex or GPT-5.4", "prompting the local model"],
  ["composing Codex or GPT-5.4 prompts", "composing prompts for the local model"],
  ["per Codex run", "per run"],
  ["same Codex thread", "same thread"],
  [/\bthe Codex\b/g, "the local model"],
  [/\bCodex\b/g, "the local model"]
];

const wordingTargets = [...pluginFiles(), ...testFiles()].filter((rel) => !wordingExcluded(rel));
replaceAll(wordingTargets, PHRASES);
replaceAll(
  wordingTargets.filter((rel) => rel.startsWith(PROMPTING)),
  PROMPTING_PHRASES
);
replaceAll(wordingTargets, [
  [/\b(a|A) Codex\b(?! CLI| [Aa]pp)/g, "$1n Ollama"],
  [/\bCodex\b(?! CLI| [Aa]pp)/g, "Ollama"]
]);

// Lower-case copies of reworded messages: a job's phase is inferred from its log lines
// ("Starting Ollama task thread.", "Ollama error: ..."), and progress on stderr is
// prefixed with the product name.
replaceExactly(`${PLUGIN}/scripts/lib/job-control.mjs`, [
  ['line.startsWith("starting codex")', 'line.startsWith("starting ollama")', 1],
  ['line.startsWith("codex error:")', 'line.startsWith("ollama error:")', 1]
]);
replaceExactly(`${PLUGIN}/scripts/lib/tracked-jobs.mjs`, [["`[codex] ", "`[ollama] ", 1]]);

// ------------------------------------------------------------------ metadata

function patchJson(rel, mutate) {
  const text = get(rel);
  if (text === null) {
    return;
  }
  const data = JSON.parse(text);
  mutate(data);
  set(rel, `${JSON.stringify(data, null, 2)}\n`);
}

patchJson(`${PLUGIN}/.claude-plugin/plugin.json`, (data) => {
  data.name = "ollama";
  data.description = "Use a local Ollama model from Claude Code to review code or delegate tasks. Unofficial fork of OpenAI's Codex plugin.";
  data.author = { name: "Jose Aguilar (fork of the Codex plugin by OpenAI)" };
});
patchJson(".claude-plugin/marketplace.json", (data) => {
  data.name = "ollama-plugin-cc";
  data.owner = { name: "Jose Aguilar" };
  data.metadata = {
    ...data.metadata,
    description: "Unofficial fork of OpenAI's Codex plugin for Claude Code, routed to local Ollama models."
  };
  for (const plugin of data.plugins ?? []) {
    plugin.name = "ollama";
    plugin.description = "Use a local Ollama model from Claude Code to review code or delegate tasks.";
    plugin.author = { name: "Jose Aguilar (fork of the Codex plugin by OpenAI)" };
  }
});

patchJson("package.json", (data) => {
  data.name = "ollama-plugin-cc";
  data.description = "Use a local Ollama model from Claude Code to review code or delegate tasks.";
});
patchJson("package-lock.json", (data) => {
  data.name = "ollama-plugin-cc";
  if (data.packages?.[""]) {
    data.packages[""].name = "ollama-plugin-cc";
  }
});

// Upstream's version tool finds the marketplace entry by the plugin name.
replaceOnce(
  "scripts/bump-version.mjs",
  'json.plugins?.find((entry) => entry?.name === "codex");\n  requireObject(plugin, ".claude-plugin/marketplace.json plugins[codex]");',
  'json.plugins?.find((entry) => entry?.name === "ollama");\n  requireObject(plugin, ".claude-plugin/marketplace.json plugins[ollama]");',
  'json.plugins?.find((entry) => entry?.name === "ollama");',
  "version tool lookup"
);
replaceExactly("scripts/bump-version.mjs", [['label: "plugins[codex].version"', 'label: "plugins[ollama].version"', 1]]);
replaceExactly("tests/bump-version.test.mjs", [
  ['"@openai/codex-plugin-cc"', '"ollama-plugin-cc"', 4],
  ['name: "codex",', 'name: "ollama",', 2],
  ["plugins\\/codex\\/", "plugins\\/ollama\\/", 1]
]);

replaceOnce(
  `${PLUGIN}/CHANGELOG.md`,
  "# Changelog\n",
  "# Changelog\n\nChanges made in this fork (ollama-plugin-cc) are listed in MODIFICATIONS.md at the repository\nroot. The entries below are the history of the upstream Codex plugin it is based on.\n",
  "Changes made in this fork (ollama-plugin-cc)",
  "plugin changelog note"
);
{
  const rel = `${PLUGIN}/NOTICE`;
  const text = get(rel);
  if (text !== null && !text.includes(FORK_NOTICE_MARK)) {
    set(rel, `${text.replace(/\s*$/, "")}\n${FORK_NOTICE}`);
  }
}

// ------------------------------------------------------------------ post-conditions

function forbid(rels, pattern, what) {
  for (const rel of rels) {
    const text = get(rel);
    const match = text === null ? null : text.match(pattern);
    if (match) {
      const line = text.slice(0, match.index).split("\n").length;
      problems.push(`${rel}:${line}: ${what}: "${match[0]}"`);
    }
  }
}

const pluginWording = pluginFiles().filter((rel) => !wordingExcluded(rel));
forbid(pluginWording, /\bCodex\b(?! CLI| [Aa]pp)/, "product name left as Codex");
forbid(testFiles(), /\bCodex\b(?! CLI| [Aa]pp)/, "product name left as Codex");
forbid(pluginWording, /spark|GPT-5|gpt-5/i, "OpenAI-only model reference");
forbid(
  [...pluginFiles(), ...testFiles()].filter((rel) => !isHistory(rel)),
  /\/codex:|codex-companion|codex-rescue|codex-prompt-|CODEX_COMPANION_/,
  "upstream name left"
);

// ------------------------------------------------------------------ notices

for (const [rel, file] of files) {
  if (file.text === original.get(rel) || file.text.includes(NOTICE_MARK) || FORK_OWNED.test(rel)) {
    continue;
  }
  if (rel.endsWith(".mjs")) {
    const lines = file.text.split("\n");
    lines.splice(lines[0].startsWith("#!") ? 1 : 0, 0, `// ${NOTICE_TEXT}`);
    file.text = lines.join("\n");
  } else if (rel.endsWith(".md")) {
    file.text = `${file.text.replace(/\s*$/, "")}\n\n<!-- ${NOTICE_TEXT} -->\n`;
  }
}

// ------------------------------------------------------------------ report and write

if (problems.length > 0) {
  console.error("Nothing was written. Upstream probably changed; review these by hand:");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(2);
}

// The layout rules that still apply, found by replaying them on the current paths.
const pendingRenames = [];
{
  let paths = [...files.values()].map((file) => toRel(file.abs));
  for (const [from, to] of LAYOUT_RULES) {
    const under = (rel) => rel === from || rel.startsWith(`${from}/`);
    if (paths.some(under)) {
      pendingRenames.push([from, to]);
      paths = paths.map((rel) => (under(rel) ? to + rel.slice(from.length) : rel));
    }
  }
}
const changed = [...files].filter(([rel, file]) => file.text !== original.get(rel));

if (pendingRenames.length === 0 && changed.length === 0) {
  console.log("ollama patch: already applied, nothing to do.");
  process.exit(0);
}

console.log(`ollama patch: ${CHECK_ONLY ? "would apply" : "applied"} ${pendingRenames.length} rename(s) and ${changed.length} file change(s).`);
for (const [from, to] of pendingRenames) {
  console.log(`  rename ${from} -> ${to}`);
}
for (const [rel] of changed) {
  console.log(`  ${rel}`);
}
if (CHECK_ONLY) {
  process.exit(1);
}

// In order: each rule sees the result of the previous ones.
for (const [from, to] of pendingRenames) {
  fs.mkdirSync(path.dirname(path.join(ROOT, to)), { recursive: true });
  fs.renameSync(path.join(ROOT, from), path.join(ROOT, to));
}
for (const [rel, file] of changed) {
  fs.writeFileSync(path.join(ROOT, rel), file.eol === "\r\n" ? file.text.split("\n").join("\r\n") : file.text, "utf8");
}
