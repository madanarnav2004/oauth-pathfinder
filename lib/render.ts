/**
 * One renderer, two surfaces. The website and the MCP App card both call
 * renderGuide(), so what a developer sees in their agent is what the page shows.
 * Pure string output, no DOM, no node imports: it runs on the server and inside
 * the sandboxed card iframe. Guides can come from an LLM, so everything is escaped.
 */
import type { Guide, Status, Step, Source } from "./schema";
import { UNITS, fmtSpan, fmtExact, rulerPos } from "./time";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "#";
  } catch {
    return "#";
  }
}

export const DIFFICULTY = [
  "",
  "hello world",
  "needs a ticket",
  "behind a gate",
  "the gauntlet",
  "legal review",
] as const;

const STATUS_HINT: Record<Status, string> = {
  tested: "We ran it and recorded the response",
  sourced: "A page we fetched says so",
  inferred: "Reasonable reading, not stated outright",
  unknown: "We looked and could not find out",
};

const OWNER: Record<Step["owner"], string> = { agent: "agent", you: "you", provider: "them" };
const KIND: Record<Step["kind"], string> = { do: "do", wait: "wait", gate: "gate" };

export function chip(status: Status): string {
  return `<span class="pf-chip s-${status}" title="${esc(STATUS_HINT[status])}">${status}</span>`;
}

function basis(b: "stated" | "reported" | "inferred"): string {
  const label = b === "stated" ? "stated by provider" : b === "reported" ? "reported by others" : "our estimate";
  return `<span class="pf-basis">${label}</span>`;
}

function dots(n: number): string {
  let out = "";
  for (let i = 1; i <= 5; i++) out += `<i class="${i <= n ? "on" : ""}"></i>`;
  return `<span class="pf-dots" aria-hidden="true">${out}</span>`;
}

function srcLinks(g: Guide, ids: string[]): string {
  const links = ids
    .map((id) => g.sources[id])
    .filter((s): s is Source => Boolean(s))
    .map((s, i) => `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.kind === "probe" ? "probe" : `src ${i + 1}`)}</a>`);
  return links.length ? `<span class="pf-src">${links.join(" ")}</span>` : "";
}

/** The ruler: hands-on and waiting on one log scale. Unknown stays fogged. */
export function renderRuler(g: Guide): string {
  const ticks = UNITS.map(
    (u) =>
      `<span class="tick" style="left:${(rulerPos(u.min) * 100).toFixed(2)}%"><b></b><em>${esc(u.one)}</em></span>`,
  ).join("");
  const bar = (label: string, span: Guide["handsOn"], cls: string) => {
    if (!span) {
      return `<div class="row"><span class="lab">${label}</span><div class="track fog" title="No source gives a number"><span class="fogtext">no source gives a number</span></div></div>`;
    }
    if (span.hi === 0) {
      return `<div class="row"><span class="lab">${label}</span><div class="track" title="None expected"><span class="fogtext">none expected</span></div></div>`;
    }
    const l = rulerPos(Math.max(span.lo, 1)) * 100;
    const r = rulerPos(Math.max(span.hi, span.lo + 1)) * 100;
    const w = Math.max(r - l, 1.2);
    return `<div class="row"><span class="lab">${label}</span><div class="track"><span class="bar ${cls}" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%" title="${esc(fmtExact(span))}"></span></div></div>`;
  };
  return `<figure class="pf-ruler" aria-label="Time ruler">
    <div class="axis">${ticks}</div>
    ${bar("hands-on", g.handsOn, "hands")}
    ${bar("waiting", g.wait, "wait")}
  </figure>`;
}

function spanLine(span: Guide["handsOn"], emptyText: string): string {
  if (!span) return `<span class="pf-fog">${esc(emptyText)}</span>`;
  if (span.hi === 0) return `<strong>none expected</strong> ${basis(span.basis)}`;
  return `<strong title="${esc(fmtExact(span))}">${esc(fmtSpan(span))}</strong> ${basis(span.basis)}`;
}

