# LinkedIn Navigation Context

## Profile Page
- Profile URL pattern: `linkedin.com/in/{slug}`
- Connect button: usually in the top card, may say "Connect" or "More → Connect"
- If "Follow" shows instead of "Connect", click "More" dropdown → "Connect"
- Add note: after clicking Connect, look for "Add a note" button before sending
- Note limit: 300 characters
- "Message" button appears for 1st-degree connections

## Sending a Connection Request
1. Navigate to `linkedin.com/in/{slug}`
2. Wait for page load (profile card visible)
3. Look for "Connect" button in the profile action bar
4. If not visible, click "More" dropdown → "Connect"
5. Dialog appears: "Add a note" or "Send without a note"
6. Click "Add a note"
7. Type note in the text area (300 char max)
8. Click "Send"
9. Confirmation: button changes to "Pending"

## Posting a Comment
1. Navigate to target's activity: `linkedin.com/in/{slug}/recent-activity/`
2. Scroll to find the target post
3. Click "Comment" icon under the post
4. Comment box appears (contenteditable div)
5. Type comment text
6. Click "Post" button (may be "Submit" on some layouts)
7. Comment appears in the thread

## Sending a Message (DM)
1. Must be 1st-degree connection to DM freely
2. If not connected: use InMail (requires Premium) or connect first
3. Navigate to `linkedin.com/messaging/` or click "Message" on profile
4. Message composer appears at bottom of chat window
5. Type message in the input field
6. Click send button (paper plane icon)

## Searching for a Profile
1. Navigate to `linkedin.com/search/results/people/`
2. Use the search bar at top: type "{name} {company}"
3. Results show profile cards with name, title, company
4. Click the matching profile

## Common Failures
- **Login wall**: LinkedIn shows login page if not signed in → agent should flag and ask user to log in
- **Rate limiting**: ~100 connection requests/week → space them out
- **"Pending" connections**: Can't re-send → skip and note in log
- **Premium gate**: InMail requires LinkedIn Premium → note in log if needed
- **CAPTCHA**: Occasionally triggered → pause and ask user to solve
- **Profile not found**: Search may return wrong person → verify title and company match

## Selectors (may change — verify at runtime)
- Connect button: `button[aria-label*="Connect"]` or within `.pvs-profile-actions`
- Add note button: `button[aria-label="Add a note"]`
- Note text area: `textarea[name="message"]` in the connect dialog
- Comment box: `.comments-comment-box__form` contenteditable
- Message input: `.msg-form__contenteditable`
