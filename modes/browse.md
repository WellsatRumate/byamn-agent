# Mode: Browse

## Purpose
Execute browser-based outreach actions using Playwright (headed mode for screen recording).

## Input
- Action type (required): linkedin-connect, linkedin-comment, linkedin-dm, twitter-reply, form-fill
- Target name (required)
- Content (required for messages/comments) — draft text or draft file path

## Process

1. **Read the relevant playbook:**
   - `linkedin-*` actions → read `playbooks/linkedin.md`
   - `twitter-*` actions → read `playbooks/twitter.md`
   - `form-fill` → read `playbooks/career-portals.md`

2. **Resolve target URL:**
   - Check `targets/*.json` for LinkedIn/Twitter URLs
   - If URL is "search: ...", navigate to LinkedIn/Twitter search first

3. **Launch Playwright** via `scripts/browse.mjs`:
   - `--action` action type
   - `--url` target URL
   - `--content` message/comment text
   - `--headed` always (for screen recording)
   - `--screenshot` path to save screenshot

4. **Execute the action** (see action specs below)

5. **Take screenshot** for proof — save to `output/{target-slug}-{action}-{timestamp}.png`

6. **Log to campaign-log.md**

## Action Specs

### linkedin-connect
1. Navigate to target's LinkedIn profile
2. Click "Connect" (or "More → Connect" if hidden)
3. Click "Add a note"
4. Type the connection note (300 char max)
5. Click "Send"
6. Screenshot the confirmation

### linkedin-comment
1. Navigate to target's recent activity page
2. Find the specified post (or most recent)
3. Click "Comment"
4. Type the comment
5. Click "Post"
6. Screenshot the posted comment

### linkedin-dm
1. Navigate to target's profile
2. Click "Message"
3. Type the message
4. Click "Send"
5. Screenshot the sent message

### twitter-reply
1. Navigate to the target tweet URL
2. Click "Reply"
3. Type the reply
4. Click "Reply" to submit
5. Screenshot the posted reply

### form-fill
1. Navigate to the form URL
2. Fill fields using cv.md and cover-letter.md data
3. Upload resume PDF if field exists
4. Screenshot before submission
5. Wait for human confirmation before clicking submit

## Safety
- ALWAYS run in headed mode (visible browser)
- For form-fill, ALWAYS screenshot and confirm before submitting
- If login is required, pause and ask the user to log in manually
- If rate-limited or blocked, report and suggest waiting

## Example
```
/byamn browse linkedin-connect "Andrew Forde" --content "Hi Andrew — built an AI outreach agent as my KPMG application. Would love to connect."
```
