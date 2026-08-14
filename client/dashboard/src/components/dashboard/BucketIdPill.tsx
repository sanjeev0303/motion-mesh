import { Badge } from "@/components/ui/badge";
import { Database, FolderOutput } from "lucide-react";

interface BucketIdPillProps {
  bucketId?: string;
  type: "primary" | "transcode";
}

export function BucketIdPill({ bucketId, type }: BucketIdPillProps) {
  if (!bucketId) return null;

  return (
    <Badge 
      variant="outline" 
      className={`font-mono text-xs flex items-center gap-1.5 w-fit ${
        type === "primary" 
          ? "bg-blue-500/10 text-blue-500 border-blue-500/20" 
          : "bg-purple-500/10 text-purple-500 border-purple-500/20"
      }`}
    >
      {type === "primary" ? (
        <Database className="h-3 w-3" />
      ) : (
        <FolderOutput className="h-3 w-3" />
      )}
      <span className="truncate max-w-[120px]">{bucketId}</span>
    </Badge>
  );
}
