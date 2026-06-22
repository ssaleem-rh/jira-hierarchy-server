import { loadUsers } from '@/lib/users';

export function GET() {
  const { users } = loadUsers();
  return Response.json(
    users.map((u) => ({
      display_name: u.display_name,
      name: u.name,
      github_username: u.github_username,
    })),
  );
}
