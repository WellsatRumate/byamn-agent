#!/usr/bin/env node

/**
 * browse.mjs — Playwright browser automation wrapper for BYAMN
 *
 * Usage:
 *   node scripts/browse.mjs --action linkedin-connect --url "linkedin.com/in/slug" --content "Connection note"
 *   node scripts/browse.mjs --action linkedin-comment --url "linkedin.com/in/slug/recent-activity/" --content "Comment text"
 *   node scripts/browse.mjs --action form-fill --url "careers.kpmg.ca/..." --data '{"name":"Wells","email":"..."}'
 *
 * Always runs in HEADED mode (visible browser) for screen recording.
 */

import { chromium } from "playwright";
import { parseArgs } from "util";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// --- Parse args ---
const { values: args } = parseArgs({
  options: {
    action: { type: "string" },
    url: { type: "string" },
    content: { type: "string" },
    "content-file": { type: "string" },
    data: { type: "string" },
    screenshot: { type: "string" },
    headless: { type: "boolean", default: false },
    "slow-mo": { type: "string", default: "100" },
    timeout: { type: "string", default: "30000" },
  },
});

const VALID_ACTIONS = [
  "linkedin-connect",
  "linkedin-comment",
  "linkedin-dm",
  "twitter-reply",
  "twitter-dm",
  "form-fill",
  "navigate",
  "agent-chat",
];

if (!args.action || !VALID_ACTIONS.includes(args.action)) {
  console.error(`Usage: browse.mjs --action <${VALID_ACTIONS.join("|")}> --url <url> [--content <text>]`);
  process.exit(1);
}

if (!args.url) {
  console.error("--url is required");
  process.exit(1);
}

// Resolve content
let content = args.content || "";
if (args["content-file"]) {
  content = readFileSync(args["content-file"], "utf-8");
}

// Ensure output dir
mkdirSync("output", { recursive: true });

const screenshotPath = args.screenshot || `output/${args.action}-${Date.now()}.png`;
const slowMo = parseInt(args["slow-mo"]);
const timeout = parseInt(args.timeout);

// --- Normalize URL ---
function normalizeUrl(url) {
  if (!url.startsWith("http")) {
    return `https://${url}`;
  }
  return url;
}

// --- Actions ---
async function linkedinConnect(page) {
  console.log("Action: LinkedIn Connect");
  await page.goto(normalizeUrl(args.url), { waitUntil: "domcontentloaded", timeout });

  // Check for login wall
  if (page.url().includes("/login") || page.url().includes("/authwall")) {
    console.error("LOGIN_REQUIRED: LinkedIn requires login. Please log in manually in the browser window.");
    await page.waitForURL("**/in/**", { timeout: 120000 }); // Wait up to 2 min for manual login
  }

  // Look for Connect button
  const connectBtn =
    (await page.$('button[aria-label*="Connect"]')) ||
    (await page.$('button:has-text("Connect")'));

  if (!connectBtn) {
    // Try "More" dropdown
    const moreBtn = await page.$('button[aria-label="More actions"]');
    if (moreBtn) {
      await moreBtn.click();
      await page.waitForTimeout(500);
      const connectInMenu = await page.$('div[role="menuitem"]:has-text("Connect")');
      if (connectInMenu) {
        await connectInMenu.click();
      } else {
        throw new Error("Connect option not found in More menu");
      }
    } else {
      throw new Error("Connect button not found — may already be connected or pending");
    }
  } else {
    await connectBtn.click();
  }

  await page.waitForTimeout(1000);

  // Add note
  const addNoteBtn = await page.$('button[aria-label="Add a note"]');
  if (addNoteBtn) {
    await addNoteBtn.click();
    await page.waitForTimeout(500);

    const noteInput = await page.$('textarea[name="message"]');
    if (noteInput) {
      await noteInput.fill(content.slice(0, 300)); // 300 char limit
    }

    // Send
    const sendBtn = await page.$('button[aria-label="Send invitation"]') ||
                    await page.$('button:has-text("Send")');
    if (sendBtn) {
      await sendBtn.click();
      console.log("Connection request sent with note.");
    }
  } else {
    console.log("No 'Add a note' option — sending without note.");
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot: ${screenshotPath}`);
}

async function linkedinComment(page) {
  console.log("Action: LinkedIn Comment");
  await page.goto(normalizeUrl(args.url), { waitUntil: "domcontentloaded", timeout });

  if (page.url().includes("/login") || page.url().includes("/authwall")) {
    console.error("LOGIN_REQUIRED: Please log in manually.");
    await page.waitForURL("**/in/**", { timeout: 120000 });
    await page.goto(normalizeUrl(args.url), { waitUntil: "domcontentloaded", timeout });
  }

  // Find first post's comment button
  const commentBtn = await page.$('button[aria-label*="Comment"]');
  if (!commentBtn) throw new Error("Comment button not found");

  await commentBtn.click();
  await page.waitForTimeout(1000);

  // Type comment
  const commentBox = await page.$('.comments-comment-box__form [contenteditable="true"]') ||
                     await page.$('[contenteditable="true"]');
  if (!commentBox) throw new Error("Comment box not found");

  await commentBox.click();
  await page.keyboard.type(content, { delay: 30 });

  // Post
  const postBtn = await page.$('button.comments-comment-box__submit-button') ||
                  await page.$('button:has-text("Post")');
  if (postBtn) {
    await postBtn.click();
    console.log("Comment posted.");
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot: ${screenshotPath}`);
}

