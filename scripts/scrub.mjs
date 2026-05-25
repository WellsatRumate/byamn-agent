#!/usr/bin/env node

/**
 * scrub.mjs — Sanitize repo for public sharing
 *
 * Replaces real emails, phone numbers, and personal URLs with redacted
 * placeholders. Keeps structure, methodology, modes, playbooks, and
 * agent architecture intact.
 *
 * Usage:
 *   node scripts/scrub.mjs              # dry-run (show what would change)
 *   node scripts/scrub.mjs --apply      # actually modify files
 *   node scripts/scrub.mjs --restore    # restore from .scrub-backup/
 *
 * The scrubbed version shows HOW BYAMN works without exposing WHAT it found.
 */

import { parseArgs } from "util";
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const { values: args } = parseArgs({
  options: {
    apply: { type: "boolean", default: false },
    restore: { type: "boolean", default: false },
  },
});

const BACKUP_DIR = ".scrub-backup";

// --- Files to scrub ---
const SCRUB_DIRS = [
  "targets",
  "reports",
  "drafts",
  "vault",
  "data",
  "config",
];

const SCRUB_EXTENSIONS = [".json", ".md", ".yml", ".yaml", ".txt"];

// --- Patterns to redact ---
// Real data we know about — specific redactions
const SPECIFIC_REDACTIONS = [
  // Wells' personal info
  ["wells.mensah@gmail.com", "applicant@redacted.com"],
  ["wells@rumate.io", "applicant@redacted.com"],
  ["647-657-9692", "[PHONE-REDACTED]"],
  ["+1-647-657-9692", "[PHONE-REDACTED]"],

  // Target emails
  ["target-a@example.com", "target-personal@redacted.com"],
  ["target-a-alt@example.com", "target-personal-alt@redacted.com"],
  ["target-a-corp@example.com", "target@corp-redacted.com"],
  ["recruiter-a@example.com", "recruiter@corp-redacted.com"],
  ["recruiter-b@example.com", "recruiter2@corp-redacted.com"],

  // IG credentials — loaded from config file, not hardcoded
  ...(() => {
    try {
      const igCreds = JSON.parse(readFileSync("config/ig-credentials.json", "utf-8"));
      const pairs = [];
      if (igCreds.username) pairs.push([igCreds.username, "[IG-HANDLE-REDACTED]"]);
      if (igCreds.password) pairs.push([igCreds.password, "[IG-PASS-REDACTED]"]);
      return pairs;
    } catch { return []; }
  })(),

  // API keys — pattern-based, no hardcoded values
  [/sk-ant-api[A-Za-z0-9_\-]+/g, "[ANTHROPIC-KEY-REDACTED]"],
  [/apify_api_[A-Za-z0-9]+/g, "[APIFY-KEY-REDACTED]"],
];

// Generic patterns — catch anything else
const GENERIC_PATTERNS = [
  // Email addresses (but preserve example/redacted ones)
  {
    pattern: /\b[A-Za-z0-9._%+\-]+@(?!redacted\.com|example\.com|corp-redacted\.com)[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[EMAIL-REDACTED]",
    description: "email addresses",
  },
  // Phone numbers (North American)
  {
    pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE-REDACTED]",
    description: "phone numbers",
  },
];

// --- Collect files ---
function collectFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === BACKUP_DIR) continue;
      files.push(...collectFiles(fullPath));
    } else if (SCRUB_EXTENSIONS.includes(extname(entry.name))) {
      // Skip example files — they already have fake data
      if (entry.name.includes("-example")) continue;
      files.push(fullPath);
    }
  }
  return files;
}

// --- Scrub a single file ---
function scrubContent(content) {
  let scrubbed = content;
  let changes = 0;

  // Specific redactions first
  for (const [find, replace] of SPECIFIC_REDACTIONS) {
    if (find instanceof RegExp) {
      const matches = scrubbed.match(find);
      if (matches) {
        changes += matches.length;
        scrubbed = scrubbed.replace(find, replace);
      }
    } else {
      const count = scrubbed.split(find).length - 1;
      if (count > 0) {
        changes += count;
        scrubbed = scrubbed.replaceAll(find, replace);
      }
    }
  }

  // Generic patterns
  for (const { pattern, replacement } of GENERIC_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = scrubbed.match(pattern);
    if (matches) {
      // Don't re-redact already redacted content
      const realMatches = matches.filter((m) => !m.includes("redacted") && !m.includes("REDACTED"));
      if (realMatches.length > 0) {
        changes += realMatches.length;
        scrubbed = scrubbed.replace(pattern, (match) => {
          if (match.includes("redacted") || match.includes("REDACTED")) return match;
          return replacement;
        });
      }
    }
  }

  return { scrubbed, changes };
}

// --- Restore from backup ---
if (args.restore) {
  if (!existsSync(BACKUP_DIR)) {
    console.error("No backup found. Run --apply first to create a backup.");
    process.exit(1);
  }

  console.log("[RESTORE] Restoring from backup...");
  let restored = 0;

  for (const dir of SCRUB_DIRS) {
    const backupPath = join(BACKUP_DIR, dir);
    if (existsSync(backupPath)) {
      cpSync(backupPath, dir, { recursive: true, force: true });
      restored++;
    }
  }

  console.log(`[RESTORE] Restored ${restored} directories from ${BACKUP_DIR}/`);
  process.exit(0);
}

// --- Main scrub ---
console.log(`[SCRUB] ${args.apply ? "APPLYING" : "DRY RUN"} — scanning files...\n`);

// Collect all files
const allFiles = [];
for (const dir of SCRUB_DIRS) {
  allFiles.push(...collectFiles(dir));
}

console.log(`Found ${allFiles.length} files to scan.\n`);

let totalChanges = 0;
const filesChanged = [];

for (const file of allFiles) {
  const content = readFileSync(file, "utf-8");
  const { scrubbed, changes } = scrubContent(content);

  if (changes > 0) {
    filesChanged.push({ file, changes });
    totalChanges += changes;
    console.log(`  ${file} — ${changes} redaction(s)`);

    if (args.apply) {
      writeFileSync(file, scrubbed);
    }
  }
}

console.log(`\n[SCRUB] Summary:`);
console.log(`  Files scanned: ${allFiles.length}`);
console.log(`  Files with redactions: ${filesChanged.length}`);
console.log(`  Total redactions: ${totalChanges}`);

if (args.apply) {
  // Backup first
  console.log(`\n  Backup saved to ${BACKUP_DIR}/`);
  mkdirSync(BACKUP_DIR, { recursive: true });
  for (const dir of SCRUB_DIRS) {
    if (existsSync(dir)) {
      const dest = join(BACKUP_DIR, dir);
      mkdirSync(dest, { recursive: true });
      cpSync(dir, dest, { recursive: true, force: true });
    }
  }
  console.log(`  ✓ Files scrubbed.`);
} else {
  console.log(`\n  This was a dry run. Use --apply to actually redact files.`);
  console.log(`  Backup will be saved to ${BACKUP_DIR}/ before applying.`);
}
