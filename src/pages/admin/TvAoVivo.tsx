/**
 * TvAoVivo — Central de produções ao vivo da TV Digital.
 *
 * Fluxo principal:
 *   1. Mostrar produções ativas da organização.
 *   2. Admin pode criar um novo programa ao vivo.
 *   3. O dispositivo que criou vira o administrador/diretor.
 *   4. Outros dispositivos entram automaticamente como câmeras.
 *   5. A distinção diretor/câmera é feita por device_id (não apenas user_id).
 *
 * Sem jargão técnico: o operador não precisa saber o que é room, token, RTMP ou LiveKit.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { TvAdminNav } from "@/components/tv/TvAdminNav";
import { EcclesiaStudio } from "@/components/tv/EcclesiaStudio";
import { useChurch } from "@/hooks/useChurchContext";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import {
  fetchTvChannels,
  listActiveLiveProductions,
  createLiveProduction,
  claimProductionDirector,
  endLiveProduction,
  isDirectorOnline,
  cutToProductionCamera,
  PRODUCTION_MODE_LABELS,
  type TvChannel,
  type LiveProduction,
  type ProductionMode,
} from "@/lib/tvDigital";
import { getOrCreateStudioDeviceId, getStudioDeviceLabel } from "@/lib/studioDevice";
import { requestFullscreenIfAndroid } from "@/lib/platformDetect";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useCameraFocus } from "@/hooks/useCameraFocus";
import { useVoiceActivityDetector } from "@/hooks/useVoiceActivityDetector";
import { RecordingModeGate, type CameraMode } from "@/components/tv/RecordingModeGate";
import { supabase } from "@/integrations/supabase/client";
import {
  Radio, Tv2, Plus, RefreshCw, Camera, Users, Clock,
  Smartphone, Monitor, ChevronRight, AlertTriangle, Info,
  PlayCircle, StopCircle, WifiOff, Wifi, Mic, MicOff,
} from "lucide-react";
import { toast } from "sonner";

// ── Tipos locais ───────────────────────────────────────────────────────────────

type ViewState =
  | "loading"
  | "no_channel"           // sem canal configurado
  | "list"                 // listagem de produções (0 ou mais)
  | "create_form"          // formulário de nova produção
  | "director"             // painel do diretor neste dispositivo
  | "camera";              // tela de câmera neste dispositivo

// ── Componente ────────────────────────────────────────────────────────────────

export default function TvAoVivo() {
  const { church }  = useChurch();
  const { user }    = useAuth();
  const { role }    = useRole();
  const orgId       = church?.id ?? "";

  const deviceId    = getOrCreateStudioDeviceId();
  const deviceLabel = getStudioDeviceLabel();

  const canCreateProduction = ["super_admin", "church_admin", "pastor", "secretary"].includes(role ?? "");

  const [view, setView]               = useState<ViewState>("loading");
  const [channels, setChannels]       = useState<TvChannel[]>([]);
  const [productions, setProductions] = useState<LiveProduction[]>([]);
  const [activeProduction, setActiveProduction] = useState<LiveProduction | null>(null);

  // Formulário de nova produção
  const [newTitle, setNewTitle]       = useState("");
  const [newChannelId, setNewChannelId] = useState("");
  const [newMode, setNewMode]         = useState<ProductionMode>("temple");
  const [creating, setCreating]       = useState(false);

  // Controle de "assumir direção"
  const [showClaimDirector, setShowClaimDirector] = useState(false);
  const [claiming, setClaiming]       = useState(false);
  const [ending, setEnding]           = useState(false);

  // ── Voz automática ───────────────────────────────────────────────────────────
  type SwitchingMode = "manual" | "auto_voice";
  const [switchingMode, setSwitchingMode] = useState<SwitchingMode>("manual");
  /** Timestamp até o qual a automação de voz está pausada (após clique manual). */
  const manualOverrideUntilRef  = useRef(0);
  /** device_id do falante que está com lock de 3s. */
  const activeSpeakerDeviceRef  = useRef<string | null>(null);
  const activeSpeakerLockedUntilRef = useRef(0);
  /** Indicadores de nível de áudio por device_id. */
  const [audioLevels, setAudioLevels] = useState<
    Record<string, { level: number; isSpeaking: boolean; ts: number }>
  >({});
  /** Mapa de device_id → { sessionId, cameraName } para corte automático. */
  const [camerasByDevice, setCamerasByDevice] = useState<
    Record<string, { sessionId: string; cameraName: string; isOnAir: boolean }>
  >({});
  const voiceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Polling de produções (quando não há produção ativa ou há várias)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Subscription de voz (diretor): ativa quando em modo director ──────────

  useEffect(() => {
    if (view !== "director" || !activeProduction?.liveSessionId) {
      if (voiceChannelRef.current) {
        void supabase.removeChannel(voiceChannelRef.current);
        voiceChannelRef.current = null;
      }
      return;
    }
    const lsId = activeProduction.liveSessionId;

    const ch = supabase
      .channel(`production:${lsId}`)
      .on("broadcast", { event: "speaking_detected" }, ({ payload }) => {
        const p = payload as { device_id?: string; live_session_id?: string; timestamp?: number };
        if (!p.device_id || p.live_session_id !== lsId) return;

        // ── Regra de ouro: manual > automação ──────────────────────────────
        if (switchingMode !== "auto_voice") return;
        const now = Date.now();
        if (now < manualOverrideUntilRef.current) return;

        // ── Lock de fala (prioridade de 3s) ─────────────────────────────────
        const currentLocked = activeSpeakerDeviceRef.current;
        if (currentLocked && currentLocked !== p.device_id && now < activeSpeakerLockedUntilRef.current) {
          return; // outro falante ainda tem prioridade
        }

        // ── Verificar se câmera está disponível e não está já no ar ─────────
        const cam = camerasByDevice[p.device_id];
        if (!cam || cam.isOnAir) return; // já no ar ou desconhecida

        // ── Cortar usando RPC atômica ─────────────────────────────────────
        activeSpeakerDeviceRef.current  = p.device_id;
        activeSpeakerLockedUntilRef.current = now + 3000;
        void cutToProductionCamera(cam.sessionId);
      })
      .on("broadcast", { event: "audio_level" }, ({ payload }) => {
        const p = payload as {
          device_id?: string; live_session_id?: string;
          level?: number; is_speaking?: boolean; timestamp?: number;
        };
        if (!p.device_id || p.live_session_id !== lsId) return;

        setAudioLevels((prev) => ({
          ...prev,
          [p.device_id!]: {
            level:      p.level     ?? 0,
            isSpeaking: p.is_speaking ?? false,
            ts:         p.timestamp ?? Date.now(),
          },
        }));

        // Atualizar mapa de câmeras ao mesmo tempo (para saber isOnAir)
        // Isso é feito separadamente abaixo via Realtime de postgres_changes
      })
      .subscribe();

    voiceChannelRef.current = ch;

    return () => {
      void supabase.removeChannel(ch);
      voiceChannelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeProduction?.liveSessionId, switchingMode]);

  // ── Limpar indicadores de áudio inativos (> 3s sem evento) ───────────────

  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 3000;
      setAudioLevels((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next)) {
          if (next[key].ts < cutoff) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Subscription de câmeras (para mapa device → session) ─────────────────

  useEffect(() => {
    if (view !== "director" || !activeProduction?.liveSessionId) return;
    const lsId = activeProduction.liveSessionId;

    // Carregar lista inicial de câmeras
    void supabase
      .from("tv_camera_sessions")
      .select("id, device_id, camera_name, is_on_air, status")
      .eq("live_session_id", lsId)
      .in("status", ["connected", "live", "waiting"])
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, { sessionId: string; cameraName: string; isOnAir: boolean }> = {};
        for (const row of data as Array<Record<string, unknown>>) {
          if (row.device_id) {
            map[String(row.device_id)] = {
              sessionId:  String(row.id),
              cameraName: String(row.camera_name ?? "Câmera"),
              isOnAir:    Boolean(row.is_on_air),
            };
          }
        }
        setCamerasByDevice(map);
      });

    // Subscrever a mudanças de câmeras
    const camCh = supabase
      .channel(`cam_map:${lsId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "tv_camera_sessions",
        filter: `live_session_id=eq.${lsId}`,
      }, (payload) => {
        const r = payload.new as Record<string, unknown> | null;
        if (!r?.device_id) return;
        if (payload.eventType === "DELETE" || String(r.status) === "disconnected" || String(r.status) === "error") {
          setCamerasByDevice((prev) => {
            const next = { ...prev };
            delete next[String(r.device_id)];
            return next;
          });
        } else {
          setCamerasByDevice((prev) => ({
            ...prev,
            [String(r.device_id)]: {
              sessionId:  String(r.id),
              cameraName: String(r.camera_name ?? "Câmera"),
              isOnAir:    Boolean(r.is_on_air),
            },
          }));
        }
      })
      .subscribe();

    return () => { void supabase.removeChannel(camCh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeProduction?.liveSessionId]);

  // ── Carregar dados iniciais ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!orgId) return;
    const [chs, prodsResult] = await Promise.all([
      fetchTvChannels(orgId),
      listActiveLiveProductions(orgId),
    ]);
    setChannels(chs);
    if (chs.length > 0 && !newChannelId) {
      setNewChannelId(chs[0].id);
    }
    if (!prodsResult.ok) {
      setView(chs.length === 0 ? "no_channel" : "list");
      return;
    }
    const prods = prodsResult.productions;
    setProductions(prods);

    if (chs.length === 0) { setView("no_channel"); return; }

    // Verificar se este dispositivo já é o diretor de alguma produção
    const myDirectedProd = prods.find(
      (p) => p.directorDeviceId === deviceId,
    );
    if (myDirectedProd) {
      setActiveProduction(myDirectedProd);
      setView("director");
      return;
    }

    setView("list");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, deviceId]);

  useEffect(() => {
    setView("loading");
    void loadData();
  }, [loadData]);

  // ── Polling leve enquanto na listagem ────────────────────────────────────────

  useEffect(() => {
    if (view === "list" || view === "loading") {
      pollRef.current = setInterval(() => { void loadData(); }, 5_000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [view, loadData]);

  // ── Realtime: atualizar lista quando há INSERT/UPDATE em tv_live_sessions ────

  useEffect(() => {
    if (!orgId) return;
    const ch = supabase
      .channel(`tv_ao_vivo_org:${orgId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "tv_live_sessions",
        filter: `organization_id=eq.${orgId}`,
      }, () => { void loadData(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [orgId, loadData]);

  // ── Criar nova produção ──────────────────────────────────────────────────────

  async function handleCreate() {
    if (!newTitle.trim()) { toast.error("Informe o nome do programa."); return; }
    if (!newChannelId) { toast.error("Selecione o canal."); return; }
    if (!orgId) { toast.error("Organização não encontrada."); return; }
    setCreating(true);
    try {
      const result = await createLiveProduction(orgId, {
        channelId:        newChannelId,
        title:            newTitle.trim(),
        mode:             newMode,
        directorDeviceId: deviceId,
      });
      if (!result.ok) {
        console.error("[handleCreate] error:", result.error);
        toast.error(`Erro ao criar programa: ${result.error ?? ""}`);
        return;
      }
      toast.success(`Programa "${newTitle.trim()}" criado!`);
      setNewTitle("");
      setView("loading");
      await loadData();
    } catch (err) {
      console.error("[handleCreate] unexpected:", err);
      toast.error("Erro inesperado ao criar programa.");
    } finally {
      setCreating(false);
    }
  }

  // ── Assumir direção ───────────────────────────────────────────────────────────

  async function handleClaimDirector(production: LiveProduction, force = false) {
    setClaiming(true);
    try {
      const result = await claimProductionDirector(production.liveSessionId, deviceId, force);
      if (!result.ok) {
        if (!force) {
          setShowClaimDirector(true);
          setClaiming(false);
          return;
        }
        toast.error(result.error ?? result.message ?? "Não foi possível assumir a direção.");
        setClaiming(false);
        return;
      }
      setActiveProduction({ ...production, directorDeviceId: deviceId });
      setView("director");
    } catch (err) {
      console.error("[handleClaimDirector]", err);
      toast.error("Erro inesperado ao assumir direção.");
    } finally {
      setClaiming(false);
    }
  }

  // ── Encerrar produção ─────────────────────────────────────────────────────────

  /** Chamado quando o diretor clica manualmente em uma câmera para corte.
   *  Pausa a automação de voz por 5 segundos. */
  function triggerManualOverride() {
    manualOverrideUntilRef.current = Date.now() + 5000;
  }

  async function handleEnd(production: LiveProduction) {
    setEnding(true);
    try {
      const result = await endLiveProduction(production.liveSessionId, deviceId);
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível encerrar o programa.");
        return;
      }
      toast.success("Programa encerrado.");
      setView("loading");
      await loadData();
    } catch (err) {
      console.error("[handleEnd]", err);
      toast.error("Erro inesperado ao encerrar.");
    } finally {
      setEnding(false);
    }
  }

  // ── Entrar como câmera ────────────────────────────────────────────────────────

  function handleEnterAsCamera(production: LiveProduction) {
    setActiveProduction(production);
    setView("camera");
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  function directorOnlineStatus(p: LiveProduction) {
    return isDirectorOnline(p.directorLastSeenAt);
  }

  function myRoleInProduction(p: LiveProduction): "director" | "camera" | "none" {
    if (p.directorDeviceId === deviceId) return "director";
    return "none"; // we don't track camera sessions here
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Radio className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Ao Vivo</h1>
              <p className="text-sm text-muted-foreground">
                {deviceLabel} · {user?.email?.split("@")[0]}
              </p>
            </div>
          </div>
          {view !== "loading" && (
            <button
              onClick={() => { setView("loading"); void loadData(); }}
              className="p-2 hover:bg-muted rounded-lg transition text-muted-foreground"
              title="Atualizar"
            >
              <RefreshCw className={`w-4 h-4 ${view === "loading" ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        <TvAdminNav />

        {/* ── Carregando ── */}
        {view === "loading" && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ── Sem canal ── */}
        {view === "no_channel" && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Tv2 className="w-16 h-16 text-muted-foreground/20" />
            <p className="text-lg font-semibold text-muted-foreground">Nenhum canal configurado</p>
            <p className="text-sm text-muted-foreground/60 max-w-sm">
              Crie um canal de TV nas Configurações para poder transmitir ao vivo.
            </p>
            <a
              href="/admin/tv/configuracoes"
              className="mt-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
            >
              Ir para Configurações
            </a>
          </div>
        )}

        {/* ── Lista de produções ── */}
        {view === "list" && (
          <div className="space-y-4">

            {/* Formulário: criar produção */}
            {view === "list" && canCreateProduction && (
              <div className="flex justify-end">
                <button
                  onClick={() => setView("create_form")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
                >
                  <Plus className="w-4 h-4" />
                  Criar programa ao vivo
                </button>
              </div>
            )}

            {/* Sem produções ativas */}
            {productions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-2xl border-2 border-dashed border-border">
                <Radio className="w-14 h-14 text-muted-foreground/20" />
                <div className="text-center">
                  <p className="text-lg font-semibold text-muted-foreground">
                    Nenhuma produção ao vivo ativa
                  </p>
                  {canCreateProduction ? (
                    <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs mx-auto">
                      Crie um programa para começar a transmitir.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs mx-auto">
                      Aguarde o administrador iniciar um programa ao vivo.
                    </p>
                  )}
                </div>
                {canCreateProduction && (
                  <button
                    onClick={() => setView("create_form")}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
                  >
                    <Plus className="w-4 h-4" />
                    Criar programa ao vivo
                  </button>
                )}
              </div>
            )}

            {/* Produções ativas */}
            {productions.length > 0 && (
              <div className="space-y-3">
                {productions.length > 1 && (
                  <p className="text-sm text-muted-foreground font-medium">
                    {productions.length} produções em andamento — escolha em qual deseja entrar:
                  </p>
                )}

                {productions.map((prod) => {
                  const myRole     = myRoleInProduction(prod);
                  const dirOnline  = directorOnlineStatus(prod);
                  const ch         = channels.find((c) => c.id === prod.channelId);

                  return (
                    <div
                      key={prod.liveSessionId}
                      className="bg-card border border-border rounded-2xl p-4 space-y-3"
                    >
                      {/* Cabeçalho da produção */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                              prod.statusTransmissao === "live"
                                ? "bg-red-600 text-white"
                                : "bg-yellow-500 text-black"
                            }`}>
                              {prod.statusTransmissao === "live" ? "AO VIVO" : "PREPARANDO"}
                            </span>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                              {PRODUCTION_MODE_LABELS[prod.mode]}
                            </span>
                          </div>
                          <h3 className="text-base font-semibold mt-1">{prod.title}</h3>
                          <p className="text-xs text-muted-foreground">
                            {ch?.name ?? prod.channelName}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5" />
                            {prod.cameraCount}/6
                          </span>
                          {prod.startedAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {Math.floor(
                                (Date.now() - new Date(prod.startedAt).getTime()) / 60000,
                              )}min
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Diretor */}
                      <div className="flex items-center gap-2 text-xs">
                        <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                        {prod.directorDeviceId ? (
                          <span className={`flex items-center gap-1.5 ${dirOnline ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"}`}>
                            {dirOnline ? (
                              <><Wifi className="w-3 h-3" /> Diretor conectado</>
                            ) : (
                              <><WifiOff className="w-3 h-3" /> Diretor offline</>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Sem diretor ativo</span>
                        )}
                      </div>

                      {/* Ações */}
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                        {myRole === "director" && (
                          <button
                            onClick={() => { setActiveProduction(prod); setView("director"); }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
                          >
                            <Radio className="w-3.5 h-3.5" />
                            Abrir painel de direção
                          </button>
                        )}

                        {myRole !== "director" && (
                          <button
                            onClick={() => handleEnterAsCamera(prod)}
                            disabled={prod.cameraCount >= 6}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            {prod.cameraCount >= 6 ? "Câmeras lotadas" : "Entrar como câmera"}
                          </button>
                        )}

                        {canCreateProduction && myRole !== "director" && (
                          <button
                            onClick={() => void handleClaimDirector(prod)}
                            disabled={claiming}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition disabled:opacity-50"
                          >
                            {claiming ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            Assumir direção
                          </button>
                        )}

                        {canCreateProduction && (
                          <button
                            onClick={() => void handleEnd(prod)}
                            disabled={ending}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-500 text-sm hover:bg-red-50 dark:hover:bg-red-950/20 transition disabled:opacity-50 ml-auto"
                          >
                            <StopCircle className="w-3.5 h-3.5" />
                            {ending ? "Encerrando..." : "Encerrar"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Formulário: criar programa ── */}
        {view === "create_form" && (
          <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Novo programa ao vivo</h2>
            </div>

            {/* Nome */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Nome do programa *
              </label>
              <input
                autoFocus
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Culto de Domingo, Podcast com Pastor Paulo..."
                disabled={creating}
                onKeyDown={(e) => e.key === "Enter" && !creating && void handleCreate()}
              />
            </div>

            {/* Canal */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Canal
              </label>
              <select
                className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-background"
                value={newChannelId}
                onChange={(e) => setNewChannelId(e.target.value)}
                disabled={creating}
              >
                {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Modo */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Tipo de produção
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted rounded-xl">
                {(Object.entries(PRODUCTION_MODE_LABELS) as [ProductionMode, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setNewMode(key)}
                    disabled={creating}
                    className={`py-2 rounded-lg text-xs font-medium transition ${
                      newMode === key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Aviso dispositivo */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-700 dark:text-blue-300">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <p>
                Este dispositivo (<strong>{deviceLabel}</strong>) será o <strong>administrador</strong> desta produção.
                Os outros dispositivos poderão entrar como câmeras.
              </p>
            </div>

            {/* Botões */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setView("list")}
                disabled={creating}
                className="flex-1 border border-border rounded-lg py-2.5 text-sm disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleCreate()}
                disabled={creating || !newTitle.trim()}
                className="flex-1 bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
              >
                {creating ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Criando...
                  </span>
                ) : (
                  "Criar e assumir direção"
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Painel do diretor ── */}
        {view === "director" && activeProduction && (
          <div className="space-y-4">
            {/* Info da produção */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-card border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  activeProduction.statusTransmissao === "live"
                    ? "bg-red-600 text-white"
                    : "bg-yellow-500 text-black"
                }`}>
                  {activeProduction.statusTransmissao === "live" ? "AO VIVO" : "PREPARANDO"}
                </span>
                <span className="font-semibold text-sm">{activeProduction.title}</span>
                <span className="text-xs text-muted-foreground">
                  {channels.find((c) => c.id === activeProduction.channelId)?.name ?? activeProduction.channelName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <Wifi className="w-3.5 h-3.5" />
                  Você é o diretor
                </span>
                <button
                  onClick={() => void handleEnd(activeProduction)}
                  disabled={ending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-500 text-xs hover:bg-red-50 dark:hover:bg-red-950/20 transition disabled:opacity-50"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  {ending ? "Encerrando..." : "Encerrar programa"}
                </button>
              </div>
            </div>

            {/* Ecclesia Studio */}
            <EcclesiaStudio
              organizationId={orgId}
              channelId={activeProduction.channelId}
              liveSessionId={activeProduction.liveSessionId}
              studioRoomId={activeProduction.studioRoomId ?? undefined}
              isLive={activeProduction.statusTransmissao === "live"}
              isRecording={false}
              viewerCount={0}
              hlsUrl={null}
              deviceId={deviceId}
              isDirector
              onCutToCamera={() => triggerManualOverride()}
            />

            {/* ── Controle de comutação: Manual / Voz automática ── */}
            <VoiceSwitchingPanel
              switchingMode={switchingMode}
              onToggle={(mode) => setSwitchingMode(mode)}
              manualOverrideUntilRef={manualOverrideUntilRef}
            />

            {/* ── Indicadores de nível de áudio por câmera ── */}
            {Object.keys(audioLevels).length > 0 && (
              <AudioLevelMonitor
                audioLevels={audioLevels}
                camerasByDevice={camerasByDevice}
              />
            )}

            {/* Voltar à listagem */}
            <button
              onClick={() => { setActiveProduction(null); setView("loading"); void loadData(); }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              ← Voltar para todas as produções
            </button>
          </div>
        )}

        {/* ── Tela de câmera (inline no admin) ── */}
        {view === "camera" && activeProduction && (
          <CameraView
            production={activeProduction}
            deviceId={deviceId}
            deviceLabel={deviceLabel}
            onLeave={() => { setActiveProduction(null); setView("loading"); void loadData(); }}
          />
        )}

        {/* ── Modal: Assumir direção ── */}
        {showClaimDirector && activeProduction && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm shadow-2xl">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold">Assumir direção</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Esta produção já possui um administrador ativo.
                    Deseja assumir a direção desta produção neste dispositivo?
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowClaimDirector(false)}
                  className="flex-1 border border-border rounded-lg py-2.5 text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    setShowClaimDirector(false);
                    await handleClaimDirector(activeProduction!, true);
                  }}
                  disabled={claiming}
                  className="flex-1 bg-yellow-500 text-black rounded-lg py-2.5 text-sm font-medium hover:bg-yellow-600 transition disabled:opacity-50"
                >
                  {claiming ? "Assumindo..." : "Assumir direção"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}

// ── Componente: Painel de comutação por voz ───────────────────────────────────

interface VoiceSwitchingPanelProps {
  switchingMode: "manual" | "auto_voice";
  onToggle: (mode: "manual" | "auto_voice") => void;
  manualOverrideUntilRef: React.MutableRefObject<number>;
}

function VoiceSwitchingPanel({ switchingMode, onToggle, manualOverrideUntilRef }: VoiceSwitchingPanelProps) {
  const [overridePaused, setOverridePaused] = useState(false);

  // Verificar se a pausa manual ainda está ativa
  useEffect(() => {
    const id = setInterval(() => {
      setOverridePaused(Date.now() < manualOverrideUntilRef.current);
    }, 500);
    return () => clearInterval(id);
  }, [manualOverrideUntilRef]);

  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Comutação de câmera</span>
        {overridePaused && switchingMode === "auto_voice" && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
            Automação em pausa manual
          </span>
        )}
      </div>

      {/* Toggle Manual / Voz automática */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
        <button
          onClick={() => onToggle("manual")}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition ${
            switchingMode === "manual"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Monitor className="w-3.5 h-3.5" />
          Manual
        </button>
        <button
          onClick={() => onToggle("auto_voice")}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition ${
            switchingMode === "auto_voice"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          Voz automática
        </button>
      </div>

      {/* Descrição do modo */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {switchingMode === "manual"
          ? "Ideal para cultos, eventos e grandes reuniões, com controle total do diretor."
          : "Recomendado para formatos controlados, como podcasts, entrevistas e salas fechadas."}
      </p>
    </div>
  );
}

// ── Componente: Monitor de nível de áudio ─────────────────────────────────────

interface AudioLevelMonitorProps {
  audioLevels: Record<string, { level: number; isSpeaking: boolean; ts: number }>;
  camerasByDevice: Record<string, { sessionId: string; cameraName: string; isOnAir: boolean }>;
}

function AudioLevelMonitor({ audioLevels, camerasByDevice }: AudioLevelMonitorProps) {
  const entries = Object.entries(audioLevels)
    .map(([deviceId, data]) => ({
      deviceId,
      ...data,
      cameraName: camerasByDevice[deviceId]?.cameraName ?? deviceId.slice(-6),
      isOnAir:    camerasByDevice[deviceId]?.isOnAir ?? false,
    }))
    .sort((a, b) => b.level - a.level)
    .slice(0, 6); // máx 6 câmeras

  if (entries.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-2">
      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <Mic className="w-3.5 h-3.5 text-muted-foreground" />
        Monitoramento de voz
      </span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {entries.map(({ deviceId, level, isSpeaking, cameraName, isOnAir }) => (
          <div key={deviceId} className="flex items-center gap-2 min-w-0">
            {/* Ícone de microfone */}
            {isSpeaking
              ? <Mic className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />
              : <MicOff className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/40" />}
            {/* Nome e barra */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground truncate leading-none mb-1">
                {cameraName}
                {isOnAir && (
                  <span className="ml-1 text-red-500 font-bold">●</span>
                )}
              </p>
              {/* Barra de volume */}
              <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-150 ${
                    isSpeaking ? "bg-green-500" : "bg-muted-foreground/30"
                  }`}
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Componente inline: Tela de câmera no admin ────────────────────────────────

import {
  joinProductionAsCamera,
  leaveProductionCamera,
  cameraHeartbeat,
  type LiveProduction as LP,
} from "@/lib/tvDigital";

interface CameraViewProps {
  production:  LP;
  deviceId:    string;
  deviceLabel: string;
  onLeave:     () => void;
}

function CameraView({ production, deviceId, deviceLabel, onLeave }: CameraViewProps) {
  const [cameraMode, setCameraMode]   = useState<CameraMode | null>(null);
  const [status, setStatus]           = useState<"gate" | "idle" | "entering" | "connected" | "error">("gate");
  const [sessionId, setSessionId]     = useState<string | null>(null);
  const [isOnAir, setIsOnAir]         = useState(false);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [stream, setStream]           = useState<MediaStream | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isActive = status === "connected";

  // Wake Lock: mantém tela acesa enquanto câmera conectada
  useWakeLock(isActive);

  // Focus detection: detecta perda de foco → alerta diretor
  useCameraFocus({
    sessionId,
    liveSessionId: production.liveSessionId,
    active: isActive,
    isOnAir,
    onInterrupted: () => setInterrupted(true),
    onResumed:     () => setInterrupted(false),
  });

  // Sensor de voz: emite speaking_detected / audio_level ao canal da produção.
  // Nunca grava nem envia áudio bruto — apenas análise local de volume.
  useVoiceActivityDetector({
    stream,
    liveSessionId: production.liveSessionId,
    deviceId,
    active: isActive,
  });

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (realtimeRef.current) void supabase.removeChannel(realtimeRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGateApprove(mode: CameraMode) {
    setCameraMode(mode);
    setStatus("idle");
    if (mode === "official") void requestFullscreenIfAndroid();
  }

  function handleGateBlock() {
    onLeave();
  }

  async function handleJoin() {
    setStatus("entering");
    setErrorMsg(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      setStream(s);
    } catch {
      setErrorMsg("Câmera não disponível. Verifique as permissões do navegador.");
      setStatus("error");
      return;
    }

    const result = await joinProductionAsCamera(production.liveSessionId, {
      deviceId,
      cameraName: deviceLabel,
      deviceType: "browser",
      sourceType: "logged_device",
    });

    if (!result.ok) {
      setErrorMsg(result.error ?? "Não foi possível entrar como câmera.");
      setStatus("error");
      return;
    }

    const sid = result.cameraSessionId!;
    setSessionId(sid);

    const ch = supabase
      .channel(`cam_session:${sid}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "tv_camera_sessions",
        filter: `id=eq.${sid}`,
      }, (payload) => {
        const r = payload.new as Record<string, unknown>;
        setIsOnAir(Boolean(r.is_on_air));
      })
      .subscribe();
    realtimeRef.current = ch;

    heartbeatRef.current = setInterval(() => {
      void cameraHeartbeat(sid);
    }, 15_000);

    setStatus("connected");
    toast.success(`Câmera conectada como "${result.cameraNumber ? `Câmera ${result.cameraNumber}` : deviceLabel}"`);
  }

  async function handleLeave() {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (realtimeRef.current) { void supabase.removeChannel(realtimeRef.current); realtimeRef.current = null; }
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    if (sessionId) await leaveProductionCamera(sessionId);
    onLeave();
  }

  return (
    <div className="space-y-4">
      {/* Gate obrigatório (modal fullscreen) */}
      {status === "gate" && (
        <RecordingModeGate onApprove={handleGateApprove} onBlock={handleGateBlock} />
      )}

      {/* Info da produção */}
      <div className="flex items-center justify-between gap-2 bg-card border border-border rounded-xl p-3">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{production.channelName}</p>
          <p className="font-semibold text-sm">{production.title}</p>
        </div>
        {isActive && (
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
            isOnAir ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"
          }`}>
            {isOnAir ? <><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />NO AR</> : "Conectado"}
          </span>
        )}
      </div>

      {/* Banner modo de teste */}
      {cameraMode === "demo" && isActive && (
        <div className="flex items-center gap-2 bg-yellow-100 dark:bg-yellow-950/20 border border-yellow-300 dark:border-yellow-800 rounded-xl p-3 text-xs text-yellow-800 dark:text-yellow-400">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Modo de teste — câmera não protegida contra interrupções
        </div>
      )}

      {/* Banner de câmera interrompida */}
      {interrupted && isActive && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Câmera interrompida — o diretor foi avisado
        </div>
      )}

      {/* Preview de câmera */}
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
        <video
          ref={videoRef}
          autoPlay muted playsInline
          className={`w-full h-full object-cover ${stream ? "block" : "hidden"}`}
        />
        {!stream && status !== "gate" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera className="w-8 h-8 text-gray-700" />
          </div>
        )}
        {isOnAir && (
          <div className="absolute inset-0 border-4 border-green-500 pointer-events-none rounded-xl" />
        )}
      </div>

      {/* Controles */}
      {status === "idle" && (
        <button
          onClick={() => void handleJoin()}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition"
        >
          <Camera className="w-5 h-5" />
          Entrar como câmera
        </button>
      )}
      {status === "entering" && (
        <div className="flex items-center justify-center gap-2 py-3.5">
          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Conectando câmera...</span>
        </div>
      )}
      {status === "error" && errorMsg && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3 text-sm text-red-600 dark:text-red-400">
          {errorMsg}
        </div>
      )}
      {isActive && (
        <div className={`flex items-center justify-center gap-2 py-3 rounded-xl ${
          isOnAir ? "bg-green-600/20 border border-green-600/50" : "bg-muted"
        }`}>
          <Radio className={`w-4 h-4 ${isOnAir ? "text-green-500" : "text-muted-foreground"}`} />
          <span className={`text-sm font-medium ${isOnAir ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
            {isOnAir ? "Você está NO AR" : "Câmera conectada — aguardando o diretor"}
          </span>
        </div>
      )}
      <button
        onClick={() => void handleLeave()}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition"
      >
        <WifiOff className="w-4 h-4" />
        Sair desta produção
      </button>
    </div>
  );
}
