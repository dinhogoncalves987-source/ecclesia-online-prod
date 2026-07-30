import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { TvAdminNav } from "@/components/tv/TvAdminNav";
import { useChurch } from "@/hooks/useChurchContext";
import {
  fetchTvChannels,
  fetchTvPrograms,
  fetchScheduleBlocks,
  upsertScheduleBlock,
  upsertTvProgram,
  type TvChannel,
  type TvProgram,
  type TvScheduleBlock,
  PROGRAM_TYPE_LABELS,
  type TvBlockType,
} from "@/lib/tvDigital";
import { CalendarDays, Plus, Clock, X, Tv2 } from "lucide-react";
import { toast } from "sonner";

type BlockForm = {
  channelId: string;
  programId: string;
  startTime: string;
  endTime: string;
  blockType: TvBlockType;
  recurrenceRule: string;
  sourceAssetUrl: string;
};

const EMPTY_BLOCK: BlockForm = {
  channelId: "", programId: "", startTime: "", endTime: "",
  blockType: "program", recurrenceRule: "", sourceAssetUrl: "",
};

export default function TvProgramacao() {
  const { church } = useChurch();
  const orgId = church?.id ?? "";

  const [channels, setChannels] = useState<TvChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [programs, setPrograms] = useState<TvProgram[]>([]);
  const [blocks, setBlocks] = useState<TvScheduleBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockForm, setBlockForm] = useState<BlockForm>(EMPTY_BLOCK);
  const [saving, setSaving] = useState(false);

  // Program quick-create
  const [showProgramForm, setShowProgramForm] = useState(false);
  const [progTitle, setProgTitle] = useState("");
  const [progType, setProgType] = useState<keyof typeof PROGRAM_TYPE_LABELS>("culto");
  const [progDuration, setProgDuration] = useState(60);
  const [savingProg, setSavingProg] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    void fetchTvChannels(orgId).then((ch) => {
      setChannels(ch);
      if (ch.length > 0) setSelectedChannelId(ch[0].id);
    });
  }, [orgId]);

  useEffect(() => {
    if (!selectedChannelId) return;
    void loadChannelData(selectedChannelId);
  }, [selectedChannelId]);

  async function loadChannelData(channelId: string) {
    setLoading(true);
    const [progs, blks] = await Promise.all([
      fetchTvPrograms(channelId),
      fetchScheduleBlocks(channelId, undefined, 14),
    ]);
    setPrograms(progs);
    setBlocks(blks);
    setLoading(false);
  }

  async function handleSaveBlock() {
    if (!blockForm.channelId) { toast.error("Selecione um canal."); return; }
    if (!blockForm.startTime || !blockForm.endTime) { toast.error("Informe horário de início e fim."); return; }
    if (new Date(blockForm.endTime) <= new Date(blockForm.startTime)) {
      toast.error("O horário de fim deve ser depois do início."); return;
    }
    setSaving(true);
    const result = await upsertScheduleBlock(orgId, blockForm.channelId, {
      programId: blockForm.programId || null,
      startTime: blockForm.startTime,
      endTime: blockForm.endTime,
      blockType: blockForm.blockType,
      recurrenceRule: blockForm.recurrenceRule || null,
      sourceAssetUrl: blockForm.sourceAssetUrl || null,
    });
    setSaving(false);
    if (!result.ok) { toast.error(`Erro: ${result.error}`); return; }
    toast.success("Bloco adicionado à grade.");
    setShowBlockForm(false);
    setBlockForm(EMPTY_BLOCK);
    await loadChannelData(selectedChannelId);
  }

  async function handleSaveProgram() {
    if (!progTitle.trim()) { toast.error("Informe o título do programa."); return; }
    setSavingProg(true);
    const result = await upsertTvProgram(orgId, selectedChannelId, {
      title: progTitle,
      programType: progType,
      defaultDurationMinutes: progDuration,
    });
    setSavingProg(false);
    if (!result.ok) { toast.error(`Erro: ${result.error}`); return; }
    toast.success("Programa criado.");
    setShowProgramForm(false);
    setProgTitle("");
    setPrograms((prev) => [...prev, result.program!]);
  }

  function formatBlockTime(block: TvScheduleBlock): string {
    const start = new Date(block.startTime);
    const end = new Date(block.endTime);
    return `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · ${start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }

  const blockTypeColors: Record<TvBlockType, string> = {
    live: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
    replay: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    program: "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400",
    interval: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400",
    placeholder: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
  };

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <CalendarDays className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Grade de Programação</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowProgramForm(true)}
              className="flex items-center gap-1 border border-border px-3 py-2 rounded-lg text-sm hover:bg-muted transition"
            >
              <Plus className="w-4 h-4" />
              Programa
            </button>
            <button
              onClick={() => { setBlockForm({ ...EMPTY_BLOCK, channelId: selectedChannelId }); setShowBlockForm(true); }}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition"
              disabled={!selectedChannelId}
            >
              <Plus className="w-4 h-4" />
              Adicionar bloco
            </button>
          </div>
        </div>

        <TvAdminNav />

        {/* Seletor de canal */}
        <div className="flex items-center gap-3 mb-6">
          <Tv2 className="w-4 h-4 text-muted-foreground" />
          <select
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background"
            value={selectedChannelId}
            onChange={(e) => setSelectedChannelId(e.target.value)}
          >
            {channels.length === 0 && <option value="">Nenhum canal</option>}
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        </div>

        {/* Formulário de programa */}
        {showProgramForm && (
          <div className="bg-card border border-border rounded-xl p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Novo programa</h2>
              <button onClick={() => setShowProgramForm(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Título *</label>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={progTitle}
                  onChange={(e) => setProgTitle(e.target.value)}
                  placeholder="Culto Dominical"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
                <select
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={progType}
                  onChange={(e) => setProgType(e.target.value as typeof progType)}
                >
                  {(Object.entries(PROGRAM_TYPE_LABELS) as [keyof typeof PROGRAM_TYPE_LABELS, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Duração padrão (min)</label>
                <input
                  type="number" min={5} max={480} step={5}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={progDuration}
                  onChange={(e) => setProgDuration(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowProgramForm(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition">Cancelar</button>
              <button onClick={handleSaveProgram} disabled={savingProg} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50">
                {savingProg ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        )}

        {/* Formulário de bloco */}
        {showBlockForm && (
          <div className="bg-card border border-border rounded-xl p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Adicionar bloco à grade</h2>
              <button onClick={() => setShowBlockForm(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Canal</label>
                <select
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={blockForm.channelId}
                  onChange={(e) => setBlockForm((f) => ({ ...f, channelId: e.target.value }))}
                >
                  {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de bloco</label>
                <select
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={blockForm.blockType}
                  onChange={(e) => setBlockForm((f) => ({ ...f, blockType: e.target.value as TvBlockType }))}
                >
                  <option value="live">Ao Vivo</option>
                  <option value="replay">Reprise</option>
                  <option value="program">Programa</option>
                  <option value="interval">Intervalo</option>
                  <option value="placeholder">Reservado</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Início *</label>
                <input
                  type="datetime-local"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={blockForm.startTime}
                  onChange={(e) => setBlockForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Fim *</label>
                <input
                  type="datetime-local"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={blockForm.endTime}
                  onChange={(e) => setBlockForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Programa (opcional)</label>
                <select
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  value={blockForm.programId}
                  onChange={(e) => setBlockForm((f) => ({ ...f, programId: e.target.value }))}
                >
                  <option value="">Sem programa vinculado</option>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">URL de asset (HLS para replay)</label>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                  value={blockForm.sourceAssetUrl}
                  onChange={(e) => setBlockForm((f) => ({ ...f, sourceAssetUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Recorrência RRULE (opcional)
                </label>
                <input
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                  value={blockForm.recurrenceRule}
                  onChange={(e) => setBlockForm((f) => ({ ...f, recurrenceRule: e.target.value }))}
                  placeholder="Ex: FREQ=WEEKLY;BYDAY=SU (todo domingo)"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowBlockForm(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition">Cancelar</button>
              <button onClick={handleSaveBlock} disabled={saving} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50">
                {saving ? "Salvando…" : "Adicionar"}
              </button>
            </div>
          </div>
        )}

        {/* Grade */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : blocks.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-xl flex flex-col items-center justify-center py-16 text-muted-foreground">
            <CalendarDays className="w-10 h-10 mb-3 opacity-30" />
            <p>Nenhum bloco na grade ainda</p>
            <button
              onClick={() => { setBlockForm({ ...EMPTY_BLOCK, channelId: selectedChannelId }); setShowBlockForm(true); }}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Adicionar primeiro bloco
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {blocks.map((block) => (
              <div
                key={block.id}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4"
              >
                <div className="hidden sm:flex flex-col items-center min-w-[80px]">
                  <Clock className="w-4 h-4 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground text-center">
                    {new Date(block.startTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-xs text-muted-foreground">–</span>
                  <span className="text-xs text-muted-foreground text-center">
                    {new Date(block.endTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{block.programTitle ?? "(sem programa)"}</p>
                  <p className="text-xs text-muted-foreground sm:hidden">{formatBlockTime(block)}</p>
                  <p className="text-xs text-muted-foreground hidden sm:block">
                    {new Date(block.startTime).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full flex-shrink-0 ${blockTypeColors[block.blockType]}`}>
                  {block.blockType === "live" ? "AO VIVO" :
                   block.blockType === "replay" ? "REPRISE" :
                   block.blockType === "program" ? "PROGRAMA" :
                   block.blockType === "interval" ? "INTERVALO" : "RESERVADO"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
