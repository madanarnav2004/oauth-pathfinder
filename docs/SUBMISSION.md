# path/finder: submission notes

Live: https://oauth-pathfinder-topaz.vercel.app
Repo: https://github.com/madanarnav2004/oauth-pathfinder
MCP endpoint: https://oauth-pathfinder-topaz.vercel.app/mcp

![Google guide rendered inline in Codex](img/codex-inline-card.png)

*Google's guide, drawn inside a Codex chat after one sentence of prompt. That's the product.*

---

## The problem I picked

"How do I set up OAuth for X" is not a hard question. "How hard will it be, and where will I get stuck" is, and it's the one a developer or PM needs answered before committing to an integration. Provider docs answer the first. Nobody answers the second well: the real answer is spread across a console, a policy page, a verification form and a forum thread from 2021.

So I built for the second question. Each guide opens with one sentence ("Half a day of setup, then weeks in a verification queue") and the rest of the page exists to back it up.

## Decision 1: the agent is the product, the website is the receipt

The person asking this is already in Claude Code, Codex or Cursor. Sending them to a docs site means they leave, read, translate, and come back. It also means the guide is trapped on a page, when an agent could act on it.

So the primary surface is an MCP server, with a card that renders inside the chat. The website is there so an answer can be a link in Slack and so a reviewer has something to click. I held it to that job: a lookup box, a library, nothing else. No accounts, no dashboard.

Rejected: a chat UI of my own. It would have been the most impressive demo and the wrong product.

## Decision 2: the answer is a sentence, then numbers

An early version led with a difficulty score and a table of chips. It looked rigorous and told you nothing in the first five seconds. Now every guide leads with a plain sentence a PM could repeat in a meeting, then one bar that splits setup time from waiting time.

Those two are always separate on purpose. For Google, setup is a sliver and the review is the rest. That ratio is the finding; a single "2 to 4 weeks" would hide it.

## Decision 3: say "nobody documents this" instead of guessing

Most providers publish no review timeline. The tempting, useful-looking move is to write "typically 2 to 4 weeks." It would be the most quotable line in the product and I'd have no source for it.

So when no source gives a wait, the guide says so and the bar runs off the edge. Most of the library is like this, and I think that's the honest picture of the problem. A PM who learns "this provider won't tell you" has learned something real about the risk.

## Decision 4: mark the exceptions, never the default

Every claim has one of four statuses: sourced, we ran this, our read, not documented. First draft: a badge on every row. It looked careful and was noise, because nearly every row got the same badge.

Now only the exceptions get one. Sourced is the baseline, so it gets a numbered citation and nothing else. If you see a badge, that row is different, and you should look at it. This is the same instinct as a good code review: comment on what's odd.

## Decision 5: enforce honesty in code, not in the prompt

For live generation I don't ask the model to be careful. The pipeline checks:

- a "sourced" claim needs a verbatim quote that actually appears in a page we fetched, or it's downgraded
- a second model from a different family checks the quote really supports the claim
- only the probe module can produce "we ran this"
- a duration with no source behind it is dropped, not rounded

There are tests that feed a deliberately lying model into the pipeline and assert the lies don't survive. If this were going to production, that's the part I'd protect most.

## Decision 6: draw the line at registering apps

I didn't create any OAuth apps. That means making accounts and passing identity checks, and I don't think an agent should do that for you. What it can do: read the docs, probe public endpoints with dummy credentials, work out your redirect URIs and scope gating, draft the justification skeleton. What you do: sign in and submit.

Every guide marks each step as yours, the agent's, or the provider's by name, so "who is blocking me" is answerable at a glance. That boundary is the honest answer to what an agent can do here, and it's also the pitch for where a platform like Composio sits.

## What I'd measure if this were real

- **Did the answer change the decision?** The real metric. A guide that makes someone drop a provider or start the verification process a month earlier is worth more than a hundred views.
- **Live generation accuracy** against the hand-checked guides. `npm run eval` holds each one out, regenerates it, and compares. It's how I'd decide which providers are safe to serve unreviewed.
- **How often the wait is "not documented."** That's the gap I'd go after next, probably by asking developers who've been through it.

## What I verified

- 50 automated tests, including the lying-model ones.
- The card runs in the official MCP Apps reference host (`npm run verify:card`: handshake, a real tool result, both buttons clicked, light and dark) and by hand in Codex, shown above.
- All sixteen provider endpoints probed with a dummy client. Those responses are the "we ran this" claims.
- Each guide checked against the provider's own docs. `/how-we-checked` lists every correction. Three worth naming: Google's "verification requirements" page turned out to cover only annual recertification, so I re-sourced it. Google's docs also say that asking only for `openid email profile` skips the test-user list, the warning screen and the 7-day expiry, which most apps should know. And Notion looks fully self-serve until the authorization page mentions a review it never describes, so that's marked not documented rather than guessed.

## What's not done, plainly

- Eight hand-checked apps, not a hundred. The format is the point; live generation covers the rest.
- Not yet verified inside Claude's own clients, only the reference host and Codex.
- A few pages wouldn't open for me: Spotify's 2026 developer-access announcement, LinkedIn's Page-verification article, Discord's verification threshold, Meta's review timelines. They're marked, not filled in.
- Live generation is only as good as what search finds. The quote check catches unsupported claims, not missing ones.
- On small phones the install command box clips the command.

## If I kept going

1. A re-check job that flags guides whose sources changed since they were read.
2. A shared library the live agent can contribute to by pull request, so the hand-checked set grows from real lookups.
3. `prepare_setup` going one step further: open the provider's console with the form pre-filled and stop at the sign-in.
