import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const queueSchemaVersion = 1;
export const queueKinds = new Set([
  "state_audit",
  "jurisdiction_audit",
  "district_verification",
  "boundary_research",
  "source_integration",
  "review",
]);
export const queueStatuses = new Set(["queued", "in_progress", "blocked", "complete", "excluded"]);

const iso = (value = new Date()) => new Date(value).toISOString();
const slug = (value) => String(value ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const uniqueStrings = (values = []) => [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];

export function emptyQueue(now = new Date()) {
  return {
    schema_version: queueSchemaVersion,
    updated_at: iso(now),
    sequence: 0,
    last_completed_id: null,
    items: [],
  };
}

function evidenceFromAudit(row) {
  const text = [row.enabling_authority_url, row.statewide_registry_url, row.known_local_sources].filter(Boolean).join(" ");
  return uniqueStrings(text.match(/https?:\/\/[^\s;]+/g)?.map((url) => url.replace(/[),.]$/, "")) ?? []);
}

export function seedStateTasks(store, auditRows, now = new Date()) {
  const timestamp = iso(now);
  const existing = new Map(store.items.map((item) => [item.id, item]));
  for (const row of auditRows) {
    const id = `state:${row.state_code}`;
    if (existing.has(id)) {
      existing.get(id).checkpoint.stop_reason ??= "";
      continue;
    }
    const researched = row.audit_status !== "not_started";
    store.items.push({
      id,
      kind: "state_audit",
      title: `Audit ${row.state_name}`,
      state_code: row.state_code,
      jurisdiction: "",
      parent_id: "",
      priority: researched ? 100 : 200,
      status: row.audit_status === "complete" ? "complete" : "queued",
      attempts: 0,
      created_at: timestamp,
      updated_at: timestamp,
      lease: null,
      checkpoint: {
        phase: researched ? "resume_existing_audit" : "authority",
        summary: row.notes || "No research has been recorded yet.",
        next_action: row.next_action || "Research enabling authority and official local registries.",
        stop_reason: "",
        evidence_urls: evidenceFromAudit(row),
        artifact_paths: ["data/state-audit.csv"],
        updated_at: timestamp,
      },
      result: row.audit_status === "complete" ? { summary: row.notes || "State audit complete.", completed_at: timestamp } : null,
      blocked_reason: "",
    });
  }
  store.items.sort(compareItems);
  store.updated_at = timestamp;
  return store;
}

function compareItems(left, right) {
  return Number(left.priority) - Number(right.priority)
    || left.state_code.localeCompare(right.state_code)
    || left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id);
}

