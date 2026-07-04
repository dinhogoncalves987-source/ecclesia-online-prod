import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import {
  ArrowLeft, Tv2, CheckCircle2, Upload, Eye, EyeOff,
  ChevronRight, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

type ChannelType = "church" | "ministry" | "pastor" | "member";
type FormStep = "form" | "preview" | "success";

const CHANNEL_TYPES: { id: ChannelType; label: string; description: string; icon: string }[] = [
  { id: "church",   label: "Igreja",     description: "Canal oficial da congregação",       icon: "⛪" },
  { id: "ministry", label: "Ministério", description: "Louvor, missões, célula e outros",   icon: "🎵" },
  { id: "pastor",   label: "Pastor",     description: "Canal pessoal de um pastor ou líder", icon: "📖" },
  { id: "member",   label: "Membro",     description: "Canal pessoal de um membro",         icon: "👤" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export default function CanalCreateChannel() {
  const navigate = useNavigate();

  const [step, setStep] = useState<FormStep>("form");
  const [name, setName] = useState("");
  const [type, setType] = useState<ChannelType>("church");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugVisible, setSlugVisible] = useState(false);
  const [creating, setCreating] = useState(false);

  function handleNameChange(v: string) {
    setName(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  function handleSlugChange(v: string) {
    setSlug(slugify(v));
    setSlugEdited(true);
  }

  function handlePreview() {
    if (!name.trim()) { toast.error("Informe o nome do canal."); return; }
    if (!slug.trim()) { toast.error("Defina o endereço do canal."); return; }
    setStep("preview");
  }

  async function handleCreate() {
    setCreating(true);
    // Simulated delay (Fase 1 — sem banco real nesta etapa)
    await new Promise((r) => setTimeout(r, 1200));
    setCreating(false);
    setStep("success");
  }

  // ── Tela de sucesso ──────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <AdminLayout>
        <div className="max-w-md mx-auto px-4 py-20 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-green-100 dark:bg-green-950/30 flex items-center justify-center mb-5">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Canal criado!</h1>
          <p className="text-muted-foreground text-sm mb-6">
            O canal <strong>{name}</strong> está pronto. Publique o primeiro vídeo agora.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Link
              to="/canal/upload"
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3 font-semibold text-sm hover:bg-primary/90 transition"
            >
              <Upload className="w-4 h-4" />
              Publicar vídeo
            </Link>
            <Link
              to={`/canal/${slug}`}
              className="flex-1 flex items-center justify-center gap-2 border border-border rounded-xl py-3 text-sm hover:bg-muted transition"
            >
              Ver canal
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // ── Preview ──────────────────────────────────────────────────────────────────
  if (step === "preview") {
    const selectedType = CHANNEL_TYPES.find((t) => t.id === type)!;

    return (
      <AdminLayout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button
            onClick={() => setStep("form")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Editar
          </button>

          <div className="text-center mb-8">
            <Sparkles className="w-6 h-6 text-primary mx-auto mb-2" />
            <h1 className="text-xl font-bold">Prévia do canal</h1>
            <p className="text-sm text-muted-foreground">Veja como ficará antes de criar</p>
          </div>

          {/* Preview card */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg mb-6">
            {/* Banner */}
            <div className="h-28 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />

            {/* Channel info */}
            <div className="px-5 -mt-8 pb-5">
              <div className="flex items-end justify-between gap-4 mb-3">
                <div className="w-16 h-16 rounded-2xl border-4 border-background bg-primary/10 flex items-center justify-center shadow-lg text-2xl">
                  {selectedType.icon}
                </div>
                <span className="pb-1 text-xs bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full font-medium">
                  Seguir
                </span>
              </div>
              <h2 className="text-lg font-bold mb-1">{name || "Nome do canal"}</h2>
              <p className="text-xs text-muted-foreground mb-2">
                {selectedType.label} · 0 seguidores · 0 vídeos
              </p>
              {description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                canal.ecclesia/<span className="text-primary font-mono">{slug}</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => void handleCreate()}
            disabled={creating}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3.5 font-semibold text-sm hover:bg-primary/90 transition disabled:opacity-60"
          >
            {creating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Criando canal…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Criar canal
              </>
            )}
          </button>
        </div>
      </AdminLayout>
    );
  }

  // ── Formulário ───────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/canal" className="p-2 rounded-xl hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Criar canal</h1>
            <p className="text-xs text-muted-foreground">Seu espaço de vídeos no Canal Eclésia</p>
          </div>
        </div>

        <div className="space-y-5">

          {/* Nome */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Nome do canal *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ex: Assembleia de Deus Centro"
              maxLength={80}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Tipo de canal *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CHANNEL_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={`flex items-start gap-3 p-4 rounded-xl border text-left transition ${
                    type === t.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30 hover:bg-muted/50"
                  }`}
                >
                  <span className="text-2xl">{t.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">{t.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o canal: sobre quem é, que tipo de conteúdo terá…"
              rows={3}
              maxLength={500}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">{description.length}/500</p>
          </div>

          {/* Avatar + Banner placeholder */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/40 transition min-h-[96px]">
              <Tv2 className="w-7 h-7 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground text-center">Foto / avatar</p>
              <p className="text-[10px] text-muted-foreground/60 text-center">Upload na Fase 2</p>
            </div>
            <div className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/40 transition min-h-[96px]">
              <Upload className="w-7 h-7 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground text-center">Capa / banner</p>
              <p className="text-[10px] text-muted-foreground/60 text-center">Upload na Fase 2</p>
            </div>
          </div>

          {/* Slug */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Endereço do canal *
              </label>
              <button
                type="button"
                onClick={() => setSlugVisible(!slugVisible)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition"
              >
                {slugVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {slugVisible ? "Ocultar" : "Editar"}
              </button>
            </div>
            <div className={`${slugVisible ? "" : "pointer-events-none opacity-70"}`}>
              <div className="flex items-center border border-border rounded-xl overflow-hidden bg-background">
                <span className="px-3 py-3 text-sm text-muted-foreground bg-muted/50 border-r border-border whitespace-nowrap text-xs">
                  canal.ecclesia/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  className="flex-1 px-3 py-3 text-sm bg-transparent focus:outline-none font-mono"
                  placeholder="nome-do-canal"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Use letras minúsculas, números e hífens. Não pode ser alterado depois.
            </p>
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={handlePreview}
            disabled={!name.trim() || !slug.trim()}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3.5 font-semibold text-sm hover:bg-primary/90 transition disabled:opacity-50"
          >
            Ver prévia e criar
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
