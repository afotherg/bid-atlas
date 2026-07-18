import { writeFile } from "node:fs/promises";
import { loadAudit } from "./state-audit-lib.mjs";

const rows = await loadAudit();

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

function linkedText(value) {
  const text = String(value ?? "");
  const pattern = /https?:\/\/[^\s;]+/g;
  let html = "";
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    html += escapeHtml(text.slice(cursor, match.index));
    let url = match[0];
    let suffix = "";
    while (/[),.]$/.test(url)) {
      suffix = url.at(-1) + suffix;
      url = url.slice(0, -1);
    }
    html += `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>${escapeHtml(suffix)}`;
    cursor = Number(match.index) + match[0].length;
  }
  return html + escapeHtml(text.slice(cursor));
}

const label = (value) => String(value || "not_started").replaceAll("_", " ");
function sourcesFor(row) {
  const seen = new Set();
  return String(row.known_local_sources || "").split(";").map((source) => source.trim()).filter((source) => {
    if (!source) return false;
    const url = source.match(/https?:\/\/[^\s;]+/)?.[0]?.replace(/[),.]$/, "");
    const key = url || source.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
const researched = rows.filter((row) => row.audit_status !== "not_started").length;
const mappedStates = rows.filter((row) => Number(row.map_record_count) > 0).length;
const mappedRecords = rows.reduce((sum, row) => sum + Number(row.map_record_count || 0), 0);
const knownSources = rows.reduce((sum, row) => sum + sourcesFor(row).length, 0);

const stateCards = rows.map((row) => {
  const sources = sourcesFor(row);
  const searchText = [row.state_code, row.state_name, row.local_terms, row.known_local_sources, row.notes, row.next_action].join(" ").toLowerCase();
  const authority = row.enabling_authority_url
    ? `<a href="${escapeHtml(row.enabling_authority_url)}" target="_blank" rel="noreferrer">Enabling authority ↗</a>`
    : "<span>Authority not yet assessed</span>";
  const registry = row.statewide_registry_url
    ? `<a href="${escapeHtml(row.statewide_registry_url)}" target="_blank" rel="noreferrer">Statewide registry ↗</a>`
    : `<span>Statewide registry: ${escapeHtml(label(row.statewide_registry_status))}</span>`;

  return `<article class="state-card" data-audit="${escapeHtml(row.audit_status)}" data-search="${escapeHtml(searchText)}">
    <header>
      <div><span class="state-code">${escapeHtml(row.state_code)}</span><h2>${escapeHtml(row.state_name)}</h2></div>
      <span class="status status-${escapeHtml(row.audit_status)}">${escapeHtml(label(row.audit_status))}</span>
    </header>
    <div class="metrics">
      <div><strong>${escapeHtml(row.map_record_count || "0")}</strong><span>mapped districts</span></div>
      <div><strong>${escapeHtml(row.map_source_count || "0")}</strong><span>mapped sources</span></div>
      <div><strong>${escapeHtml(label(row.coverage_status))}</strong><span>coverage</span></div>
      <div><strong>${escapeHtml(label(row.confidence))}</strong><span>confidence</span></div>
    </div>
    <div class="authority-links">${authority}${registry}</div>
    ${row.local_terms ? `<section><h3>Local terms</h3><p>${escapeHtml(row.local_terms)}</p></section>` : ""}
    <section>
      <h3>Known districts and official local sources <span>${sources.length}</span></h3>
      ${sources.length ? `<ul class="source-list">${sources.map((source) => `<li>${linkedText(source)}</li>`).join("")}</ul>` : `<p class="empty">No cases have been recorded yet. This may mean the state has not been researched.</p>`}
    </section>
    ${row.notes ? `<section><h3>Current determination</h3><p>${linkedText(row.notes)}</p></section>` : ""}
    <section class="next-step"><h3>Next action</h3><p>${linkedText(row.next_action || "Research enabling authority and official local registries.")}</p></section>
    <footer><span>Last researched: ${escapeHtml(row.last_researched || "Not yet researched")}</span><span>Next review: ${escapeHtml(row.next_review_due || "Not scheduled")}</span></footer>
  </article>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="State-by-state BID Atlas coverage audit, including mapped districts, known candidates, official sources, and unresolved research.">
  <title>State Coverage Audit · BID Atlas</title>
  <style>
    :root{--ink:#17211c;--paper:#f4f0e7;--cream:#e9e1d2;--orange:#ee5a34;--gold:#e8b543;--green:#29493b;--line:rgba(23,33,28,.18)}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Arial,sans-serif}a{color:inherit}.topbar{min-height:66px;padding:0 4vw;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:rgba(244,240,231,.96);position:sticky;top:0;z-index:10;backdrop-filter:blur(12px)}.brand{text-decoration:none;display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:-.03em}.brand b{color:var(--orange)}.brand-mark{width:28px;height:34px;display:grid;place-items:center;color:var(--paper);background:var(--ink);border-radius:15px 15px 3px 15px;font-family:Georgia,serif;font-size:20px}.back-link{font-size:12px;font-weight:800;text-underline-offset:4px}
    .hero{padding:64px 7vw 54px;background:var(--green);color:#f6f0e3}.kicker{font-size:11px;letter-spacing:.18em;font-weight:800;color:#d8bc7b;margin:0 0 14px}.hero h1{max-width:900px;margin:0;font-family:Georgia,serif;font-weight:400;font-size:clamp(44px,7vw,82px);line-height:.95;letter-spacing:-.055em}.hero p{max-width:760px;color:#d2d9d4;font-size:16px;line-height:1.65}.summary{display:flex;flex-wrap:wrap;gap:28px;margin-top:34px;padding-top:28px;border-top:1px solid rgba(255,255,255,.2)}.summary div{display:grid;gap:3px}.summary strong{font-family:Georgia,serif;color:#fff;font-size:30px;font-weight:400}.summary span{color:#b9c7bf;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
    .controls{position:sticky;top:66px;z-index:9;display:grid;grid-template-columns:1fr 220px;gap:12px;padding:16px 7vw;background:rgba(244,240,231,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}.controls label{display:grid;gap:5px;color:#68746d;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.controls input,.controls select{width:100%;min-height:44px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:0 13px;color:var(--ink);font:inherit}.controls input:focus,.controls select:focus{outline:2px solid var(--orange);outline-offset:1px}.result-note{grid-column:1/-1;margin:0;color:#69756e;font-size:11px}
    .content{padding:34px 7vw 80px}.intro{max-width:850px;margin:0 0 30px;color:#526059;font-size:14px;line-height:1.65}.state-list{display:grid;gap:18px}.state-card{background:#fffdf8;border:1px solid var(--line);border-radius:12px;padding:24px;box-shadow:0 8px 24px rgba(23,33,28,.04)}.state-card[hidden]{display:none}.state-card>header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:1px solid var(--line)}.state-card>header>div{display:flex;align-items:center;gap:12px}.state-code{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:var(--ink);color:#fff;font-size:11px;font-weight:900;letter-spacing:.08em}.state-card h2{margin:0;font-family:Georgia,serif;font-size:28px;font-weight:400}.status{border:1px solid var(--line);border-radius:20px;padding:6px 9px;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.status-complete{background:#e7f4eb;color:#24633d}.status-in_progress{background:#fff4d8;color:#7a5313}.status-not_started{background:#efeee9;color:#66716b}.metrics{display:grid;grid-template-columns:repeat(4,1fr);margin:18px 0;border:1px solid var(--line)}.metrics div{min-height:72px;padding:12px;border-right:1px solid var(--line)}.metrics div:last-child{border:0}.metrics strong{display:block;font-size:14px;text-transform:capitalize}.metrics span{display:block;margin-top:5px;color:#78847e;font-size:9px;letter-spacing:.07em;text-transform:uppercase}.authority-links{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 20px}.authority-links a,.authority-links span{border-radius:6px;background:#f3eee3;padding:8px 10px;color:#59665f;font-size:10px;font-weight:700;text-decoration:none}.authority-links a{text-decoration:underline;text-underline-offset:3px}.state-card section{margin-top:20px}.state-card h3{margin:0 0 8px;color:#68746d;font-size:10px;letter-spacing:.1em;text-transform:uppercase}.state-card h3 span{display:inline-grid;place-items:center;min-width:20px;height:20px;margin-left:5px;border-radius:10px;background:var(--cream);color:var(--ink)}.state-card p,.source-list{margin:0;color:#4f5d55;font-size:12px;line-height:1.6}.source-list{padding-left:18px}.source-list li+li{margin-top:7px}.source-list a,.state-card p a{color:#9b421f;overflow-wrap:anywhere;text-underline-offset:3px}.empty{font-style:italic;color:#7a847f!important}.next-step{border-left:3px solid var(--gold);padding:3px 0 3px 14px}.state-card>footer{display:flex;justify-content:space-between;gap:20px;margin-top:22px;padding-top:14px;border-top:1px solid var(--line);color:#78847e;font-size:9px;text-transform:uppercase;letter-spacing:.06em}.page-footer{min-height:90px;padding:25px 7vw;background:#14231c;color:#cbd3ce;display:flex;justify-content:space-between;align-items:center;gap:30px;font-size:11px}.page-footer a{color:#e5b653;text-underline-offset:3px}
    @media(max-width:700px){.topbar{min-height:58px;padding:0 16px}.hero{padding:42px 20px}.hero h1{font-size:42px}.hero p{font-size:13px}.summary{gap:20px}.summary strong{font-size:24px}.controls{top:58px;grid-template-columns:1fr;padding:12px 16px}.content{padding:24px 16px 60px}.state-card{padding:18px}.state-card>header{align-items:flex-start}.state-card h2{font-size:23px}.metrics{grid-template-columns:1fr 1fr}.metrics div:nth-child(2){border-right:0}.metrics div:nth-child(-n+2){border-bottom:1px solid var(--line)}.state-card>footer,.page-footer{align-items:flex-start;flex-direction:column}.page-footer{gap:8px}}
  </style>
</head>
<body>
  <header class="topbar"><a class="brand" href="./"><span class="brand-mark">B</span><span>BID <b>ATLAS</b></span></a><a class="back-link" href="./">← Return to map</a></header>
  <main>
    <section class="hero">
      <p class="kicker">NATIONAL COVERAGE AUDIT</p>
      <h1>What we know—and what remains unresolved.</h1>
      <p>This page exposes the working state audit behind BID Atlas. Known districts and official local sources are included even when a boundary is not yet reliable enough to publish on the map. A blank state is not evidence that no BID exists.</p>
      <div class="summary"><div><strong>${rows.length}</strong><span>states and DC</span></div><div><strong>${researched}</strong><span>research started</span></div><div><strong>${mappedStates}</strong><span>states mapped</span></div><div><strong>${mappedRecords}</strong><span>districts mapped</span></div><div><strong>${knownSources}</strong><span>known source leads</span></div></div>
    </section>
    <section class="controls" aria-label="Coverage audit filters">
      <label>Search states, districts, and notes<input id="coverage-search" type="search" placeholder="Try Idaho, Caldwell, SSA, or statewide registry"></label>
      <label>Audit status<select id="coverage-status"><option value="ALL">All statuses</option><option value="complete">Complete</option><option value="in_progress">In progress</option><option value="not_started">Not started</option></select></label>
      <p class="result-note" id="result-note">Showing all ${rows.length} jurisdictions.</p>
    </section>
    <section class="content">
      <p class="intro">“Known” means the source has been recorded as a research lead or verified input; it does not automatically mean the district is active or its boundary is publishable. Each state card states the current determination and the next human or automated research step.</p>
      <div class="state-list" id="state-list">${stateCards}</div>
    </section>
  </main>
  <footer class="page-footer"><strong>BID ATLAS</strong><span>State audit · Source-led and transparent</span><a href="mailto:alan@fothergill.com">Suggest a district</a></footer>
  <script>
    const search = document.querySelector('#coverage-search');
    const status = document.querySelector('#coverage-status');
    const cards = [...document.querySelectorAll('.state-card')];
    const note = document.querySelector('#result-note');
    function filterCards(){
      const query = search.value.trim().toLowerCase();
      const audit = status.value;
      let visible = 0;
      for(const card of cards){
        const show = (!query || card.dataset.search.includes(query)) && (audit === 'ALL' || card.dataset.audit === audit);
        card.hidden = !show;
        if(show) visible += 1;
      }
      note.textContent = 'Showing ' + visible + ' of ' + cards.length + ' jurisdictions.';
    }
    search.addEventListener('input', filterCards);
    status.addEventListener('change', filterCards);
  </script>
</body>
</html>\n`;

await writeFile("public/coverage.html", html.replace(/^[ \t]+$/gm, ""));
console.log(`Generated public/coverage.html for ${rows.length} jurisdictions.`);