export function validateQueue(store) {
  if (store?.schema_version !== queueSchemaVersion) throw new Error(`Unsupported research queue schema version ${store?.schema_version}.`);
  if (!Array.isArray(store.items)) throw new Error("Research queue items must be an array.");
  const ids = new Set();
  for (const [index, item] of store.items.entries()) {
    const label = `Queue item ${index + 1}`;
    if (!item.id || ids.has(item.id)) throw new Error(`${label} has a missing or duplicate id ${item.id ?? ""}.`);
    ids.add(item.id);
    if (!queueKinds.has(item.kind)) throw new Error(`${label} has invalid kind ${item.kind}.`);
    if (!queueStatuses.has(item.status)) throw new Error(`${label} has invalid status ${item.status}.`);
    if (!/^[A-Z]{2}$/.test(item.state_code ?? "")) throw new Error(`${label} has invalid state code ${item.state_code ?? ""}.`);
    if (!Number.isFinite(Number(item.priority))) throw new Error(`${label} has invalid priority.`);
    if (!Number.isInteger(Number(item.attempts)) || Number(item.attempts) < 0) throw new Error(`${label} has invalid attempts.`);
    if (item.parent_id && !store.items.some((candidate) => candidate.id === item.parent_id)) throw new Error(`${label} has missing parent ${item.parent_id}.`);
    if (item.status === "in_progress") {
      if (!item.lease?.worker || !item.lease?.expires_at) throw new Error(`${label} is in progress without a valid lease.`);
      if (!Number.isFinite(Date.parse(item.lease.expires_at))) throw new Error(`${label} has an invalid lease expiry.`);
    } else if (item.lease) throw new Error(`${label} has a lease while status is ${item.status}.`);
    if (!item.checkpoint?.phase || !item.checkpoint?.next_action) throw new Error(`${label} has an incomplete checkpoint.`);
    for (const url of item.checkpoint.evidence_urls ?? []) if (!/^https?:\/\//.test(url)) throw new Error(`${label} has invalid evidence URL ${url}.`);
  }
  return store;
}

export async function loadQueue(file = "data/research-queue.json") {
  return validateQueue(JSON.parse(await readFile(file, "utf8")));
}

export async function saveQueue(store, file = "data/research-queue.json", now = new Date()) {
  store.updated_at = iso(now);
  store.items.sort(compareItems);
  validateQueue(store);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`);
  await rename(temporary, file);
  return store;
}

export function addQueueItem(store, input, now = new Date()) {
  if (!queueKinds.has(input.kind)) throw new Error(`Invalid queue kind ${input.kind}.`);
  if (!/^[A-Z]{2}$/.test(input.state_code ?? "")) throw new Error("A two-letter state code is required.");
  const timestamp = iso(now);
  const base = input.id || [input.kind, input.state_code, slug(input.jurisdiction || input.title)].filter(Boolean).join(":");
  let id = base;
  while (store.items.some((item) => item.id === id)) id = `${base}:${++store.sequence}`;
  const item = {
    id,
    kind: input.kind,
    title: input.title || `Research ${input.jurisdiction || input.state_code}`,
    state_code: input.state_code,
    jurisdiction: input.jurisdiction || "",
    parent_id: input.parent_id || "",
    priority: Number(input.priority ?? 150),
    status: "queued",
    attempts: 0,
    created_at: timestamp,
    updated_at: timestamp,
    lease: null,
    checkpoint: {
      phase: input.phase || "discovery",
      summary: input.summary || "",
      next_action: input.next_action || "Begin research.",
      stop_reason: "",
      evidence_urls: uniqueStrings(input.evidence_urls),
      artifact_paths: uniqueStrings(input.artifact_paths),
      updated_at: timestamp,
    },
    result: null,
    blocked_reason: "",
  };
  store.items.push(item);
  validateQueue(store);
  return item;
}

const leaseExpired = (item, now) => item.status === "in_progress" && Date.parse(item.lease?.expires_at ?? 0) <= new Date(now).getTime();

export function claimNext(store, options, now = new Date()) {
  if (!options.worker) throw new Error("A worker name is required to claim work.");
  const matchesFilters = (item) => {
    if (options.kind && item.kind !== options.kind) return false;
    if (options.state_code && item.state_code !== options.state_code) return false;
    return true;
  };
  const owned = store.items.filter((item) => item.status === "in_progress" && item.lease?.worker === options.worker && matchesFilters(item)).sort(compareItems)[0];
  if (owned) {
    const leaseMinutes = Math.max(1, Number(options.lease_minutes ?? 240));
    owned.lease.expires_at = new Date(new Date(now).getTime() + leaseMinutes * 60_000).toISOString();
    owned.updated_at = iso(now);
    return owned;
  }
  const candidates = store.items.filter((item) => {
    if (!(item.status === "queued" || leaseExpired(item, now))) return false;
    return matchesFilters(item);
  }).sort(compareItems);
  const item = candidates[0];
  if (!item) return null;
  const timestamp = iso(now);
  const leaseMinutes = Math.max(1, Number(options.lease_minutes ?? 240));
  item.status = "in_progress";
  item.attempts = Number(item.attempts) + 1;
  item.updated_at = timestamp;
  item.lease = {
    worker: options.worker,
    claimed_at: timestamp,
    expires_at: new Date(new Date(now).getTime() + leaseMinutes * 60_000).toISOString(),
  };
  item.blocked_reason = "";
  return item;
}

function activeItem(store, id, worker) {
  const item = store.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown queue item ${id}.`);
  if (item.status !== "in_progress") throw new Error(`Queue item ${id} is not in progress.`);
  if (item.lease?.worker !== worker) throw new Error(`Queue item ${id} is leased to ${item.lease?.worker ?? "nobody"}.`);
  return item;
}

