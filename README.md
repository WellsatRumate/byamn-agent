# BYAMN — By Any Means Necessary

> A 5-agent AI outreach system built by Wells Mensah as a proof-of-work
> application for the KPMG Canada AI Builder (Senior Consultant) role.
>
> **The agent is the application.** Every outreach message it sends links here
> so the recipient can verify that what they received was, in fact, drafted and
> sent by an AI agent — not a human disguising themselves as one.

---

## What's in here

| | |
|---|---|
| `CLAUDE.md` | System prompt — what BYAMN is and how it operates |
| `BYAMN_Build_Spec_Agents.md` | Full build spec: architecture, pipeline, demo plan |
| `HOW-IT-WAS-MADE.md` | Build log from the two-day sprint that produced v1.0 |
| `modes/` | Per-agent instruction files (recon, deep-recon, strategy, draft, send, campaign, browse) |
| `scripts/` | Data gatherers and executors (Apify, Gmail, Playwright, OSINT) |
| `playbooks/` | Browser-routing logic and per-platform navigation notes |
| `cv.md`, `cover-letter.md` | Wells' CV and KPMG cover letter (markdown source) |
| `Wells_Mensah_CV.pdf` | CV as PDF |
| `Wells_Mensah_KPMG_Cover_Letter.pdf` | Cover letter as PDF |
| `config/profile.yml` | Applicant profile + target config |
| `targets/kpmg-example.json` | **Dummy** target schema. Real targets are not in this public repo. |
| `data/campaign-log.md` | Empty template; real campaign log is gated. |

---

## The 5-Agent Architecture

```
Recon → Deep Recon → Strategy → Draft → Campaign (orchestrator)
                                         ↓
                                    Gmail / Playwright
```

See `CLAUDE.md` for the full diagram and per-agent role table.

---

## What's NOT in here, on purpose

- Real target list, drafts, recon reports, and per-target dossiers — those
  live in a private repo. Showing the agent's full output for a campaign in
  flight would compromise the people being researched, regardless of how
  public their LinkedIn profiles are. The schema and methodology are open;
  the live data is not.

---

## Who built this

**Wells Mensah** — AI builder, creative strategist, marketing specialist (Toronto, ON).
Contact: wells.mensah@gmail.com · 647-657-9692 · [LinkedIn](https://linkedin.com/in/wellsmensah-695264193)

Built for the KPMG Canada AI Builder application. See `cover-letter.md` for
context on why this exists.
