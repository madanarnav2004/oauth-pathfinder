# path/finder: product notes

**Problem.** A developer building an agent integration needs a provider OAuth app, and doesn't know whether that's an hour or a quarter, or what will block approval.

**Decision 1: answer first.** Five lines before any prose: difficulty, hands-on, waiting, what will bite, handoff. The route follows, with an owner on every step (you, the agent, the provider).

**Decision 2: refuse to invent numbers.** Four evidence statuses. Waits without a source render as fog. Hands-on and waiting are separate.

**Decision 3: the agent is the interface.** Developers already work in Claude Code, Codex or Cursor, so the primary surface is an MCP server with an in-chat card (MCP Apps). The website is a thin front door and the share target.

**Decision 4: guides are links.** Generated guides are encoded in the URL. No database, no accounts, nothing to expire.

**Decision 5: code guards the evidence, not the model.** Quote-check, probe-only `tested`, source-or-null durations, a second model family as verifier.

**Scope.** Eight seeds spanning the difficulty range. Live generation for the rest. Out of scope: registering apps on a developer's behalf, accounts, alerts when docs change.

**Success looks like:** a developer finishes reading with a plan and a number they can trust, or an honest "unknown" and who to ask.

**Next:** re-check cron that flags guides whose sources changed; provider-specific probes for token lifetime; a shared library of verified guides the live agent can write back to via PR.
