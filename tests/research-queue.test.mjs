import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  addQueueItem,
  checkpointItem,
  claimNext,
  emptyQueue,
  finishItem,
  loadQueue,
  pauseItem,
  queueSummary,
  saveQueue,
  seedStateTasks,
  validateQueue,
} from "../scripts/research-queue-lib.mjs";

const execFileAsync = promisify(execFile);

const auditRows = [
  {
    state_code: "AL",
    state_name: "Alabama",
    audit_status: "not_started",
    next_action: "Research authority.",
    notes: "",
  },
  {
    state_code: "CA",
    state_name: "California",
    audit_status: "in_progress",
    enabling_authority_url: "https://example.gov/statute",
    known_local_sources: "Official GIS https://example.gov/gis",
    next_action: "Audit remaining cities.",
    notes: "Existing partial coverage.",
  },
];

test("state audit rows seed a deterministic resumable queue", () => {
  const queue = seedStateTasks(emptyQueue("2026-01-01T00:00:00Z"), auditRows, "2026-01-01T00:00:00Z");
  assert.equal(queue.items.length, 2);
  assert.equal(queue.items[0].id, "state:CA");
  assert.equal(queue.items[0].checkpoint.phase, "resume_existing_audit");
  assert.deepEqual(queue.items[0].checkpoint.evidence_urls, ["https://example.gov/statute", "https://example.gov/gis"]);
  assert.equal(queue.items[1].id, "state:AL");
  assert.equal(queueSummary(queue).next_item.id, "state:CA");
});

test("claimed work can checkpoint, pause, and resume without losing evidence", () => {
  const queue = seedStateTasks(emptyQueue("2026-01-01T00:00:00Z"), auditRows, "2026-01-01T00:00:00Z");
  const claimed = claimNext(queue, { worker: "codex", lease_minutes: 30 }, "2026-01-01T01:00:00Z");
  assert.equal(claimed.id, "state:CA");
  checkpointItem(queue, claimed.id, "codex", {
    phase: "jurisdiction_inventory",
    summary: "Reviewed the state registry.",
    next_action: "Enumerate local governments.",
    evidence_urls: ["https://example.gov/registry"],
    artifact_paths: ["data/state-audit.csv"],
  }, "2026-01-01T01:10:00Z");
  pauseItem(queue, claimed.id, "codex", {
    summary: "Stopped at a durable boundary.",
    next_action: "Continue with city enumeration.",
    stop_reason: "usage_limit",
  }, "2026-01-01T01:15:00Z");
  assert.equal(claimed.status, "queued");
  assert.equal(claimed.lease, null);
  assert.ok(claimed.checkpoint.evidence_urls.includes("https://example.gov/registry"));
  assert.equal(claimed.checkpoint.stop_reason, "usage_limit");
  const resumed = claimNext(queue, { worker: "codex-next" }, "2026-01-02T00:00:00Z");
  assert.equal(resumed.id, claimed.id);
  assert.equal(resumed.checkpoint.next_action, "Continue with city enumeration.");
  assert.equal(resumed.attempts, 2);
});

test("expired leases are reclaimable and active leases are protected", () => {
  const queue = seedStateTasks(emptyQueue("2026-01-01T00:00:00Z"), auditRows, "2026-01-01T00:00:00Z");
  const claimed = claimNext(queue, { worker: "first", lease_minutes: 10 }, "2026-01-01T00:00:00Z");
  const resumed = claimNext(queue, { worker: "first", lease_minutes: 30 }, "2026-01-01T00:05:00Z");
  assert.equal(resumed.id, claimed.id);
  assert.equal(resumed.attempts, 1);
  assert.equal(resumed.lease.expires_at, "2026-01-01T00:35:00.000Z");
  assert.equal(claimNext(queue, { worker: "second" }, "2026-01-01T00:05:00Z").id, "state:AL");
  assert.throws(() => checkpointItem(queue, claimed.id, "wrong-worker", {}, "2026-01-01T00:06:00Z"), /leased to first/);
  const reclaimed = claimNext(queue, { worker: "recovery" }, "2026-01-01T00:36:00Z");
  assert.equal(reclaimed.id, "state:CA");
  assert.equal(reclaimed.lease.worker, "recovery");
});

test("child tasks and terminal results remain linked to their parent", () => {
  const queue = seedStateTasks(emptyQueue("2026-01-01T00:00:00Z"), auditRows, "2026-01-01T00:00:00Z");
  const child = addQueueItem(queue, {
    kind: "jurisdiction_audit",
    state_code: "CA",
    jurisdiction: "Long Beach",
    parent_id: "state:CA",
    next_action: "Find the official BID registry.",
  }, "2026-01-01T02:00:00Z");
  assert.equal(child.parent_id, "state:CA");
  const claimed = claimNext(queue, { worker: "codex", state_code: "CA", kind: "state_audit" }, "2026-01-01T03:00:00Z");
  finishItem(queue, claimed.id, "codex", { summary: "State framework complete.", artifact_paths: ["data/state-audit.csv"] }, "complete", "2026-01-01T04:00:00Z");
  assert.equal(queue.last_completed_id, "state:CA");
  assert.equal(queue.items.find((item) => item.id === child.id).status, "queued");
});

test("queue saves atomically and validates on reload", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bid-atlas-queue-"));
  const file = path.join(directory, "research-queue.json");
  try {
    const queue = seedStateTasks(emptyQueue("2026-01-01T00:00:00Z"), auditRows, "2026-01-01T00:00:00Z");
    await saveQueue(queue, file, "2026-01-01T01:00:00Z");
    const loaded = await loadQueue(file);
    assert.equal(loaded.items.length, 2);
    assert.match(await readFile(file, "utf8"), /"schema_version": 1/);
    loaded.items.push({ ...loaded.items[0] });
    assert.throws(() => validateQueue(loaded), /duplicate id/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("queue CLI initializes, claims, checkpoints, and pauses an isolated queue", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bid-atlas-queue-cli-"));
  const queueFile = path.join(directory, "research-queue.json");
  const auditFile = path.join(directory, "state-audit.csv");
  const environment = { ...process.env, RESEARCH_QUEUE_FILE: queueFile, STATE_AUDIT_FILE: auditFile };
  const run = (...arguments_) => execFileAsync(process.execPath, [new URL("../scripts/research-queue.mjs", import.meta.url).pathname, ...arguments_], { cwd: new URL("..", import.meta.url).pathname, env: environment });
  try {
    await writeFile(auditFile, "state_code,state_name,audit_status,next_action,notes\nAL,Alabama,not_started,Research authority.,\n");
    await run("init");
    const claimed = JSON.parse((await run("claim", "--worker=codex", "--state=AL", "--lease-minutes=30")).stdout);
    assert.equal(claimed.id, "state:AL");
    assert.equal(claimed.lease.worker, "codex");
    const paused = JSON.parse((await run("pause", "--id=state:AL", "--worker=codex", "--phase=registry", "--next-action=Continue", "--reason=usage_limit")).stdout);
    assert.equal(paused.status, "queued");
    assert.equal(paused.checkpoint.phase, "registry");
    assert.equal(paused.checkpoint.next_action, "Continue");
    assert.equal(paused.checkpoint.stop_reason, "usage_limit");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
