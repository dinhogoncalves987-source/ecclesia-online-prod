import { useState, useRef, useEffect, useCallback } from "react";
import { Music, Search, Play, Upload, ExternalLink, Youtube, Sparkles, Send, X, Loader2, Mic, MicOff, Plus, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLanguage } from "@/hooks/useLanguage";
import { AdminLayout } from "@/components/AdminLayout";
import { todosOsHinos, categoriasHinos, type HinoData } from "@/data/hinos-cantor-cristao";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

const categorias = categoriasHinos;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const CHAT_URL = `${SUPABASE_URL}/functions/v1/hymn-chat`;

type ChatMessage = { role: "user" | "assistant"; content: string };

// Build catalog string for AI context
const hymnCatalog = todosOsHinos
  .map(h => `#${h.numero} - ${h.titulo} [${h.categoria}]`)
  .join("\n");

const quickPrompts = [
  { label: "Escala de culto", prompt: "Monte uma escala de louvor completa para um culto de domingo com 5 hinos do nosso catálogo" },
  { label: "Hinos de adoração", prompt: "Quais são os melhores hinos de adoração que temos no catálogo?" },
  { label: "Culto temático", prompt: "Sugira hinos para um culto sobre a graça de Deus" },
  { label: "Conexão bíblica", prompt: "Quais hinos combinam com o Salmo 23?" },
];

export default function Hinario() {
  const { t } = useLanguage();
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [hinoSelecionado, setHinoSelecionado] = useState<HinoData | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isChatListening, setIsChatListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const hinosFiltrados = todosOsHinos.filter(h => {
    const matchBusca = busca === "" ||
      h.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      h.numero.toString().includes(busca);
    const matchCategoria = !categoriaFiltro || h.categoria === categoriaFiltro;
    return matchBusca && matchCategoria;
  });

  // Chat logic
  const sendMessage = async (messageText?: string) => {
    const text = messageText || chatInput.trim();
    if (!text || isLoading) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setChatInput("");
    setIsLoading(true);
    let assistantSoFar = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ messages: allMessages, hymnCatalog }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${resp.status}`);
      }
      if (!resp.body) throw new Error("Sem resposta");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      const updateAssistant = (content: string) => {
        assistantSoFar += content;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const c = JSON.parse(json).choices?.[0]?.delta?.content;
            if (c) updateAssistant(c);
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${e instanceof Error ? e.message : "Erro"}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Voice for chat
  const startChatVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert(t("Seu navegador não suporta reconhecimento de voz.")); return; }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = true;
      let finalText = "";
      recognition.onresult = (event: any) => {
        let interim = "";
        finalText = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalText += event.results[i][0].transcript + " ";
          else interim += event.results[i][0].transcript;
        }
        setVoiceTranscript((finalText + interim).trim());
      };
      recognition.onerror = (event: any) => {
        if (event.error === "not-allowed") alert(t("Permissão de microfone negada."));
        stopChatVoice(false);
      };
      recognition.onend = () => { if (recognitionRef.current) try { recognitionRef.current.start(); } catch {} };
      recognitionRef.current = recognition;
      setIsChatListening(true);
      setVoiceTranscript("");
      recognition.start();
    } catch { alert(t("Erro ao iniciar microfone.")); }
  };

  const stopChatVoice = (send: boolean) => {
    if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.stop(); recognitionRef.current = null; }
    setIsChatListening(false);
    if (send && voiceTranscript.trim()) { sendMessage(voiceTranscript.trim()); }
    setVoiceTranscript("");
  };

  return (
    <AdminLayout>
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
          <div className="flex gap-2">
            <Button
              onClick={() => setChatOpen(!chatOpen)}
              variant={chatOpen ? "default" : "outline"}
              className="gap-2"
            >
              <Sparkles size={16} />
              {t("Assistente IA")}
            </Button>
            <Button
              onClick={() => setShowUploadDialog(true)}
              variant="outline"
              className="gap-2"
            >
              <Upload size={16} />
              {t("Enviar Hino")}
            </Button>
          </div>
        </div>

        {/* AI Chat Panel */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Card className="border-accent/30 bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Sparkles size={16} className="text-accent" />
                      {t("Assistente de Hinos")}
                    </h3>
                    <button onClick={() => setChatOpen(false)} className="p-1 rounded hover:bg-secondary">
                      <X size={16} className="text-muted-foreground" />
                    </button>
                  </div>

                  {/* Quick prompts */}
                  {messages.length === 0 && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {quickPrompts.map((qp, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(qp.prompt)}
                          className="text-left text-xs p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                        >
                          {t(qp.label)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Messages */}
                  {messages.length > 0 && (
                    <div ref={scrollRef} className="space-y-3 max-h-[300px] overflow-y-auto mb-3 pr-1">
                      {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-foreground"
                          }`}>
                            {msg.role === "assistant" ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              </div>
                            ) : msg.content}
                          </div>
                        </div>
                      ))}
                      {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                        <div className="flex justify-start">
                          <div className="bg-secondary rounded-xl px-3 py-2">
                            <Loader2 size={16} className="animate-spin text-accent" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Voice transcript */}
                  {isChatListening && (
                    <div className="mb-2 p-2 rounded-lg bg-accent/10 border border-accent/20">
                      <p className="text-xs text-muted-foreground mb-1">🎤 {t("Ouvindo...")}</p>
                      <p className="text-sm text-foreground">{voiceTranscript || "..."}</p>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => stopChatVoice(true)} className="text-xs px-2 py-1 bg-accent text-accent-foreground rounded">✓ {t("Enviar")}</button>
                        <button onClick={() => stopChatVoice(false)} className="text-xs px-2 py-1 bg-secondary text-foreground rounded">✕ {t("Cancelar")}</button>
                      </div>
                    </div>
                  )}

                  {/* Chat input */}
                  <div className="flex gap-2 items-end">
                    <button
                      onClick={isChatListening ? () => stopChatVoice(false) : startChatVoice}
                      className={`p-2 rounded-lg transition-colors flex-shrink-0 ${isChatListening ? "bg-destructive text-destructive-foreground" : "bg-secondary hover:bg-secondary/80 text-muted-foreground"}`}
                    >
                      {isChatListening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                    <textarea
                      ref={textareaRef}
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder={t("Pergunte sobre hinos, peça sugestões...")}
                      className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[40px] max-h-[100px] focus:outline-none focus:ring-1 focus:ring-ring"
                      rows={1}
                    />
                    <button
                      onClick={() => sendMessage()}
                      disabled={isLoading || !chatInput.trim()}
                      className="p-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search & Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input
              placeholder={t("Ex: 2 ou Santo, Santo...")}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-10 w-full"
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
              <p className="text-2xl font-bold text-accent">{todosOsHinos.length}</p>
              <p className="text-xs text-muted-foreground">{t("Com Letra")}</p>
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
                      <Youtube size={18} className="text-destructive" />
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
                            <Youtube size={16} className="text-destructive" />
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
                  <DialogDescription className="sr-only">
                    {t("Detalhes do hino")} {hinoSelecionado.numero}
                  </DialogDescription>
                </DialogHeader>

                {/* YouTube Search Button */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Youtube size={16} className="text-destructive" />
                    {t("Ouvir no YouTube")}
                  </h4>
                  <button
                    onClick={() => {
                      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(hinoSelecionado.titulo + " hino cantor cristão")}`;
                      const win = window.open(url, "_blank", "noopener,noreferrer");
                      if (!win) {
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
              <DialogDescription className="sr-only">
                {t("Upload de hinos da igreja")}
              </DialogDescription>
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
    </AdminLayout>
  );
}
