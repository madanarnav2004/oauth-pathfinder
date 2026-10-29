/** npm run doctor: checks that live generation is wired up before you demo it. */
import { llmFromEnv } from "../lib/llm";
import { searcherFromEnv } from "../lib/search";
import { MODELS } from "../lib/service";

process.loadEnvFile?.(".env.local");
const ok = (m: string) => console.log(`  ok   ${m}`);
const bad = (m: string) => console.log(`  FAIL ${m}`);

const llm = llmFromEnv();
const search = searcherFromEnv();
const models = MODELS();
let failed = 0;

console.log("LLM");
if (!llm) {
  bad("no provider. Set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (or LLM_BASE_URL + LLM_API_KEY).");
  failed++;
} else {
  for (const [role, model] of Object.entries(models)) {
    try {
      const t = Date.now();
      const r = await llm.complete({ model, system: "Reply with the single word: ready", user: "go", maxTokens: 400 });
      ok(`${role.padEnd(8)} ${model} → "${r.trim().slice(0, 30)}" in ${Date.now() - t} ms`);
    } catch (e) {
      bad(`${role} ${model}: ${(e as Error).message.slice(0, 160)}`);
      failed++;
    }
  }
}
console.log("Search");
if (!search) {
  bad("no provider. Set EXA_API_KEY or TAVILY_API_KEY, or SEARCH_PROVIDER=none to read pasted URLs only.");
  failed++;
} else {
  try {
    const r = await search.search("slack api oauth redirect url", 2);
    ok(`${search.name} returned ${r.length} results`);
  } catch (e) {
    bad(`${search.name}: ${(e as Error).message}`);
    failed++;
  }
}
console.log(failed ? `\n${failed} problem(s).` : "\nAll set. Try: npm run dev, then look up an app that isn't in the library.");
process.exit(failed ? 1 : 0);
