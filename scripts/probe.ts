/**
 * npm run probe
 * Hits each library provider's authorize and token endpoints with a dummy client and
 * records status codes. No credentials are sent. Results land in data/probes.json and
 * turn matching claims from 'inferred' into 'tested' on the site.
 */
import { writeFileSync } from "node:fs";
import { GUIDES } from "../lib/guides";
import { probeEndpoints } from "../lib/probe";

const out: Record<string, unknown> = {};
for (const g of GUIDES) {
  const results = await probeEndpoints(g.prepare);
  console.log(`${g.slug.padEnd(9)} ${results.length ? results.map((r) => `${r.name} ${r.status}${r.error ? ` ${r.error}` : ""}`).join("  |  ") : "unreachable from here"}`);
  if (results.length) out[g.slug] = { checkedAt: new Date().toISOString(), results };
}
writeFileSync("data/probes.json", JSON.stringify(out, null, 2) + "\n");
console.log(`\n${Object.keys(out).length}/${GUIDES.length} providers answered. Saved to data/probes.json.`);
