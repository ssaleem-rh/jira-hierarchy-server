import os
import sys
import pytest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from leaderboard.github_metrics import (
    PERIOD_DAYS,
    _normalize,
    _since_date,
    collect_github_metrics,
    fetch_user_github_metrics,
)

_MOCK_USER = {'display_name': 'Test', 'github_username': 'testuser'}

_REST_ITEMS = [
    {
        'number': 1,
        'title': 'Add feature',
        'html_url': 'https://github.com/org/repo/pull/1',
        'state': 'closed',
        'created_at': '2024-05-01T00:00:00Z',
        'repository_url': 'https://api.github.com/repos/org/repo',
        'pull_request': {'merged_at': '2024-05-10T00:00:00Z'},
    },
    {
        'number': 2,
        'title': 'Open PR',
        'html_url': 'https://github.com/org/repo/pull/2',
        'state': 'open',
        'created_at': '2024-05-20T00:00:00Z',
        'repository_url': 'https://api.github.com/repos/org/repo',
        'pull_request': {'merged_at': None},
    },
]


def _make_rest_response(items=None, total=None):
    mock_resp = MagicMock()
    items = items if items is not None else _REST_ITEMS
    mock_resp.json.return_value = {'total_count': total or len(items), 'items': items}
    mock_resp.raise_for_status = MagicMock()
    mock_resp.headers = {'X-RateLimit-Remaining': '100', 'X-RateLimit-Reset': '9999999999'}
    return mock_resp


class TestPeriodDays:
    def test_all_periods_present(self):
        for p in ('30d', '3m', '6m', '12m'):
            assert p in PERIOD_DAYS

    def test_12m_is_365_days(self):
        assert PERIOD_DAYS['12m'] == 365


class TestSinceDate:
    def test_returns_iso_date_string(self):
        result = _since_date('30d')
        assert len(result) == 10
        assert result[4] == '-'
        assert result[7] == '-'


class TestNormalize:
    def test_state_is_uppercased(self):
        prs = [{'number': 1, 'title': 'T', 'url': 'u', 'state': 'open',
                'createdAt': '2024-01-01', 'mergedAt': None,
                'repository': {'nameWithOwner': 'org/repo'}}]
        result = _normalize(prs)
        assert result[0]['state'] == 'OPEN'

    def test_repository_flattened(self):
        prs = [{'number': 1, 'title': 'T', 'url': 'u', 'state': 'MERGED',
                'createdAt': '2024-01-01', 'mergedAt': '2024-01-05',
                'repository': {'nameWithOwner': 'org/repo'}}]
        result = _normalize(prs)
        assert result[0]['repository'] == 'org/repo'


class TestFetchUserGithubMetrics:
    @patch('leaderboard.github_metrics.GITHUB_TOKEN', None)
    @patch('leaderboard.github_metrics.requests.get')
    def test_counts_merged_and_open(self, mock_get):
        mock_get.return_value = _make_rest_response()
        result = fetch_user_github_metrics(_MOCK_USER, '30d')
        assert result['opened_prs'] == 2
        assert result['merged_prs'] == 1  # PR #1 has merged_at set
        assert result['open_prs'] == 1    # PR #2 is open

    @patch('leaderboard.github_metrics.GITHUB_TOKEN', None)
    @patch('leaderboard.github_metrics.requests.get')
    def test_empty_results(self, mock_get):
        mock_get.return_value = _make_rest_response(items=[], total=0)
        result = fetch_user_github_metrics(_MOCK_USER, '30d')
        assert result['opened_prs'] == 0
        assert result['merged_prs'] == 0
        assert result['open_prs'] == 0
        assert result['pull_requests'] == []

    @patch('leaderboard.github_metrics.GITHUB_TOKEN', None)
    @patch('leaderboard.github_metrics.requests.get')
    def test_output_schema(self, mock_get):
        mock_get.return_value = _make_rest_response()
        result = fetch_user_github_metrics(_MOCK_USER, '30d')
        assert result['display_name'] == 'Test'
        assert result['user'] == 'testuser'
        assert result['period'] == '30d'
        for pr in result['pull_requests']:
            assert 'number' in pr
            assert 'title' in pr
            assert 'state' in pr
            assert 'repository' in pr

    @patch('leaderboard.github_metrics.GITHUB_TOKEN', 'fake-token')
    @patch('leaderboard.github_metrics._fetch_prs_graphql', side_effect=RuntimeError('GraphQL error'))
    @patch('leaderboard.github_metrics.requests.get')
    def test_falls_back_to_rest_on_graphql_error(self, mock_get, _mock_graphql):
        mock_get.return_value = _make_rest_response()
        result = fetch_user_github_metrics(_MOCK_USER, '30d')
        assert result['opened_prs'] == 2


class TestCollectGithubMetrics:
    @patch('leaderboard.github_metrics.GITHUB_TOKEN', None)
    @patch('leaderboard.github_metrics.requests.get')
    def test_returns_result_per_user(self, mock_get):
        mock_get.return_value = _make_rest_response()
        users = [_MOCK_USER, {**_MOCK_USER, 'display_name': 'Other', 'github_username': 'other'}]
        results = collect_github_metrics(users, '30d')
        assert len(results) == 2

    @patch('leaderboard.github_metrics.GITHUB_TOKEN', None)
    @patch('leaderboard.github_metrics.requests.get', side_effect=Exception('GitHub down'))
    def test_isolates_per_user_errors(self, _mock):
        users = [_MOCK_USER, {**_MOCK_USER, 'display_name': 'Other', 'github_username': 'other'}]
        results = collect_github_metrics(users, '30d')
        assert len(results) == 2
        assert all('error' in r for r in results)
        assert all(r['opened_prs'] == 0 for r in results)