export function checkpointItem(store, id, worker, patch, now = new Date()) {
  const item = activeItem(store, id, worker);
  const timestamp = iso(now);
  item.checkpoint = {
    ...item.checkpoint,
    ...(patch.phase ? { phase: patch.phase } : {}),
    ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
    ...(patch.next_action ? { next_action: patch.next_action } : {}),
    ...(patch.stop_reason !== undefined ? { stop_reason: patch.stop_reason } : {}),
    evidence_urls: uniqueStrings([...(item.checkpoint.evidence_urls ?? []), ...(patch.evidence_urls ?? [])]),
    artifact_paths: uniqueStrings([...(item.checkpoint.artifact_paths ?? []), ...(patch.artifact_paths ?? [])]),
    updated_at: timestamp,
  };
  if (patch.lease_minutes) item.lease.expires_at = new Date(new Date(now).getTime() + Number(patch.lease_minutes) * 60_000).toISOString();
  item.updated_at = timestamp;
  validateQueue(store);
  return item;
}

export function pauseItem(store, id, worker, patch = {}, now = new Date()) {
  const item = checkpointItem(store, id, worker, { ...patch, stop_reason: patch.stop_reason || "manual_pause" }, now);
  item.status = "queued";
  item.lease = null;
  item.updated_at = iso(now);
  return item;
}

export function finishItem(store, id, worker, result, status = "complete", now = new Date()) {
  if (!new Set(["complete", "excluded", "blocked"]).has(status)) throw new Error(`Invalid terminal status ${status}.`);
  const item = activeItem(store, id, worker);
  const timestamp = iso(now);
  item.status = status;
  item.lease = null;
  item.updated_at = timestamp;
  item.blocked_reason = status === "blocked" ? (result.reason || result.summary || "Blocked pending external input.") : "";
  item.result = {
    summary: result.summary || "",
    reason: result.reason || "",
    artifact_paths: uniqueStrings(result.artifact_paths),
    completed_at: timestamp,
  };
  if (status === "complete") store.last_completed_id = item.id;
  return item;
}

export function requeueItem(store, id, now = new Date()) {
  const item = store.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown queue item ${id}.`);
  if (!new Set(["blocked", "excluded", "complete"]).has(item.status)) throw new Error(`Queue item ${id} cannot be requeued from ${item.status}.`);
  item.status = "queued";
  item.lease = null;
  item.result = null;
  item.blocked_reason = "";
  item.updated_at = iso(now);
  return item;
}

export function queueSummary(store, now = new Date()) {
  const by_status = Object.fromEntries([...queueStatuses].map((status) => [status, store.items.filter((item) => item.status === status).length]));
  const expired_leases = store.items.filter((item) => leaseExpired(item, now)).length;
  const next = store.items.filter((item) => item.status === "queued" || leaseExpired(item, now)).sort(compareItems)[0] ?? null;
  return {
    total: store.items.length,
    by_status,
    expired_leases,
    active_items: store.items.filter((item) => item.status === "in_progress").map((item) => ({ id: item.id, worker: item.lease.worker, expires_at: item.lease.expires_at })),
    last_completed_id: store.last_completed_id,
    next_item: next ? { id: next.id, title: next.title, kind: next.kind, state_code: next.state_code, next_action: next.checkpoint.next_action } : null,
  };
}
