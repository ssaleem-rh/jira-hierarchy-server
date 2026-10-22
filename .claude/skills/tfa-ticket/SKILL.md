---
name: tfa-ticket
description: >
  Create a TFA-style Jira bug ticket (RHOAIENG, type Bug) from a messy title
  and description. Cleans up the summary/description, infers the right
  tfa-* label from the Label Reference table (with your confirmation), links
  a PR, and files the ticket via create_tfa_ticket.py using this repo's
  JIRA_EMAIL/JIRA_PAT from .env.local. Also handles bulk "Verify Report
  Portal Test Failures" tickets from a TFA CSV export via
  create_csv_summary_ticket.py (one ticket per CSV, full data as a table).
  Trigger phrases include: "create a tfa ticket", "file a tfa bug", "new tfa
  ticket", "make a ticket from this csv", "verify report portal failures".
allowed-tools: Bash Read Write AskUserQuestion
---

# TFA Ticket Creator

Creates Jira bugs that follow the TFA (Test Failure Analysis) template used
on tickets like RHOAIENG-93814: cleaned summary, structured description with
a details block, a `tfa-*` label, and a linked PR.

`create_tfa_ticket.py` does all the Jira API work (field resolution, ADF
description, issue creation, PR remote-link). This skill's job is to gather
and clean the input, then drive the script. Do not call the Jira REST API
directly — always go through the script.

## Label Reference

| Label | Meaning |
|---|---|
| `tfa-product-bug` | Real product issue found by the test |
| `tfa-automation-bug` | Test code issue or flaky automation |
| `tfa-infra-issue` | Infrastructure instability or defect (e.g. nodes/network) |
| `tfa-env-setup` | Environment setup issue (e.g. missing dependency operator) |
| `tfa-duplicate` | Same root cause as another tracked issue |
| `tfa-known-issue` | Failure matches an existing known issue |
| `tfa-false-positive` | Passed on re-run; flaky or one-off env issue. Reclassify to `tfa-automation-bug` if it recurs. |
| `tfa-wrong-assignment` | Failure was routed to the wrong team/component |

## Workflow

### Step 1: Gather input

Ask the user for (plain conversation, not AskUserQuestion — this is free-text data collection, not a decision):

