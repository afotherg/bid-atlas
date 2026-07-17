import { readFile } from "node:fs/promises";
import { loadAudit, saveAudit } from "./state-audit-lib.mjs";

const stateArgument = process.argv.find((argument) => argument.startsWith("--state="));
const requested = stateArgument?.split("=")[1]?.toUpperCase().split(",").map((state) => state.trim()).filter(Boolean) ?? [];
if (!requested.length) throw new Error("Review a proposal, then pass --state=CA or --state=CA,NY to apply it to the audit CSV.");

const rows = await loadAudit();
for (const state of requested) {
  const row = rows.find((candidate) => candidate.state_code === state);
  if (!row) throw new Error(`Unknown state code: ${state}`);
  const proposal = JSON.parse(await readFile(`data/audit-proposals/${state}.json`, "utf8"));
  if (!proposal.review_required) throw new Error(`${state} proposal does not declare review_required=true.`);
  const finding = proposal.finding;
  row.audit_status = finding.audit_status;
  row.authority_status = finding.authority_status;
  row.local_terms = [...new Set([...row.local_terms.split("; "), ...finding.local_terms].map((term) => term.trim()).filter(Boolean))].join("; ");
  row.enabling_authority_url = finding.enabling_authority_url || row.enabling_authority_url;
  row.statewide_registry_status = finding.statewide_registry_status;
  row.statewide_registry_url = finding.statewide_registry_url || row.statewide_registry_url;
  row.known_local_sources = [...new Set([
    ...row.known_local_sources.split("; ").map((source) => source.trim()).filter(Boolean),
    ...finding.candidate_local_sources.map((source) => `${source.name} [${source.jurisdiction}] ${source.url}`),
  ])].join("; ");
  row.coverage_status = finding.coverage_status;
  row.confidence = finding.confidence;
  row.last_researched = proposal.researched_at.slice(0, 10);
  row.next_review_due = new Date(Date.parse(`${row.last_researched}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10);
  row.next_action = finding.next_action;
  row.notes = finding.notes;
}
await saveAudit(rows);
console.log(`Applied ${requested.length} reviewed proposal(s) to data/state-audit.csv. Inspect the diff before committing.`);
