import { describe, expect, it } from "vitest";
import { GUIDES, getGuide, resolveApp, withProbe } from "../lib/guides";
import { fmtSpan, rulerPos, pickUnit } from "../lib/time";
import { renderGuide, renderRoute, esc, guideToMarkdown, countStatuses, verdict, evidenceLine } from "../lib/render";
import { encodeGuide, decodeGuide } from "../lib/share";
import { matchBlocker, blockerReport } from "../lib/blockers";
import { prepareSetup } from "../lib/prepare";
import { assertProbeable, probeEndpoints } from "../lib/probe";
import { Guide } from "../lib/schema";

describe("library", () => {
  it("ships eight validated seeds", () => {
    expect(GUIDES.map((g) => g.slug)).toEqual(["github", "slack", "notion", "discord", "spotify", "linkedin", "google", "meta"]);
  });

  it("never claims 'tested' without a probe record", () => {
    for (const g of GUIDES) {
      expect(countStatuses(g).tested).toBe(0);
    }
  });

  it("every source has an https url and a retrieval date", () => {
    for (const g of GUIDES) {
      for (const s of Object.values(g.sources)) {
        expect(s.url.startsWith("https://")).toBe(true);
        expect(s.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("fogs the wait instead of inventing a number when no source gives one", () => {
    for (const slug of ["slack", "linkedin", "meta", "notion", "discord", "spotify"]) {
      expect(getGuide(slug)!.wait).toBeNull();
    }
  });

  it("only labels a wait 'stated' if an official source says it", () => {
    for (const g of GUIDES) {
      for (const s of [g.handsOn, g.wait, ...g.steps.map((x) => x.minutes)]) {
        if (s?.basis === "stated") throw new Error(`${g.slug} has a stated span; check it has an official source`);
      }
    }
  });

  it("flags outdated or secondary evidence in the source note", () => {
    const google = getGuide("google")!;
    expect(google.sources.g4.kind).toBe("secondary");
    expect(google.sources.g4.note).toMatch(/2021/);
  });
});

describe("resolveApp", () => {
  it("matches names, domains, urls and aliases", () => {
    expect(resolveApp("GitHub")?.slug).toBe("github");
    expect(resolveApp("https://www.slack.com/intl/en")?.slug).toBe("slack");
    expect(resolveApp("gmail")?.slug).toBe("google");
    expect(resolveApp("instagram")?.slug).toBe("meta");
    expect(resolveApp("developers.facebook.com")?.slug).toBe("meta");
    expect(resolveApp("api.linkedin.com")?.slug).toBe("linkedin");
  });
  it("returns null for unknown apps so the live agent takes over", () => {
    expect(resolveApp("linear.app")).toBeNull();
    expect(resolveApp("")).toBeNull();
  });
});

describe("time units", () => {
  it("speaks in developer units", () => {
    expect(fmtSpan({ lo: 30, hi: 60 })).toBe("1–2 coffees");
    expect(fmtSpan({ lo: 120, hi: 240 })).toBe("4–8 coffees");
    expect(fmtSpan({ lo: 7 * 1440, hi: 14 * 1440 })).toBe("7–14 days");
    expect(fmtSpan({ lo: 20160, hi: 60480 })).toBe("1–3 sprints");
    expect(fmtSpan({ lo: 129600, hi: 129600 })).toBe("~1 quarter");
    expect(fmtSpan({ lo: 1, hi: 3 })).toBe("< 1 commit");
    expect(fmtSpan({ lo: 5, hi: 10 })).toBe("1–2 commits");
  });
  it("picks the largest unit that fits the low end", () => {
    expect(pickUnit(179).id).toBe("coffee");
    expect(pickUnit(180).id).toBe("lunch");
  });
  it("ruler positions are monotonic and in range", () => {
    expect(rulerPos(1)).toBe(0);
    expect(rulerPos(60)).toBeLessThan(rulerPos(1440));
    expect(rulerPos(1e9)).toBeLessThanOrEqual(1);
  });
});

describe("rendering", () => {
  it("escapes everything an LLM could put in a guide", () => {
    const g = structuredClone(getGuide("github")!);
    g.name = `<img src=x onerror=alert(1)>`;
    g.steps[0].detail = `</p><script>alert(1)</script>`;
    g.sources.gh1.url = "javascript:alert(1)";
    // the schema rejects non-URLs; the renderer must still neutralize anything that slips through
    const html = renderGuide(g as unknown as Guide);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('href="javascript:');
    expect(esc(`"'<>&`)).toBe("&quot;&#39;&lt;&gt;&amp;");
  });
  it("renders the five-line answer, ruler and route", () => {
    const html = renderGuide(getGuide("google")!);
    expect(html).toContain("pf-verdict");
    expect(html).toContain("pf-strip");
    expect(html).toContain("pf-route");
    expect(html).toContain("the gauntlet");
  });
  it("shows fog, not a number, when the wait is unknown", () => {
    expect(renderGuide(getGuide("meta")!)).toContain("a wait nobody documents");
  });
  it("says 'none expected' for providers with no review", () => {
    expect(renderGuide(getGuide("github")!)).toContain("no review to wait for");
  });
  it("badges only the exceptions, never the default", () => {
    // Google's route is entirely sourced, so nothing in it should carry a badge.
    const google = getGuide("google")!;
    expect(renderRoute(google)).not.toContain("pf-flag");
    // GitHub has one step we could not source, and that one is called out.
    const github = getGuide("github")!;
    const route = renderRoute(github);
    expect(route).toContain("our read");
    expect((route.match(/pf-flag/g) ?? []).length).toBe(github.steps.filter((s) => s.status !== "sourced").length);
    // An unanswered question says so rather than going unmarked.
    expect(renderGuide(getGuide("spotify")!)).toContain("not documented");
  });

  it("names the provider you are waiting on instead of saying 'them'", () => {
    const html = renderRoute(getGuide("google")!);
    expect(html).toContain("Google · ");
    expect(html).not.toContain("them ·");
  });

  it("exports markdown", () => {
    const md = guideToMarkdown(getGuide("slack")!);
    expect(md).toContain("# Slack: OAuth app setup");
    expect(md).toContain("## Sources");
  });

  it("answers in a sentence before it answers in numbers", () => {
    expect(verdict(getGuide("github")!)).toMatch(/nobody reviews it/i);
    // A guide with no hand-written verdict still gets a readable one.
    const bare = { ...getGuide("google")!, verdict: undefined };
    expect(verdict(bare)).toBe("Half a day of setup, then months of waiting.");
  });

  it("summarises evidence as a sentence, with counts that add up", () => {
    const g = getGuide("google")!;
    const line = evidenceLine(g);
    const total = Object.values(countStatuses(g)).reduce((a, b) => a + b, 0);
    expect(line).toContain(`Of ${total} claims`);
    expect(line).toContain("could not answer");
  });
});

describe("share links", () => {
  it("round-trips a guide through a URL-safe token", () => {
    const g = getGuide("notion")!;
    const token = encodeGuide(g);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeLessThan(9000);
    expect(decodeGuide(token)).toEqual(g);
  });
  it("rejects tampered or junk tokens", () => {
    expect(decodeGuide("not-a-token")).toBeNull();
    expect(decodeGuide(encodeGuide(getGuide("slack")!).slice(0, 40))).toBeNull();
  });
});

describe("report_blocker", () => {
  it("matches on error codes", () => {
    const g = getGuide("slack")!;
    expect(matchBlocker(g, "I keep getting bad_redirect_uri when I exchange the code")?.blocker.symptom).toBe("bad_redirect_uri");
    expect(matchBlocker(getGuide("linkedin")!, "401 Redirect_uri doesn't match")?.blocker.symptom).toMatch(/401/);
  });
  it("admits when it doesn't know instead of improvising", () => {
    const r = blockerReport(getGuide("github")!, "my cat sat on the keyboard");
    expect(r.matched).toBe(false);
    expect(r.matched ? 0 : r.collect.length).toBeGreaterThan(2);
  });
});

describe("prepare_setup", () => {
  it("warns when one callback per app collides with multiple environments", () => {
    const r = prepareSetup(getGuide("github")!, { origins: ["http://localhost:3000", "https://app.example.com"] });
    expect(r.warnings.join(" ")).toMatch(/one app per environment/i);
    expect(r.env).toContain("GITHUB_CLIENT_ID=");
  });
  it("flags http callbacks for providers that require https", () => {
    const r = prepareSetup(getGuide("slack")!, { origins: ["http://localhost:3000"] });
    expect(r.redirectUris[0].note).toMatch(/requires HTTPS/);
  });
  it("marks gated scopes and drafts a justification skeleton, never invented prose", () => {
    const r = prepareSetup(getGuide("google")!, { scopes: ["https://www.googleapis.com/auth/gmail.readonly", "openid email profile"] });
    expect(r.scopes[0].gated).toBe(true);
    expect(r.scopes[1].gated).toBe(false);
    expect(r.justificationDraft).toContain("<what the user does with it>");
  });
});

describe("probes", () => {
  it("refuses private and odd targets", () => {
    for (const bad of ["http://github.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://[::1]/x", "https://intranet/x", "https://foo.internal/x", "https://github.com:8443/x"]) {
      expect(() => assertProbeable(bad)).toThrow();
    }
    expect(() => assertProbeable("https://github.com/login/oauth/access_token")).not.toThrow();
  });
  it("records status and error code only, with a fake fetch", async () => {
    const f = (async (_u: URL | string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ error: "invalid_client", error_description: "secret stuff" }), { status: 401 })
        : new Response(null, { status: 302, headers: { location: "https://slack.com/signin?x=1" } })) as typeof fetch;
    const out = await probeEndpoints({ authorizeUrl: "https://slack.com/oauth/v2/authorize", tokenUrl: "https://slack.com/api/oauth.v2.access" }, f);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ method: "GET", status: 302, location: "slack.com/signin" });
    expect(out[1]).toMatchObject({ method: "POST", status: 401, error: "invalid_client" });
    expect(JSON.stringify(out)).not.toContain("secret stuff");
  });
  it("folds probe records into 'tested' claims", () => {
    const g = withProbe(getGuide("slack")!, {
      checkedAt: "2026-10-29T10:00:00Z",
      results: [{ name: "token", url: "https://slack.com/api/oauth.v2.access", method: "POST", status: 200, error: "invalid_client_id", location: null, ms: 120 }],
    });
    expect(countStatuses(g).tested).toBe(1);
    expect(Guide.safeParse(g).success).toBe(true);
  });
});
