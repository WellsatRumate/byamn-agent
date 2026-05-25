# Mode: Send

## Purpose
Send a drafted message via Gmail with the agent signature appended.

## Input
- Draft file path (required) — path to a file in `drafts/`
- OR target name + approach (to auto-resolve the draft path)

## Process

1. **Read the draft** from `drafts/{target-slug}-{approach}.md`
2. **Extract** subject line and message body
3. **Resolve recipient email** from targets/*.json or research report
4. **Append agent signature:**
   ```
   ---
   This message was researched, drafted, and sent by an AI outreach agent
   built by Wells Mensah. The agent is the application.

   Wells Mensah | AI Builder, Creative Strategist & Marketing Specialist | rumate.io/intelligence
   ```
5. **Display the complete message** (body + signature) for human review
6. **Wait for confirmation** — NEVER send without explicit "yes" / "send" / "approve"
7. **Call `scripts/send-gmail.mjs`** with:
   - `--to` recipient email
   - `--subject` subject line
   - `--body` full message (body + signature)
8. **Log to campaign-log.md:**
   - Date, target, approach, channel (email), status (sent), Gmail message ID
9. **Report result** — sent confirmation with message ID

## Safety
- ALWAYS show the full message before sending
- ALWAYS wait for human confirmation
- If no email address is available, report this and suggest finding it via recon
- If Gmail OAuth is not set up, guide the user through setup

## Example
```
/byamn send "drafts/[research-director]-[research-director]-value.md"
/byamn send "[research-director]" -a value
```
