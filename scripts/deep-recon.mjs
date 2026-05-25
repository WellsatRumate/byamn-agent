#!/usr/bin/env node

/**
 * deep-recon.mjs — Deep Recon Agent data pipeline
 *
 * 7 modes:
 *   entities     — Extract education/employers/cities/certs from LinkedIn raw JSON
 *   extract      — Fetch URLs, extract emails/phones/socials, follow YT/Linktree chains
 *   add-target   — Add a discovered person to targets/kpmg.json
 *   connections  — Read targets file, output cross-reference search queries
 *   vectors      — Scan URLs for intake mechanisms (forms, booking links, newsletters, bots, GitHub)
 *   org-map      — Generate org-mapping queries: teammates, manager, director, executive chain
 *   probe-pages  — HEAD-request landing page URLs to find hidden portfolios search engines miss
 *
 * Claude Code runs the web searches (it has the tool built in).
 * This script handles: entity extraction, URL fetching, contact parsing, file I/O.
 *
 * Usage:
 *   node scripts/deep-recon.mjs entities --name "Adnaan Khan" --raw reports/adnaan-khan-raw.json
 *   node scripts/deep-recon.mjs extract --name "Adnaan Khan" --urls "url1,url2"
 *   node scripts/deep-recon.mjs add-target --name "Robert Mill" --title "AI Solutions Consultant" --discovered-via "Adnaan Khan"
 *   node scripts/deep-recon.mjs connections --new-target "Robert Mill"
 */

import { parseArgs } from "util";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const command = process.argv[2];
const VALID_COMMANDS = ["entities", "extract", "add-target", "connections", "vectors", "org-map", "probe-pages"];

if (!VALID_COMMANDS.includes(command)) {
  console.error("Usage:");
  console.error("  deep-recon.mjs entities --name <name> --raw <path>");
  console.error("  deep-recon.mjs extract --name <name> --urls <url1,url2,...>");
  console.error("  deep-recon.mjs add-target --name <name> --title <title> [options]");
  console.error("  deep-recon.mjs connections --new-target <name>");
  console.error("  deep-recon.mjs vectors --name <name> --urls <url1,url2,...>");
  console.error("  deep-recon.mjs org-map --name <name> --title <title> --org <org>");
  console.error("  deep-recon.mjs probe-pages --name <name> --raw <path>");
  process.exit(1);
}

const { values: args } = parseArgs({
  args: process.argv.slice(3),
  options: {
    name: { type: "string" },
    raw: { type: "string" },
    urls: { type: "string" },
    "urls-file": { type: "string" },
    output: { type: "string" },
    force: { type: "boolean", default: false },
    // add-target options
    title: { type: "string" },
    org: { type: "string", default: "KPMG Canada" },
    approach: { type: "string", default: "warm" },
    email: { type: "string", default: "" },
    linkedin: { type: "string", default: "" },
    twitter: { type: "string", default: "" },
    github: { type: "string", default: "" },
    website: { type: "string", default: "" },
    priority: { type: "string", default: "3" },
    notes: { type: "string", default: "" },
    "discovered-via": { type: "string", default: "" },
    // connections options
    "new-target": { type: "string" },
    "targets-file": { type: "string", default: "targets/kpmg.json" },
  },
});

const slug = (args.name || args["new-target"] || "unknown").toLowerCase().replace(/\s+/g, "-");
mkdirSync("reports", { recursive: true });

// ─── Regex patterns ───────────────────────────────────────────────

const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

const SOCIAL_PATTERNS = [
  { platform: "twitter", re: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+)/g },
  { platform: "instagram", re: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)/g },
  { platform: "facebook", re: /https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9_.]+)/g },
  { platform: "youtube", re: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)([A-Za-z0-9_\-]+)/g },
  { platform: "linkedin", re: /https?:\/\/(?:www\.)?linkedin\.com\/in\/([A-Za-z0-9_\-]+)/g },
  { platform: "linktree", re: /https?:\/\/(?:www\.)?linktr\.ee\/([A-Za-z0-9_.\-]+)/g },
  { platform: "github", re: /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_\-]+)(?:\/)?(?!\w)/g },
  { platform: "tiktok", re: /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]+)/g },
  { platform: "medium", re: /https?:\/\/(?:www\.)?medium\.com\/@([A-Za-z0-9_.\-]+)/g },
  { platform: "substack", re: /https?:\/\/([A-Za-z0-9\-]+)\.substack\.com/g },
];

