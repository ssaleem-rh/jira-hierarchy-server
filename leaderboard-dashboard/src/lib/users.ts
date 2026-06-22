import fs from 'fs';
import path from 'path';

export interface UserConfig {
  name: string;
  display_name: string;
  jira_search_name: string;
  jira_account_id: string | null;
  github_username: string | null;
}

interface UsersFile {
  users: UserConfig[];
  jira_projects: string[];
}

let _cached: UsersFile | null = null;

export function loadUsers(): UsersFile {
  if (_cached) return _cached;
  const filePath = path.join(process.cwd(), 'users.json');
  _cached = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UsersFile;
  return _cached;
}
