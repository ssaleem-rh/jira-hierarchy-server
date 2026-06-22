import { DashboardTemplate } from "@/components/templates/DashboardTemplate";
import { JiraTicketsTable } from "@/components/organisms/JiraTicketsTable";

export default function TicketsPage() {
  return (
    <DashboardTemplate
      title="Ticket Explorer"
      description="Browse and filter Jira tickets across all team members."
    >
      <JiraTicketsTable />
    </DashboardTemplate>
  );
}
