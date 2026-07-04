import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { useChurch } from "@/hooks/useChurchContext";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchEcclesiaChannelBySlug, fetchChannelVideos, fetchChannelPlaylists,
  checkSubscribed, toggleSubscription,
  type EcclesiaChannel, type EcclesiaVideo, type EcclesiaPlaylist,
  CATEGORY_LABELS,
} from "@/lib/canalEcclesia";
import {
  getMockChannelBySlug, getMockChannelVideos, isOfficialChannel,
} from "@/lib/canalMockData";
import {
  CanalVideoCard, CanalSubscribeButton, OfficialBadge, CanalVideoSkeleton, CanalEmptyState,
} from "@/components/canal/CanalComponents";
import {
  Tv2, Bell, BellOff, ArrowLeft, Upload, Settings2, List,
  PlayCircle, Radio, Info, LayoutGrid, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

type Tab = "inicio" | "videos" | "ao_vivo" | "playlists" | "sobre";
const TABS: { id: Tab; label: string }[] = [
  { id: "inicio",    label: "Início"    },
  { id: "videos",    label: "Vídeos"    },
  { id: "ao_vivo",   label: "Ao vivo"   },
  { id: "playlists", label: "Playlists" },
  { id: "sobre",     label: "Sobre"     },
];

export default function CanalChannel() {
  const { slug } = useParams<{ slug: string }>();
  const { church } = useChurch();
  const { user } = useAuth();
  const orgId = church?.id ?? "";

  const [channel, setChannel] = useState<EcclesiaChannel | null>(null);
  const [videos, setVideos] = useState<EcclesiaVideo[]>([]);
  const [playlists, setPlaylists] = useState<EcclesiaPlaylist[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("inicio");
  const [subLoading, setSubLoading] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    if (!slug) return;
    void (async () => {
      try {
        let ch: EcclesiaChannel | null = null;
        let vids: EcclesiaVideo[] = [];
        let pls: EcclesiaPlaylist[] = [];

        if (orgId) {
          ch = await fetchEcclesiaChannelBySlug(orgId, slug);
        }
        // Fallback to mock
        if (!ch) {
          const mock = getMockChannelBySlug(slug);
          if (mock) {
            ch = mock;
            vids = getMockChannelVideos(mock.id);
          }
        } else {
          [vids, pls] = await Promise.all([
            fetchChannelVideos(ch.id, 24),
            fetchChannelPlaylists(ch.id),
          ]);
          if (vids.length === 0) vids = getMockChannelVideos(ch.id);
          if (user?.id) {
            setIsSubscribed(await checkSubscribed(ch.id, user.id));
          }
        }

        setChannel(ch);
        setVideos(vids);
        setPlaylists(pls);
      } catch {
        // Fallback to mock
        const mock = getMockChannelBySlug(slug ?? "");
        if (mock) {
          setChannel(mock);
          setVideos(getMockChannelVideos(mock.id));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId, slug, user?.id]);

  async function handleSubscribe() {
    if (!channel) return;
    setSubLoading(true);
    try {
      const ok = await toggleSubscription(channel.id, isSubscribed);
      if (ok) {
        setIsSubscribed(!isSubscribed);
        toast.success(isSubscribed ? "Deixou de seguir o canal." : "Seguindo o canal!");
        setChannel((prev) => prev ? {
          ...prev,
          subscriberCount: prev.subscriberCount + (isSubscribed ? -1 : 1),
        } : prev);
      }
    } catch {
      // visual fallback
      setIsSubscribed(!isSubscribed);
      toast.success(isSubscribed ? "Deixou de seguir o canal." : "Seguindo o canal!");
    } finally {
      setSubLoading(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="max-w-6xl mx-auto">
          <div className="h-40 bg-muted animate-pulse" />
          <div className="px-6 pt-4 space-y-3">
            <div className="h-6 w-48 bg-muted rounded animate-pulse" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
              {Array.from({ length: 8 }).map((_, i) => <CanalVideoSkeleton key={i} />)}
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!channel) {
    return (
      <AdminLayout>
        <CanalEmptyState
          label="Canal não encontrado."
          action={
            <Link to="/canal" className="text-sm text-primary hover:underline flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Voltar ao Canal Eclésia
            </Link>
          }
        />
      </AdminLayout>
    );
  }

  const official = isOfficialChannel(channel.id);
  const desc = channel.description ?? "";

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">

        {/* ── Banner ── */}
        <div className="relative h-36 sm:h-52 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent overflow-hidden">
          {channel.bannerUrl && (
            <img src={channel.bannerUrl} alt="" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
          <Link
            to="/canal"
            className="absolute top-3 left-3 flex items-center gap-1 text-xs text-white/80 hover:text-white bg-black/30 hover:bg-black/50 px-3 py-1.5 rounded-full transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Início
          </Link>
        </div>

        {/* ── Channel Info ── */}
        <div className="px-4 sm:px-6 -mt-10 mb-0">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            {/* Avatar + name */}
            <div className="flex items-end gap-4">
              <div className="w-20 h-20 rounded-2xl border-4 border-background bg-primary/10 flex items-center justify-center shadow-xl overflow-hidden flex-shrink-0">
                {channel.logoUrl ? (
                  <img src={channel.logoUrl} alt={channel.name} className="w-full h-full object-cover" />
                ) : (
                  <Tv2 className="w-9 h-9 text-primary" />
                )}
              </div>
              <div className="pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold">{channel.name}</h1>
                  {official && <OfficialBadge />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {channel.subscriberCount.toLocaleString("pt-BR")} seguidores
                  {" · "}
                  {channel.videoCount} vídeos
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pb-1">
              <Link
                to="/canal/upload"
                className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-full text-xs font-medium hover:bg-muted transition"
              >
                <Upload className="w-3.5 h-3.5" />
                Publicar
              </Link>

              {/* Notification bell (only when subscribed) */}
              {isSubscribed && (
                <button
                  onClick={() => setNotificationsOn(!notificationsOn)}
                  className={`p-2 rounded-full border transition ${
                    notificationsOn
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                  title={notificationsOn ? "Notificações ativadas" : "Ativar notificações"}
                >
                  {notificationsOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </button>
              )}

              <CanalSubscribeButton
                isSubscribed={isSubscribed}
                count={channel.subscriberCount}
                loading={subLoading}
                onToggle={() => void handleSubscribe()}
              />

              {/* Manage (owner shortcut) */}
              <Link
                to="/canal/meu-canal"
                className="p-2 rounded-full border border-border hover:bg-muted transition"
                title="Gerenciar canal"
              >
                <Settings2 className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Description preview */}
          {desc && (
            <div className="mt-3 max-w-2xl">
              <p className={`text-sm text-muted-foreground leading-relaxed ${descExpanded ? "" : "line-clamp-2"}`}>
                {desc}
              </p>
              {desc.length > 120 && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
                >
                  {descExpanded ? "Mostrar menos" : "Mostrar mais"}
                  <ChevronDown className={`w-3 h-3 transition-transform ${descExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-border px-4 sm:px-6 mt-5 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {id === "inicio"    && <LayoutGrid className="w-3.5 h-3.5" />}
              {id === "videos"    && <PlayCircle className="w-3.5 h-3.5" />}
              {id === "ao_vivo"   && <Radio className="w-3.5 h-3.5" />}
              {id === "playlists" && <List className="w-3.5 h-3.5" />}
              {id === "sobre"     && <Info className="w-3.5 h-3.5" />}
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="px-4 sm:px-6 py-6 pb-12">

          {/* Início */}
          {activeTab === "inicio" && (
            <div className="space-y-8">
              {videos.length === 0 ? (
                <CanalEmptyState label="Nenhum vídeo publicado ainda" />
              ) : (
                <>
                  {/* Vídeos recentes */}
                  <section>
                    <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <PlayCircle className="w-4 h-4 text-primary" />
                      Vídeos recentes
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {videos.slice(0, 8).map((v) => (
                        <CanalVideoCard key={v.id} video={v} />
                      ))}
                    </div>
                  </section>

                  {/* Por categoria — mais vistos */}
                  {videos.length > 4 && (
                    <section>
                      <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4 text-primary" />
                        Mais vistos
                      </h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {[...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 4).map((v) => (
                          <CanalVideoCard key={v.id} video={v} />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {/* Vídeos */}
          {activeTab === "videos" && (
            videos.length === 0 ? (
              <CanalEmptyState label="Nenhum vídeo publicado ainda" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {videos.map((v) => <CanalVideoCard key={v.id} video={v} />)}
              </div>
            )
          )}

          {/* Ao vivo */}
          {activeTab === "ao_vivo" && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Radio className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">Nenhuma transmissão ao vivo no momento</p>
              <p className="text-xs">As transmissões do canal aparecerão aqui quando estiverem ao vivo.</p>
              <Link to="/tv" className="text-xs text-primary hover:underline">
                Acessar a TV Digital →
              </Link>
            </div>
          )}

          {/* Playlists */}
          {activeTab === "playlists" && (
            playlists.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <List className="w-12 h-12 mb-3 mx-auto opacity-20" />
                <p className="text-sm">Nenhuma playlist criada ainda</p>
                <Link to="/canal/playlists" className="mt-3 text-xs text-primary hover:underline block">
                  Criar playlist
                </Link>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {playlists.map((pl) => (
                  <div key={pl.id} className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition">
                    <div className="aspect-video bg-muted flex items-center justify-center">
                      {pl.thumbnailUrl ? (
                        <img src={pl.thumbnailUrl} alt={pl.title} className="w-full h-full object-cover" />
                      ) : (
                        <List className="w-8 h-8 text-muted-foreground opacity-30" />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-medium text-sm truncate">{pl.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{pl.videoCount} vídeos</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Sobre */}
          {activeTab === "sobre" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-sm font-semibold mb-2">Descrição</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {channel.description ?? "Sem descrição disponível."}
                </p>
              </div>
              <div>
                <h2 className="text-sm font-semibold mb-2">Estatísticas</h2>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Vídeos", value: channel.videoCount.toLocaleString("pt-BR") },
                    { label: "Seguidores", value: channel.subscriberCount.toLocaleString("pt-BR") },
                    { label: "Tipo", value: official ? "Canal Oficial" : "Canal" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/50 rounded-xl p-4 text-center">
                      <p className="text-lg font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              {official && (
                <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                  <OfficialBadge />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Este é o canal oficial verificado da organização no Canal Eclésia.
                  </p>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Canal criado em {new Date(channel.createdAt).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </div>
            </div>
          )}

        </div>
      </div>
    </AdminLayout>
  );
}

// Re-export category labels for internal use
export { CATEGORY_LABELS };
