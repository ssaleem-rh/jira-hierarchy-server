"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, GitPullRequest, LayoutDashboard, Ticket, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Leaderboard", icon: LayoutDashboard },
  { href: "/tickets", label: "Tickets", icon: Ticket },
  { href: "/pull-requests", label: "Pull Requests", icon: GitPullRequest },
  { href: "/users", label: "Users", icon: Users },
];

export function NavigationSidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-sidebar px-3 py-4 shrink-0">
      <div className="mb-6 px-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-sidebar-primary" />
          <span className="text-sm font-semibold text-sidebar-foreground">Leaderboard</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">Engineering Metrics</p>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
