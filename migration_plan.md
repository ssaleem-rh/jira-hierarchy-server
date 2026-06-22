# Migration & Implementation Plan

## Overview

This document defines the step-by-step implementation plan for the leaderboard system. The existing JIRA hierarchy viewer is **not modified** — the leaderboard is built alongside it as a parallel service.

---

## Phase 0: Foundation (No Code Changes)

### 0.1 Environment Setup
**Required actions before any code:**

1. Obtain GitHub Personal Access Token
   - Scope: `read:user`, `repo` (or `public_repo` for public repos only)
   - Add to `.env.local`: `GITHUB_TOKEN=ghp_...`

2. Identify JIRA account IDs for each team member
   - Method: `GET https://redhat.atlassian.net/rest/api/3/user/search?query={email}`
   - Need: account ID string (not email) for JQL queries

3. Create `users.json` with team mapping
   ```json
   {
     "users": [
       {
         "name": "Full Name",
         "display_name": "Short Name",
         "jira_account_id": "...",
         "jira_username": "name@redhat.com",
         "github_username": "githubhandle"
       }
     ]
   }
   ```

4. Verify GitHub orgs/repos to query
   - Determine if PRs are across all orgs or specific repos
   - Confirm token has access to relevant repos

### 0.2 Dependency Check
No new Python dependencies required:
- `requests` already in venv (used by existing app)
- All other needs covered by stdlib

For Next.js (Node.js 18+ required):
```bash
node --version  # should be 18+
npm --version
```

---

## Phase 1: Jira Metrics Service

**File:** `leaderboard/jira_metrics.py`

**Complexity:** Medium

**Depends on:** `jira_hierarchy/jira_client.py` (existing), `users.json`

### Task Breakdown

| Task | Complexity | Notes |
|------|-----------|-------|
| Period → JQL mapping function | Low | `30d → -30d`, `3m → -13w`, etc. |
| `fetch_user_assigned(account_id, period)` | Low | JQL: `assignee = {id} AND project = RHOAIENG AND created >= -{period}` |
| `fetch_user_completed(account_id, period)` | Low | Add `AND status = Done` |
| `fetch_user_active(account_id, period)` | Low | Add `AND status != Done` |
| `fetch_user_tickets(account_id, period)` | Medium | Full ticket details with story points |
| `collect_jira_metrics(users, period)` | Medium | Orchestrate per user, return list |
| Retry logic | Low | Wrap with exponential backoff |
| Error handling | Low | Per-user errors should not abort others |
| Unit tests | Medium | Mock `run_jira_query`, test JQL construction |

### JQL Templates
```python
ASSIGNED = 'assignee = "{account_id}" AND project IN (RHOAIENG) AND created >= {window}'
COMPLETED = ASSIGNED + ' AND status = Done'
ACTIVE    = ASSIGNED + ' AND status NOT IN (Done, Closed, Cancelled)'
```

### Output Schema
```python
{
    "user": "john.doe@redhat.com",
    "display_name": "John",
    "period": "30d",
    "assigned": 45,
    "completed": 30,
    "active": 15,
    "tickets": [ { "key": ..., "summary": ..., "status": ..., "story_points": ... } ]
}
```

---

## Phase 2: GitHub Metrics Service

**File:** `leaderboard/github_metrics.py`

**Complexity:** Medium-High

**Depends on:** `GITHUB_TOKEN` env var, `users.json`

### Task Breakdown

| Task | Complexity | Notes |
|------|-----------|-------|
| GitHub GraphQL client | Medium | POST to `https://api.github.com/graphql` |
| Period → date conversion | Low | `datetime.now() - timedelta(days=30)` |
| GraphQL query for PRs authored | Medium | `search(query: "author:X is:pr created:>=DATE")` |
| Pagination handling | Medium | Cursor-based, 100 items/page max |
| Rate limit handling | Medium | Check `X-RateLimit-Remaining` header; sleep if < 100 |
| `fetch_user_prs(github_username, period)` | Medium | Returns all PRs for user |
| `collect_github_metrics(users, period)` | Medium | Orchestrate per user |
| Fallback to REST API | Medium | If GraphQL unavailable |
| Unit tests | Medium | Mock HTTP responses |

### GraphQL Query
```graphql
query($query: String!, $cursor: String) {
  search(query: $query, type: ISSUE, first: 100, after: $cursor) {
    pageInfo { hasNextPage, endCursor }
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
```

