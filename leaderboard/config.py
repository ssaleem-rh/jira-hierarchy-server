"""Leaderboard configuration — extends the existing jira_hierarchy config."""

import json
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from jira_hierarchy.config import JIRA_BASE_URL, get_jira_pat, get_jira_email  # noqa: F401

GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')
CACHE_TTL = int(os.getenv('LEADERBOARD_CACHE_TTL', '3600'))
LEADERBOARD_PORT = int(os.getenv('LEADERBOARD_PORT', '8001'))
LEADERBOARD_HOST = os.getenv('LEADERBOARD_HOST', '')

_USERS_FILE = os.path.join(_ROOT, 'users.json')


def load_users():
    """Return (users list, jira_projects list) from users.json."""
    with open(_USERS_FILE) as f:
        config = json.load(f)
    return config['users'], config.get('jira_projects', ['RHOAIENG'])
