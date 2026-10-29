/**
 * npm run eval
 * Holds out each hand-checked library guide, regenerates it live, and compares.
 * This is how we measure the agent against our own verified work: does it find the same
 * gates, land within one difficulty point, and refuse to invent a wait when we did?
 * Needs live keys. Writes data/eval.json.
 */
import { writeFileSync } from "node:fs";
import { GUIDES } from "../lib/guides";
import { generateGuide } from "../lib/pipeline";
import { llmFromEnv } from "../lib/llm";
import { searcherFromEnv } from "../lib/search";
import { MODELS } from "../lib/service";

process.loadEnvFile?.(".env.local");
const llm = llmFromEnv();
const searcher = searcherFromEnv();
if (!llm || !searcher) {
  console.error("eval needs live keys. Run `npm run doctor` first.");
  process.exit(1);
}
const only = process.argv.slice(2);
const rows: Record<string, unknown>[] = [];

for (const ref of GUIDES.filter((g) => !only.length || only.includes(g.slug))) {
  process.stdout.write(`${ref.slug.padEnd(9)} `);
  try {
    const r = await generateGuide(ref.name.split(" (")[0], { llm, searcher, models: MODELS() });
    if (r.kind !== "guide") {
      console.log("no_oauth (unexpected)");
      continue;
    }
    const g = r.guide;
    const gates = (x: typeof ref) => x.steps.filter((s) => s.kind === "gate").length;
    const row = {
      app: ref.slug,
      difficulty: { ref: ref.difficulty, gen: g.difficulty, within1: Math.abs(ref.difficulty - g.difficulty) <= 1 },
      gates: { ref: gates(ref), gen: gates(g) },
      waitFogAgrees: (ref.wait === null) === (g.wait === null),
      officialSources: Object.values(g.sources).filter((s) => s.kind === "official").length,
      downgraded: g.generated?.downgraded ?? 0,
      checked: g.generated?.checked ?? 0,
    };
    rows.push(row);
    console.log(`diff ${row.difficulty.ref}→${row.difficulty.gen}  gates ${row.gates.ref}→${row.gates.gen}  fog ${row.waitFogAgrees ? "agrees" : "differs"}  official ${row.officialSources}  downgraded ${row.downgraded}/${row.checked}`);
  } catch (e) {
    console.log(`error: ${(e as Error).message.slice(0, 120)}`);
  }
}
writeFileSync("data/eval.json", JSON.stringify({ ranAt: new Date().toISOString(), rows }, null, 2) + "\n");
const n = rows.length || 1;
console.log(`\nwithin one difficulty point: ${rows.filter((r) => (r.difficulty as { within1: boolean }).within1).length}/${n}`);
console.log(`wait fog agrees:             ${rows.filter((r) => r.waitFogAgrees).length}/${n}`);
