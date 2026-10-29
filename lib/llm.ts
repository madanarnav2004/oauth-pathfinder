/**
 * One thin adapter, two ways in.
 *  1. Cloudflare Workers AI (default): OpenAI-compatible chat endpoint, free tier.
 *  2. Anything else that speaks the OpenAI chat format: set LLM_BASE_URL + LLM_API_KEY.
 * The pipeline never imports a vendor SDK. It asks for text and parses JSON itself.
 */
export type CompleteOpts = { model: string; system: string; user: string; maxTokens?: number };
export type LLM = {
  name: string;
  complete(o: CompleteOpts): Promise<string>;
};

type Env = Record<string, string | undefined>;

export function llmFromEnv(env: Env = process.env, f: typeof fetch = fetch): LLM | null {
  const cfId = env.CLOUDFLARE_ACCOUNT_ID;
  const cfToken = env.CLOUDFLARE_API_TOKEN;
  const base = env.LLM_BASE_URL;
  const key = env.LLM_API_KEY;
  let url: string;
  let token: string;
  let name: string;
  if (cfId && cfToken) {
    url = `https://api.cloudflare.com/client/v4/accounts/${cfId}/ai/v1/chat/completions`;
    token = cfToken;
    name = "cloudflare-workers-ai";
  } else if (base && key) {
    url = `${base.replace(/\/$/, "")}/chat/completions`;
    token = key;
    name = "openai-compatible";
  } else {
    return null;
  }
  return {
    name,
    async complete({ model, system, user, maxTokens = 6000 }) {
      const res = await f(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.1,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(100_000),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        throw new Error(`LLM ${res.status}: ${detail}`);
      }
      const j = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
      const text = j.choices?.[0]?.message?.content;
      if (!text) throw new Error("LLM returned no content (reasoning may have used the whole token budget)");
      return text;
    },
  };
}

/** Pull the first balanced JSON object out of a reply that may be wrapped in prose or fences. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON object in reply");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error("unterminated JSON object");
}
