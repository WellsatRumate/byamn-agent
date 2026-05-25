import { chromium } from "playwright";
import { readFileSync } from "fs";
import { parseArgs } from "util";

/**
 * li-send.mjs — LinkedIn outreach sender.
 *
 * DEFAULT MODE: connect (sends a CONNECTION REQUEST with a note).
 *   - Prioritizes the "Connect" action (direct, then under "More").
 *   - Only falls back to "Message"/InMail if --mode=message is explicitly set.
 *   - This fixes the prior bug where "Message" was clicked before "Connect",
 *     sending a DM instead of a connection request.
 *
 * --dry-run  : do everything up to (but NOT including) the final send. Fills the
 *              note and screenshots the ready-to-send modal, then holds open.
 *
 * Usage:
 *   node li-send.mjs --url "https://www.linkedin.com/in/slug/" --content-file note.txt --target [recruiter] --dry-run
 *   node li-send.mjs --url "..." --content-file note.txt --target [recruiter]          # REAL connect send
 *   node li-send.mjs --url "..." --content-file msg.txt  --target x --mode message # InMail (explicit)
 */

const { values: args } = parseArgs({
  options: {
    url: { type: "string" },
    "content-file": { type: "string" },
    target: { type: "string", default: "target" },
    mode: { type: "string", default: "connect" }, // connect | message
    "dry-run": { type: "boolean", default: false },
    headless: { type: "boolean", default: false },
    "keep-open-ms": { type: "string", default: "600000" },
  },
});

const content = readFileSync(args["content-file"], "utf-8").trim();
const keepOpenMs = parseInt(args["keep-open-ms"], 10);
const DRY = args["dry-run"];

const context = await chromium.launchPersistentContext("./.browser-data", {
  headless: args.headless,
  viewport: { width: 1400, height: 900 },
  slowMo: args.headless ? 0 : 300,
  args: ["--start-maximized", "--no-sandbox"],
});
const page = context.pages()[0] || await context.newPage();
const shot = (label) => page.screenshot({ path: `output/li-${args.target}-${label}.png`, fullPage: false });

async function finish(reason) {
  console.log(`\n${reason}`);
  console.log(`→ Keeping browser open for ${keepOpenMs / 1000}s. Watch and/or take over manually.`);
  try { await page.waitForTimeout(keepOpenMs); } catch { /* window closed */ }
  await context.close().catch(() => {});
  console.log("Browser closed.");
}
async function finishExit(reason, code = 0) { await finish(reason); process.exit(code); }

console.log(`→ ${args.url}  [mode=${args.mode}${DRY ? ", DRY-RUN" : ""}]`);
await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 60000 });
console.log("→ Waiting 6s for hydration...");
await page.waitForTimeout(6000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1500);
await shot("loaded");

// --- Login-wall detection ---
const loggedOut = await page.evaluate(() => {
  const u = location.href;
  if (/\/(login|authwall|uas\/login|checkpoint)/.test(u)) return true;
  if (document.querySelector('input#username, input[name="session_key"], form.login__form')) return true;
  // logged-in sessions render the global nav with a "Me" menu / feed link
  const loggedIn = document.querySelector('#global-nav, a[href*="/feed"], .global-nav__me');
  return !loggedIn;
});
if (loggedOut) {
  await shot("login-wall");
  await finishExit(
    "⚠️ NOT LOGGED IN — the saved .browser-data session is stale or absent.\n" +
    "   Log into LinkedIn in THIS window now; the session will persist to .browser-data\n" +
    "   for the next run. (Nothing was sent.)"
  );
}

// --- Enumerate top-card actions for logging ---
const topCardSelectors = ['.pv-top-card', 'section.artdeco-card:first-of-type', 'main section:first-of-type', 'main'];
for (const sel of topCardSelectors) {
  const map = await page.evaluate((s) => {
    const card = document.querySelector(s);
    if (!card) return null;
    return Array.from(card.querySelectorAll('button, a[role="button"], div[role="button"]'))
      .filter(b => b.offsetParent !== null)
      .map(b => ({ text: (b.innerText || "").trim().slice(0, 50), aria: b.getAttribute("aria-label") }))
      .filter(b => b.text || b.aria);
  }, sel);
  if (map && map.length) { console.log(`\nTop-card actions via "${sel}":\n${JSON.stringify(map, null, 2)}`); break; }
}

