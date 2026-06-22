"""Combine Jira and GitHub metrics into a ranked leaderboard."""

import logging
from datetime import datetime, timezone

log = logging.getLogger(__name__)


def _score(entry):
    """Rank by total completed work: Jira completions + merged PRs."""
    return entry['jira_completed'] + entry['github_merged_prs']


def aggregate(jira_data, github_data):
    """
    Join Jira and GitHub metrics by display_name and return a ranked list.
    Users present in Jira but missing from GitHub get zeros for GitHub fields.
    """
    github_by_name = {row['display_name']: row for row in github_data}

    entries = []
    for jira in jira_data:
        name = jira['display_name']
        gh = github_by_name.get(name, {})
        jira_completed = jira.get('completed', 0)
        github_merged = gh.get('merged_prs', 0)
        entries.append({
            'name': jira.get('user', name),
            'display_name': name,
            'jira_username': jira.get('user', ''),
            'github_username': gh.get('user', ''),
            'period': jira.get('period', ''),
            'jira_assigned': jira.get('assigned', 0),
            'jira_completed': jira_completed,
            'jira_active': jira.get('active', 0),
            'github_opened_prs': gh.get('opened_prs', 0),
            'github_merged_prs': github_merged,
            'github_open_prs': gh.get('open_prs', 0),
            'total': jira_completed + github_merged,
        })

    entries.sort(key=_score, reverse=True)
    for rank, entry in enumerate(entries, start=1):
        entry['rank'] = rank

    return entries


def collect_all(users, period, jira_metrics_fn, github_metrics_fn):
    """
    Orchestrate data collection and return the full aggregated result.

    Args:
        users: list of user dicts from users.json
        period: '30d' | '3m' | '6m' | '12m'
        jira_metrics_fn(users, period) -> list
        github_metrics_fn(users, period) -> list
    """
    log.info('Collecting Jira metrics for period=%s...', period)
    jira_data = jira_metrics_fn(users, period)

    log.info('Collecting GitHub metrics for period=%s...', period)
    github_data = github_metrics_fn(users, period)

    return {
        'period': period,
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'users': aggregate(jira_data, github_data),
        'raw': {
            'jira': jira_data,
            'github': github_data,
        },
    }
