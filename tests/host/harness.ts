/**
 * A minimal MCP Apps host, for proving the card really works.
 *
 * It uses the official host-side AppBridge, so this is interop with the spec,
 * not with my own idea of it. It loads the card in an iframe exactly as Claude
 * or ChatGPT would, hands it a real tool result, and records everything the
 * card sends back. scripts/verify-card.ts drives it with Playwright.
 */
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";

type Entry = { kind: string; payload: unknown };
const h = { log: [] as Entry[], initialized: false, error: null as string | null };
(window as unknown as { __host: typeof h }).__host = h;

async function main() {
  const q = new URLSearchParams(location.search);
  const theme = (q.get("theme") ?? "light") as "light" | "dark";
  const toolResult = await (await fetch("result.json")).json();

  // Listen before the card loads. A view sends ui/initialize the moment its
  // script runs, so a host that connects after the load event misses it.
  // The WindowProxy survives navigation, so capturing it now is safe.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  document.getElementById("slot")!.appendChild(iframe);
  const view = iframe.contentWindow!;

  const bridge = new AppBridge(null, { name: "pathfinder-harness", version: "0.1.0" }, { openLinks: {}, logging: {} });
  const note = (kind: string) => async (payload: unknown) => {
    h.log.push({ kind, payload });
    return {};
  };
  bridge.onmessage = note("ui/message");
  bridge.onopenlink = note("ui/open-link");
  bridge.onupdatemodelcontext = note("ui/update-model-context");
  bridge.onsizechange = (payload) => h.log.push({ kind: "ui/size-changed", payload });
  bridge.oninitialized = () => {
    h.initialized = true;
  };
  await bridge.connect(new PostMessageTransport(view, view));
  // After connect, before the card loads: the theme has to be in the
  // ui/initialize response or the card paints light and then corrects itself.
  bridge.setHostContext({ theme, displayMode: "inline" });
  iframe.src = q.get("card") ?? "card.html";
  for (let i = 0; i < 200 && !h.initialized; i++) await new Promise((r) => setTimeout(r, 50));
  if (!h.initialized) throw new Error("the card never completed ui/initialize");
  await bridge.sendToolResult(toolResult);
}

main().catch((e) => {
  h.error = String(e);
});
