import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useChurch } from "@/hooks/useChurchContext";
import { AdminLayout } from "@/components/AdminLayout";
import { fetchTvChannels, fetchLiveSession, type TvChannel } from "@/lib/tvDigital";
import { Tv2, Radio } from "lucide-react";

type ChannelWithStatus = TvChannel & { isLive?: boolean };

export default function TvHome() {
  const { church } = useChurch();
  const orgId = church?.id ?? "";

  const [channels, setChannels] = useState<ChannelWithStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    void (async () => {
      try {
        const chs = await fetchTvChannels(orgId);
        const withStatus: ChannelWithStatus[] = await Promise.all(
          chs.map(async (ch) => {
            const session = await fetchLiveSession(ch.id);
            return { ...ch, isLive: !!session };
          }),
        );
        setChannels(withStatus);
      } catch (err) {
        console.warn("[TvHome] load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Tv2 className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">TV Digital</h1>
            <p className="text-sm text-muted-foreground">Transmissões ao vivo e grade de programação</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Tv2 className="w-16 h-16 mb-4 opacity-20" />
            <p>Nenhum canal disponível no momento</p>
          </div>
        ) : (
          <>
            {/* Destaque: ao vivo agora */}
            {channels.some((c) => c.isLive) && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-red-500" />
                  Ao vivo agora
                </h2>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {channels.filter((c) => c.isLive).map((ch) => (
                    <ChannelCard key={ch.id} channel={ch} />
                  ))}
                </div>
              </div>
            )}

            {/* Todos os canais */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Canais disponíveis
              </h2>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {channels.map((ch) => (
                  <ChannelCard key={ch.id} channel={ch} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function ChannelCard({ channel }: { channel: ChannelWithStatus }) {
  return (
    <Link
      to={`/tv/${channel.slug}`}
      className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 hover:shadow-md transition-all"
    >
      {/* Cover */}
      <div className="relative aspect-video bg-gray-950 overflow-hidden">
        {channel.coverUrl ? (
          <img
            src={channel.coverUrl}
            alt={channel.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
            <Tv2 className="w-10 h-10 text-gray-600" />
          </div>
        )}

        {channel.isLive && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-lg animate-pulse">
            <Radio className="w-2.5 h-2.5" />
            AO VIVO
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex items-center gap-3">
        {channel.logoUrl ? (
          <img src={channel.logoUrl} alt={channel.name} className="w-9 h-9 rounded-lg object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Tv2 className="w-5 h-5 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{channel.name}</p>
          {channel.description && (
            <p className="text-xs text-muted-foreground truncate">{channel.description}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
