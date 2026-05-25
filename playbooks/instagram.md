# Instagram Outreach Playbook

## Execution Mode: MANUAL
The agent drafts the message and identifies the target's handle.
Wells sends personally. All Instagram actions tagged `[MANUAL - Instagram DM]`.

---

## Finding the Target

### Standard Discovery
1. Search their full name on Instagram directly
2. Cross-reference with LinkedIn - many people link their IG in their LinkedIn contact info
3. Check their Twitter/X bio for IG handle
4. Search "[name] KPMG" on Instagram
5. If handle not found, agent flags as `[IG_HANDLE_NOT_FOUND]` and skips

### OSINTgram Recon (Bundled as Submodule)
Located at `tools/osintgram/`. Runs via `scripts/osint-ig.mjs` wrapper.
Uses burner IG credentials stored in `config/ig-credentials.json` (gitignored).

Setup:
```bash
# First time only
cd tools/osintgram && pip install -r requirements.txt --break-system-packages
# Add burner creds
echo '{"username":"your_burner","password":"your_pass"}' > config/ig-credentials.json
```

Agent can call directly:
- `osint-ig recon [handle]` - full profile pull (bio, followers, following, hashtags)
- `osint-ig network [handle]` - who they follow + who follows them
- `osint-ig comments [handle]` - active relationships via comment analysis
- `osint-ig tagged [handle]` - professional circle via tagged photos
- `osint-ig discover [handle]` - cross-reference followers with existing targets list

Workflow:
1. Agent runs `osint-ig recon` on Heera Shah and Adnaan Khan
2. Runs `osint-ig discover` to cross-reference with KPMG target list
3. Surfaces any unlisted KPMG AI team members with IG presence
4. Flags content hooks (recent posts, stories, hashtags) for DM personalization
5. New targets auto-added to targets/kpmg.json with `"source": "instagram-osint"`
6. Agent outputs findings but tags all IG actions as `[MANUAL - Instagram DM]` for Wells

## Rules of Engagement

### Before the DM
- Follow them first. Don't DM a stranger without following.
- Engage with 2-3 recent posts (like + one genuine comment) over 24-48 hours before DMing. This puts your face in their notifications before the DM lands.
- Story replies are lower friction than cold DMs. If they post a story related to AI, tech, KPMG, or anything you can authentically respond to, reply to the story first. That opens the DM thread naturally.

### The DM Itself
- Keep it under 100 words. Instagram is not email.
- No links in the first message. Instagram shadowbans DMs with links from non-mutuals.
- No attachments in the first message.
- Write like a human on their phone, not like an agent. Lowercase is fine. No bullet points.
- One clear ask: "would love to connect" or "can I send you something?"
- Reference something specific from their profile or recent post so it doesn't read as spam.
- If they respond positively, THEN send a link (cover letter, portfolio, rumate.io/intelligence) in the follow-up message.

### What NOT to Do
- Don't send voice notes to strangers
- Don't send a wall of text
- Don't pitch in the first message
- Don't follow/unfollow
- Don't like 30 posts at once (looks bot-like)
- Don't mention the agent or BYAMN on Instagram. This channel is human-only.

## DM Templates

### Template A: Warm (after story reply or comment exchange)
```
hey [name] - saw your post about [topic]. I'm actually building in the AI space in Toronto
and came across the AI builder role at KPMG. would love to chat if you're open to it
```

### Template B: Direct (no prior engagement)
```
hi [name], hope this isn't too random - I'm Wells, I build AI products in Toronto.
I saw KPMG is hiring AI builders and your name came up in my research.
would love to connect if you're open to a quick chat
```

### Template C: Recruiter-specific (for Heera Shah)
```
hey Heera - I came across the AI builder senior consultant role and I'm genuinely
excited about it. I've been building agentic AI systems in production and would
love to chat about the role if you have a few minutes. happy to share what I've built
```

### Template D: Peer-level (for Adnaan Khan or similar)
```
hey [name] - I see you're on the AI team at KPMG. I'm applying for the AI builder
role and building some cool stuff with Claude and agentic workflows. would be great
to connect with someone on the team
```

## Timing
- Best send times: Tuesday-Thursday, 10am-1pm or 7pm-9pm EST
- Don't DM on weekends for professional outreach
- Don't DM after 10pm

## Follow-Up
- If no response after 3-4 days, like one more post. Don't send a second DM.
- If no response after 7 days, move on. Instagram is a soft channel - no one owes you a reply here.
- If they respond, move the conversation to email or LinkedIn within 2-3 exchanges. IG is for opening doors, not conducting business.

## Which Targets Get Instagram

| Target | IG Likely? | Reasoning |
|--------|-----------|-----------|
| Heera Shah | Yes | Recruiter, 9.8k LinkedIn followers, likely active on socials |
| Adnaan Khan | Maybe | Peer-level, younger professional |
| Ross Homeniuk | No | Senior partner, 30+ years experience |
| Safdar Mahmood | No | CTO-level, unlikely on IG professionally |
| Gary Filan | No | Partner-level |
| Andrew Forde | No | Research/academic track |
| Chitra Sridhar | No | Senior partner |
| Stephanie Terrill | No | Managing partner |

## Agent Output Format

When Instagram is flagged for a target, agent outputs:

```
[MANUAL - Instagram DM]
Target: Heera Shah
Handle: @[found or NOT_FOUND]
Suggested template: C (recruiter-specific)
Pre-DM actions: follow, engage with 2-3 posts over 24-48hrs
Draft:
  hey Heera - I came across the AI builder senior consultant role...

Status: QUEUED_FOR_WELLS
```

Wells executes manually and updates campaign-log.md with result.
