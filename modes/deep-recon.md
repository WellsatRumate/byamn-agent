# Mode: Deep Recon Agent

## Purpose
Expand a target's profile into a complete intelligence dossier: social graph, contact info, org chart, intake vectors, and network connections. This is not a suggestion engine — every phase runs, every step executes. The output is a map, not a list.

## Input
- Target name (required)
- Raw LinkedIn data at `reports/{slug}-raw.json` (from Apify scrape or web search)
- Existing targets in `targets/kpmg.json`
- Campaign objective (e.g., "apply for AI Builder role at KPMG Canada")

---

## Phase 1: Profile Scrape

**If budget allows:** Run `node scripts/apify-recon.mjs --name "{name}" --org "{org}"` for LinkedIn profile via Apify.

**If budget-constrained:** Web search fallback. Search `"{name}" "{org}" site:linkedin.com` and extract what's visible.

**Extract from LinkedIn (raw JSON or web search):**
- Full name, current title, org, location
- Complete education history (every school, degree, dates)
- Complete employment history (every employer, title, dates, location)
- Certifications and skills
- Connections count, follower count, premium status, creator mode
- About section (verbatim — this reveals what they value)

**Save raw data to:** `reports/{slug}-raw.json`

---

## Phase 2: Social Graph Discovery

### Handle Cross-Check
Take the LinkedIn slug (e.g., `adnaankhan98`). Check the same handle on other platforms:
- Instagram: `https://instagram.com/{slug}`
- Twitter/X: `https://x.com/{slug}`
- TikTok: `https://tiktok.com/@{slug}`
- YouTube: `https://youtube.com/@{slug}`
- GitHub: `https://github.com/{slug}`

Use HEAD requests or web search to verify existence. Don't assume — check.

### YouTube About Page (HIGHEST-YIELD SOURCE)
If a YouTube channel is found (via handle check OR web search `"{name}" YouTube channel`):
1. Run `node scripts/deep-recon.mjs extract --name "{name}" --urls "https://youtube.com/c/{handle}"`
2. The channel page HTML contains linked social accounts: Twitter, Instagram, Facebook, secondary channels
3. The regex extractor catches all of them from the page source
4. **This single scrape often reveals the entire social graph for $0.**

### Linktree Chain
If a Linktree is found (via web search, YouTube links, or social bios):
1. Run `node scripts/deep-recon.mjs extract --name "{name}" --urls "https://linktr.ee/{handle}"`
2. Extract all outbound links — these are the platforms they actively use
3. Check each link for contact info

### History-Based Cross-Reference (THE CORE DIFFERENTIATOR)
Run `node scripts/deep-recon.mjs entities --name "{name}" --raw reports/{slug}-raw.json` to extract all schools and employers.

For EACH entity, run a web search:
- `"{name}" "{school_name}"` — surfaces: student projects, theses, alumni directories, university event pages
- `"{name}" "{past_employer}"` — surfaces: old profile pages, press releases, conference bios, project credits
- `"{name}" portfolio OR "personal website" OR "personal site"` — surfaces: landing pages with contact info
- `"{name}" site:github.com` — surfaces: code profiles, repos, commit emails
- `"{name}" site:linktr.ee` — surfaces: link aggregator pages

**Why this works:** People scrub their current profiles but forget old portfolios, student pages, and conference bios. The email on their 2019 university project page is the same Gmail they still use.

### Landing Page Brute-Force (CATCHES WHAT SEARCH ENGINES MISS)
Run `node scripts/deep-recon.mjs probe-pages --name "{name}" --raw reports/{slug}-raw.json`

This constructs URLs from name variants × free landing page platforms and HEAD-requests each one:
- getlandingsite.com (with numbered variants: name-1, name-123, name-705, etc.)
- carrd.co, notion.site, wixsite.com, webflow.io, super.so, framer.website
- bio.link, bento.me, read.cv, contra.com, about.me

**Why this exists:** Free landing page platforms use subdomain-based hosting. Google doesn't reliably index them — they're low-authority, often nofollow'd, and treated as near-duplicate content. The page exists but search can't find it. Direct probing finds what dorking misses.

**What it catches:** Draft portfolios, student project pages, throwaway landing pages with real email addresses. People create these, put their Gmail on them, and forget about them.

Any pages found get passed to the `extract` command for email/social/phone extraction.

