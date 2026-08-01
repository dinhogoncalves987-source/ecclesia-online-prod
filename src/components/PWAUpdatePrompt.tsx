import { useRegisterSW } from "virtual:pwa-register/react";
import { useCallback } from "react";
import { useLanguage } from "@/hooks/useLanguage";

/**
 * PWAUpdatePrompt
 *
 * Componente que monitora atualizações do Service Worker gerenciado pelo
 * vite-plugin-pwa (registerType: 'prompt'). Quando uma nova versão está
 * disponível, exibe um banner solicitando ação do usuário.
 *
 * Uma release nova nunca pode ficar silenciosamente escondida atras de uma
 * versao antiga do PWA. A atualizacao continua exigindo o clique consciente
 * (para nao interromper um formulario), mas o aviso nao pode ser dispensado.
 * O registro tambem procura uma nova versao periodicamente enquanto a pagina
 * permanece aberta.
 */
export function PWAUpdatePrompt() {
  const { t } = useLanguage();

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (registration) {
        console.debug("[Ecclesia PWA] Service Worker registrado:", swUrl);
        void registration.update();
        window.setInterval(() => {
          void registration.update();
        }, 5 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.warn("[Ecclesia PWA] Falha ao registrar Service Worker:", error);
    },
  });

  const handleUpdate = useCallback(() => {
    updateServiceWorker(true);
  }, [updateServiceWorker]);

  if (!needRefresh) return null;

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
