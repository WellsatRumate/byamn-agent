# BYAMN — Build Spec
## "By Any Means Necessary" Outreach Agent
### 2-Hour Sprint → Screen-Recorded Demo → KPMG Application

---

## What This Is

A CLI agent that researches targets, generates multi-path outreach strategies, drafts personalized messages, executes browser-based and email-based outreach, and self-identifies as an AI agent built by Wells Mensah — making the application method the proof of competency.

**The screen recording of this agent running a live campaign against KPMG targets IS the application.**

---

## Architecture

### Multi-Agent Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    CAMPAIGN AGENT (Claude Code)                  │
│              Orchestrator — manages state, executes              │
│                                                                  │
│    ┌──────────┐         ┌───────────┐  ┌───────────┐            │
│    │  RECON   │────────▶│ STRATEGY  │  │  DRAFT    │            │
│    │  AGENT   │    │    │  AGENT    │  │  AGENT    │            │
│    │          │    │    │           │  │           │            │
│    │ web srch │    │    │ 7-approach│  │ per-target│            │
│    │ osintgrm │    │    │ generation│  │ messaging │            │
│    │ linkedin │    │    └───────────┘  └───────────┘            │
│    └──────────┘    │         │               │                   │
│                    │         └───────┬───────┘                   │
│         SEQUENTIAL │                 │ PARALLEL                  │
│                    │                 ▼                            │
│                    │    ┌──────────────────────┐                 │
│                    │    │   CAMPAIGN AGENT     │                 │
│                    │    │   receives all output │                 │
│                    │    │   human approval gate │                 │
│                    │    │   executes outreach:  │                 │
│                    │    │     → Gmail API       │                 │
│                    │    │     → Playwright      │                 │
│                    │    │     → [MANUAL] flag   │                 │
│                    │    │   logs everything     │                 │
│                    │    └──────────────────────┘                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Roles

