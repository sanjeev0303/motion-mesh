"use client";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBytes, formatDuration } from "@/lib/utils";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { BucketIdPill } from "@/components/dashboard/BucketIdPill";
import { ArrowLeft, Trash2, Play, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api-client";
import { Video } from "@/lib/types";
import { motionmesh } from "@motionmesh/sdk";
import { MotionmeshPlayer } from "@motionmesh/player/react";

export default function VideoDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { toast } = useToast();
  const api = useApi();
  const queryClient = useQueryClient();

  const { data: serverVideos, isLoading } = useQuery<Video[]>({
    queryKey: ['videos'],
    queryFn: async () => {
      return motionmesh.videos.list() as unknown as Video[];
    },
    staleTime: 60000,
  });

  const video = serverVideos?.find((v) => v.id === params.id);

  const { data: playbackInfo, isLoading: isPlaybackInfoLoading } = useQuery({
    queryKey: ['playbackInfo', video?.id],
    queryFn: async () => {
      if (!video?.id) return null;
      return motionmesh.videos.getPlaybackInfo(video.id);
    },
    enabled: video?.status === "ready",
    staleTime: 60000,
  });

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-text-muted mb-4" />
        <p className="text-text-muted">Loading video details...</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="h-14 w-14 rounded-full bg-bg-surface-raised border border-border-subtle flex items-center justify-center mb-5">
          <AlertCircle className="h-7 w-7 text-text-muted" />
        </div>
        <h3 className="text-xl font-semibold text-text-primary mb-2">Video not found</h3>
        <p className="text-text-muted text-sm max-w-xs mb-6">
          This video doesn&apos;t exist or may have been deleted.
        </p>
        <Button variant="outline" asChild className="border-border-subtle text-text-muted hover:text-text-primary">
          <Link href="/videos">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Videos
          </Link>
        </Button>
      </div>
    );
  }

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const { error, response } = await api.DELETE("/v1/videos/{id}", {
        params: { path: { id: video.id } }
      });
      if (error || (response && !response.ok)) {
        throw new Error((error as any)?.message || "Failed to delete video from server");
      }

      setIsDeleteDialogOpen(false);

      toast({
        title: "Video deleted",
        description: `${video.title} has been permanently deleted.`,
        variant: "destructive",
      });
      await queryClient.invalidateQueries({ queryKey: ["videos"] });
      router.refresh();
      router.push("/dashboard/videos");
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Failed to delete video",
        description: err.message || "An error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center text-sm text-text-muted">
        <Link href="/videos" className="hover:text-text-primary flex items-center transition-colors">
          <ArrowLeft className="mr-1 h-3 w-3" />
          Back to Videos
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-text-primary tracking-tight mb-2">{video.title}</h1>
          <div className="flex items-center gap-4">
            <StatusBadge status={video.status} />
            {video.captions_status && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                video.captions_status === 'ready' ? 'bg-success/10 text-success border-success/20' :
                video.captions_status === 'failed' ? 'bg-danger/10 text-danger border-danger/20' :
                'bg-warning/10 text-warning border-warning/20'
              }`}>
                CC: {video.captions_status}
              </span>
            )}
            <div className="flex gap-2">
              <BucketIdPill bucketId={video.bucket_id} type="primary" />
              {video.transcode_bucket_id && (
                <BucketIdPill bucketId={video.transcode_bucket_id} type="transcode" />
              )}
            </div>
          </div>
        </div>

        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Video
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-bg-surface border-border-subtle text-text-primary sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="font-display">Delete Video</DialogTitle>
              <DialogDescription className="text-text-muted">
                Are you sure you want to delete <span className="font-bold text-text-primary">{video.title}</span>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6">
              <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting} className="text-text-muted">
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="bg-danger text-white hover:bg-danger/90">
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Yes, delete video"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl overflow-hidden border border-border-subtle bg-bg-base shadow-lg relative aspect-video group">
            {video.status === "ready" ? (
              <MotionmeshPlayer videoTrackingId={video.id} />
            ) : video.status === "failed" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-surface text-center p-6">
                <AlertCircle className="w-10 h-10 text-danger mb-4" />
                <h3 className="text-text-primary font-medium mb-2">Transcoding Failed</h3>
                <p className="text-text-muted text-sm max-w-md">{video.error_message}</p>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-surface">
                {/* Spinner hidden for reduced-motion; replaced with static indicator */}
                <div className="motion-safe:animate-spin w-10 h-10 border-4 border-accent-motion/20 border-t-accent-motion rounded-full mb-4" />
                <p className="text-text-primary font-medium">
                  {video.status === 'processing' ? 'Processing Video…' : 'Queued for Transcoding'}
                </p>
                <p className="text-text-muted text-sm mt-1">
                  {video.status === 'processing'
                    ? 'Generating HLS renditions. This may take a few minutes.'
                    : 'Waiting for a transcode worker to become available.'}
                </p>
              </div>
            )}


          </div>

          {video.renditions && (
            <div className="space-y-4">
              <h3 className="text-xl font-medium text-text-primary">Renditions</h3>
              <div className="rounded-md border border-border-subtle bg-bg-surface overflow-hidden">
                <Table>
                  <TableHeader className="bg-bg-surface-raised">
                    <TableRow className="border-border-subtle hover:bg-transparent">
                      <TableHead className="text-text-muted font-medium">Resolution</TableHead>
                      <TableHead className="text-text-muted font-medium">Bitrate</TableHead>
                      <TableHead className="text-text-muted font-medium">Format</TableHead>
                      <TableHead className="text-text-muted font-medium text-right">Size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {video.renditions.map((r) => (
                      <TableRow key={r.res} className="border-border-subtle hover:bg-bg-surface-raised/50 transition-colors">
                        <TableCell className="font-mono text-text-primary text-sm">{r.res}</TableCell>
                        <TableCell className="font-mono text-text-muted text-sm">{r.bitrate}</TableCell>
                        <TableCell className="font-mono text-text-muted text-sm">{r.format}</TableCell>
                        <TableCell className="font-mono text-text-muted text-sm text-right">{r.size_bytes ? formatBytes(r.size_bytes) : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {video.captions && (
            <div className="space-y-4">
              <h3 className="text-xl font-medium text-text-primary">Caption Tracks</h3>
              <div className="rounded-md border border-border-subtle bg-bg-surface overflow-hidden">
                <Table>
                  <TableHeader className="bg-bg-surface-raised">
                    <TableRow className="border-border-subtle hover:bg-transparent">
                      <TableHead className="text-text-muted font-medium">Language</TableHead>
                      <TableHead className="text-text-muted font-medium">Status</TableHead>
                      <TableHead className="text-text-muted font-medium text-right">Size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {video.captions.map((c) => (
                      <TableRow key={c.lang} className="border-border-subtle hover:bg-bg-surface-raised/50 transition-colors">
                        <TableCell className="font-medium text-text-primary">{c.lang}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success/10 text-success">
                            {c.status}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-text-muted text-sm text-right">{c.size_bytes ? formatBytes(c.size_bytes) : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-lg border border-border-subtle bg-bg-surface">
            <h3 className="text-lg font-medium text-text-primary mb-4">Metadata</h3>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-text-muted mb-1">Duration</dt>
                <dd className="font-mono text-text-primary">{video.duration > 0 ? formatDuration(video.duration) : "-"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-text-muted mb-1">Total Size (incl. renditions)</dt>
                <dd className="font-mono text-text-primary">{video.size_bytes ? formatBytes(video.size_bytes) : "-"}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-text-muted mb-1">Uploaded At</dt>
                <dd className="text-text-primary text-sm">
                  {video.created_at ? new Date(video.created_at).toLocaleString() : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-text-muted mb-1">Video ID</dt>
                <dd className="font-mono text-xs text-text-muted break-all">{video.id}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