const EMAIL_NOISE = [
  "example.com", "email.com", "domain.com", "company.com", "yoursite.com",
  "sentry.io", "webpack.js", "w3.org", "schema.org", "googleapis.com",
  "cloudflare.com", "jquery.com", "wordpress.org", "gravatar.com",
  "wixpress.com", "squarespace.com", "shopify.com", "vercel.app",
  "google.com", "gstatic.com", "microsoft.com", "apple.com",
  "facebook.com", "twitter.com", "instagram.com", "youtube.com",
];

const HANDLE_NOISE = [
  "share", "sharer", "intent", "login", "signup", "about", "help",
  "settings", "explore", "search", "home", "p", "reel", "stories",
  "hashtag", "watch", "results", "channel", "feed", "privacy", "terms",
  "policies", "legal", "support", "status", "jobs", "company",
];

// ─── ENTITIES ─────────────────────────────────────────────────────

if (command === "entities") {
  if (!args.raw) { console.error("--raw required"); process.exit(1); }

  const rawData = JSON.parse(readFileSync(args.raw, "utf-8"));
  const li = rawData.linkedin?.[0];
  if (!li) { console.error("No LinkedIn data in raw JSON"); process.exit(1); }

  const education = [];
  const employers = [];
  const cities = new Set();
  const certifications = [];
  const skills = [];

  // Education
  for (const edu of [...(li.profileTopEducation || []), ...(li.education || [])]) {
    if (edu.schoolName && !education.includes(edu.schoolName)) education.push(edu.schoolName);
  }

  // Experience
  for (const exp of li.experience || []) {
    if (exp.companyName) {
      const name = exp.companyName.replace(/\s*\(.*\)/, "").trim();
      if (!employers.includes(name)) employers.push(name);
    }
    const city = typeof exp.location === "string"
      ? exp.location.split(",")[0].trim()
      : exp.location?.parsed?.city || exp.location?.linkedinText?.split(",")[0]?.trim();
    if (city) cities.add(city);
  }

  // Certifications
  for (const cert of li.certifications || []) {
    if (cert.name) certifications.push(cert.name);
  }

  // Skills
  if (li.topSkills) skills.push(...li.topSkills);
  for (const sk of li.skills || []) {
    if (sk.name && !skills.includes(sk.name)) skills.push(sk.name);
  }

  if (li.location?.parsed?.city) cities.add(li.location.parsed.city);

  // Build search queries
  const queries = {
    history: [],
    discovery: [],
    portfolio: [],
  };

  // History-based queries (one per entity)
  for (const inst of education) {
    queries.history.push({ entity: inst, type: "education", query: `"${args.name}" "${inst}"` });
  }
  for (const emp of employers) {
    queries.history.push({ entity: emp, type: "employer", query: `"${args.name}" "${emp}"` });
  }

  // Portfolio/personal site queries
  queries.portfolio.push({ query: `"${args.name}" portfolio OR "personal website" OR "personal site"` });
  queries.portfolio.push({ query: `"${args.name}" site:github.com` });
  queries.portfolio.push({ query: `"${args.name}" site:linktr.ee` });

  // Landing page URL brute-force (search engines don't index these)
  const nameVariants = [
    slug,                                                    // adnaan-khan
    args.name.toLowerCase().replace(/\s+/g, ""),             // adnaankhan
    args.name.toLowerCase().replace(/\s+/g, "_"),            // adnaan_khan
    li.publicIdentifier || "",                               // adnaankhan98
    `${li.firstName?.trim().toLowerCase()}-${li.lastName?.trim().toLowerCase()}`, // adnaan-khan
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);        // deduplicate

  const landingPagePlatforms = [
    { platform: "getlandingsite", pattern: (name) => `https://${name}.getlandingsite.com` },
    { platform: "carrd", pattern: (name) => `https://${name}.carrd.co` },
    { platform: "notion", pattern: (name) => `https://${name}.notion.site` },
    { platform: "wixsite", pattern: (name) => `https://${name}.wixsite.com` },
    { platform: "webflow", pattern: (name) => `https://${name}.webflow.io` },
    { platform: "super.so", pattern: (name) => `https://${name}.super.so` },
    { platform: "framer", pattern: (name) => `https://${name}.framer.website` },
    { platform: "bio.link", pattern: (name) => `https://bio.link/${name}` },
    { platform: "bento", pattern: (name) => `https://bento.me/${name}` },
    { platform: "read.cv", pattern: (name) => `https://read.cv/${name}` },
    { platform: "contra", pattern: (name) => `https://contra.com/${name}` },
    { platform: "about.me", pattern: (name) => `https://about.me/${name}` },
  ];

  // Generate all URL candidates (name variants × platforms)
  const landingPageUrls = [];
  for (const variant of nameVariants) {
    for (const { platform, pattern } of landingPagePlatforms) {
      landingPageUrls.push({ platform, variant, url: pattern(variant) });
    }
  }

  // Also try numbered variants for getlandingsite (they use name-NNN format)
  for (const variant of nameVariants) {
    for (const num of ["", "-1", "-123", "-456", "-705", "-999"]) {
      if (num) {
        landingPageUrls.push({
          platform: "getlandingsite",
          variant: `${variant}${num}`,
          url: `https://${variant}${num}.getlandingsite.com`,
        });
      }
    }
  }

  // Related people discovery queries (search for the team/role)
  const currentTitle = li.currentPosition?.[0]?.position || li.headline || "";
  const currentOrg = li.currentPosition?.[0]?.companyName || rawData.org || "";
  if (currentOrg) {
    queries.discovery.push({ query: `"${currentOrg}" "AI Lab" OR "AI Builder" hiring site:linkedin.com` });
    queries.discovery.push({ query: `"${currentOrg}" "${currentTitle}" site:linkedin.com` });
    queries.discovery.push({ query: `"${currentOrg}" "AI" team Toronto site:linkedin.com` });
  }

  const output = {
    target: args.name,
    entities: { education, employers, cities: [...cities], certifications, skills: skills.slice(0, 10) },
    queries,
    landingPageUrls,
    totalQueries: queries.history.length + queries.portfolio.length + queries.discovery.length,
    totalLandingPageUrls: landingPageUrls.length,
  };

  const outPath = `reports/${slug}-deep-queries.json`;
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output));
  process.exit(0);
}