Collect ALL unique URLs from search results AND probe-pages results. Run `node scripts/deep-recon.mjs extract --name "{name}" --urls "url1,url2,..."` to extract contacts from each page.

---

## Phase 3: Contact Discovery

### Email Extraction
From every page fetched in Phase 2, the extract command runs regex for email addresses. Filter out noise domains (google.com, wordpress.org, schema.org, etc.).

### GitHub Discovery (MANDATORY — check multiple paths)
**Don't assume the LinkedIn slug matches the GitHub handle.** They're often different. Check:
1. Handle cross-check: `github.com/{linkedin_slug}` — may be empty or a vanity registration
2. Portfolio site links — **portfolio footer/nav often links to the REAL active GitHub account**, not the vanity handle. This is the highest-value path.
3. Web search: `"{name}" site:github.com`
4. The active account may have a completely different slug (e.g., LinkedIn `adnaankhan98` → GitHub `adukhan98`)

### Git Commit Email Extraction (MANDATORY if GitHub found)
If the target has a GitHub profile:
1. List all repos: `curl https://api.github.com/users/{handle}/repos?per_page=100&sort=created&direction=asc`
2. **Start with the OLDEST repos** — people learn to mask emails over time. Their 2019 school project commits still have the real Gmail.
3. For each repo, check commits: `curl https://api.github.com/repos/{handle}/{repo}/commits?per_page=5`
4. Extract `commit.author.email` from every commit
5. Filter out: `noreply.github.com` addresses AND `.local` addresses (macOS default git config — every Mac auto-generates `username@MacBook.local`, this is noise, not intel)
6. Any remaining email is a REAL configured identity — the person typed it into `git config user.email`
7. Cross-reference the found email against other sources. If it matches a landing page listing, confidence goes up. If they conflict, trust the git commit over the landing page.

**Why this works:** Developers configure git with their real email before they learn about noreply. Old course projects, hackathon repos, and early commits leak the actual email they still use. A git commit email is stronger evidence than a landing page listing — it's something they typed into their terminal, not a form field.

### Google Dorking (3 mandatory queries)
Run via Claude Code's web search tool:

1. `"{name}" "{org}" "@gmail.com" OR "@hotmail.com" OR "@outlook.com"`
   — catches personal email mentioned alongside org name

2. `"{name}" email contact "{org}"`
   — catches contact pages, speaker bios, event registrations, ZoomInfo snippets

3. `"{linkedin_slug}" "@gmail.com" OR "@yahoo.com"`
   — catches cross-references where LinkedIn slug appears near personal email

### Intake Mechanism Scan
Run `node scripts/deep-recon.mjs vectors --name "{name}" --urls "personal_site_url,github_url"` to detect:
- **Contact forms** — message goes to personal email
- **Booking links** — Calendly, Cal.com, SavvyCal, TidyCal. A public booking link is a direct path. Book a 15-minute chat.
- **Newsletter signup** — Substack, Buttondown, ConvertKit, Mailchimp. Subscribe. The reply-to address on the welcome email is often their personal inbox.
- **Chatbots / AI agents** — Intercom, Drift, Crisp, Voiceflow, custom. Agent-to-agent outreach opportunity.
- **GitHub repos** — open issues, discussions, recent activity. A meaningful PR or issue is an authentic touchpoint.

### Record All Contacts
Every email, phone, social handle, and intake vector gets recorded with:
- The address/URL
- Confidence level: high (directly attributed), medium (likely match), low (possible)
- Source URL where it was found
- Discovery method

---

## Phase 4: Org Mapping

**This phase is NOT optional. It runs automatically for every target.**

### Find Teammates
Search:
- `"{org}" "{team/department}" site:linkedin.com/in` — find people with similar roles
- `"{org}" "{role_title}" site:linkedin.com/in` — find others with the same title

### Find Who Posted About the Role
Search:
- `"{org}" "{role}" hiring OR "we're hiring" OR "join our team" site:linkedin.com/posts`
- People who post about open roles are hiring managers or team leads. They're the decision-makers.

### Find the Manager
Search:
- `"{org}" "{team}" director OR "head of" OR lead site:linkedin.com`
- `"{org}" "{team}" launch OR announcement OR "pleased to announce"` — press releases always name the leader
- Check TheOrg.com: `theorg.com/org/{org-slug}/org-chart/{person-slug}`