async function linkedinDm(page) {
  console.log("Action: LinkedIn DM");
  await page.goto(normalizeUrl(args.url), { waitUntil: "domcontentloaded", timeout });

  if (page.url().includes("/login") || page.url().includes("/authwall")) {
    console.error("LOGIN_REQUIRED: Please log in manually.");
    await page.waitForURL("**/in/**", { timeout: 120000 });
    await page.goto(normalizeUrl(args.url), { waitUntil: "domcontentloaded", timeout });
  }

  const messageBtn = await page.$('button:has-text("Message")');
  if (!messageBtn) throw new Error("Message button not found — may not be a 1st-degree connection");

  await messageBtn.click();
  await page.waitForTimeout(1500);

  const messageInput = await page.$('.msg-form__contenteditable [contenteditable="true"]') ||
                       await page.$('[contenteditable="true"]');
  if (!messageInput) throw new Error("Message input not found");

  await messageInput.click();
  await page.keyboard.type(content, { delay: 20 });

  const sendBtn = await page.$('button.msg-form__send-button') ||
                  await page.$('button[type="submit"]:has-text("Send")');
  if (sendBtn) {
    await sendBtn.click();
    console.log("DM sent.");
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot: ${screenshotPath}`);
}

async function twitterReply(page) {
  console.log("Action: Twitter Reply");
  await page.goto(normalizeUrl(args.url), { waitUntil: "domcontentloaded", timeout });

  if (page.url().includes("/login") || page.url().includes("/i/flow/login")) {
    console.error("LOGIN_REQUIRED: Please log in manually.");
    await page.waitForURL("**/status/**", { timeout: 120000 });
  }

  const replyBtn = await page.$('[data-testid="reply"]');
  if (!replyBtn) throw new Error("Reply button not found");

  await replyBtn.click();
  await page.waitForTimeout(1000);

  const replyInput = await page.$('[data-testid="tweetTextarea_0"]');
  if (!replyInput) throw new Error("Reply input not found");

  await replyInput.click();
  await page.keyboard.type(content.slice(0, 280), { delay: 30 });

  const submitBtn = await page.$('[data-testid="tweetButton"]');
  if (submitBtn) {
    await submitBtn.click();
    console.log("Reply posted.");
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot: ${screenshotPath}`);
}

