// ollama-plugin-cc: checks that this plugin stops the processes it starts, on Windows
// as well as elsewhere: a broker that misses its start window, and taskkill run
// without a shell.
// Added by Jose Aguilar (2026); not part of the upstream project.

import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { makeTempDir } from "./helpers.mjs";
import { ensureBrokerSession } from "../plugins/ollama/scripts/lib/broker-lifecycle.mjs";
import { terminateProcessTree } from "../plugins/ollama/scripts/lib/process.mjs";

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function waitUntil(predicate, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return predicate();
}

test("terminateProcessTree runs taskkill directly on Windows, not through a shell", () => {
  // Through Git Bash, the SHELL of Claude Code on Windows, /PID, /T and /F would be
  // rewritten as paths and taskkill would refuse them.
  const calls = [];
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    runCommandImpl(command, args, options) {
      calls.push({ command, args, shell: options?.shell });
      return { command, args, status: 0, signal: null, stdout: "", stderr: "", error: null };
    }
  });

  assert.deepEqual(calls, [{ command: "taskkill", args: ["/PID", "1234", "/T", "/F"], shell: false }]);
  assert.equal(outcome.delivered, true);
});

test("a broker that does not start in time is stopped instead of left running", async (t) => {
  const dir = makeTempDir("ollama-plugin-test-");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pidFile = path.join(dir, "fake-broker.pid");
  const script = path.join(dir, "fake-broker.mjs");
  // Starts, records its pid and never opens the broker endpoint.
  fs.writeFileSync(
    script,
    `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nsetInterval(() => {}, 1000);\n`
  );

  const session = await ensureBrokerSession(dir, { scriptPath: script, timeoutMs: 5000 });

  assert.equal(session, null);
  assert.ok(fs.existsSync(pidFile), "the fake broker did not start within the wait");
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  assert.ok(await waitUntil(() => !isAlive(pid), 10000), `fake broker ${pid} is still running`);
});
