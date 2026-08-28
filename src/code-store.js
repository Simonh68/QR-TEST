import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ALLOWED_STATUSES = new Set(["new", "started", "completed", "canceled", "expired"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export class CodeStore {
  constructor({ filePath, now = () => new Date(), ttlMs = 24 * 60 * 60 * 1000 } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.ttlMs = ttlMs;
    this.records = new Map();
    this.load();
  }

  load() {
    if (!this.filePath || !existsSync(this.filePath)) return;

    const raw = JSON.parse(readFileSync(this.filePath, "utf8"));
    for (const record of raw.records ?? []) {
      if (ALLOWED_STATUSES.has(record.status) && record.codeHash) {
        this.records.set(record.codeHash, record);
      }
    }
  }

  persist() {
    if (!this.filePath) return;

    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(
      temporaryPath,
      JSON.stringify({ schemaVersion: 1, records: [...this.records.values()] }, null, 2),
      "utf8"
    );
    renameSync(temporaryPath, this.filePath);
  }

  create({ testId, testVersion }) {
    const token = randomBytes(18).toString("base64url");
    const now = this.now();
    const record = {
      codeHash: sha256(token),
      testId,
      testVersion,
      status: "new",
      createdAt: now.toISOString(),
      startedAt: null,
      completedAt: null,
      canceledAt: null,
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
      deviceHash: null
    };

    this.records.set(record.codeHash, record);
    this.persist();
    return { token, record: this.toPublic(record) };
  }

  find(token) {
    const record = this.records.get(sha256(token));
    if (!record) return null;
    this.expireIfNeeded(record);
    return record;
  }

  preview(token) {
    const record = this.find(token);
    return record ? this.toPublic(record) : null;
  }

  claim(token, deviceId) {
    if (!deviceId) return { ok: false, reason: "missing-device" };
    const record = this.find(token);
    if (!record) return { ok: false, reason: "not-found" };

    const deviceHash = sha256(deviceId);
    if (record.status === "new") {
      record.status = "started";
      record.startedAt = this.now().toISOString();
      record.deviceHash = deviceHash;
      this.persist();
      return { ok: true, resumed: false, record: this.toPublic(record) };
    }

    if (record.status === "started" && record.deviceHash === deviceHash) {
      return { ok: true, resumed: true, record: this.toPublic(record) };
    }

    if (record.status === "completed" && record.deviceHash === deviceHash) {
      return { ok: false, reason: "completed-on-this-device", record: this.toPublic(record) };
    }

    return { ok: false, reason: record.status, record: this.toPublic(record) };
  }

  complete(token, deviceId) {
    if (!deviceId) return { ok: false, reason: "missing-device" };
    const record = this.find(token);
    if (!record) return { ok: false, reason: "not-found" };

    const deviceHash = sha256(deviceId);
    if (record.status === "completed" && record.deviceHash === deviceHash) {
      return { ok: true, alreadyCompleted: true, record: this.toPublic(record) };
    }

    if (record.status !== "started") {
      return { ok: false, reason: record.status, record: this.toPublic(record) };
    }

    if (record.deviceHash !== deviceHash) {
      return { ok: false, reason: "different-device", record: this.toPublic(record) };
    }

    record.status = "completed";
    record.completedAt = this.now().toISOString();
    this.persist();
    return { ok: true, alreadyCompleted: false, record: this.toPublic(record) };
  }

  expireIfNeeded(record) {
    if (["new", "started"].includes(record.status) && this.now() >= new Date(record.expiresAt)) {
      record.status = "expired";
      this.persist();
    }
  }

  toPublic(record) {
    return {
      testId: record.testId,
      testVersion: record.testVersion,
      status: record.status,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      expiresAt: record.expiresAt
    };
  }
}
