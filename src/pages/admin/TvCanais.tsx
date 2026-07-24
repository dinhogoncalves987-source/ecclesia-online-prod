import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { TvAdminNav } from "@/components/tv/TvAdminNav";
import { useChurch } from "@/hooks/useChurchContext";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchTvChannels,
  upsertTvChannel,
  deleteTvChannel,
  fetchStreamKeys,
  createStreamKey,
  generateStreamKey,
  revokeStreamKey,
  slugify,
  type TvChannel,
  type TvStreamKey,
  STREAM_SOURCE_LABELS,
  type TvStreamSourceType,
} from "@/lib/tvDigital";
import {
  LayoutGrid, Plus, Pencil, Trash2, Key, Eye, EyeOff,
  RefreshCw, Copy, CheckCheck, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

type ChannelForm = {
  name: string;
  slug: string;
  description: string;
  visibility: "public" | "org_members" | "private";
};

const EMPTY_FORM: ChannelForm = { name: "", slug: "", description: "", visibility: "org_members" };

export default function TvCanais() {
  const { church } = useChurch();
  const { user } = useAuth();
  const orgId = church?.id ?? "";
  const userId = user?.id ?? "";

  const [channels, setChannels] = useState<TvChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChannelForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Stream keys
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [streamKeys, setStreamKeys] = useState<Record<string, TvStreamKey[]>>({});
  const [showNewKey, setShowNewKey] = useState<string | null>(null);
  const [newKeySource, setNewKeySource] = useState<TvStreamSourceType>("obs");
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [revealedKey, setRevealedKey] = useState<{ id: string; rawKey: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    void load();
  }, [orgId]);

  async function load() {
    setLoading(true);
    const data = await fetchTvChannels(orgId);
    setChannels(data);
    setLoading(false);
  }

  async function loadKeys(channelId: string) {
    const keys = await fetchStreamKeys(channelId);
    setStreamKeys((prev) => ({ ...prev, [channelId]: keys }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(ch: TvChannel) {
    setEditingId(ch.id);
    setForm({
      name: ch.name,
      slug: ch.slug,
      description: ch.description ?? "",
      visibility: ch.visibility,
    });
    setShowForm(true);
  }

  function handleNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      slug: editingId ? f.slug : slugify(name),
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Informe o nome do canal."); return; }
    if (!form.slug.trim()) { toast.error("Informe o slug do canal."); return; }
    setSaving(true);
    const result = await upsertTvChannel(orgId, {
      name: form.name,
      slug: form.slug,
      description: form.description || undefined,
      visibility: form.visibility,
    }, editingId ?? undefined);
    setSaving(false);
    if (!result.ok) { toast.error(`Erro: ${result.error}`); return; }
    toast.success(editingId ? "Canal atualizado." : "Canal criado.");
    setShowForm(false);
    await load();
  }

  async function handleDelete(ch: TvChannel) {
    if (!confirm(`Arquivar o canal "${ch.name}"? Ele não será deletado.`)) return;
    const ok = await deleteTvChannel(orgId, ch.id);
    if (ok) { toast.success("Canal arquivado."); await load(); }
    else toast.error("Erro ao arquivar canal.");
  }

  async function toggleKeys(channelId: string) {
    if (expandedChannel === channelId) { setExpandedChannel(null); return; }
    setExpandedChannel(channelId);
    await loadKeys(channelId);
  }

  async function handleGenerateKey(channelId: string) {
    const { rawKey, hash, last4 } = await generateStreamKey();
    const result = await createStreamKey(
      orgId, channelId, newKeySource,
      newKeyLabel || null, hash, last4, userId,
    );
    if (!result.ok) { toast.error(`Erro: ${result.error}`); return; }
    toast.success("Chave criada. Copie agora — ela não será mostrada novamente.");
    setRevealedKey({ id: `new:${channelId}`, rawKey });
    setShowNewKey(null);
    setNewKeyLabel("");
    await loadKeys(channelId);
  }

  async function handleRevoke(keyId: string, channelId: string) {
    if (!confirm("Revogar esta chave? Transmissões em andamento serão interrompidas.")) return;
    const ok = await revokeStreamKey(keyId);
    if (ok) { toast.success("Chave revogada."); await loadKeys(channelId); }
    else toast.error("Erro ao revogar chave.");
  }

  async function copyKey() {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey.rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <LayoutGrid className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Canais de TV</h1>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus className="w-4 h-4" />
            Novo canal
          </button>
        </div>

        <TvAdminNav />

        {/* Form de criação/edição */}
        {showForm && (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{editingId ? "Editar canal" : "Novo canal"}</h2>
              <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome do canal *</label>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Ex: Assembleia de Deus Caxias"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Slug (URL) *</label>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="ad-caxias-do-sul"
                />
                <p className="text-xs text-muted-foreground mt-1">URL: /tv/{form.slug || "..."}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição</label>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Transmissões da Igreja"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Visibilidade</label>
                <select
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  value={form.visibility}
                  onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as typeof f.visibility }))}
                >
                  <option value="public">Público (qualquer pessoa)</option>
                  <option value="org_members">Membros da organização</option>
                  <option value="private">Privado (apenas admins)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        )}

        {/* Chave revelada */}
        {revealedKey && (
          <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-800 rounded-xl p-4 mb-6">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-yellow-800 dark:text-yellow-200 text-sm mb-1">
                  🔑 Copie esta chave agora — ela não será exibida novamente
                </p>
                <code className="text-xs font-mono bg-yellow-100 dark:bg-yellow-900/40 px-2 py-1 rounded select-all break-all">
                  {revealedKey.rawKey}
                </code>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={copyKey}
                  className="flex items-center gap-1 text-xs bg-yellow-200 dark:bg-yellow-800 px-3 py-1.5 rounded-lg hover:opacity-80 transition"
                >
                  {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
                <button onClick={() => setRevealedKey(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lista de canais */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-xl flex flex-col items-center justify-center py-16 text-muted-foreground">
            <LayoutGrid className="w-10 h-10 mb-3 opacity-30" />
            <p>Nenhum canal criado ainda</p>
            <button onClick={openCreate} className="mt-3 text-sm text-primary hover:underline">
              Criar primeiro canal
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {channels.map((ch) => (
              <div key={ch.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <LayoutGrid className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{ch.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">/tv/{ch.slug}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {ch.visibility === "public" ? "Público" : ch.visibility === "org_members" ? "Membros" : "Privado"}
                    </span>
                    <button
                      onClick={() => toggleKeys(ch.id)}
                      title="Gerenciar stream keys"
                      className="p-2 hover:bg-muted rounded-lg transition text-muted-foreground"
                    >
                      <Key className="w-4 h-4" />
                      {expandedChannel === ch.id ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />}
                    </button>
                    <button onClick={() => openEdit(ch)} className="p-2 hover:bg-muted rounded-lg transition">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(ch)} className="p-2 hover:bg-muted rounded-lg transition text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stream Keys */}
                {expandedChannel === ch.id && (
                  <div className="border-t border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Key className="w-4 h-4" />
                        Chaves de transmissão
                      </p>
                      <button
                        onClick={() => setShowNewKey(showNewKey === ch.id ? null : ch.id)}
                        className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition"
                      >
                        <Plus className="w-3 h-3" />
                        Gerar chave
                      </button>
                    </div>

                    {showNewKey === ch.id && (
                      <div className="bg-card border border-border rounded-lg p-3 mb-3">
                        <div className="grid sm:grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Fonte</label>
                            <select
                              className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-background"
                              value={newKeySource}
                              onChange={(e) => setNewKeySource(e.target.value as TvStreamSourceType)}
                            >
                              {(["obs", "mobile", "computer"] as TvStreamSourceType[]).map((s) => (
                                <option key={s} value={s}>{STREAM_SOURCE_LABELS[s]}</option>
                              ))}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs text-muted-foreground block mb-1">Rótulo (opcional)</label>
                            <input
                              className="w-full border border-border rounded-lg px-2 py-1.5 text-xs bg-background"
                              value={newKeyLabel}
                              onChange={(e) => setNewKeyLabel(e.target.value)}
                              placeholder="Ex: Telão, Púlpito, Principal..."
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleGenerateKey(ch.id)}
                            className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Gerar
                          </button>
                          <button onClick={() => setShowNewKey(null)} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {(streamKeys[ch.id] ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">Nenhuma chave criada.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {(streamKeys[ch.id] ?? []).map((k) => (
                          <div
                            key={k.id}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs border ${
                              k.isActive ? "border-border bg-background" : "border-border/40 bg-muted/20 opacity-60"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${k.isActive ? "bg-green-500" : "bg-gray-400"}`} />
                              <span className="font-medium">{k.label ?? STREAM_SOURCE_LABELS[k.streamSourceType]}</span>
                              <code className="text-muted-foreground">****{k.streamKeyLast4}</code>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground hidden sm:block">{k.streamSourceType}</span>
                              {k.isActive && (
                                <button
                                  onClick={() => handleRevoke(k.id, ch.id)}
                                  className="text-destructive hover:underline"
                                >
                                  Revogar
                                </button>
                              )}
                              {!k.isActive && (
                                <span className="text-muted-foreground">Revogada</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                      <p className="font-medium mb-1">Como usar com o Ecclesia Studio Kit:</p>
                      <p>Servidor: <code>rtmp://&lt;seu-servidor&gt;/live</code></p>
                      <p>Chave: a chave gerada acima (mostrada apenas uma vez)</p>
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
