"""Fetch per-user GitHub PR metrics.

Uses GraphQL API when GITHUB_TOKEN is set; falls back to REST search API
(works unauthenticated for public repos, 10 req/min rate limit).
"""

import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from leaderboard.config import GITHUB_TOKEN

log = logging.getLogger(__name__)

_GITHUB_API = 'https://api.github.com'
_GITHUB_GRAPHQL = 'https://api.github.com/graphql'

PERIOD_DAYS = {
    '30d': 30,
    '3m':  91,
    '6m':  183,
    '12m': 365,
}

_GRAPHQL_QUERY = """
query($query: String!, $cursor: String) {
  search(query: $query, type: ISSUE, first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number
        title
        url
        state
        createdAt
        mergedAt
        repository { nameWithOwner }
      }
    }
  }
}
"""


def _since_date(period):
    days = PERIOD_DAYS.get(period, 30)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    return since.strftime('%Y-%m-%d')


def _headers(token=None):
    h = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    tok = token or GITHUB_TOKEN
    if tok:
        h['Authorization'] = f'Bearer {tok}'
    return h


def _check_rate_limit(resp):
    remaining = int(resp.headers.get('X-RateLimit-Remaining', 999))
    if remaining < 5:
        reset_at = int(resp.headers.get('X-RateLimit-Reset', 0))
        wait = max(1, reset_at - int(time.time())) + 1
        log.warning('GitHub rate limit low (%d remaining); sleeping %ds', remaining, wait)
        time.sleep(wait)


def _fetch_prs_graphql(username, since, token):
    """Fetch all PRs via GitHub GraphQL API."""
    search_query = f'author:{username} is:pr created:>={since}'
    prs, cursor = [], None

    while True:
        resp = requests.post(
            _GITHUB_GRAPHQL,
            headers={**_headers(token), 'Content-Type': 'application/json'},
            json={'query': _GRAPHQL_QUERY, 'variables': {'query': search_query, 'cursor': cursor}},
            timeout=30,
        )
        resp.raise_for_status()
        _check_rate_limit(resp)

        data = resp.json()
        if 'errors' in data:
            raise RuntimeError(f'GraphQL errors: {data["errors"]}')

        search = data['data']['search']
        prs.extend(search['nodes'])
        if not search['pageInfo']['hasNextPage']:
            break
        cursor = search['pageInfo']['endCursor']

    return prs


def _fetch_prs_rest(username, since, token=None):
    """Fetch all PRs via GitHub REST search API (works for public repos without a token)."""
    q = f'author:{username} is:pr created:>={since}'
    prs, page = [], 1

    while True:
        resp = requests.get(
            f'{_GITHUB_API}/search/issues',
            headers=_headers(token),
            params={'q': q, 'per_page': 100, 'page': page, 'sort': 'created', 'order': 'desc'},
            timeout=30,
        )
        resp.raise_for_status()
        _check_rate_limit(resp)

        data = resp.json()
        items = data.get('items', [])

        for item in items:
            merged_at = item.get('pull_request', {}).get('merged_at')
            state = 'MERGED' if merged_at else item['state'].upper()
            prs.append({
                'number': item['number'],
                'title': item['title'],
                'url': item['html_url'],
                'state': state,
                'createdAt': item['created_at'],
                'mergedAt': merged_at,
                'repository': {'nameWithOwner': item['repository_url'].split('/repos/', 1)[-1]},
            })

        total = data.get('total_count', 0)
        if len(items) < 100 or page * 100 >= min(total, 1000):
            break
        page += 1
        # Respect unauthenticated rate limit (10 req/min)
        if not (token or GITHUB_TOKEN):
            time.sleep(6)

    return prs


def _normalize(prs):
    """Produce a consistent output schema regardless of fetch method."""
    out = []
    for pr in prs:
        out.append({
            'number': pr['number'],
            'title': pr['title'],
            'url': pr.get('url', ''),
            'state': pr.get('state', 'OPEN').upper(),
            'created_at': pr.get('createdAt', ''),
            'merged_at': pr.get('mergedAt'),
            'repository': pr.get('repository', {}).get('nameWithOwner', ''),
        })
    return out


def fetch_user_github_metrics(user, period, token=None):
    """Return GitHub PR metrics dict for a single user."""
    username = user['github_username']
    since = _since_date(period)
    tok = token or GITHUB_TOKEN

    try:
        raw = _fetch_prs_graphql(username, since, tok) if tok else _fetch_prs_rest(username, since)
    except Exception as exc:
        log.warning('GraphQL failed for %s, falling back to REST: %s', username, exc)
        raw = _fetch_prs_rest(username, since, tok)

    prs = _normalize(raw)
    merged = [p for p in prs if p['state'] == 'MERGED']
    open_prs = [p for p in prs if p['state'] == 'OPEN']

    return {
        'user': username,
        'display_name': user['display_name'],
        'period': period,
        'opened_prs': len(prs),
        'merged_prs': len(merged),
        'open_prs': len(open_prs),
        'pull_requests': prs,
    }


def collect_github_metrics(users, period, token=None):
    """Collect GitHub metrics for all users; per-user errors are isolated.

    Users without a github_username are skipped (zeroed) to avoid wasting
    unauthenticated rate limit before reaching users with known handles.
    """
    results = []
    tok = token or GITHUB_TOKEN
    for user in users:
        if not user.get('github_username'):
            results.append({
                'user': '',
                'display_name': user['display_name'],
                'period': period,
                'opened_prs': 0,
                'merged_prs': 0,
                'open_prs': 0,
                'pull_requests': [],
            })
            continue
        try:
            log.info('Fetching GitHub metrics for %s (%s)...', user['display_name'], period)
            results.append(fetch_user_github_metrics(user, period, tok))
            # Courtesy delay for unauthenticated REST rate limit (10 req/min)
            if not tok:
                time.sleep(7)
        except Exception as exc:
            log.error('GitHub fetch failed for %s: %s', user['display_name'], exc)
            results.append({
                'user': user['github_username'],
                'display_name': user['display_name'],
                'period': period,
                'opened_prs': 0,
                'merged_prs': 0,
                'open_prs': 0,
                'pull_requests': [],
                'error': str(exc),
            })
    return results
