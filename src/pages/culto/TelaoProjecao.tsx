import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { useLanguage } from "@/hooks/useLanguage";
import { useChurch } from "@/hooks/useChurchContext";
import {
  Monitor, ArrowLeft, ChevronLeft, ChevronRight, Maximize, Minimize, Type,
} from "lucide-react";
import { toast } from "sonner";
import {
  ensureWorshipLoaded,
  getSongs,
  getSetlists,
  getSetlistById,
  lyricsToSlides,
  setlistToSlides,
  worshipLoadErrorMessage,
  type ProjectionSlide,
} from "@/lib/worshipStorage";

export default function TelaoProjecao() {
  const { t } = useLanguage();
  const { church } = useChurch();
  const organizationId = church?.id;
  const [searchParams] = useSearchParams();

  const [presenting, setPresenting] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [fontSize, setFontSize] = useState<"md" | "lg" | "xl">("lg");
  const [manualText, setManualText] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [source, setSource] = useState<"manual" | "song" | "setlist">("manual");
  const [selectedSongId, setSelectedSongId] = useState("");
  const [selectedSetlistId, setSelectedSetlistId] = useState(searchParams.get("setlist") ?? "");
  const [hydrated, setHydrated] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setHydrated(0);
      setLoadFailed(false);
      return;
    }
    setLoadFailed(false);
    void ensureWorshipLoaded(organizationId)
      .then(() => {
        setHydrated((n) => n + 1);
        setLoadFailed(false);
      })
      .catch((err) => {
        setLoadFailed(true);
        toast.error(
          worshipLoadErrorMessage(err, t("Erro ao carregar dados para o telão")),
        );
      });
  }, [organizationId, t]);

  const songs = organizationId ? getSongs(organizationId) : [];
  const setlists = organizationId ? getSetlists(organizationId) : [];
  void hydrated;

  const slides: ProjectionSlide[] = useMemo(() => {
    if (source === "song" && selectedSongId) {
      const song = songs.find((s) => s.id === selectedSongId);
      if (song) return lyricsToSlides(song.title, song.lyrics);
    }
    if (source === "setlist" && selectedSetlistId && organizationId) {
      const setlist = getSetlistById(organizationId, selectedSetlistId);
      if (setlist) return setlistToSlides(organizationId, setlist);
    }
    if (manualText.trim()) return lyricsToSlides(manualTitle || t("Telão de Projeção"), manualText);
    return [];
  }, [source, selectedSongId, selectedSetlistId, manualText, manualTitle, songs, organizationId, t]);

  const current = slides[slideIndex];

  const goNext = useCallback(() => {
    setSlideIndex((i) => Math.min(i + 1, slides.length - 1));
  }, [slides.length]);

  const goPrev = useCallback(() => {
    setSlideIndex((i) => Math.max(i - 1, 0));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    setSlideIndex(0);
  }, [slides.length, source, selectedSongId, selectedSetlistId, manualText]);

  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "f" || e.key === "F") toggleFullscreen();
      if (e.key === "Escape") setPresenting(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, goNext, goPrev, toggleFullscreen]);

  const fontClass = fontSize === "xl" ? "text-4xl sm:text-6xl" : fontSize === "lg" ? "text-3xl sm:text-5xl" : "text-2xl sm:text-4xl";

  if (presenting && current) {
    return (
      <div className="fixed inset-0 z-[300] bg-black text-white flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-black/80 text-xs text-white/60">
          <span>{current.title} · {slideIndex + 1}/{slides.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setFontSize(fontSize === "md" ? "lg" : fontSize === "lg" ? "xl" : "md")} className="p-2 hover:text-white">
              <Type size={16} />
            </button>
            <button type="button" onClick={toggleFullscreen} className="p-2 hover:text-white">
              {document.fullscreenElement ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
            <button type="button" onClick={() => setPresenting(false)} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20">
              {t("Sair")}
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
          <p className={`${fontClass} font-serif leading-relaxed whitespace-pre-wrap max-w-5xl`}>
            {current.body}
          </p>
        </div>
        <div className="flex items-center justify-center gap-6 py-6 bg-black/80">
          <button type="button" onClick={goPrev} disabled={slideIndex === 0} className="p-3 rounded-full bg-white/10 disabled:opacity-30 hover:bg-white/20">
            <ChevronLeft size={24} />
          </button>
          <button type="button" onClick={goNext} disabled={slideIndex >= slides.length - 1} className="p-3 rounded-full bg-white/10 disabled:opacity-30 hover:bg-white/20">
            <ChevronRight size={24} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <Link to="/admin/culto" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft size={14} /> {t("Culto & Louvor")}
          </Link>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
            <Monitor className="text-purple-500" size={26} />
            {t("Telão de Projeção")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("Projete letras e leituras em tela cheia")}</p>
        </div>

        {loadFailed && (
          <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            {t("Não foi possível carregar músicas e roteiros. O modo manual ainda funciona.")}
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          {(["manual", "song", "setlist"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                source === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {s === "manual" ? t("Texto manual") : s === "song" ? t("Da biblioteca") : t("Do roteiro")}
            </button>
          ))}
        </div>

        {source === "manual" && (
          <div className="space-y-3 bg-card rounded-xl border border-border/50 p-4">
            <input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder={t("Título")}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder={t("Letra ou texto bíblico (linha em branco entre slides)")}
              rows={10}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-y"
            />
          </div>
        )}

        {source === "song" && (
          <select
            value={selectedSongId}
            onChange={(e) => setSelectedSongId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
          >
            <option value="">{t("Selecionar música")}</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        )}

        {source === "setlist" && (
          <select
            value={selectedSetlistId}
            onChange={(e) => setSelectedSetlistId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
          >
            <option value="">{t("Selecionar roteiro")}</option>
            {setlists.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        )}

        <p className="text-xs text-muted-foreground">
          {slides.length > 0 ? `${slides.length} slide(s) · ${t("Use setas ou espaço no telão")}` : t("Selecione conteúdo para projetar")}
        </p>

        <button
          type="button"
          disabled={slides.length === 0}
          onClick={() => setPresenting(true)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          <Maximize size={18} /> {t("Iniciar projeção")}
        </button>
      </div>
    </AdminLayout>
  );
}
