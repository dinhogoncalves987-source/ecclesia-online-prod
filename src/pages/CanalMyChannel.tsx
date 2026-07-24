import { useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import {
  MOCK_CHANNELS, MOCK_VIDEOS, isOfficialChannel,
} from "@/lib/canalMockData";
import { CATEGORY_LABELS, type EcclesiaVideoStatus } from "@/lib/canalEcclesia";
import {
  BarChart3, Upload, Settings2, CheckCircle2, Clock, AlertCircle,
  FileEdit, Eye, EyeOff, Star, Trash2, PlayCircle, Tv2, ArrowLeft,
  Archive, RefreshCw, Plus, ChevronRight, Package, Sparkles, X,
} from "lucide-react";

// ── Sub-componente: Modal Importação Assistida ────────────────────────────────

const IMPORT_STEPS = [
  { n: 1, label: "Autorizar acesso ao acervo",     icon: "🔐" },
  { n: 2, label: "Organizar arquivos originais",    icon: "📁" },
  { n: 3, label: "Enviar para o Ecclesia",          icon: "☁️" },
  { n: 4, label: "Conferir vídeos",                 icon: "✅" },
  { n: 5, label: "Publicar no Canal Eclésia",       icon: "🚀" },
];

function ImportModal({ onClose }: { onClose: () => void }) {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-bold">Importação assistida de acervo</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Migre seus vídeos antigos para o Canal Eclésia</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps */}
        <div className="p-5 space-y-3">
          {IMPORT_STEPS.map((step, i) => (
            <button
              key={step.n}
              onClick={() => setActiveStep(i)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition ${
                activeStep === i
                  ? "border-primary bg-primary/5"
                  : i < activeStep
                    ? "border-green-500/30 bg-green-50/50 dark:bg-green-950/20"
                    : "border-border hover:border-primary/30"
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                i < activeStep
                  ? "bg-green-500 text-white"
                  : activeStep === i
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}>
                {i < activeStep ? <CheckCircle2 className="w-4 h-4" /> : step.n}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{step.label}</p>
                {activeStep === i && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Esta etapa será guiada pela equipe Ecclesia.
                  </p>
                )}
              </div>
              <span className="text-xl">{step.icon}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-5 pt-0 space-y-3">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400">
            A importação real estará disponível na Fase 3. Nossa equipe irá guiá-lo em cada etapa para garantir que todo o acervo da sua igreja seja migrado com qualidade.
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 border border-border rounded-xl py-2.5 text-sm hover:bg-muted transition"
            >
              Fechar
            </button>
            <button
              disabled
              className="flex-1 bg-primary/50 text-primary-foreground rounded-xl py-2.5 text-sm font-semibold cursor-not-allowed"
            >
              Em breve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Status helpers ────────────────────────────────────────────────────────────

type VideoStatus = EcclesiaVideoStatus;

const STATUS_CONFIG: Record<VideoStatus, { label: string; color: string; icon: React.ReactNode }> = {
  ready:      { label: "Publicado",    color: "text-green-600 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",   icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  processing: { label: "Processando",  color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900", icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" /> },
  draft:      { label: "Rascunho",     color: "text-muted-foreground bg-muted border-border",                                               icon: <FileEdit className="w-3.5 h-3.5" /> },
  failed:     { label: "Erro",         color: "text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900",               icon: <AlertCircle className="w-3.5 h-3.5" /> },
  archived:   { label: "Arquivado",    color: "text-muted-foreground bg-muted/50 border-border",                                            icon: <Archive className="w-3.5 h-3.5" /> },
};

// ── Página principal ──────────────────────────────────────────────────────────

export default function CanalMyChannel() {
  const [showImport, setShowImport] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState(MOCK_CHANNELS[0]?.id ?? "");

  const activeChannel = MOCK_CHANNELS.find((c) => c.id === activeChannelId) ?? MOCK_CHANNELS[0];
  const channelVideos = MOCK_VIDEOS.filter((v) => v.channelId === activeChannelId);
  const official = isOfficialChannel(activeChannelId);

  // Simulação de stats
  const totalViews = channelVideos.reduce((s, v) => s + v.viewCount, 0);
  const totalLikes = channelVideos.reduce((s, v) => s + v.likeCount, 0);
  const processing = channelVideos.filter((v) => v.status === "processing").length;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link to="/canal" className="p-2 rounded-xl hover:bg-muted transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold">Meu Canal</h1>
              <p className="text-xs text-muted-foreground">Painel do criador</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/canal/upload"
              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-full text-xs font-semibold hover:bg-primary/90 transition"
            >
              <Upload className="w-3.5 h-3.5" />
              Publicar vídeo
            </Link>
            <Link
              to="/canal/criar"
              className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-full text-xs font-medium hover:bg-muted transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo canal
            </Link>
          </div>
        </div>

        {/* ── Seletor de canal ── */}
        {MOCK_CHANNELS.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {MOCK_CHANNELS.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setActiveChannelId(ch.id)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  ch.id === activeChannelId
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                <Tv2 className="w-3.5 h-3.5" />
                {ch.name}
                {isOfficialChannel(ch.id) && <CheckCircle2 className="w-3 h-3" />}
              </button>
            ))}
          </div>
        )}

        {/* ── Channel header card ── */}
        {activeChannel && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="h-24 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />
            <div className="flex items-end gap-4 px-5 -mt-8 pb-4">
              <div className="w-16 h-16 rounded-2xl border-4 border-background bg-primary/10 flex items-center justify-center shadow-lg flex-shrink-0">
                <Tv2 className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold">{activeChannel.name}</h2>
                  {official && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      Oficial
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  canal.ecclesia/<span className="font-mono">{activeChannel.slug}</span>
                </p>
              </div>
              <div className="pb-1 flex gap-2">
                <Link
                  to={`/canal/${activeChannel.slug}`}
                  className="flex items-center gap-1 border border-border px-3 py-1.5 rounded-full text-xs hover:bg-muted transition"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ver canal
                </Link>
                <button className="p-1.5 rounded-full border border-border hover:bg-muted transition">
                  <Settings2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Estatísticas ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: <PlayCircle className="w-5 h-5 text-primary" />, label: "Vídeos",       value: channelVideos.length.toString() },
            { icon: <BarChart3  className="w-5 h-5 text-blue-500" />,  label: "Visualizações", value: totalViews.toLocaleString("pt-BR") },
            { icon: <Settings2  className="w-5 h-5 text-green-500" />, label: "Seguidores",  value: (activeChannel?.subscriberCount ?? 0).toLocaleString("pt-BR") },
            { icon: <RefreshCw  className="w-5 h-5 text-yellow-500" />,label: "Processando", value: processing.toString() },
          ].map(({ icon, label, value }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1.5">{icon}</div>
              <p className="text-xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Lista de vídeos ── */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-primary" />
              Vídeos do canal
              <span className="text-xs text-muted-foreground font-normal">({channelVideos.length})</span>
            </h2>
            <Link
              to="/canal/upload"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Publicar
            </Link>
          </div>

          {channelVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <PlayCircle className="w-12 h-12 opacity-20" />
              <p className="text-sm">Nenhum vídeo publicado ainda</p>
              <Link to="/canal/upload" className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                Publicar primeiro vídeo
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {channelVideos.map((v) => {
                const s = STATUS_CONFIG[v.status] ?? STATUS_CONFIG.draft;
                return (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition group">
                    {/* Thumbnail mini */}
                    <div className="w-20 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {v.thumbnailUrl ? (
                        <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" />
                      ) : (
                        <PlayCircle className="w-5 h-5 text-muted-foreground/40" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border px-1.5 py-0.5 rounded-full ${s.color}`}>
                          {s.icon}
                          {s.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {CATEGORY_LABELS[v.category]}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {v.viewCount.toLocaleString("pt-BR")} views
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <Link
                        to={`/video/${v.id}`}
                        className="p-1.5 rounded-lg hover:bg-muted transition"
                        title="Ver"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <button className="p-1.5 rounded-lg hover:bg-muted transition" title="Editar">
                        <FileEdit className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-lg hover:bg-muted transition"
                        title={v.status === "ready" ? "Ocultar" : "Publicar"}
                      >
                        {v.status === "ready" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-muted transition" title="Destaque">
                        <Star className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition" title="Remover">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Importação assistida ── */}
        <div className="bg-gradient-to-br from-primary/5 via-card to-card border border-primary/20 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-xl flex-shrink-0">
            <Package className="w-7 h-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold flex items-center gap-2">
              Importação assistida de acervo
              <Sparkles className="w-4 h-4 text-primary" />
            </h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Migre vídeos antigos do canal da igreja com apoio da equipe Ecclesia.
              Preserve seu acervo histórico de cultos, pregações e eventos.
            </p>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition whitespace-nowrap"
          >
            Iniciar importação
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* ── Área futura: Upload em lote ── */}
        <div className="border border-dashed border-border rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 opacity-60">
          <div className="p-3 bg-muted rounded-xl flex-shrink-0">
            <Upload className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Upload em lote</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Publique vários vídeos de uma vez. Disponível na Fase 2.
            </p>
          </div>
          <span className="text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded-full font-medium">
            Em breve
          </span>
        </div>

      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </AdminLayout>
  );
}
