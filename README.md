# Engineering Leaderboard

A Next.js dashboard showing engineering metrics from Jira and GitHub for the team.

## Architecture

Single Next.js application — no separate backend server, no Python.

```
leaderboard-dashboard/
├── src/
│   ├── app/
│   │   ├── api/              # Next.js API routes (replaces Python backend)
│   │   │   ├── leaderboard/  # GET /api/leaderboard?period=30d
│   │   │   ├── users/        # GET /api/users, GET /api/users/[username]
│   │   │   ├── tickets/      # GET /api/tickets?period=30d
│   │   │   ├── pull-requests/# GET /api/pull-requests?period=30d
│   │   │   ├── refresh/      # POST /api/refresh (clear cache)
│   │   │   └── health/       # GET /api/health
│   │   └── (pages)           # Leaderboard, users, tickets, PRs
│   └── lib/
│       ├── jira.ts           # Jira REST API client
│       ├── github.ts         # GitHub GraphQL/REST client
│       ├── aggregator.ts     # Metrics aggregation + ranking
│       ├── leaderboard.ts    # Orchestration + in-flight dedup
│       ├── cache.ts          # 24-hour file-based cache (data/)
│       ├── users.ts          # Loads users.json
│       └── config.ts         # Environment variables
├── data/                     # Cache files (auto-generated, gitignored)
└── users.json                # Team configuration
```

## Setup

### Prerequisites

- Node.js 18+
- Jira API credentials (PAT + email)
- GitHub token (optional, improves rate limits)

### Installation

```bash
cd leaderboard-dashboard
npm install
```

### Environment Variables

Create `leaderboard-dashboard/.env.local`:

```
JIRA_EMAIL=your-email@redhat.com
JIRA_PAT=your-jira-api-token
GITHUB_TOKEN=your-github-token
JIRA_URL=https://redhat.atlassian.net   # optional, this is the default
```

### Running

```bash
cd leaderboard-dashboard
npm run dev      # development
npm run build && npm start  # production
```

The app runs at http://localhost:3000.

## Configuration

Edit `leaderboard-dashboard/users.json` to add or remove team members:

```json
{
  "users": [
    {
      "name": "Full Name",
      "display_name": "DisplayName",
      "jira_search_name": "Full Name",
      "jira_account_id": "...",
      "github_username": "gh-handle"
    }
  ],
  "jira_projects": ["RHOAIENG"]
}
```

## Caching

Jira and GitHub data is cached for 24 hours in `leaderboard-dashboard/data/`. To force a refresh, click the refresh button in the UI or call `POST /api/refresh`.
