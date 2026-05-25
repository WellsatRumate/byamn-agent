# LinkedIn Navigation Context

## Profile Page
- Profile URL pattern: `linkedin.com/in/{slug}`
- Profile action bar (Message / Connect / Follow / More) sits in the top card of `<main>`
- For 1st-degree connections: a primary **Message** button is shown
- For non-connections with Premium (InMail credits available): a **Message** *link* shows in the same spot
- For non-connections without Premium: **Connect** is the primary action; Message is hidden
- **Note limit on connect requests: 300 characters**

## ⭐ UNIVERSAL RULE: Filter Out `<aside>` Sidebar Decoys (verified 2026-05-28)

Every LinkedIn profile renders **decoy action buttons in the right sidebar** ("People also
viewed" / "More profiles for you"). These include **Connect**, **Follow**, and **Message**
buttons — but for OTHER people, not the profile owner. Clicking one sends a request to the
wrong person.

**Rule: before clicking ANY profile action, exclude elements inside `<aside>`.** This is
universal, not target-specific. The owner's actions live inline in `<main>`; the decoys live
in `<aside>`. Structural (`!e.closest('aside')`) beats positional (Y-coordinate) filtering —
prefer it everywhere below.

## ⭐ NO-ARIA-LABEL REALITY: use in-page `evaluate`, not role/aria selectors (verified 2026-05-28)

LinkedIn's **overflow ("More" / 3-dots) menu items often have NO aria-label and are not
reliable `role="menuitem"`**. The dropdown "Connect" item is literally `text="Connect"` with
`aria-label=null`. So `getByRole`, `[aria-label*=...]`, name-scoping, and `[role="menuitem"]`
all match ZERO. Container classes (`.artdeco-dropdown__content--is-open`) also rotate and miss.

**DEFAULT approach (not a fallback) for overflow-menu actions: in-page `page.evaluate()` with
innerText matching + `!e.closest('aside')` filtering, clicking the element directly:**

```js
// The 3-dots button DOES have aria-label="More"
await page.locator('main button[aria-label="More"]').first().click();
await page.waitForTimeout(1300);

// Dropdown Connect: visible, NOT in <aside>, text "Connect" (no aria-label needed)
const clicked = await page.evaluate(() => {
  const cands = [...document.querySelectorAll('[role="button"],[role="menuitem"],button,a')]
    .filter(e => e.offsetParent !== null && !e.closest('aside'));
  const m = cands.find(e => {
    const t = (e.innerText || "").trim();
    const a = e.getAttribute("aria-label") || "";
    return /^Connect$/i.test(t) || (/invite/i.test(a) && /to connect/i.test(a));
  });
  if (m) { m.click(); return true; }
  return false;
});
```

This is the source of truth for clicking obfuscated LinkedIn controls. Dump first if it misses (see Debugging Pattern).

## How LinkedIn Renders the Profile Message Element (verified 2026-05-25)

| Account state | DOM element | Accessible role | Send mechanism |
|---|---|---|---|
| 1st-degree connection | `<button>` | `button` named "Message" | DM panel, free |
| Non-connection + Premium InMail | `<a>` | `link` named "Message" | InMail panel, uses credits |
| Non-connection without Premium | (no Message; only Connect) | — | Need to connect first |

**Always use `getByRole('link' | 'button', { name: 'Message' })` and check BOTH role variants.** A profile can be either depending on the viewer's relationship.

## The Multi-Match Trap

A LinkedIn profile page exposes **multiple elements named "Message"**. They live at predictable Y coordinates:

| Y range | Element | Action if clicked |
|---|---|---|
| `y < 50` | Top-nav "Messaging" link | Goes to /messaging/ inbox |
| `y 100–700` | **Profile action bar** ⭐ | Opens DM/InMail to the profile owner |
| `y 700–800` | Sidebar "People also viewed" entries (with `aria-label="Message <Name>"`) | Opens DM to a recommended person |
| `y > 800` | Floating "Compose message" overlay (bottom-right) | Opens new-DM picker |

**The right one to click has these properties:**
- `box.y > 100 && box.y < 700`
- `text === "Message"` (exact, not partial)
- `aria-label` is `null` or `"Message"` (not `"Message <Name>"`)

## Working Selector Pattern (Playwright)

```js
// Get all Message-named link and button candidates
const linkCandidates = await page.getByRole('link', { name: 'Message' }).all();
const btnCandidates  = await page.getByRole('button', { name: 'Message' }).all();
const all = [...linkCandidates, ...btnCandidates];

// Filter to the profile-action one by position + text
let profileMessage = null;
for (const el of all) {
  const box  = await el.boundingBox();
  const text = (await el.innerText()).trim();
  const aria = await el.getAttribute('aria-label');
  if (box && box.y > 100 && box.y < 700 && text === 'Message' && (!aria || aria === 'Message')) {
    profileMessage = el;
    break;
  }
}
if (!profileMessage) throw new Error('Could not locate profile-action Message element');
await profileMessage.click();
```

**Do not use** the project's older `button:has-text("Message")` or `button[aria-label*="Message"]` patterns — both match the wrong instance on Premium accounts.

## Sending the Message

After clicking, a compose dialog appears. Pattern:

```js
// Input is a contenteditable, not a textarea
const input = page.locator('[contenteditable="true"][role="textbox"]').first();
await input.click();
await page.keyboard.type(messageText, { delay: 22 });

// Send button: class is `msg-form__send-btn` (singular "btn", not "button")
// It is an icon-only button with no accessible "Send" name, so getByRole misses it
const sendBtn = page.locator('button.msg-form__send-btn').first();
if (await sendBtn.isVisible() && await sendBtn.isEnabled()) {
  await sendBtn.click();
} else {
  // Reliable fallback: LinkedIn accepts Ctrl+Enter in the composer
  await page.keyboard.press('Control+Enter');
}
```

## Sending a Connection Request (verified 2026-05-28 — supersedes the 05-25 notes)

1. Navigate to `linkedin.com/in/{slug}`, wait ~6s for hydration.
2. Check the login wall first (see Recovery table).
3. **Connect is usually under "More"**, not a top-level button. Click `main button[aria-label="More"]`.
4. Click the dropdown **Connect** using the in-page `evaluate` + `!closest('aside')` pattern above. The item has **no aria-label** — innerText `"Connect"` is the only signal.
5. The invite modal opens with buttons: **Dismiss**, **Send without a note**, **Add a note**.
6. Click **Add a note** (`dialog.getByRole('button', { name: 'Add a note' })`).
7. Fill the note via the dialog's textbox: `dialog.getByRole('textbox')` — **NOT** `textarea[name="message"]` (stale). Max 300 chars.
8. Click **Send** — the button is now labelled **"Send"**, NOT "Send invitation". Match `getByRole('button', { name: /^Send( invitation)?$/ })`.
9. A note requires Premium; without it only "Send without a note" may appear. Button changes to "Pending" on success.

Reference implementation: `li-send.mjs` (default `--mode=connect`, supports `--dry-run`).

## Posting a Comment

1. Navigate to target's activity: `linkedin.com/in/{slug}/recent-activity/`
2. Find the target post in the feed
3. Click the post's Comment icon (avoid sidebar elements)
4. Comment box appears: `.comments-comment-box__form` contenteditable
5. Type content, click Post

## Searching for a Profile

1. `linkedin.com/search/results/people/`
2. Type `{name} {company}` in the search bar
3. Click the result whose title and company match — verify both before clicking

## Common Failures & Recovery

| Failure | Recovery |
|---|---|
| Login wall | LinkedIn redirected to `/login` or `/authwall`. Use `chromium.launchPersistentContext("./.browser-data", ...)` so cookies persist between runs. Re-login manually if needed. |
| Rate limit on connections (~100/week) | Space out connection requests. Track in campaign-log. |
| Pending connection | Skip and note; can't re-send. |
| Premium gate on Message | Connect first, then DM after acceptance. |
| CAPTCHA | Pause, ask Wells to solve interactively. |
| Profile not found | Verify slug, title, and company before sending. |

## Debugging Pattern (use this every time selectors fail)

When a click target isn't found, **don't iterate on selectors blindly**. Dump first:

```js
const matches = await page.getByRole('link', { name: 'Message' }).all();
for (const m of matches) {
  const box  = await m.boundingBox();
  const text = (await m.innerText()).trim();
  const aria = await m.getAttribute('aria-label');
  console.log({ text, aria, x: box?.x, y: box?.y });
}
```

A 10-line dump beats 30 minutes of selector guessing. The accessibility-tree state is the source of truth — class names rotate, text and roles are stable.

## Anti-Patterns (do NOT use)

- **Clicking without excluding `<aside>`** — the #1 cause of wrong-person requests. Sidebar has decoy Connect/Message/Follow buttons for *other* people. Always `!e.closest('aside')`.
- `getByRole` / `[aria-label*=...]` / `[role="menuitem"]` / name-scoping for **overflow-menu items** — they have no aria-label; matches ZERO. Use in-page `evaluate` + innerText + `!closest('aside')`.
- `button[aria-label="Send invitation"]` — stale; LinkedIn now labels it **"Send"**.
- `textarea[name="message"]` for the note — stale; use the dialog's `getByRole('textbox')`.
- `.artdeco-dropdown__content--is-open` to scope the dropdown — class rotated; reads empty.
- `button:has-text("Message")` — matches the bottom-right floating Compose button, not the profile.
- `.pv-top-card *` — class is stale; LinkedIn rotated DOM class names.
- Y-coordinate filtering as the *primary* discriminator — brittle across viewports; prefer the structural `!closest('aside')` rule.

## See Also

- [[../vault/journal/linkedin-campaign-log]] — 2026-05-25 debugging journey + working code
- `li-demo.mjs` — reference implementation of the Y-filtered picker