export function renderAnswer(g: Guide): string {
  return `<dl class="pf-answer">
    <div><dt>difficulty</dt><dd>${dots(g.difficulty)} <strong>${esc(DIFFICULTY[g.difficulty])}</strong></dd></div>
    <div><dt>hands-on</dt><dd>${spanLine(g.handsOn, "unknown")}</dd></div>
    <div><dt>waiting</dt><dd>${spanLine(g.wait, "unknown, no source gives a number")}</dd></div>
    <div><dt>will bite</dt><dd>${esc(g.blocker)}</dd></div>
    <div><dt>handoff</dt><dd>agent: ${esc(g.handoff.agent.length)} things · you: ${esc(g.handoff.you.length)}</dd></div>
  </dl>`;
}

export function renderRoute(g: Guide): string {
  const items = g.steps
    .map((s, i) => {
      const time = s.minutes ? `<span class="t" title="${esc(fmtExact(s.minutes))}">${esc(fmtSpan(s.minutes))}</span>` : `<span class="t fog">?</span>`;
      const fields = s.fields?.length
        ? `<dl class="fields">${s.fields.map((f) => `<div><dt>${esc(f.label)}</dt><dd><code>${esc(f.value)}</code></dd></div>`).join("")}</dl>`
        : "";
      return `<li class="step k-${s.kind} o-${s.owner}">
        <div class="head"><span class="n">${i + 1}</span><h3>${esc(s.title)}</h3>
          <span class="tags"><span class="pf-tag o">${esc(OWNER[s.owner])}</span><span class="pf-tag k">${esc(KIND[s.kind])}</span>${time}</span></div>
        <p>${esc(s.detail)}</p>${fields}
        <div class="foot">${chip(s.status)} ${srcLinks(g, s.src)}</div>
      </li>`;
    })
    .join("");
  return `<ol class="pf-route">${items}</ol>`;
}

export function renderNuances(g: Guide): string {
  if (!g.nuances.length) return "";
  return `<ul class="pf-claims">${g.nuances
    .map((c) => `<li>${chip(c.status)}<div><p>${esc(c.text)}</p>${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}${srcLinks(g, c.src)}</div></li>`)
    .join("")}</ul>`;
}

export function renderBlockers(g: Guide): string {
  if (!g.blockers.length) return "";
  return `<div class="pf-blockers">${g.blockers
    .map(
      (b) => `<details><summary><span class="sym">${esc(b.symptom)}</span>${chip(b.status)}</summary>
        <p><b>why</b> ${esc(b.cause)}</p><p><b>fix</b> ${esc(b.fix)}</p>${srcLinks(g, b.src)}</details>`,
    )
    .join("")}</div>`;
}

