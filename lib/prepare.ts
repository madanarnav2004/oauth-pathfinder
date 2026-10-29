import type { Guide } from "./schema";

export type PrepareInput = {
  appName?: string;
  /** Origins your app runs on, e.g. http://localhost:3000 and https://app.example.com */
  origins?: string[];
  callbackPath?: string;
  /** Scopes you think you need. We say which ones are gated. */
  scopes?: string[];
};

export function prepareSetup(g: Guide, input: PrepareInput = {}) {
  const origins = (input.origins?.length ? input.origins : ["http://localhost:3000"]).map((o) => o.replace(/\/$/, ""));
  const path = input.callbackPath ?? `/api/auth/callback/${g.slug}`;
  const r = g.prepare.redirect;
  const warnings: string[] = [];

  const redirectUris = origins.map((o) => {
    const uri = `${o}${path}`;
    const insecure = o.startsWith("http://");
    const loopback = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
    let note = "ok";
    if (insecure && r.https === "required") note = loopback ? "HTTP. This provider requires HTTPS, so use a tunnel for local testing." : "HTTP. This provider requires HTTPS.";
    else if (insecure && r.https === "unknown") note = "HTTP. We don't know if this provider allows it. Check before you rely on it.";
    return { uri, note };
  });

  if (r.maxUris === 1 && redirectUris.length > 1) {
    warnings.push(`${g.name} allows ${r.maxUris} callback URL per app. Create one app per environment and register one URI in each.`);
  }
  if (r.https === "unknown" || r.exactMatch === "unknown") {
    warnings.push("Redirect matching rules weren't confirmed in our sources. Test each URI before launch.");
  }

  const p = g.prepare.envPrefix;
  const env = [`${p}_CLIENT_ID=`, `${p}_CLIENT_SECRET=`, `${p}_REDIRECT_URI=${redirectUris[0]?.uri ?? ""}`].join("\n");

  const requested = input.scopes ?? [];
  const scopeReport = requested.map((s) => {
    const hit = g.prepare.scopes.find((k) => k.name.toLowerCase().split(/[\s,]+/).some((w) => w && s.toLowerCase().includes(w)) || s.toLowerCase().includes(k.name.toLowerCase()));
    if (!hit) return { scope: s, gated: null as boolean | null, note: "Not in our table. Check the provider's scope list." };
    return { scope: s, gated: hit.gated, note: hit.note };
  });
  const gated = scopeReport.filter((s) => s.gated === true);
  if (gated.length) warnings.push(`${gated.map((s) => s.scope).join(", ")} ${gated.length > 1 ? "are" : "is"} gated. See the submission list below.`);

  const justification = gated.length
    ? gated
        .map((s) => `### ${s.scope}\nWe request this to <what the user does with it>. Without it, <what breaks>. We store <what> for <how long> and delete it when <condition>.`)
        .join("\n\n")
    : null;

  const yourSteps = g.steps.filter((s) => s.owner === "you").map((s) => s.title);
  const agentSteps = g.steps.filter((s) => s.owner === "agent").map((s) => s.title);

  return {
    app: g.name,
    appName: input.appName ?? "<your app name>",
    console: g.prepare.consoleUrl ?? null,
    register: {
      "Application name": input.appName ?? "<your app name>",
      "Homepage URL": origins[origins.length - 1] ?? "",
      "Redirect URIs": redirectUris.map((x) => x.uri),
    },
    redirectUris,
    redirectRule: r.rule,
    env,
    scopes: scopeReport,
    submission: g.prepare.submission,
    justificationDraft: justification,
    agentDoesNow: agentSteps,
    youDoNext: yourSteps,
    warnings,
  };
}
