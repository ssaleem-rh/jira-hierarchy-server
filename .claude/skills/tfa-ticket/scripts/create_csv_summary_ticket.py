#!/usr/bin/env python3
"""Create a "Verify Report Portal Test Failures" Jira ticket from a TFA CSV export.

One ticket per CSV. The ticket body is a table of every row in the CSV, plus
a per-row TFA Label derived from the Disposition column. Reuses the Jira
plumbing (auth, ADF helpers, live field resolution) from create_tfa_ticket.py.

Jira Cloud caps the description body at 32,767 plain-text characters, and
separately rejects comments that are "too complex" (CONTENT_LIMIT_EXCEEDED)
well before that - the exact comment threshold isn't published and seems to
depend on table markup overhead, not just visible text length. So: when the
full table doesn't fit in the description, it's posted instead as one or
more follow-up comments, each attempted and - on CONTENT_LIMIT_EXCEEDED -
recursively split in half and retried until every piece fits. This
self-calibrates instead of guessing a fixed row-per-comment count.

Expected CSV columns: Test Name, Component, Status, Launch Name,
RHOAI Version, Disposition, Confidence, Resolution / Action Taken,
Failure Summary, Failure Group, Group Occurrences, ReportPortal Link.

Usage:
    create_csv_summary_ticket.py --csv "TFAs 3.6.0.csv" [--dry-run]
    create_csv_summary_ticket.py --csv "TFAs 3.6.0.csv" --existing-issue RHOAIENG-97749
        (skip issue creation, only post the comment table(s) to an issue that
        already exists - use this if a previous run created the issue but
        failed while posting comments.)
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from create_tfa_ticket import (
    JiraAPIError,
    add_comment,
    jira_request,
    link_node,
    load_env,
    paragraph,
    plain_text_len,
    resolve_affects_version,
    resolve_components,
    rule,
    table,
    table_cell,
    text_node,
)

# Jira Cloud caps the plain-text length of the description body at 32,767
# characters. Comments have a stricter, opaque limit - see module docstring.
MAX_FIELD_CHARS = 32767
SAFETY_MARGIN = 1000
INITIAL_BATCH_SIZE = 20

# Only these three Disposition values have been observed in TFA exports to date.
# Anything else is passed through as "unmapped:<value>" rather than guessed.
DISPOSITION_LABELS = {
    "SYSTEM_ISSUE": "tfa-infra-issue",
    "NO_DEFECT": "tfa-false-positive",
    "AUTOMATION_BUG": "tfa-automation-bug",
}

TABLE_HEADERS = [
    "Test Name",
    "Component",
    "Status",
    "Launch Name",
    "RHOAI Version",
    "Disposition",
    "TFA Label",
    "Confidence",
    "Resolution / Action Taken",
    "Failure Summary",
    "Failure Group",
    "Group Occurrences",
    "ReportPortal Link",
]


def truncate(text: str, limit: int = 220) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def tfa_label_for(disposition: str) -> str:
    return DISPOSITION_LABELS.get(disposition, f"unmapped:{disposition}")


def row_cells(row: dict[str, str]) -> list[dict[str, Any]]:
    disposition = (row.get("Disposition") or "").strip()
    tfa_label = tfa_label_for(disposition)
    link = (row.get("ReportPortal Link") or "").strip()
    link_cell_content = paragraph(link_node("Report Portal", link)) if link else paragraph(text_node(""))

    return [
        table_cell(paragraph(text_node(row.get("Test Name", "")))),
        table_cell(paragraph(text_node(row.get("Component", "")))),
        table_cell(paragraph(text_node(row.get("Status", "")))),
        table_cell(paragraph(text_node(row.get("Launch Name", "")))),
        table_cell(paragraph(text_node(row.get("RHOAI Version", "")))),
        table_cell(paragraph(text_node(disposition))),
        table_cell(paragraph(text_node(tfa_label))),
        table_cell(paragraph(text_node(row.get("Confidence", "")))),
        table_cell(paragraph(text_node(row.get("Resolution / Action Taken", "")))),
        table_cell(paragraph(text_node(truncate(row.get("Failure Summary", ""))))),
        table_cell(paragraph(text_node(row.get("Failure Group", "")))),
        table_cell(paragraph(text_node(row.get("Group Occurrences", "")))),
        table_cell(link_cell_content),
    ]


def build_table_from_rows(rows: list[dict[str, str]]) -> dict[str, Any]:
    return table(TABLE_HEADERS, [row_cells(row) for row in rows])


def build_intro(csv_name: str, version: str, rows: list[dict[str, str]], split_note: str | None) -> list[dict[str, Any]]:
    disposition_counts = Counter((r.get("Disposition") or "").strip() for r in rows)
    component_counts = Counter((r.get("Component") or "").strip() for r in rows)

    disposition_bits = ", ".join(f"{count} {name}" for name, count in disposition_counts.most_common())
    component_bits = ", ".join(f"{count} {name}" for name, count in component_counts.most_common())

    content = [
        paragraph(
            text_node(
                f"Verify Report Portal test failures on RHOAI {version}. "
                f"{len(rows)} failures were exported from Report Portal for this version ({csv_name})."
            )
        ),
        paragraph(text_node("Breakdown by disposition: ", bold=True), text_node(disposition_bits)),
        paragraph(text_node("Breakdown by component: ", bold=True), text_node(component_bits)),
    ]
    if split_note:
        content.append(paragraph(text_node(split_note, bold=True)))
    else:
        content.append(
            paragraph(
                text_node(
                    "Each row below is one reported failure with its Report Portal disposition, a mapped "
                    "TFA label, confidence, and resolution notes. The Failure Summary column is truncated to "
                    "keep the table readable — follow the ReportPortal Link for the full analysis."
                )
            )
        )
    return content


def build_full_doc(csv_name: str, version: str, rows: list[dict[str, str]]) -> dict[str, Any]:
    content = build_intro(csv_name, version, rows, split_note=None)
    content.append(build_table_from_rows(rows))
    content.append(rule())
    content.append(paragraph(text_node("Manual updates below this line only. DO NOT CHANGE TEXT ABOVE", bold=True)))
    return {"type": "doc", "version": 1, "content": content}


def build_light_doc(csv_name: str, version: str, rows: list[dict[str, str]]) -> dict[str, Any]:
    split_note = (
        f"This CSV has {len(rows)} rows, too many to fit in one Jira description. "
        f"The full per-test table is posted as follow-up comment(s) below instead."
    )
    content = build_intro(csv_name, version, rows, split_note=split_note)
    content.append(rule())
    content.append(paragraph(text_node("Manual updates below this line only. DO NOT CHANGE TEXT ABOVE", bold=True)))
    return {"type": "doc", "version": 1, "content": content}


def build_comment_doc(rows: list[dict[str, str]], start_idx: int, end_idx: int, total_rows: int) -> dict[str, Any]:
    content = [
        paragraph(text_node(f"Report Portal failures {start_idx}-{end_idx} of {total_rows}", bold=True)),
        build_table_from_rows(rows),
    ]
    return {"type": "doc", "version": 1, "content": content}


def post_rows_as_comments(
    env: dict[str, str],
    issue_key: str,
    rows: list[dict[str, str]],
    total_rows: int,
    start_idx: int,
    warnings: list[str],
) -> int:
    """Post `rows` as one comment; split in half and retry on CONTENT_LIMIT_EXCEEDED.

    `rows` is a contiguous slice of the full CSV starting at absolute,
    1-based index `start_idx` (used only for human-readable range headers).
    Returns the number of comments actually posted.
    """
    end_idx = start_idx + len(rows) - 1
    doc = build_comment_doc(rows, start_idx, end_idx, total_rows)
    try:
        add_comment(env, issue_key, doc)
        return 1
    except JiraAPIError as e:
        if len(rows) <= 1 or "CONTENT_LIMIT_EXCEEDED" not in str(e):
            warnings.append(f"Failed to post comment for rows {start_idx}-{end_idx}: {e}")
            return 0
        mid = len(rows) // 2
        posted = post_rows_as_comments(env, issue_key, rows[:mid], total_rows, start_idx, warnings)
        posted += post_rows_as_comments(env, issue_key, rows[mid:], total_rows, start_idx + mid, warnings)
        return posted


def post_all_comments(env: dict[str, str], issue_key: str, rows: list[dict[str, str]], warnings: list[str]) -> int:
    total = len(rows)
    posted = 0
    for batch_start in range(0, total, INITIAL_BATCH_SIZE):
        batch = rows[batch_start : batch_start + INITIAL_BATCH_SIZE]
        posted += post_rows_as_comments(env, issue_key, batch, total, batch_start + 1, warnings)
    return posted


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", required=True, help="Path to the TFA CSV export")
    parser.add_argument("--project", default="RHOAIENG")
    parser.add_argument("--issuetype", default="Bug")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--existing-issue",
        help="Skip issue creation; only post the comment table(s) to this already-created issue key.",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv)
    with csv_path.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        sys.exit(f"No rows found in {csv_path}")

    version = (rows[0].get("RHOAI Version") or "").strip()
    env = load_env()
    warnings: list[str] = []

    mapped_labels = [tfa_label_for((r.get("Disposition") or "").strip()) for r in rows]
    issue_labels = sorted({label for label in mapped_labels if not label.startswith("unmapped:")})
    unmapped = sorted({label for label in mapped_labels if label.startswith("unmapped:")})
    if unmapped:
        warnings.append(
            f"Dispositions with no tfa-* mapping (kept in the table's TFA Label column, "
            f"not added as issue labels): {', '.join(unmapped)}"
        )

    full_doc = build_full_doc(csv_path.name, version, rows)
    fits_in_description = plain_text_len(full_doc) <= MAX_FIELD_CHARS - SAFETY_MARGIN
    description = full_doc if fits_in_description else build_light_doc(csv_path.name, version, rows)

    if args.existing_issue:
        preview = {"existing_issue": args.existing_issue, "row_count": len(rows), "table_in_description": fits_in_description}
        if args.dry_run:
            print(json.dumps({"preview": preview, "warnings": warnings}, indent=2))
            return
        posted = 0 if fits_in_description else post_all_comments(env, args.existing_issue, rows, warnings)
        print(json.dumps({"key": args.existing_issue, "comments_posted": posted, "warnings": warnings}, indent=2))
        return

    components = resolve_components(env, args.project, ["AI Evaluations", "AI Safety"], warnings)
    versions = resolve_affects_version(env, args.project, version, warnings)

    fields: dict[str, Any] = {
        "project": {"key": args.project},
        "issuetype": {"name": args.issuetype},
        "summary": f"Verify Report Portal Test Failures on {version}",
        "description": description,
    }
    if issue_labels:
        fields["labels"] = issue_labels
    if components:
        fields["components"] = components
    if versions:
        fields["versions"] = versions

    preview = {
        "project": args.project,
        "issuetype": args.issuetype,
        "summary": fields["summary"],
        "row_count": len(rows),
        "labels": issue_labels,
        "components": [c["name"] for c in components],
        "affects_versions": [v["name"] for v in versions],
        "table_in_description": fits_in_description,
    }

    if args.dry_run:
        print(json.dumps({"preview": preview, "warnings": warnings}, indent=2))
        return

    created = jira_request(env, "POST", "/rest/api/3/issue", {"fields": fields})
    issue_key = created["key"]
    issue_url = f"{env['JIRA_URL'].rstrip('/')}/browse/{issue_key}"

    posted = 0 if fits_in_description else post_all_comments(env, issue_key, rows, warnings)

    print(json.dumps({"key": issue_key, "url": issue_url, "comments_posted": posted, "warnings": warnings}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except JiraAPIError as e:
        sys.exit(str(e))
