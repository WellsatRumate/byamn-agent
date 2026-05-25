# Mode: Recon

## Purpose
Research a target person to build a detailed profile for outreach strategy.

## Input
- Target name (required)
- Organization (required, defaults to target's org from targets/*.json)

## Process

### 1. Check existing research
Look in `reports/{target-slug}.md`. If it exists and is less than 7 days old, use it.

### 2. Apify scrape (data gathering)
Run `node scripts/apify-recon.mjs --name "{name}" --org "{org}"` with any known handles.
This produces `reports/{target-slug}-raw.json` with LinkedIn profile, Twitter, and Instagram data.

### 3. YouTube discovery
Search YouTube for "{name}" + AI/tech/professional topics. If a channel is found:
- Extract the @handle
- Use the same handle to search Twitter and Instagram if not already known

### 4. Email dorking (3 query patterns)
Run these Google dork queries via web search:
1. `"{name}" "{org}" "@gmail.com" OR "@hotmail.com" OR "@outlook.com"`
2. `"{name}" email contact "{org}"`
3. `"{linkedin_slug}" "@gmail.com" OR "@yahoo.com"`

Parse any email addresses found. Record with confidence level and source URL.

### 5. History-based dorking (education + employer footprint)
After reading the LinkedIn profile from raw JSON:
1. **Extract all institutions:** education schools + past employers
2. **For each institution**, run: `"{name}" "{institution}"` via web search
3. **Look for:** portfolio sites, personal landing pages, GitHub profiles, conference bios, speaker pages, university directories, alumni pages
4. **On any hit**, check the page for:
   - Email addresses (personal or academic)
   - Phone numbers
   - Other social handles
   - Portfolio URLs
5. **Record findings** as `digital_footprint` entries with source URL

Example for a target with Concordia University + Oracle background:
- Search: `"Adnaan Khan" "Concordia University"` → may surface thesis, student projects, alumni directory
- Search: `"Adnaan Khan" "Oracle"` → may surface conference talks, internal blog posts
- Search: `"Adnaan Khan" portfolio` OR `"Adnaan Khan" site:github.com` → may surface personal site with contact info

### 6. Cross-reference
Check if any of Wells' builds (Rumate, Tori, GetCAPPD) are relevant to the target's work or interests.

### 7. Synthesize
Combine all data sources into one structured dossier. Note which data came from which source.

## Output Format
Save to `reports/{target-slug}.md`:

```markdown
# Research Report: {Name}
## Generated: {date}
## Source: BYAMN Recon (Apify + web search + history dorking)

### Profile
- **Name:** {full name}
- **Title:** {current title}
- **Org:** {organization}
- **LinkedIn:** {URL}
- **Email (corporate, estimated):** {email pattern}
- **Email (personal):** {if found, with confidence + source}
- **Location:** {city}

### Contact Information
- Corporate email: {estimated}
- Personal email: {if found} (confidence: high/medium/low — source: {URL})
- Phone: {if found}
- YouTube: {handle or "not found"}
- Instagram: {handle or "not found"}
- Twitter: {handle or "not found"}
- GitHub: {if found}
- Portfolio: {if found}

### Digital Footprint
- {source URL} — {what was found there} ({date if known})
- ...

### Career History
| Period | Role | Company |
|--------|------|---------|
| ... | ... | ... |

### Education
- {degree} — {institution}, {years}

### Recent Activity
- {date}: {activity description + link}

### Interests & Themes
- {theme 1}
- {theme 2}

### Relevance to Wells
- {how Wells' work connects to this person's interests}

### Mutual Connections
- {any shared connections or communities}

### Approach Notes
- {specific angles for outreach based on research}

### Data Limitations
- {what sources failed, returned no data, or were skipped}
```

## Example
```
/byamn recon "Andrew Forde" "KPMG Canada"
```