// ─── EXTRACT ──────────────────────────────────────────────────────

if (command === "extract") {
  let urls = [];
  if (args.urls) {
    urls = args.urls.split(",").map((u) => u.trim()).filter(Boolean);
  } else if (args["urls-file"]) {
    urls = readFileSync(args["urls-file"], "utf-8").split("\n").map((u) => u.trim()).filter((u) => u && u.startsWith("http"));
  } else {
    console.error("--urls or --urls-file required"); process.exit(1);
  }

  console.log(`[EXTRACT] Target: ${args.name || "unknown"}`);
  console.log(`[EXTRACT] URLs: ${urls.length}\n`);

  const findings = [];
  const allEmails = new Set();
  const allPhones = new Set();
  const allSocials = new Map();
  const followUrls = { youtube: new Set(), linktree: new Set() };

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    process.stdout.write(`  [${i + 1}/${urls.length}] ${url.slice(0, 80)}...`);

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      if (!res.ok) { console.log(` ${res.status}`); continue; }
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("text/html") && !ct.includes("text/plain")) { console.log(" (skip)"); continue; }

      const html = await res.text();

      const emails = [...new Set(html.match(EMAIL_RE) || [])].filter(
        (e) => !EMAIL_NOISE.some((n) => e.split("@")[1]?.toLowerCase().includes(n))
      );
      const phones = [...new Set(html.match(PHONE_RE) || [])].slice(0, 5);

      const socials = [];
      for (const { platform, re } of SOCIAL_PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(html)) !== null) {
          const handle = m[1].toLowerCase();
          if (!HANDLE_NOISE.includes(handle) && handle.length > 1) {
            const key = `${platform}:${handle}`;
            if (!allSocials.has(key)) {
              socials.push({ platform, handle, url: m[0] });
              allSocials.set(key, { platform, handle, url: m[0], source: url });
              if (platform === "youtube") followUrls.youtube.add(handle);
              if (platform === "linktree") followUrls.linktree.add(handle);
            }
          }
        }
      }

      if (emails.length || phones.length || socials.length) {
        console.log(` ✓ ${emails.length}e ${phones.length}p ${socials.length}s`);
        findings.push({ url, emails, phones, socials });
        emails.forEach((e) => allEmails.add(e));
        phones.forEach((p) => allPhones.add(p));
      } else {
        console.log(" –");
      }
    } catch (err) { console.log(` (error: ${err.message?.slice(0, 60)})`); }
  }

  // Follow YouTube about pages
  for (const handle of followUrls.youtube) {
    process.stdout.write(`\n  [YT:@${handle}] `);
    try {
      const res = await fetch(`https://www.youtube.com/@${handle}/about`, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      let found = 0;
      for (const { platform, re } of SOCIAL_PATTERNS) {
        if (platform === "youtube") continue;
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(html)) !== null) {
          const h = m[1].toLowerCase();
          const key = `${platform}:${h}`;
          if (!HANDLE_NOISE.includes(h) && !allSocials.has(key)) {
            allSocials.set(key, { platform, handle: h, url: m[0], source: `youtube/@${handle}` });
            found++;
          }
        }
      }
      const ytEmails = [...new Set(html.match(EMAIL_RE) || [])].filter(
        (e) => !EMAIL_NOISE.some((n) => e.includes(n))
      );
      ytEmails.forEach((e) => allEmails.add(e));
      console.log(`${found}s ${ytEmails.length}e`);
    } catch (err) { console.log(`(error: ${err.message?.slice(0, 60)})`); }
  }

  // Follow Linktree pages
  for (const handle of followUrls.linktree) {
    process.stdout.write(`\n  [LT:${handle}] `);
    try {
      const res = await fetch(`https://linktr.ee/${handle}`, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      const ltEmails = [...new Set(html.match(EMAIL_RE) || [])].filter(
        (e) => !EMAIL_NOISE.some((n) => e.includes(n))
      );
      ltEmails.forEach((e) => allEmails.add(e));

      const outLinks = [];
      const linkRe = /href="(https?:\/\/(?!linktr\.ee)[^"]+)"/g;
      let m;
      while ((m = linkRe.exec(html)) !== null) outLinks.push(m[1]);
      console.log(`${ltEmails.length}e ${outLinks.length} links`);
    } catch (err) { console.log(`(error: ${err.message?.slice(0, 60)})`); }
  }

  // Output
  const outputPath = args.output || `reports/${slug}-deep-recon.json`;
  const result = {
    target: args.name || "unknown",
    timestamp: new Date().toISOString(),
    urlsProcessed: urls.length,
    urlsWithFindings: findings.length,
    digital_footprint: {
      emails: [...allEmails],
      phones: [...allPhones],
      socials: [...allSocials.values()],
    },
    findings,
  };

  writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(`\n[EXTRACT] Done.`);
  console.log(`  Emails: ${allEmails.size} — ${[...allEmails].join(", ") || "none"}`);
  console.log(`  Phones: ${allPhones.size}`);
  console.log(`  Socials: ${allSocials.size}`);
  for (const [, s] of allSocials) console.log(`    ${s.platform}: @${s.handle}`);
  console.log(`  Saved: ${outputPath}`);

  console.log(JSON.stringify({
    success: true, output: outputPath,
    emails: [...allEmails], phones: [...allPhones],
    socials: [...allSocials.values()],
  }));
  process.exit(0);
}

