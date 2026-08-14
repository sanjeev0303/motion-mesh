"use client";

import { formatBytes, formatDuration } from "@/lib/utils";
import { Video } from "@/lib/types";
import { TableCell, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";

// Safe SSR-compatible hook for prefers-reduced-motion
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

interface VideoJobRowProps {
  video: Video;
}

export function VideoJobRow({ video }: VideoJobRowProps) {
  const reducedMotion = useReducedMotion();
  const progress = video.status === "processing" ? 50 : 0;

  return (
    <TableRow className="border-border-subtle hover:bg-bg-surface-raised/50 group transition-colors">
      <TableCell className="w-[100px]">
        {video.thumbnail_key && video.status === "ready" ? (
          <div className="w-16 h-9 rounded bg-bg-surface-raised overflow-hidden border border-border-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/videos/${video.id}/thumbnail`} alt="Thumbnail" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-16 h-9 rounded bg-bg-surface-raised flex items-center justify-center border border-border-subtle">
            <ImageIcon className="h-4 w-4 text-text-muted" />
          </div>
        )}
      </TableCell>
      <TableCell className="font-medium text-text-primary">
        <Link href={`/dashboard/videos/${video.id}`} className="hover:text-accent-motion transition-colors block">
          {video.title}
        </Link>
        {video.status === "processing" && (
          <div className="mt-2 flex items-center gap-2 max-w-[200px]">
            <Progress value={progress} className="h-1.5" indicatorClassName="bg-accent-motion" />
            <span className="text-[10px] text-text-muted font-mono">{progress}%</span>
          </div>
        )}
      </TableCell>
      <TableCell className="text-text-muted font-mono text-sm text-right">
        {video.duration > 0 ? formatDuration(video.duration) : "-"}
      </TableCell>
      <TableCell>
        <StatusBadge status={video.status} />
      </TableCell>
      <TableCell className="text-text-muted text-right font-mono text-sm">
        {video.size_bytes && video.size_bytes > 0 ? formatBytes(video.size_bytes) : "-"}
      </TableCell>
      <TableCell className="text-text-muted text-right text-sm">
        {video.created_at ? new Date(video.created_at).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }) : "-"}
      </TableCell>
    </TableRow>
  );
}