- **Messy title** (required)
- **Messy description** (required) — can include a raw failure message/stack trace, notes, whatever they have
- **PR link** (optional)
- **Any metadata they have handy** (all optional, skip what they don't have): Product, RHOAI Version, Update Channel, Cluster Type, Cluster Product Type, FBC Image, Jira Component(s) (e.g. `AI Evaluations`), Test name, Class, Priority, Affects Version

Don't interrogate them field by field — ask once, let them paste whatever they have, and move on with what's given.

### Step 2: Clean it up

This is your job, not the script's:

- **Summary**: concise, Jira-style. If a component is known, prefix like `[component] Failed test: ...` matching the template convention. Strip filler words, fix grammar, keep it under ~120 chars.
- **Description**: rewrite the messy description into clear, professional technical prose. If the input contains a raw stack trace / assertion / pytest failure block, preserve that **verbatim** and pass it separately as `failure_log` in the payload (it renders in a code block) — don't paraphrase stack traces.

### Step 3: Infer and confirm the label

Read the cleaned description and the Label Reference table above, pick the single most likely `tfa-*` label, and use **AskUserQuestion** to confirm it with the user before proceeding (offer your pick plus 2-3 other plausible labels from the table). This is a judgment call worth a real decision point — don't skip it and don't silently guess.

### Step 4: Build the payload

Write a JSON file (e.g. `/tmp/tfa-ticket-payload.json`) with the Write tool:

```json
{
  "project": "RHOAIENG",
  "issuetype": "Bug",
  "summary": "<cleaned summary>",
  "description": "<cleaned description, no stack trace>",
  "failure_log": "<raw stack trace/assertion, if any — omit key if none>",
  "metadata": {
    "Product": "...",
    "RHOAI Version": "...",
    "Update Channel": "...",
    "Cluster Type": "...",
    "Cluster Product Type": "...",
    "FBC Image": "...",
    "Component": "...",
    "Test": "...",
    "Class": "..."
  },
  "label": "<confirmed tfa-* label>",
  "extra_labels": [],
  "components": ["<Jira project component(s), if given>"],
  "priority": "<if given>",
  "affects_version": "<RHOAI Version or Affects Version, if given>",
  "pr_url": "<PR link, if given>"
}
```

Omit `metadata` keys, `failure_log`, `components`, `priority`, `affects_version`, and `pr_url` entirely when not available — don't send empty strings.

### Step 5: Preview (dry run)

```bash
python3 .claude/skills/tfa-ticket/scripts/create_tfa_ticket.py --input /tmp/tfa-ticket-payload.json --dry-run
```

This resolves components/priority/affects-version against the live Jira project and prints a preview plus any `warnings` (e.g. a component name that didn't match). Show the preview and any warnings to the user. **Fix and re-run the dry run** if something looks wrong (wrong label, unmatched component, bad summary) rather than creating the issue and editing it after.

### Step 6: Confirm, then create

Ask the user to confirm creation (plain yes/no is fine here, this is the irreversible step — it files a real ticket on redhat.atlassian.net). On confirmation:

```bash
python3 .claude/skills/tfa-ticket/scripts/create_tfa_ticket.py --input /tmp/tfa-ticket-payload.json
```

This creates the issue and, if `pr_url` was set, attaches it as a remote link. Report the returned `key` and `url` to the user.

## Do Not

- Do not call the Jira REST API yourself — always go through `create_tfa_ticket.py`.
- Do not skip the dry-run preview before creating.
- Do not invent metadata values the user didn't give you (Cluster Type, FBC Image, etc.) — omit the field instead of guessing.
- Do not silently pick the `tfa-*` label without confirming via AskUserQuestion.
- Do not put credentials in the payload file or in chat — the script reads them from `.env.local` itself.

## Bulk CSV Summary Tickets ("Verify Report Portal Test Failures")

For a TFA CSV export (columns: Test Name, Component, Status, Launch Name,
RHOAI Version, Disposition, Confidence, Resolution / Action Taken, Failure
Summary, Failure Group, Group Occurrences, ReportPortal Link) — create **one
ticket per CSV**, title `Verify Report Portal Test Failures on <version>`
(version from the CSV's RHOAI Version column), full CSV data as a table.
Components are always `AI Evaluations` + `AI Safety`. Per-row TFA Label is
mapped from Disposition: `SYSTEM_ISSUE`→`tfa-infra-issue`, `NO_DEFECT`→
`tfa-false-positive`, `AUTOMATION_BUG`→`tfa-automation-bug` (unmapped
dispositions are passed through as `unmapped:<value>` in the table rather
than guessed — flag these to the user). Issue `labels` = the distinct set of
mapped tfa-* labels actually present in that CSV.

Use `create_csv_summary_ticket.py`, not `create_tfa_ticket.py`, for this flow:

```bash
python3 .claude/skills/tfa-ticket/scripts/create_csv_summary_ticket.py --csv "TFAs 3.6.0.csv" --dry-run
python3 .claude/skills/tfa-ticket/scripts/create_csv_summary_ticket.py --csv "TFAs 3.6.0.csv"
```

Show the dry-run preview (summary, labels, components, affects-version,
row count) for every CSV before creating any of them, same confirm-then-create
discipline as the single-ticket flow.

**Field size limits (the script handles these automatically, but know they
exist):** Jira's description field caps at 32,767 plain-text characters — if
the full table doesn't fit, the script drops the table from the description
(keeping just the intro/breakdown) and posts the full table instead as
follow-up comment(s). Comments separately enforce a stricter, undocumented
`CONTENT_LIMIT_EXCEEDED` limit well below that — the script already handles
this by posting in small batches and recursively halving any batch that gets
rejected until every piece fits, so no manual tuning is needed. The dry-run
preview's `table_in_description` field tells you which path will be used.

If a run fails partway through posting comments (issue created, some/all
comments missing), **do not re-run normally** — that creates a duplicate
issue. Instead check `GET /rest/api/3/issue/{key}/comment` for what's already
there, then backfill with:

```bash
python3 .claude/skills/tfa-ticket/scripts/create_csv_summary_ticket.py --csv "TFAs 3.6.0.csv" --existing-issue RHOAIENG-XXXXX
```