// ─── ADD-TARGET ───────────────────────────────────────────────────

if (command === "add-target") {
  if (!args.name || !args.title) {
    console.error("--name and --title required");
    process.exit(1);
  }

  const targetsPath = args["targets-file"];
  let targets = [];
  if (existsSync(targetsPath)) {
    targets = JSON.parse(readFileSync(targetsPath, "utf-8"));
  }

  // Check for duplicate
  const existing = targets.find((t) => t.name.toLowerCase() === args.name.toLowerCase());
  if (existing) {
    console.log(`[ADD-TARGET] ${args.name} already exists in targets. Skipping.`);
    console.log(JSON.stringify({ success: false, reason: "duplicate", existing }));
    process.exit(0);
  }

  const newTarget = {
    name: args.name,
    org: args.org,
    title: args.title,
    approach: args.approach,
    email: args.email,
    linkedin: args.linkedin,
    twitter: args.twitter || "",
    github: args.github || "",
    website: args.website || "",
    priority: parseInt(args.priority),
    notes: args.notes,
    org_position: args.notes?.match(/org_position:\s*(\w+)/)?.[1] || null,
    source: "deep-recon",
    discovered_via: args["discovered-via"],
    discovered_at: new Date().toISOString().split("T")[0],
  };

  targets.push(newTarget);
  writeFileSync(targetsPath, JSON.stringify(targets, null, 2) + "\n");

  console.log(`[ADD-TARGET] Added ${args.name} (${args.title}) to ${targetsPath}`);
  console.log(`  Discovered via: ${args["discovered-via"] || "manual"}`);
  console.log(`  Priority: ${args.priority}`);
  console.log(JSON.stringify({ success: true, target: newTarget }));
  process.exit(0);
}

// ─── CONNECTIONS ──────────────────────────────────────────────────

