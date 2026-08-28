import assert from "node:assert/strict";
import test from "node:test";
import { CodeStore } from "../src/code-store.js";
import { createQrTestServer } from "../src/server.js";

async function startTestServer(t) {
  const store = new CodeStore();
  const server = createQrTestServer({ store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return { store, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function post(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test("full one-time QR API flow", async (t) => {
  const { baseUrl } = await startTestServer(t);

  const createdResponse = await post(`${baseUrl}/api/codes`);
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.studentUrl, /\/t\//);
  assert.match(created.qrDataUrl, /^data:image\/png;base64,/);

  const firstPreview = await fetch(`${baseUrl}/api/codes/${created.token}`);
  assert.equal(firstPreview.status, 200);
  assert.equal((await firstPreview.json()).record.status, "new");

  const started = await post(`${baseUrl}/api/codes/${created.token}/start`, { deviceId: "device-a" });
  assert.equal(started.status, 200);

  const resumed = await post(`${baseUrl}/api/codes/${created.token}/start`, { deviceId: "device-a" });
  assert.equal(resumed.status, 200);
  assert.equal((await resumed.json()).resumed, true);

  const blocked = await post(`${baseUrl}/api/codes/${created.token}/start`, { deviceId: "device-b" });
  assert.equal(blocked.status, 409);

  const completed = await post(`${baseUrl}/api/codes/${created.token}/complete`, {
    deviceId: "device-a",
    studentName: "must-not-be-stored",
    answers: [1, 2, 3],
    score: 100
  });
  assert.equal(completed.status, 200);

  const reused = await post(`${baseUrl}/api/codes/${created.token}/start`, { deviceId: "device-b" });
  assert.equal(reused.status, 410);
});

test("student name, answers and score are ignored by the server", async (t) => {
  const { store, baseUrl } = await startTestServer(t);
  const created = await (await post(`${baseUrl}/api/codes`)).json();
  await post(`${baseUrl}/api/codes/${created.token}/start`, {
    deviceId: "device-a",
    studentName: "Example Student",
    answers: [0],
    score: 10
  });

  const storedJson = JSON.stringify([...store.records.values()]);
  assert.doesNotMatch(storedJson, /Example Student|answers|score/);
});

test("each card receives an independent one-time code", async (t) => {
  const { baseUrl } = await startTestServer(t);
  const createdCards = [];

  for (let index = 0; index < 10; index += 1) {
    createdCards.push(await (await post(`${baseUrl}/api/codes`)).json());
  }

  assert.equal(new Set(createdCards.map((card) => card.token)).size, 10);
  const previews = await Promise.all(createdCards.map(async (card) => {
    const response = await fetch(`${baseUrl}/api/codes/${card.token}`);
    return (await response.json()).record.status;
  }));
  assert.deepEqual(previews, Array(10).fill("new"));
});
