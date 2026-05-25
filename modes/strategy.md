# Mode: Strategy

## Purpose
Generate a 7-approach outreach strategy for a researched target.

## Input
- Target name (required)
- Research report must exist in `reports/{target-slug}.md`

## Process

1. **Read research report** from `reports/{target-slug}.md`
2. **Read shared context** from `modes/_shared.md` for Wells' background
3. **Read cv.md** for verifiable claims
4. **Generate all 7 approaches** with specific, actionable details

## Output Format
Save to `reports/{target-slug}-strategy.md`:

```markdown
# Outreach Strategy: {Name}
## Generated: {date}
## Research: reports/{target-slug}.md

---

### 1. DIRECT
**Channel:** {email / LinkedIn DM}
**Message type:** {cold email / InMail / DM}
**Core angle:** {1-sentence pitch tailored to target}
**Specific ask:** {15-min call / look at demo / intro to hiring manager}
**Draft needed:** Yes
**Estimated success:** {Low/Medium/High} — {why}

### 2. WARM PATH
**Intermediary:** {specific person or connection}
**How to reach intermediary:** {channel + approach}
**Ask for intermediary:** {specific intro request}
**Draft needed:** Yes (for both intermediary ask and target message)
**Estimated success:** {Low/Medium/High} — {why}

### 3. VALUE-FIRST
**Value offering:** {specific deliverable — case study, technical brief, analysis}
**Relevance to target:** {why they'd care}
**Delivery channel:** {email attachment / LinkedIn post / direct link}
**Draft needed:** Yes
**Estimated success:** {Low/Medium/High} — {why}

### 4. PUBLIC LEVERAGE
**Platform:** {LinkedIn / X}
**Target content:** {specific post or topic to engage with}
**Engagement plan:**
  1. {action 1 — e.g., thoughtful comment on recent post}
  2. {action 2 — e.g., share their content with added insight}
  3. {action 3 — e.g., follow up with connection request referencing engagement}
**Timeline:** {over how many days}
**Draft needed:** Yes (comments + connection note)
**Estimated success:** {Low/Medium/High} — {why}

### 5. SIDE DOOR
**Alternative contact:** {name + title at same org}
**Why this person:** {relationship to target or hiring process}
**Channel:** {email / LinkedIn}
**Draft needed:** Yes
**Estimated success:** {Low/Medium/High} — {why}

### 6. PHYSICAL PROXIMITY
**Opportunity:** {event / office hours / conference / meetup}
**Date:** {when}
**Location:** {where}
**Preparation needed:** {what to bring or prepare}
**Draft needed:** No (but talking points needed)
**Estimated success:** {Low/Medium/High} — {why}

### 7. BRUTE FORCE
**Channels to hit simultaneously:**
  - Email: {specific email}
  - LinkedIn: {connect + DM}
  - X/Twitter: {reply + DM}
  - Other: {any other channel}
**Timing:** {all at once vs. staggered over N days}
**Risk:** {perception of spam vs. showing determination}
**Draft needed:** Yes (one per channel)
**Estimated success:** {Low/Medium/High} — {why}

---

## Recommended Sequence
1. Start with: {approach}
2. If no response in 3 days: {approach}
3. Escalate to: {approach}

## Do Not
- {any approaches to avoid for this specific target and why}
```

## Example
```
/byamn strategy "Andrew Forde"
```
