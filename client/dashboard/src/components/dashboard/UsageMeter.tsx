import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/utils";

interface UsageMeterProps {
  label: string;
  used: number;
  limit: number;
  formatAs?: "bytes" | "minutes";
}

export function UsageMeter({ label, used, limit, formatAs = "bytes" }: UsageMeterProps) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  
  const formatValue = (val: number) => {
    if (formatAs === "bytes") return formatBytes(val, 0);
    return `${val.toLocaleString()} min`;
  };

  const isWarning = percentage >= 80 && percentage < 95;
  const isDanger = percentage >= 95;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-text-muted">
          <span className={isDanger ? "text-danger" : isWarning ? "text-warning" : "text-text-primary"}>
            {formatValue(used)}
          </span>{" "}
          / {formatValue(limit)}
        </span>
      </div>
      <Progress 
        value={percentage} 
        className="h-2" 
        indicatorClassName={
          isDanger ? "bg-danger" : 
          isWarning ? "bg-warning" : 
          "bg-accent-motion"
        }
      />
    </div>
  );
}
