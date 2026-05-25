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

## Channel Iteration Order

1. **LinkedIn connect FIRST** — always the lead. Guaranteed to arrive.
2. **Fire ALL emails simultaneously** — corporate (estimated pattern) AND personal (even if low confidence) at the same time. Don't wait for one to fail. If the personal bounces, it costs nothing. If it lands, you're in their personal inbox.
3. **Platform-specific** — Twitter DM, Instagram DM [MANUAL], etc.
4. **Intake vectors** — agent-outreach, newsletter reply, scheduling link, contact form

### Agent Outreach (automatic from vectors)
If the target's deep recon report (`reports/{slug}-vectors.json`) includes an intake vector
of type `agent` or `chatbot`, the Campaign Agent automatically adds `agent-outreach` as a channel.
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
Campaign Progress: Heera Shah (3/3 channels)
  [x] email — sent (Message ID: abc123)
  [x] linkedin-connect — sent (connection request with note)
  [ ] instagram-dm [MANUAL] — draft ready, queued for Wells

Overall: 2/8 targets completed
  [x] Heera Shah — 3 channels — all done
  [x] Andrew Forde — 2 channels — all done
  [ ] Robert Mill — 0/3 channels — pending
  [ ] Adnaan Khan — 0/4 channels — pending
  ...
```

## Example
```
/byamn campaign
/byamn campaign --auto
/byamn campaign targets/kpmg.json --channel email
/byamn campaign targets/kpmg.json --channel linkedin-connect
```
