# Leaderboard Architecture

## Executive Summary

The existing repository is a **JIRA Hierarchy Viewer** — a stateless Python HTTP server that streams a multi-level JIRA issue tree (Outcomes → RFEs → STRATs → Epics → Tasks) to a single-page vanilla JS frontend. It has no GitHub integration, no database, and no user metrics.

The leaderboard system will be built **alongside** the existing app, not replacing it, sharing JIRA client code and running as a separate backend service with a modern Next.js frontend.

---

## Existing System Overview

```
┌─────────────────────────────────────────────────────┐
│              EXISTING: jira-hierarchy-server         │
│                                                     │
│  jira-hierarchy-server.py  (entry point)            │
│  jira_hierarchy/                                    │
│    config.py       — env var management             │
│    jira_client.py  — JIRA REST API wrapper (476L)   │
│    data_fetcher.py — hierarchy builder (456L)       │
│    sse.py          — Server-Sent Events (583L)      │
│    server.py       — HTTP handler (1201L)           │
│  static/                                            │
│    jira-hierarchy-viewer.html  — UI (6929L)         │
│                                                     │
│  Port: 8000  |  No DB  |  No tests  |  Stateless    │
└─────────────────────────────────────────────────────┘
```

**JIRA Projects in use:**
| Project | Issue Types |
|---------|------------|
| RHOAIENG | Epic, Story, Task, Bug, Spike |
| RHAISTRAT | Outcome, STRAT, Initiative |
| RHAIRFE | Feature Request (RFE) |

**Custom fields:**
| ID | Name | Purpose |
|----|------|---------|
| customfield_10001 | Team | Team assignment |
| customfield_10014 | Epic Link | Epic parent (tasks) |
| customfield_10020 | Sprint | Sprint assignment |
| customfield_10028 | Story Points | Estimation |
| customfield_10875 | Git Pull Request | PR URL (ADF format) |

---

## Target System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                              │
│                                                                  │
│   redhat.atlassian.net (JIRA Cloud)    api.github.com           │
│   REST API v3                          GraphQL API v4            │
└────────────────┬───────────────────────────────┬────────────────┘
                 │                               │
┌────────────────▼───────────────────────────────▼────────────────┐
│                    LEADERBOARD BACKEND (Python)                  │
│                    Port 8001                                     │
│                                                                  │
│   leaderboard/                                                   │
│   ├── jira_metrics.py    — Jira per-user metrics collection      │
│   ├── github_metrics.py  — GitHub PR metrics collection          │
│   ├── aggregator.py      — Combine + normalize metrics           │
│   ├── cache.py           — JSON file cache (TTL: 1 hour)         │
│   ├── api.py             — HTTP endpoints                        │
│   └── config.py          — User mapping + env config             │
│                                                                  │
│   Reuses: jira_hierarchy/jira_client.py                          │
└────────────────────────────────┬────────────────────────────────┘
                                 │  REST JSON API
┌────────────────────────────────▼────────────────────────────────┐
│                    NEXT.JS DASHBOARD                             │
│                    Port 3000                                     │
│                                                                  │
│   leaderboard-dashboard/                                         │
│   ├── src/app/            — Next.js App Router pages             │
│   ├── src/components/     — Atomic Design components             │
│   ├── src/hooks/          — TanStack Query data hooks            │
│   ├── src/services/       — API client functions                 │
│   ├── src/types/          — TypeScript interfaces                │
│   └── src/lib/            — Utilities                            │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│              EXISTING: JIRA HIERARCHY VIEWER (unchanged)         │
│              Port 8000                                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Folder Structure

