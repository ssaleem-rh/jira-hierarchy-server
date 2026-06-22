export const JIRA_BASE_URL = process.env.JIRA_URL ?? 'https://redhat.atlassian.net';
export const JIRA_PAT = process.env.JIRA_PAT ?? '';
export const JIRA_EMAIL = process.env.JIRA_EMAIL ?? '';
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
