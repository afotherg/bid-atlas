import { readFile, writeFile } from "node:fs/promises";

export const auditColumns = [
  "state_code",
  "state_name",
  "audit_status",
  "authority_status",
  "local_terms",
  "enabling_authority_url",
  "statewide_registry_status",
  "statewide_registry_url",
  "known_local_sources",
  "map_source_count",
  "map_record_count",
  "coverage_status",
  "confidence",
  "last_researched",
  "next_review_due",
  "next_action",
  "notes",
];

export function parseCsv(text) {
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      records.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    records.push(row);
  }
  if (!records.length) return [];
  const headers = records.shift();
  return records.filter((record) => record.some(Boolean)).map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])));
}

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function stringifyCsv(rows, columns = auditColumns) {
  return `${[columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export async function loadAudit(file = "data/state-audit.csv") {
  return parseCsv(await readFile(file, "utf8"));
}

export async function saveAudit(rows, file = "data/state-audit.csv") {
  await writeFile(file, stringifyCsv(rows));
}
