"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VideoJobRow } from "@/components/dashboard/VideoJobRow";
import { UploadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useApi } from "@/lib/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Video } from "@/lib/types";
import { useAuth } from "@clerk/nextjs";
import { motionmesh } from "@motionmesh/sdk";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";

export default function VideosPage() {
  const { getToken } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const { toast } = useToast();
  const api = useApi();
  const queryClient = useQueryClient();

  const { data: serverVideos, isError, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: async () => {
      const { data, error, response } = await api.GET("/v1/videos", {});
      if (error || !response.ok) {
        if (response?.status === 401 || response?.status === 403) {
          toast({ title: "Unauthorized", description: "Please log in to view your videos.", variant: "destructive" });
        } else if (response?.status === 429) {
          toast({ title: "Rate Limited", description: "Too many requests. Please try again later.", variant: "destructive" });
        }
        throw new Error("Failed to load videos");
      }
      if (Array.isArray(data)) {
        return data as unknown as Video[];
      }
      return (data as any).videos as unknown as Video[];
    },
    staleTime: 60000,
  });



  const videos = serverVideos ?? [];
  const hasVideos = videos.length > 0;
  const hasProcessingVideos = videos.some((v) => v.status === "processing" || v.status === "queued");

  useQuery({
    queryKey: ["videos", "polling"],
    queryFn: async () => {
      const { data } = await api.GET("/v1/videos", {});
      if (data) queryClient.setQueryData(["videos"], data);
      return data ?? null;
    },
    enabled: hasProcessingVideos,
    refetchInterval: 10000,
  });

  /** Called when the user picks a file from the file dialog. */
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting the same file

    setIsUploading(true);
    toast({ title: "Uploading…", description: `Starting upload for "${file.name}"` });

    try {
      // Step 1: Upload via the SDK proxy method
      const newVideo = await motionmesh.videos.dashboardUpload({
        video: file,
        filename: file.name,
        sizeBytes: file.size,
        bucketId: process.env.NEXT_PUBLIC_MOTIONMESH_BUCKET_ID,
        transcodeBucketId: process.env.NEXT_PUBLIC_MOTIONMESH_TRANSCODE_BUCKET_ID,
      });

      // Step 2 — add to local cache so the row appears immediately
      queryClient.setQueryData(["videos"], (old: Video[] | undefined) => [newVideo, ...(old ?? [])]);
      toast({ title: "Upload complete", description: `"${file.name}" is queued for processing.` });
      setIsUploadDialogOpen(false);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Upload failed", description: err?.message ?? "Unexpected error", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const openFilePicker = () => {
    (document.getElementById("video-file-input") as HTMLInputElement)?.click();
  };

  return (
    <div className="space-y-6">
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Video</DialogTitle>
            <DialogDescription>
              Upload a new video to your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col space-y-4 py-4">
            <div className="pt-4 flex flex-col gap-3">
              <input
                id="video-file-input"
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileSelected}
              />
              <Button
                onClick={openFilePicker}
                disabled={isUploading}
                className="w-full bg-accent-motion text-bg-base hover:bg-accent-motion/90"
              >
                <UploadCloud className={`mr-2 h-4 w-4 ${isUploading ? "animate-pulse" : ""}`} />
                {isUploading ? "Uploading…" : "Select File & Upload"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-text-primary tracking-tight">Videos</h1>
          <p className="text-text-muted mt-1">Manage transcoded assets, renditions, and captions.</p>
        </div>
        <Button
          onClick={() => setIsUploadDialogOpen(true)}
          className="bg-accent-motion text-bg-base hover:bg-accent-motion/90"
        >
          <UploadCloud className="mr-2 h-4 w-4" />
          Upload Video
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-border-subtle border-dashed rounded-lg bg-bg-surface">
          <Loader2 className="w-10 h-10 animate-spin text-text-muted mb-4" />
          <p className="text-text-muted">Loading your videos...</p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-danger/20 border-dashed rounded-lg bg-danger/5">
          <h3 className="text-lg font-medium text-danger mb-2">Failed to load videos</h3>
          <p className="text-text-muted max-w-sm mb-6">
            There was an error communicating with the server.
          </p>
          <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['videos'] })}>
            Retry
          </Button>
        </div>
      ) : hasVideos ? (
        <div className="rounded-md border border-border-subtle bg-bg-surface overflow-hidden">
          <Table>
            <TableHeader className="bg-bg-surface-raised">
              <TableRow className="border-border-subtle hover:bg-transparent">
                <TableHead className="w-[100px]" />
                <TableHead className="text-text-muted font-medium w-[400px]">Title</TableHead>
                <TableHead className="text-text-muted font-medium text-right w-[100px]">Duration</TableHead>
                <TableHead className="text-text-muted font-medium w-[150px]">Status</TableHead>
                <TableHead className="text-text-muted font-medium text-right w-[150px]">Size</TableHead>
                <TableHead className="text-text-muted font-medium text-right w-[150px]">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.map((video) => (
                <VideoJobRow key={video.id} video={video} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center border border-border-subtle border-dashed rounded-lg bg-bg-surface">
          <div className="h-12 w-12 rounded-full bg-bg-surface-raised flex items-center justify-center mb-4">
            <UploadCloud className="h-6 w-6 text-text-muted" />
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">No videos yet</h3>
          <p className="text-text-muted max-w-sm mb-6">
            Upload your first video to start transcoding and generating HLS streams.
          </p>
          <Button
            onClick={() => setIsUploadDialogOpen(true)}
            className="bg-accent-motion text-bg-base hover:bg-accent-motion/90"
          >
            <UploadCloud className="mr-2 h-4 w-4" />
            Upload Video
          </Button>
        </div>
      )}
    </div>
  );
}
