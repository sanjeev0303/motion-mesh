"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { motionmesh } from "@motionmesh/sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileCode2, Play, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface TranscodeJob {
  id: string;
  video_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress_percent: number;
  error_msg?: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "secondary",
  processing: "default",
  completed: "outline",
  failed: "destructive",
};

function JobStatusBadge({ status, progress }: { status: string; progress: number }) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant={STATUS_VARIANT[status] ?? "secondary"} className={
        status === "processing" ? "bg-accent-motion/20 text-accent-motion border-accent-motion/30" :
        status === "completed" ? "bg-success/10 text-success border-success/20" :
        status === "failed" ? "bg-danger/10 text-danger border-danger/20" :
        "bg-bg-surface-raised text-text-muted"
      }>
        {status}
      </Badge>
      {status === "processing" && progress > 0 && (
        <span className="text-xs text-text-muted font-mono">{progress}%</span>
      )}
    </div>
  );
}

export default function MediaConvertPage() {
  const [videoId, setVideoId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: jobs = [], isFetching } = useQuery<TranscodeJob[]>({
    queryKey: ["transcode-jobs"],
    queryFn: async () => {
      const result = await motionmesh.mediaConverter.listJobs(50);
      return (result as TranscodeJob[]) ?? [];
    },
    // Poll every 5s when any job is processing/queued
    refetchInterval: (query) => {
      const rows = (query.state.data as TranscodeJob[] | undefined) ?? [];
      const hasActive = rows.some((j) => j.status === "queued" || j.status === "processing");
      return hasActive ? 5000 : 30000;
    },
    staleTime: 0,
  });

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoId.trim()) {
      toast({ title: "Validation Error", description: "Please enter a valid Video ID.", variant: "destructive" });
      return;
    }

    try {
      setIsSubmitting(true);
      await motionmesh.mediaConverter.createJob(videoId.trim());
      toast({ title: "Transcode Job Created", description: `Queued transcoding for video ${videoId}` });
      setVideoId("");
      await queryClient.invalidateQueries({ queryKey: ["transcode-jobs"] });
    } catch (err: any) {
      toast({ title: "Failed to create job", description: err.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-text-primary tracking-tight mb-2">Media Convert</h1>
        <p className="text-text-muted">Trigger and manage on-demand transcode jobs for your videos.</p>
      </div>

      <div className="p-6 rounded-lg border border-border-subtle bg-bg-surface space-y-6">
        <div>
          <h3 className="text-lg font-medium text-text-primary mb-1">Create Job</h3>
          <p className="text-sm text-text-muted mb-4">Manually trigger a transcoding job for an existing video to generate HLS renditions.</p>
          <form onSubmit={handleCreateJob} className="flex gap-4 items-end max-w-xl">
            <div className="flex-1 space-y-2">
              <label htmlFor="videoId" className="text-sm font-medium text-text-primary">
                Video ID
              </label>
              <Input
                id="videoId"
                placeholder="e.g. 9d105ef9-8e7b-4d2c-86b2-82021219ed1d"
                value={videoId}
                onChange={(e) => setVideoId(e.target.value)}
                className="bg-bg-base border-border-subtle"
                disabled={isSubmitting}
              />
            </div>
            <Button type="submit" disabled={isSubmitting} className="bg-accent-motion text-white hover:bg-accent-motion/90">
              <Play className="mr-2 h-4 w-4" />
              {isSubmitting ? "Queuing..." : "Create Job"}
            </Button>
          </form>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-medium text-text-primary">Recent Jobs</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["transcode-jobs"] })}
            disabled={isFetching}
            className="text-text-muted hover:text-text-primary gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="rounded-md border border-border-subtle bg-bg-surface overflow-hidden">
          <Table>
            <TableHeader className="bg-bg-surface-raised">
              <TableRow className="border-border-subtle hover:bg-transparent">
                <TableHead className="text-text-muted font-medium">Job ID</TableHead>
                <TableHead className="text-text-muted font-medium">Video ID</TableHead>
                <TableHead className="text-text-muted font-medium">Status</TableHead>
                <TableHead className="text-text-muted font-medium text-right">Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 ? (
                <TableRow className="border-border-subtle hover:bg-transparent">
                  <TableCell colSpan={4} className="h-32 text-center text-text-muted">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileCode2 className="h-8 w-8 text-border-subtle" />
                      <p>No transcode jobs yet. Upload a video to get started.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <TableRow key={job.id} className="border-border-subtle hover:bg-bg-surface-raised/50 transition-colors">
                    <TableCell className="font-mono text-xs text-text-muted max-w-[120px] truncate">{job.id.slice(0, 8)}…</TableCell>
                    <TableCell className="font-mono text-xs text-text-primary max-w-[120px] truncate">{job.video_id.slice(0, 8)}…</TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} progress={job.progress_percent} />
                    </TableCell>
                    <TableCell className="text-text-muted text-sm text-right">
                      {new Date(job.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
