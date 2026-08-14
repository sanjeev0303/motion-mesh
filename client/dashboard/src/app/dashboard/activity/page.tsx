"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Filter, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api-client";

interface ActivityEntry {
  id: string;
  action: string;
  actor: string;
  resource: string;
  timestamp: string;
}

function deriveActivityFromVideos(videos: any[]): ActivityEntry[] {
  return videos.map((v) => ({
    id: v.id,
    action: v.status === "ready"
      ? "video.transcoded"
      : v.status === "processing"
      ? "video.processing"
      : v.status === "failed"
      ? "video.failed"
      : "video.uploaded",
    actor: "System",
    resource: v.title ?? v.id,
    timestamp: v.updated_at ?? v.created_at ?? new Date().toISOString(),
  }));
}

export default function ActivityPage() {
  const [filter, setFilter] = useState("all");
  const api = useApi();

  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: async () => {
      const { data, response } = await api.GET("/v1/videos", {});
      if (!response.ok) return [];
      return (data as unknown as any[]) ?? [];
    },
    staleTime: 30000,
  });

  const activity = deriveActivityFromVideos(videos ?? []);
  const actionTypes = Array.from(new Set(activity.map((a) => a.action)));

  const filteredActivity =
    filter === "all" ? activity : activity.filter((a) => a.action === filter);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold">Activity Log</h1>
          <p className="text-text-muted">Audit trail of actions across your workspace.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-text-muted hidden sm:block" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {actionTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Comprehensive log of workspace events for security and compliance.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-borderSubtle overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface border-b border-borderSubtle">
                <tr>
                  <th className="px-4 py-3 font-medium text-text-muted">Timestamp</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Actor</th>
                  <th className="px-4 py-3 font-medium text-text-muted">Action</th>
                  <th className="px-4 py-3 font-medium text-text-muted hidden sm:table-cell">Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borderSubtle bg-base">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-text-muted">
                      <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-text-muted/50" />
                      Loading activity…
                    </td>
                  </tr>
                ) : filteredActivity.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-text-muted">
                      <Activity className="w-8 h-8 mx-auto mb-3 text-text-muted/50" />
                      No activity found{filter !== "all" ? " for this filter" : " yet"}.
                    </td>
                  </tr>
                ) : (
                  filteredActivity.map((act) => (
                    <tr key={act.id} className="hover:bg-surface-raised transition-colors">
                      <td className="px-4 py-3 text-text-muted font-mono text-xs whitespace-nowrap">
                        {new Date(act.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {act.actor}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-mono bg-surface border border-borderSubtle text-text-muted">
                          {act.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted hidden sm:table-cell truncate max-w-xs">
                        {act.resource}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