async function twitterDm(page) {
  console.log("Action: Twitter DM");
  await page.goto("https://x.com/messages", { waitUntil: "domcontentloaded", timeout });

  if (page.url().includes("/login") || page.url().includes("/i/flow/login")) {
    console.error("LOGIN_REQUIRED: Please log in manually.");
    await page.waitForURL("**/messages**", { timeout: 120000 });
  }

  // Click new message
  const newMsg = await page.$('[data-testid="NewDM_Button"]') ||
                 await page.$('a[href="/messages/compose"]');
  if (newMsg) await newMsg.click();
  await page.waitForTimeout(1000);

  // Search for user
  const searchInput = await page.$('[data-testid="searchPeople"]');
  if (searchInput) {
    await searchInput.fill(args.url); // url used as the handle/name here
    await page.waitForTimeout(1500);
    const firstResult = await page.$('[data-testid="TypeaheadUser"]');
    if (firstResult) await firstResult.click();
  }

  const nextBtn = await page.$('[data-testid="nextButton"]');
  if (nextBtn) await nextBtn.click();
  await page.waitForTimeout(1000);

  const dmInput = await page.$('[data-testid="dmComposerTextInput"]');
  if (!dmInput) throw new Error("DM input not found — user may not accept DMs");

  await dmInput.click();
  await page.keyboard.type(content, { delay: 20 });

  const sendBtn = await page.$('[data-testid="dmComposerSendButton"]');
  if (sendBtn) {
    await sendBtn.click();
    console.log("DM sent.");
  }

  await page.waitForTimeout(2000);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot: ${screenshotPath}`);
}

async function formFill(page) {
  console.log("Action: Form Fill");
  await page.goto(normalizeUrl(args.url), { waitUntil: "domcontentloaded", timeout });

  let formData = {};
  if (args.data) {
    try {
      formData = JSON.parse(args.data);
    } catch (err) {
      console.error(`Invalid JSON in --data: ${err.message}`);
      process.exit(1);
    }
  }

  // Auto-fill common fields
  const fieldMap = {
    'input[name*="first"]': formData.firstName || formData.name?.split(" ")[0] || "",
    'input[name*="last"]': formData.lastName || formData.name?.split(" ").slice(1).join(" ") || "",
    'input[name*="email"]': formData.email || "",
    'input[name*="phone"]': formData.phone || "",
    'input[name*="linkedin"]': formData.linkedin || "",
  };

  for (const [selector, value] of Object.entries(fieldMap)) {
    if (!value) continue;
    const field = await page.$(selector);
    if (field) {
      await field.fill(value);
      console.log(`Filled: ${selector}`);
    }
  }

  // Screenshot before submit (ALWAYS)
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot (pre-submit): ${screenshotPath}`);
  console.log("WAITING_FOR_CONFIRMATION: Form filled. Review screenshot and confirm before submitting.");

  // Do NOT auto-submit — human must confirm
}

