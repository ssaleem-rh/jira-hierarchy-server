import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from leaderboard.aggregator import _score, aggregate, collect_all

_JIRA = [
    {'display_name': 'Alice', 'user': 'alice@example.com', 'period': '30d',
     'assigned': 10, 'completed': 8, 'active': 2, 'tickets': []},
    {'display_name': 'Bob', 'user': 'bob@example.com', 'period': '30d',
     'assigned': 5, 'completed': 3, 'active': 2, 'tickets': []},
]
_GITHUB = [
    {'display_name': 'Alice', 'user': 'alice-gh', 'period': '30d',
     'opened_prs': 10, 'merged_prs': 8, 'open_prs': 2, 'pull_requests': []},
    {'display_name': 'Bob', 'user': 'bob-gh', 'period': '30d',
     'opened_prs': 5, 'merged_prs': 4, 'open_prs': 1, 'pull_requests': []},
]


class TestAggregate:
    def test_entry_count_matches_jira(self):
        result = aggregate(_JIRA, _GITHUB)
        assert len(result) == 2

    def test_ranks_assigned(self):
        result = aggregate(_JIRA, _GITHUB)
        ranks = sorted(r['rank'] for r in result)
        assert ranks == [1, 2]

    def test_rank_1_has_highest_score(self):
        result = aggregate(_JIRA, _GITHUB)
        top = next(r for r in result if r['rank'] == 1)
        # Alice: 8 + 8 = 16; Bob: 3 + 4 = 7
        assert top['display_name'] == 'Alice'

    def test_joins_metrics_by_display_name(self):
        result = aggregate(_JIRA, _GITHUB)
        alice = next(r for r in result if r['display_name'] == 'Alice')
        assert alice['jira_completed'] == 8
        assert alice['github_merged_prs'] == 8
        assert alice['jira_username'] == 'alice@example.com'
        assert alice['github_username'] == 'alice-gh'

    def test_zero_fills_missing_github(self):
        result = aggregate(_JIRA, [])
        for entry in result:
            assert entry['github_merged_prs'] == 0
            assert entry['github_open_prs'] == 0
            assert entry['github_opened_prs'] == 0

    def test_sorted_descending_by_score(self):
        result = aggregate(_JIRA, _GITHUB)
        scores = [_score(r) for r in result]
        assert scores == sorted(scores, reverse=True)

    def test_empty_inputs(self):
        assert aggregate([], []) == []

    def test_all_jira_fields_present(self):
        result = aggregate(_JIRA, _GITHUB)
        required = {'display_name', 'jira_username', 'github_username', 'period',
                    'jira_assigned', 'jira_completed', 'jira_active',
                    'github_opened_prs', 'github_merged_prs', 'github_open_prs', 'rank'}
        for entry in result:
            assert required.issubset(entry.keys())


class TestCollectAll:
    def test_calls_both_collectors(self):
        jira_calls, github_calls = [], []

        def jira_fn(users, period):
            jira_calls.append(period)
            return _JIRA

        def github_fn(users, period):
            github_calls.append(period)
            return _GITHUB

        result = collect_all([{}], '30d', jira_fn, github_fn)
        assert jira_calls == ['30d']
        assert github_calls == ['30d']
        assert result['period'] == '30d'
        assert 'generated_at' in result
        assert 'users' in result
        assert 'raw' in result

    def test_raw_data_preserved(self):
        result = collect_all([{}], '30d', lambda u, p: _JIRA, lambda u, p: _GITHUB)
        assert result['raw']['jira'] is _JIRA
        assert result['raw']['github'] is _GITHUB
