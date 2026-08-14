import { cn } from "@/lib/utils";

export type JobStatus = "ready" | "processing" | "queued" | "failed";

interface StatusBadgeProps {
  status: JobStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusStyles: Record<JobStatus, string> = {
    ready: "bg-success/10 text-success border-success/20",
    processing: "bg-accent-motion/10 text-accent-motion border-accent-motion/20",
    queued: "bg-bg-surface-raised text-text-muted border-border-subtle",
    failed: "bg-danger/10 text-danger border-danger/20",
  };

  const statusLabels: Record<JobStatus, string> = {
    ready: "Ready",
    processing: "Processing",
    queued: "Queued",
    failed: "Failed",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        statusStyles[status],
        className
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
