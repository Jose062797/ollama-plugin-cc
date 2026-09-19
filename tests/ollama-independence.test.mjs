// ollama-plugin-cc: checks that this plugin never shares runtime state with the
// official Codex plugin when both are installed in the same Claude Code session.
// Added by Jose Aguilar (2026); not part of the upstream project.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { makeTempDir } from "./helpers.mjs";
import { resolveStateDir } from "../plugins/codex/scripts/lib/state.mjs";
import { buildProviderArgs } from "../plugins/codex/scripts/lib/app-server.mjs";
import { createBrokerSessionDir } from "../plugins/codex/scripts/lib/broker-lifecycle.mjs";
import { createBrokerEndpoint } from "../plugins/codex/scripts/lib/broker-endpoint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_HOOK = path.join(ROOT, "plugins", "codex", "scripts", "session-lifecycle-hook.mjs");

function withEnv(vars, fn) {
  const saved = {};
  for (const [name, value] of Object.entries(vars)) {
    saved[name] = process.env[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test("SessionStart exports the data folder as OLLAMA_COMPANION_DATA and never CLAUDE_PLUGIN_DATA", () => {
  const dataDir = makeTempDir();
  const envFile = path.join(makeTempDir(), "claude-env.sh");
  fs.writeFileSync(envFile, "", "utf8");
  const env = { ...process.env, CLAUDE_ENV_FILE: envFile, CLAUDE_PLUGIN_DATA: dataDir };
  delete env.OLLAMA_COMPANION_DATA;

  const result = spawnSync(process.execPath, [SESSION_HOOK, "SessionStart"], {
    input: JSON.stringify({ session_id: "sess-ollama", transcript_path: "" }),
    env,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const exported = fs.readFileSync(envFile, "utf8");
  assert.ok(exported.includes(`export OLLAMA_COMPANION_DATA='${dataDir}'`), exported);
  assert.match(exported, /^export OLLAMA_COMPANION_SESSION_ID='sess-ollama'$/m);
  assert.doesNotMatch(exported, /CLAUDE_PLUGIN_DATA/);
  assert.doesNotMatch(exported, /CODEX_COMPANION_/);
});

test("the runtime ignores a CLAUDE_PLUGIN_DATA exported by another plugin", () => {
  const foreignDataDir = makeTempDir();
  const workspace = makeTempDir();
  withEnv({ CLAUDE_PLUGIN_DATA: foreignDataDir, OLLAMA_COMPANION_DATA: undefined }, () => {
    const stateDir = resolveStateDir(workspace);
    assert.equal(stateDir.startsWith(foreignDataDir), false);
    assert.equal(stateDir.startsWith(path.join(os.tmpdir(), "ollama-companion")), true);
  });
});

test("the runtime stores its state under OLLAMA_COMPANION_DATA when it is set", () => {
  const ownDataDir = makeTempDir();
  const foreignDataDir = makeTempDir();
  const workspace = makeTempDir();
  withEnv({ CLAUDE_PLUGIN_DATA: foreignDataDir, OLLAMA_COMPANION_DATA: ownDataDir }, () => {
    assert.equal(resolveStateDir(workspace).startsWith(path.join(ownDataDir, "state")), true);
  });
});

test("provider arguments default to Ollama, accept overrides and reject unsafe values", () => {
  withEnv({ OLLAMA_PLUGIN_CC_PROVIDER: undefined, OLLAMA_PLUGIN_CC_MODEL: undefined }, () => {
    assert.deepEqual(buildProviderArgs(), ["-c", "model_provider=ollama", "-c", "model=gpt-oss:20b"]);
  });
  withEnv({ OLLAMA_PLUGIN_CC_PROVIDER: undefined, OLLAMA_PLUGIN_CC_MODEL: "gemma4:26b" }, () => {
    assert.deepEqual(buildProviderArgs(), ["-c", "model_provider=ollama", "-c", "model=gemma4:26b"]);
  });
  withEnv({ OLLAMA_PLUGIN_CC_PROVIDER: undefined, OLLAMA_PLUGIN_CC_MODEL: "bad;calc" }, () => {
    assert.throws(() => buildProviderArgs(), /unsupported characters/);
  });
});

test("broker session folders and pipes use this plugin's own names", () => {
  const sessionDir = createBrokerSessionDir();
  try {
    assert.match(path.basename(sessionDir), /^olc-/);
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
  assert.match(createBrokerEndpoint("C:\\Temp\\olc-12345", "win32"), /olc-12345-ollama-app-server$/);
});
