"""HTTP API handler for the leaderboard (runs on port 8001)."""

import json
import logging
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from jira_hierarchy.config import get_jira_email, get_jira_pat
from leaderboard import cache
from leaderboard.aggregator import collect_all
from leaderboard.config import (
    CACHE_TTL, GITHUB_TOKEN, LEADERBOARD_HOST, LEADERBOARD_PORT, load_users,
)
from leaderboard.github_metrics import collect_github_metrics
from leaderboard.jira_metrics import collect_jira_metrics

log = logging.getLogger(__name__)

VALID_PERIODS = {'30d', '3m', '6m', '12m'}

# One Event per period — prevents duplicate concurrent fetches from hammering
# the API when multiple browser tabs/requests arrive simultaneously.
_fetch_events: dict[str, threading.Event] = {}
_fetch_events_lock = threading.Lock()


class LeaderboardHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        log.info('%s - ' + fmt, self.address_string(), *args)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _send_json(self, status, data):
        try:
            body = json.dumps(data, default=str).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)
        except BrokenPipeError:
            # Client disconnected (timed out waiting for a slow fetch).
            # Data was already cached before we tried to write, so the next
            # request will be a fast cache hit.
            log.debug('Client disconnected before response could be sent')

    def _error(self, status, message):
        try:
            self._send_json(status, {'error': message})
        except BrokenPipeError:
            pass

    # ------------------------------------------------------------------
    # Request routing
    # ------------------------------------------------------------------

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        path = parsed.path.rstrip('/')

        try:
            if path == '/health':
                self._send_json(200, {'status': 'ok'})

            elif path == '/api/users':
                users, _ = load_users()
                self._send_json(200, [
                    {
                        'display_name': u['display_name'],
                        'name': u['name'],
                        'github_username': u['github_username'],
                    }
                    for u in users
                ])

            elif path == '/api/leaderboard':
                period = qs.get('period', ['30d'])[0]
                if period not in VALID_PERIODS:
                    return self._error(400, f'period must be one of: {", ".join(sorted(VALID_PERIODS))}')
                self._handle_leaderboard(period)

            elif path.startswith('/api/users/'):
                username = path[len('/api/users/'):]
                period = qs.get('period', ['30d'])[0]
                if period not in VALID_PERIODS:
                    return self._error(400, f'period must be one of: {", ".join(sorted(VALID_PERIODS))}')
                self._handle_user(username, period)

            elif path == '/api/tickets':
                period = qs.get('period', ['30d'])[0]
                assignee = qs.get('assignee', [None])[0]
                self._handle_tickets(period, assignee)

            elif path == '/api/pull-requests':
                period = qs.get('period', ['30d'])[0]
                user = qs.get('user', [None])[0]
                self._handle_pull_requests(period, user)

            else:
                self._error(404, 'Not found')

        except BrokenPipeError:
            pass
        except Exception:
            log.exception('Unhandled error in GET %s', path)
            self._error(500, 'Internal server error')

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')

        try:
            if path == '/api/refresh':
                cache.invalidate_all()
                self._send_json(200, {'message': 'Cache cleared'})
            else:
                self._error(404, 'Not found')
        except Exception:
            log.exception('Unhandled error in POST %s', path)
            self._error(500, 'Internal server error')

    # ------------------------------------------------------------------
    # Endpoint implementations
    # ------------------------------------------------------------------

    def _load_leaderboard(self, period):
        """Return leaderboard data, using cache when fresh.

        If multiple requests arrive simultaneously for the same period (e.g.
        two browser tabs on first load), only one fetches — the others wait
        for the Event to be set, then read from cache.
        """
        cache_key = f'leaderboard_{period}'
        cached = cache.get(cache_key, CACHE_TTL)
        if cached:
            log.info('Cache hit for %s', cache_key)
            return cached

        with _fetch_events_lock:
            if cache_key in _fetch_events:
                event = _fetch_events[cache_key]
                is_leader = False
            else:
                event = threading.Event()
                _fetch_events[cache_key] = event
                is_leader = True

        if not is_leader:
            log.info('Waiting for in-flight fetch of %s...', cache_key)
            event.wait(timeout=300)
            return cache.get(cache_key, CACHE_TTL) or {}

        try:
            users, projects = load_users()
            email = get_jira_email()
            pat = get_jira_pat()

            def jira_fn(u, p):
                return collect_jira_metrics(u, p, projects, email, pat)

            def github_fn(u, p):
                return collect_github_metrics(u, p, GITHUB_TOKEN)

            data = collect_all(users, period, jira_fn, github_fn)
            cache.set(cache_key, data)
            return data
        finally:
            with _fetch_events_lock:
                _fetch_events.pop(cache_key, None)
            event.set()

    def _handle_leaderboard(self, period):
        data = self._load_leaderboard(period)
        self._send_json(200, {
            'period': data['period'],
            'generated_at': data['generated_at'],
            'users': data['users'],
        })

    def _handle_user(self, username, period):
        data = self._load_leaderboard(period)
        username_lower = username.lower()

        match = next(
            (u for u in data['users']
             if u['display_name'].lower() == username_lower
             or u['github_username'].lower() == username_lower),
            None,
        )
        if not match:
            return self._error(404, f'User {username!r} not found')

        raw_jira = next(
            (r for r in data['raw']['jira'] if r['display_name'] == match['display_name']),
            {},
        )
        raw_github = next(
            (r for r in data['raw']['github'] if r['display_name'] == match['display_name']),
            {},
        )
        self._send_json(200, {
            **match,
            'tickets': raw_jira.get('tickets', []),
            'pull_requests': raw_github.get('pull_requests', []),
        })

    def _handle_tickets(self, period, assignee):
        data = self._load_leaderboard(period)
        tickets = []
        for user_data in data['raw']['jira']:
            if assignee and user_data['display_name'].lower() != assignee.lower():
                continue
            for t in user_data.get('tickets', []):
                tickets.append({**t, 'assignee': user_data['display_name']})
        self._send_json(200, {'period': period, 'total': len(tickets), 'tickets': tickets})

    def _handle_pull_requests(self, period, user):
        data = self._load_leaderboard(period)
        prs = []
        for user_data in data['raw']['github']:
            if user and user_data['display_name'].lower() != user.lower():
                continue
            for pr in user_data.get('pull_requests', []):
                prs.append({**pr, 'author': user_data['display_name']})
        self._send_json(200, {'period': period, 'total': len(prs), 'pull_requests': prs})


def run_server():
    server = ThreadingHTTPServer((LEADERBOARD_HOST, LEADERBOARD_PORT), LeaderboardHandler)
    log.info('Leaderboard API listening on http://localhost:%d', LEADERBOARD_PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
