import { Loader2 } from "lucide-react";

/** Lightweight fallback shown while lazy route chunks load. */
export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-background">
      <Loader2 size={28} className="animate-spin text-accent" aria-label="Loading" />
    </div>
  );
}
