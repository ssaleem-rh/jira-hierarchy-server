#!/usr/bin/env python3
"""Create a TFA-style Jira bug ticket from a JSON payload.

Reads Jira credentials from this repo's .env.local (JIRA_URL, JIRA_EMAIL,
JIRA_PAT), resolves components/priority/affects-version against the live
project metadata, builds an ADF description, and creates the issue via the
Jira REST API. Stdlib only - no third-party dependencies.

Usage:
    create_tfa_ticket.py --input payload.json [--dry-run]

Payload schema (fields not listed are optional):
{
  "project": "RHOAIENG",
  "issuetype": "Bug",
  "summary": "[component] Failed test: ...",          # required, cleaned
  "description": "...",                                # required, cleaned
  "metadata": {                                        # free-form, all optional
    "Product": "RHOAI",
    "RHOAI Version": "3.6.0-ea.1",
    "Update Channel": "beta",
    "Cluster Type": "selfmanaged",
    "Cluster Product Type": "OCP",
    "FBC Image": "quay.io/...",
    "Component": "ai-evaluations",
    "Test": "test_foo[bar]",
    "Class": "Some.Test.Class"
  },
  "label": "tfa-product-bug",
  "extra_labels": ["test-failed"],
  "components": ["AI Evaluations", "AI Safety"],
  "priority": "Normal",
  "affects_version": "3.6 EA1 RHOAI RELEASE",
  "pr_url": "https://github.com/org/repo/pull/123"
}
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_JIRA_URL = "https://redhat.atlassian.net"
REPO_ROOT = Path(__file__).resolve().parents[4]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {"JIRA_URL": DEFAULT_JIRA_URL}
    env_path = REPO_ROOT / ".env.local"
    if env_path.exists():
        for raw_line in env_path.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :].strip()
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            value = value.strip().strip('"').strip("'")
            if value:
                env[key.strip()] = value
    for key in ("JIRA_URL", "JIRA_EMAIL", "JIRA_PAT"):
        if os.environ.get(key):
            env[key] = os.environ[key]
    missing = [k for k in ("JIRA_EMAIL", "JIRA_PAT") if not env.get(k)]
    if missing:
        sys.exit(f"Missing Jira credentials in .env.local / env: {', '.join(missing)}")
    return env


def auth_header(env: dict[str, str]) -> str:
    token = base64.b64encode(f"{env['JIRA_EMAIL']}:{env['JIRA_PAT']}".encode()).decode()
    return f"Basic {token}"


class JiraAPIError(RuntimeError):
    def __init__(self, status: int, method: str, path: str, detail: str):
        super().__init__(f"Jira API error {status} on {method} {path}: {detail[:1000]}")
        self.status = status
        self.detail = detail


def jira_request(
    env: dict[str, str],
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
) -> Any:
    url = f"{env['JIRA_URL'].rstrip('/')}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", auth_header(env))
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise JiraAPIError(e.code, method, path, detail) from None


# ---------------------------------------------------------------------------
# ADF (Atlassian Document Format) helpers
# ---------------------------------------------------------------------------


def text_node(text: str, bold: bool = False) -> dict[str, Any]:
    node: dict[str, Any] = {"type": "text", "text": text}
    if bold:
        node["marks"] = [{"type": "strong"}]
    return node


def link_node(text: str, url: str) -> dict[str, Any]:
    return {"type": "text", "text": text, "marks": [{"type": "link", "attrs": {"href": url}}]}


def paragraph(*content: dict[str, Any]) -> dict[str, Any]:
    return {"type": "paragraph", "content": list(content)}


def multi_paragraphs(text: str) -> list[dict[str, Any]]:
    lines = text.replace("\r\n", "\n").split("\n")
    return [paragraph(text_node(line)) for line in lines if line.strip()] or [paragraph(text_node(text))]


def rule() -> dict[str, Any]:
    return {"type": "rule"}


def code_block(text: str) -> dict[str, Any]:
    return {"type": "codeBlock", "content": [{"type": "text", "text": text}]}


def table_cell(*content: dict[str, Any], header: bool = False) -> dict[str, Any]:
    return {
        "type": "tableHeader" if header else "tableCell",
        "attrs": {},
        "content": list(content) if content else [paragraph(text_node(""))],
    }


def table_row(cells: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "tableRow", "content": cells}


def table(headers: list[str], rows: list[list[dict[str, Any]]]) -> dict[str, Any]:
    header_row = table_row([table_cell(paragraph(text_node(h)), header=True) for h in headers])
    body_rows = [table_row(row) for row in rows]
    return {
        "type": "table",
        "attrs": {"isNumberColumnEnabled": False, "layout": "default"},
        "content": [header_row, *body_rows],
    }


def plain_text_len(node: Any) -> int:
    """Approximate the plain-text length Jira enforces its 32,767-char field cap against."""
    total = 0
    if isinstance(node, dict):
        if node.get("type") == "text":
            total += len(node.get("text", ""))
        for value in node.values():
            if isinstance(value, (dict, list)):
                total += plain_text_len(value)
    elif isinstance(node, list):
        for item in node:
            total += plain_text_len(item)
    return total


def build_description(payload: dict[str, Any]) -> dict[str, Any]:
    content: list[dict[str, Any]] = []
    content.extend(multi_paragraphs(payload["description"]))

    metadata: dict[str, str] = {k: v for k, v in (payload.get("metadata") or {}).items() if v}
    if metadata:
        content.append(paragraph(text_node("Details", bold=True)))
        for key, value in metadata.items():
            content.append(paragraph(text_node(f"{key}: ", bold=True), text_node(str(value))))

    if payload.get("failure_log"):
        content.append(paragraph(text_node("Failure log", bold=True)))
        content.append(code_block(payload["failure_log"]))

    if payload.get("pr_url"):
        content.append(paragraph(text_node("Pull Request: ", bold=True), link_node(payload["pr_url"], payload["pr_url"])))

    content.append(rule())
    content.append(paragraph(text_node("Manual updates below this line only. DO NOT CHANGE TEXT ABOVE", bold=True)))

    return {"type": "doc", "version": 1, "content": content}


# ---------------------------------------------------------------------------
# Field resolution against live project metadata
# ---------------------------------------------------------------------------


def resolve_components(env: dict[str, str], project: str, wanted: list[str], warnings: list[str]) -> list[dict[str, str]]:
    if not wanted:
        return []
    available = jira_request(env, "GET", f"/rest/api/3/project/{project}/components")
    by_name = {c["name"].lower(): c["name"] for c in available}
    resolved = []
    for name in wanted:
        match = by_name.get(name.lower())
        if match:
            resolved.append({"name": match})
        else:
            warnings.append(f"Component '{name}' not found on project {project}; skipping.")
    return resolved


def resolve_priority(env: dict[str, str], name: str | None, warnings: list[str]) -> dict[str, str] | None:
    if not name:
        return None
    available = jira_request(env, "GET", "/rest/api/3/priority")
    by_name = {p["name"].lower(): p["name"] for p in available}
    match = by_name.get(name.lower())
    if match:
        return {"name": match}
    warnings.append(f"Priority '{name}' not recognized; leaving unset.")
    return None


_VERSION_RE = re.compile(r"^(\d+\.\d+)\.(\d+)(?:-ea\.(\d+))?$", re.IGNORECASE)


def _ga_ea_candidate(name: str) -> str | None:
    """Map 'X.Y.0' -> 'X.Y GA RHOAI RELEASE' and 'X.Y.0-ea.N' -> 'X.Y EAN RHOAI RELEASE'.

    Matches the literal naming convention used for RHOAI release versions in
    Jira (confirmed against live project data) - only fires for exact patch-0
    / -ea.N forms, never for arbitrary patch versions, to avoid guessing.
    """
    m = _VERSION_RE.match(name.strip())
    if not m:
        return None
    major_minor, patch, ea_num = m.groups()
    if ea_num:
        return f"{major_minor} EA{ea_num} RHOAI RELEASE"
    if patch == "0":
        return f"{major_minor} GA RHOAI RELEASE"
    return None


def resolve_affects_version(env: dict[str, str], project: str, name: str | None, warnings: list[str]) -> list[dict[str, str]]:
    if not name:
        return []
    available = jira_request(env, "GET", f"/rest/api/3/project/{project}/versions")
    by_name = {v["name"].lower(): v["name"] for v in available}

    match = by_name.get(name.lower())
    if not match:
        for v_name in by_name.values():
            if name.lower() in v_name.lower():
                match = v_name
                break
    if not match:
        candidate = _ga_ea_candidate(name)
        if candidate:
            match = by_name.get(candidate.lower())
    if match:
        return [{"name": match}]
    warnings.append(f"Affects version '{name}' not found on project {project}; skipping.")
    return []


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def build_fields(env: dict[str, str], payload: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
    project = payload.get("project", "RHOAIENG")
    issuetype = payload.get("issuetype", "Bug")

    labels = []
    if payload.get("label"):
        labels.append(payload["label"])
    labels.extend(payload.get("extra_labels") or [])

    fields: dict[str, Any] = {
        "project": {"key": project},
        "issuetype": {"name": issuetype},
        "summary": payload["summary"],
        "description": build_description(payload),
    }
    if labels:
        fields["labels"] = labels

    components = resolve_components(env, project, payload.get("components") or [], warnings)
    if components:
        fields["components"] = components

    priority = resolve_priority(env, payload.get("priority"), warnings)
    if priority:
        fields["priority"] = priority

    versions = resolve_affects_version(env, project, payload.get("affects_version"), warnings)
    if versions:
        fields["versions"] = versions

    return fields


def add_pr_remote_link(env: dict[str, str], issue_key: str, pr_url: str) -> None:
    jira_request(
        env,
        "POST",
        f"/rest/api/3/issue/{issue_key}/remotelink",
        {"object": {"url": pr_url, "title": f"Pull Request: {pr_url}"}},
    )


def add_comment(env: dict[str, str], issue_key: str, adf_doc: dict[str, Any]) -> None:
    jira_request(env, "POST", f"/rest/api/3/issue/{issue_key}/comment", {"body": adf_doc})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Path to JSON payload file")
    parser.add_argument("--dry-run", action="store_true", help="Resolve fields and print the preview without creating the issue")
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text())
    for required in ("summary", "description"):
        if not payload.get(required):
            sys.exit(f"Payload missing required field: {required}")

    env = load_env()
    warnings: list[str] = []
    fields = build_fields(env, payload, warnings)

    preview = {
        "project": fields["project"]["key"],
        "issuetype": fields["issuetype"]["name"],
        "summary": fields["summary"],
        "labels": fields.get("labels", []),
        "components": [c["name"] for c in fields.get("components", [])],
        "priority": fields.get("priority", {}).get("name"),
        "affects_versions": [v["name"] for v in fields.get("versions", [])],
        "pr_url": payload.get("pr_url"),
    }

    if args.dry_run:
        print(json.dumps({"preview": preview, "warnings": warnings}, indent=2))
        return

    created = jira_request(env, "POST", "/rest/api/3/issue", {"fields": fields})
    issue_key = created["key"]
    issue_url = f"{env['JIRA_URL'].rstrip('/')}/browse/{issue_key}"

    if payload.get("pr_url"):
        add_pr_remote_link(env, issue_key, payload["pr_url"])

    print(json.dumps({"key": issue_key, "url": issue_url, "warnings": warnings}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except JiraAPIError as e:
        sys.exit(str(e))
