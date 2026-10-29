# path/finder

How hard is it to get an OAuth app approved? Type an app, get a guide you can follow and share. Works as a website and as an MCP server, so your coding agent can answer it without you opening a browser.

Built for the Composio APM (Integrations) take-home.

## What it does

- **Library**: eight apps checked by hand against their own docs: GitHub, Slack, Notion, Discord, Spotify, LinkedIn, Google, Meta. Chosen to be different: one with no review at all, one where the cliff is a user cap, two where approval is a business process.
- **Live generation**: type any other app. An agent searches, reads the provider's docs, drafts a guide, checks every quote against the page, probes the OAuth endpoints with dummy credentials, and has a second model verify. The result lives in the link, so there's no database and nothing to expire.
- **MCP server** at `/mcp`: `render_guide_card`, `get_oauth_guide`, `generate_oauth_guide`, `prepare_setup`, `report_blocker`. In hosts that render MCP Apps the card shows inline. Elsewhere the same tool returns text.

Every guide answers five things first: difficulty, hands-on time, waiting time, what will bite, and who does what. Then the route, step by step, each step marked as yours, the agent's, or the provider's.

## The decision I care about most

Every claim carries one of four statuses:

| status | means |
|---|---|
| `tested` | we ran something and recorded the response |
| `sourced` | a page we fetched says so, linked |
| `inferred` | a reasonable reading, nobody states it |
| `unknown` | we looked and couldn't find out |

Time estimates follow the same rule. If no source gives a wait, the ruler shows fog and the guide says "unknown". Most providers publish no review timeline, so a confident "2 to 4 weeks" would be invented. Hands-on time is a separate number from waiting time, because "an hour of work and three weeks of waiting" is a different plan from "three weeks of work".

For live guides this is enforced in code, not left to the model: a `sourced` claim needs a verbatim quote that actually appears in a fetched page, or it's downgraded to `inferred`. `tested` can only come from the probe module. Durations without a source are dropped. See `lib/pipeline.ts` and `tests/pipeline.test.ts`.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000, library and MCP work with no keys
npm test             # 46 tests
```

Probe results are committed in `data/probes.json` and can be refreshed with `npm run probe`.

For live generation, copy `.env.example` to `.env.local` and fill in:

```
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=      # Workers AI, free tier
EXA_API_KEY=               # or TAVILY_API_KEY with SEARCH_PROVIDER=tavily
```

Then `npm run doctor` checks both models and the search key before you demo. `npm run eval` regenerates each library guide live and compares it with the hand-checked one.

**Deploy**: it's a plain Next.js app. `vercel` from this folder, add the env vars, done. Live generation can run past a minute, so it relies on Vercel's longer function limits.

**Use it in an agent** (replace the host):

```bash
claude mcp add --transport http pathfinder https://YOUR-HOST/mcp
```

Other clients are on the `/agent` page.

## How it's put together

```
lib/schema.ts     the evidence model (Zod)
lib/render.ts     one renderer: the site and the MCP card both use it
lib/pipeline.ts   search → read → extract → quote-check → probe → verify
lib/probe.ts      credential-free endpoint checks, the only source of "tested"
lib/mcp.ts        the five tools and the ui:// card resource
data/guides/      the eight hand-checked guides, with sources
card/             the in-chat card, bundled into a single HTML file
```

The card is one HTML string (`lib/card-html.generated.ts`, built by `npm run card`) because MCP Apps hosts run it in a sandboxed iframe with no network.

## Limits, honestly

- **I didn't register any OAuth apps.** That means creating accounts and passing identity checks, which an agent shouldn't do for you. What it can do: read, probe public endpoints, and prepare everything you paste in (`prepare_setup`). The guides say which steps are yours.
- Tested claims come from credential-free probes of each provider's authorize and token endpoints (dummy client, no real credentials), run on 2026-10-29. They show the endpoint answers and how it errors, nothing about approval.
- **Some pages wouldn't open or didn't answer**: Spotify's 2026 developer-access announcement, LinkedIn's Page-verification help article, Discord's verification process, and Meta's review timelines. Those are `unknown` or `inferred`, and `/how-we-checked` lists them along with what was corrected along the way.
- **Docs change.** Every source has the date I read it. Past a quarter, re-check.
- **Live generation quality depends on the model and on what search finds.** The quote-check and verifier catch unsupported claims, not missing ones. `npm run eval` is how to measure that.
- **Eight apps, not a hundred.** The library format is the point; the live path is how it scales to the rest.

## Not built, on purpose

Accounts, saved guides, a dashboard, comments. A guide is a link. If it's wrong, the fix is in the data file and a pull request.
