"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Changelog entries are static release notes — no backend API exists.
// These are maintained here as source-of-truth and updated alongside deployments.
const CHANGELOG_ENTRIES = [
  {
    id: "chg_1",
    date: "2024-05-15",
    version: "v1.2.0",
    title: "Added 4K Transcoding Support",
    description:
      "You can now select 4K as a target rendition in your transcoding profiles.",
    type: "feature" as const,
  },
  {
    id: "chg_2",
    date: "2024-05-10",
    version: "v1.1.5",
    title: "Improved Upload Resiliency",
    description:
      "Multi-part uploads now automatically retry failed chunks with exponential backoff.",
    type: "improvement" as const,
  },
  {
    id: "chg_3",
    date: "2024-04-28",
    version: "v1.1.0",
    title: "Player Branding",
    description:
      "Introduced custom watermark/branding options, and per-video player configuration.",
    type: "feature" as const,
  },
];

const typeStyles: Record<string, string> = {
  feature: "bg-success/10 text-success",
  improvement: "bg-accent-mesh/10 text-accent-mesh",
  fix: "bg-warning/10 text-warning",
};

export default function ChangelogPage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-semibold">Changelog</h1>
        <p className="text-text-muted">Latest updates and improvements to Motionmesh.</p>
      </div>

      <div className="space-y-6">
        {CHANGELOG_ENTRIES.map((log) => (
          <Card key={log.id}>
            <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-borderSubtle">
              <div className="flex items-center gap-3">
                <span className="bg-accent-motion/10 text-accent-motion px-2 py-1 rounded text-xs font-mono font-bold">
                  {log.version}
                </span>
                <span className="text-sm text-text-muted font-mono">{log.date}</span>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${typeStyles[log.type] ?? typeStyles.fix}`}>
                {log.type.toUpperCase()}
              </span>
            </CardHeader>
            <CardContent className="pt-4">
              <CardTitle className="text-xl mb-2">{log.title}</CardTitle>
              <p className="text-text-muted">{log.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
