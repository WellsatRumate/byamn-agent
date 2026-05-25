#!/usr/bin/env node

/**
 * send-gmail.mjs — Gmail API sender for BYAMN
 *
 * Usage:
 *   node scripts/send-gmail.mjs --to "email@example.com" --subject "Subject" --body "Message body"
 *   node scripts/send-gmail.mjs --to "email@example.com" --subject "Subject" --body-file "drafts/draft.md"
 *
 * First run: opens browser for OAuth2 consent flow.
 * Subsequent runs: uses stored token.
 */

import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createServer } from "http";
import { URL } from "url";
import { parseArgs } from "util";
import open from "open";

// --- Config ---
const CREDENTIALS_PATH = "config/gmail-credentials.json";
const TOKEN_PATH = "config/gmail-token.json";
const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

const AGENT_SIGNATURE = `
---
This message was researched, drafted, and sent by an AI outreach agent
built by Wells Mensah. The agent is the application.

Wells Mensah | AI Builder, Creative Strategist & Marketing Specialist | rumate.io/intelligence`;

// --- Parse args ---
const { values: args } = parseArgs({
  options: {
    to: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" },
    "body-file": { type: "string" },
    "no-signature": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

if (!args.to || !args.subject) {
  console.error("Usage: send-gmail.mjs --to <email> --subject <subject> --body <body>");
  console.error("  or:  send-gmail.mjs --to <email> --subject <subject> --body-file <path>");
  process.exit(1);
}

// Resolve body
let body = args.body || "";
if (args["body-file"]) {
  if (!existsSync(args["body-file"])) {
    console.error(`Body file not found: ${args["body-file"]}`);
    process.exit(1);
  }
  body = readFileSync(args["body-file"], "utf-8");
  // Extract message body from draft markdown (skip frontmatter)
  const messageMatch = body.match(/### Message\n([\s\S]*?)(\n### |\n$)/);
  if (messageMatch) {
    body = messageMatch[1].trim();
  }
}

// Append signature
if (!args["no-signature"]) {
  body += "\n" + AGENT_SIGNATURE;
}

// --- OAuth2 ---
async function authorize() {
  if (!existsSync(CREDENTIALS_PATH)) {
    console.error(`Gmail credentials not found at ${CREDENTIALS_PATH}`);
    console.error("Download OAuth2 credentials from Google Cloud Console:");
    console.error("1. Go to console.cloud.google.com → APIs & Services → Credentials");
    console.error("2. Create OAuth 2.0 Client ID (Desktop app)");
    console.error("3. Download JSON and save to config/gmail-credentials.json");
    process.exit(1);
  }

  const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_id, client_secret } = credentials.installed || credentials.web;
  const redirect_uri = "http://localhost:3847/oauth2callback";

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);

  // Check for existing token
  if (existsSync(TOKEN_PATH)) {
    const token = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
    oauth2Client.setCredentials(token);

    // Refresh if expired
    if (token.expiry_date && token.expiry_date < Date.now()) {
      try {
        const { credentials: refreshed } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(refreshed);
        writeFileSync(TOKEN_PATH, JSON.stringify(refreshed, null, 2));
      } catch {
        console.log("Token expired and refresh failed. Re-authenticating...");
        return await getNewToken(oauth2Client);
      }
    }

    return oauth2Client;
  }

  return await getNewToken(oauth2Client);
}

async function getNewToken(oauth2Client) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\nOpening browser for Gmail authorization...");
  console.log(`If browser doesn't open, visit:\n${authUrl}\n`);

  // Start local server to receive the callback
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost:3847");
      const code = url.searchParams.get("code");

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>BYAMN Gmail Auth Complete</h1><p>You can close this tab.</p>");

        try {
          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);
          writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
          console.log("Gmail token saved.");
          server.close();
          resolve(oauth2Client);
        } catch (err) {
          server.close();
          reject(err);
        }
      }
    });

    server.listen(3847, () => {
      open(authUrl).catch(() => {
        console.log("Could not open browser automatically.");
      });
    });
  });
}

// --- Send ---
async function sendEmail(auth, to, subject, messageBody) {
  const gmail = google.gmail({ version: "v1", auth });

  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    messageBody,
  ].join("\n");

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });

  return result.data;
}

// --- Main ---
async function main() {
  console.log(`\nBYAMN Email Sender`);
  console.log(`To: ${args.to}`);
  console.log(`Subject: ${args.subject}`);
  console.log(`Body length: ${body.length} chars`);

  if (args["dry-run"]) {
    console.log("\n--- DRY RUN ---");
    console.log(`To: ${args.to}`);
    console.log(`Subject: ${args.subject}`);
    console.log(`\n${body}`);
    console.log("\n--- END DRY RUN ---");
    process.exit(0);
  }

  const auth = await authorize();
  const result = await sendEmail(auth, args.to, args.subject, body);

  console.log(`\nSent successfully!`);
  console.log(`Message ID: ${result.id}`);
  console.log(`Thread ID: ${result.threadId}`);

  // Output JSON for campaign log parsing
  console.log(JSON.stringify({
    success: true,
    messageId: result.id,
    threadId: result.threadId,
    to: args.to,
    subject: args.subject,
    timestamp: new Date().toISOString(),
  }));
}

main().catch((err) => {
  console.error("Send failed:", err.message);
  process.exit(1);
});
