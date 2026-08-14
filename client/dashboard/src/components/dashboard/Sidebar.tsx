"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, HardDrive, Video, Key, Activity, Globe, Users, CreditCard, Settings, BookOpen, ListVideo, MonitorPlay, FileCode2 } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { useApi } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
export function Sidebar() {
  const pathname = usePathname();
  const api = useApi();

  const { data: subscription } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/v1/billing/subscription", {});
      if (error || !response.ok) return null;
      return data as any;
    },
  });

  const isPro = subscription?.plan === "pro";

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
    { name: "Buckets", href: "/dashboard/buckets", icon: HardDrive, match: (p: string) => p.startsWith("/dashboard/buckets") },
    { name: "Videos", href: "/dashboard/videos", icon: Video, match: (p: string) => p.startsWith("/dashboard/videos") },
    { name: "Media Convert", href: "/dashboard/media-convert", icon: FileCode2, match: (p: string) => p.startsWith("/dashboard/media-convert") },
  ];

  const infraItems = [
    { name: "Player Branding", href: "/dashboard/branding", icon: MonitorPlay, match: (p: string) => p.startsWith("/dashboard/branding") },
    { name: "API Keys", href: "/dashboard/keys", icon: Key, match: (p: string) => p.startsWith("/dashboard/keys") },
  ];

  const accountItems = [
    { name: "Usage", href: "/dashboard/usage", icon: Activity, match: (p: string) => p.startsWith("/dashboard/usage") },
    { name: "Billing", href: "/dashboard/billing", icon: CreditCard, match: (p: string) => p.startsWith("/dashboard/billing") },
    { name: "Team", href: "/dashboard/team", icon: Users, match: (p: string) => p.startsWith("/dashboard/team") },
    { name: "Activity Log", href: "/dashboard/activity", icon: Activity, match: (p: string) => p.startsWith("/dashboard/activity") },
  ];

  return (
    <div className="w-64 flex-shrink-0 border-r border-borderSubtle bg-base hidden md:flex flex-col h-screen sticky top-0">
      <div className="h-16 flex items-center px-6 border-b border-borderSubtle">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-accent-motion to-accent-mesh flex items-center justify-center">
            <div className="w-3 h-3 bg-base rounded-sm" />
          </div>
          <span className="font-display font-semibold tracking-tight text-lg">Motionmesh</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        <nav className="space-y-1 px-3">
          <div className="mb-6">
            <div className="px-3 mb-2 text-xs font-semibold text-text-muted uppercase tracking-wider">Core</div>
            {navItems.map((item) => {
              const isActive = item.match(pathname);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 mb-1 rounded-md transition-colors ${
                    isActive
                      ? "bg-surface-raised text-text-primary border-l-2 border-accent-motion"
                      : "text-text-muted hover:text-text-primary hover:bg-surface border-l-2 border-transparent"
                  }`}
                >
                  <item.icon className={`w-4 h-4 ${isActive ? 'text-accent-motion' : ''}`} />
                  <span className="font-medium text-sm">{item.name}</span>
                </Link>
              );
            })}
          </div>

          <div className="mb-6">
            <div className="px-3 mb-2 text-xs font-semibold text-text-muted uppercase tracking-wider">Infrastructure</div>
            {infraItems.map((item) => {
              const isActive = item.match(pathname);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 mb-1 rounded-md transition-colors ${
                    isActive
                      ? "bg-surface-raised text-text-primary border-l-2 border-accent-motion"
                      : "text-text-muted hover:text-text-primary hover:bg-surface border-l-2 border-transparent"
                  }`}
                >
                  <item.icon className={`w-4 h-4 ${isActive ? 'text-accent-motion' : ''}`} />
                  <span className="font-medium text-sm">{item.name}</span>
                </Link>
              );
            })}
          </div>

          <div className="mb-6">
            <div className="px-3 mb-2 text-xs font-semibold text-text-muted uppercase tracking-wider">Account</div>
            {accountItems.map((item) => {
              const isActive = item.match(pathname);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 mb-1 rounded-md transition-colors ${
                    isActive
                      ? "bg-surface-raised text-text-primary border-l-2 border-accent-motion"
                      : "text-text-muted hover:text-text-primary hover:bg-surface border-l-2 border-transparent"
                  }`}
                >
                  <item.icon className={`w-4 h-4 ${isActive ? 'text-accent-motion' : ''}`} />
                  <span className="font-medium text-sm">{item.name}</span>
                </Link>
              );
            })}
          </div>

          <div className="my-6 border-t border-borderSubtle" />

          <div className="mb-6 px-3">
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-2 mb-1 rounded-md transition-colors text-text-muted hover:text-text-primary hover:bg-surface border-l-2 border-transparent"
            >
              <BookOpen className="w-4 h-4" />
              <span className="font-medium text-sm">Docs</span>
            </a>
            <Link
              href="/dashboard/settings"
              className={`flex items-center gap-3 px-3 py-2 mb-1 rounded-md transition-colors ${
                pathname.startsWith("/dashboard/settings")
                  ? "bg-surface-raised text-text-primary border-l-2 border-accent-motion"
                  : "text-text-muted hover:text-text-primary hover:bg-surface border-l-2 border-transparent"
              }`}
            >
              <Settings className={`w-4 h-4 ${pathname.startsWith("/dashboard/settings") ? 'text-accent-motion' : ''}`} />
              <span className="font-medium text-sm">Settings</span>
            </Link>
          </div>
        </nav>
      </div>

      <div className="p-4 border-t border-borderSubtle flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserButton afterSignOutUrl="/" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text-primary truncate">My Account</span>
            <Badge variant={isPro ? "default" : "secondary"} className={`text-[9px] uppercase h-[18px] px-1.5 mt-0.5 w-fit rounded-sm ${isPro ? 'bg-accent-motion hover:bg-accent-motion/90 text-bg-base' : 'bg-surface-raised text-text-muted hover:bg-surface-raised/80'}`}>
              {isPro ? 'PRO' : 'FREE'}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
