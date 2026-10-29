# path/finder

**How hard is it to get an OAuth app approved?** Ask your agent, not a webpage.

Almost everyone who needs this answer is already sitting in Claude Code, Codex or Cursor when the question comes up. So this is an MCP server first. The website exists so the answer can be a link you paste into Slack.

```bash
claude mcp add --transport http pathfinder https://oauth-pathfinder-topaz.vercel.app/mcp
```

Then ask it in plain words: *"how hard is it to get a Slack OAuth app approved?"* In Claude and other hosts that support MCP Apps, the answer draws itself in the conversation. Everywhere else the same call returns the same guide as text.

Live: **https://oauth-pathfinder-topaz.vercel.app** · Built for the Composio APM (Integrations) take-home.

![Pathfinder Google OAuth guide displayed as an inline card in a Codex chat](docs/img/codex-inline-card.png)

*Pathfinder’s Google guide rendered inline in Codex after the prompt shown in the chat.*

The [reference-host screenshot](docs/img/card.png) is captured by `npm run verify:card`.

## What your agent gets

| tool | what it does |
|---|---|
| `render_guide_card` | The guide as a card, inline in the chat. The primary surface. |
| `get_oauth_guide` | The same guide as text, for the eight apps checked by hand. |
| `generate_oauth_guide` | Anything else. Researches it live, in about a minute. |
| `prepare_setup` | Redirect URIs per environment, env var names, which scopes are gated. What to paste into the provider's console. |
| `report_blocker` | Paste the error. Cause and fix if we know it, what to collect if we don't. |

Every guide opens with the answer in one sentence — *"Half a day of setup, then weeks in a verification queue. Touch Gmail and it's an annual paid security assessment on top."* — then the route, with every step marked as yours, the agent's, or the provider's.

## The decision I care about most

Guides like this are worth nothing if you can't tell which parts are real. So every claim carries one of four statuses:

- **sourced** — a page we fetched says so, linked and dated
- **we ran this** — we called the endpoint and recorded what came back
- **our read** — a reasonable reading, nobody states it outright
- **not documented** — we looked and could not find out

The interface shows only the last three. Sourced is the baseline, and badging the baseline on every row is noise; a badge means *this one is different*. Everything unbadged has a numbered citation under it.

Time follows the same rule. **If no source gives a wait, the guide says so and the bar runs off the edge** rather than showing an invented number. Most providers publish no review timeline, so this is most of the library. Setup time and waiting time are always separate numbers, because "an hour of work and three weeks of waiting" is a different plan from "three weeks of work".

For live generation this is enforced in code, not trusted to the model:

- a `sourced` claim needs a verbatim quote that really appears in a page we fetched, or it is downgraded
- a second model from a different family then checks that the quote supports the claim
- only `lib/probe.ts` can produce `we ran this`
- a duration with no source behind it is dropped, not rounded

See `lib/pipeline.ts` and `tests/pipeline.test.ts`.

## Run it

```bash
npm install
npm run dev     # localhost:3000 — the library, the website and /mcp work with no keys
npm test        # 50 tests
```

Live generation needs two keys. Copy `.env.example` to `.env.local`:

```
CLOUDFLARE_ACCOUNT_ID=      # Workers AI, free tier
CLOUDFLARE_API_TOKEN=
EXA_API_KEY=                # or TAVILY_API_KEY with SEARCH_PROVIDER=tavily
```

`npm run doctor` checks both models and the search key before you demo anything.

Deploying is plain Next.js: `vercel`, add the env vars, done. Live generation can run past a minute, so it needs a platform that allows longer function durations.

## How I checked it works

| | |
|---|---|
| `npm test` | 50 tests. The interesting ones feed a lying model into the pipeline and assert its unsupported claims get downgraded. |
| `npm run verify:card` | Loads the card in a real browser through the official MCP Apps `AppBridge`, completes the handshake, sends a real tool result, clicks both buttons and asserts what the host receives. Screenshots to `tests/host/shots/`. |
| `npm run probe` | Calls all sixteen provider endpoints with a dummy client and records the answers. |
| `npm run eval` | Holds out each hand-checked guide, regenerates it live, and compares difficulty, gates and whether it refused to invent a wait. |

`/how-we-checked` lists what was corrected while writing the guides, and what could not be confirmed.

## Limits, honestly

- **I registered no OAuth apps.** That means creating accounts and passing identity checks, which an agent should not do on your behalf. What it can do is read, probe public endpoints with dummy credentials, and prepare everything you paste in. Each guide says which steps are yours.
- **Probes prove an endpoint answers and how it errors — nothing about approval.** No real credentials are ever sent.
- **The card was verified against the reference `AppBridge` host**, not inside Claude's or ChatGPT's own clients. It follows the 2026-01-26 MCP Apps spec and degrades to text where the host has no UI support.
- **Some pages would not open or did not answer**: Spotify's 2026 developer-access announcement, LinkedIn's Page-verification article, Discord's verification process, Meta's review timelines. Those are marked rather than filled in.
- **Docs change.** Every source carries the date it was read.
- **Live generation is only as good as what search finds.** The quote check catches unsupported claims, not missing ones. `npm run eval` is how to measure that.
- **Eight apps, not a hundred.** The format is the point; the live path is how it reaches the rest.

## Layout

```
lib/pipeline.ts   search → read → extract → quote-check → probe → verify
lib/render.ts     one renderer; the website and the card both call it
lib/probe.ts      credential-free endpoint checks, the only source of "we ran this"
lib/mcp.ts        the five tools and the ui:// card resource
card/             the in-chat card, bundled to a single self-contained HTML file
data/guides/      the eight hand-checked guides, with sources
```

## Not built, deliberately

Accounts, saved guides, a dashboard, comments. A guide is a link. If one is wrong, the fix is a pull request against a JSON file.
