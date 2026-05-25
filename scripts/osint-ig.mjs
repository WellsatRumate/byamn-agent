#!/usr/bin/env node

/**
 * osint-ig.mjs — Thin wrapper around Osintgram (GPL-3 submodule)
 *
 * Shells out to the Python tool and parses output back into JSON.
 * Keeps GPL-3 quarantined in the submodule — this wrapper is MIT.
 *
 * Usage:
 *   node scripts/osint-ig.mjs recon <handle>
 *   node scripts/osint-ig.mjs network <handle>
 *   node scripts/osint-ig.mjs comments <handle>
 *   node scripts/osint-ig.mjs tagged <handle>
 *   node scripts/osint-ig.mjs discover <handle>
 */

import { execSync, spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { parseArgs } from "util";

const ROOT = resolve(import.meta.dirname, "..");
const OSINTGRAM_DIR = join(ROOT, "tools", "osintgram");
const CREDS_PATH = join(ROOT, "config", "ig-credentials.json");
const OSINTGRAM_CREDS = join(OSINTGRAM_DIR, "config", "credentials.ini");
const OUTPUT_DIR = join(OSINTGRAM_DIR, "output");
const REPORTS_DIR = join(ROOT, "reports");

// --- Command mapping: our commands → Osintgram commands ---
const COMMAND_MAP = {
  recon: ["info", "captions", "hashtags", "photodes"],
  network: ["followers", "followings"],
  comments: ["comments", "wcommented"],
  tagged: ["tagged", "wtagged"],
  discover: ["followers", "followings"],
};

// --- Parse args ---
const args = process.argv.slice(2);
const command = args[0];
const handle = args[1];

if (!command || !handle || !COMMAND_MAP[command]) {
  console.error("Usage: osint-ig.mjs <recon|network|comments|tagged|discover> <handle>");
  console.error("\nCommands:");
  console.error("  recon    — full profile pull (bio, followers, following, hashtags)");
  console.error("  network  — who they follow + who follows them");
  console.error("  comments — active relationships via comment analysis");
  console.error("  tagged   — professional circle via tagged photos");
  console.error("  discover — cross-reference followers with targets list");
  process.exit(1);
}

// --- Setup credentials ---
function setupCredentials() {
  if (!existsSync(CREDS_PATH)) {
    console.error(`Instagram credentials not found at ${CREDS_PATH}`);
    console.error('Create it: echo \'{"username":"burner","password":"pass"}\' > config/ig-credentials.json');
    process.exit(1);
  }

  const creds = JSON.parse(readFileSync(CREDS_PATH, "utf-8"));
  const ini = `[Credentials]\nusername = ${creds.username}\npassword = ${creds.password}\nhikerapi_token = ${creds.hikerapi_token || ""}\n`;
  writeFileSync(OSINTGRAM_CREDS, ini);
}

// --- Run a single Osintgram command ---
function runOsintgramCommand(cmd, target) {
  // Osintgram is interactive — pipe the command via stdin
  const input = `${cmd}\nexit\n`;

  try {
    const result = execSync(
      `cd "${OSINTGRAM_DIR}" && echo "${input}" | python3 main.py ${target}`,
      {
        encoding: "utf-8",
        timeout: 60000,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    return result;
  } catch (err) {
    return err.stdout || err.message;
  }
}

// --- Parse raw Osintgram output into structured data ---
function parseOutput(cmd, raw) {
  const lines = raw.split("\n").filter((l) => l.trim() && !l.includes("Run a command") && !l.includes("Osintgram"));

  // Strip ANSI codes
  const clean = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim()).filter(Boolean);

  return {
    command: cmd,
    raw_lines: clean,
    count: clean.length,
  };
}

// --- Read output files if Osintgram wrote them ---
function readOutputFiles(target) {
  const targetDir = join(OUTPUT_DIR, target);
  if (!existsSync(targetDir)) return {};

  const files = {};
  for (const file of readdirSync(targetDir)) {
    try {
      files[file] = readFileSync(join(targetDir, file), "utf-8");
    } catch {
      // skip binary files
    }
  }
  return files;
}

// --- Cross-reference with targets list ---
function crossReferenceTargets(followers) {
  const targetsPath = join(ROOT, "targets", "kpmg.json");
  if (!existsSync(targetsPath)) return [];

  const targets = JSON.parse(readFileSync(targetsPath, "utf-8"));
  const targetNames = targets.map((t) => t.name.toLowerCase());

  const matches = [];
  for (const line of followers) {
    const lower = line.toLowerCase();
    for (const name of targetNames) {
      const parts = name.split(" ");
      if (parts.some((p) => lower.includes(p))) {
        matches.push({ follower: line, possible_match: name });
      }
    }
  }
  return matches;
}

// --- Main ---
async function main() {
  console.log(`\nBYAMN Instagram OSINT`);
  console.log(`Command: ${command}`);
  console.log(`Target: @${handle}\n`);

  // Check submodule exists
  if (!existsSync(join(OSINTGRAM_DIR, "main.py"))) {
    console.error("Osintgram not found. Run: git submodule update --init");
    process.exit(1);
  }

  setupCredentials();

  const subcommands = COMMAND_MAP[command];
  const results = {};

  for (const cmd of subcommands) {
    console.log(`Running: ${cmd}...`);
    const raw = runOsintgramCommand(cmd, handle);
    results[cmd] = parseOutput(cmd, raw);
  }

  // Check for output files
  const outputFiles = readOutputFiles(handle);

  // Build final report
  const report = {
    success: true,
    command,
    handle,
    timestamp: new Date().toISOString(),
    results,
    output_files: Object.keys(outputFiles),
  };

  // Cross-reference if discover mode
  if (command === "discover") {
    const allFollowers = [
      ...(results.followers?.raw_lines || []),
      ...(results.followings?.raw_lines || []),
    ];
    report.target_matches = crossReferenceTargets(allFollowers);
  }

  // Save report
  mkdirSync(REPORTS_DIR, { recursive: true });
  const slug = handle.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const reportPath = join(REPORTS_DIR, `${slug}-ig-osint.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Also save as markdown for agent consumption
  const mdPath = join(REPORTS_DIR, `${slug}-ig-osint.md`);
  let md = `# Instagram OSINT: @${handle}\n`;
  md += `## Command: ${command}\n`;
  md += `## Generated: ${report.timestamp}\n\n`;

  for (const [cmd, data] of Object.entries(results)) {
    md += `### ${cmd}\n`;
    md += `Lines: ${data.count}\n\n`;
    md += "```\n";
    md += data.raw_lines.slice(0, 50).join("\n");
    if (data.raw_lines.length > 50) md += `\n... (${data.raw_lines.length - 50} more)`;
    md += "\n```\n\n";
  }

  if (report.target_matches?.length) {
    md += `### Target Cross-References\n`;
    for (const m of report.target_matches) {
      md += `- **${m.follower}** → possible match: ${m.possible_match}\n`;
    }
    md += "\n";
  }

  writeFileSync(mdPath, md);

  console.log(`\nReport saved:`);
  console.log(`  JSON: ${reportPath}`);
  console.log(`  MD:   ${mdPath}`);
  console.log(JSON.stringify(report));
}

main().catch((err) => {
  console.error("OSINT failed:", err.message);
  process.exit(1);
});
