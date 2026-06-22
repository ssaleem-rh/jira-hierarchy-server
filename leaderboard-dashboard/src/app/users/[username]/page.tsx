import { DashboardTemplate } from "@/components/templates/DashboardTemplate";
import { UserMetricsPanel } from "@/components/organisms/UserMetricsPanel";

export default async function UserPage(props: PageProps<"/users/[username]">) {
  const { username } = await props.params;
  const decoded = decodeURIComponent(username);

  return (
    <DashboardTemplate title={decoded}>
      <UserMetricsPanel username={decoded} />
    </DashboardTemplate>
  );
}
