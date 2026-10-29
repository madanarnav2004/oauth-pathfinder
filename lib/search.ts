/**
 * Search is a plug. Exa first (best at finding docs pages, returns page text),
 * Tavily as the free-tier fallback, Jina Reader to read a page we only have a URL for.
 */
export type Doc = { url: string; title: string; text: string };
export type Searcher = { name: string; search(query: string, n: number): Promise<Doc[]> };

type Env = Record<string, string | undefined>;
const MAX_CHARS = 6000;

export function searcherFromEnv(env: Env = process.env, f: typeof fetch = fetch): Searcher | null {
  const pick = (env.SEARCH_PROVIDER ?? "exa").toLowerCase();
  if (pick === "none") return null;
  if (pick === "tavily" && env.TAVILY_API_KEY) return tavily(env.TAVILY_API_KEY, f);
  if (env.EXA_API_KEY && pick !== "tavily") return exa(env.EXA_API_KEY, f);
  if (env.TAVILY_API_KEY) return tavily(env.TAVILY_API_KEY, f);
  return null;
}

export function exa(key: string, f: typeof fetch = fetch): Searcher {
  return {
    name: "exa",
    async search(query, n) {
      const res = await f("https://api.exa.ai/search", {
        method: "POST",
        headers: { "x-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ query, numResults: n, type: "auto", contents: { text: { maxCharacters: MAX_CHARS } } }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`exa ${res.status}`);
      const j = (await res.json()) as { results?: { url: string; title?: string; text?: string }[] };
      return (j.results ?? []).map((r) => ({ url: r.url, title: r.title ?? r.url, text: (r.text ?? "").slice(0, MAX_CHARS) }));
    },
  };
}

export function tavily(key: string, f: typeof fetch = fetch): Searcher {
  return {
    name: "tavily",
    async search(query, n) {
      const res = await f("https://api.tavily.com/search", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ query, max_results: n, search_depth: "advanced", include_raw_content: false }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`tavily ${res.status}`);
      const j = (await res.json()) as { results?: { url: string; title?: string; content?: string }[] };
      return (j.results ?? []).map((r) => ({ url: r.url, title: r.title ?? r.url, text: (r.content ?? "").slice(0, MAX_CHARS) }));
    },
  };
}

/** Read one page as text through Jina Reader. Used when search only gave us a snippet. */
export async function readPage(url: string, f: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await f(`https://r.jina.ai/${url}`, { headers: { accept: "text/plain" }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    return (await res.text()).slice(0, MAX_CHARS);
  } catch {
    return null;
  }
}

const SKIP_HOSTS = ["reddit.com", "quora.com", "medium.com", "youtube.com", "pinterest.", "facebook.com/groups"];

export function usable(d: Doc): boolean {
  if (!/^https:\/\//.test(d.url)) return false;
  return !SKIP_HOSTS.some((h) => d.url.includes(h)) && d.text.trim().length > 200;
}
