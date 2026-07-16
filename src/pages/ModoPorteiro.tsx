import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import {
  ScanLine, Camera, CameraOff, Loader2, CheckCircle2, XCircle,
  User, Building2, Hash, BadgeCheck, Search,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ValidationResult = {
  valid: true;
  member_id: string;
  full_name: string;
  photo_url: string | null;
  status: string;
  member_role: string;
  organization_id: string;
  organization_name: string;
  congregation_id: string | null;
  sector_id: string | null;
  matricula: string;
};

type AppState =
  | "idle"
  | "scanning"
  | "loading"
  | "success"
  | "error";

interface ValidationError {
  reason: string;
  message: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const STATUS_LABEL: Record<string, string> = {
  Ativo: "Ativo",
  Inativo: "Inativo",
  Visitante: "Visitante",
  Transferido: "Transferido",
  "Em disciplina": "Em disciplina",
  Disciplinado: "Disciplinado",
  Congregado: "Congregado",
  Falecido: "In Memoriam",
  Afastado: "Afastado",
};

function getErrorMessage(reason: string, t: (key: string) => string): string {
  switch (reason) {
    case "invalid_token":
      return t("QR Code inválido ou token não encontrado.");
    case "token_expired":
      return t("Este QR Code expirou. Peça ao membro que gere um novo código.");
    case "token_already_used":
      return t("Este QR Code já foi utilizado. Cada código é válido apenas uma vez.");
    case "permission_denied":
      return t("Você não tem permissão para validar membros. Apenas porteiros e líderes autorizados.");
    case "not_authenticated":
      return t("Você precisa estar autenticado para validar membros.");
    case "member_not_found":
      return t("Membro não encontrado no sistema.");
    default:
      return t("Erro ao validar o QR Code. Tente novamente.");
  }
}

function extractTokenFromValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Reject old /validar-membro/<uuid> URLs
  if (/\/validar-membro\//i.test(trimmed)) return null;

  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("token");
    if (token) return token;
    // If it parsed as URL but no token param, check path segments
    // but only for /admin/porteiro pattern
    return null;
  } catch {
    // Not a URL — treat as raw token (hex string expected)
  }

  // Treat as raw token hex string
  if (/^[a-fA-F0-9]{32,}$/.test(trimmed)) return trimmed;
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ModoPorteiro() {
  const { t } = useLanguage();

  // Scanner refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivId = "porteiro-qr-reader";

  // State
  const [appState, setAppState] = useState<AppState>("idle");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<ValidationError | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ── Token from URL on mount ─────────────────────────────────────────────────

  const validateToken = useCallback(async (token: string) => {
    setAppState("loading");
    setError(null);
    setResult(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "validate_member_validation_token",
        { p_token: token },
      );
      if (rpcError) throw rpcError;

      const payload = data as Record<string, unknown>;
      if (payload?.valid === true) {
        setResult(payload as unknown as ValidationResult);
        setAppState("success");
      } else {
        const reason = (payload?.reason as string) || "unknown";
        setError({ reason, message: getErrorMessage(reason, t) });
        setAppState("error");
      }
    } catch {
      setError({
        reason: "unknown",
        message: t("Erro de conexão ao validar. Verifique sua internet e tente novamente."),
      });
      setAppState("error");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token");
    if (tokenFromUrl) {
      window.history.replaceState(null, "", "/admin/porteiro");
      validateToken(tokenFromUrl);
    }
  }, [validateToken]);

  // ── Scanner cleanup on unmount ──────────────────────────────────────────────

  useEffect(() => {
    return () => {
      void (async () => {
        try {
          if (scannerRef.current) {
            await scannerRef.current.stop();
          }
        } catch { /* scanner may already be stopped */ }
      })();
    };
  }, []);

  // ── Scanner start / stop ────────────────────────────────────────────────────

  const startScanner = async () => {
    setCameraError(null);
    setAppState("scanning");
    try {
      const scanner = new Html5Qrcode(scannerDivId);
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) {
        setCameraError(t("Nenhuma câmera encontrada neste dispositivo."));
        setAppState("idle");
        return;
      }

      // Prefer back camera (environment)
      const backCamera = cameras.find((c) =>
        c.label.toLowerCase().includes("back") ||
        c.label.toLowerCase().includes("traseira") ||
        c.label.toLowerCase().includes("environment"),
      );
      const cameraId = backCamera?.id || cameras[cameras.length - 1].id;

      await scanner.start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          // Stop scanner on first successful read
          void (async () => {
            try {
              await scanner.stop();
            } catch { /* ignore */ }
          })();
          scannerRef.current = null;

          const token = extractTokenFromValue(decodedText);
          if (!token) {
            setError({
              reason: "invalid_qr",
              message: t("QR Code inválido. Este não é um QR de carteira de membro."),
            });
            setAppState("error");
            return;
          }
          validateToken(token);
        },
        () => {
          // onScanFailure — silent, scanner keeps trying
        },
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t("Erro desconhecido ao iniciar câmera.");
      setCameraError(msg);
      setAppState("idle");
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current = null;
      }
    } catch { /* ignore */ }
    setAppState("idle");
    setCameraError(null);
  };

  // ── Manual validation ───────────────────────────────────────────────────────

  const handleManualValidate = () => {
    const token = extractTokenFromValue(manualInput);
    if (!token) {
      setError({
        reason: "invalid_input",
        message: t("Link ou token inválido. Cole a URL completa do QR Code ou o token gerado."),
      });
      setAppState("error");
      return;
    }
    setManualInput("");
    validateToken(token);
  };

  // ── Reset ───────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setAppState("idle");
    setResult(null);
    setError(null);
    setCameraError(null);
    setManualInput("");
    void (async () => {
      try {
        if (scannerRef.current) {
          await scannerRef.current.stop();
          scannerRef.current = null;
        }
      } catch { /* ignore */ }
    })();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
            <ScanLine size={28} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{t("Modo Porteiro")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Validação segura de membros por QR Code temporário.")}
          </p>
        </div>

        {/* Instructions */}
        <p className="text-xs text-muted-foreground text-center">
          {t("Aponte a câmera para o QR Code da carteira digital ou cole o link/token manualmente.")}
        </p>

        {/* ── Loading state ──────────────────────────────────────────────── */}
        {appState === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 size={36} className="animate-spin text-emerald-600" />
            <p className="text-sm font-medium text-muted-foreground">{t("Validando...")}</p>
          </div>
        )}

        {/* ── Success state ──────────────────────────────────────────────── */}
        {appState === "success" && result && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BadgeCheck size={20} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {t("Membro validado")}
              </span>
            </div>

            <div className="flex items-start gap-3">
              {result.photo_url ? (
                <img
                  src={result.photo_url}
                  alt={result.full_name}
                  className="w-14 h-14 rounded-xl object-cover ring-2 ring-white dark:ring-emerald-900 flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-emerald-200 dark:bg-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-bold text-lg flex-shrink-0">
                  {initials(result.full_name)}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-base truncate">{result.full_name}</p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  {result.member_role}
                </p>
                <span className="inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800/60 text-emerald-800 dark:text-emerald-200">
                  {t(STATUS_LABEL[result.status] || result.status)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-1.5">
                <Building2 size={14} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-emerald-800 dark:text-emerald-200 truncate">
                  {result.organization_name}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Hash size={14} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-emerald-800 dark:text-emerald-200 font-mono">
                  {result.matricula}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="w-full inline-flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
            >
              <Search size={16} /> {t("Escanear próximo QR")}
            </button>
          </div>
        )}

        {/* ── Error state ────────────────────────────────────────────────── */}
        {appState === "error" && error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <XCircle size={20} className="text-red-600 dark:text-red-400" />
              <span className="text-sm font-bold text-red-700 dark:text-red-300">
                {t("Falha na validação")}
              </span>
            </div>
            <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
            <button
              type="button"
              onClick={handleReset}
              className="w-full inline-flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
            >
              <Search size={16} /> {t("Tentar novamente")}
            </button>
          </div>
        )}

        {/* ── Scanner & manual input (idle / scanning) ───────────────────── */}
        {(appState === "idle" || appState === "scanning") && (
          <>
            {/* QR reader div */}
            <div
              id={scannerDivId}
              className={`w-full rounded-2xl overflow-hidden border-2 border-dashed transition-colors ${
                appState === "scanning"
                  ? "border-emerald-400 dark:border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-border bg-muted/30"
              }`}
              style={{ minHeight: appState === "scanning" ? 280 : 80 }}
            />

            {/* Camera error */}
            {cameraError && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-700 dark:text-amber-300">{cameraError}</p>
              </div>
            )}

            {/* Scanner buttons */}
            <div className="flex items-center justify-center gap-3">
              {appState === "idle" && (
                <button
                  type="button"
                  onClick={startScanner}
                  className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
                >
                  <Camera size={16} /> {t("Iniciar câmera")}
                </button>
              )}
              {appState === "scanning" && (
                <button
                  type="button"
                  onClick={stopScanner}
                  className="inline-flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                >
                  <CameraOff size={16} /> {t("Parar câmera")}
                </button>
              )}
            </div>

            {appState === "scanning" && (
              <p className="text-xs text-muted-foreground text-center">
                {t("Aponte a câmera para o QR Code da carteira digital.")}
              </p>
            )}
            {appState === "idle" && (
              <p className="text-xs text-muted-foreground text-center">
                {t("Aguardando leitura")}
              </p>
            )}

            {/* Manual input */}
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground text-center">
                {t("Ou cole o link/token manualmente")}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleManualValidate();
                  }}
                  placeholder={t("Colar link ou token do QR Code")}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <button
                  type="button"
                  onClick={handleManualValidate}
                  disabled={!manualInput.trim()}
                  className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-40 transition-opacity"
                >
                  <Search size={16} /> {t("Validar")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