async function clickInTopCard(text) {
  return page.evaluate((q) => {
    const card = document.querySelector('.pv-top-card') || document.querySelector('section.artdeco-card') || document.querySelector('main section');
    if (!card) return false;
    const els = Array.from(card.querySelectorAll('button, a[role="button"], div[role="button"]'));
    const match = els.find(b => {
      if (b.offsetParent === null) return false;
      const t = (b.innerText || "").trim();
      const a = b.getAttribute("aria-label") || "";
      return t === q || t.startsWith(q + " ") || a === q || a.startsWith(q + " ") || a.includes(`${q} `);
    });
    if (match) { match.click(); return true; }
    return false;
  }, text);
}

// ============ ACTION SELECTION — CONNECT FIRST (robust, role-based) ============
// Scope to the profile intro card = the <section> that contains the person's <h1>.
const topCard = page.locator('section').filter({ has: page.locator('h1') }).first();

async function dumpDialog(tag) {
  const dlg = page.locator('[role="dialog"]').last();
  if (!(await dlg.count())) { console.log(`(${tag}) no dialog present`); return null; }
  const btns = await dlg.locator('button').evaluateAll(els =>
    els.filter(b => b.offsetParent !== null)
       .map(b => ({ t: (b.innerText || "").trim().slice(0, 30), a: b.getAttribute("aria-label") }))
       .filter(b => b.t || b.a));
  console.log(`(${tag}) dialog buttons: ${JSON.stringify(btns)}`);
  return dlg;
}

let mode = null;

if (args.mode === "message") {
  const msgBtn = topCard.getByRole('button', { name: /^Message/ });
  if (await msgBtn.count()) { await msgBtn.first().click(); mode = "message"; console.log("→ Clicked: Message (explicit)"); }
} else {
  // Direct Connect in the top card?
  const directConnect = topCard.getByRole('button', { name: /^Connect$/ })
    .or(topCard.locator('button[aria-label^="Invite"][aria-label*="connect"]'));
  if (await directConnect.count() && await directConnect.first().isVisible().catch(() => false)) {
    await directConnect.first().click();
    mode = "connect";
    console.log("→ Clicked: Connect (direct)");
  } else {
    console.log("→ No direct Connect. Opening More…");
    const moreBtn = page.locator('main button[aria-label="More"]')
      .or(page.locator('main').getByRole('button', { name: 'More', exact: true }))
      .or(page.locator('main button[aria-label="More actions"]'));
    console.log("More-button matches: " + (await moreBtn.count()));
    if (!(await moreBtn.count())) {
      const allbtns = await page.locator('main button').evaluateAll(els => els.filter(e => e.offsetParent !== null).slice(0, 30).map(e => ({ t: (e.innerText || "").trim().slice(0, 20), a: e.getAttribute("aria-label") })).filter(x => x.t || x.a));
      console.log("main buttons (diag): " + JSON.stringify(allbtns));
    }
    if (await moreBtn.count()) {
      await moreBtn.first().click();
      await page.waitForTimeout(1300);
      await shot("more-opened");
      // Diagnostic + click in one pass, IN-PAGE. The dropdown Connect lives inline
      // (NOT in the right-sidebar <aside>), so we pick the connect-ish element that is
      // visible and not inside an <aside>. Clicking via element.click() avoids all the
      // brittle container/name selector issues.
      const connectish = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('button, a, [role="button"], [role="menuitem"]').forEach(e => {
          if (e.offsetParent === null) return;
          const t = (e.innerText || "").trim();
          const a = e.getAttribute("aria-label") || "";
          if (/connect|invite/i.test(t) || /connect|invite/i.test(a)) {
            out.push({ t: t.slice(0, 24), a: a.slice(0, 44), inAside: !!e.closest('aside') });
          }
        });
        return out;
      });
      console.log("connect-ish elements: " + JSON.stringify(connectish));
      const clicked = await page.evaluate(() => {
        const cands = [...document.querySelectorAll('[role="button"], [role="menuitem"], button, a')]
          .filter(e => e.offsetParent !== null && !e.closest('aside'));
        const m = cands.find(e => {
          const t = (e.innerText || "").trim();
          const a = e.getAttribute("aria-label") || "";
          return /^Connect$/i.test(t) || (/invite/i.test(a) && /to connect/i.test(a));
        });
        if (m) { m.click(); return { ok: true, t: (m.innerText || "").trim().slice(0, 24), a: m.getAttribute("aria-label") }; }
        return { ok: false };
      });
      console.log("connect click: " + JSON.stringify(clicked));
      if (clicked.ok) {
        mode = "connect";
        console.log("→ Clicked: Connect (in-page, non-sidebar)");
      } else {
        await shot("more-no-connect");
        console.log("⚠️ No non-sidebar Connect element found after opening More.");
      }
    }
  }

  if (!mode) {
    const state = await page.evaluate(() => {
      const t = (document.querySelector('main')?.innerText) || "";
      return { pending: /\bPending\b/.test(t), message: /\bMessage\b/.test(t) };
    });
    await shot("no-connect");
    if (state.pending) await finishExit("ℹ️ Connection already PENDING. Nothing to do.");
    if (state.message) await finishExit("ℹ️ Likely ALREADY CONNECTED. Use --mode=message to DM. Nothing sent.");
    await finishExit("FAIL: no Connect action found. Nothing sent.", 2);
  }
}

