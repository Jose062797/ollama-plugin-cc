// Modified for ollama-plugin-cc (2026): routed to a local Ollama model. Original work Copyright 2026 OpenAI, Apache-2.0.
import test from "node:test";
import assert from "node:assert/strict";

import { createBrokerEndpoint, parseBrokerEndpoint } from "../plugins/ollama/scripts/lib/broker-endpoint.mjs";

test("createBrokerEndpoint uses Unix sockets on non-Windows platforms", () => {
  const endpoint = createBrokerEndpoint("/tmp/olc-12345", "darwin");
  assert.equal(endpoint, "unix:/tmp/olc-12345/broker.sock");
  assert.deepEqual(parseBrokerEndpoint(endpoint), {
    kind: "unix",
    path: "/tmp/olc-12345/broker.sock"
  });
});

test("createBrokerEndpoint uses named pipes on Windows", () => {
  const endpoint = createBrokerEndpoint("C:\\\\Temp\\\\olc-12345", "win32");
  assert.equal(endpoint, "pipe:\\\\.\\pipe\\olc-12345-ollama-app-server");
  assert.deepEqual(parseBrokerEndpoint(endpoint), {
    kind: "pipe",
    path: "\\\\.\\pipe\\olc-12345-ollama-app-server"
  });
});
