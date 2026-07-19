import { readFile } from "node:fs/promises";
import { loadAudit } from "./state-audit-lib.mjs";
import {
  addQueueItem,
  checkpointItem,
  claimNext,
  emptyQueue,
  finishItem,
  loadQueue,
  pauseItem,
  queueSummary,
  requeueItem,
  saveQueue,
  seedStateTasks,
  validateQueue,
} from "./research-queue-lib.mjs";

const queueFile = process.env.RESEARCH_QUEUE_FILE || "data/research-queue.json";
const auditFile = process.env.STATE_AUDIT_FILE || "data/state-audit.csv";
const [command = "status", ...rawArguments] = process.argv.slice(2);
const options = {};
for (let index = 0; index < rawArguments.length; index += 1) {
  const argument = rawArguments[index];
  if (!argument.startsWith("--")) continue;
  const [rawKey, inlineValue] = argument.slice(2).split(/=(.*)/s);
  const key = rawKey.replaceAll("-", "_");
  const value = inlineValue ?? (rawArguments[index + 1]?.startsWith("--") ? true : rawArguments[++index]) ?? true;
  if (options[key] === undefined) options[key] = value;
  else options[key] = Array.isArray(options[key]) ? [...options[key], value] : [options[key], value];
}

const output = (value) => console.log(JSON.stringify(value, null, 2));
const arrayOption = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const requireOption = (name) => {
  if (!options[name]) throw new Error(`--${name.replaceAll("_", "-")} is required.`);
  return options[name];
};
const checkpointPatch = async () => {
  const fromFile = options.file ? JSON.parse(await readFile(options.file, "utf8")) : {};
  return {
    ...fromFile,
    ...(options.phase ? { phase: options.phase } : {}),
    ...(options.summary !== undefined ? { summary: options.summary } : {}),
    ...(options.next_action ? { next_action: options.next_action } : {}),
    ...((options.reason || fromFile.stop_reason) ? { stop_reason: options.reason || fromFile.stop_reason } : {}),
    evidence_urls: [...arrayOption(fromFile.evidence_urls), ...arrayOption(options.evidence_url)],
    artifact_paths: [...arrayOption(fromFile.artifact_paths), ...arrayOption(options.artifact_path)],
    ...(options.lease_minutes ? { lease_minutes: Number(options.lease_minutes) } : {}),
  };
};

if (command === "init") {
  let queue;
  try { queue = await loadQueue(queueFile); } catch (error) {
    if (error.code !== "ENOENT") throw error;
    queue = emptyQueue();
  }
  seedStateTasks(queue, await loadAudit(auditFile));
  await saveQueue(queue, queueFile);
  output(queueSummary(queue));
} else if (command === "status") {
  output(queueSummary(await loadQueue(queueFile)));
} else if (command === "show") {
  const queue = await loadQueue(queueFile);
  const item = queue.items.find((candidate) => candidate.id === requireOption("id"));
  if (!item) throw new Error(`Unknown queue item ${options.id}.`);
  output(item);
} else if (command === "validate") {
  const queue = await loadQueue(queueFile);
  validateQueue(queue);
  output({ valid: true, ...queueSummary(queue) });
} else if (command === "claim") {
  const queue = await loadQueue(queueFile);
  const item = claimNext(queue, {
    worker: requireOption("worker"),
    kind: options.kind,
    state_code: options.state,
    lease_minutes: options.lease_minutes,
  });
  if (item) await saveQueue(queue, queueFile);
  output(item ?? { claimed: false, reason: "No matching queued, owned, or expired work." });
} else if (command === "add") {
  const queue = await loadQueue(queueFile);
  const item = addQueueItem(queue, {
    id: options.id,
    kind: requireOption("kind"),
    title: options.title,
    state_code: requireOption("state"),
    jurisdiction: options.jurisdiction,
    parent_id: options.parent,
    priority: options.priority,
    phase: options.phase,
    summary: options.summary,
    next_action: options.next_action,
    evidence_urls: arrayOption(options.evidence_url),
    artifact_paths: arrayOption(options.artifact_path),
  });
  await saveQueue(queue, queueFile);
  output(item);
} else if (command === "checkpoint" || command === "pause") {
  const queue = await loadQueue(queueFile);
  const patch = await checkpointPatch();
  const item = command === "pause"
    ? pauseItem(queue, requireOption("id"), requireOption("worker"), patch)
    : checkpointItem(queue, requireOption("id"), requireOption("worker"), patch);
  await saveQueue(queue, queueFile);
  output(item);
} else if (["complete", "exclude", "block"].includes(command)) {
  const queue = await loadQueue(queueFile);
  const status = command === "exclude" ? "excluded" : command === "block" ? "blocked" : "complete";
  const item = finishItem(queue, requireOption("id"), requireOption("worker"), {
    summary: options.summary,
    reason: options.reason,
    artifact_paths: arrayOption(options.artifact_path),
  }, status);
  await saveQueue(queue, queueFile);
  output(item);
} else if (command === "requeue") {
  const queue = await loadQueue(queueFile);
  const item = requeueItem(queue, requireOption("id"));
  await saveQueue(queue, queueFile);
  output(item);
} else {
  throw new Error(`Unknown research queue command ${command}.`);
}
