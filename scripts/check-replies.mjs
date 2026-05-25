#!/usr/bin/env node

/**
 * check-replies.mjs — Gmail reply detector + follow-up reminder
 *
 * Reads campaign-log.md for sent message IDs, checks Gmail threads
 * for replies, and flags targets overdue for follow-up.
 *
 * Usage:
 *   node scripts/check-replies.mjs                # check all sent messages
 *   node scripts/check-replies.mjs --follow-up 3  # flag targets with no response after N days (default 3)
 *
 * No arguments needed — reads campaign-log.md and gmail token automatically.
 */

import "dotenv/config";
import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { parseArgs } from "util";

const { values: args } = parseArgs({
  options: {
    "follow-up": { type: "string", default: "3" },
    json: { type: "boolean", default: false },
  },
});

const CREDENTIALS_PATH = "config/gmail-credentials.json";
const TOKEN_PATH = "config/gmail-token.json";
const CAMPAIGN_LOG = "data/campaign-log.md";
const SENT_LOG = "vault/drafts/sent-log.md";
const FOLLOW_UP_DAYS = parseInt(args["follow-up"]);

// --- Auth ---
function getGmailClient() {
  if (!existsSync(CREDENTIALS_PATH) || !existsSync(TOKEN_PATH)) {
    console.error("Gmail credentials not found. Run send-gmail.mjs first to authenticate.");
    process.exit(1);
  }

  const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_id, client_secret } = credentials.installed || credentials.web;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, "http://localhost:3847/oauth2callback");
  oauth2Client.setCredentials(JSON.parse(readFileSync(TOKEN_PATH, "utf-8")));

  return google.gmail({ version: "v1", auth: oauth2Client });
}

// --- Parse campaign log for sent messages ---
function parseSentMessages() {
  if (!existsSync(CAMPAIGN_LOG)) {
    console.error("No campaign log found at", CAMPAIGN_LOG);
    return [];
  }

  const content = readFileSync(CAMPAIGN_LOG, "utf-8");
  const lines = content.split("\n").filter((l) => l.includes("| sent |") || l.includes("| email |"));

  const messages = [];
  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 6) continue;

    const [num, date, target, approach, channel, status, notes] = parts;
    if (channel !== "email" || status !== "sent") continue;

    // Extract message ID from notes
    const idMatch = notes?.match(/ID:\s*([a-f0-9]+)/i);
    if (!idMatch) continue;

    messages.push({
      num: parseInt(num),
      date,
      target,
      approach,
      channel,
      messageId: idMatch[1],
      notes,
      daysSinceSent: Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)),
    });
  }

  return messages;
}

// --- Check Gmail thread for replies ---
async function checkForReply(gmail, messageId) {
  try {
    // Get the original message to find its thread ID
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "To", "Date"],
    });

    const threadId = msg.data.threadId;

    // Get the full thread
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "To", "Date"],
    });

    const messages = thread.data.messages || [];

    if (messages.length <= 1) {
      return { replied: false, threadId, messageCount: messages.length };
    }

    // Find replies (messages after the original that aren't from us)
    const originalDate = parseInt(msg.data.internalDate);
    const replies = [];

    for (const m of messages) {
      if (m.id === messageId) continue;
      if (parseInt(m.internalDate) <= originalDate) continue;

      const headers = {};
      for (const h of m.payload?.headers || []) {
        headers[h.name.toLowerCase()] = h.value;
      }

      // Check if the reply is FROM someone else (not us)
      const from = headers.from || "";
      if (!from.includes("wells.mensah@gmail.com")) {
        replies.push({
          id: m.id,
          from,
          date: new Date(parseInt(m.internalDate)).toISOString(),
          subject: headers.subject || "(no subject)",
        });
      }
    }

    return {
      replied: replies.length > 0,
      threadId,
      messageCount: messages.length,
      replies,
    };
  } catch (err) {
    return { replied: false, error: err.message };
  }
}

// --- Main ---
async function main() {
  const gmail = getGmailClient();
  const sentMessages = parseSentMessages();

  if (sentMessages.length === 0) {
    console.log("[CHECK-REPLIES] No sent emails found in campaign log.");
    process.exit(0);
  }

  console.log(`[CHECK-REPLIES] Checking ${sentMessages.length} sent email(s)...\n`);

  const results = [];
  const replies = [];
  const overdue = [];

  for (const msg of sentMessages) {
    process.stdout.write(`  ${msg.target} (${msg.date})...`);

    const result = await checkForReply(gmail, msg.messageId);
    results.push({ ...msg, ...result });

    if (result.replied) {
      console.log(` ✓ REPLIED! ${result.replies.length} response(s)`);
      for (const r of result.replies) {
        console.log(`    From: ${r.from}`);
        console.log(`    Date: ${r.date}`);
        console.log(`    Subject: ${r.subject}`);
      }
      replies.push({ ...msg, ...result });
    } else if (result.error) {
      console.log(` (error: ${result.error.slice(0, 50)})`);
    } else if (msg.daysSinceSent >= FOLLOW_UP_DAYS) {
      console.log(` — NO RESPONSE (${msg.daysSinceSent} days, overdue for follow-up)`);
      overdue.push(msg);
    } else {
      console.log(` — no response yet (${msg.daysSinceSent} day(s), follow-up in ${FOLLOW_UP_DAYS - msg.daysSinceSent} day(s))`);
    }
  }

  // Summary
  console.log(`\n[CHECK-REPLIES] Summary:`);
  console.log(`  Sent messages checked: ${sentMessages.length}`);
  console.log(`  Replies received: ${replies.length}`);
  console.log(`  Overdue for follow-up (${FOLLOW_UP_DAYS}+ days): ${overdue.length}`);

  if (replies.length > 0) {
    console.log(`\n  === REPLIES ===`);
    for (const r of replies) {
      console.log(`  ${r.target} responded! Check Gmail thread ${r.threadId}`);
    }
  }

  if (overdue.length > 0) {
    console.log(`\n  === FOLLOW-UP NEEDED ===`);
    for (const o of overdue) {
      console.log(`  ${o.target} — sent ${o.date} (${o.daysSinceSent} days ago) — no response`);
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ replies, overdue, checked: sentMessages.length }));
  }
}

main().catch((err) => {
  console.error("[CHECK-REPLIES] Failed:", err.message);
  process.exit(1);
});
