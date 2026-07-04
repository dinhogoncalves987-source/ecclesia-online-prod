import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { TvAdminNav } from "@/components/tv/TvAdminNav";
import { useChurch } from "@/hooks/useChurchContext";
import {
  fetchTvChannels,
  fetchRecentSessions,
  type TvChannel,
  type TvLiveSession,
  statusBadge,
} from "@/lib/tvDigital";
import { Tv2, Radio, CalendarDays, LayoutGrid, TrendingUp, Wifi } from "lucide-react";
import { Link } from "react-router-dom";

export default function TvAdmin() {
  const { church } = useChurch();
  const orgId = church?.id ?? "";

  const [channels, setChannels] = useState<TvChannel[]>([]);
  const [sessions, setSessions] = useState<TvLiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    void (async () => {
      try {
        const [ch, se] = await Promise.all([
          fetchTvChannels(orgId),
          fetchRecentSessions(orgId, 5),
        ]);
        setChannels(ch);
        setSessions(se);
      } catch (err) {
        console.warn("[TvAdmin] load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  const liveNow = sessions.filter((s) => s.statusTransmissao === "live");
  const totalViewers = liveNow.reduce((acc, s) => acc + s.viewerCount, 0);

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Tv2 className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">TV Digital Ecclesia</h1>
            <p className="text-sm text-muted-foreground">
              Transmissão ao vivo, grade de programação e reprises
            </p>
          </div>
        </div>

        <TvAdminNav />

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Canais", value: channels.length, icon: LayoutGrid, color: "text-blue-500" },
                { label: "Ao Vivo agora", value: liveNow.length, icon: Radio, color: "text-red-500" },
                { label: "Espectadores", value: totalViewers, icon: TrendingUp, color: "text-green-500" },
                { label: "Transmissões recentes", value: sessions.length, icon: Wifi, color: "text-purple-500" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div
                  key={label}
                  className="bg-card border border-border rounded-xl p-4 flex items-center gap-3"
                >
                  <div className={`p-2 rounded-lg bg-muted ${color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Ações rápidas */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  Ações rápidas
                </h2>
                <div className="flex flex-col gap-2">
                  <Link
                    to="/admin/tv/ao-vivo"
                    className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 transition text-sm font-medium"
                  >
                    <Radio className="w-4 h-4" />
                    Gerenciar transmissão ao vivo
                  </Link>
                  <Link
                    to="/admin/tv/canais"
                    className="flex items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted transition text-sm"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    Criar ou editar canal
                  </Link>
                  <Link
                    to="/admin/tv/programacao"
                    className="flex items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted transition text-sm"
                  >
                    <CalendarDays className="w-4 h-4" />
                    Configurar grade de programação
                  </Link>
                  <Link
                    to="/tv"
                    target="_blank"
                    className="flex items-center gap-2 p-3 rounded-lg border border-border hover:bg-muted transition text-sm"
                  >
                    <Tv2 className="w-4 h-4" />
                    Ver como membro (abre nova aba)
                  </Link>
                </div>
              </div>

              {/* Transmissões recentes */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-primary" />
                  Transmissões recentes
                </h2>
                {sessions.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 text-sm">
                    Nenhuma transmissão registrada ainda
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {sessions.map((s) => {
                      const badge = statusBadge(s.statusTransmissao);
                      return (
                        <div
                          key={s.id}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium truncate max-w-[180px]">
                              {s.streamSourceType
                                ? { obs: "Ecclesia Studio Kit", mobile: "Celular", computer: "Computador", mock: "Simulação", scheduled: "Automático" }[s.streamSourceType]
                                : "Transmissão"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {s.startedAt
                                ? new Date(s.startedAt).toLocaleString("pt-BR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </span>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.color}`}>
                            {badge.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Canais */}
            {channels.length > 0 && (
              <div className="mt-6 bg-card border border-border rounded-xl p-5">
                <h2 className="font-semibold mb-4">Canais ativos</h2>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {channels.map((ch) => (
                    <Link
                      key={ch.id}
                      to={`/tv/${ch.slug}`}
                      target="_blank"
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted transition"
                    >
                      {ch.logoUrl ? (
                        <img src={ch.logoUrl} alt={ch.name} className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Tv2 className="w-5 h-5 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ch.name}</p>
                        <p className="text-xs text-muted-foreground">/{ch.slug}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