**Search query string:** `author:{username} is:pr created:>={date}`

### Output Schema
```python
{
    "user": "johndoe",
    "display_name": "John",
    "period": "30d",
    "opened_prs": 24,
    "merged_prs": 19,
    "open_prs": 5,
    "pull_requests": [ { "number": ..., "title": ..., "state": ..., "repository": ... } ]
}
```

---

## Phase 3: Aggregation Layer

**File:** `leaderboard/aggregator.py`

**Complexity:** Low

**Depends on:** `jira_metrics.py`, `github_metrics.py`, `users.json`

### Task Breakdown

| Task | Complexity | Notes |
|------|-----------|-------|
| `aggregate(jira_data, github_data, users)` | Low | Join by display_name, fill nulls |
| Rank assignment | Low | Sort by `jira_completed + github_merged_prs` desc |
| Missing data handling | Low | User in Jira but not GitHub → 0 for GitHub fields |
| `collect_all(period)` | Medium | Call both services, aggregate, return |
| Unit tests | Low | Test join logic and ranking |

### Output Schema
```python
{
    "period": "30d",
    "generated_at": "2024-06-18T10:00:00Z",
    "users": [
        {
            "rank": 1,
            "name": "John",
            "jira_username": "john.doe@redhat.com",
            "github_username": "johndoe",
            "jira_assigned": 45,
            "jira_completed": 30,
            "jira_active": 15,
            "github_open_prs": 5,
            "github_merged_prs": 19,
            "github_opened_prs": 24
        }
    ]
}
```

---

## Phase 4: Cache Layer

**File:** `leaderboard/cache.py`

**Complexity:** Low

### Task Breakdown

| Task | Complexity | Notes |
|------|-----------|-------|
| `get(key, ttl_seconds)` | Low | Read JSON from `data/{key}.json`, check mtime |
| `set(key, data)` | Low | Write JSON to `data/{key}.json` with timestamp |
| `invalidate(key)` | Low | Delete file |
| `invalidate_all()` | Low | Delete all files in `data/` |
| Cache key design | Low | `leaderboard_30d`, `user_johndoe_30d`, etc. |

---

## Phase 5: API Server

**File:** `leaderboard/api.py`, `leaderboard-server.py`

**Complexity:** Medium

**Depends on:** All previous phases

### Task Breakdown

| Task | Complexity | Notes |
|------|-----------|-------|
| HTTP server setup (port 8001) | Low | Same pattern as existing `server.py` |
| `GET /api/leaderboard` | Low | Check cache, collect if miss, return JSON |
| `GET /api/users` | Low | Return users.json contents |
| `GET /api/users/{username}` | Medium | Jira + GitHub detail for one user |
| `GET /api/tickets` | Medium | Filter by period + optional assignee |
| `GET /api/pull-requests` | Medium | Filter by period + optional user |
| `POST /api/refresh` | Low | Invalidate cache, trigger recollection |
| `GET /health` | Low | Return `{"status": "ok"}` |
| CORS headers | Low | Allow Next.js on 3000 to call 8001 |
| Period query param validation | Low | Reject unknown periods |
| Unit tests | Medium | Mock aggregator, test routing |

---

## Phase 6: Next.js Dashboard

**Directory:** `leaderboard-dashboard/`

**Complexity:** High

**Depends on:** Phase 5 API

### 6.1 Project Scaffold

```bash
npx create-next-app@latest leaderboard-dashboard \
  --typescript --tailwind --eslint --app --src-dir --no-turbopack
cd leaderboard-dashboard
npx shadcn@latest init
npm install @tanstack/react-query recharts
```

### 6.2 Configuration

**`next.config.ts`** — API proxy:
```typescript
rewrites: async () => [{
  source: '/api/:path*',
  destination: 'http://localhost:8001/api/:path*'
}]
```

**`tailwind.config.ts`** — dark mode:
```typescript
darkMode: 'class',
// defaultTheme: 'dark' via root class
```

### 6.3 Component Build Order

Build bottom-up (atoms → molecules → organisms → templates → pages):

**Atoms (Week 1)**
| Component | Props | Notes |
|-----------|-------|-------|
| `Badge` | `variant`, `children` | Status badge (Done, Active, etc.) |
| `Avatar` | `name`, `src?` | Initials fallback |
| `Button` | `variant`, `size`, `onClick` | shadcn/ui Button wrapper |
| `Spinner` | `size` | Loading indicator |
| `TableCell` | `children`, `align?` | Consistent padding |

