import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { useChurch } from "@/hooks/useChurchContext";
import {
  fetchEcclesiaChannels, fetchOrgVideos,
  type EcclesiaChannel, type EcclesiaVideo,
} from "@/lib/canalEcclesia";
import {
  MOCK_CHANNELS, MOCK_VIDEOS, HOME_CATEGORY_LABELS, isOfficialChannel,
  type HomeCategory,
} from "@/lib/canalMockData";
import {
  CanalVideoCard, CanalChannelCard, CanalVideoSkeleton, CanalEmptyState,
} from "@/components/canal/CanalComponents";
import {
  Search, Plus, Radio, TrendingUp, PlayCircle, CheckCircle2,
  Upload, Settings2,
} from "lucide-react";

export default function CanalHome() {
  const { church } = useChurch();
  const orgId = church?.id ?? "";

  const [channels, setChannels] = useState<EcclesiaChannel[]>([]);
  const [videos, setVideos] = useState<EcclesiaVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<HomeCategory>("all");

  useEffect(() => {
    void (async () => {
      try {
        if (orgId) {
          const [chs, vids] = await Promise.all([
            fetchEcclesiaChannels(orgId),
            fetchOrgVideos(orgId, 24),
          ]);
          setChannels(chs.length > 0 ? chs : MOCK_CHANNELS);
          setVideos(vids.length > 0 ? vids : MOCK_VIDEOS);
        } else {
          setChannels(MOCK_CHANNELS);
          setVideos(MOCK_VIDEOS);
        }
      } catch {
        setChannels(MOCK_CHANNELS);
        setVideos(MOCK_VIDEOS);
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  // Filtros
  const filteredVideos = videos.filter((v) => {
    const matchSearch = !search ||
      v.title.toLowerCase().includes(search.toLowerCase());
    const matchCategory = activeCategory === "all" || v.category === activeCategory;
    return matchSearch && matchCategory;
  });

  // Vídeo em destaque
  const featured = filteredVideos[0] ?? null;

  // Grade: resto dos vídeos
  const gridVideos = filteredVideos.slice(1);

  const channelMap = Object.fromEntries(
    channels.map((c) => [c.id, c.name])
  );

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-2xl">
              <PlayCircle className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">Canal Eclésia</h1>
              <p className="text-xs text-muted-foreground">Vídeos, cultos e acervo da sua igreja</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar vídeos…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 border border-border rounded-full text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-48 sm:w-64"
              />
            </div>
            <Link
              to="/canal/upload"
              className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-full text-xs font-semibold hover:bg-primary/90 transition"
            >
              <Upload className="w-3.5 h-3.5" />
              Publicar
            </Link>
            <Link
              to="/canal/meu-canal"
              className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-full text-xs font-medium hover:bg-muted transition"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Meu canal
            </Link>
          </div>
        </div>

        {/* ── Filtros de categoria ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {(Object.entries(HOME_CATEGORY_LABELS) as [HomeCategory, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition ${
                activeCategory === key
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <CanalVideoSkeleton key={i} />)}
          </div>
        ) : (
          <>
            {/* ── Canais em destaque ── */}
            {activeCategory === "all" && !search && channels.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Canais
                  </h2>
                  <Link
                    to="/canal/criar"
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Criar canal
                  </Link>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {channels.map((ch) => (
                    <CanalChannelCard
                      key={ch.id}
                      id={ch.id}
                      name={ch.name}
                      slug={ch.slug}
                      subscriberCount={ch.subscriberCount}
                      videoCount={ch.videoCount}
                      logoUrl={ch.logoUrl}
                      description={ch.description}
                    />
                  ))}
                </div>
              </section>
            )}

            {filteredVideos.length === 0 ? (
              <CanalEmptyState
                label={search ? `Nenhum resultado para "${search}"` : "Nenhum vídeo publicado ainda"}
                action={
                  !search ? (
                    <Link to="/canal/upload" className="text-sm text-primary hover:underline flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" />
                      Publicar o primeiro vídeo
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <>
                {/* ── Vídeo em destaque ── */}
                {featured && activeCategory === "all" && !search && (
                  <section>
                    <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <Radio className="w-4 h-4 text-primary" />
                      Em destaque
                    </h2>
                    <Link
                      to={`/video/${featured.id}`}
                      className="group block relative rounded-2xl overflow-hidden bg-gray-950 aspect-[21/9] sm:aspect-[21/8]"
                    >
                      {featured.thumbnailUrl ? (
                        <img src={featured.thumbnailUrl} alt={featured.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent flex items-center justify-center">
                          <PlayCircle className="w-20 h-20 text-primary/30" />
                        </div>
                      )}
                      {/* Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {featured.tvLiveSessionId && (
                            <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded">REPLAY</span>
                          )}
                          {isOfficialChannel(featured.channelId) && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-white/80 bg-white/10 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              Canal Oficial
                            </span>
                          )}
                          <span className="text-xs text-white/60">{channelMap[featured.channelId] ?? ""}</span>
                        </div>
                        <h3 className="text-white font-bold text-lg sm:text-2xl leading-snug line-clamp-2">
                          {featured.title}
                        </h3>
                        <p className="text-white/60 text-xs mt-1">
                          {featured.viewCount.toLocaleString("pt-BR")} visualizações
                        </p>
                      </div>
                      {/* Play button */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
                          <PlayCircle className="w-9 h-9 text-gray-900" />
                        </div>
                      </div>
                    </Link>
                  </section>
                )}

                {/* ── Grade de vídeos ── */}
                {gridVideos.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <PlayCircle className="w-4 h-4 text-primary" />
                      {activeCategory === "all" ? "Vídeos recentes" : HOME_CATEGORY_LABELS[activeCategory]}
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {gridVideos.map((v) => (
                        <CanalVideoCard
                          key={v.id}
                          video={v}
                          channelName={channelMap[v.channelId]}
                          showChannel
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Se filtrou e aparece o featured na grade */}
                {filteredVideos.length > 0 && (activeCategory !== "all" || search) && (
                  <section>
                    <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <PlayCircle className="w-4 h-4 text-primary" />
                      {search ? `Resultados para "${search}"` : HOME_CATEGORY_LABELS[activeCategory]}
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {filteredVideos.map((v) => (
                        <CanalVideoCard
                          key={v.id}
                          video={v}
                          channelName={channelMap[v.channelId]}
                          showChannel
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}

      </div>
    </AdminLayout>
  );
}
