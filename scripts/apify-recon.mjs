#!/usr/bin/env node

/**
 * apify-recon.mjs — Apify data gatherer (no LLM calls)
 *
 * Runs Apify actors in parallel to scrape LinkedIn, Twitter, and Instagram.
 * Outputs raw JSON for Claude Code to synthesize inline.
 *
 * All LLM reasoning (synthesis, strategy, drafting) happens in Claude Code directly.
 * This script is a pure data pipeline — scrape → save → exit.
 *
 * Usage:
 *   node scripts/apify-recon.mjs --name "Adnaan Khan" --org "KPMG Canada"
 *   node scripts/apify-recon.mjs --name "Adnaan Khan" --org "KPMG Canada" --linkedin "linkedin.com/in/adnaankhan98/"
 *   node scripts/apify-recon.mjs --name "Heera Shah" --org "KPMG Canada" --ig "heerashah" --twitter "heerashah"
 *   node scripts/apify-recon.mjs --name "Adnaan Khan" --org "KPMG Canada" --skip-twitter --skip-ig
 *
 * Requires APIFY_API_KEY in .env
 */

import "dotenv/config";
import { ApifyClient } from "apify-client";
import { parseArgs } from "util";
import { writeFileSync, readFileSync, existsSync, statSync, mkdirSync } from "fs";

// --- Parse args ---
const { values: args } = parseArgs({
  options: {
    name: { type: "string" },
    org: { type: "string" },
    linkedin: { type: "string" },
    twitter: { type: "string" },
    ig: { type: "string" },
    output: { type: "string" },
    force: { type: "boolean", default: false },
    "skip-linkedin": { type: "boolean", default: false },
    "skip-twitter": { type: "boolean", default: false },
    "skip-ig": { type: "boolean", default: false },
  },
});

if (!args.name || !args.org) {
  console.error("Usage: apify-recon.mjs --name <name> --org <org> [options]");
  console.error("\nOptions:");
  console.error("  --linkedin <url>     LinkedIn profile URL");
  console.error("  --twitter <handle>   Twitter handle");
  console.error("  --ig <handle>        Instagram handle");
  console.error("  --skip-linkedin      Skip LinkedIn scrape");
  console.error("  --skip-twitter       Skip Twitter scrape");
  console.error("  --skip-ig            Skip Instagram scrape");
  console.error("  --force              Overwrite existing data");
  process.exit(1);
}

const slug = args.name.toLowerCase().replace(/\s+/g, "-");
const outputPath = args.output || `reports/${slug}-raw.json`;

// Skip if recent data exists
if (!args.force && existsSync(outputPath)) {
  const ageMs = Date.now() - statSync(outputPath).mtimeMs;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 7) {
    console.log(`Recent data exists (${ageDays.toFixed(1)} days old): ${outputPath}`);
    console.log("Use --force to regenerate.");
    process.exit(0);
  }
}

mkdirSync("reports", { recursive: true });

// --- Resolve LinkedIn URL from targets file ---
function resolveLinkedIn() {
  if (args.linkedin) return args.linkedin;
  const targetsPath = "targets/kpmg.json";
  if (existsSync(targetsPath)) {
    const targets = JSON.parse(readFileSync(targetsPath, "utf-8"));
    const target = targets.find(
      (t) => t.name.toLowerCase() === args.name.toLowerCase()
    );
    if (target?.linkedin && !target.linkedin.startsWith("search:")) {
      return target.linkedin;
    }
  }
  return null;
}

// --- Apify Actors ---

const apify = new ApifyClient({ token: process.env.APIFY_API_KEY });

