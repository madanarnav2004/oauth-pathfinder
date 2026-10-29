import { McpServer } from "@modelcontextprotocol/server";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { GUIDES, resolveApp } from "./guides";
import { guideToMarkdown, DIFFICULTY } from "./render";
import { fmtSpan } from "./time";
import { prepareSetup } from "./prepare";
import { blockerReport } from "./blockers";
import { lookupGuide, baseUrl } from "./service";
import { PipelineError } from "./pipeline";
import { CARD_HTML } from "./card-html.generated";
import type { Guide } from "./schema";

export const CARD_URI = "ui://pathfinder/card/v1.html";

const known = () => GUIDES.map((g) => g.name).join(", ");

function headline(g: Guide): string {
  const span = (s: Guide["handsOn"]) => (s ? (s.hi === 0 ? "none expected" : fmtSpan(s)) : "unknown");
  return `${g.name}: ${DIFFICULTY[g.difficulty]} (${g.difficulty}/5). Hands-on ${span(g.handsOn)}. Waiting ${span(g.wait)}. Will bite: ${g.blocker}`;
}

function text(t: string, extra: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text: t }], ...extra };
}
function fail(t: string) {
  return { content: [{ type: "text" as const, text: t }], isError: true };
}

async function resolveOrGenerate(app: string, origin: string | undefined, docsUrl?: string) {
  try {
    return await lookupGuide(app, { origin, docsUrl });
  } catch (e) {
    if (e instanceof PipelineError) return e;
    throw e;
  }
}

export function buildServer(origin?: string): McpServer {
  const server = new McpServer({ name: "pathfinder", version: "0.1.0" });

  registerAppResource(
    server,
    "Pathfinder guide card",
    CARD_URI,
    { description: "Interactive OAuth setup guide: answer, ruler, route, evidence." },
    async () => ({
      contents: [{ uri: CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: CARD_HTML, _meta: { ui: { prefersBorder: false } } }],
    }),
  );

  server.registerTool(
    "get_oauth_guide",
    {
      title: "Get OAuth setup guide",
      description: `Look up how hard it is to create and get approved an OAuth app for a provider, from the verified library (${known()}). Returns difficulty, hands-on time, waiting time, the ordered route with who does each step (agent / you / provider), gates, and how sure we are of each claim. If the app is not in the library, use generate_oauth_guide. In a client that can render UI, prefer render_guide_card.`,
      inputSchema: z.object({ app: z.string().min(1).describe("App name or website, e.g. 'slack' or 'slack.com'") }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ app }) => {
      const g = resolveApp(app);
      if (!g) return text(`"${app}" isn't in the library (${known()}). Call generate_oauth_guide to have an agent research it live.`);
      return text(guideToMarkdown(g), { structuredContent: { guide: g, shareUrl: `${baseUrl(origin)}/g/${g.slug}`, source: "library" } });
    },
  );

  server.registerTool(
    "generate_oauth_guide",
    {
      title: "Research an app and generate its OAuth guide",
      description:
        "For an app NOT in the library: search the web, read the provider's docs, draft a guide, quote-check every sourced claim, probe the OAuth endpoints with dummy credentials, and verify with a second model. Takes 30 to 90 seconds. Returns the guide and a shareable link. Durations the sources don't state stay unknown.",
      inputSchema: z.object({
        app: z.string().min(1).describe("App name or website"),
        docsUrl: z.string().url().optional().describe("Optional: the provider's developer docs URL, if you know it"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ app, docsUrl }) => {
      const r = await resolveOrGenerate(app, origin, docsUrl);
      if (r instanceof PipelineError) return fail(r.message);
      if (r.kind === "no_oauth") return text(`${r.app} doesn't appear to offer OAuth to third-party developers. ${r.reason}`);
      return text(`${guideToMarkdown(r.guide)}\nShare: ${r.shareUrl}\n`, { structuredContent: { guide: r.guide, shareUrl: r.shareUrl, source: r.library ? "library" : "live" } });
    },
  );

  registerAppTool(
    server,
    "render_guide_card",
    {
      title: "Show the OAuth setup guide as a card",
      description:
        "Show a visual OAuth setup guide for an app: five-line answer (difficulty, hands-on, waiting, what will bite, handoff), a time ruler, and the route. Use this when the user asks how hard it is to get an OAuth app set up or approved for a provider, in a client that renders UI. Handles library apps instantly and unknown apps by researching them live.",
      inputSchema: z.object({ app: z.string().min(1).describe("App name or website"), docsUrl: z.string().url().optional() }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { resourceUri: CARD_URI } },
    },
    async ({ app, docsUrl }) => {
      const r = await resolveOrGenerate(app, origin, docsUrl);
      if (r instanceof PipelineError) return fail(r.message);
      if (r.kind === "no_oauth") return text(`${r.app} doesn't appear to offer OAuth to third-party developers. ${r.reason}`);
      return text(`${headline(r.guide)}\n\nThe card shows the full route. Full guide: ${r.shareUrl}\n\n${guideToMarkdown(r.guide)}`, {
        structuredContent: { guide: r.guide, shareUrl: r.shareUrl, source: r.library ? "library" : "live" },
      });
    },
  );

  server.registerTool(
    "prepare_setup",
    {
      title: "Prepare the setup for this project",
      description:
        "Given an app and where the project runs, produce exactly what to register with the provider: redirect URIs per environment, env var names, which requested scopes are gated, a justification skeleton for gated scopes, and the split between what the agent does now and what the human must do. Deterministic; nothing is invented.",
      inputSchema: z.object({
        app: z.string().min(1),
        appName: z.string().optional().describe("The name of the developer's app"),
        origins: z.array(z.string().url()).optional().describe("Origins the app runs on, e.g. ['http://localhost:3000','https://app.example.com']"),
        callbackPath: z.string().optional().describe("Callback route, default /api/auth/callback/<app>"),
        scopes: z.array(z.string()).optional().describe("Scopes the developer thinks they need"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ app, ...input }) => {
      const g = resolveApp(app);
      if (!g) return fail(`"${app}" isn't in the library. Run generate_oauth_guide first.`);
      const plan = prepareSetup(g, input);
      return text(JSON.stringify(plan, null, 2), { structuredContent: { plan } });
    },
  );

  server.registerTool(
    "report_blocker",
    {
      title: "Diagnose a blocker",
      description: "The developer hit an error or got stuck during OAuth setup. Matches it to the known failure modes for that provider and returns cause and fix, or says plainly that it doesn't know and lists what to collect.",
      inputSchema: z.object({ app: z.string().min(1), symptom: z.string().min(3).describe("Exact error string or what happened") }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ app, symptom }) => {
      const g = resolveApp(app);
      if (!g) return fail(`"${app}" isn't in the library. Run generate_oauth_guide first.`);
      const report = blockerReport(g, symptom);
      return text(JSON.stringify(report, null, 2), { structuredContent: { report } });
    },
  );

  return server;
}
