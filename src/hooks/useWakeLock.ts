/**
 * useWakeLock — mantém a tela do celular acesa durante a transmissão.
 * Usa a Screen Wake Lock API. Libera automaticamente ao desconectar.
 * Re-adquire o lock ao voltar ao foco (comportamento exigido pela spec).
 */

import { useEffect, useRef, useState } from "react";

interface WakeLockResult {
  /** Verdadeiro se a tela está travada (acesa). */
  isActive: boolean;
  /** API suportada pelo navegador. */
  supported: boolean;
  /** Liberar o lock manualmente. */
  release: () => void;
}

export function useWakeLock(shouldBeActive: boolean): WakeLockResult {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const lockRef   = useRef<WakeLockSentinel | null>(null);
  const [isActive, setIsActive] = useState(false);

  const acquire = async () => {
    if (!supported || lockRef.current) return;
    try {
      lockRef.current = await navigator.wakeLock.request("screen");
      setIsActive(true);
      lockRef.current.addEventListener("release", () => {
        lockRef.current = null;
        setIsActive(false);
      });
    } catch {
      // Permissão negada ou não suportado — continuar sem wake lock
    }
  };

  const release = () => {
    void lockRef.current?.release().catch(() => {});
    lockRef.current = null;
    setIsActive(false);
  };

  // Adquirir ou liberar conforme shouldBeActive
  useEffect(() => {
    if (shouldBeActive) {
      void acquire();
    } else {
      release();
    }
    return () => release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldBeActive]);

  // Re-adquirir quando o dispositivo volta ao foco (spec exige isto)
  useEffect(() => {
    if (!supported) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && shouldBeActive && !lockRef.current) {
        void acquire();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldBeActive, supported]);

  return { isActive, supported, release };
}
