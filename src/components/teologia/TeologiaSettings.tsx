/**
 * Configurações (OPERAÇÃO 3) — modelos de avaliação configuráveis, que
 * substituem os antigos Mod01/Mod02/Mod03 do WinTechi (ver §5/§9.1 da
 * operação e docs/architecture/operacao-3-teologia.md). Um modelo único com
 * componentes/pesos configuráveis, em vez de três telas fixas.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Settings2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  loadTheologyAssessmentModels, createTheologyAssessmentModel,
  loadTheologyAssessmentModelComponents, createTheologyAssessmentModelComponent,
  loadTheologyPrograms,
  type TheologyAssessmentModelRow, type TheologyAssessmentModelComponentRow, type TheologyProgramRow,
} from "@/lib/theology/service";
import { THEOLOGY_ROUNDING_RULES, THEOLOGY_ROUNDING_RULE_LABELS, type TheologyRoundingRule } from "@/lib/theology/constants";
import { isValidAssessmentModelComponent, sumComponentWeights } from "@/lib/theology/rules";
import { FormInputLabeled, FormSelectLabeled, FormTextareaLabeled, FormCheckboxLabeled, StatusPill, EmptyState } from "./teologiaFormHelpers";

export function TeologiaSettings({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(true);
  const [moduleUnavailable, setModuleUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [models, setModels] = useState<TheologyAssessmentModelRow[]>([]);
  const [programs, setPrograms] = useState<TheologyProgramRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<TheologyAssessmentModelRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [modelsRes, programsRes] = await Promise.all([
      loadTheologyAssessmentModels(organizationId),
      loadTheologyPrograms(organizationId),
    ]);
    if (modelsRes.error?.code === "42P01") {
      setModuleUnavailable(true);
      setLoadError(null);
      setLoading(false);
      return;
    }
    const firstError = [modelsRes.error, programsRes.error].find(Boolean);
    setLoadError(firstError?.message ?? null);
    setModels(modelsRes.rows);
    setPrograms(programsRes.rows);
    setModuleUnavailable(false);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground gap-2"><Loader2 className="animate-spin" size={18} /> Carregando configurações…</div>;
  }
  if (moduleUnavailable) {
    return <EmptyState title="Teologia aguardando aplicação das migrations" description="A tabela theology_assessment_models ainda não existe neste ambiente." />;
  }
  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Não foi possível carregar as configurações de avaliação. {loadError}
      </div>
    );
  }

  const programNameById = new Map(programs.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-serif flex items-center gap-2"><Settings2 size={18} /> Modelos de avaliação</h2>
          <p className="text-sm text-muted-foreground">
            Substituem os antigos "Mod01/Mod02/Mod03" do WinTechi: um modelo configurável (componentes, pesos, escala,
            nota mínima, arredondamento) em vez de telas fixas.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={16} className="mr-1.5" /> Novo modelo</Button>
      </div>

      {models.length === 0 ? (
        <EmptyState title="Nenhum modelo de avaliação criado ainda" description="Crie o primeiro modelo para poder aplicar avaliações nas ofertas de matéria." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {models.map((m) => (
            <Card key={m.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelectedModel(m)}>
              <CardContent className="p-4 space-y-1">
                <p className="font-medium truncate">{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  {m.program_id ? programNameById.get(m.program_id) ?? "Programa específico" : "Todos os programas"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Escala 0–{m.scale_max_score} · Nota mínima {m.minimum_passing_score} · {THEOLOGY_ROUNDING_RULE_LABELS[m.rounding_rule as TheologyRoundingRule]}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateModelDialog open={createOpen} onOpenChange={setCreateOpen} organizationId={organizationId} programs={programs} onCreated={reload} />
      {selectedModel && <ModelComponentsDialog model={selectedModel} onClose={() => setSelectedModel(null)} />}
    </div>
  );
}

function CreateModelDialog({ open, onOpenChange, organizationId, programs, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  programs: TheologyProgramRow[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [programId, setProgramId] = useState("");
  const [scaleMax, setScaleMax] = useState("10");
  const [minScore, setMinScore] = useState("7");
  const [roundingRule, setRoundingRule] = useState<TheologyRoundingRule>("padrao");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome do modelo."); return; }
    setSaving(true);
    const { error } = await createTheologyAssessmentModel({
      organization_id: organizationId,
      program_id: programId || null,
      name: name.trim(),
      description: description.trim() || null,
      scale_max_score: Number(scaleMax) || 10,
      minimum_passing_score: Number(minScore) || 7,
      rounding_rule: roundingRule,
    });
    setSaving(false);
    if (error) { toast.error(`Não foi possível criar o modelo: ${error}`); return; }
    toast.success("Modelo criado. Adicione os componentes e pesos agora.");
    setName(""); setDescription("");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo modelo de avaliação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormInputLabeled label="Nome" value={name} onChange={setName} required placeholder="Ex.: Avaliação padrão (Prova + Trabalho)" />
          <FormSelectLabeled label="Programa específico (opcional)" value={programId} onChange={setProgramId} options={programs.map((p) => ({ value: p.id, label: p.name }))} placeholder="Aplicável a todos os programas" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormInputLabeled label="Escala máxima" type="number" min={1} value={scaleMax} onChange={setScaleMax} />
            <FormInputLabeled label="Nota mínima para aprovação" type="number" min={0} max={Number(scaleMax) || 10} step="0.01" value={minScore} onChange={setMinScore} />
          </div>
          <FormSelectLabeled label="Regra de arredondamento" value={roundingRule} onChange={(v) => setRoundingRule(v as TheologyRoundingRule)} options={THEOLOGY_ROUNDING_RULES.map((r) => ({ value: r, label: THEOLOGY_ROUNDING_RULE_LABELS[r] }))} />
          <FormTextareaLabeled label="Descrição (opcional)" value={description} onChange={setDescription} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSave}>{saving ? "Salvando…" : "Criar modelo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModelComponentsDialog({ model, onClose }: { model: TheologyAssessmentModelRow; onClose: () => void }) {
  const [components, setComponents] = useState<TheologyAssessmentModelComponentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("1");
  const [maxScore, setMaxScore] = useState(String(model.scale_max_score));
  const [mandatory, setMandatory] = useState(true);
  const [adding, setAdding] = useState(false);

  const reloadComponents = useCallback(async () => {
    setLoading(true);
    const { rows } = await loadTheologyAssessmentModelComponents(model.id);
    setComponents(rows);
    setLoading(false);
  }, [model.id]);

  useEffect(() => { void reloadComponents(); }, [reloadComponents]);

  const totalWeight = sumComponentWeights(components.map((c) => ({ weight: c.weight, maxScore: c.max_score, isMandatory: c.is_mandatory })));

  const handleAdd = async () => {
    if (!name.trim()) { toast.error("Informe o nome do componente."); return; }
    const parsedWeight = Number(weight);
    const parsedMax = Number(maxScore);
    if (!isValidAssessmentModelComponent({ weight: parsedWeight, maxScore: parsedMax, isMandatory: mandatory })) {
      toast.error("Peso e nota máxima precisam ser números positivos.");
      return;
    }
    setAdding(true);
    const nextSequence = (components[components.length - 1]?.sequence_number ?? 0) + 1;
    const { error } = await createTheologyAssessmentModelComponent({
      model_id: model.id,
      name: name.trim(),
      weight: parsedWeight,
      max_score: parsedMax,
      is_mandatory: mandatory,
      sequence_number: nextSequence,
    });
    setAdding(false);
    if (error) { toast.error(`Não foi possível adicionar o componente: ${error}`); return; }
    setName(""); setWeight("1"); setMaxScore(String(model.scale_max_score));
    reloadComponents();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{model.name} — componentes</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4"><Loader2 className="animate-spin" size={14} /> Carregando…</div>
          ) : components.length === 0 ? (
            <EmptyState title="Nenhum componente ainda" description="Adicione ao menos um componente (ex.: Prova, Trabalho, Participação) com seu peso." />
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Soma dos pesos: {totalWeight}</p>
              {components.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/60">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">Peso {c.weight} · Máx. {c.max_score}</p>
                  </div>
                  {c.is_mandatory && <StatusPill label="Obrigatório" tone="info" />}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t border-border/60 pt-3">
            <FormInputLabeled label="Nome do componente" value={name} onChange={setName} placeholder="Ex.: Prova" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormInputLabeled label="Peso" type="number" min={0.01} step="0.01" value={weight} onChange={setWeight} />
              <FormInputLabeled label="Nota máxima do componente" type="number" min={0.01} step="0.01" value={maxScore} onChange={setMaxScore} />
            </div>
            <FormCheckboxLabeled label="Componente obrigatório (precisa de nota antes de publicar)" checked={mandatory} onChange={setMandatory} />
            <Button size="sm" onClick={handleAdd} disabled={adding}><Plus size={16} className="mr-1.5" /> Adicionar componente</Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
