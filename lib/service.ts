import { generateGuide, PipelineError, type PipelineEvent, type Result } from "./pipeline";
import { llmFromEnv } from "./llm";
import { searcherFromEnv } from "./search";
import { resolveApp } from "./guides";
import { shareUrl } from "./share";
import type { Guide } from "./schema";

export const MODELS = () => ({
  extract: process.env.LLM_MODEL_EXTRACT || "@cf/openai/gpt-oss-120b",
  verify: process.env.LLM_MODEL_VERIFY || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
});

export type Lookup =
  | { kind: "guide"; guide: Guide; library: boolean; shareUrl: string }
  | { kind: "no_oauth"; app: string; reason: string };

export function baseUrl(origin?: string): string {
  return (process.env.PUBLIC_BASE_URL || origin || "http://localhost:3000").replace(/\/$/, "");
}

/** Library first, live agent second. The same path serves the site and the MCP tools. */
export async function lookupGuide(app: string, opts: { origin?: string; docsUrl?: string; live?: boolean; onEvent?: (e: PipelineEvent) => void } = {}): Promise<Lookup> {
  const base = baseUrl(opts.origin);
  const known = resolveApp(app);
  if (known && !opts.docsUrl) return { kind: "guide", guide: known, library: true, shareUrl: shareUrl(base, known, true) };
  if (opts.live === false) throw new PipelineError("no_sources", `${app} isn't in the library.`);
  const r: Result = await generateGuide(
    app,
    { llm: llmFromEnv(), searcher: searcherFromEnv(), models: MODELS(), onEvent: opts.onEvent },
    opts.docsUrl ? [opts.docsUrl] : [],
  );
  if (r.kind === "no_oauth") return r;
  return { kind: "guide", guide: r.guide, library: false, shareUrl: shareUrl(base, r.guide, false) };
}

export function liveConfigured(): { llm: boolean; search: boolean } {
  return { llm: Boolean(llmFromEnv()), search: Boolean(searcherFromEnv()) };
}