async function scrapeLinkedIn(linkedinUrl) {
  if (args["skip-linkedin"]) return null;

  console.log(`[LinkedIn] Scraping: ${args.name} @ ${args.org}`);
  try {
    const run = await apify.actor("harvestapi/linkedin-profile-search").call({
      searchQuery: args.name,
      currentCompanies: [args.org],
      profileScraperMode: "Full + email search",
      maxItems: 3,
    });
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    console.log(`[LinkedIn] Got ${items.length} result(s)`);
    return items;
  } catch (err) {
    console.error(`[LinkedIn] Failed: ${err.message}`);
    return { error: err.message };
  }
}

async function scrapeTwitter() {
  if (args["skip-twitter"]) return null;

  const queries = [];
  if (args.twitter) {
    queries.push(`from:${args.twitter}`);
    queries.push(`to:${args.twitter}`);
    queries.push(`@${args.twitter}`);
  } else {
    queries.push(`"${args.name}" KPMG`);
    queries.push(`"${args.name}" "${args.org}"`);
  }

  console.log(`[Twitter] Running ${queries.length} queries:`);
  queries.forEach((q) => console.log(`  → ${q}`));

  try {
    const run = await apify.actor("apidojo/twitter-scraper-lite").call({
      queries,
      maxTweets: 10,
      queryType: "Latest",
    });
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    console.log(`[Twitter] Got ${items.length} tweet(s)`);
    return items;
  } catch (err) {
    console.error(`[Twitter] Failed: ${err.message}`);
    return { error: err.message };
  }
}

async function scrapeInstagram() {
  if (!args.ig || args["skip-ig"]) return null;

  console.log(`[Instagram] Scraping: @${args.ig}`);
  try {
    const run = await apify.actor("apify/instagram-scraper").call({
      usernames: [args.ig],
      resultsLimit: 20,
      resultsType: "posts",
    });
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    console.log(`[Instagram] Got ${items.length} post(s)`);
    return items;
  } catch (err) {
    console.error(`[Instagram] Failed: ${err.message}`);
    return { error: err.message };
  }
}

// --- Main ---

async function main() {
  console.log(`\n[APIFY RECON] Target: ${args.name} @ ${args.org}`);
  console.log(`Output: ${outputPath}\n`);

  const linkedinUrl = resolveLinkedIn();
  if (linkedinUrl) console.log(`LinkedIn URL resolved: ${linkedinUrl}`);

  // Run all scrapers in parallel
  console.log("Launching Apify actors in parallel...\n");
  const startTime = Date.now();

  const [linkedinData, twitterData, igData] = await Promise.all([
    scrapeLinkedIn(linkedinUrl),
    scrapeTwitter(),
    scrapeInstagram(),
  ]);

  const scrapeTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nScraping completed in ${scrapeTime}s`);

  // Save raw data
  const rawData = {
    target: args.name,
    org: args.org,
    timestamp: new Date().toISOString(),
    scrapeTime: `${scrapeTime}s`,
    linkedin: linkedinData,
    twitter: twitterData,
    instagram: igData,
  };

  writeFileSync(outputPath, JSON.stringify(rawData, null, 2));
  console.log(`Raw data saved: ${outputPath}`);

  // Summary for Claude Code to read
  const result = {
    success: true,
    target: args.name,
    org: args.org,
    output: outputPath,
    sources: {
      linkedin: !linkedinData ? "skipped" : linkedinData.error ? `error: ${linkedinData.error}` : `${Array.isArray(linkedinData) ? linkedinData.length : 0} profiles`,
      twitter: !twitterData ? "skipped" : twitterData.error ? `error: ${twitterData.error}` : `${Array.isArray(twitterData) ? twitterData.length : 0} tweets`,
      instagram: !igData ? "skipped" : igData.error ? `error: ${igData.error}` : `${Array.isArray(igData) ? igData.length : 0} posts`,
    },
    scrapeTime: `${scrapeTime}s`,
    timestamp: new Date().toISOString(),
  };

  console.log(`\n${JSON.stringify(result)}`);
}

main().catch((err) => {
  console.error("[APIFY RECON] Failed:", err.message);
  process.exit(1);
});
