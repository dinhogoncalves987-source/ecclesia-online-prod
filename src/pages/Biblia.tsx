import { AdminLayout } from "@/components/AdminLayout";
import { ChevronLeft, ChevronRight, Search, Bookmark, Eye, MessageSquare, Send, X, Sparkles, Trash2, BookOpen, Loader2, Mic, MicOff, Download, Share2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { bibleBooks, oldTestamentBooks, newTestamentBooks, type BibleBook } from "@/data/bible-books";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLanguage } from "@/hooks/useLanguage";

type Verse = { num: number; text: string };
type ChatMessage = { role: "user" | "assistant"; content: string };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const VERSES_URL = `${SUPABASE_URL}/functions/v1/bible-verses`;
const CHAT_URL = `${SUPABASE_URL}/functions/v1/bible-chat`;

const quickPrompts = [
  { label: "Esboço de pregação", prompt: "Crie um esboço completo de pregação sobre" },
  { label: "Estudo profundo", prompt: "Faça um estudo bíblico profundo sobre" },
  { label: "Contexto histórico", prompt: "Explique o contexto histórico de" },
  { label: "Aplicação prática", prompt: "Quais são as aplicações práticas de" },
];

export default function Biblia() {
  const { t } = useLanguage();
  const [zenMode, setZenMode] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [largeFont, setLargeFont] = useState(false);
  const [bookPickerOpen, setBookPickerOpen] = useState(false);
  const [selectedBookIndex, setSelectedBookIndex] = useState(0);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isChatListening, setIsChatListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const versesRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const selectedBook = bibleBooks[selectedBookIndex];

  const fetchVerses = useCallback(async (book: BibleBook, chapter: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        bookId: book.bookId.toString(),
        chapter: chapter.toString(),
      });
      const resp = await fetch(`${VERSES_URL}?${params}`, {
        headers: { Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (!resp.ok) throw new Error("Erro ao buscar versículos");
      const data = await resp.json();
      setVerses(data.verses || []);
    } catch (e) {
      console.error("Fetch verses error:", e);
      setVerses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChapter !== null) {
      fetchVerses(selectedBook, selectedChapter);
    }
  }, [selectedBookIndex, selectedChapter, fetchVerses]);

  useEffect(() => {
    if (versesRef.current) versesRef.current.scrollTop = 0;
  }, [selectedBookIndex, selectedChapter]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const goToBook = (index: number) => {
    setSelectedBookIndex(index);
    setSelectedChapter(null);
    setVerses([]);
    setBookPickerOpen(false);
  };

  const selectChapter = (ch: number) => {
    setSelectedChapter(ch);
  };

  const prevChapter = () => {
    if (selectedChapter !== null && selectedChapter > 1) {
      setSelectedChapter(selectedChapter - 1);
    } else if (selectedBookIndex > 0) {
      const prevBook = bibleBooks[selectedBookIndex - 1];
      setSelectedBookIndex(selectedBookIndex - 1);
      setSelectedChapter(prevBook.chapters);
    }
  };

  const nextChapter = () => {
    if (selectedChapter !== null && selectedChapter < selectedBook.chapters) {
      setSelectedChapter(selectedChapter + 1);
    } else if (selectedBookIndex < bibleBooks.length - 1) {
      setSelectedBookIndex(selectedBookIndex + 1);
      setSelectedChapter(1);
    }
  };

  const hasPrev = selectedBookIndex > 0 || (selectedChapter !== null && selectedChapter > 1);
  const hasNext = selectedBookIndex < bibleBooks.length - 1 || (selectedChapter !== null && selectedChapter < selectedBook.chapters);

  // Chat logic
  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setIsLoading(true);
    let assistantSoFar = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ messages: allMessages }),
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSearchQuery(transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    setIsListening(true);
    recognition.start();
  };

  const startChatVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev ? prev + " " + transcript : transcript);
      setIsChatListening(false);
    };
    recognition.onerror = () => setIsChatListening(false);
    recognition.onend = () => setIsChatListening(false);
    setIsChatListening(true);
    recognition.start();
  };

  const downloadMessage = (content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estudo-biblico-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareMessage = async (content: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Estudo Bíblico", text: content });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(content);
      alert("Texto copiado!");
    }
  };

  const filteredOT = searchQuery
    ? oldTestamentBooks.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : oldTestamentBooks;
  const filteredNT = searchQuery
    ? newTestamentBooks.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : newTestamentBooks;

  // Book Picker
  const bookPicker = (
    <AnimatePresence>
      {bookPickerOpen && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
          <div className="bg-card rounded-xl shadow-executive p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-base">Selecionar Livro</h3>
                <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar livro..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-input bg-background text-xs w-36 sm:w-48 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <button onClick={startVoiceSearch} className={`p-1.5 rounded-lg transition-colors ${isListening ? "bg-destructive/10 text-destructive animate-pulse" : "hover:bg-secondary text-muted-foreground"}`} title="Pesquisa por voz">
                  {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
                <button onClick={() => { setBookPickerOpen(false); setSearchQuery(""); }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {filteredOT.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Antigo Testamento</p>
                <div className="flex flex-wrap gap-1.5">
                  {filteredOT.map(b => {
                    const idx = bibleBooks.indexOf(b);
                    return (
                      <button key={idx} onClick={() => goToBook(idx)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          idx === selectedBookIndex ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}>
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredNT.length > 0 && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">Novo Testamento</p>
                <div className="flex flex-wrap gap-1.5">
                  {filteredNT.map(b => {
                    const idx = bibleBooks.indexOf(b);
                    return (
                      <button key={idx} onClick={() => goToBook(idx)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          idx === selectedBookIndex ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}>
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Chapter Selector
  const chapterSelector = (
    <div className="bg-card rounded-xl shadow-executive p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setBookPickerOpen(!bookPickerOpen)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold font-serif hover:text-primary transition-colors">
          <BookOpen size={16} strokeWidth={1.5} />
          {selectedBook.name}
          <span className="text-xs text-muted-foreground font-normal">
            ({selectedBook.testament === "AT" ? "AT" : "NT"})
          </span>
        </button>
        <span className="text-xs text-muted-foreground">{selectedBook.chapters} capítulos</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: selectedBook.chapters }).map((_, i) => (
          <button key={i} onClick={() => selectChapter(i + 1)}
            className={`w-8 h-8 rounded-lg text-xs font-medium tabular-nums transition-colors ${
              i + 1 === selectedChapter ? "bg-accent text-accent-foreground" : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
            }`}>
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );

  // Chat Panel
  const chatPanel = (
    <AnimatePresence>
      {chatOpen && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
          className="bg-card rounded-xl shadow-executive flex flex-col h-[500px] lg:h-[600px] overflow-hidden">
          <div className="p-4 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              <h3 className="font-serif text-sm">Assistente Bíblico</h3>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={() => setMessages([])} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="Limpar conversa">
                  <Trash2 size={14} strokeWidth={1.5} className="text-muted-foreground" />
                </button>
              )}
              <button onClick={() => setChatOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="p-3 bg-accent/10 rounded-xl mb-3">
                  <Sparkles size={24} className="text-accent" />
                </div>
                <div>
                  <p className="font-serif text-sm font-medium">Assistente Bíblico com IA</p>
                  <p className="text-xs text-muted-foreground mt-1">Faça perguntas, peça esboços e estudos profundos.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4 w-full max-w-xs">
                  {quickPrompts.map(qp => (
                    <button key={qp.label} onClick={() => setInput(qp.prompt + " ")}
                      className="text-left p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
             {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%]">
                  <div className={`rounded-xl px-3 py-2 text-sm ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary/70"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : <p>{msg.content}</p>}
                  </div>
                  {msg.role === "assistant" && msg.content && !isLoading && (
                    <div className="flex gap-1 mt-1 ml-1">
                      <button onClick={() => downloadMessage(msg.content)} className="p-1 rounded hover:bg-secondary transition-colors" title="Baixar">
                        <Download size={12} className="text-muted-foreground" />
                      </button>
                      <button onClick={() => shareMessage(msg.content)} className="p-1 rounded hover:bg-secondary transition-colors" title="Compartilhar">
                        <Share2 size={12} className="text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-secondary/70 rounded-xl px-3 py-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border/50">
            <div className="flex gap-2 items-end">
              <button
                onClick={startChatVoice}
                disabled={isLoading}
                className={`p-2.5 rounded-lg shrink-0 transition-colors ${
                  isChatListening ? "bg-destructive/10 text-destructive animate-pulse" : "hover:bg-secondary text-muted-foreground"
                }`}
                title="Falar com microfone"
              >
                {isChatListening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre a Bíblia..."
                rows={2}
                className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-base sm:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-h-32"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Toggle chat + scroll on mobile
  const toggleChat = () => {
    const next = !chatOpen;
    setChatOpen(next);
    if (next) {
      setTimeout(() => chatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }
  };

  // Main Content
  const content = (
    <div className={`${chatOpen && !zenMode ? "lg:grid lg:grid-cols-[1fr_420px] lg:gap-6" : ""} space-y-6 lg:space-y-0`}>
      <div className="space-y-6">
        {!zenMode && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif tracking-tight">Bíblia Sagrada</h1>
              <p className="text-sm text-muted-foreground mt-1">Leitura e meditação — Tradução Almeida</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setLargeFont(!largeFont)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  largeFont ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
                }`}>
                <span className="text-xs font-bold">Aa+</span> Letras Gigantes
              </button>
              <button onClick={toggleChat}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  chatOpen ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
                }`}>
                <MessageSquare size={14} strokeWidth={1.5} /> Assistente IA
              </button>
              <button onClick={() => setZenMode(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
                <Eye size={14} strokeWidth={1.5} /> Modo Zen
              </button>
            </div>
          </div>
        )}

        {!zenMode && bookPicker}
        {!zenMode && chapterSelector}

        {/* Mobile: AI Chat always visible below chapter selector */}
        {!zenMode && (
          <div ref={chatRef} className="lg:hidden">
            {chatOpen ? (
              chatPanel
            ) : (
              <button
                onClick={toggleChat}
                className="w-full bg-card rounded-xl shadow-executive p-5 flex items-center gap-3 hover:bg-secondary/30 transition-colors"
              >
                <div className="p-2.5 bg-accent/10 rounded-xl">
                  <Sparkles size={20} className="text-accent" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-serif text-sm font-medium">Assistente Bíblico com IA</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Toque para perguntar, pedir esboços e estudos</p>
                </div>
                <MessageSquare size={18} className="text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {/* Scripture — only show when a chapter is selected */}
        {selectedChapter !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            key={`${selectedBookIndex}-${selectedChapter}`}
            className={`bg-card rounded-xl shadow-executive ${zenMode ? "max-w-2xl mx-auto" : ""}`}
          >
            <div className="p-5 sm:p-8" ref={versesRef}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <button onClick={prevChapter} disabled={!hasPrev}
                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-30">
                    <ChevronLeft size={18} strokeWidth={1.5} />
                  </button>
                  <button onClick={() => { if (!zenMode) setBookPickerOpen(!bookPickerOpen); }} className="text-center">
                    <h2 className="font-serif text-lg hover:text-primary transition-colors">{selectedBook.name}</h2>
                    <p className="text-xs text-muted-foreground">Capítulo {selectedChapter}</p>
                  </button>
                  <button onClick={nextChapter} disabled={!hasNext}
                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors disabled:opacity-30">
                    <ChevronRight size={18} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="flex gap-1">
                  <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                    <Bookmark size={16} strokeWidth={1.5} className="text-muted-foreground" />
                  </button>
                  {zenMode && (
                    <>
                      <button onClick={toggleChat}
                        className={`p-2 rounded-lg transition-colors ${chatOpen ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
                        <MessageSquare size={16} strokeWidth={1.5} className={chatOpen ? "" : "text-muted-foreground"} />
                      </button>
                      <button onClick={() => setZenMode(false)}
                        className="p-2 rounded-lg hover:bg-secondary transition-colors text-xs font-medium text-muted-foreground">
                        Sair
                      </button>
                    </>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={24} className="animate-spin text-muted-foreground" />
                </div>
              ) : verses.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  <p>Não foi possível carregar este capítulo.</p>
                  <button onClick={() => fetchVerses(selectedBook, selectedChapter)} className="mt-2 text-primary underline text-xs">
                    Tentar novamente
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {verses.map(v => (
                    <p key={v.num} className={`font-serif leading-relaxed ${largeFont ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`}>
                      <sup className={`text-accent font-sans font-bold mr-1.5 tabular-nums ${largeFont ? "text-sm" : "text-xs"}`}>{v.num}</sup>
                      {v.text}
                    </p>
                  ))}
                </div>
              )}

              {!loading && verses.length > 0 && (
                <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
                  <button onClick={prevChapter} disabled={!hasPrev}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                    <ChevronLeft size={14} /> Anterior
                  </button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {selectedBook.name} {selectedChapter} / {selectedBook.chapters}
                  </span>
                  <button onClick={nextChapter} disabled={!hasNext}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                    Próximo <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* No chapter selected message */}
        {selectedChapter === null && !zenMode && (
          <div className="bg-card rounded-xl shadow-executive p-8 text-center">
            <BookOpen size={32} className="mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Selecione um capítulo acima para começar a leitura</p>
          </div>
        )}
      </div>

      {/* Desktop: chat sidebar */}
      {chatOpen && !zenMode && <div className="hidden lg:block">{chatPanel}</div>}
      {zenMode && chatPanel}
    </div>
  );

  if (zenMode) {
    return <div className="min-h-screen bg-background p-4 sm:p-8">{content}</div>;
  }

  return <AdminLayout>{content}</AdminLayout>;
}
