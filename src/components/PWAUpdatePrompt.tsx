import { useRegisterSW } from "virtual:pwa-register/react";
import { useState, useCallback } from "react";
import { useLanguage } from "@/hooks/useLanguage";

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
  const { t } = useLanguage();
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
      // bottom-20 (mobile) deixa espaço para a navegação inferior fixa do
      // AdminLayout (h-16 + margem de segurança); em desktop (lg:), onde não
      // há bottom nav, volta para bottom-4.
      className="fixed bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 z-[9999]"
      style={{
        background: "#1a1a2e",
        color: "#e0e0e0",
        border: "1px solid #4a4a6a",
        borderRadius: 12,
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        rowGap: 8,
        gap: 12,
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        maxWidth: "calc(100vw - 32px)",
        width: 420,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 14,
      }}
    >
      <span style={{ flex: "1 1 100%", minWidth: 0, fontWeight: 600 }}>{t("Nova versão disponível")}</span>
      <div style={{ display: "flex", gap: 12, marginLeft: "auto" }}>
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
          {t("Depois")}
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
          {t("Atualizar agora")}
        </button>
      </div>
    </div>
  );
}