### Ask Chatbots
If any chatbot was found on the target's site:
1. Screenshot the page BEFORE sending the message
2. Ask: "Who leads the {team} team at {org}?" and "Who does the {team} report to?"
3. Screenshot AFTER receiving the response
4. Save both to `vault/screenshots/{slug}-chatbot-{timestamp}-before.png` and `-after.png`
5. Log the full transcript to `vault/recon/agent-to-agent-log.md` with Obsidian image embeds

### Map Upward
For the manager discovered, find THEIR manager:
- Search: `"{manager_name}" "{org}" "reports to" OR "Managing Partner" OR VP`
- Check TheOrg.com for the next level up
- **Stop at executive level** (Partner, Managing Partner, VP, C-suite)

### Categorize Every Person Found
Assign `org_position` to each:
| Position | Definition |
|----------|-----------|
| `peer` | Same level — teammate on the same team |
| `manager` | Direct manager of the target |
| `director` | Runs the team/lab/practice |
| `executive` | Partner/VP-level, owns the strategic mandate |
| `recruiter` | Talent attraction / hiring role |
| `former_peer` | Left the org but was on the team |

---

## Phase 5: Target Discovery Loop

### Auto-Add Rules
Any new person discovered in Phases 2-4 gets evaluated:
1. **Is the person relevant to the campaign objective?** (on the team, in the hiring chain, a recruiter, a warm path)
2. **Are they already in targets?** Check `targets/kpmg.json`
3. If relevant and new, add via: `node scripts/deep-recon.mjs add-target --name "{name}" --title "{title}" --org "{org}" --discovered-via "{original_target}" --notes "org_position: {position}"`

### Depth Limits
| Depth | Who | Gets Recon? | Triggers Discovery? |
|-------|-----|-------------|-------------------|
| 0 | Original targets (from initial list) | Full recon | Yes |
| 1 | Discovered from depth-0 targets | Full recon | Yes |
| 2 | Discovered from depth-1 targets | Light recon (web search only) | **No** — stops here |

Depth-2 targets get a profile and contact info but do NOT trigger further org-mapping or teammate discovery. This prevents infinite expansion.

### Inheritance
New targets inherit the campaign objective but get their own approach based on `org_position`:
- `peer` → warm approach, linkedin-connect, show-don't-ask
- `manager` → direct approach, email + linkedin-connect
- `director` → value-first or direct, reference their public work
- `executive` → sidedoor, only after lower-level traction
- `recruiter` → direct, show reasoning chain, ask to be pointed to the right person

---

## Phase 6: Connection Mapping

### Cross-Reference Every Discovery
For every new target discovered, run against ALL existing targets:

Run `node scripts/deep-recon.mjs connections --new-target "{name}"` to generate queries, then execute each via web search:
- `"{new_target}" "{existing_target}"` — finds co-authored posts, panels, shared events
- `"{new_target}" "{existing_target}" "{org}"` — finds internal connections

### Flag Connection Types
| Type | Evidence |
|------|----------|
| `same_team` | Both have same team/practice in title |
| `reports_to` | Press release, org chart, announcement |
| `co_authored` | Joint post, paper, presentation |
| `same_event` | Both spoke at or attended same event |
| `same_community` | Both in same professional group, meetup, or org |
| `mutual_connection` | Shared LinkedIn connection visible in search |
| `former_colleagues` | Worked at same company in overlapping period |

### Output
Every connection gets recorded with:
- `target_a` and `target_b`
- `connection_type`
- `evidence` (description)
- `source` (URL)

The network graph turns a flat target list into a map of relationships. Warm paths emerge from the edges, not the nodes.

---

## Decision Logic (hardcoded, not suggestions)

### Search Priority
1. **Web search first, always.** It's free and Claude Code has it built in.
2. **Apify only when web search can't get profile data** — e.g., LinkedIn full profile with experience history.
3. **Never pay for what you can get for free.** YouTube page scrape, Linktree scrape, personal site fetch, contact extraction — all $0.

### Highest-Value Sources (in order)
1. **YouTube About page** — single highest-yield scrape for cross-platform discovery
2. **Personal sites / portfolios** — people put real contact info here
3. **Old profiles (university, past employer)** — forgotten pages leak emails and handles
4. **Chatbots on personal sites** — free recon source AND an attention-getter
5. **LinkedIn profile** — good for career history, bad for contact info
6. **Twitter/Instagram** — useful for engagement, rarely for email discovery