```
jira-hierarchy-server/
├── jira_hierarchy/                  # EXISTING — unchanged
│   ├── __init__.py
│   ├── config.py
│   ├── jira_client.py               # REUSED by leaderboard
│   ├── data_fetcher.py
│   ├── sse.py
│   ├── server.py
│   └── version_check.py
├── static/                          # EXISTING — unchanged
│   └── jira-hierarchy-viewer.html
│
├── leaderboard/                     # NEW — Python backend
│   ├── __init__.py
│   ├── config.py                    # User mapping, env config
│   ├── jira_metrics.py              # Agent 2: Jira collection
│   ├── github_metrics.py            # Agent 3: GitHub collection
│   ├── aggregator.py                # Agent 4: Aggregation
│   ├── cache.py                     # JSON file cache
│   ├── api.py                       # Agent 5: HTTP endpoints
│   └── tests/
│       ├── __init__.py
│       ├── test_jira_metrics.py
│       ├── test_github_metrics.py
│       ├── test_aggregator.py
│       └── fixtures/
│           ├── jira_response.json
│           └── github_response.json
│
├── leaderboard-dashboard/           # NEW — Next.js frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx             # → /leaderboard
│   │   │   ├── tickets/
│   │   │   │   └── page.tsx         # → /tickets
│   │   │   ├── pull-requests/
│   │   │   │   └── page.tsx         # → /pull-requests
│   │   │   └── users/
│   │   │       ├── page.tsx         # → /users
│   │   │       └── [username]/
│   │   │           └── page.tsx     # → /users/:username
│   │   ├── components/
│   │   │   ├── atoms/
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Avatar.tsx
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Spinner.tsx
│   │   │   │   ├── Label.tsx
│   │   │   │   └── TableCell.tsx
│   │   │   ├── molecules/
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   ├── MetricCard.tsx
│   │   │   │   ├── UserCard.tsx
│   │   │   │   ├── FilterDropdown.tsx
│   │   │   │   ├── PeriodSelector.tsx
│   │   │   │   └── SortableHeader.tsx
│   │   │   ├── organisms/
│   │   │   │   ├── LeaderboardTable.tsx
│   │   │   │   ├── UserMetricsPanel.tsx
│   │   │   │   ├── JiraTicketsTable.tsx
│   │   │   │   ├── GitHubPRTable.tsx
│   │   │   │   ├── NavigationSidebar.tsx
│   │   │   │   └── DashboardHeader.tsx
│   │   │   ├── templates/
│   │   │   │   ├── DashboardTemplate.tsx
│   │   │   │   ├── UserDetailTemplate.tsx
│   │   │   │   └── TableTemplate.tsx
│   │   │   └── pages/
│   │   │       ├── LeaderboardPage.tsx
│   │   │       ├── UserPage.tsx
│   │   │       ├── TicketsPage.tsx
│   │   │       └── PullRequestsPage.tsx
│   │   ├── hooks/
│   │   │   ├── useLeaderboard.ts
│   │   │   ├── useUser.ts
│   │   │   ├── useTickets.ts
│   │   │   └── usePullRequests.ts
│   │   ├── services/
│   │   │   └── api.ts               # API client (fetch wrappers)
│   │   ├── types/
│   │   │   ├── leaderboard.ts
│   │   │   ├── user.ts
│   │   │   ├── ticket.ts
│   │   │   └── pullRequest.ts
│   │   ├── lib/
│   │   │   ├── utils.ts
│   │   │   └── formatters.ts
│   │   └── constants/
│   │       ├── periods.ts
│   │       └── routes.ts
│   ├── next.config.ts               # API proxy → port 8001
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── data/                            # NEW — JSON cache store
│   └── .gitkeep
│
├── users.json                       # NEW — user mapping config
├── leaderboard-server.py            # NEW — leaderboard entry point
├── jira-hierarchy-server.py         # EXISTING — unchanged
├── start.sh                         # EXISTING — unchanged
└── .env.local                       # EXISTING — add GITHUB_TOKEN
```

---

## Data Models

### User Mapping (`users.json`)
```json
{
  "users": [
    {
      "name": "John Doe",
      "display_name": "John",
      "jira_account_id": "5f3e1a2b3c4d5e6f7a8b9c0d",
      "jira_username": "john.doe@redhat.com",
      "github_username": "johndoe"
    }
  ]
}
```

### Jira Metrics Schema
```json
{
  "user": "john.doe@redhat.com",
  "display_name": "John",
  "period": "30d",
  "assigned": 45,
  "completed": 30,
  "active": 15,
  "tickets": [
    {
      "key": "RHOAIENG-1234",
      "summary": "Implement feature X",
      "status": "Done",
      "story_points": 5,
      "created": "2024-05-01T00:00:00Z",
      "completed": "2024-05-15T00:00:00Z"
    }
  ]
}
```

### GitHub Metrics Schema
```json
{
  "user": "johndoe",
  "display_name": "John",
  "period": "30d",
  "opened_prs": 24,
  "merged_prs": 19,
  "open_prs": 5,
  "pull_requests": [
    {
      "number": 123,
      "title": "Add feature X",
      "url": "https://github.com/org/repo/pull/123",
      "state": "MERGED",
      "created_at": "2024-05-01T00:00:00Z",
      "merged_at": "2024-05-10T00:00:00Z",
      "repository": "org/repo"
    }
  ]
}
```

