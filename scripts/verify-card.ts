/**
 * npm run verify:card
 *
 * End-to-end proof that the MCP App card works in a host, not just in theory:
 *
 *   next start  →  POST /mcp (initialize, tools/list, resources/read, tools/call)
 *               →  card HTML + a real tool result
 *               →  loaded in a browser through the official AppBridge
 *               →  click the card's buttons, assert what the host receives
 *
 * Screenshots land in tests/host/shots/. Exits non-zero if anything is off.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { build } from "esbuild";

/**
 * Playwright isn't a dependency: it's 300 MB and only this script wants it.
 * Loaded at runtime, so the surface it needs is described here rather than imported.
 */
type Loc = { first(): Loc; waitFor(o: { timeout: number }): Promise<void>; innerText(): Promise<string>; click(): Promise<void>; count(): Promise<number> };
type Page = {
  on(e: "pageerror", cb: (err: Error) => void): void;
  on(e: "console", cb: (m: { type(): string; text(): string; location(): { url: string; lineNumber: number } }) => void): void;
  goto(url: string): Promise<unknown>;
  frameLocator(sel: string): { locator(sel: string): Loc };
  evaluate<T>(fn: () => T): Promise<T>;
  screenshot(o: { path: string }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
};
type Ctx = { newPage(): Promise<Page>; close(): Promise<void> };
type Browser = { newContext(o: { viewport: { width: number; height: number }; colorScheme: string }): Promise<Ctx>; close(): Promise<void> };

async function getChromium(): Promise<{ launch(): Promise<Browser> }> {
  try {
    const { createRequire } = await import("node:module");
    return createRequire(import.meta.url)("playwright").chromium;
  } catch {
    console.error("\nThis script needs Playwright:\n  npm i -D playwright && npx playwright install chromium\n");
    process.exit(1);
  }
}

const APP_PORT = 3399;
const HOST_PORT = 3400;
const DIR = "tests/host/.work";
const SHOTS = "tests/host/shots";
const base = `http://127.0.0.1:${APP_PORT}`;

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

async function rpc(method: string, params: unknown, id = Math.floor(Math.random() * 1e6)) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const raw = await res.text();
  const body = raw.includes("data:") ? raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop()! : raw;
  const j = JSON.parse(body);
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

async function waitFor(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`${url} never came up`);
}

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };

async function main() {
  mkdirSync(DIR, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });

  console.log("MCP server");
  const app: ChildProcess = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { stdio: "ignore", detached: true });
  const stop = () => {
    try {
      process.kill(-app.pid!, "SIGKILL");
    } catch {
      /* already gone */
    }
  };
  process.on("exit", stop);

  try {
    await waitFor(base, 60_000);
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify", version: "0" } });
    check(init.serverInfo?.name === "pathfinder", "initialize", init.serverInfo?.name);

    const { tools } = await rpc("tools/list", {});
    const card = tools.find((t: { name: string }) => t.name === "render_guide_card");
    const uri = card?._meta?.ui?.resourceUri;
    check(Boolean(uri), "render_guide_card declares a ui:// resource", uri);
    check(
      tools.filter((t: { _meta?: { ui?: unknown } }) => t._meta?.ui).length === 1,
      "exactly one tool carries UI",
      `${tools.length} tools total`,
    );

    const resource = await rpc("resources/read", { uri });
    const html: string = resource.contents[0].text;
    check(resource.contents[0].mimeType === "text/html;profile=mcp-app", "resource mime type", resource.contents[0].mimeType);
    check(!/<(script|link)[^>]+(src|href)=/i.test(html), "card is self-contained", `${(html.length / 1024) | 0} KB`);

    const call = await rpc("tools/call", { name: "render_guide_card", arguments: { app: "google" } });
    check(call.structuredContent?.guide?.slug === "google", "tools/call returned a guide");

    writeFileSync(join(DIR, "card.html"), html);
    writeFileSync(join(DIR, "result.json"), JSON.stringify(call));
    writeFileSync(join(DIR, "harness.html"), `<!doctype html><meta charset="utf-8"><title>host</title><style>html,body{margin:0;background:#8a8a8a}#slot{max-width:720px;margin:0 auto}iframe{width:100%;height:1400px;border:0;display:block;background:#fff}</style><div id="slot"></div><script type="module" src="harness.js"></script>`);
    await build({ entryPoints: ["tests/host/harness.ts"], outfile: join(DIR, "harness.js"), bundle: true, format: "esm", target: "es2022", platform: "browser", logLevel: "silent" });

    const files = createServer((req, res) => {
      const name = (req.url ?? "/").split("?")[0].replace(/^\//, "") || "harness.html";
      try {
        const body = readFileSync(join(DIR, name));
        res.writeHead(200, { "content-type": TYPES[extname(name)] ?? "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    }).listen(HOST_PORT);

    console.log("\nBrowser host");
    const browser = await (await getChromium()).launch();
    for (const theme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({ viewport: { width: 760, height: 1100 }, colorScheme: theme });
      const page = await ctx.newPage();
      const problems: string[] = [];
      page.on("pageerror", (e) => problems.push(String(e)));
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const l = m.location();
        problems.push(`${m.text()} @ ${l.url.split("/").pop()}:${l.lineNumber}`);
      });
      await page.goto(`http://127.0.0.1:${HOST_PORT}/harness.html?theme=${theme}`);

      const frame = page.frameLocator("iframe");
      try {
        await frame.locator("h1").first().waitFor({ timeout: 20_000 });
      } catch (e) {
        const state = await page.evaluate(() => JSON.stringify((window as never as { __host: unknown }).__host));
        console.error(`\n  host state: ${state}\n  page errors: ${problems.join(" | ") || "none"}`);
        throw e;
      }
      const heading = await frame.locator("h1").first().innerText();
      check(heading.trim() === "Google", `[${theme}] card rendered the guide`, heading.trim());
      check(await page.evaluate(() => (window as never as { __host: { initialized: boolean } }).__host.initialized), `[${theme}] ui/initialize handshake completed`);

      const body = await frame.locator("body").innerText();
      check(body.includes("the gauntlet"), `[${theme}] the answer is on the card`);
      check(/claims in this guide/.test(body), `[${theme}] the evidence summary survived the bundle`);
      const steps = await frame.locator(".pf-route .step").count();
      check(steps === call.structuredContent.guide.steps.length, `[${theme}] every route step rendered`, `${steps} steps`);

      await page.screenshot({ path: `${SHOTS}/card-${theme}.png` });

      if (theme === "light") {
        await frame.locator('[data-act="do"]').click();
        await frame.locator('[data-act="open"]').click();
        await page.waitForTimeout(600);
        const log = (await page.evaluate(() => (window as never as { __host: { log: { kind: string; payload: unknown }[] } }).__host.log)) as { kind: string; payload: { content?: { text: string }[]; url?: string } }[];
        const kinds = log.map((l) => l.kind);
        const msg = log.find((l) => l.kind === "ui/message");
        const link = log.find((l) => l.kind === "ui/open-link");
        check(kinds.includes("ui/update-model-context"), "card told the model what the user is looking at");
        check(Boolean(msg?.payload.content?.[0].text?.includes("prepare_setup")), "'do its part' asks the agent to run prepare_setup");
        check(link?.payload.url?.includes("/g/google") === true, "'open full guide' opens the share link", link?.payload.url);
      }
      check(problems.length === 0, `[${theme}] no console errors`, problems.slice(0, 2).join(" | "));
      await ctx.close();
    }
    await browser.close();
    files.close();
  } finally {
    stop();
  }

  console.log(failures ? `\n${failures} check(s) failed.` : `\nAll checks passed. Screenshots in ${SHOTS}/.`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