### What Doesn't Work
- DuckDuckGo lite (CAPTCHA blocks programmatic access)
- Google search from Node.js (consent redirect)
- Osintgram / instagram_private_api (library too old, Instagram blocks it)
- LinkedIn direct HTTP fetch (always returns 999)
- Assuming LinkedIn emails will be populated (they never are)

---

## What We Learned Building This

These aren't theories. These are findings from live recon operations.

1. **"AI Builder" as a search term doesn't match real LinkedIn titles.** Nobody puts "AI Builder" as their title. Search for the conversation around the role — "AI Lab" + "hiring" + company name — not the job title.

2. **History-based cross-referencing finds contact info that no scraper can.** People leave digital breadcrumbs at every institution they pass through. The email on their 2019 university project page is the same Gmail they use today.

3. **Agent-to-agent outreach is real.** When targets have chatbots, the chatbot is a free recon source (ask about org structure) and an attention-getter (agent introducing itself to another agent). It's not a reliable delivery mechanism — responses may hang — but it's a conversation starter.

4. **Newsletter reply-to addresses go to personal inboxes.** Subscribe to find the email. This works reliably for content creators and builders.

5. **Team departures reveal open positions.** Two people leaving a small team = urgent backfill = higher chance of getting hired. Track departures as intel, not gossip.

6. **Recruiters are department-specific.** The person who reaches out may not be the recruiter for your role. Always verify which practice line they cover. Show your reasoning for contacting them — the intelligence work IS the proof of competency.

7. **The recruiter for a specific role may not exist.** People leave. Roles go unfilled. When the dedicated recruiter has departed, ask any adjacent recruiter to point you in the right direction. The routing ask is sharper than pretending they own the process.

8. **TheOrg.com is free org chart data.** Not always complete, but gives reporting lines that LinkedIn doesn't show.

9. **Press releases name leaders.** When a team or lab launches, the announcement always names the executive sponsor. Search for launch announcements to find the boss.

10. **Sites don't update in real time.** A personal site showing "KPMG — Present" while LinkedIn shows a new company means the departure was recent. This is intel — the seat is freshly open.

---

## Output Format

### Deep Recon Report: `reports/{slug}-deep-recon.json`
```json
{
  "target": "Name",
  "timestamp": "ISO date",
  "depth": 0,
  "entities": { "education": [], "employers": [], "cities": [], "certifications": [] },
  "digital_footprint": {
    "emails": [{ "address": "", "confidence": "high", "source": "" }],
    "phones": [],
    "socials": [{ "platform": "", "handle": "", "source": "" }]
  },
  "intake_vectors": [
    { "type": "scheduling|newsletter|contact_form|agent|github", "url": "", "difficulty": "", "notes": "" }
  ],
  "org_map": {
    "teammates": [{ "name": "", "title": "", "org_position": "peer" }],
    "manager": { "name": "", "title": "", "org_position": "manager" },
    "director": { "name": "", "title": "", "org_position": "director" },
    "executive": { "name": "", "title": "", "org_position": "executive" }
  },
  "discovered_targets": [
    { "name": "", "title": "", "org_position": "", "discovered_via": "", "added": true }
  ],
  "connections_to_existing_targets": [
    { "target_a": "", "target_b": "", "connection_type": "", "evidence": "", "source": "" }
  ],
  "departed_team_members": [
    { "name": "", "former_title": "", "now_at": "", "departure_date": "" }
  ]
}
```

### Vault Integration
Write to vault as each phase completes, not at the end:
- `vault/targets/{slug}.md` — full dossier
- `vault/recon/recon-log.md` — append each search + result
- `vault/recon/discoveries.md` — append new targets/contacts
- `vault/recon/kpmg-org-map.md` — update org chart
- `vault/recon/agent-to-agent-log.md` — chatbot transcripts with `![[screenshots]]`
- `vault/screenshots/` — before/after chatbot screenshots

---

## Execution Checklist

For every target, confirm all phases ran:
- [ ] Phase 1: Profile scraped (Apify or web search)
- [ ] Phase 2: Social graph checked (YouTube, handle cross-check, history dorking)
- [ ] Phase 3: Contact discovery (email regex, Google dorks, intake vectors)
- [ ] Phase 4: Org mapped (teammates, manager, director, executive)
- [ ] Phase 5: New targets evaluated and added (with depth limit)
- [ ] Phase 6: Connections mapped against all existing targets
- [ ] Vault updated with all findings