if (!mode) { await shot("no-action"); await finishExit("FAIL: requested mode unavailable.", 2); }

await page.waitForTimeout(2000);
await shot("after-action-click");

// ============ MESSAGE MODE ============
if (mode === "message") {
  const input = page.locator('.msg-form__contenteditable [contenteditable="true"], [contenteditable="true"][role="textbox"]').first();
  if (!(await input.count())) { await shot("no-input"); await finishExit("FAIL: message input not found.", 2); }
  await input.click();
  await page.keyboard.type(content, { delay: 20 });
  await page.waitForTimeout(800);
  await shot("typed");
  if (DRY) await finishExit("DRY-RUN (message): typed, NOT sent.");
  const send = page.locator('button.msg-form__send-button, button[type="submit"]:has-text("Send")').first();
  if (await send.count()) { await send.click(); console.log("→ SENT (message)"); }
  else { await page.keyboard.press("Control+Enter"); console.log("→ Ctrl+Enter send"); }
}

// ============ CONNECT MODE ============
else {
  const dialog = page.locator('[role="dialog"]').last();
  await dialog.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
  await shot("connect-modal");
  await dumpDialog("connect-modal");

  // "Add a note" (when LinkedIn offers note vs send-without-note)
  const addNote = dialog.getByRole('button', { name: 'Add a note' });
  if (await addNote.count()) { await addNote.first().click(); await page.waitForTimeout(700); }

  // Note textarea
  const ta = dialog.getByRole('textbox')
    .or(dialog.locator('textarea[name="message"], textarea#custom-message')).first();
  if (await ta.count()) {
    await ta.fill(content.slice(0, 300));
    console.log(`→ Note filled (${Math.min(content.length, 300)} chars)`);
    await shot("note-typed");
  } else {
    console.log("⚠️ Note textarea not found in dialog.");
  }

  // Send button (LinkedIn now uses "Send" or "Send invitation")
  const send = dialog.getByRole('button', { name: /^Send( invitation)?$/ })
    .or(dialog.locator('button[aria-label="Send invitation"], button[aria-label="Send now"]')).first();
  if (!(await send.count())) { await dumpDialog("no-send"); await shot("no-send"); await finishExit("FAIL: Send button not found in dialog. Nothing sent.", 2); }

  if (DRY) {
    await shot("ready-to-send");
    await finishExit(`✅ DRY-RUN complete: invite dialog open, note filled, Send is READY but NOT clicked. See output/li-${args.target}-ready-to-send.png`);
  }
  await send.first().click();
  console.log("→ SENT (connection request WITH note)");
}

await page.waitForTimeout(3000);
await shot("after-send");
await finish("Action complete.");
