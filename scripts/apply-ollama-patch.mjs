#!/usr/bin/env node
// apply-ollama-patch.mjs
//
// Turns a pristine openai/codex-plugin-cc tree into ollama-plugin-cc.
// Added by Jose Aguilar (2026); not part of the upstream project.
//
// The transformation is deliberately small and mechanical, so it can be re-run
// after every merge from upstream:
//
//   1. rename   the slash-command and subagent namespace  codex: -> ollama:
//   1b. skills  unique names for the three internal skills (they collide by bare name otherwise)
//   2. provider start `codex app-server` with `-c model_provider=... -c model=...`
//   2b. independence  own session variables, data folder, broker and thread names
//   3. state    use a separate temp fallback directory
//   4. fixture  let the fake codex used by the tests accept the leading -c pairs
//   5. tests    read the preserved upstream README from docs/
//   6. wording  name the backend in descriptions so Claude can tell both plugins apart
//   7. metadata plugin and marketplace names
//   8. notices  mark every modified file (Apache-2.0, section 4b)
//
// It is idempotent: a second run changes nothing. It fails loudly when an
// expected anchor is missing, which is the signal that upstream changed the
// code and the patch needs a human look.
//
// Usage:  node scripts/apply-ollama-patch.mjs [--check]
//   --check  exit 1 if running the patch would change any file

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECK_ONLY = process.argv.includes("--check");
const PLUGIN_DIR = "plugins/codex"; // kept as upstream names it, so merges stay clean

const NOTICE_TEXT =
  "Modified for ollama-plugin-cc (2026): routed to a local Ollama model. Original work Copyright 2026 OpenAI, Apache-2.0.";
const NOTICE_MARK = "Modified for ollama-plugin-cc";

const COMMANDS = ["codex-rescue", "adversarial-review", "rescue", "review", "status", "result", "cancel", "setup", "transfer"];
const NAMESPACE_RE = new RegExp(`\\bcodex:(?=(?:${COMMANDS.join("|")})\\b)`, "g");

// Claude Code resolves the `skills:` list of a subagent by bare skill name. When this
// fork is installed next to the official plugin, identical names make the subagent load
// the OFFICIAL skills (which point at the OpenAI companion script), so the forwarder sees
// contradictory instructions and refuses the local path. Unique names fix that.
const SKILL_RENAMES = [
  ["codex-cli-runtime", "ollama-cli-runtime"],
  ["codex-result-handling", "ollama-result-handling"],
  ["gpt-5-4-prompting", "ollama-prompting"]
];
const SKILLS_DIR = path.join(ROOT, PLUGIN_DIR, "skills");

const changed = [];
const problems = [];
const pendingDirRenames = [];

for (const [from, to] of SKILL_RENAMES) {
  const oldDir = path.join(SKILLS_DIR, from);
  const newDir = path.join(SKILLS_DIR, to);
  if (fs.existsSync(oldDir) && fs.existsSync(newDir)) {
    problems.push(`skills: both ${from}/ and ${to}/ exist; merge them by hand`);
  } else if (fs.existsSync(oldDir)) {
    pendingDirRenames.push([oldDir, newDir]);
  }
}

/** Where a file will live once the pending skill directory renames are applied. */
function finalPath(file) {
  for (const [oldDir, newDir] of pendingDirRenames) {
    if (file === oldDir || file.startsWith(oldDir + path.sep)) {
      return newDir + file.slice(oldDir.length);
    }
  }
  return file;
}