export function renderHandoff(g: Guide): string {
  const col = (title: string, items: string[]) =>
    `<div><h4>${title}</h4><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
  return `<div class="pf-handoff">${col("an agent can", g.handoff.agent)}${col("you have to", g.handoff.you)}</div>`;
}

export function countStatuses(g: Guide): Record<Status, number> {
  const out: Record<Status, number> = { tested: 0, sourced: 0, inferred: 0, unknown: 0 };
  for (const s of g.steps) out[s.status]++;
  for (const c of g.nuances) out[c.status]++;
  for (const b of g.blockers) out[b.status]++;
  return out;
}

export function renderEvidence(g: Guide): string {
  const c = countStatuses(g);
  const total = Object.values(c).reduce((a, b) => a + b, 0) || 1;
  const seg = (s: Status) =>
    c[s] ? `<span class="seg s-${s}" style="flex:${c[s]}" title="${c[s]} ${s}"></span>` : "";
  const legend = (["tested", "sourced", "inferred", "unknown"] as Status[])
    .map((s) => `<span>${chip(s)} ${c[s]}</span>`)
    .join("");
  return `<div class="pf-evidence"><div class="bar" role="img" aria-label="${total} claims">${seg("tested")}${seg("sourced")}${seg("inferred")}${seg("unknown")}</div><div class="legend">${legend}</div></div>`;
}

export function renderSources(g: Guide): string {
  const rows = Object.entries(g.sources)
    .map(
      ([, s]) =>
        `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> <span class="pf-basis">${esc(s.kind)} · read ${esc(s.retrieved)}</span>${s.note ? `<span class="note">${esc(s.note)}</span>` : ""}</li>`,
    )
    .join("");
  return `<ul class="pf-sources">${rows}</ul>`;
}

/** The whole guide. `opts.compact` drops sources and long lists for the in-chat card. */
export function renderGuide(g: Guide, opts: { compact?: boolean } = {}): string {
  const head = `<header class="pf-head"><p class="label">${esc(g.label)}</p><h1>${esc(g.name)}</h1><p class="summary">${esc(g.summary)}</p></header>`;
  if (opts.compact) {
    return `<article class="pf-guide compact">${head}${renderAnswer(g)}${renderRuler(g)}<h2>Route</h2>${renderRoute(g)}${renderEvidence(g)}</article>`;
  }
  const gen = g.generated
    ? `<p class="pf-gen">generated live ${esc(g.generated.at)} · ${esc(g.generated.model)}, checked by ${esc(g.generated.verifier)} · searched ${esc(g.generated.searched)}, read ${esc(g.generated.read)}${g.generated.checked !== undefined ? ` · verifier checked ${esc(g.generated.checked)} claims, downgraded ${esc(g.generated.downgraded ?? 0)}` : ""}</p>`
    : "";
  return `<article class="pf-guide">${head}${gen}${renderAnswer(g)}${renderRuler(g)}
    <h2>Route</h2>${renderRoute(g)}
    <h2>Who does what</h2>${renderHandoff(g)}
    ${g.nuances.length ? `<h2>Things that change your plan</h2>${renderNuances(g)}` : ""}
    ${g.blockers.length ? `<h2>If it breaks</h2>${renderBlockers(g)}` : ""}
    <h2>How sure are we</h2>${renderEvidence(g)}
    <h2>Sources</h2>${renderSources(g)}
  </article>`;
}

export function guideToMarkdown(g: Guide): string {
  const span = (s: Guide["handsOn"]) => (s ? `${fmtSpan(s)} (${s.basis})` : "unknown");
  const lines: string[] = [];
  lines.push(`# ${g.name}: OAuth app setup`, "", `> ${g.label}`, "", g.summary, "");
  lines.push(`- difficulty: ${g.difficulty}/5 (${DIFFICULTY[g.difficulty]})`);
  lines.push(`- hands-on: ${span(g.handsOn)}`, `- waiting: ${span(g.wait)}`, `- will bite: ${g.blocker}`, "");
  lines.push("## Route", "");
  g.steps.forEach((s, i) => {
    lines.push(`${i + 1}. **${s.title}** [${OWNER[s.owner]} · ${KIND[s.kind]}${s.minutes ? ` · ${fmtSpan(s.minutes)}` : ""}] \`${s.status}\``);
    lines.push(`   ${s.detail}`);
    s.fields?.forEach((f) => lines.push(`   - ${f.label}: \`${f.value}\``));
  });
  lines.push("", "## An agent can", ...g.handoff.agent.map((x) => `- ${x}`));
  lines.push("", "## You have to", ...g.handoff.you.map((x) => `- ${x}`), "");
  if (g.nuances.length) {
    lines.push("## Things that change your plan", ...g.nuances.map((c) => `- \`${c.status}\` ${c.text}`), "");
  }
  if (g.blockers.length) {
    lines.push("## If it breaks");
    g.blockers.forEach((b) => lines.push(`- **${b.symptom}**: ${b.cause} Fix: ${b.fix}`));
    lines.push("");
  }
  lines.push("## Sources", ...Object.values(g.sources).map((s) => `- [${s.title}](${s.url}) (${s.kind}, read ${s.retrieved})`));
  return lines.join("\n") + "\n";
}
