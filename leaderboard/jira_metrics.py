"""Fetch per-user Jira metrics for the leaderboard."""

import base64
import logging
import os
import sys

import requests

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from jira_hierarchy.config import JIRA_BASE_URL
from jira_hierarchy.jira_client import run_jira_query

log = logging.getLogger(__name__)

PERIOD_JQL = {
    '30d': '-30d',
    '3m':  '-13w',
    '6m':  '-26w',
    '12m': '-52w',
}

_FIELDS = 'summary,status,priority,customfield_10028,created,resolutiondate,issuetype'


def _auth_headers(email, pat):
    token = base64.b64encode(f'{email}:{pat}'.encode()).decode()
    return {'Authorization': f'Basic {token}', 'Accept': 'application/json'}


def resolve_account_id(jira_search_name, email, pat):
    """Look up JIRA Cloud accountId by searching display name."""
    url = f'{JIRA_BASE_URL}/rest/api/3/user/search'
    resp = requests.get(
        url,
        headers=_auth_headers(email, pat),
        params={'query': jira_search_name, 'maxResults': 5},
        timeout=15,
    )
    resp.raise_for_status()
    results = resp.json()
    if not results:
        raise ValueError(f'No JIRA user found for search: {jira_search_name!r}')
    return results[0]['accountId']


def _fetch_raw_issues(account_id, projects, period_window, email, pat):
    project_str = ', '.join(projects)
    jql = (
        f'assignee = "{account_id}" '
        f'AND project IN ({project_str}) '
        f'AND created >= {period_window}'
    )
    return run_jira_query(jql, _FIELDS, email, pat, wfile=None)


def _build_ticket(issue):
    f = issue.get('fields', {})
    return {
        'key': issue['key'],
        'summary': f.get('summary', ''),
        'status': f.get('status', {}).get('name', ''),
        'issue_type': f.get('issuetype', {}).get('name', ''),
        'story_points': f.get('customfield_10028'),
        'created': f.get('created', ''),
        'completed': f.get('resolutiondate'),
    }


def _is_done(issue):
    category = (
        issue.get('fields', {})
             .get('status', {})
             .get('statusCategory', {})
             .get('name', '')
    )
    return category == 'Done'


def fetch_user_jira_metrics(user, period, projects, email, pat):
    """Return metrics dict for a single user."""
    account_id = user.get('jira_account_id')
    if not account_id:
        log.info('Resolving JIRA account ID for %s...', user['display_name'])
        account_id = resolve_account_id(user['jira_search_name'], email, pat)

    period_window = PERIOD_JQL.get(period, '-30d')
    issues = _fetch_raw_issues(account_id, projects, period_window, email, pat)

    tickets = [_build_ticket(i) for i in issues]
    done_keys = {_build_ticket(i)['key'] for i in issues if _is_done(i)}
    completed = [t for t in tickets if t['key'] in done_keys]
    active = [t for t in tickets if t['key'] not in done_keys]

    return {
        'user': user.get('name', user['display_name']),
        'display_name': user['display_name'],
        'period': period,
        'jira_account_id': account_id,
        'assigned': len(tickets),
        'completed': len(completed),
        'active': len(active),
        'tickets': tickets,
    }


def collect_jira_metrics(users, period, projects, email, pat):
    """Collect Jira metrics for all users; per-user errors are isolated."""
    results = []
    for user in users:
        try:
            log.info('Fetching Jira metrics for %s (%s)...', user['display_name'], period)
            results.append(fetch_user_jira_metrics(user, period, projects, email, pat))
        except Exception as exc:
            log.error('Jira fetch failed for %s: %s', user['display_name'], exc)
            results.append({
                'user': user.get('name', user['display_name']),
                'display_name': user['display_name'],
                'period': period,
                'jira_account_id': None,
                'assigned': 0,
                'completed': 0,
                'active': 0,
                'tickets': [],
                'error': str(exc),
            })
    return results