if (command === "connections") {
  const newTarget = args["new-target"];
  if (!newTarget) { console.error("--new-target required"); process.exit(1); }

  const targetsPath = args["targets-file"];
  if (!existsSync(targetsPath)) { console.error(`Targets file not found: ${targetsPath}`); process.exit(1); }

  const targets = JSON.parse(readFileSync(targetsPath, "utf-8"));
  const existingTargets = targets.filter((t) => t.name.toLowerCase() !== newTarget.toLowerCase());

  if (existingTargets.length === 0) {
    console.log("[CONNECTIONS] No existing targets to cross-reference.");
    process.exit(0);
  }

  // Generate cross-reference queries
  const queries = [];
  for (const target of existingTargets) {
    queries.push({
      target_a: newTarget,
      target_b: target.name,
      org: target.org,
      queries: [
        `"${newTarget}" "${target.name}"`,
        `"${newTarget}" "${target.name}" "${target.org}"`,
      ],
    });
  }

  const output = {
    new_target: newTarget,
    existing_targets: existingTargets.map((t) => t.name),
    cross_reference_queries: queries,
    total_queries: queries.reduce((n, q) => n + q.queries.length, 0),
    instructions: "Run each query via web search. If results show co-authored content, shared events, mutual connections, or team mentions — record as a connection with evidence URL.",
  };

  const outPath = `reports/${slug}-connections-queries.json`;
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`[CONNECTIONS] Generated ${output.total_queries} cross-reference queries for ${newTarget}`);
  console.log(`  Against ${existingTargets.length} existing targets:`);
  for (const t of existingTargets) console.log(`    - ${t.name} (${t.title})`);
  console.log(`  Saved: ${outPath}`);

  console.log(JSON.stringify(output));
  process.exit(0);
}

// ─── VECTORS ──────────────────────────────────────────────────────

