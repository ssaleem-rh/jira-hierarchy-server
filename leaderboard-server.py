#!/usr/bin/env python3
"""Entry point for the leaderboard backend API (port 8001)."""

import logging
import os
import sys

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s  %(name)s: %(message)s',
    datefmt='%H:%M:%S',
)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from jira_hierarchy.config import get_jira_email, get_jira_pat


def _check_env():
    missing = []
    if not get_jira_pat():
        missing.append('JIRA_PAT')
    if not get_jira_email():
        missing.append('JIRA_EMAIL')
    if missing:
        print(f'\n  Missing required environment variables: {", ".join(missing)}')
        print('  Set them or source your .env.local:\n')
        print('    source .env.local\n')
        sys.exit(1)


if __name__ == '__main__':
    _check_env()

    from leaderboard.api import run_server
    from leaderboard.config import LEADERBOARD_PORT

    print()
    print('  ========================================')
    print('   Engineering Leaderboard API')
    print(f'   http://localhost:{LEADERBOARD_PORT}')
    print('  ========================================')
    print()
    run_server()
