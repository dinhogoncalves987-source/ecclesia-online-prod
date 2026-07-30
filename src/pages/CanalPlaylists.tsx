import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { useChurch } from "@/hooks/useChurchContext";
import {
  fetchEcclesiaChannels, fetchChannelPlaylists, fetchChannelVideos,
  upsertPlaylist, addVideoToPlaylist,
  type EcclesiaChannel, type EcclesiaPlaylist, type EcclesiaVideo,
} from "@/lib/canalEcclesia";
import { List, Plus, X, PlayCircle } from "lucide-react";
import { toast } from "sonner";

export default function CanalPlaylists() {
  const { church } = useChurch();
  const orgId = church?.id ?? "";

  const [channels, setChannels] = useState<EcclesiaChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [playlists, setPlaylists] = useState<EcclesiaPlaylist[]>([]);
  const [videos, setVideos] = useState<EcclesiaVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formVisibility, setFormVisibility] = useState<"org_members" | "public" | "private">("org_members");
  const [saving, setSaving] = useState(false);

  // Add video to playlist
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [addingVideo, setAddingVideo] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    void fetchEcclesiaChannels(orgId).then((chs) => {
      setChannels(chs);
      if (chs.length > 0) setSelectedChannelId(chs[0].id);
    });
  }, [orgId]);

  useEffect(() => {
    if (!selectedChannelId) return;
    setLoading(true);
    void Promise.all([
      fetchChannelPlaylists(selectedChannelId),
      fetchChannelVideos(selectedChannelId, 50),
    ]).then(([pls, vids]) => {
      setPlaylists(pls);
      setVideos(vids);
      setLoading(false);
    });
  }, [selectedChannelId]);

  async function handleSave() {
    if (!formTitle.trim()) { toast.error("Informe o título."); return; }
    setSaving(true);
    const result = await upsertPlaylist(orgId, selectedChannelId, {
      title: formTitle, description: formDescription || null,
      visibility: formVisibility,
    });
    setSaving(false);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("Playlist criada.");
    setShowForm(false);
    setFormTitle(""); setFormDescription("");
    const updated = await fetchChannelPlaylists(selectedChannelId);
    setPlaylists(updated);
  }

  async function handleAddVideo() {
    if (!selectedPlaylistId || !selectedVideoId) return;
    setAddingVideo(true);
    const pl = playlists.find((p) => p.id === selectedPlaylistId);
    const ok = await addVideoToPlaylist(selectedPlaylistId, selectedVideoId, (pl?.videoCount ?? 0) + 1);
    setAddingVideo(false);
    if (ok) {
      toast.success("Vídeo adicionado à playlist.");
      setSelectedVideoId("");
      const updated = await fetchChannelPlaylists(selectedChannelId);
      setPlaylists(updated);
    } else {
      toast.error("Erro ao adicionar vídeo.");
    }
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <List className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Playlists</h1>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus className="w-4 h-4" />
            Nova playlist
          </button>
        </div>

        {/* Canal selector */}
        <div className="flex items-center gap-3 mb-6">
          <select
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background"
            value={selectedChannelId}
            onChange={(e) => setSelectedChannelId(e.target.value)}
          >
            {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          </select>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <div className="flex justify-between mb-4">
              <h2 className="font-semibold">Nova playlist</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Título *</label>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Série Oração"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição</label>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Descrição opcional"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Visibilidade</label>
                <select
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={formVisibility}
                  onChange={(e) => setFormVisibility(e.target.value as typeof formVisibility)}
                >
                  <option value="org_members">Membros</option>
                  <option value="public">Público</option>
                  <option value="private">Privado</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50">
                  {saving ? "Salvando…" : "Criar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <List className="w-12 h-12 mb-3 opacity-20" />
            <p>Nenhuma playlist criada ainda</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {playlists.map((pl) => (
              <div key={pl.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <List className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{pl.title}</p>
                    <p className="text-xs text-muted-foreground">{pl.videoCount} vídeos</p>
                  </div>
                  <button
                    onClick={() => setSelectedPlaylistId(selectedPlaylistId === pl.id ? null : pl.id)}
                    className="text-xs text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary/10 transition"
                  >
                    {selectedPlaylistId === pl.id ? "Fechar" : "Adicionar vídeo"}
                  </button>
                </div>

                {selectedPlaylistId === pl.id && (
                  <div className="border-t border-border p-4 bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Adicionar vídeo à playlist</p>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background"
                        value={selectedVideoId}
                        onChange={(e) => setSelectedVideoId(e.target.value)}
                      >
                        <option value="">Selecione um vídeo…</option>
                        {videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
                      </select>
                      <button
                        onClick={handleAddVideo}
                        disabled={!selectedVideoId || addingVideo}
                        className="flex items-center gap-1 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm disabled:opacity-50"
                      >
                        <PlayCircle className="w-4 h-4" />
                        {addingVideo ? "…" : "Adicionar"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
