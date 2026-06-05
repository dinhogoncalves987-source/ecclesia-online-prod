import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useLanguage } from "@/hooks/useLanguage";

/**
 * Displays a fixed top banner when the browser reports no network connection.
 * Auto-hides when connectivity is restored. Non-dismissible by design —
 * the offline state itself determines visibility.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { t } = useLanguage();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 bg-amber-500 text-amber-950 py-2 px-4 text-sm font-medium shadow-lg"
    >
      <WifiOff size={14} className="shrink-0" />
      <span>{t("Modo offline — algumas funções estão indisponíveis")}</span>
    </div>
  );
}
