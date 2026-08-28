import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CodeStore } from "../src/code-store.js";

function testStore() {
  const directory = mkdtempSync(join(tmpdir(), "qr-test-"));
  const filePath = join(directory, "codes.json");
  const store = new CodeStore({ filePath });
  return { store, filePath, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test("preview does not consume a new code", (t) => {
  const { store, cleanup } = testStore();
  t.after(cleanup);
  const { token } = store.create({ testId: "demo", testVersion: 1 });

  assert.equal(store.preview(token).status, "new");
  assert.equal(store.preview(token).status, "new");
});

test("only one device can claim a code and the same device can resume", (t) => {
  const { store, cleanup } = testStore();
  t.after(cleanup);
  const { token } = store.create({ testId: "demo", testVersion: 1 });

  assert.deepEqual(store.claim(token, "device-a").ok, true);
  assert.deepEqual(store.claim(token, "device-a").resumed, true);
  assert.equal(store.claim(token, "device-b").ok, false);
  assert.equal(store.claim(token, "device-b").reason, "started");
});

test("a completed code cannot be reused", (t) => {
  const { store, cleanup } = testStore();
  t.after(cleanup);
  const { token } = store.create({ testId: "demo", testVersion: 1 });
  store.claim(token, "device-a");

  assert.equal(store.complete(token, "device-a").ok, true);
  assert.equal(store.preview(token).status, "completed");
  assert.equal(store.claim(token, "device-b").ok, false);
  assert.equal(store.claim(token, "device-b").reason, "completed");
});

test("server file stores only technical code metadata", (t) => {
  const { store, filePath, cleanup } = testStore();
  t.after(cleanup);
  store.create({ testId: "demo", testVersion: 1 });

  const saved = readFileSync(filePath, "utf8");
  assert.doesNotMatch(saved, /student|answer|score|email/i);
  assert.match(saved, /codeHash/);
  assert.doesNotMatch(saved, /token/);
});
