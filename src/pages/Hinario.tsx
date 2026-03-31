import { useState } from "react";
import { Music, Search, Play, Upload, ExternalLink, Youtube, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/useLanguage";
import { todosOsHinos, categoriasHinos, type HinoData } from "@/data/hinos-cantor-cristao";

const categorias = categoriasHinos;

export default function Hinario() {
  const { t } = useLanguage();
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [hinoSelecionado, setHinoSelecionado] = useState<HinoData | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const hinosFiltrados = todosOsHinos.filter(h => {
    const matchBusca = busca === "" || 
      h.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      h.numero.toString().includes(busca);
    const matchCategoria = !categoriaFiltro || h.categoria === categoriaFiltro;
    return matchBusca && matchCategoria;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
            <Music className="text-accent" size={28} />
            {t("Harpa - Hinário Digital")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Hinos clássicos da fé cristã com letra e áudio")}
          </p>
        </div>
        <Button
          onClick={() => setShowUploadDialog(true)}
          variant="outline"
          className="gap-2"
        >
          <Upload size={16} />
          {t("Enviar Hino")}
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            placeholder={t("Buscar por número ou título...")}
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={categoriaFiltro === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setCategoriaFiltro(null)}
          >
            {t("Todos")}
          </Badge>
          {categorias.map(cat => (
            <Badge
              key={cat}
              variant={categoriaFiltro === cat ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setCategoriaFiltro(cat === categoriaFiltro ? null : cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-accent">{todosOsHinos.length}</p>
            <p className="text-xs text-muted-foreground">{t("Hinos Disponíveis")}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-accent">{categorias.length}</p>
            <p className="text-xs text-muted-foreground">{t("Categorias")}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-accent">{todosOsHinos.filter(h => h.youtubeId).length}</p>
            <p className="text-xs text-muted-foreground">{t("Com Áudio")}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">0</p>
            <p className="text-xs text-muted-foreground">{t("Uploads da Igreja")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Hymn List */}
      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">{t("Lista")}</TabsTrigger>
          <TabsTrigger value="categorias">{t("Por Categoria")}</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-4">
          <div className="grid gap-2">
            {hinosFiltrados.map(hino => (
              <Card
                key={hino.numero}
                className="cursor-pointer hover:bg-secondary/50 transition-colors"
                onClick={() => setHinoSelecionado(hino)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-accent font-bold text-sm">{hino.numero}</span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{hino.titulo}</p>
                      <Badge variant="secondary" className="text-[10px] mt-1">{hino.categoria}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hino.youtubeId && (
                      <Youtube size={18} className="text-destructive" />
                    )}
                    <Play size={16} className="text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
            {hinosFiltrados.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Music size={40} className="mx-auto mb-3 opacity-50" />
                <p>{t("Nenhum hino encontrado")}</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="categorias" className="mt-4">
          <div className="space-y-6">
            {categorias.map(cat => {
              const hinos = hinosFiltrados.filter(h => h.categoria === cat);
              if (hinos.length === 0) return null;
              return (
                <div key={cat}>
                  <h3 className="text-lg font-serif font-bold text-foreground mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent" />
                    {cat}
                    <Badge variant="secondary" className="text-xs">{hinos.length}</Badge>
                  </h3>
                  <div className="grid gap-2">
                    {hinos.map(hino => (
                      <Card
                        key={hino.numero}
                        className="cursor-pointer hover:bg-secondary/50 transition-colors"
                        onClick={() => setHinoSelecionado(hino)}
                      >
                        <CardContent className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-accent font-bold text-sm w-8 text-center">{hino.numero}</span>
                            <span className="font-medium text-foreground text-sm">{hino.titulo}</span>
                          </div>
                          {hino.youtubeId && <Youtube size={16} className="text-destructive" />}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Hymn Detail Dialog */}
      <Dialog open={!!hinoSelecionado} onOpenChange={(open) => !open && setHinoSelecionado(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          {hinoSelecionado && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <span className="text-accent font-bold">{hinoSelecionado.numero}</span>
                  </div>
                  <div>
                    <p className="font-serif">{hinoSelecionado.titulo}</p>
                    <Badge variant="secondary" className="text-xs mt-1">{hinoSelecionado.categoria}</Badge>
                  </div>
                </DialogTitle>
              </DialogHeader>

              {/* YouTube Player */}
              {hinoSelecionado.youtubeId && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Youtube size={16} className="text-destructive" />
                    {t("Ouvir no YouTube")}
                  </h4>
                  <button
                    onClick={() => {
                      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(hinoSelecionado.titulo + " hino")}`;
                      const win = window.open(url, "_blank", "noopener,noreferrer");
                      if (!win) {
                        // Fallback: copy URL to clipboard
                        navigator.clipboard.writeText(url);
                        alert("Link copiado! Cole no navegador: " + url);
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-3 bg-destructive/10 rounded-lg text-destructive hover:bg-destructive/20 transition-colors w-full"
                  >
                    <Play size={18} />
                    <span className="font-medium text-sm">{t("Buscar no YouTube")}</span>
                    <ExternalLink size={14} className="ml-auto" />
                  </button>
                </div>
              )}

              {/* Lyrics */}
              {hinoSelecionado.letra && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{t("Letra")}</h4>
                  <div className="bg-secondary/50 rounded-lg p-4">
                    <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">
                      {hinoSelecionado.letra}
                    </pre>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload size={20} className="text-accent" />
              {t("Enviar Hino da Igreja")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              {t("Envie hinos e louvores próprios da sua igreja. Formatos aceitos: MP3, MP4, WAV.")}
            </p>
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <Upload size={32} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">{t("Arraste o arquivo aqui ou clique para selecionar")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("Em breve disponível")}</p>
            </div>
            <p className="text-xs text-muted-foreground italic">
              {t("* O upload de áudio será habilitado em breve. Você poderá enviar gravações de ensaios, louvores próprios da congregação e muito mais.")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
