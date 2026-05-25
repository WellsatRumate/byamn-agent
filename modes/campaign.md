# Mode: Campaign

## Purpose
Orchestrate a full outreach campaign across all targets, iterating through each target's channels array.

## Input
- Target file (optional, defaults to `targets/kpmg.json`)
- Approach filter (optional) — only run specific approach types
- Channel filter (optional) — only run specific channels
- `--auto` flag (optional) — skip confirmation prompts (use with caution)

## Process

For each target in the file (sorted by priority):

1. **Check campaign-log.md** — skip if target+channel already completed
2. **Run recon** (modes/recon.md) — skip if `reports/{target-slug}.md` exists
3. **Run deep recon** (modes/deep-recon.md) — skip if `reports/{target-slug}-deep-recon.json` exists
4. **Run strategy** (modes/strategy.md) — skip if `reports/{target-slug}-strategy.md` exists
5. **For each channel in the target's `channels` array (in order):**
   a. **Draft** message for this channel (modes/draft.md)
   b. **Present draft** for review:
      - Show message with signature (if applicable per channel rules)
      - Show channel constraints (char count, format)
      - Tag `[MANUAL]` channels clearly
   c. **Wait for approval** (unless --auto):
      - "approve" / "yes" / "send" → proceed to execution
      - "edit" → let user modify, then re-present
      - "skip" → skip this channel, move to next
      - "skip-target" → skip all remaining channels for this target
      - "stop" → halt the campaign
   d. **Execute:**
      - `email` → `scripts/send-gmail.mjs`
      - `linkedin-connect` → `scripts/browse.mjs --action linkedin-connect`
      - `linkedin-dm` → `scripts/browse.mjs --action linkedin-dm`
      - `linkedin-comment` → `scripts/browse.mjs --action linkedin-comment`
      - `twitter-dm` → `scripts/browse.mjs --action twitter-dm`
      - `twitter-reply` → `scripts/browse.mjs --action twitter-reply`
      - `instagram-dm [MANUAL]` → output draft tagged `[MANUAL - Instagram DM]`, Wells sends personally
      - `agent-outreach` → **agent-browser** (preferred — adaptive chatbot detection):
        ```bash
        agent-browser open "{vector_url}" --headed --session-name byamn
        agent-browser snapshot -i --json   # Claude Code identifies chat input
        agent-browser fill @{ref} "{message}"
        agent-browser click @{send_ref}
        agent-browser screenshot output/{slug}-agent-chat.png
        ```
        Fallback: `scripts/browse.mjs --action agent-chat` (hardcoded selectors)
   e. **Log result** to campaign-log.md
6. **Move to next target**

## Intake Vector Priority (RULE)

Before defaulting to email or LinkedIn, check the target's `intake_vectors` from deep recon
(`reports/{slug}-deep-recon.json`). If the target exposes **any** intake vector, use it
**FIRST** — these are channels the target explicitly built to receive inbound, so they
convert far better than cold email. The agent always checks vectors before falling back to
standard channels.

