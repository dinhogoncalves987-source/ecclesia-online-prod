/**
 * EcclesiaStudio — Central de produção multicâmeras da Ecclesia.
 *
 * Integra:
 *  - useLiveKitStudio: gerencia sala, participantes (LiveKit ou mock)
 *  - useObsWebSocket: controle OBS
 *  - ProgramMonitor: preview do que o público vê
 *  - CameraCard: preview de cada câmera
 *
 * Modos:
 *  - LIVEKIT: câmeras remotas via WebRTC (celulares, notebooks)
 *  - MOCK: câmeras locais do browser via getUserMedia
 *
 * UX: sem jargão técnico. O operador não precisa saber o que é WebRTC, LiveKit, RTMP.
 */

import { useState, useCallback } from "react";
import { Church, MapPin, Plus, Camera, Smartphone, Link2,
  X, RefreshCw, Radio, WifiOff, ExternalLink, Info, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { CameraCard } from "@/components/tv/CameraCard";
import { ProgramMonitor } from "@/components/tv/ProgramMonitor";
import { ObsStatusBadge } from "@/components/tv/ObsStatusBadge";
import { useLiveKitStudio } from "@/hooks/useLiveKitStudio";
import { useObsWebSocket } from "@/hooks/useObsWebSocket";
import { supabase } from "@/integrations/supabase/client";
import type { StudioParticipant } from "@/hooks/useLiveKitStudio";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type StudioMode = "temple" | "external";

const MODE_CONFIG: Record<StudioMode, { label: string; Icon: React.ElementType; desc: string; presets: string[] }> = {
  temple:   {
    label: "Templo",  Icon: Church,  desc: "Câmeras fixas dentro da igreja",
    presets: ["Pastor", "Nave Direita", "Nave Esquerda", "Altar", "Galeria", "Videomaker"],
  },
  external: {
    label: "Externo", Icon: MapPin,  desc: "Eventos, podcasts e coberturas externas",
    presets: ["Apresentador", "Convidado", "Plano Aberto", "Detalhe", "Entrevistador", "Câmera Extra"],
  },
};

interface Props {
  organizationId: string;
  channelId:      string;
  liveSessionId?: string | null;
  /** ID da sala de estúdio já criada (opcional — se não fornecido, o Studio cria uma). */
  studioRoomId?:  string;
  isLive:         boolean;
  isRecording:    boolean;
  viewerCount:    number;
  hlsUrl?:        string | null;
  /** device_id do operador atual (para identificar diretor vs câmera). */
  deviceId?:      string;
  /** Se true, este dispositivo é o diretor e pode fazer cortes. */
  isDirector?:    boolean;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function EcclesiaStudio({
  organizationId,
  channelId,
  liveSessionId,
  studioRoomId: initialRoomId,
  isLive,
  isRecording,
  viewerCount,
  hlsUrl,
  deviceId,
  isDirector = true,
}: Props) {
  const [mode, setMode]                   = useState<StudioMode>("temple");
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [newCamName, setNewCamName]       = useState("");
  const [newCamType, setNewCamType]       = useState<"local" | "remote">("local");
  const [showShareLink, setShowShareLink] = useState(false);
  const [copiedLink, setCopiedLink]       = useState(false);
  const [durationSec]                     = useState(0);  // gerenciado pelo pai (TvAoVivo)
  const [studioPrepState, setStudioPrepState] = useState<"idle" | "confirming" | "preparing" | "success" | "error">("idle");

  const { obs } = useObsWebSocket();

  // Buscar token de autenticação do Supabase
  const [authToken, setAuthToken]         = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  supabase.auth.getSession().then(({ data }) => {
    if (data.session?.access_token) setAuthToken(data.session.access_token);
  });

  const {
    roomInfo,
    activeCameras,
    onAirCamera,
    isConnected,
    isCreating,
    isMockMode,
    error,
    maxCameras,
    createStudioRoom,
    connectAsDirector,
    addMockCamera,
    cutToCamera,
    removeParticipant,
    endRoom,
    getCameraLink,
  } = useLiveKitStudio({
    organizationId,
    channelId,
    liveSessionId,
    initialRoomId,
    deviceId,
    authToken,
    enabled: !!channelId,
  });

  // ── Iniciar Studio ────────────────────────────────────────────────────────

  const handleCreateRoom = useCallback(async () => {
    const info = await createStudioRoom();
    if (!info) { toast.error("Erro ao criar sala de estúdio."); return; }
    await connectAsDirector(info.studioRoomId);
    toast.success("Estúdio pronto! Você é o diretor.");
  }, [createStudioRoom, connectAsDirector]);

  // ── Preparar computador ───────────────────────────────────────────────────

  async function handleStudioPrepare() {
    setStudioPrepState("preparing");
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      setStudioPrepState("success");
    } catch {
      setStudioPrepState("error");
    }
  }

  // ── Adicionar câmera ──────────────────────────────────────────────────────

  const handleAddCamera = useCallback(async () => {
    if (!roomInfo) { toast.error("Crie o estúdio primeiro."); return; }
    if (!newCamName.trim()) { toast.error("Informe o nome da câmera."); return; }
    if (activeCameras.length >= maxCameras) {
      toast.error(`Máximo de ${maxCameras} câmeras atingido.`); return;
    }

    if (newCamType === "local") {
      const participant = await addMockCamera(roomInfo.studioRoomId, newCamName.trim());
      if (participant) {
        toast.success(`Câmera "${newCamName.trim()}" conectada!`);
        setShowAddCamera(false);
        setNewCamName("");
      } else {
        toast.error("Não foi possível conectar a câmera.");
      }
    } else {
      // Remote: show the link
      setShowShareLink(true);
      setShowAddCamera(false);
    }
  }, [roomInfo, newCamName, newCamType, activeCameras.length, maxCameras, addMockCamera]);

  // ── Corte ao vivo ─────────────────────────────────────────────────────────

  const handleCutTo = useCallback(async (participantId: string) => {
    await cutToCamera(participantId);
  }, [cutToCamera]);

  // ── Copiar link de câmera ─────────────────────────────────────────────────

  function copyLink() {
    if (!roomInfo) return;
    const link = getCameraLink(roomInfo.studioRoomId);
    void navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  }

  // ── Grid de câmeras ───────────────────────────────────────────────────────

  const gridCols = activeCameras.length <= 2 ? "grid-cols-2"
    : activeCameras.length <= 4             ? "grid-cols-2 sm:grid-cols-4"
    : "grid-cols-3 sm:grid-cols-6";

  // ── Adapter: StudioParticipant → StudioCamera (compatível com CameraCard) ──

  function participantToCardCamera(p: StudioParticipant) {
    return {
      id:          p.id,
      name:        p.name,
      cameraType:  "local" as const,
      iconName:    "video",
      sortOrder:   0,
      stream:      p.stream ?? undefined,
      isOnAir:     p.isOnAir,
      status:      p.isOnAir ? ("on_air" as const) : p.stream ? ("connected" as const) : ("waiting" as const),
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Ecclesia Studio
            {isMockMode && (
              <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                Modo demonstração
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            {roomInfo
              ? `Sala ativa — ${isConnected ? (isDirector ? "Diretor conectado" : "Câmera conectada") : "Conectando..."}`
              : "Painel de câmeras e cortes ao vivo"}
          </p>
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-xl">
          {(Object.entries(MODE_CONFIG) as [StudioMode, typeof MODE_CONFIG[StudioMode]][]).map(([key, cfg]) => {
            const Icon = cfg.Icon;
            return (
              <button key={key} onClick={() => setMode(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  mode === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />{cfg.label}
              </button>
            );
          })}
        </div>

        {/* OBS badge compact */}
        <ObsStatusBadge obs={obs} compact />
      </div>

      {/* ── Mock mode notice ───────────────────────────────────────────── */}
      {isMockMode && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-700 dark:text-blue-300">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <p>
            <strong>LiveKit ainda não configurado.</strong> O Studio está em modo demonstração.
            Câmeras locais do computador são usadas. Para câmeras remotas (celulares),
            configure <code className="font-mono text-[10px]">VITE_LIVEKIT_URL</code> no ambiente.
          </p>
        </div>
      )}

      {/* ── Sem sala ativa: botão Criar ────────────────────────────────── */}
      {!roomInfo && (
        <div className="flex flex-col items-center justify-center py-10 gap-4 rounded-2xl border-2 border-dashed border-border">
          <Camera className="w-12 h-12 text-muted-foreground/20" />
          <div className="text-center">
            <p className="font-semibold text-muted-foreground">Studio não iniciado</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5 max-w-xs mx-auto">
              Inicie para gerenciar câmeras e fazer cortes ao vivo
            </p>
          </div>
          {isDirector && (
            <button
              onClick={() => void handleCreateRoom()}
              disabled={isCreating || !channelId}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {isCreating ? (
                <><RefreshCw className="w-4 h-4 animate-spin" />Preparando studio...</>
              ) : (
                <><Radio className="w-4 h-4" />Iniciar Ecclesia Studio</>
              )}
            </button>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {/* ── Studio ativo ───────────────────────────────────────────────── */}
      {roomInfo && (
        <>
          {/* Main layout: Monitor + OBS panel */}
          <div className="grid lg:grid-cols-[1fr_260px] gap-4">
            {/* Monitor PROGRAMA */}
            <ProgramMonitor
              onAirCamera={onAirCamera ? participantToCardCamera(onAirCamera) : null}
              isLive={isLive}
              isRecording={isRecording}
              durationSec={durationSec}
              viewerCount={viewerCount}
              hlsUrl={hlsUrl}
            />

            {/* Side panel */}
            <div className="flex flex-col gap-3">
              <ObsStatusBadge obs={obs} />

              {/* Studio offline hint */}
              {!obs.connected && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-xl text-xs text-yellow-700 dark:text-yellow-400 space-y-2">
                  {studioPrepState === "confirming" ? (
                    <>
                      <p className="font-medium">Preparar computador?</p>
                      <p>O Windows poderá pedir permissão para continuar.</p>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setStudioPrepState("idle")}
                          className="flex-1 py-1.5 rounded-lg border border-yellow-300 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-950/40 transition"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => void handleStudioPrepare()}
                          className="flex-1 py-1.5 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 transition font-medium"
                        >
                          Continuar
                        </button>
                      </div>
                    </>
                  ) : studioPrepState === "preparing" ? (
                    <div className="flex items-center gap-2 py-1">
                      <span className="w-3 h-3 border border-yellow-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      <span>Instalando componentes Ecclesia...</span>
                    </div>
                  ) : studioPrepState === "success" ? (
                    <p className="font-medium py-1">Computador preparado com sucesso.</p>
                  ) : studioPrepState === "error" ? (
                    <>
                      <p className="font-medium">Não foi possível preparar este computador.</p>
                      <p>Chame o suporte Ecclesia.</p>
                      <button
                        onClick={() => setStudioPrepState("idle")}
                        className="underline text-yellow-700 dark:text-yellow-400"
                      >
                        Tentar novamente
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">Preparar este computador</p>
                      <p>Este computador precisa ser preparado para usar os recursos do Ecclesia.</p>
                      <button
                        onClick={() => setStudioPrepState("confirming")}
                        className="w-full text-center py-1.5 rounded-lg border border-yellow-300 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-950/40 transition mt-1"
                      >
                        Preparar computador
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Studio info */}
              <div className="p-3 bg-muted/50 rounded-xl text-xs">
                <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  Modo {MODE_CONFIG[mode].label}
                </p>
                <p className="text-muted-foreground">{MODE_CONFIG[mode].desc}</p>
                {roomInfo && (
                  <p className="text-muted-foreground mt-1.5 font-mono text-[10px] truncate">
                    Sala: {roomInfo.roomName}
                  </p>
                )}
              </div>

              {/* Share camera link */}
              {roomInfo && (
                <div className="p-3 bg-muted/50 rounded-xl">
                  <p className="text-xs font-medium text-foreground mb-1">
                    Convidar câmera externa
                  </p>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Use apenas para convidados que não acessam pelo login.
                  </p>
                  <div className="flex gap-1.5">
                    <code className="flex-1 text-[10px] bg-background border border-border rounded-lg px-2 py-1.5 truncate font-mono text-muted-foreground">
                      {getCameraLink(roomInfo.studioRoomId).replace(window.location.origin, "")}
                    </code>
                    <button
                      onClick={copyLink}
                      className="p-1.5 hover:bg-muted rounded-lg transition flex-shrink-0"
                      title="Copiar link"
                    >
                      {copiedLink ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <a
                      href={roomInfo ? getCameraLink(roomInfo.studioRoomId) : "#"}
                      target="_blank" rel="noopener noreferrer"
                      className="p-1.5 hover:bg-muted rounded-lg transition flex-shrink-0"
                      title="Abrir link"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              )}

              {/* End room button */}
              <button
                onClick={() => { void endRoom(); }}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-500 text-xs hover:bg-red-50 dark:hover:bg-red-950/20 transition"
              >
                <WifiOff className="w-3.5 h-3.5" />
                Encerrar estúdio
              </button>
            </div>
          </div>

          {/* Camera grid */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-sm font-semibold flex items-center gap-2">
                Câmeras conectadas
                {activeCameras.length > 0 && (
                  <span className="text-xs text-muted-foreground">({activeCameras.length}/{maxCameras})</span>
                )}
              </p>

              {activeCameras.length < maxCameras && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setNewCamType("remote"); setShowAddCamera(true); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition"
                  >
                    <Smartphone className="w-3.5 h-3.5" />Celular
                  </button>
                  <button
                    onClick={() => { setNewCamType("local"); setShowAddCamera(true); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />Câmera
                  </button>
                </div>
              )}
            </div>

            {/* Empty state */}
            {activeCameras.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-3 rounded-xl border-2 border-dashed border-border">
                <Camera className="w-10 h-10 text-muted-foreground/20" />
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">Nenhuma câmera conectada</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Adicione uma câmera local ou compartilhe o link para celulares
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setNewCamType("local"); setShowAddCamera(true); }}
                    className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition"
                  >
                    Adicionar câmera
                  </button>
                  <button
                    onClick={copyLink}
                    className="px-3 py-2 rounded-lg border border-border text-xs hover:bg-muted transition flex items-center gap-1.5"
                  >
                    <Link2 className="w-3.5 h-3.5" />Copiar link celular
                  </button>
                </div>
              </div>
            )}

            {/* Camera grid */}
            {activeCameras.length > 0 && (
              <div className={`grid ${gridCols} gap-3`}>
                {activeCameras.map((p) => (
                  <CameraCard
                    key={p.id}
                    camera={participantToCardCamera(p)}
                    onCutTo={handleCutTo}
                    onSettings={(id) => removeParticipant(id).then(() => toast.success("Câmera removida"))}
                  />
                ))}
                {/* Empty slots */}
                {activeCameras.length < Math.min(maxCameras, activeCameras.length + 2) && (
                  Array.from({ length: Math.min(2, maxCameras - activeCameras.length) }).map((_, i) => (
                    <button
                      key={`empty-${i}`}
                      onClick={() => setShowAddCamera(true)}
                      className="aspect-video rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-primary"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="text-xs">Adicionar</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {activeCameras.length > 1 && (
              <p className="text-xs text-muted-foreground text-center mt-2.5">
                Toque em uma câmera para colocá-la no ar
              </p>
            )}
          </div>
        </>
      )}

      {/* ── Modal: Adicionar câmera ─────────────────────────────────────── */}
      {showAddCamera && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" />
                Adicionar câmera
              </h3>
              <button onClick={() => setShowAddCamera(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>

            <div className="space-y-3">
              {/* Type */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted rounded-xl">
                {([
                  { t: "local",  label: "Webcam/USB", Icon: Camera },
                  { t: "remote", label: "Celular",    Icon: Smartphone },
                ] as const).map(({ t, label, Icon }) => (
                  <button key={t} onClick={() => setNewCamType(t)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition ${
                      newCamType === t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4" />{label}
                  </button>
                ))}
              </div>

              {/* Name */}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Nome *</label>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={newCamName}
                  onChange={(e) => setNewCamName(e.target.value)}
                  placeholder={MODE_CONFIG[mode].presets[0]}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && void handleAddCamera()}
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {MODE_CONFIG[mode].presets.map((p) => (
                    <button key={p} onClick={() => setNewCamName(p)}
                      className="px-2 py-0.5 text-xs rounded-full border border-border hover:bg-muted transition"
                    >{p}</button>
                  ))}
                </div>
              </div>

              {newCamType === "remote" && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                  Após adicionar, um link será criado para compartilhar com o irmão do celular.
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAddCamera(false)} className="flex-1 border border-border rounded-lg py-2.5 text-sm">Cancelar</button>
              <button onClick={() => void handleAddCamera()} className="flex-1 bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:bg-primary/90 transition">
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: link compartilhado para câmera remota ─────────────────── */}
      {showShareLink && roomInfo && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" />
                Conectar celular
              </h3>
              <button onClick={() => setShowShareLink(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Envie este link pelo WhatsApp. A pessoa abre no celular e vira câmera automaticamente.
            </p>
            <div className="bg-muted rounded-xl p-3 mb-3">
              <p className="text-xs font-mono break-all text-muted-foreground">
                {getCameraLink(roomInfo.studioRoomId)}
              </p>
            </div>
            <button
              onClick={copyLink}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-medium hover:bg-primary/90 transition"
            >
              {copiedLink ? <><Check className="w-4 h-4" />Copiado!</> : <><Copy className="w-4 h-4" />Copiar link</>}
            </button>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              {isMockMode ? "Modo demonstração — câmera remota aparecerá quando LiveKit estiver configurado." : "O celular aparece nas câmeras ao abrir o link."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
