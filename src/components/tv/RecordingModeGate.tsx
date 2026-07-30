/**
 * RecordingModeGate — Gate obrigatório antes de liberar câmera oficial.
 *
 * Fluxo por plataforma:
 *  iOS     → instrui ativar Foco / Não Perturbe na Central de Controle
 *  Android → solicita permissões de câmera + microfone + fullscreen
 *  Outros  → passa automaticamente (computador/tablet não-iOS)
 *
 * Modos de saída:
 *  "official" → câmera oficial, sem aviso
 *  "demo"     → câmera de teste, com banner amarelo de aviso
 *  "blocked"  → usuário cancelou, entrada negada
 */

import { useState, useEffect } from "react";
import { Shield, ShieldCheck, ShieldX, AlertTriangle, Smartphone, CheckCircle2 } from "lucide-react";
import { detectPlatform } from "@/lib/platformDetect";

export type CameraMode = "official" | "demo";
type GateStep =
  | "checking"
  | "ios_focus"
  | "android_perm"
  | "demo_warning"
  | "approved"
  | "blocked";

interface Props {
  onApprove: (mode: CameraMode) => void;
  onBlock:   () => void;
}

export function RecordingModeGate({ onApprove, onBlock }: Props) {
  const [step, setStep]       = useState<GateStep>("checking");
  const [platform]            = useState(() => detectPlatform());
  const [permError, setPermError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  // Detecta plataforma e define o passo inicial
  useEffect(() => {
    if (platform === "ios")     setStep("ios_focus");
    else if (platform === "android") setStep("android_perm");
    else {
      // Computador / dispositivo não-móvel: aprovação automática
      onApprove("official");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── iOS: gate de Foco ──────────────────────────────────────────────────────

  function IosGate() {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="font-semibold text-base leading-snug">Ativar Modo Gravação</p>
            <p className="text-sm text-muted-foreground mt-1">
              Para evitar chamadas e notificações durante a transmissão, ative o{" "}
              <strong>Não Perturbe</strong> neste iPhone.
            </p>
          </div>
        </div>

        <div className="bg-muted/60 rounded-xl p-4 space-y-2 text-sm">
          <p className="font-medium flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-primary" />
            Como ativar:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-1">
            <li>Abra a <strong className="text-foreground">Central de Controle</strong> do iPhone.</li>
            <li>Ative <strong className="text-foreground">Foco / Não Perturbe</strong>.</li>
            <li>Volte para o <strong className="text-foreground">Ecclesia</strong>.</li>
            <li>Toque em <strong className="text-foreground">"Já ativei"</strong> abaixo.</li>
          </ol>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => { onApprove("official"); }}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            Já ativei o Foco
          </button>
          <button
            onClick={() => setStep("demo_warning")}
            className="w-full py-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition"
          >
            Entrar no modo de teste
          </button>
          <button
            onClick={onBlock}
            className="w-full py-2.5 text-sm text-muted-foreground hover:text-destructive transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── Android: gate de permissões ────────────────────────────────────────────

  async function handleAndroidRequest() {
    setRequesting(true);
    setPermError(null);
    try {
      // Solicitar câmera + microfone
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      // Parar imediatamente (o componente pai vai pedir de novo)
      stream.getTracks().forEach((t) => t.stop());
      onApprove("official");
    } catch (err) {
      const e = err as Error;
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setPermError("Permissão de câmera ou microfone negada. Verifique as configurações do navegador.");
      } else {
        setPermError("Câmera não disponível neste dispositivo.");
      }
    } finally {
      setRequesting(false);
    }
  }

  function AndroidGate() {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="font-semibold text-base leading-snug">Ativar Modo Gravação</p>
            <p className="text-sm text-muted-foreground mt-1">
              Para evitar chamadas e notificações durante a transmissão, ative o Modo Gravação neste celular.
            </p>
          </div>
        </div>

        {permError && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
            <ShieldX className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {permError}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => void handleAndroidRequest()}
            disabled={requesting}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 active:scale-95 transition"
          >
            {requesting ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            {requesting ? "Aguardando permissão..." : "Ativar Modo Gravação"}
          </button>
          <button
            onClick={() => setStep("demo_warning")}
            className="w-full py-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition"
          >
            Entrar no modo de teste
          </button>
          <button
            onClick={onBlock}
            className="w-full py-2.5 text-sm text-muted-foreground hover:text-destructive transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── Demo warning ───────────────────────────────────────────────────────────

  function DemoWarning() {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-950/40 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <p className="font-semibold text-base leading-snug">Modo de Teste</p>
            <p className="text-sm text-muted-foreground mt-1">
              Este celular não está totalmente protegido contra interrupções.
            </p>
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-xl p-4 text-sm text-yellow-800 dark:text-yellow-300">
          Use apenas para teste. Em uma produção real, ligações e notificações podem interromper
          a câmera e avisar o diretor automaticamente.
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onApprove("demo")}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-yellow-500 text-white font-semibold text-sm active:scale-95 transition"
          >
            <AlertTriangle className="w-4 h-4" />
            Entrar mesmo assim (teste)
          </button>
          <button
            onClick={onBlock}
            className="w-full py-2.5 text-sm text-muted-foreground hover:text-destructive transition"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (step === "checking" || step === "approved" || step === "blocked") {
    return null; // transição tratada pelo useEffect
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/95 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-background rounded-2xl p-6 shadow-2xl border border-border">
        {step === "ios_focus"     && <IosGate />}
        {step === "android_perm"  && <AndroidGate />}
        {step === "demo_warning"  && <DemoWarning />}
      </div>
    </div>
  );
}
