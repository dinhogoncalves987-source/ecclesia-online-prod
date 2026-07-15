import { useRegisterSW } from "virtual:pwa-register/react";
import { useState, useCallback } from "react";

/**
 * PWAUpdatePrompt
 *
 * Componente que monitora atualizações do Service Worker gerenciado pelo
 * vite-plugin-pwa (registerType: 'prompt'). Quando uma nova versão está
 * disponível, exibe um banner solicitando ação do usuário.
 *
 * NÃO recarrega automaticamente e NÃO atualiza sem ação do usuário — a
 * atualização só ocorre quando o usuário clica em "Atualizar agora". O
 * usuário também pode dispensar o aviso clicando em "Depois", continuando
 * na versão atual até a próxima visita.
 */
export function PWAUpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (registration) {
        console.debug("[Ecclesia PWA] Service Worker registrado:", swUrl);
      }
    },
    onRegisterError(error) {
      console.warn("[Ecclesia PWA] Falha ao registrar Service Worker:", error);
    },
  });

  const handleUpdate = useCallback(() => {
    updateServiceWorker(true);
  }, [updateServiceWorker]);

  const handleDismiss = useCallback(() => {
    setNeedRefresh(false);
    setDismissed(true);
  }, [setNeedRefresh]);

  if (!needRefresh || dismissed) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "#1a1a2e",
        color: "#e0e0e0",
        border: "1px solid #4a4a6a",
        borderRadius: 12,
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        maxWidth: "calc(100vw - 32px)",
        width: 420,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 14,
      }}
    >
      <span style={{ flex: 1, fontWeight: 600 }}>Nova versão disponível</span>
      <button
        type="button"
        onClick={handleDismiss}
        style={{
          background: "transparent",
          color: "#c0c0c0",
          border: "1px solid #4a4a6a",
          borderRadius: 8,
          padding: "8px 14px",
          cursor: "pointer",
          fontWeight: 500,
          fontSize: 13,
          whiteSpace: "nowrap",
        }}
      >
        Depois
      </button>
      <button
        type="button"
        onClick={handleUpdate}
        style={{
          background: "#4f46e5",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "8px 16px",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 13,
          whiteSpace: "nowrap",
        }}
      >
        Atualizar agora
      </button>
    </div>
  );
}
