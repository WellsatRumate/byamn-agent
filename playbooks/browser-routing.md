# Browser Routing — When to Use Which Tool

BYAMN has two browser automation tools. Each has strengths. Use the right one.

---

## The Two Tools

### Playwright (`scripts/browse.mjs`)
- **What it is:** Node.js library. Scripted browser automation.
- **How it works:** Predefined action functions with hardcoded CSS selectors.
- **Strengths:** Reliable for known workflows (LinkedIn connect, Twitter DM, form fill). Persistent browser context preserves logins. Takes screenshots automatically.
- **Weaknesses:** Brittle when selectors change. Can't adapt to unknown page layouts. No accessibility tree. Every new site needs a new function.

### agent-browser (CLI)
- **What it is:** Rust CLI. Snapshot-driven, ref-based browser control.
- **How it works:** Take accessibility snapshot → identify elements by ref → interact by ref. AI-native loop.
- **Strengths:** Adapts to any page layout. No hardcoded selectors. Semantic element finding (by role, label, text). JSON output for parsing. Session persistence. Works on unknown pages.
- **Weaknesses:** Slightly slower per-action (CLI process overhead). Requires Claude Code to reason about the snapshot.

---

## Decision Logic

```
Is this a KNOWN workflow with tested selectors?
  ├── LinkedIn connect/DM/comment  → Playwright (browse.mjs)
  ├── Twitter reply/DM             → Playwright (browse.mjs)
  ├── Gmail send                   → send-gmail.mjs (API, not browser)
  └── Form fill (known fields)     → Playwright (browse.mjs)

Is this an UNKNOWN or DYNAMIC page?
  ├── Chatbot interaction          → agent-browser (snapshot → find chat input → type → send)
  ├── New website / portal         → agent-browser (explore with snapshots)
  ├── Career application form      → agent-browser (snapshot fields → fill adaptively)
  ├── Newsletter signup            → agent-browser (find form → fill email → submit)
  └── Booking link (Calendly etc)  → agent-browser (navigate → select slot → fill details)

Is this a VISUAL PROOF capture for screen recording?
  ├── Need headed + screenshot     → Either works (both support headed mode)
  └── Need step-by-step narration  → agent-browser (snapshot between steps shows reasoning)

Is this AUTH-DEPENDENT?
  ├── LinkedIn (logged in)         → Playwright (persistent context in .browser-data/)
  ├── Twitter (logged in)          → Playwright (persistent context in .browser-data/)
  └── New site (no auth needed)    → agent-browser (cleaner, no stale cookies)
```

## Summary Table

| Action | Tool | Why |
|--------|------|-----|
| `linkedin-connect` | Playwright | Known selectors, auth preserved |
| `linkedin-comment` | Playwright | Known selectors, auth preserved |
| `linkedin-dm` | Playwright | Known selectors, auth preserved |
| `twitter-reply` | Playwright | Known selectors, auth preserved |
| `twitter-dm` | Playwright | Known selectors, auth preserved |
| `form-fill` (known) | Playwright | Predefined field mapping |
| `agent-chat` | **agent-browser** | Unknown widget, needs adaptive detection |
| `form-fill` (unknown) | **agent-browser** | Snapshot fields, fill adaptively |
| `newsletter-signup` | **agent-browser** | Find form, fill email, submit |
| `booking-link` | **agent-browser** | Navigate calendar, select slot |
| `navigate` (explore) | **agent-browser** | Snapshot for Claude Code to reason about |
| `screenshot` (proof) | Either | Both support headed + screenshot |

## How Claude Code Uses agent-browser

Claude Code shells out to agent-browser CLI commands directly:

```bash
# 1. Open page and get interactive elements
agent-browser open "https://bertomill.ca" --headed
agent-browser snapshot -i --json

# 2. Claude Code reads the snapshot, identifies the chat input
# Output: textbox "Message" [ref=e7], button "Send" [ref=e8]

# 3. Interact using refs
agent-browser fill @e7 "Hey — I'm BYAMN, an AI outreach agent..."
agent-browser click @e8

# 4. Screenshot for proof
agent-browser screenshot output/agent-chat-bertomill.png
```

The key difference: **Playwright needs code written in advance for each site. agent-browser lets Claude Code reason about the page in real time.**

## Session Management

```bash
# agent-browser sessions persist automatically
agent-browser --session-name byamn-linkedin open https://linkedin.com
# ... login manually first time ...
# Session preserved for future runs

# Or use saved state
agent-browser state save config/browser-state-linkedin.json
agent-browser --state config/browser-state-linkedin.json open https://linkedin.com
```