### Aggregated Leaderboard Entry Schema
```json
{
  "rank": 1,
  "name": "John",
  "jira_username": "john.doe@redhat.com",
  "github_username": "johndoe",
  "period": "30d",
  "jira_assigned": 45,
  "jira_completed": 30,
  "jira_active": 15,
  "github_open_prs": 5,
  "github_merged_prs": 19,
  "github_opened_prs": 24
}
```

---

## API Endpoints (Port 8001)

| Method | Endpoint | Description | Query Params |
|--------|----------|-------------|--------------|
| GET | `/api/leaderboard` | Aggregated leaderboard | `?period=30d` |
| GET | `/api/users` | All configured users | — |
| GET | `/api/users/{username}` | Single user full detail | `?period=30d` |
| GET | `/api/tickets` | All Jira tickets | `?period=30d&assignee=john` |
| GET | `/api/pull-requests` | All GitHub PRs | `?period=30d&user=johndoe` |
| POST | `/api/refresh` | Force cache invalidation | `?period=30d` |
| GET | `/health` | Health check | — |

**Period values:** `30d`, `3m`, `6m`, `12m`

**Period → JQL mapping:**
```
30d  → created >= -30d
3m   → created >= -13w
6m   → created >= -26w
12m  → created >= -52w
```

---

## Credentials & Permissions Required

| Credential | Env Var | Purpose | Scope |
|------------|---------|---------|-------|
| JIRA PAT | `JIRA_PAT` | Existing — read issue data | Read RHOAIENG, RHAISTRAT, RHAIRFE |
| JIRA Email | `JIRA_EMAIL` | Existing — Basic Auth | — |
| GitHub Token | `GITHUB_TOKEN` | New — PR metrics | `repo:read` or `public_repo` |

GitHub token needs:
- `read:user` — for user info
- `repo` (private repos) OR `public_repo` (public only) — for PR access

---

## Caching Strategy

- **Store:** `data/{period}/{timestamp}.json` per endpoint
- **TTL:** 1 hour for leaderboard/aggregated data
- **Invalidation:** Manual POST `/api/refresh`, or TTL expiry
- **No database required** for Milestone 1
- Future: Replace with Redis or SQLite if sub-second refresh is needed

---

## Known API Limitations

### JIRA
- JQL `assignee` requires `accountId` (not username) for JIRA Cloud
- No official rate limit documented, but burst requests may 429
- Custom field IDs (e.g., `customfield_10028`) are tenant-specific — verify against target instance
- Max 100 results per page; existing `run_jira_query()` handles this

### GitHub
- GraphQL API: 5,000 points/hour per token
- REST API: 5,000 requests/hour authenticated
- PR search limited to repos the token can access
- `author:username` in GraphQL search covers all orgs the user belongs to
- Secondary rate limits apply on rapid sequential requests — need 1s delay between pages

---

## Technology Decisions

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | Python 3 + stdlib http.server | Consistent with existing; no new deps |
| JIRA client | Existing jira_client.py | Already tested in production |
| GitHub client | requests + GitHub GraphQL API v4 | Efficient: single query for all PR data |
| Cache | JSON files | Zero-dependency, inspectable, sufficient for Milestone 1 |
| Frontend | Next.js 15 + TypeScript | Requested; enables SSR, routing, API proxying |
| Styling | Tailwind CSS | Requested; design-system-friendly |
| Data fetching | TanStack Query | Requested; handles caching, loading, error states |
| Charts | Recharts | Requested; React-native, composable |
| Components | shadcn/ui | Requested; accessible, Tailwind-compatible |
| Component architecture | Atomic Design | Requested |

---

## Milestone Breakdown

### Milestone 1: Data Collection (current)
- [ ] User mapping config (`users.json`)
- [ ] Jira metrics service (`jira_metrics.py`)
- [ ] GitHub metrics service (`github_metrics.py`)
- [ ] Aggregation layer (`aggregator.py`)
- [ ] File cache (`cache.py`)
- [ ] API server (`api.py`, `leaderboard-server.py`)
- [ ] Unit tests for all services

### Milestone 2: Dashboard
- [ ] Next.js project scaffold
- [ ] shadcn/ui + Tailwind dark mode setup
- [ ] Leaderboard page with sortable table
- [ ] Ticket explorer page
- [ ] User detail page with charts
- [ ] All TanStack Query hooks
- [ ] Responsive layout

### Milestone 3: Polish (future)
- [ ] Real-time refresh with SSE or WebSocket
- [ ] Database backend (SQLite or PostgreSQL)
- [ ] Historical trend charts
- [ ] Slack notifications
- [ ] CI/CD integration