function renameSkillTokens(text) {
  let out = text;
  for (const [from, to] of SKILL_RENAMES) {
    out = out.split(from).join(to);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

// Writes are staged and only flushed at the very end, after every anchor was
// found. A run that reports a problem leaves the tree exactly as it was.
const pendingWrites = new Map();

function write(file, before, after) {
  if (before === after) {
    return;
  }
  changed.push(rel(finalPath(file)));
  pendingWrites.set(finalPath(file), after);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".generated") {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(md|mjs|json)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Replace `anchor` with `replacement` exactly once, or accept that it was already applied. */
function replaceOnce(text, anchor, replacement, appliedMarker, label) {
  if (text.includes(appliedMarker)) {
    return text;
  }
  const count = text.split(anchor).length - 1;
  if (count !== 1) {
    problems.push(`${label}: expected the anchor exactly once, found ${count}`);
    return text;
  }
  return text.replace(anchor, replacement);
}

/** Replace every occurrence of `anchor`, insisting on the number upstream has today. */
function replaceExactly(text, anchor, replacement, expected, label) {
  const already = text.split(replacement).length - 1;
  const count = text.split(anchor).length - 1;
  if (count === 0 && already === expected) {
    return text;
  }
  if (count !== expected) {
    problems.push(`${label}: expected the anchor ${expected} time(s), found ${count}`);
    return text;
  }
  return text.split(anchor).join(replacement);
}

function withNotice(file, text) {
  if (text.includes(NOTICE_MARK)) {
    return text;
  }
  if (file.endsWith(".mjs")) {
    const lines = text.split("\n");
    const at = lines[0].startsWith("#!") ? 1 : 0;
    lines.splice(at, 0, `// ${NOTICE_TEXT}`);
    return lines.join("\n");
  }
  if (file.endsWith(".md")) {
    return `${text.replace(/\s*$/, "")}\n\n<!-- ${NOTICE_TEXT} -->\n`;
  }
  return text; // JSON cannot carry comments; those files are listed in MODIFICATIONS.md
}

// ------------------------------------------------------------------ 1. rename
const SCAN_DIRS = [path.join(ROOT, PLUGIN_DIR), path.join(ROOT, "tests"), path.join(ROOT, "docs")];
const renameTargets = SCAN_DIRS.filter((dir) => fs.existsSync(dir)).flatMap((dir) => walk(dir));

const edits = new Map(); // file -> current text
function current(file) {
  if (!edits.has(file)) {
    edits.set(file, read(file));
  }
  return edits.get(file);
}

for (const file of renameTargets) {
  edits.set(file, renameSkillTokens(current(file).replace(NAMESPACE_RE, "ollama:")));
}

// ---------------------------------------------------------------- 2. provider
{
  const file = path.join(ROOT, PLUGIN_DIR, "scripts/lib/app-server.mjs");
  let text = current(file);
  text = replaceOnce(
    text,
    'this.proc = spawn("codex", ["app-server"], {',
    'this.proc = spawn("codex", [...buildProviderArgs(), "app-server"], {',
    "buildProviderArgs(), \"app-server\"",
    "app-server.mjs spawn"
  );
  const helper = [
    "",
    "// ollama-plugin-cc: start Codex against a local provider instead of OpenAI.",
    "// `ollama` and `lmstudio` are providers built into the Codex CLI. Override with",
    "// OLLAMA_PLUGIN_CC_PROVIDER / OLLAMA_PLUGIN_CC_MODEL. Values are validated because",
    "// on Windows the command line is assembled by a shell.",
    "const SAFE_PROVIDER_VALUE = /^[A-Za-z0-9._:\\/-]+$/;",
    "",
    "function readProviderSetting(name, fallback) {",
    "  const value = (process.env[name] ?? \"\").trim() || fallback;",
    "  if (!SAFE_PROVIDER_VALUE.test(value)) {",
    "    throw new Error(`${name} contains unsupported characters: ${value}`);",
    "  }",
    "  return value;",
    "}",
    "",
    "export function buildProviderArgs() {",
    "  const provider = readProviderSetting(\"OLLAMA_PLUGIN_CC_PROVIDER\", \"ollama\");",
    "  const model = readProviderSetting(\"OLLAMA_PLUGIN_CC_MODEL\", \"gpt-oss:20b\");",
    "  return [\"-c\", `model_provider=${provider}`, \"-c\", `model=${model}`];",
    "}",
    ""
  ].join("\n");
  text = replaceOnce(
    text,
    "class SpawnedCodexAppServerClient extends AppServerClientBase {",
    `${helper}\nclass SpawnedCodexAppServerClient extends AppServerClientBase {`,
    "export function buildProviderArgs()",
    "app-server.mjs helper"
  );
  edits.set(file, text);
}

// ------------------------------------------------------------------- 3. state
{
  const file = path.join(ROOT, PLUGIN_DIR, "scripts/lib/state.mjs");
  edits.set(
    file,
    replaceOnce(
      current(file),
      'path.join(os.tmpdir(), "codex-companion")',
      'path.join(os.tmpdir(), "ollama-companion")',
      'path.join(os.tmpdir(), "ollama-companion")',
      "state.mjs fallback dir"
    )
  );
}

// ----------------------------------------------------------------- 4. fixture
{
  const file = path.join(ROOT, "tests/fake-codex-fixture.mjs");
  const anchor = "const args = process.argv.slice(2);";
  // Inside the fixture the line lives in a template string, so match it wherever it sits.
  edits.set(
    file,
    replaceOnce(
      current(file),
      anchor,
      `${anchor}\nwhile (args[0] === "-c") {\n  args.splice(0, 2); // ollama-plugin-cc: provider overrides precede the subcommand\n}`,
      'while (args[0] === "-c")',
      "fake-codex-fixture args"
    )
  );
}

// ------------------------------------------------------------------- 5. tests
{
  const file = path.join(ROOT, "tests/commands.test.mjs");
  edits.set(
    file,
    replaceExactly(
      current(file),
      'fs.readFileSync(path.join(ROOT, "README.md"), "utf8")',
      'fs.readFileSync(path.join(ROOT, "docs", "UPSTREAM_README.md"), "utf8")',
      2,
      "commands.test.mjs README path"
    )
  );
}

// ----------------------------------------------------------------- 6. wording
{
  const file = path.join(ROOT, PLUGIN_DIR, "agents/codex-rescue.md");
  edits.set(
    file,
    replaceOnce(
      current(file),
      "should hand a substantial coding task to Codex through the shared runtime",
      "should hand a substantial coding task to a local Ollama model (run by the Codex CLI) through the shared runtime",
      "to a local Ollama model (run by the Codex CLI)",
      "agent description"
    )
  );
}
{
  const file = path.join(ROOT, PLUGIN_DIR, "commands/rescue.md");
  edits.set(
    file,
    replaceOnce(
      current(file),
      "description: Delegate investigation, an explicit fix request, or follow-up rescue work to the Codex rescue subagent",
      "description: Delegate investigation, an explicit fix request, or follow-up rescue work to a local Ollama model through the Codex rescue subagent",
      "to a local Ollama model through the Codex rescue subagent",
      "rescue command description"
    )
  );
}

// ---------------------------------------------------------------- 7. metadata
function patchJson(relPath, mutate) {
  const file = path.join(ROOT, relPath);
  const before = read(file);
  const data = JSON.parse(before);
  mutate(data);
  const after = `${JSON.stringify(data, null, 2)}\n`;
  write(file, before, after);
}

patchJson(`${PLUGIN_DIR}/.claude-plugin/plugin.json`, (data) => {
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

// ------------------------------------------------------------ 7b. version tool
// Upstream's bump-version script finds the marketplace entry by the name "codex".
// Accept both names, so its own test fixtures keep working and ours is found too.
{
  const file = path.join(ROOT, "scripts/bump-version.mjs");
  edits.set(
    file,
    replaceOnce(
      current(file),
      'json.plugins?.find((entry) => entry?.name === "codex")',
      'json.plugins?.find((entry) => entry?.name === "ollama" || entry?.name === "codex")',
      'entry?.name === "ollama" || entry?.name === "codex"',
      "bump-version plugin lookup"
    )
  );
}

// ------------------------------------------------------------ 2b. independence
// Nothing this plugin reads or writes at runtime may be shared with the official
// Codex plugin: session variables, data folder, broker names, Codex CLI thread names.

/** Replace tokens with exact expected counts; accept a tree where they are already replaced. */
function replaceTokens(relPath, pairs) {
  const file = path.join(ROOT, relPath);
  let text = current(file);
  for (const [from, to, expected] of pairs) {
    const count = text.split(from).length - 1;
    if (count === expected) {
      text = text.split(from).join(to);
    } else if (!(count === 0 && text.split(to).length - 1 >= expected)) {
      problems.push(`${relPath}: expected "${from}" ${expected} time(s), found ${count}`);
    }
  }
  edits.set(file, text);
}

const DATA_ENV_GUARD =
  "if (!process.env.OLLAMA_COMPANION_DATA && process.env.CLAUDE_PLUGIN_DATA) {\n" +
  "  process.env.OLLAMA_COMPANION_DATA = process.env.CLAUDE_PLUGIN_DATA;\n" +
  "}";

// Session variables exported by the SessionStart hook and read by the runtime.
for (const rel of [
  "scripts/session-lifecycle-hook.mjs",
  "scripts/lib/claude-session-transfer.mjs",
  "scripts/lib/app-server.mjs",
  "scripts/lib/broker-lifecycle.mjs",
  "scripts/lib/tracked-jobs.mjs"
]) {
  const file = path.join(ROOT, PLUGIN_DIR, rel);
  const text = current(file);
  const count = text.split("CODEX_COMPANION_").length - 1;
  if (count === 0 && !text.includes("OLLAMA_COMPANION_")) {
    problems.push(`${rel}: expected CODEX_COMPANION_ variables, found none`);
  }
  edits.set(file, text.split("CODEX_COMPANION_").join("OLLAMA_COMPANION_"));
}

// Data folder: hooks receive this plugin's own CLAUDE_PLUGIN_DATA from Claude Code;
// everything else reads OLLAMA_COMPANION_DATA, never the session-wide CLAUDE_PLUGIN_DATA.
{
  const file = path.join(ROOT, PLUGIN_DIR, "scripts/lib/state.mjs");
  edits.set(
    file,
    replaceOnce(
      current(file),
      'const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";',
      '// ollama-plugin-cc: never the session-wide CLAUDE_PLUGIN_DATA, which may belong to another plugin.\n' +
        'const PLUGIN_DATA_ENV = "OLLAMA_COMPANION_DATA";',
      'const PLUGIN_DATA_ENV = "OLLAMA_COMPANION_DATA";',
      "state.mjs data variable"
    )
  );
}
{
  const file = path.join(ROOT, PLUGIN_DIR, "scripts/session-lifecycle-hook.mjs");
  edits.set(
    file,
    replaceOnce(
      current(file),
      'const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";',
      'const PLUGIN_DATA_ENV = "OLLAMA_COMPANION_DATA";\n\n' +
        "// ollama-plugin-cc: Claude Code gives each plugin's hooks their own CLAUDE_PLUGIN_DATA.\n" +
        "// Upstream re-exports that variable to the whole session, where the last plugin to start\n" +
        "// wins, so two copies of this plugin would share one data folder. Carry ours under a\n" +
        "// name that only this plugin uses.\n" +
        DATA_ENV_GUARD,
      'const PLUGIN_DATA_ENV = "OLLAMA_COMPANION_DATA";',
      "session-lifecycle-hook data variable"
    )
  );
}
{
  const file = path.join(ROOT, PLUGIN_DIR, "scripts/stop-review-gate-hook.mjs");
  edits.set(
    file,
    replaceOnce(
      current(file),
      "const STOP_REVIEW_TIMEOUT_MS = 15 * 60 * 1000;",
      "// ollama-plugin-cc: see session-lifecycle-hook.mjs; expose this plugin's data folder\n" +
        "// under the name the rest of the runtime reads.\n" +
        DATA_ENV_GUARD +
        "\n\nconst STOP_REVIEW_TIMEOUT_MS = 15 * 60 * 1000;",
      "OLLAMA_COMPANION_DATA = process.env.CLAUDE_PLUGIN_DATA",
      "stop-review-gate-hook data variable"
    )
  );
}

// Runtime names: broker session folders and pipes, service name, broker user agent, and
// the Codex CLI thread-name prefix that `--resume` searches for (the Codex CLI history is
// shared, so an identical prefix would let one plugin resume the other's thread).
replaceTokens(`${PLUGIN_DIR}/scripts/lib/broker-lifecycle.mjs`, [['createBrokerSessionDir(prefix = "cxc-")', 'createBrokerSessionDir(prefix = "olc-")', 1]]);
replaceTokens(`${PLUGIN_DIR}/scripts/lib/broker-endpoint.mjs`, [["-codex-app-server`", "-ollama-app-server`", 1]]);
replaceTokens(`${PLUGIN_DIR}/scripts/lib/codex.mjs`, [
  ['const SERVICE_NAME = "claude_code_codex_plugin";', 'const SERVICE_NAME = "claude_code_ollama_plugin";', 1],
  ['const TASK_THREAD_PREFIX = "Codex Companion Task";', 'const TASK_THREAD_PREFIX = "Ollama Companion Task";', 1]
]);
replaceTokens(`${PLUGIN_DIR}/scripts/app-server-broker.mjs`, [['userAgent: "codex-companion-broker"', 'userAgent: "ollama-companion-broker"', 1]]);

// The same names in upstream's tests.
replaceTokens("tests/runtime.test.mjs", [
  ["CODEX_COMPANION_", "OLLAMA_COMPANION_", 14],
  ["CLAUDE_PLUGIN_DATA", "OLLAMA_COMPANION_DATA", 2]
]);
replaceTokens("tests/state.test.mjs", [["CLAUDE_PLUGIN_DATA", "OLLAMA_COMPANION_DATA", 5]]);
replaceTokens("tests/broker-endpoint.test.mjs", [
  ["cxc-12345", "olc-12345", 6],
  ["-codex-app-server", "-ollama-app-server", 2]
]);
replaceTokens("tests/fake-codex-fixture.mjs", [['startsWith("Codex Companion Task")', 'startsWith("Ollama Companion Task")', 1]]);

// ----------------------------------------------------------------- 8. notices
for (const [file, text] of edits) {
  const before = read(file);
  const after = text === before ? text : withNotice(file, text);
  write(file, before, after);
}

// ------------------------------------------------------------------- report
if (problems.length > 0) {
  console.error("Patch anchors not found. Upstream probably changed; review these by hand:");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(2);
}

for (const [oldDir, newDir] of pendingDirRenames) {
  changed.push(`${rel(oldDir)}/ -> ${rel(newDir)}/`);
}

if (!CHECK_ONLY) {
  for (const [oldDir, newDir] of pendingDirRenames) {
    fs.renameSync(oldDir, newDir);
  }
  for (const [file, text] of pendingWrites) {
    fs.writeFileSync(file, text, "utf8");
  }
}

const unique = [...new Set(changed)].sort();
if (unique.length === 0) {
  console.log("ollama patch: already applied, nothing to do.");
  process.exit(0);
}
console.log(`ollama patch: ${CHECK_ONLY ? "would change" : "changed"} ${unique.length} file(s):`);
for (const file of unique) {
  console.log(`  ${file}`);
}
process.exit(CHECK_ONLY ? 1 : 0);