if (command === "vectors") {
  let urls = [];
  if (args.urls) {
    urls = args.urls.split(",").map((u) => u.trim()).filter(Boolean);
  } else if (args["urls-file"]) {
    urls = readFileSync(args["urls-file"], "utf-8").split("\n").map((u) => u.trim()).filter((u) => u && u.startsWith("http"));
  } else {
    console.error("--urls or --urls-file required"); process.exit(1);
  }

  console.log(`[VECTORS] Target: ${args.name || "unknown"}`);
  console.log(`[VECTORS] Scanning ${urls.length} URL(s) for intake mechanisms...\n`);

  // Patterns for intake vector detection
  const SCHEDULING_RE = [
    /https?:\/\/(?:www\.)?calendly\.com\/([A-Za-z0-9_\-]+)/gi,
    /https?:\/\/(?:www\.)?cal\.com\/([A-Za-z0-9_\-]+)/gi,
    /https?:\/\/(?:www\.)?savvycal\.com\/([A-Za-z0-9_\-]+)/gi,
    /https?:\/\/(?:www\.)?tidycal\.com\/([A-Za-z0-9_\-]+)/gi,
    /https?:\/\/(?:www\.)?acuityscheduling\.com\/([A-Za-z0-9_\-]+)/gi,
    /https?:\/\/(?:www\.)?book\.morgen\.so\/([A-Za-z0-9_\-]+)/gi,
  ];

  const NEWSLETTER_RE = [
    /https?:\/\/([A-Za-z0-9\-]+)\.substack\.com/gi,
    /https?:\/\/(?:www\.)?buttondown\.email\/([A-Za-z0-9_\-]+)/gi,
  ];

  const NEWSLETTER_SIGNALS = [/data-formkit-toggle/i, /mailchimp\.com\/subscribe/i, /newsletter/i];

  const CONTACT_FORM_RE = [
    /<form[^>]*(?:action|method)[^>]*>/i,
    /contact-form/i, /id=["']contact/i,
    /class=["'][^"']*contact[^"']*form/i,
    /typeform\.com/i, /tally\.so/i, /jotform\.com/i,
  ];

  const CHATBOT_RE = [
    { re: /intercom/i, name: "intercom" },
    { re: /drift\.com/i, name: "drift" },
    { re: /crisp\.chat/i, name: "crisp" },
    { re: /tidio\.co/i, name: "tidio" },
    { re: /tawk\.to/i, name: "tawk" },
    { re: /livechat/i, name: "livechat" },
    { re: /chat-widget/i, name: "chat-widget" },
    { re: /voiceflow/i, name: "voiceflow" },
    { re: /botpress/i, name: "botpress" },
    { re: /chatbot/i, name: "chatbot" },
  ];

  const vectors = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const isGitHub = url.includes("github.com");

    process.stdout.write(`  [${i + 1}/${urls.length}] ${url.slice(0, 80)}...`);

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      if (!res.ok) { console.log(` ${res.status}`); continue; }
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("text/html") && !ct.includes("text/plain")) { console.log(" (skip)"); continue; }

      const html = await res.text();
      let foundCount = 0;

      // Scheduling links
      for (const re of SCHEDULING_RE) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(html)) !== null) {
          vectors.push({
            type: "scheduling", url: m[0], handle: m[1],
            difficulty: "very_low",
            notes: "Public booking link. Direct path to conversation.",
            source: url,
          });
          foundCount++;
        }
      }

      // Newsletter (URL patterns)
      for (const re of NEWSLETTER_RE) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(html)) !== null) {
          vectors.push({
            type: "newsletter", url: m[0], handle: m[1],
            difficulty: "low",
            notes: "Newsletter. Subscribe → reply to welcome email for personal inbox.",
            source: url,
          });
          foundCount++;
          break;
        }
      }

      // Newsletter signals (non-URL)
      if (foundCount === 0 || !vectors.some((v) => v.type === "newsletter" && v.source === url)) {
        for (const re of NEWSLETTER_SIGNALS) {
          if (re.test(html)) {
            vectors.push({
              type: "newsletter", url,
              difficulty: "low",
              notes: "Newsletter signup detected on page.",
              source: url,
            });
            foundCount++;
            break;
          }
        }
      }

      // Contact forms
      for (const re of CONTACT_FORM_RE) {
        if (re.test(html)) {
          vectors.push({
            type: "contact_form", url,
            difficulty: "low",
            notes: "Contact form detected. Message likely goes to personal email.",
            source: url,
          });
          foundCount++;
          break;
        }
      }

      // Chatbots / AI agents
      for (const { re, name } of CHATBOT_RE) {
        if (re.test(html)) {
          vectors.push({
            type: "agent", url, agent_type: name,
            difficulty: "medium",
            notes: `${name} detected. Agent-to-agent outreach opportunity.`,
            source: url,
          });
          foundCount++;
          break;
        }
      }

      // GitHub: contribution opportunities
      if (isGitHub) {
        const hasIssues = /\/issues"/.test(html) && !/0\s*Open/.test(html);
        const hasDiscussions = /\/discussions"/.test(html);
        const isActive = /ago<\/relative-time>/.test(html);

        if (hasIssues || hasDiscussions || isActive) {
          vectors.push({
            type: "github", url,
            difficulty: "medium",
            notes: [
              hasIssues ? "Open issues — contribute a fix" : null,
              hasDiscussions ? "Discussions — join conversation" : null,
              isActive ? "Recently active" : null,
            ].filter(Boolean).join(". "),
            source: url,
          });
          foundCount++;
        }
      }

      // Direct email addresses on page
      const pageEmails = [...new Set(html.match(EMAIL_RE) || [])].filter(
        (e) => !EMAIL_NOISE.some((n) => e.split("@")[1]?.toLowerCase().includes(n))
      );
      if (pageEmails.length > 0) {
        vectors.push({
          type: "direct_email", url, emails: pageEmails,
          difficulty: "very_low",
          notes: "Email address on page. May be personal inbox.",
          source: url,
        });
        foundCount++;
      }

      console.log(foundCount > 0 ? ` ✓ ${foundCount} vector(s)` : " –");
    } catch (err) { console.log(` (error: ${err.message?.slice(0, 60)})`); }
  }

  // Deduplicate
  const seen = new Set();
  const uniqueVectors = vectors.filter((v) => {
    const key = `${v.type}:${v.url || v.handle || v.emails?.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const outputPath = args.output || `reports/${slug}-vectors.json`;
  writeFileSync(outputPath, JSON.stringify({
    target: args.name || "unknown",
    timestamp: new Date().toISOString(),
    urlsScanned: urls.length,
    intake_vectors: uniqueVectors,
  }, null, 2));

  console.log(`\n[VECTORS] Done.`);
  console.log(`  URLs scanned: ${urls.length}`);
  console.log(`  Vectors found: ${uniqueVectors.length}`);
  for (const v of uniqueVectors) {
    console.log(`    [${v.difficulty}] ${v.type}: ${v.url || v.emails?.join(", ")} — ${v.notes}`);
  }
  console.log(`  Saved: ${outputPath}`);
  console.log(JSON.stringify({ success: true, output: outputPath, vectors: uniqueVectors }));
  process.exit(0);
}

// ─── ORG-MAP ──────────────────────────────────────────────────────

if (command === "org-map") {
  if (!args.name) { console.error("--name required"); process.exit(1); }

  const title = args.title || "";
  const org = args.org || "KPMG Canada";
  const website = args.website || "";

  // Read existing targets for cross-referencing
  const targetsPath = args["targets-file"];
  let existingTargets = [];
  if (existsSync(targetsPath)) {
    existingTargets = JSON.parse(readFileSync(targetsPath, "utf-8"));
  }

  const existingNames = existingTargets.map((t) => t.name);

  // Determine the team/unit from the target's title
  const teamKeywords = [];
  if (title.toLowerCase().includes("ai")) teamKeywords.push("AI");
  if (title.toLowerCase().includes("lab")) teamKeywords.push("AI Lab");
  if (title.toLowerCase().includes("data")) teamKeywords.push("Data");
  if (title.toLowerCase().includes("consult")) teamKeywords.push("Consultant");
  if (title.toLowerCase().includes("builder")) teamKeywords.push("AI Builder");
  if (teamKeywords.length === 0) teamKeywords.push(title.split(",")[0].trim());

  const queries = {
    // Who manages this person?
    manager: [
      `"${args.name}" "${org}" manager OR "reports to" OR "team lead" site:linkedin.com`,
      `"${args.name}" "${org}" "my team" OR "our team" OR "pleased to announce" site:linkedin.com/posts`,
    ],

    // Who else is on their team?
    teammates: [
      `"${org}" "${teamKeywords.includes("AI Lab") ? "AI Lab" : teamKeywords[0]}" "${title.includes("Consultant") ? "Consultant" : "team"}" site:linkedin.com`,
      `"${org}" "AI Lab" team site:linkedin.com/posts`,
      `"${org}" "AI Solutions Consultant" OR "AI Builder" OR "AI Engineer" site:linkedin.com`,
    ],

    // Who runs the team/lab?
    leadership: [
      `"${org}" "AI Lab" director OR "head of" OR lead site:linkedin.com`,
      `"${org}" "AI Lab" launch OR announcement OR "pleased to announce"`,
      `"${org}" "AI Lab" "Managing Director" OR "Partner" OR VP site:linkedin.com`,
    ],

    // Who does the lab leader report to?
    executive_chain: [
      `"${org}" "AI" "Managing Partner" OR "Country Lead" OR "National Lead" site:linkedin.com`,
      `"${org}" "Digital" OR "Innovation" OR "Transformation" "Partner" OR "Managing Director" site:linkedin.com`,
    ],
  };

  // Add website-specific queries if we have one
  if (website) {
    queries.manager.push(`site:${website} manager OR team OR lead`);
    queries.teammates.push(`site:${website} KPMG OR team OR colleague`);
  }

  // Add chatbot queries if the target has a site with a bot
  const chatbotQueries = [];
  if (website) {
    chatbotQueries.push({
      url: `https://${website.replace(/^https?:\/\//, "")}`,
      questions: [
        `Who leads the AI Lab team at ${org}?`,
        `Who does the AI Lab report to at ${org}?`,
        `Who manages the AI Solutions Consultants at ${org}?`,
      ],
    });
  }

  const output = {
    target: args.name,
    title,
    org,
    existing_targets: existingNames,
    queries,
    chatbot_queries: chatbotQueries,
    total_search_queries: Object.values(queries).flat().length,
    org_positions: {
      peer: "Same level — teammate on the same team",
      manager: "Direct manager of the target",
      director: "Runs the team/lab/practice",
      executive: "Partner/VP-level, owns the strategic mandate",
    },
    instructions: `Run each query via web search. For each person discovered:
1. Check if they're already in targets (${existingNames.join(", ")})
2. If new, determine their org_position: peer, manager, director, or executive
3. Add via: node scripts/deep-recon.mjs add-target --name "X" --title "T" --org "${org}" --discovered-via "${args.name}" --notes "org_position: {position}"
4. For chatbot queries: use agent-browser to interact with the bot, screenshot before/after`,
  };

  const outPath = `reports/${slug}-org-map-queries.json`;
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`[ORG-MAP] Target: ${args.name} (${title})`);
  console.log(`[ORG-MAP] Org: ${org}`);
  console.log(`[ORG-MAP] Generated ${output.total_search_queries} search queries across 4 categories:`);
  console.log(`  Manager (who manages them): ${queries.manager.length} queries`);
  console.log(`  Teammates (who's on the team): ${queries.teammates.length} queries`);
  console.log(`  Leadership (who runs the lab): ${queries.leadership.length} queries`);
  console.log(`  Executive chain (who's above leadership): ${queries.executive_chain.length} queries`);
  if (chatbotQueries.length > 0) {
    console.log(`  Chatbot queries: ${chatbotQueries[0].questions.length} questions for ${chatbotQueries[0].url}`);
  }
  console.log(`  Existing targets to cross-ref: ${existingNames.length}`);
  console.log(`  Saved: ${outPath}`);

  console.log(JSON.stringify(output));
  process.exit(0);
}

