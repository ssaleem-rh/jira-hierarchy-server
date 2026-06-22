import os
import sys
import pytest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from leaderboard.jira_metrics import (
    PERIOD_JQL,
    _build_ticket,
    _is_done,
    collect_jira_metrics,
    fetch_user_jira_metrics,
    resolve_account_id,
)

_DONE_ISSUE = {
    'key': 'RHOAIENG-1',
    'fields': {
        'summary': 'Implement feature',
        'status': {'name': 'Done', 'statusCategory': {'name': 'Done'}},
        'priority': {'name': 'High'},
        'customfield_10028': 5.0,
        'created': '2024-05-01T00:00:00.000Z',
        'resolutiondate': '2024-05-15T00:00:00.000Z',
        'issuetype': {'name': 'Story'},
    },
}
_ACTIVE_ISSUE = {
    'key': 'RHOAIENG-2',
    'fields': {
        'summary': 'Fix bug',
        'status': {'name': 'In Progress', 'statusCategory': {'name': 'In Progress'}},
        'priority': {'name': 'Medium'},
        'customfield_10028': None,
        'created': '2024-05-10T00:00:00.000Z',
        'resolutiondate': None,
        'issuetype': {'name': 'Bug'},
    },
}
_MOCK_USER = {
    'name': 'Test User',
    'display_name': 'Test',
    'jira_search_name': 'Test',
    'github_username': 'testuser',
    'jira_account_id': 'account123',
}


class TestPeriodJql:
    def test_all_periods_mapped(self):
        for p in ('30d', '3m', '6m', '12m'):
            assert p in PERIOD_JQL

    def test_values(self):
        assert PERIOD_JQL['30d'] == '-30d'
        assert PERIOD_JQL['3m'] == '-13w'
        assert PERIOD_JQL['6m'] == '-26w'
        assert PERIOD_JQL['12m'] == '-52w'


class TestIsDone:
    def test_done_category(self):
        assert _is_done(_DONE_ISSUE) is True

    def test_in_progress_category(self):
        assert _is_done(_ACTIVE_ISSUE) is False

    def test_missing_category_defaults_to_not_done(self):
        issue = {'key': 'X-1', 'fields': {'status': {}}}
        assert _is_done(issue) is False


class TestBuildTicket:
    def test_extracts_fields(self):
        t = _build_ticket(_DONE_ISSUE)
        assert t['key'] == 'RHOAIENG-1'
        assert t['summary'] == 'Implement feature'
        assert t['status'] == 'Done'
        assert t['story_points'] == 5.0
        assert t['issue_type'] == 'Story'

    def test_handles_missing_fields(self):
        t = _build_ticket({'key': 'X-1', 'fields': {}})
        assert t['summary'] == ''
        assert t['story_points'] is None


class TestResolveAccountId:
    def test_returns_first_match(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = [{'accountId': 'acc123', 'displayName': 'Test User'}]
        mock_resp.raise_for_status = MagicMock()

        with patch('leaderboard.jira_metrics.requests.get', return_value=mock_resp):
            result = resolve_account_id('Test', 'test@example.com', 'token')

        assert result == 'acc123'

    def test_raises_when_no_results(self):
        mock_resp = MagicMock()
        mock_resp.json.return_value = []
        mock_resp.raise_for_status = MagicMock()

        with patch('leaderboard.jira_metrics.requests.get', return_value=mock_resp):
            with pytest.raises(ValueError, match='No JIRA user found'):
                resolve_account_id('Unknown Person', 'test@example.com', 'token')


class TestFetchUserJiraMetrics:
    @patch('leaderboard.jira_metrics.run_jira_query', return_value=[_DONE_ISSUE, _ACTIVE_ISSUE])
    def test_counts_correctly(self, _mock):
        result = fetch_user_jira_metrics(_MOCK_USER, '30d', ['RHOAIENG'], 'e@e.com', 'pat')
        assert result['assigned'] == 2
        assert result['completed'] == 1
        assert result['active'] == 1

    @patch('leaderboard.jira_metrics.run_jira_query', return_value=[_DONE_ISSUE, _ACTIVE_ISSUE])
    def test_jql_contains_account_id_and_project(self, mock_query):
        fetch_user_jira_metrics(_MOCK_USER, '30d', ['RHOAIENG'], 'e@e.com', 'pat')
        jql = mock_query.call_args[0][0]
        assert 'account123' in jql
        assert 'RHOAIENG' in jql
        assert '-30d' in jql

    @patch('leaderboard.jira_metrics.run_jira_query', return_value=[])
    def test_skips_resolve_when_account_id_provided(self, _mock):
        with patch('leaderboard.jira_metrics.resolve_account_id') as mock_resolve:
            fetch_user_jira_metrics(_MOCK_USER, '30d', ['RHOAIENG'], 'e@e.com', 'pat')
            mock_resolve.assert_not_called()

    @patch('leaderboard.jira_metrics.run_jira_query', return_value=[])
    @patch('leaderboard.jira_metrics.resolve_account_id', return_value='resolved_id')
    def test_resolves_when_no_account_id(self, mock_resolve, _mock_query):
        user = {**_MOCK_USER, 'jira_account_id': None}
        result = fetch_user_jira_metrics(user, '30d', ['RHOAIENG'], 'e@e.com', 'pat')
        mock_resolve.assert_called_once()
        assert result['jira_account_id'] == 'resolved_id'

    @patch('leaderboard.jira_metrics.run_jira_query', return_value=[_DONE_ISSUE, _ACTIVE_ISSUE])
    def test_multiple_projects_in_jql(self, mock_query):
        fetch_user_jira_metrics(_MOCK_USER, '30d', ['RHOAIENG', 'RHAISTRAT'], 'e@e.com', 'pat')
        jql = mock_query.call_args[0][0]
        assert 'RHOAIENG' in jql
        assert 'RHAISTRAT' in jql


class TestCollectJiraMetrics:
    @patch('leaderboard.jira_metrics.run_jira_query', return_value=[_DONE_ISSUE])
    def test_returns_result_for_each_user(self, _mock):
        users = [_MOCK_USER, {**_MOCK_USER, 'display_name': 'Other', 'jira_account_id': 'other_id'}]
        results = collect_jira_metrics(users, '30d', ['RHOAIENG'], 'e@e.com', 'pat')
        assert len(results) == 2

    @patch('leaderboard.jira_metrics.run_jira_query', side_effect=[Exception('JIRA down'), [_DONE_ISSUE]])
    def test_isolates_per_user_errors(self, _mock):
        users = [_MOCK_USER, {**_MOCK_USER, 'display_name': 'Other', 'jira_account_id': 'other'}]
        results = collect_jira_metrics(users, '30d', ['RHOAIENG'], 'e@e.com', 'pat')
        assert 'error' in results[0]
        assert results[0]['assigned'] == 0
        assert 'error' not in results[1]
        assert results[1]['assigned'] == 1
