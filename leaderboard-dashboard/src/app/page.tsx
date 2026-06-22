import { DashboardTemplate } from "@/components/templates/DashboardTemplate";
import { LeaderboardTable } from "@/components/organisms/LeaderboardTable";

export default function LeaderboardPage() {
  return (
    <DashboardTemplate
      title="Leaderboard"
      description="Engineering metrics ranked by completed Jira tickets and merged pull requests."
    >
      <LeaderboardTable />
    </DashboardTemplate>
  );
}