// ─── PROBE-PAGES ──────────────────────────────────────────────────

if (command === "probe-pages") {
  if (!args.raw) { console.error("--raw required"); process.exit(1); }

  // Run entities extraction to get landing page URLs
  const rawData = JSON.parse(readFileSync(args.raw, "utf-8"));
  const li = rawData.linkedin?.[0];
  if (!li) { console.error("No LinkedIn data in raw JSON"); process.exit(1); }

  // Generate name variants
  const nameVariants = [
    slug,
    (args.name || "").toLowerCase().replace(/\s+/g, ""),
    (args.name || "").toLowerCase().replace(/\s+/g, "_"),
    li.publicIdentifier || "",
    `${li.firstName?.trim().toLowerCase() || ""}-${li.lastName?.trim().toLowerCase() || ""}`,
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  const platforms = [
    { name: "getlandingsite", pattern: (n) => `https://${n}.getlandingsite.com` },
    { name: "carrd", pattern: (n) => `https://${n}.carrd.co` },
    { name: "notion", pattern: (n) => `https://${n}.notion.site` },
    { name: "wixsite", pattern: (n) => `https://${n}.wixsite.com` },
    { name: "webflow", pattern: (n) => `https://${n}.webflow.io` },
    { name: "super.so", pattern: (n) => `https://${n}.super.so` },
    { name: "framer", pattern: (n) => `https://${n}.framer.website` },
    { name: "bio.link", pattern: (n) => `https://bio.link/${n}` },
    { name: "bento", pattern: (n) => `https://bento.me/${n}` },
    { name: "read.cv", pattern: (n) => `https://read.cv/${n}` },
    { name: "contra", pattern: (n) => `https://contra.com/${n}` },
    { name: "about.me", pattern: (n) => `https://about.me/${n}` },
  ];

  // Build all URL candidates
  const candidates = [];
  for (const variant of nameVariants) {
    for (const { name: platform, pattern } of platforms) {
      candidates.push({ platform, variant, url: pattern(variant) });
    }
  }

  // Also try numbered variants for getlandingsite
  for (const variant of nameVariants) {
    for (let n = 1; n <= 999; n += 100) {
      candidates.push({
        platform: "getlandingsite",
        variant: `${variant}-${n}`,
        url: `https://${variant}-${n}.getlandingsite.com`,
      });
    }
    // Common low numbers
    for (const n of [1, 2, 3, 5, 10, 42, 69, 100, 123, 456, 705, 777, 999]) {
      candidates.push({
        platform: "getlandingsite",
        variant: `${variant}-${n}`,
        url: `https://${variant}-${n}.getlandingsite.com`,
      });
    }
  }

  // Deduplicate
  const seen = new Set();
  const uniqueCandidates = candidates.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  console.log(`[PROBE-PAGES] Target: ${args.name}`);
  console.log(`[PROBE-PAGES] Name variants: ${nameVariants.join(", ")}`);
  console.log(`[PROBE-PAGES] Probing ${uniqueCandidates.length} URLs across ${platforms.length} platforms...\n`);

  const found = [];
  let probed = 0;

  for (const candidate of uniqueCandidates) {
    probed++;
    if (probed % 20 === 0) process.stdout.write(`  [${probed}/${uniqueCandidates.length}]...\r`);

    try {
      const res = await fetch(candidate.url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
      });

      if (res.ok) {
        // Verify it's not a generic 200 from the platform's 404 page
        // Some platforms return 200 for everything — do a GET and check content length
        const getRes = await fetch(candidate.url, {
          signal: AbortSignal.timeout(5000),
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const body = await getRes.text();

        // Skip if it's a default/empty page (under 500 chars usually means template)
        if (body.length < 500) continue;
        // Skip if it contains "page not found" or "404" signals
        if (body.toLowerCase().includes("page not found") || body.toLowerCase().includes("this page doesn")) continue;

        found.push({
          ...candidate,
          status: res.status,
          contentLength: body.length,
        });
        console.log(`  ✓ FOUND: ${candidate.url} (${candidate.platform}, ${body.length} chars)`);
      }
    } catch {
      // Connection refused, timeout, DNS failure — skip silently
    }
  }

  const outputPath = args.output || `reports/${slug}-landing-pages.json`;
  writeFileSync(outputPath, JSON.stringify({
    target: args.name,
    timestamp: new Date().toISOString(),
    nameVariants,
    totalProbed: uniqueCandidates.length,
    found,
  }, null, 2));

  console.log(`\n[PROBE-PAGES] Done.`);
  console.log(`  Probed: ${uniqueCandidates.length} URLs`);
  console.log(`  Found: ${found.length} live pages`);
  for (const f of found) {
    console.log(`    ${f.platform}: ${f.url}`);
  }
  console.log(`  Saved: ${outputPath}`);

  if (found.length > 0) {
    console.log(`\n  → Run extract on found URLs to pull contact info:`);
    console.log(`    node scripts/deep-recon.mjs extract --name "${args.name}" --urls "${found.map(f => f.url).join(",")}"`);
  }

  console.log(JSON.stringify({ success: true, output: outputPath, found }));
  process.exit(0);
}
