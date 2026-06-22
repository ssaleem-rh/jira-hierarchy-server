import { DashboardTemplate } from "@/components/templates/DashboardTemplate";
import { GitHubPRTable } from "@/components/organisms/GitHubPRTable";

export default function PullRequestsPage() {
  return (
    <DashboardTemplate
      title="Pull Requests"
      description="GitHub pull requests opened and merged by team members."
    >
      <GitHubPRTable />
    </DashboardTemplate>
  );
}
