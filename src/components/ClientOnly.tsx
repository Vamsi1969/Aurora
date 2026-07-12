import { type ReactNode, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

/**
 * Wraps a component so it only renders on the client side.
 * This prevents hydration mismatches when child components use
 * client-only hooks (e.g. useChat, localStorage, window APIs).
 */
export function ClientOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      fallback ?? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground py-10">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      )
    );
  }

  return <>{children}</>;
}
