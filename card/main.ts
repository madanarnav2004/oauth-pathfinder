import { App } from "@modelcontextprotocol/ext-apps";
import { renderGuide } from "../lib/render";
import type { Guide } from "../lib/schema";
import css from "../styles/guide.css";

type Payload = { guide?: Guide; shareUrl?: string; source?: "library" | "live" };

const style = document.createElement("style");
style.textContent = `${css}
html,body{margin:0;background:transparent}
body{font-family:var(--sans);color:var(--ink);padding:18px 20px 22px}
.pf-actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.6rem;padding-top:1rem;border-top:1px solid var(--rule)}
.pf-actions button{font:inherit;font-family:var(--mono);font-size:.75rem;color:var(--ink);background:transparent;border:1px solid var(--ink);border-radius:3px;padding:.4em .8em;cursor:pointer}
.pf-actions button:hover{background:var(--ink);color:var(--paper)}
.pf-actions button.quiet{border-color:var(--rule);color:var(--mute)}
.pf-empty{font-family:var(--mono);font-size:.8rem;color:var(--mute)}`;
document.head.appendChild(style);

const root = document.getElementById("root")!;
root.innerHTML = `<p class="pf-empty">waiting for the agent…</p>`;

const app = new App({ name: "pathfinder-card", version: "0.1.0" });

function applyTheme(theme?: string) {
  if (theme === "dark" || theme === "light") document.documentElement.setAttribute("data-theme", theme);
}

function show(p: Payload) {
  if (!p.guide) return;
  const g = p.guide;
  root.innerHTML = `${renderGuide(g, { compact: true })}
    <div class="pf-actions">
      <button data-act="do">Have my agent do its part</button>
      <button data-act="open" class="quiet">Open full guide</button>
    </div>`;
  root.querySelector<HTMLButtonElement>('[data-act="do"]')!.onclick = () =>
    app.sendMessage({
      role: "user",
      content: [{ type: "text", text: `Run prepare_setup for ${g.name} using this project's real origins, then do every step in the ${g.name} guide marked "agent" and list what's left for me.` }],
    });
  root.querySelector<HTMLButtonElement>('[data-act="open"]')!.onclick = () => {
    if (p.shareUrl) void app.openLink({ url: p.shareUrl });
  };
  void app.updateModelContext({
    content: [{ type: "text", text: `The user is looking at the ${g.name} OAuth guide card (difficulty ${g.difficulty}/5).` }],
  }).catch(() => undefined);
}

app.ontoolresult = (r) => show((r.structuredContent ?? {}) as Payload);
app.onhostcontextchanged = (c) => applyTheme(c.theme);

app.connect().then(() => applyTheme(app.getHostContext()?.theme)).catch(() => {
  root.innerHTML = `<p class="pf-empty">This card needs an MCP Apps host.</p>`;
});
