"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HardDrive, Video as VideoIcon, Activity, Key, Upload, CheckCircle2, Circle, X, Webhook, TrendingUp, TrendingDown, BookOpen, Clock, PlayCircle } from "lucide-react";
import Link from "next/link";
import { formatBytes } from "@/lib/utils";
import { useApi } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";
import { Video } from "@/lib/types";
import { motionmesh } from "@motionmesh/sdk";


export default function DashboardHome() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const api = useApi();

  const { data: serverVideos } = useQuery<Video[]>({
    queryKey: ['videos'],
    queryFn: async () => {
      return motionmesh.videos.list() as unknown as Video[];
    },
  });

  const { data: serverBuckets } = useQuery({
    queryKey: ['buckets'],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/buckets", {});
      if (error) return [];
      return data as unknown as any[];
    },
  });

  const { data: serverApiKeys } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data, error } = await api.GET("/v1/api-keys", {});
      if (error) return [];
      return data as unknown as any[];
    },
  });

  const { data: subscription } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/v1/billing/subscription", {});
      if (error || !response.ok) return null;
      return data as any;
    },
  });

  const videos = serverVideos ?? [];

  useEffect(() => {
    setIsMounted(true);
    const dismissed = localStorage.getItem("motionmesh_onboarding_dismissed");
    if (!dismissed && videos.length < 5) {
      setShowOnboarding(true);
    }
  }, [videos.length]);

  const dismissOnboarding = () => {
    localStorage.setItem("motionmesh_onboarding_dismissed", "true");
    setShowOnboarding(false);
  };
  const recentVideos = videos.slice(0, 3);

  const recentActivity = [
    ...(serverVideos || []).map(v => ({
      id: `vid-${v.id}`,
      actor: "System",
      action: "processed video",
      resource: v.title,
      timestamp: v.created_at
    })),
    ...(serverBuckets || []).map(b => ({
      id: `bkt-${b.id}`,
      actor: "You",
      action: "created bucket",
      resource: b.name,
      timestamp: b.createdAt || b.created_at || new Date().toISOString()
    })),
    ...(serverApiKeys || []).map(k => ({
      id: `key-${k.id}`,
      actor: "You",
      action: "generated API key",
      resource: k.name || 'default',
      timestamp: k.createdAt || k.created_at || new Date().toISOString()
    }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);

  const queuedJobs = videos.filter(v => v.status === "queued").length;
  const processingJobs = videos.filter(v => v.status === "processing").length;
  const totalActiveJobs = queuedJobs + processingJobs;

  const billing = {
    ...(subscription || {}),
    storageUsedBytes: (serverBuckets || []).reduce((acc: number, b: any) => acc + (Number(b.storageUsedBytes) || 0), 0),
    egressUsedBytes: (serverBuckets || []).reduce((acc: number, b: any) => acc + (Number(b.egressUsedBytes) || 0), 0),
    transcodeMinutesUsed: (serverVideos || []).reduce((acc: number, v: any) => acc + Math.ceil((Number(v.duration) || 0) / 60), 0)
  };


  const status = { overall: 'operational' };

  // Render nothing during SSR to avoid hydration mismatch with localStorage
  if (!isMounted) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-semibold">Dashboard</h1>
            <p className="text-text-muted">Welcome back to Motionmesh.</p>
          </div>
          {totalActiveJobs > 0 && (
            <div className="hidden sm:flex items-center gap-2 bg-accent-mesh/10 text-accent-mesh px-3 py-1 rounded-full text-xs font-medium border border-accent-mesh/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-mesh opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-mesh"></span>
              </span>
              {totalActiveJobs} active job{totalActiveJobs !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        <div></div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="relative overflow-hidden group hover:border-accent-motion/50 hover:shadow-lg hover:shadow-accent-motion/10 transition-all duration-500 bg-gradient-to-br from-surface to-base">
          <div className="absolute inset-0 bg-gradient-to-br from-accent-motion/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-text-muted group-hover:text-text-primary transition-colors">Total Videos</CardTitle>
            <div className="p-2 rounded-full bg-accent-motion/10 text-accent-motion group-hover:bg-accent-motion group-hover:text-white transition-colors duration-500">
              <VideoIcon className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-display font-bold tracking-tight">{videos.length}</div>
            <p className="text-xs text-success flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3" /> <span className="font-medium">+12%</span> <span className="text-text-muted">from last month</span>
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden group hover:border-accent-mesh/50 hover:shadow-lg hover:shadow-accent-mesh/10 transition-all duration-500 bg-gradient-to-br from-surface to-base">
          <div className="absolute inset-0 bg-gradient-to-br from-accent-mesh/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-text-muted group-hover:text-text-primary transition-colors">Storage Used</CardTitle>
            <div className="p-2 rounded-full bg-accent-mesh/10 text-accent-mesh group-hover:bg-accent-mesh group-hover:text-white transition-colors duration-500">
              <HardDrive className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-display font-bold tracking-tight">{formatBytes(billing.storageUsedBytes)}</div>
            <p className="text-xs text-success flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3" /> <span className="font-medium">+4.2%</span> <span className="text-text-muted">from last month</span>
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden group hover:border-warning/50 hover:shadow-lg hover:shadow-warning/10 transition-all duration-500 bg-gradient-to-br from-surface to-base">
          <div className="absolute inset-0 bg-gradient-to-br from-warning/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-text-muted group-hover:text-text-primary transition-colors">Transcode Mins</CardTitle>
            <div className="p-2 rounded-full bg-warning/10 text-warning group-hover:bg-warning group-hover:text-white transition-colors duration-500">
              <PlayCircle className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-display font-bold tracking-tight">{billing.transcodeMinutesUsed}</div>
            <p className="text-xs text-success flex items-center gap-1 mt-2">
              <TrendingDown className="w-3 h-3" /> <span className="font-medium">-2%</span> <span className="text-text-muted">from last month</span>
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden group hover:border-success/50 hover:shadow-lg hover:shadow-success/10 transition-all duration-500 bg-gradient-to-br from-surface to-base">
          <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-text-muted group-hover:text-text-primary transition-colors">Egress (Month)</CardTitle>
            <div className="p-2 rounded-full bg-success/10 text-success group-hover:bg-success group-hover:text-white transition-colors duration-500">
              <Activity className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-display font-bold tracking-tight">{formatBytes(billing.egressUsedBytes)}</div>
            <p className="text-xs text-danger flex items-center gap-1 mt-2">
              <TrendingUp className="w-3 h-3" /> <span className="font-medium">+18%</span> <span className="text-text-muted">from last month</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">


          {/* Recent Videos */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-display font-semibold">Recent Videos</h2>
              <Link href="/videos" className="text-sm text-accent-mesh hover:underline">View all</Link>
            </div>
            <div className="bg-surface border border-borderSubtle rounded-xl overflow-hidden">
              <div className="divide-y divide-borderSubtle">
                {recentVideos.map(video => (
                  <div key={video.id} className="p-4 flex items-center gap-4 hover:bg-surface-raised transition-colors">
                    <div className="w-24 h-16 bg-base rounded border border-borderSubtle flex-shrink-0 flex items-center justify-center overflow-hidden relative">
                      {video.thumbnail_key ? (
                        <div className="w-full h-full bg-borderSubtle relative group">
                          {/* Simulated image */}
                          <div className="absolute inset-0 bg-base opacity-20" />
                          <PlayCircle className="absolute inset-0 m-auto w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      ) : (
                        <VideoIcon className="w-6 h-6 text-text-muted" />
                      )}
                      <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[10px] text-white">
                        {Math.floor((video.duration || 0) / 60)}:{Math.floor((video.duration || 0) % 60).toString().padStart(2, '0')}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{video.title}</p>
                      <p className="text-xs text-text-muted font-mono mt-1">{new Date(video.created_at).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        video.status === 'ready' ? 'bg-success/20 text-success' :
                        video.status === 'processing' ? 'bg-accent-mesh/20 text-accent-mesh' :
                        video.status === 'failed' ? 'bg-danger/20 text-danger' :
                        'bg-warning/20 text-warning'
                      }`}>
                        {video.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Area */}
        <div className="space-y-8">

          {/* Quick Actions */}
          <div className="space-y-4">
            <h2 className="text-xl font-display font-semibold">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/dashboard/buckets">
                <Button variant="outline" className="w-full h-20 flex-col gap-2 hover:border-accent-motion/50 hover:bg-accent-motion/5">
                  <HardDrive className="w-5 h-5 text-accent-motion" />
                  <span className="text-xs">New Bucket</span>
                </Button>
              </Link>
              <a href="/docs" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full h-20 flex-col gap-2 hover:border-accent-mesh/50 hover:bg-accent-mesh/5">
                  <BookOpen className="w-5 h-5 text-accent-mesh" />
                  <span className="text-xs">Documentation</span>
                </Button>
              </a>
            </div>
          </div>

          {/* Activity Feed */}
          <Card>
            <CardHeader>
              <CardTitle>Activity Feed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map(act => (
                  <div key={act.id} className="flex gap-3 text-sm border-l-2 border-borderSubtle pl-3 relative before:absolute before:w-2 before:h-2 before:bg-borderSubtle before:rounded-full before:-left-[5px] before:top-1.5">
                    <div className="flex-1">
                      <p className="text-text-primary">
                        <span className="font-medium text-text-primary">{act.actor}</span>{" "}
                        <span className="text-text-muted">{act.action.replace('.', ' ')}</span>{" "}
                        <span className="font-medium text-text-primary">{act.resource}</span>
                      </p>
                      <div className="flex items-center gap-1 text-xs text-text-muted mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(act.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* System Status */}
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${status.overall === 'operational' ? 'bg-success' : 'bg-warning'} animate-pulse`} />
                <div>
                  <p className="text-sm font-medium text-text-primary">System Status</p>
                  <p className="text-xs text-text-muted capitalize">All systems {status.overall}</p>
                </div>
              </div>
              <Link href="/dashboard/status" className="text-xs text-text-muted hover:text-text-primary underline">
                Details
              </Link>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
