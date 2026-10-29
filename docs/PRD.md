# path/finder: product notes

**Problem.** A developer building an agent integration needs a provider OAuth app and can't tell whether that is an hour or a quarter, or what will block approval.

**Decision 1: the agent is the product.** Whoever asks this question is already in Claude Code, Codex or Cursor. So the primary surface is an MCP server with an in-chat card; the website is the share target and the front door for people who arrive by link.

**Decision 2: answer in a sentence, then in numbers.** "Half a day of setup, then weeks in a verification queue." The numbers follow; the route follows that. Every step names who owns it — you, an agent, or the provider by name.

**Decision 3: refuse to invent numbers.** Four evidence statuses. When no source gives a wait, the bar runs off the edge and the guide says so. Setup time and waiting time are never added together.

**Decision 4: mark only the exception.** Sourced is the baseline and carries a citation, not a badge. A badge means "this one is different." An earlier draft badged every row; it looked rigorous and said nothing.

**Decision 5: code guards the evidence, not the model.** Quote-check against the fetched page, probe-only "we ran this", source-or-null durations, a second model family as verifier.

**Decision 6: a guide is a link.** Generated guides are encoded into the URL. No database, no accounts, nothing to expire or migrate.

**Scope.** Eight seeds spanning the difficulty range, chosen to be unlike each other: no review at all, a user cap, a business process. Live generation for everything else. Out of scope: registering apps on a developer's behalf, accounts, change alerts.

**Success looks like** a developer closing the guide with a plan and a number they can defend, or an honest "nobody documents this" and the name of who to ask.

**Next.** A re-check job that flags guides whose sources moved; a shared library the live agent contributes back to by pull request; `prepare_setup` driving a browser to the provider console with the form filled, stopping at the sign-in.