async function navigate(page) {
  console.log("Action: Navigate");
  await page.goto(normalizeUrl(args.url), { waitUntil: "domcontentloaded", timeout });
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot: ${screenshotPath}`);
}

async function agentChat(page) {
  console.log("Action: Agent-to-Agent Chat");
  console.log("Target chatbot URL:", args.url);
  await page.goto(normalizeUrl(args.url), { waitUntil: "domcontentloaded", timeout });

  // Wait for page to fully render (chatbots often load async)
  await page.waitForTimeout(3000);

  // Screenshot the page before interaction
  const preScreenshot = screenshotPath.replace(".png", "-pre.png");
  await page.screenshot({ path: preScreenshot, fullPage: false });
  console.log(`Screenshot (pre-chat): ${preScreenshot}`);

  // Common chatbot widget selectors — try each in order
  const chatTriggers = [
    // Intercom
    '[class*="intercom-launcher"]',
    'iframe[name="intercom_frame"]',
    // Drift
    '#drift-widget',
    '[class*="drift-"]',
    // Crisp
    '[class*="crisp-client"]',
    '#crisp-chatbox',
    // Tidio
    '#tidio-chat',
    '[class*="tidio"]',
    // Tawk.to
    '#tawk-bubble-container',
    '[class*="tawk-"]',
    // Voiceflow
    '#voiceflow-chat',
    '[id*="voiceflow"]',
    // Generic chatbot patterns
    '[class*="chat-widget"]',
    '[class*="chatbot"]',
    '[class*="chat-bubble"]',
    '[class*="chat-launcher"]',
    '[aria-label*="chat"]',
    '[aria-label*="Chat"]',
    'button[class*="chat"]',
    // Embedded iframe chatbots
    'iframe[src*="chat"]',
  ];

  // Try to find and open the chat widget
  let chatOpened = false;
  for (const selector of chatTriggers) {
    const el = await page.$(selector);
    if (el) {
      console.log(`  Found chat trigger: ${selector}`);
      try {
        await el.click();
        chatOpened = true;
        await page.waitForTimeout(2000);
        break;
      } catch (err) {
        // Element found but not clickable — try next selector
        console.log(`  Selector found but click failed: ${err.message?.slice(0, 40)}`);
      }
    }
  }

  // Check for iframes (many chatbots live in iframes)
  if (!chatOpened) {
    const frames = page.frames();
    for (const frame of frames) {
      if (frame.url().includes("chat") || frame.url().includes("widget") ||
          frame.url().includes("intercom") || frame.url().includes("drift") ||
          frame.url().includes("crisp") || frame.url().includes("voiceflow")) {
        console.log(`  Found chatbot iframe: ${frame.url()}`);
        // Try to find input within the frame
        const input = await frame.$('input[type="text"]') ||
                      await frame.$('textarea') ||
                      await frame.$('[contenteditable="true"]');
        if (input) {
          await input.click();
          await page.keyboard.type(content, { delay: 25 });
          // Look for send button in the frame
          const send = await frame.$('button[type="submit"]') ||
                       await frame.$('button[aria-label*="send" i]') ||
                       await frame.$('button[aria-label*="Send" i]');
          if (send) {
            await send.click();
            console.log("  Message sent via iframe chatbot.");
            chatOpened = true;
          }
          break;
        }
      }
    }
  }

  if (!chatOpened) {
    // Fallback: look for any visible text input + send button on the page
    console.log("  No standard chatbot widget found. Trying generic input detection...");

    const inputs = await page.$$('input[type="text"], textarea, [contenteditable="true"]');
    for (const input of inputs) {
      const isVisible = await input.isVisible();
      if (isVisible) {
        const placeholder = await input.getAttribute("placeholder") || "";
        const ariaLabel = await input.getAttribute("aria-label") || "";
        const combined = (placeholder + ariaLabel).toLowerCase();

        if (combined.includes("message") || combined.includes("chat") ||
            combined.includes("type") || combined.includes("ask") ||
            combined.includes("question") || combined.includes("say")) {
          console.log(`  Found chat input: placeholder="${placeholder}"`);
          await input.click();
          await page.keyboard.type(content, { delay: 25 });

          // Find send button nearby
          const sendBtns = await page.$$('button');
          for (const btn of sendBtns) {
            const btnVisible = await btn.isVisible();
            if (!btnVisible) continue;
            const btnText = (await btn.textContent() || "").toLowerCase();
            const btnLabel = (await btn.getAttribute("aria-label") || "").toLowerCase();
            if (btnText.includes("send") || btnLabel.includes("send") ||
                btnText.includes("submit") || btnLabel.includes("submit")) {
              await btn.click();
              console.log("  Message sent via generic input.");
              chatOpened = true;
              break;
            }
          }

          // If no labeled send button, try pressing Enter
          if (!chatOpened) {
            await page.keyboard.press("Enter");
            console.log("  Message sent via Enter key.");
            chatOpened = true;
          }
          break;
        }
      }
    }
  }

  if (!chatOpened) {
    console.log("  WARNING: Could not find chatbot input. Page may need manual interaction.");
    console.log("  WAITING_FOR_CONFIRMATION: Locate the chat input manually in the browser window.");
  }

  // Wait for any response from the chatbot
  await page.waitForTimeout(3000);

  // Take final screenshot (proof of interaction for screen recording)
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot (post-chat): ${screenshotPath}`);

  if (chatOpened) {
    console.log("Agent-to-agent chat completed.");
  }
}

// --- Main ---
async function main() {
  console.log(`\nBYAMN Browser Agent`);
  console.log(`Action: ${args.action}`);
  console.log(`URL: ${args.url}`);
  console.log(`Headed: ${!args.headless}`);

  // Use persistent context to preserve login sessions
  const userDataDir = join(process.cwd(), ".browser-data");
  mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: args.headless,
    slowMo,
    viewport: { width: 1280, height: 900 },
    args: ["--start-maximized"],
  });

  const page = await context.newPage();

  try {
    const actions = {
      "linkedin-connect": linkedinConnect,
      "linkedin-comment": linkedinComment,
      "linkedin-dm": linkedinDm,
      "twitter-reply": twitterReply,
      "twitter-dm": twitterDm,
      "form-fill": formFill,
      "navigate": navigate,
      "agent-chat": agentChat,
    };

    await actions[args.action](page);

    console.log(JSON.stringify({
      success: true,
      action: args.action,
      url: args.url,
      screenshot: screenshotPath,
      timestamp: new Date().toISOString(),
    }));
  } catch (err) {
    console.error(`Action failed: ${err.message}`);
    // Still take a screenshot on failure
    await page.screenshot({ path: screenshotPath.replace(".png", "-error.png"), fullPage: false });
    console.log(JSON.stringify({
      success: false,
      action: args.action,
      url: args.url,
      error: err.message,
      screenshot: screenshotPath.replace(".png", "-error.png"),
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error("Browser failed:", err.message);
  process.exit(1);
});