**Molecules (Week 1)**
| Component | Props | Notes |
|-----------|-------|-------|
| `SearchBar` | `value`, `onChange`, `placeholder` | Debounced |
| `MetricCard` | `label`, `value`, `delta?` | KPI display |
| `PeriodSelector` | `value`, `onChange` | 30d/3m/6m/12m tabs |
| `SortableHeader` | `label`, `sortKey`, `currentSort`, `onSort` | Table column header |
| `FilterDropdown` | `options`, `value`, `onChange` | Generic filter |

**Organisms (Week 2)**
| Component | Notes |
|-----------|-------|
| `LeaderboardTable` | Sortable, searchable, paginated |
| `JiraTicketsTable` | With status/assignee filters |
| `GitHubPRTable` | With state filter |
| `UserMetricsPanel` | Metric cards + recent activity |
| `NavigationSidebar` | Route links, dark mode toggle |
| `DashboardHeader` | Title, period selector, refresh button |

**Pages (Week 3)**
| Route | Page | Key Features |
|-------|------|-------------|
| `/` | Leaderboard | Sortable table, search, period filter, rank |
| `/tickets` | Ticket Explorer | Search, status/assignee filter, pagination |
| `/pull-requests` | PR Explorer | Search, state filter, pagination |
| `/users` | Users list | Cards with summary metrics |
| `/users/[username]` | User Detail | Full metrics, charts, history |

### 6.4 TanStack Query Hooks

```typescript
// hooks/useLeaderboard.ts
export const useLeaderboard = (period: Period) =>
  useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => api.getLeaderboard(period),
    staleTime: 1000 * 60 * 5,  // 5 min
  })

// hooks/useUser.ts
export const useUser = (username: string, period: Period) =>
  useQuery({
    queryKey: ['user', username, period],
    queryFn: () => api.getUser(username, period),
  })
```

### 6.5 Recharts Integration

User detail page — completion trend:
```typescript
<AreaChart data={weeklyData}>
  <Area dataKey="completed" stroke="#6366f1" fill="#6366f1" fillOpacity={0.1} />
  <Area dataKey="opened_prs" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.1} />
</AreaChart>
```

---

## Task Breakdown with Estimates

| Phase | Task | Complexity | Est. Hours | Dependencies |
|-------|------|-----------|------------|--------------|
| 0 | users.json + credentials | Low | 1h | Team input for account IDs |
| 1 | jira_metrics.py | Medium | 4h | Phase 0 |
| 1 | jira tests | Medium | 2h | Phase 1 |
| 2 | github_metrics.py | Medium-High | 6h | Phase 0, GitHub token |
| 2 | github tests | Medium | 2h | Phase 2 |
| 3 | aggregator.py | Low | 2h | Phases 1-2 |
| 3 | aggregator tests | Low | 1h | Phase 3 |
| 4 | cache.py | Low | 1h | — |
| 5 | api.py + leaderboard-server.py | Medium | 4h | Phases 3-4 |
| 5 | api tests | Medium | 2h | Phase 5 |
| 6 | Next.js scaffold + config | Low | 2h | Node.js 18+ |
| 6 | Atoms + Molecules | Medium | 4h | Phase 6 scaffold |
| 6 | Organisms | Medium | 6h | Atoms + Molecules |
| 6 | Pages + TanStack Query | High | 8h | Organisms + Phase 5 |
| 6 | Recharts charts | Medium | 4h | User detail API |
| — | **Total** | — | **~49h** | — |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| JIRA account IDs unknown | High | High | Use search API to look up by email |
| GitHub token missing org access | Medium | High | Confirm repos list before coding |
| GitHub rate limit hit during dev | Medium | Medium | Cache responses in tests; use fixtures |
| JIRA custom field IDs differ | Low | High | Validate with a test query early |
| PR data across many orgs | Medium | Medium | Confirm org list with team |

---

## What Is NOT Changing

The following are explicitly out of scope for this implementation:

- `jira_hierarchy/` — unchanged
- `static/jira-hierarchy-viewer.html` — unchanged
- `jira-hierarchy-server.py` — unchanged
- `start.sh` — unchanged

The leaderboard runs as a **completely separate service** on port 8001.
