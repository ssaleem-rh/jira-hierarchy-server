import { DashboardTemplate } from "@/components/templates/DashboardTemplate";
import { UsersGrid } from "@/components/organisms/UsersGrid";

export default function UsersPage() {
  return (
    <DashboardTemplate
      title="Team Members"
      description="All configured team members on the leaderboard."
    >
      <UsersGrid />
    </DashboardTemplate>
  );
}
