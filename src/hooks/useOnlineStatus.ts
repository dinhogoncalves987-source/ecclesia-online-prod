import { useState, useEffect } from "react";

/**
 * Returns true when the browser reports a network connection.
 * Listens to native `online` / `offline` window events.
 *
 * Note: navigator.onLine can be true even when the connection is poor.
 * This hook reflects the browser's own connectivity signal — not a
 * deep ping. Use it for UX hints, not for critical business logic.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
