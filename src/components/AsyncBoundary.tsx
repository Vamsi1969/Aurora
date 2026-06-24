import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  loadingLabel?: string;
  errorTitle?: string;
  className?: string;
  compact?: boolean;
};

export function AsyncBoundary({
  loading,
  error,
  onRetry,
  loadingLabel = "Loading…",
  errorTitle = "Something went wrong",
  className,
  compact,
}: Props) {
  if (error) {
    const message =
      error instanceof Error ? error.message : "We couldn't reach the server. Please try again.";
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-col items-center justify-center gap-3 text-center",
          compact ? "px-3 py-4" : "px-6 py-10",
          className,
        )}
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" />
        </div>
        <div>
          <div className="text-sm font-medium">{errorTitle}</div>
          <div className="mt-1 max-w-sm text-xs text-muted-foreground">{message}</div>
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
            <RefreshCw className="size-3.5" />
            Try again
          </Button>
        )}
      </div>
    );
  }
  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 text-sm text-muted-foreground",
          compact ? "px-3 py-4" : "px-6 py-10",
          className,
        )}
      >
        <Loader2 className="size-4 animate-spin" />
        {loadingLabel}
      </div>
    );
  }
  return null;
}
