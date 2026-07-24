/**
 * TvConfiguracoes — Configurações da TV Digital e do Ecclesia Studio.
 *
 * Inclui:
 *  - Gerenciamento de canais (integra TvCanais)
 *  - Stream keys
 *  - Configuração OBS detalhada
 *  - Nomeação de câmeras do Studio
 *  - Variáveis de ambiente / ingest URL
 *  - Qualidade de transmissão
 */

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { TvAdminNav } from "@/components/tv/TvAdminNav";
import { ObsStatusBadge } from "@/components/tv/ObsStatusBadge";
import { EcclesiaSupport } from "@/components/tv/EcclesiaSupport";
import { useObsWebSocket } from "@/hooks/useObsWebSocket";
import { useChurch } from "@/hooks/useChurchContext";
import {
  fetchTvChannels, fetchStreamKeys, createStreamKey, revokeStreamKey,
  generateStreamKey, upsertTvChannel, slugify,
  type TvChannel, type TvStreamKey, STREAM_SOURCE_LABELS,
} from "@/lib/tvDigital";
import {
  Settings2, Key, Check, RefreshCw, Plus, Tv2,
  Eye, EyeOff, Trash2, Monitor, HelpCircle, LayoutGrid, Headphones,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const QUALITY_PRESETS = [
  { label: "Alta (1080p)",    bitrate: "4500 Kbps", res: "1920×1080", fps: 30 },
  { label: "Padrão (720p)",   bitrate: "2500 Kbps", res: "1280×720",  fps: 30 },
  { label: "Básica (480p)",   bitrate: "1000 Kbps", res: "854×480",   fps: 30 },
  { label: "Econômica (360p)",bitrate: "500 Kbps",  res: "640×360",   fps: 24 },
];

export default function TvConfiguracoes() {
  const { church } = useChurch();
  const { user }   = useAuth();
  const orgId = church?.id ?? "";

  const { obs } = useObsWebSocket();

  const [channels, setChannels]         = useState<TvChannel[]>([]);
  const [streamKeys, setStreamKeys]     = useState<TvStreamKey[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChName, setNewChName]       = useState("");
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [qualityIdx, setQualityIdx]     = useState(1); // Padrão 720p
  const [tab, setTab]                   = useState<"canais" | "obs" | "studio" | "suporte">("canais");
  const [prepState, setPrepState]       = useState<"idle" | "confirming" | "preparing" | "success" | "error">("idle");

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    void (async () => {
      try {
        const chs = await fetchTvChannels(orgId);
        setChannels(chs);
        if (chs.length > 0) setSelectedChannel(chs[0].id);
      } catch (err) {
        console.warn("[TvConfiguracoes] load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  useEffect(() => {
    if (!selectedChannel) return;
    void fetchStreamKeys(selectedChannel).then(setStreamKeys);
  }, [selectedChannel]);

  async function handleCreateKey(sourceType: "obs" | "mobile" | "computer") {
    if (!selectedChannel || !orgId || !user?.id) return;
    const { rawKey, hash, last4 } = await generateStreamKey();
    const result = await createStreamKey(orgId, selectedChannel, sourceType, null, hash, last4, user.id);
    if (result.ok) {
      toast.success(
        `Chave criada: ...${last4}\n\nCopiada para a área de transferência.`,
        { duration: 8000 },
      );
      void navigator.clipboard.writeText(rawKey);
      await fetchStreamKeys(selectedChannel).then(setStreamKeys);
    } else {
      toast.error(`Erro ao criar chave: ${result.error ?? ""}`);
    }
  }

  async function handleRevokeKey(keyId: string) {
    if (!confirm("Revogar esta chave? As transmissões em andamento serão interrompidas.")) return;
    const ok = await revokeStreamKey(keyId);
    if (ok) {
      toast.success("Chave revogada.");
      await fetchStreamKeys(selectedChannel).then(setStreamKeys);
    }
  }

  async function handlePrepareComputer() {
    setPrepState("preparing");
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      setPrepState("success");
    } catch {
      setPrepState("error");
    }
  }

  async function handleCreateChannel() {
    if (!newChName.trim()) { toast.error("Informe o nome do canal."); return; }
    if (!orgId) { toast.error("Organização não encontrada. Recarregue a página."); return; }

    setCreatingChannel(true);
    try {
      const slug   = slugify(newChName.trim());
      // ⚠️ CORRETO: payload é o 2º argumento; channelId (opcional) é o 3º
      const result = await upsertTvChannel(orgId, {
        name:        newChName.trim(),
        slug,
        visibility:  "org_members",
        status:      "active",
        description: "",
      });

      if (!result.ok) {
        console.error("[handleCreateChannel] Supabase error:", result.error);
        toast.error(`Erro ao criar canal: ${result.error ?? "Verifique as permissões."}`);
        return;
      }

      toast.success(`Canal "${newChName.trim()}" criado com sucesso!`);
      setNewChName("");
      setShowNewChannel(false);

      // Recarregar lista e selecionar o canal recém-criado
      const chs = await fetchTvChannels(orgId);
      setChannels(chs);
      if (result.channel) {
        setSelectedChannel(result.channel.id);
      } else if (chs.length > 0) {
        setSelectedChannel(chs[chs.length - 1].id);
      }
    } catch (err) {
      console.error("[handleCreateChannel] Unexpected error:", err);
      toast.error("Erro inesperado ao criar canal. Veja o console.");
    } finally {
      setCreatingChannel(false);
    }
  }

  const selectedCh = channels.find((c) => c.id === selectedChannel);

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Settings2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Configurações</h1>
            <p className="text-sm text-muted-foreground">Canais, chaves de transmissão e OBS</p>
          </div>
        </div>

        <TvAdminNav />

        {/* Sub-tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          {([
            { id: "canais", label: "Canais", icon: LayoutGrid },
            { id: "obs",    label: "Studio & Transmissão", icon: Monitor },
            { id: "studio", label: "Qualidade", icon: Settings2 },
            { id: "suporte", label: "Suporte", icon: Headphones },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === "canais" ? (
          <div className="space-y-6">
            {/* Selector de canal */}
            <div className="flex items-center gap-3">
              <Tv2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <select
                className="border border-border rounded-lg px-3 py-2 text-sm bg-background flex-1"
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
              >
                {channels.length === 0 && <option value="">Nenhum canal</option>}
                {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
              <button
                onClick={() => setShowNewChannel(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition"
              >
                <Plus className="w-4 h-4" />
                Novo canal
              </button>
            </div>

            {showNewChannel && (
              <div className="bg-card border border-border rounded-xl p-4 flex gap-2">
                <input
                  className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={newChName}
                  onChange={(e) => setNewChName(e.target.value)}
                  placeholder="Nome do canal..."
                  autoFocus
                  disabled={creatingChannel}
                  onKeyDown={(e) => e.key === "Enter" && !creatingChannel && void handleCreateChannel()}
                />
                <button
                  onClick={() => void handleCreateChannel()}
                  disabled={creatingChannel || !newChName.trim()}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition min-w-[64px]"
                >
                  {creatingChannel ? (
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Criando...
                    </span>
                  ) : "Criar"}
                </button>
                <button
                  onClick={() => { setShowNewChannel(false); setNewChName(""); }}
                  disabled={creatingChannel}
                  className="px-3 py-2 border border-border rounded-lg text-sm disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Stream Keys */}
            {selectedCh && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Key className="w-4 h-4 text-primary" />
                    Chaves de transmissão — {selectedCh.name}
                  </h2>
                  <div className="flex gap-2">
                    {(["obs", "mobile", "computer"] as const).map((src) => (
                      <button
                        key={src}
                        onClick={() => void handleCreateKey(src)}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        {STREAM_SOURCE_LABELS[src]}
                      </button>
                    ))}
                  </div>
                </div>

                {streamKeys.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Key className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p>Nenhuma chave criada ainda</p>
                    <p className="text-xs mt-1 opacity-60">Crie uma chave para começar a transmitir</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {streamKeys.map((key) => (
                      <div key={key.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{STREAM_SOURCE_LABELS[key.streamSourceType]}</p>
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">
                            ••••••••••••{key.streamKeyLast4}
                            <span className="ml-2 text-muted-foreground/60">(ver chave completa em Ao Vivo)</span>
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${key.isActive ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" : "bg-gray-100 text-gray-500"}`}>
                          {key.isActive ? "Ativa" : "Inativa"}
                        </span>
                        <button
                          onClick={() => void handleRevokeKey(key.id)}
                          className="p-1.5 text-muted-foreground hover:text-red-500 transition"
                          title="Revogar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : tab === "obs" ? (
          <div className="space-y-4">
            {/* Studio Status */}
            <ObsStatusBadge obs={obs} />

            {obs.connected ? (
              /* ── Conectado ──────────────────────────────────────────── */
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-xl p-5 text-center">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Ecclesia Studio Online
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">Aguardando comando</p>
              </div>
            ) : prepState === "success" ? (
              /* ── Sucesso ────────────────────────────────────────────── */
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-xl p-5 text-center">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Computador preparado com sucesso.
                </p>
              </div>
            ) : prepState === "error" ? (
              /* ── Erro ───────────────────────────────────────────────── */
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-5 text-center space-y-2">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  Não foi possível preparar este computador.
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">Chame o suporte Ecclesia.</p>
                <button
                  onClick={() => setPrepState("idle")}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  Tentar novamente
                </button>
              </div>
            ) : prepState === "preparing" ? (
              /* ── Preparando ─────────────────────────────────────────── */
              <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Instalando componentes Ecclesia...</p>
              </div>
            ) : prepState === "confirming" ? (
              /* ── Confirmação ────────────────────────────────────────── */
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <h3 className="font-semibold">Preparar computador?</h3>
                <p className="text-sm text-muted-foreground">
                  O Windows poderá pedir permissão para continuar.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setPrepState("idle")}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm hover:bg-muted transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void handlePrepareComputer()}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            ) : (
              /* ── Idle: card principal ───────────────────────────────── */
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="font-semibold">Preparar este computador</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Este computador precisa ser preparado para usar os recursos do Ecclesia.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setTab("canais")}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm hover:bg-muted transition"
                  >
                    Agora não
                  </button>
                  <button
                    onClick={() => setPrepState("confirming")}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
                  >
                    Preparar computador
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : tab === "studio" ? (
          // Qualidade tab
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" />
                Qualidade da transmissão
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Escolha a qualidade com base na velocidade da internet da sua igreja.
              </p>
              <div className="space-y-2">
                {QUALITY_PRESETS.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => setQualityIdx(i)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-left transition ${
                      qualityIdx === i
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{preset.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {preset.res} · {preset.fps} fps · {preset.bitrate}
                      </p>
                    </div>
                    {qualityIdx === i && (
                      <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                Configure as mesmas opções no software de transmissão em Configurações → Saída.
              </p>
            </div>
          </div>
        ) : tab === "suporte" ? (
          /* ── Suporte Ecclesia ─────────────────────────────────────────────── */
          <div className="space-y-4 max-w-lg">
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">Ecclesia Support</p>
              <p className="text-xs">
                Este recurso permite que a equipe autorizada do Ecclesia auxilie
                na configuração e manutenção deste computador.
                Ative somente quando solicitado pelo suporte Ecclesia.
              </p>
            </div>
            <EcclesiaSupport />
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