| Vector Type | Action |
|-------------|--------|
| Booking / scheduling link (Calendly, Cal.com, coffee-chat form) | Fill via Playwright / agent-browser, book a meeting, upload résumé if a field exists |
| Contact form on personal site | Fill and submit with BYAMN intro + Wells' credentials |
| Newsletter signup | Subscribe, then reply to the welcome email with the outreach message |
| Chatbot on personal site | Send an agent-to-agent message; screenshot the interaction |
| Podcast guest application | Fill the application form, pitch Wells as a guest |
| GitHub (active repos) | Open a meaningful issue or PR that demonstrates value |
| WhatsApp Business (e.g. [recruiter]'s "Chat with us") | Message via Playwright if possible; otherwise flag `[MANUAL]` |
| Open Calendly / Cal.com | Book directly, add context in the notes field |

> Deep recon MUST emit an `intake_vectors` array for every target so this runs automatically.

## Execution Order (every target — SEQUENCED, not parallel)

Standing order for **every** target, not just [recruiter]. Fire these as a **sequence**, not all
at once — each tier is a deliberate touch, so the target sees a thoughtful multi-channel
effort rather than a blast:

1. **Intake vectors** from deep recon — highest priority (booking/scheduling form, contact form, chatbot, podcast application, WhatsApp). Channels they built to receive inbound.
2. **Personal email** — if found and verified.
3. **Warm social** — LinkedIn connect via a **mutual connection** (warm > cold). Accepting it also unlocks the target's Contact-info.
4. **Content channels** — podcast guest pitch and similar relationship-building touches.
5. **Corp email** — **last resort / backup**, not the opener.
6. **Twitter DM**, then **Instagram DM** `[MANUAL]`.

Sequencing example ([recruiter], 2026-05-28): coffee-chat booking (intake) → LinkedIn connect (warm via [peer-engineer]) → podcast pitch (content) → corp email (backup).

This supersedes BOTH the old "LinkedIn-first, vectors-last" order AND the old "fire all emails in parallel" rule — corp email is now the backstop, not the lead.

## Voice Rule (all channels, no exceptions)

BYAMN **always** speaks as itself on behalf of Wells — no switching between voices on any
channel, form, or message. Every channel, every form, every message: the agent identifies
itself as BYAMN, explains it was built by Wells, and delivers Wells' credentials and contact
details.

- **Name / booking identity fields** → `Wells Mensah` (it's his meeting).
- **Every free-text field, notes section, message body, and comment** → written in BYAMN's
  voice, on behalf of Wells.

This overrides any per-vector "speaks as" hint: even podcast applications and GitHub
issues/PRs are written in BYAMN's voice (name fields still use Wells Mensah).

### Agent Outreach (automatic from vectors)
If the target's deep recon report (`reports/{slug}-deep-recon.json`) has an entry in its
`intake_vectors` array of type `agent` or `chatbot`, the Campaign Agent automatically adds
`agent-outreach` as a channel.
It reads the chatbot URL from the vector, generates a message via Draft Agent (agent-outreach format),
and executes via **agent-browser** CLI (preferred) or `browse.mjs --action agent-chat` (fallback).
Screenshot is taken as proof for the screen recording.

### Browser Tool Selection
Read `playbooks/browser-routing.md` before executing any browser action.

| Channel | Browser Tool | Why |
|---------|-------------|-----|
| linkedin-connect/dm/comment | Playwright (`browse.mjs`) | Known selectors, persistent auth |
| twitter-reply/dm | Playwright (`browse.mjs`) | Known selectors, persistent auth |
| form-fill (known) | Playwright (`browse.mjs`) | Predefined field mapping |
| agent-outreach | **agent-browser** | Unknown widget, adaptive snapshot-based detection |
| newsletter-signup | **agent-browser** | Find form adaptively, fill email, submit |
| booking-link | **agent-browser** | Navigate calendar UI adaptively |
| form-fill (unknown portal) | **agent-browser** | Snapshot fields, fill by label/role |
| explore / navigate | **agent-browser** | Claude Code reasons about page structure |

## Signature Rules (enforced by Campaign Agent)
- **Append signature:** email, linkedin-connect, linkedin-dm, twitter-dm
- **No signature:** linkedin-comment, twitter-reply (public channels)
- **Instagram [MANUAL]:** No signature, no links in first message. Wells sends personally.

## Campaign Status Display
After each channel action, show progress:

```
Campaign Progress: [talent-manager] (3/3 channels)
  [x] email — sent (Message ID: abc123)
  [x] linkedin-connect — sent (connection request with note)
  [ ] instagram-dm [MANUAL] — draft ready, queued for Wells

Overall: 2/8 targets completed
  [x] [talent-manager] — 3 channels — all done
  [x] [research-director] — 2 channels — all done
  [ ] [former-peer] — 0/3 channels — pending
  [ ] [peer-engineer] — 0/4 channels — pending
  ...
```

## Example
```
/byamn campaign
/byamn campaign --auto
/byamn campaign targets/kpmg.json --channel email
/byamn campaign targets/kpmg.json --channel linkedin-connect
```
