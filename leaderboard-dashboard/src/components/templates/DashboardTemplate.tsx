import { NavigationSidebar } from "@/components/organisms/NavigationSidebar";

interface DashboardTemplateProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function DashboardTemplate({ title, description, children }: DashboardTemplateProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <NavigationSidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
