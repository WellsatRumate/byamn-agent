# How BYAMN Was Made

A ~7 hour build (across 2 days) of an AI outreach agent that researches targets, maps org charts, discovers personal emails from git commits, talks to chatbots, and sends itself to the people it found.

---

## Day 0: The Idea

The KPMG Canada AI Builder (Senior Consultant) job description says: *"Build, test, and harden agents, plugins, skills, and tools."* So instead of writing a cover letter about building agents, we built one. The agent IS the application.

The starting point was [career-ops](https://github.com/santifer/career-ops), an open-source AI-powered job search pipeline with 45K+ stars. We forked it, stripped it to its skeleton (modes/, config/, templates/, fonts/), and rebuilt the internals for outreach instead of job evaluation. The career-ops scaffolding gave us the mode system, the pipeline tracker pattern, and the Claude Code convention. Everything else is original.

---

## Day 1: The Build Sprint (~4 hours)

### Scaffolding

Created the directory structure from the build spec:
- `modes/` — agent system prompts (recon, strategy, draft, send, browse, campaign)
- `playbooks/` — site navigation context for LinkedIn, Twitter, Instagram, career portals
- `scripts/` — data pipelines and execution tools
- `targets/` — target list with the initial 7 KPMG contacts
- `config/` — profile, Gmail OAuth, IG credentials
- `data/` — campaign tracker

Wrote `CLAUDE.md` as the brain — Claude Code reads this on session start and knows the entire system. Modes are markdown files that act as system prompts for each agent role.

### Gmail API + First Send

Set up Gmail OAuth (`scripts/send-gmail.mjs`). OAuth2 flow with token storage, send-only scope. Every outgoing message gets the agent signature appended:

```
---
This message was researched, drafted, and sent by BYAMN, an AI outreach agent
purpose-built by Wells Mensah. The agent is the application.
```

First test email sent to `[TEST-EMAIL-REDACTED]`. Gmail API confirmed working.

### Browser Automation

Built `scripts/browse.mjs` — Playwright wrapper for LinkedIn connects, Twitter DMs, form fills, and comments. Headed mode (visible browser) for screen recording. Persistent browser context preserves login sessions across runs.

Later added `agent-browser` (Vercel's Rust CLI) as a second browser tool. Decision logic baked into `playbooks/browser-routing.md`:
- **Playwright** for known workflows with tested selectors (LinkedIn, Twitter)
- **agent-browser** for unknown/dynamic pages (chatbots, new portals) — snapshot-driven, ref-based, adaptive

### Instagram OSINT

Added [Osintgram](https://github.com/Datalux/Osintgram) as a GPL-3 quarantined git submodule at `tools/osintgram/`. Built `scripts/osint-ig.mjs` as a thin Node.js wrapper that shells out to the Python tool and parses output to JSON.

**What worked:** The submodule architecture kept GPL-3 quarantined from the MIT-licensed main repo. The wrapper mapped Osintgram's interactive shell commands to a clean CLI: `recon`, `network`, `comments`, `tagged`, `discover`.

**What didn't work:** Osintgram's underlying `instagram_private_api` library is v1.6.0 from 2020. Instagram has deprecated that API version. Every attempt returned `checkpoint_required` or `bad_password`. The tool is effectively dead upstream.

**The workaround:** Apify's Instagram scraper works instead. But for the KPMG campaign, Instagram outreach is tagged `[MANUAL]` — Wells sends personally. The playbook (`playbooks/instagram.md`) has DM templates, timing rules, and engagement cadence for manual execution.

### Apify Integration

Installed `apify-client` and built `scripts/apify-recon.mjs` to scrape LinkedIn, Twitter, and Instagram via Apify actors.

**LinkedIn scraper journey:**
1. Started with `dev_fusion/linkedin-profile-scraper` — blocked API calls on free plan
2. Switched to `harvestapi/linkedin-profile-search` — worked, but needed the right input schema (`searchQuery` + `currentCompanies` + `profileScraperMode: "Full + email search"`)
3. Cost: ~$0.11 per profile scrape. Returns full experience history, education, certifications, connections count, about section. Never returns personal email.

**Twitter scraper:** `apidojo/twitter-scraper-lite` — blocks API access on free plan. Returns demo/placeholder data. Cost $0.40 per run for nothing useful. We stopped using it.

**Instagram scraper:** `apify/instagram-scraper` — works on free tier but returns minimal data. Low priority since IG outreach is manual.

### The Architecture Evolution

The system went through 6 versions in 2 days:

**v1:** Single `research.mjs` calling Claude API for everything.

**v2:** Split into 3 agent scripts (`research.mjs`, `strategy.mjs`, `draft.mjs`), each with its own system prompt from its mode file. Strategy + Draft could run in parallel.

**v3:** Added Apify scrapers to `apify-recon.mjs` alongside Claude API synthesis, YouTube discovery, and email dorking — all in one script.

**v4: The refactor that changed everything.** Removed all Claude API calls from scripts. Claude Code IS the LLM — why call yourself through an API? Scripts became pure data pipelines (scrape → save JSON → exit). All reasoning happens inline in Claude Code. Removed `@anthropic-ai/sdk` dependency entirely.

**v5:** Added Deep Recon as the 5th agent. Target discovery, connection mapping, org chart tracing. Flat target list → network graph.

**v6:** Added the Obsidian vault as institutional memory. Every search, finding, and decision logged with `[[wikilinks]]` for cross-referencing.

---

## Day 2: Deep Recon (~3 hours) — Where It Got Interesting

### YouTube Channel Scraping: The Highest-Yield Source

When searching for Adnaan Khan's social presence, we found his YouTube channel (`@KhanTheAdnaan`). The channel page HTML contains linked social accounts — Twitter, Instagram, Facebook — embedded in the page source. A single `fetch()` + regex extracted his entire social graph for $0.

**The lesson:** YouTube About pages are the single highest-yield source for cross-platform handle discovery. People link their real accounts there. Always check.

### History-Based Cross-Referencing: The Core Differentiator

Standard scrapers find current profiles. Deep recon searches where people USED to be. For every school and past employer on a target's LinkedIn, we search `"{name}" "{institution}"`. Old portfolios, student pages, conference bios, and university directories leak emails and handles that current profiles don't.

People scrub their current profiles but forget about the landing page they made during a Concordia engineering course in 2023.

### The Email Discovery That Almost Went Wrong

The first email we found for Adnaan Khan was `[WRONG-EMAIL-REDACTED]` from a getlandingsite.com page. We added it as "confirmed, high confidence."

Then we challenged it:
- The page had a placeholder phone number (`+1 234 567 890`) — template data
- The email appeared NOWHERE else on the internet
- 5 independent verification searches returned zero corroboration
- `[WRONG-EMAIL-REDACTED]` is a very common name pattern — likely taken by someone else years ago

**The breakthrough wasn't finding the email. It was finding the RIGHT email.**

Through his portfolio site (`adnaan-khan-portfolio.netlify.app`), we found his GitHub link in the footer — `github.com/adukhan98`. Note: this is a DIFFERENT slug than his LinkedIn (`adnaankhan98`). The portfolio linked to his real active GitHub, not the vanity registration.

We searched 34 repos, checking commit history starting from the oldest. In `COENProject` (a Concordia COEN course project from March 2023), we found: `[PERSONAL-EMAIL-REDACTED]` — a real `git config user.email` he typed into his terminal before he learned to use noreply addresses.

**The lesson:** Old repos leak real emails. Always check the oldest commits first. And never assume the LinkedIn slug matches the GitHub handle — check the portfolio for the actual link.

We also found a `username@MachineName.local` artifact in newer commits and initially overcalled this as corroboration. It's not — every Mac auto-generates that pattern from the username. It's a git config artifact, not an email address. We learned to filter `.local` addresses as noise.

### Landing Page Brute-Force: What Search Engines Miss

Google doesn't reliably index free landing page platforms — getlandingsite.com, carrd.co, notion.site use subdomain-based hosting that search engines treat as low-authority. The page exists but Google can't find it.

We built `probe-pages` — a command that constructs URLs from name variants × 12 platforms and HEAD-requests each one. For Adnaan Khan, it found 9 live pages including the getlandingsite.com page that started the whole email investigation. For every other target, it found Notion and Bento pages that turned out to be generic platform defaults (false positives we learned to filter by content length and page content).

### Org Chart Mapping: The Network Behind the Role

The original target list was 7 people — names Wells already knew. Deep recon turned it into 12 by mapping the org chart around the AI Lab.

**How we mapped it:**

1. **Searched for the conversation around the role**, not the role itself. `KPMG "AI Lab" "AI Builder" hiring site:linkedin.com` surfaced people who posted about or discussed the hiring. Nobody puts "AI Builder" as their LinkedIn title — you have to search for the discussion.

2. **Found Robert Mill** — AI Solutions Consultant at KPMG. Not in the original target list. Discovered via web search. His personal site (`bertomill.ca`) had a live chatbot (Claude Agent SDK), a newsletter (2K+ subscribers), and full contact info. **Then we discovered he'd left KPMG ~3 weeks earlier** for Aucctus AI. His site hadn't been updated. That meant an open seat.

3. **Found a second departure** — Hamza Malik, also left the AI Lab team (founded hamz.ai). Two open seats, not one. That changed the campaign framing entirely.

4. **Traced upward via TheOrg.com and press releases.** KPMG's AI Lab launch announcement named Stephanie Terrill (Canadian Managing Partner, Digital & Transformation, 370 reports) and Walter Pela (AI Client & Market Dev Lead). Andrew Forde's appointment press release confirmed Stephanie Terrill announced him. Reporting lines emerged.

5. **Found the recruiter gap.** The Digital & Technology Talent Attraction Leader (Rob Jessop) left KPMG for Google. His replacement hasn't been publicly identified. The recruiter for the AI Builder role may not exist. This became the sharpest angle for recruiter outreach — show the reasoning, ask to be routed.

The final org chart:
```
Stephanie Terrill (Managing Partner, Digital & Transformation — THE FINAL BOSS)
  ├── Andrew Forde (Head of AI Research — appointed March 2026)
  ├── Gary Filan (Partner, AI Country Lead)
  ├── Chitra Sridhar (Partner, Data Analytics & AI CoE Lead)
  │   ├── Adnaan Khan (Senior Consultant, AI Lab)
  │   ├── Arthur Mitchell (Software Engineer, Gen AI — Montreal)
  │   └── Rue Sriharsha (Senior Consultant, Trusted AI)
  │
  │   DEPARTED:
  │   ├── Robert Mill (→ Aucctus AI, ~May 2026)
  │   └── Hamza Malik (→ hamz.ai)
  │
  └── Recruiter gap (Rob Jessop → Google)
      ├── Lise Burke (Talent Attraction, GTA Audit — likely covering)
      └── Heera Shah (Talent Attraction, Tax & Law — different practice)
```

### Agent-to-Agent Outreach: The Demo Moment

Robert Mill's personal site has a live Claude Agent SDK chatbot. We used `agent-browser` to navigate to the site, take a pre-interaction screenshot, type a question ("Who leads the AI Lab team at KPMG Canada?"), and watch the chatbot trigger a web search. The response hung — the chatbot tried to search but never rendered the answer.

That's still useful:
1. **Confirmed the chatbot is real** — Claude Agent SDK with web search
2. **Found a bug** — feedback Robert would want as a builder
3. **Created the demo moment** — an AI agent talking to another AI agent, with screenshots as proof
4. **Established an intake vector** — future outreach can go through the chatbot

All chatbot interactions are logged in `vault/recon/agent-to-agent-log.md` with Obsidian `![[image embeds]]` for before/after screenshots.

### The Recruiter Reasoning Chain

We discovered that showing recruiters HOW the agent found them is more compelling than the pitch itself. Lise Burke recruits for GTA Audit, not Digital & Transformation. Heera Shah recruits for Tax & Law. Neither is the obvious recruiter for the AI Builder role.

The agent's message explains the reasoning: "I mapped KPMG's talent attraction team, identified that the Digital & Technology recruiter role (formerly Rob Jessop) is in transition, and you're the GTA-based Talent Attraction Manager most likely covering the gap."

The reasoning chain IS the proof of competency. It demonstrates the same analytical capability the AI Builder role requires — before they even read the resume.

### Rue Sriharsha: The Best Deep Recon Chain

Rue's email discovery chain shows the full deep recon methodology working:
1. LinkedIn scrape → Senior Consultant, Trusted AI, KPMG
2. Web search → Devpost profile found (`rue-glitch`)
3. Devpost → GitHub link (`github.com/rue-glitch`), Twitter (`@rue_glitch`), portfolio link
4. GitHub → 37 repos, checked commit history oldest-first
5. Git commits → `[PERSONAL-EMAIL-REDACTED]` found across 4 repos (Lexicon_Site_Hosting, LSA-Hosting, LSA-Railway, COG403_Final_Project)
6. Also found: `[UNI-EMAIL-REDACTED]` from CSC384 repo

One path (Devpost) unlocked her entire digital footprint. That's history-based cross-referencing at work.

---

## Tools We Built, Added, Removed, and Tweaked

### Built
| Tool | What It Does | Status |
|------|-------------|--------|
| `scripts/apify-recon.mjs` | LinkedIn/Twitter/IG scraping via Apify actors | Active — Twitter scraper disabled (cost, no value) |
| `scripts/deep-recon.mjs` | 7 commands: entities, extract, add-target, connections, vectors, org-map, probe-pages | Active — core of the intelligence pipeline |
| `scripts/send-gmail.mjs` | Gmail API sender with OAuth2 + agent signature | Active |
| `scripts/browse.mjs` | Playwright browser automation, 8 action types including agent-chat | Active |
| `scripts/osint-ig.mjs` | Osintgram wrapper (Python → JSON) | Built but non-functional (upstream library dead) |
| `scripts/scrub.mjs` | Sanitize repo for public sharing (417 redactions across 25 files) | Active |

### Added (external)
| Tool | Why Added | Status |
|------|----------|--------|
| `agent-browser` (Vercel) | Adaptive browser control for unknown pages — snapshot → ref → interact | Active |
| `apify-client` | LinkedIn/Twitter/IG scraping | Active (LinkedIn only — Twitter disabled) |
| Osintgram (submodule) | Instagram OSINT | Non-functional — `instagram_private_api` too old |
| `googleapis` | Gmail API | Active |
| `playwright` | Browser automation | Active |

### Removed
| Tool | Why Removed |
|------|------------|
| `@anthropic-ai/sdk` | Claude Code IS the LLM — calling yourself via API is redundant and adds cost |
| `research.mjs` | Replaced by inline Claude Code reasoning |
| `strategy.mjs` | Replaced by inline Claude Code reasoning |
| `draft.mjs` | Replaced by inline Claude Code reasoning |
| DuckDuckGo Lite (programmatic) | CAPTCHA blocks all requests |
| Google Search (programmatic) | Returns consent redirect page |

### Tweaked
| Tool | What Changed | Why |
|------|-------------|-----|
| `apify-recon.mjs` | Removed Claude API synthesis, YouTube discovery, email dorking | All moved to inline Claude Code |
| `deep-recon.mjs` | Added probe-pages, org-map, vectors | Pipeline expanded as methodology grew |
| LinkedIn scraper actor | `dev_fusion` → `harvestapi` | dev_fusion blocked free-tier API |
| Twitter scraper | Disabled entirely | $0.40/run for demo data — not worth it |
| `browse.mjs` | Added agent-chat action | For chatbot interaction via Playwright |
| `.gitignore` | Unignored drafts/ for private repo | Needed to track outreach messages |

---

## What Didn't Work

| Approach | Why It Failed | Workaround |
|----------|--------------|------------|
| Osintgram for Instagram OSINT | `instagram_private_api` v1.6.0 deprecated by Instagram | Apify scraper or manual recon |
| DuckDuckGo Lite for scripted search | CAPTCHA ("select all squares containing a duck") | Claude Code's built-in web search |
| Google Search from Node.js | Returns consent/redirect page, not results | Claude Code's built-in web search |
| LinkedIn HTTP fetch | Always returns 999 | Apify scraper or web search fallback |
| Twitter scraper (Apify free tier) | Returns demo data or blocks API | Disabled — not worth the cost |
| `[WRONG-EMAIL-REDACTED]` as verified email | Single unreliable source, placeholder page data | Git commit extraction found the real email |
| macOS `.local` git emails as signal | Every Mac generates these automatically | Filtered as noise in the pipeline |
| Notion/Bento probe-pages | Return 200 for any subdomain (generic pages) | Filter by content — generic pages are ~17K chars with platform boilerplate |

---

## What Worked Better Than Expected

1. **YouTube channel page scraping** — one fetch, entire social graph, $0
2. **Git commit email extraction** — oldest repos leak real emails that no scraper finds
3. **Portfolio → GitHub chain** — LinkedIn slug ≠ GitHub handle. Portfolio links to the real one.
4. **Press release mining for org charts** — launch announcements always name the leader
5. **TheOrg.com** — free org chart data with reporting lines
6. **"Conversation around the role" search** — finds people who DISCUSS the hiring, not the job posting
7. **Recruiter gap analysis** — knowing the recruiter left is more valuable than knowing who the recruiter is
8. **Agent-to-agent chatbot interaction** — works for recon AND as an attention-getter
9. **Newsletter subscribe → reply-to** — welcome email reply-to is often a personal inbox
10. **ZoomInfo search result snippets** — confirm corporate email patterns without paying for the full listing

---

## The Numbers

| Metric | Value |
|--------|-------|
| Targets in original list | 7 |
| Targets after deep recon | 12 (5 discovered) |
| Targets with verified personal email | 2 (Adnaan Khan, Rue Sriharsha) |
| Targets with confirmed corporate email | 4 (Lise Burke, Heera Shah, Andrew Forde, Stephanie Terrill) |
| Team departures discovered | 2 (Robert Mill, Hamza Malik) |
| Recruiter gap discovered | 1 (Rob Jessop → Google) |
| Total Apify cost | ~$1.50 (14 LinkedIn scrapes) |
| Total Twitter scraper cost | ~$0.80 (wasted — disabled after) |
| Total web search cost | $0 (Claude Code built-in) |
| Total deep recon extraction cost | $0 (direct HTTP fetch) |
| Agent-to-agent chatbot interactions | 1 (Robert Mill's bertomill.ca) |
| Strategies generated | 8 (top 8 targets) |
| Drafts written | 7 messages across 3 targets |
| Emails sent | 1 test (Wells) + 1 live test (Lauren Olukoya) |
| Pipeline versions | 6 (single script → 5-agent system) |
| Vault files | 30+ (targets, recon logs, methodology, journal, meta) |
| modes/deep-recon.md | 300+ lines of hardcoded operational playbook |

---

## The Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   CLAUDE CODE (the LLM layer)                    │
│                                                                  │
│  1. RECON        2. DEEP RECON    3. STRATEGY    4. DRAFT        │
│  research +      footprint +      7-approach     per-channel     │
│  scrape          network          planning       messages        │
│                                                                  │
│                  5. CAMPAIGN AGENT                                │
│                  orchestrates all, executes outreach              │
└───────┬──────────────────────────────────────────────────────────┘
        │ shell out for data + execution
        ▼
  ┌──────────────────────────────────────────────┐
  │              SCRIPTS (no LLM calls)          │
  │  apify-recon.mjs  → LinkedIn/IG data         │
  │  deep-recon.mjs   → entities, extract,       │
  │                     add-target, connections,  │
  │                     vectors, org-map,         │
  │                     probe-pages               │
  │  send-gmail.mjs   → Gmail API                │
  │  browse.mjs       → Playwright               │
  │  agent-browser    → adaptive browser (Rust)   │
  └──────────────────────────────────────────────┘
```

The key design decision: **Claude Code IS the reasoning layer.** Scripts are pure data pipelines — they fetch, parse, and write files. All thinking happens inline. No `ANTHROPIC_API_KEY` needed. No external LLM calls. The agent that orchestrates the campaign is the same agent that synthesizes the research, generates the strategy, and drafts the messages.

---

## What We'd Do Differently

1. **Skip the Twitter scraper entirely.** $0.80 wasted for zero useful data. Web search finds Twitter profiles for free.
2. **Build probe-pages earlier.** We only built it after realizing Google doesn't index landing page subdomains. Should have been in the first version of deep recon.
3. **Verify emails immediately.** We took the first email at face value and had to backtrack. The verification protocol (check git commits, cross-reference, challenge the source) should run automatically.
4. **Private repo from the start.** We pushed real personal data to a public fork before creating a private working copy. Should have been private from commit 1.

---

*Built by Wells Mensah + BYAMN in ~7 hours across 2 days. Toronto, May 2026.*
*A single outreach attempt is a lottery ticket, not a strategy.*
