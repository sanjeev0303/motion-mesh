"use client";

import { useEffect, useState } from "react";
import { useCommandPalette } from "@/lib/store";
import { useRouter } from "next/navigation";
import { Search, HardDrive, Video, Key } from "lucide-react";

export function CommandPalette() {
  const { isOpen, setOpen, toggle } = useCommandPalette();
  const [search, setSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [toggle]);

  if (!isOpen) return null;

  // Mock results for now
  const results = [
    { id: "1", type: "bucket", name: "production-assets", icon: HardDrive, href: "/dashboard/buckets/bck_1" },
    { id: "2", type: "video", name: "hero-bg.mp4", icon: Video, href: "/videos/vid_1" },
    { id: "3", type: "key", name: "readonly-key", icon: Key, href: "/keys" },
  ].filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div 
        className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="fixed inset-x-0 top-[20%] z-50 mx-auto max-w-xl bg-surface border border-borderSubtle rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center px-4 border-b border-borderSubtle">
          <Search className="w-5 h-5 text-text-muted mr-3" />
          <input
            autoFocus
            className="flex-1 h-14 bg-transparent outline-none placeholder:text-text-muted text-text-primary"
            placeholder="Search buckets, videos, or commands..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] font-medium text-text-muted bg-surface-raised px-1.5 py-0.5 rounded border border-borderSubtle">
            ESC
          </kbd>
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length > 0 ? (
            <div className="space-y-1">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => {
                    router.push(result.href);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-surface-raised text-left transition-colors group"
                >
                  <div className="w-8 h-8 rounded bg-base flex items-center justify-center border border-borderSubtle group-hover:border-accent-mesh transition-colors">
                    <result.icon className="w-4 h-4 text-text-muted group-hover:text-accent-mesh" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{result.name}</p>
                    <p className="text-xs text-text-muted capitalize">{result.type}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-14 text-center text-sm text-text-muted">
              No results found for "{search}".
            </div>
          )}
        </div>
      </div>
    </>
  );
}
