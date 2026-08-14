"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, HardDrive, Video, Key, Activity, Globe, Users, CreditCard, Settings, BookOpen } from "lucide-react";

export function MobileNav() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
    { name: "Buckets", href: "/dashboard/buckets", icon: HardDrive, match: (p: string) => p.startsWith("/dashboard/buckets") },
    { name: "Videos", href: "/dashboard/videos", icon: Video, match: (p: string) => p.startsWith("/dashboard/videos") },
    { name: "Keys", href: "/dashboard/keys", icon: Key, match: (p: string) => p.startsWith("/dashboard/keys") },
    { name: "Usage", href: "/dashboard/usage", icon: Activity, match: (p: string) => p.startsWith("/dashboard/usage") },
    { name: "Billing", href: "/dashboard/billing", icon: CreditCard, match: (p: string) => p.startsWith("/dashboard/billing") },
    { name: "Team", href: "/dashboard/team", icon: Users, match: (p: string) => p.startsWith("/dashboard/team") },
    { name: "Activity", href: "/dashboard/activity", icon: Activity, match: (p: string) => p.startsWith("/dashboard/activity") },
    { name: "Docs", href: "/docs", icon: BookOpen, match: (p: string) => p.startsWith("/docs") },
    { name: "Settings", href: "/dashboard/settings", icon: Settings, match: (p: string) => p.startsWith("/dashboard/settings") },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-borderSubtle bg-base pb-safe z-50">
      <nav className="flex items-center overflow-x-auto hide-scrollbar h-16 px-2 gap-4">
        {navItems.map((item) => {
          const isActive = item.match(pathname);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex-shrink-0 flex flex-col items-center justify-center w-16 h-full space-y-1 transition-colors ${
                isActive 
                  ? "text-accent-motion" 
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'fill-accent-motion/20' : ''}`} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