| Agent | System Prompt | Input | Output | Runs Via |
|-------|--------------|-------|--------|----------|
| **Recon Agent** | Target intelligence gatherer. Uses web search + OSINTgram to build dossiers. | Target name + org | Structured research report (JSON + markdown) | `scripts/research.mjs` (Claude API + web search tool) |
| **Strategy Agent** | 7-approach outreach strategist. Takes research, generates all approaches with specific actions, contacts, and failure signals. | Recon report + objective | 7-approach strategy doc | `scripts/strategy.mjs` (Claude API) |
| **Draft Agent** | Message writer. Crafts personalized outreach per target per approach. Under 200 words, specific hooks, clear ask. | Research + strategy + approach type | Draft messages (JSON with to/subject/body) | `scripts/draft.mjs` (Claude API) |
| **Campaign Agent** | Orchestrator. Sequences the other agents, manages state, presents drafts for human approval, executes outreach, logs results. | targets/*.json | Sent messages + campaign log | Claude Code itself |

### Pipeline Flow

```
For each target in targets/kpmg.json:

  1. RECON AGENT runs (sequential - must complete before next step)
     └─▶ reports/{target}-recon.md

  2. STRATEGY AGENT + DRAFT AGENT run in parallel
     ├─▶ STRATEGY: reports/{target}-strategy.md  (7 approaches)
     └─▶ DRAFT: drafts/{target}-{approach}.json  (messages for assigned approach)

  3. CAMPAIGN AGENT receives all outputs
     ├─▶ Presents draft to Wells for approval
     ├─▶ On approval: executes via Gmail API / Playwright / [MANUAL] flag
     ├─▶ On rejection: re-runs Draft Agent with feedback
     └─▶ Logs result to data/campaign-log.md

  4. Next target
```

### Why This Architecture

- **Recon is sequential** because Strategy and Draft both need the research to be accurate. No point drafting a message if you don't know who you're talking to.
- **Strategy and Draft run in parallel** because they're independent consumers of the same recon data. Strategy generates the full 7-approach playbook while Draft simultaneously writes the message for the assigned approach. This cuts wall-clock time nearly in half for each target.
- **Campaign Agent is Claude Code itself** because it needs filesystem access (read targets, write logs), browser control (Playwright), and human interaction (approval prompts). The sub-agents are pure reasoning — they don't need tools beyond web search.

### File Structure

```
wells-byamn/                          ← the repo (public GitHub)
├── CLAUDE.md                          ← Campaign Agent brain
├── cv.md                              ← Wells' CV (source of truth)
├── cover-letter.md                    ← KPMG cover letter content
├── config/
│   ├── profile.yml                    ← Wells' profile, target roles, preferences
│   ├── gmail-credentials.json         ← Gmail OAuth (gitignored)
│   └── ig-credentials.json            ← Burner IG creds (gitignored)
├── targets/
│   └── kpmg.json                      ← Target list with names, orgs, approaches
├── modes/                             ← Agent mode prompts (read by Campaign Agent)
│   ├── _shared.md                     ← Shared context injected into all sub-agents
│   ├── recon.md                       ← Recon Agent system prompt
│   ├── strategy.md                    ← Strategy Agent system prompt
│   ├── draft.md                       ← Draft Agent system prompt
│   ├── campaign.md                    ← Campaign orchestration logic
│   ├── send.md                        ← Email execution mode
│   └── browse.md                      ← Browser execution mode
├── playbooks/                         ← Site navigation context for browser actions
│   ├── linkedin.md                    ← LinkedIn navigation
│   ├── twitter.md                     ← X/Twitter navigation
│   ├── instagram.md                   ← Instagram (manual execution + OSINTgram recon)
│   └── career-portals.md             ← Career site navigation
├── scripts/                           ← Sub-agent runners + execution tools
│   ├── research.mjs                   ← Recon Agent runner (Claude API + web search)
│   ├── strategy.mjs                   ← Strategy Agent runner (Claude API)
│   ├── draft.mjs                      ← Draft Agent runner (Claude API)
│   ├── send-gmail.mjs                 ← Gmail API sender
│   ├── browse.mjs                     ← Playwright browser automation
│   └── osint-ig.mjs                   ← OSINTgram wrapper
├── tools/
│   └── osintgram/                     ← Git submodule (Datalux/Osintgram, GPL-3)
├── drafts/                            ← Generated drafts (gitignored)
├── reports/                           ← Research + strategy reports (gitignored)
├── data/
│   └── campaign-log.md               ← Campaign tracker
└── output/                            ← Generated PDFs (gitignored)
```

---

## What Comes From Where

| Source | What We Take | What We Skip |
|--------|-------------|-------------|
| **career-ops** (MIT, 45k★) | CLAUDE.md convention, modes/ skill system, pipeline tracker pattern, PDF generation (Playwright + HTML), batch architecture, applications.md format | Go dashboard, Spanish modes, archetypes/scoring, Gemini/Codex integrations, portal scanner (rebuild simpler) |
| **hanzi-browse** (PolyForm NC) | Site playbook *pattern* and navigation context for LinkedIn/X/career portals (rewritten as original content, not copied verbatim — license is non-commercial) | Chrome extension, MCP server, native host, managed mode, SDK, landing page |
| **BYAMN** (Wells' original) | 7-approach strategy framework, agent signature, by-any-means.skill philosophy, Claude API integration, Gmail sending | Standalone CLI structure (replaced by Claude Code modes) |

---

## CLAUDE.md (the brain)

This is the most important file. Claude Code reads it on session start and knows exactly what to do. Here's what it needs to contain:

```markdown
# BYAMN — By Any Means Necessary

## What You Are
You are BYAMN, an AI outreach agent built by Wells Mensah as a proof-of-work
application for the KPMG Canada AI Builder (Senior Consultant) role.
You research targets, generate multi-path outreach strategies, draft messages,
and execute outreach across email and browser channels.

The agent IS the application. Every outreach message includes a signature
identifying you as an AI agent built by the applicant.

## Who Wells Is
[condensed from memory — Rumate, Tori, 31-day build, GetCAPPD, etc.]

## How You Work
1. User says a target name + org → you run modes/recon.md
2. Research complete → you run modes/strategy.md (7 approaches)
3. User picks an approach → you run modes/draft.md
4. Draft approved → you run modes/send.md (email) or modes/browse.md (LinkedIn/X)
5. Everything logged to data/campaign-log.md

## Slash Commands
/byamn              → show all commands
/byamn recon        → research a target
/byamn strategy     → generate 7-approach strategy
/byamn draft        → draft outreach message
/byamn send         → send via Gmail
/byamn browse       → execute browser action (LinkedIn, X, forms)
/byamn campaign     → full pipeline for all targets
/byamn status       → show campaign tracker

## Files You Read
- cv.md → Wells' CV (source of truth for all claims)
- cover-letter.md → KPMG cover letter content
- config/profile.yml → preferences, target salary, location
- targets/kpmg.json → target list
- playbooks/*.md → site navigation context for browser actions
- data/campaign-log.md → what's been done, what's pending

## Critical Rules
1. NEVER send without human approval (unless --auto flag)
2. ALWAYS append the agent signature to outreach messages
3. Read playbooks/ before any browser action
4. Log every action to campaign-log.md
5. Be aggressive but legal. No impersonation, no private systems.
```

---

## Mode Specs

### modes/_shared.md
Wells' builder context — condensed version of what I (Claude in claude.ai) already know. Rumate, Tori, 31-day build, GetCAPPD, agentic pipeline, tech stack, DMZ award. This is injected into every mode.

### modes/recon.md
**Input:** Target name + org
**Process:** Use web search (via Claude API tool use or `scripts/research.mjs`) to find:
- Current role, title, LinkedIn URL
- Recent public activity (posts, articles, talks)
- Email pattern at org
- Mutual connections with Wells
- Upcoming events where they'll be present
**Output:** Structured research report saved to `reports/{target-slug}.md`

### modes/strategy.md
**Input:** Research report
**Process:** Generate all 7 approaches:
1. DIRECT — specific email/DM with drafted message
2. WARM PATH — named intermediaries + draft ask
3. VALUE-FIRST — specific value offering (335 College case study, technical brief)
4. PUBLIC LEVERAGE — LinkedIn/X engagement plan
5. SIDE DOOR — alternative contacts at same org
6. PHYSICAL PROXIMITY — events, office hours, office address
7. BRUTE FORCE — full contact map + multi-channel plan
**Output:** Strategy doc saved to `reports/{target-slug}-strategy.md`

### modes/draft.md
**Input:** Target + approach type + research
**Process:** Draft the actual message. Rules:
- Under 200 words
- References something specific about the target
- Demonstrates Wells' builder credentials naturally
- Specific ask (15-min call, look at demo, intro to hiring manager)
- No agent signature in draft (appended automatically on send)
**Output:** Draft saved to `drafts/{target-slug}-{approach}.md`

### modes/send.md
**Input:** Draft file path
**Process:**
1. Display the draft with signature appended
2. Ask for confirmation
3. Call `scripts/send-gmail.mjs` with to/subject/body
4. Log to campaign-log.md
**Output:** Sent confirmation + Gmail message ID

### modes/browse.md
**Input:** Action type + target + content
**Process:**
1. Read relevant playbook (e.g., `playbooks/linkedin.md`)
2. Launch Playwright via `scripts/browse.mjs`
3. Navigate to target's profile/post
4. Execute action (connect + note, comment, DM, form fill)
5. Screenshot for proof
6. Log to campaign-log.md
**Actions supported:**
- `linkedin-connect` — send connection request with note
- `linkedin-comment` — comment on a recent post
- `linkedin-dm` — send InMail or message
- `twitter-reply` — reply to a recent tweet
- `form-fill` — fill out a web form (KPMG AI Lab inquiry, event registration)
**Output:** Screenshot + log entry

### modes/campaign.md
**Input:** targets/*.json file
**Process:** For each target:
1. Run recon (skip if report exists)
2. Run strategy (skip if strategy exists)
3. Run draft for the specified approach
4. Present draft for approval
5. Execute send or browse
6. Log result
7. Move to next target
**Output:** Updated campaign-log.md with full results

---

## Scripts

### scripts/send-gmail.mjs
Minimal Gmail API sender. OAuth2 flow, token storage, send-only scope.
Appends agent signature to every message:

```
---
This message was researched, drafted, and sent by an AI outreach agent
built by Wells Mensah. The agent is the application.

Wells Mensah | AI Builder, Creative Strategist & Marketing Specialist | rumate.io/intelligence
```

**Already built** — port from the BYAMN CLI we created earlier.

### scripts/browse.mjs
Playwright wrapper that:
1. Accepts action type + URL + content
2. Reads the relevant playbook for context
3. Launches browser (headed mode for screen recording)
4. Executes the action
5. Takes screenshot
6. Returns result

**Key:** Run in **headed mode** (not headless) so the screen recording captures the browser actions. This is the visual proof.

### scripts/research.mjs
Claude API caller with web search tool enabled. Takes a target name + org, returns structured research. **Already built** — port from BYAMN CLI.

---

## Playbooks (Original Content, Inspired by Hanzi-Browse Pattern)

### playbooks/linkedin.md
```markdown
# LinkedIn Navigation Context

## Profile Page
- Profile URL pattern: linkedin.com/in/{slug}
- Connect button: usually in the top card, may say "Connect" or "More → Connect"
- If "Follow" shows instead of "Connect", click "More" dropdown → "Connect"
- Add note: after clicking Connect, look for "Add a note" button before sending
- Note limit: 300 characters

## Posting a Comment
- Navigate to target's activity page: linkedin.com/in/{slug}/recent-activity/
- Find the target post (scroll if needed)
- Click "Comment" under the post
- Type in the comment box (contenteditable div)
- Click "Post" button (may be "Submit" on some layouts)

## Sending a Message
- Must be 1st-degree connection to DM freely
- If not connected: use InMail (limited, requires Premium) or connect first
- Message box: navigate to linkedin.com/messaging/ or click "Message" on profile
- Type in the message composer at bottom of chat window

## Common Failures
- LinkedIn may show login wall if not signed in → agent should flag this
- Rate limiting on connection requests (~100/week) → space them out
- "Pending" connections can't be re-sent
```

### playbooks/twitter.md
Similar structure for X/Twitter navigation.

### playbooks/career-portals.md
Navigation hints for Greenhouse, Lever, KPMG careers pages.

---

## Target File Format

### targets/kpmg.json
```json
[
  {
    "name": "[research-director]",
    "org": "KPMG Canada",
    "title": "Head of AI Research",
    "approach": "value",
    "email": "",
    "linkedin": "search: [research-director] KPMG Canada",
    "priority": 1,
    "notes": "Brand new role (March 2026). PhD UofT. Former NASA, IBM, BCG. Send technical brief."
  },
  {
    "name": "[ai-country-lead]",
    "org": "KPMG Canada",
    "title": "Partner, AI Country Lead",
    "approach": "direct",
    "email": "",
    "linkedin": "search: [ai-country-lead] KPMG Canada",
    "priority": 2,
    "notes": "Ultimate authority on AI team hiring."
  },
  {
    "name": "[coe-lead]",
    "org": "KPMG Canada",
    "title": "Partner, Data Analytics & AI CoE Lead",
    "approach": "direct",
    "email": "",
    "linkedin": "search: [coe-lead] KPMG Canada",
    "priority": 3,
    "notes": "Technical evaluator. Leads the team this role reports into."
  },
  {
    "name": "[peer-engineer]",
    "org": "KPMG Canada",
    "title": "Senior Consultant, Data Analytics & AI",
    "approach": "warm",
    "email": "",
    "linkedin": "linkedin.com/in/[handle]/",
    "priority": 4,
    "notes": "Peer-level — same team Wells would join. Focuses on AI governance, responsible AI, GenAI enablement. Built prompt libraries and governance dashboards at KPMG. Could be an internal advocate or referral. Toronto-based. Former Oracle."
  },
  {
    "name": "[cto]",
    "org": "KPMG Canada",
    "title": "Chief Technology Officer & Advisory Partner",
    "approach": "sidedoor",
    "email": "",
    "linkedin": "search: [cto] KPMG Canada CTO",
    "priority": 5,
    "notes": "KPMG Canada's CTO — owns digital strategy, innovation, and client experience through tech. UofT Engineering BASc. Former Accenture Partner, Pariveda Managing VP. Board member UofT Alumni Association + Women in Communications & Technology. The AI Builder role ultimately serves his digital strategy mandate."
  },
  {
    "name": "[infrastructure-partner]",
    "org": "KPMG Canada",
    "title": "Partner, Infrastructure Advisory & National Asset Management Leader",
    "approach": "value",
    "email": "",
    "linkedin": "linkedin.com/in/[handle]",
    "priority": 6,
    "notes": "Infrastructure + asset management focus. 30+ years experience. Posts about PropTech, housing, CMHC Housing Accelerator Fund. Rumate's housing intelligence platform is directly relevant to his practice — building scoring, municipal data, tenant intelligence. Potential internal client for AI Lab demos."
  },
  {
    "name": "[talent-manager]",
    "org": "KPMG Canada",
    "title": "Manager, Talent Attraction | National Tax & Law",
    "approach": "direct",
    "email": "",
    "linkedin": "search: [talent-manager] KPMG Canada",
    "priority": 1,
    "notes": "RECRUITER. Manager of Talent Attraction at KPMG Canada. Calgary-based, Columbia University. 9,875 followers, 500+ connections. She is likely the person who reached out or the gatekeeper routing candidates to the AI Builder hiring manager. Approach: respond warmly, send cover letter, ask who the hiring manager is and whether she can connect you directly. She values 'real human connection' and 'understanding people and their stories' — lead with your builder story, not a resume dump."
  }
]
```

---

## Campaign Log Format

### data/campaign-log.md
```markdown
# BYAMN Campaign Log — KPMG AI Builder

| # | Date | Target | Approach | Channel | Status | Notes |
|---|------|--------|----------|---------|--------|-------|
| 1 | 2026-05-22 | [research-director] | value | email | sent | Technical brief + cover letter |
| 2 | 2026-05-22 | [ai-country-lead] | direct | email | drafted | Awaiting review |
| 3 | 2026-05-22 | [research-director] | public | linkedin | pending | Comment on research post |
```

---

## 2-Hour Sprint Plan

### Division of Labor

**Claude (claude.ai — me):** Spec, strategy docs, cover letter, cv.md content, mode prompts, playbook content. I generate the text artifacts.

**Claude Code (on Wells' Linux laptop):** File creation, script wiring, Playwright integration, Gmail OAuth setup, running the actual campaign. CC executes.

**Wells:** Screen recording, Gmail OAuth consent, LinkedIn login in the browser, approving/rejecting drafts during the campaign, final decision on what gets sent.

### Hour 1: Build (0:00–1:00)

| Min | Task | Who |
|-----|------|-----|
| 0–10 | Fork career-ops, strip to skeleton, create directory structure | CC |
| 0–10 | Finalize cv.md + cover-letter.md content | Claude.ai |
| 10–20 | Write CLAUDE.md (the brain) | Claude.ai → CC pastes |
| 10–20 | Write modes/_shared.md, modes/recon.md, modes/strategy.md | Claude.ai → CC pastes |
| 20–30 | Write modes/draft.md, modes/send.md, modes/browse.md, modes/campaign.md | Claude.ai → CC pastes |
| 20–30 | Port send-gmail.mjs + research.mjs from BYAMN CLI | CC |
| 30–40 | Write playbooks/ (linkedin.md, twitter.md, career-portals.md) | Claude.ai → CC pastes |
| 30–40 | Build browse.mjs (Playwright wrapper, headed mode) | CC |
| 40–50 | Write targets/kpmg.json with all 5 targets | Claude.ai → CC pastes |
| 40–50 | Gmail OAuth setup + test send | Wells + CC |
| 50–60 | Wire up config/profile.yml, campaign-log.md, test each mode individually | CC |
| 50–60 | Dry run: `/byamn recon "[research-director]"` → verify research output | Wells |

### Hour 2: Demo (1:00–2:00)

| Min | Task | Who |
|-----|------|-----|
| 0–5 | Start screen recording (OBS or similar) | Wells |
| 5–10 | Open Claude Code in the repo, show CLAUDE.md being read | Wells |
| 10–20 | `/byamn recon "[research-director]"` — live research with web search | CC (on screen) |
| 20–30 | `/byamn strategy` — generate 7-approach strategy | CC (on screen) |
| 30–40 | `/byamn draft -a value` — draft the value-first email | CC (on screen) |
| 40–45 | Wells reviews draft, approves with minor edits | Wells |
| 45–50 | `/byamn send` — send via Gmail (live, real email) | CC (on screen) |
| 50–55 | `/byamn browse linkedin-connect "[research-director]"` — browser opens, navigates to LinkedIn, sends connection request | CC + Playwright (on screen) |
| 55–60 | `/byamn status` — show campaign log with results | CC (on screen) |

### The Recording Captures:
1. Claude Code reading the CLAUDE.md and understanding the system
2. Live web research on a real KPMG target
3. Strategy generation with all 7 approaches
4. Message drafting with personalization
5. Real email sent with the agent signature
6. Browser automation sending a LinkedIn connection request
7. Campaign tracker showing the results

---

## What Makes This a KPMG-Winning Demo

The JD says:

> "Build, test, and harden agents, plugins, skills, and tools"

**You're doing this live.** The agent has skills (modes/), tools (scripts/), and plugins (playbooks/).

> "Own the full build lifecycle: prototype → productionize → maintain"

**The screen recording shows the full lifecycle** — from spec to running agent in 2 hours.

> "Contribute reusable skills, components, and tools back into the shared AI stack"

**You're composing from three open-source projects** and adding your own reusable components on top.

> "Work with production systems, design evaluations, and handle integrations"

**Gmail API, Playwright, Claude API with web search** — real integrations, not mocks.

> "You think in workflows, not just models"

**The 7-approach strategy framework IS a workflow** with defined steps, failure signals, escalation paths, and human-in-the-loop gates.

> "The agent is the application."

---

## Post-Demo Deliverables

1. **The screen recording** (5-10 min, edited) — sent to KPMG contact
2. **The GitHub repo** (public) — linked in email and cover letter
3. **The cover letter** (already built) — attached to initial outreach
4. **The campaign log** — evidence of systematic, multi-channel approach

---

*Built by Wells Mensah. Toronto, 2026.*
*A single outreach attempt is a lottery ticket, not a strategy.*
