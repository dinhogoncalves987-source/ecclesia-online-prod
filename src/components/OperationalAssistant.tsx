/**
 * OperationalAssistant — AI-powered data extraction for administrative modules.
 *
 * Usage:
 *   <OperationalAssistant
 *     module="member"
 *     fields={[{ key: "name", label: "Nome", required: true }, ...]}
 *     onConfirm={async (data) => { /* save directly *\/ }}
 *     onEdit={(data) => { /* pre-fill form *\/ }}
 *   />
 *
 * Architecture notes:
 * - Voice input: mic button is rendered but calls `onMicClick` (future hook-in point).
 * - Image/OCR: file upload button is stubbed for future implementation.
 * - Edge Function: /functions/v1/operational-assistant (Gemini 2.5 Flash).
 */

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, X, Loader2, CheckCircle2, AlertCircle,
  Mic, Send, ChevronRight, Edit3, Save,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const MAX_INPUT = 1500;

export type AssistantModule = "member" | "document" | "communication" | "financial";

export interface AssistantField {
  key: string;
  label: string;
  required?: boolean;
  options?: string[];
  type?: "text" | "number" | "select" | "textarea";
}

interface OperationalAssistantProps {
  module: AssistantModule;
  fields: AssistantField[];
  /** Called with confirmed data to save directly. If omitted, only "Edit" button is shown. */
  onConfirm?: (data: Record<string, string>) => Promise<void>;
  /** Called to pre-fill the parent form for manual review. */
  onEdit: (data: Record<string, string>) => void;
  /** Label override for the trigger button. */
  buttonLabel?: string;
}

type Step = "input" | "loading" | "preview" | "saving" | "done";

export function OperationalAssistant({
  module,
  fields,
  onConfirm,
  onEdit,
  buttonLabel,
}: OperationalAssistantProps) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [inputText, setInputText] = useState("");
  const [extracted, setExtracted] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [apiError, setApiError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const locale = lang === "en" ? "en" : lang === "es" ? "es" : "pt";

  const close = () => {
    setOpen(false);
    setStep("input");
    setInputText("");
    setExtracted({});
    setMissing([]);
    setApiError("");
  };

  const EXAMPLES: Record<AssistantModule, Record<string, string>> = {
    member: {
      pt: 'Ex: "João Silva, pastor, telefone 54 9 9123-4567, joao@email.com"',
      en: 'E.g.: "John Smith, pastor, phone 555-123-4567, john@email.com"',
      es: 'Ej: "Juan García, pastor, teléfono 555-123-4567, juan@correo.com"',
    },
    document: {
      pt: 'Ex: "Ata da reunião de março 2026 — participaram os obreiros e foram decididas as escalas de culto..."',
      en: 'E.g.: "Minutes from the March 2026 meeting — workers attended and worship schedules were set..."',
      es: 'Ej: "Acta de la reunión de marzo 2026 — asistieron los obreros y se fijaron los horarios de culto..."',
    },
    communication: {
      pt: 'Ex: "Aviso urgente: reunião de diretoria amanhã às 19h na sede. Presença obrigatória."',
      en: 'E.g.: "Urgent notice: board meeting tomorrow at 7 PM at headquarters. Attendance required."',
      es: 'Ej: "Aviso urgente: reunión de directivos mañana a las 19h en la sede. Asistencia obligatoria."',
    },
    financial: {
      pt: 'Ex: "Oferta do culto de domingo, R$ 850,00 entrada, categoria dízimos"',
      en: 'E.g.: "Sunday worship offering, $850.00 income, tithes category"',
      es: 'Ej: "Ofrenda del culto dominical, $850.00 entrada, categoría diezmos"',
    },
  };

  const PLACEHOLDERS: Record<AssistantModule, Record<string, string>> = {
    member:        { pt: "Descreva o membro...", en: "Describe the member...", es: "Describe al miembro..." },
    document:      { pt: "Cole ou descreva o documento...", en: "Paste or describe the document...", es: "Pegue o describa el documento..." },
    communication: { pt: "Descreva o comunicado...", en: "Describe the announcement...", es: "Describe el comunicado..." },
    financial:     { pt: "Descreva o lançamento financeiro...", en: "Describe the financial entry...", es: "Describe el registro financiero..." },
  };

  const MODULE_TITLES: Record<AssistantModule, Record<string, string>> = {
    member:        { pt: "Assistente de Cadastro", en: "Registration Assistant", es: "Asistente de Registro" },
    document:      { pt: "Assistente de Documentos", en: "Document Assistant", es: "Asistente de Documentos" },
    communication: { pt: "Assistente de Comunicação", en: "Communication Assistant", es: "Asistente de Comunicación" },
    financial:     { pt: "Assistente Financeiro", en: "Financial Assistant", es: "Asistente Financiero" },
  };

  const analyze = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    setStep("loading");
    setApiError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/operational-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          module,
          text: trimmed.slice(0, MAX_INPUT),
          lang: locale,
          fields: fields.map(f => ({ key: f.key, label: f.label, required: f.required, options: f.options })),
        }),
      });

      const json = await resp.json();
      if (!resp.ok || json.error) {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }

      setExtracted(json.data ?? {});
      setMissing(json.missing ?? []);
      setStep("preview");
    } catch (e) {
      setApiError(e instanceof Error ? e.message : t("Erro ao conectar com o assistente"));
      setStep("input");
    }
  };

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setStep("saving");
    try {
      await onConfirm(extracted);
      setStep("done");
      setTimeout(() => close(), 1400);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : t("Erro ao salvar"));
      setStep("preview");
    }
  };

  const handleEdit = () => {
    onEdit(extracted);
    close();
  };

  const updateField = (key: string, value: string) => {
    setExtracted(prev => ({ ...prev, [key]: value }));
    setMissing(prev => prev.filter(k => k !== key || !value));
  };

  const exampleText = EXAMPLES[module]?.[locale] ?? EXAMPLES[module]?.["pt"];
  const placeholder = PLACEHOLDERS[module]?.[locale] ?? PLACEHOLDERS[module]?.["pt"];
  const modalTitle = MODULE_TITLES[module]?.[locale] ?? MODULE_TITLES[module]?.["pt"];

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-sm font-medium transition-colors"
      >
        <Sparkles size={14} />
        {buttonLabel ?? t("Assistente IA")}
      </button>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
              onClick={close}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-lg bg-card rounded-2xl shadow-xl max-h-[88vh] overflow-hidden flex flex-col"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
                      <Sparkles size={16} className="text-accent" />
                    </div>
                    <div>
                      <h2 className="text-base font-serif font-bold leading-tight">{modalTitle}</h2>
                      <p className="text-[10px] text-muted-foreground">Ecclesia · IA</p>
                    </div>
                  </div>
                  <button onClick={close} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                    <X size={16} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">

                  {/* INPUT STEP */}
                  {(step === "input") && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{exampleText}</p>
                        <div className="relative">
                          <textarea
                            ref={textareaRef}
                            value={inputText}
                            onChange={e => setInputText(e.target.value.slice(0, MAX_INPUT))}
                            placeholder={placeholder}
                            rows={4}
                            className="w-full px-3.5 py-3 rounded-xl border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 pr-10"
                            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) analyze(); }}
                          />
                          {/* Voice button — future hook-in point */}
                          <button
                            disabled
                            title={t("Em breve: entrada por voz")}
                            className="absolute right-2.5 bottom-2.5 p-1.5 rounded-lg text-muted-foreground/40 cursor-not-allowed"
                          >
                            <Mic size={14} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">{inputText.length}/{MAX_INPUT}</span>
                          <span className="text-[10px] text-muted-foreground">Ctrl+Enter {t("para analisar")}</span>
                        </div>
                      </div>

                      {apiError && (
                        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-3">
                          <AlertCircle size={13} /> {apiError}
                        </div>
                      )}

                      <div className="bg-secondary/40 rounded-xl p-3">
                        <p className="text-[11px] text-muted-foreground">
                          🤖 {t("A IA vai extrair os campos automaticamente. Você revisa antes de salvar.")}
                        </p>
                      </div>

                      <button
                        onClick={analyze}
                        disabled={!inputText.trim()}
                        className="w-full py-3 rounded-xl bg-accent text-accent-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40"
                      >
                        <Send size={14} /> {t("Analisar com IA")}
                      </button>
                    </div>
                  )}

                  {/* LOADING STEP */}
                  {step === "loading" && (
                    <div className="text-center py-12 space-y-4">
                      <div className="relative mx-auto w-12 h-12">
                        <Loader2 size={48} className="animate-spin text-accent/30" />
                        <Sparkles size={20} className="absolute inset-0 m-auto text-accent animate-pulse" />
                      </div>
                      <div>
                        <p className="text-base font-serif font-bold">{t("Analisando...")}</p>
                        <p className="text-sm text-muted-foreground mt-1">{t("A IA está extraindo os campos")}</p>
                      </div>
                    </div>
                  )}

                  {/* PREVIEW STEP */}
                  {step === "preview" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 size={14} className="text-accent" />
                        <span className="font-medium text-accent">{t("Campos extraídos com IA")}</span>
                        {missing.length > 0 && (
                          <span className="text-xs text-amber-600 ml-auto flex items-center gap-1">
                            <AlertCircle size={12} /> {missing.length} {t("campo(s) pendente(s)")}
                          </span>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        {fields.map(field => {
                          const value = extracted[field.key] ?? "";
                          const isMissing = missing.includes(field.key) || (field.required && !value);
                          return (
                            <div key={field.key}>
                              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                                {field.label}
                                {field.required && <span className="text-destructive">*</span>}
                                {isMissing && (
                                  <span className="ml-auto text-amber-600 flex items-center gap-0.5">
                                    <AlertCircle size={10} /> {t("Preencher")}
                                  </span>
                                )}
                              </label>
                              {field.type === "select" && field.options ? (
                                <select
                                  value={value}
                                  onChange={e => updateField(field.key, e.target.value)}
                                  className={`w-full px-3 py-2 rounded-lg border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring ${
                                    isMissing ? "border-amber-400/60 bg-amber-400/5" : "border-input"
                                  }`}
                                >
                                  <option value="">{t("Selecionar...")}</option>
                                  {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : field.type === "textarea" ? (
                                <textarea
                                  value={value}
                                  onChange={e => updateField(field.key, e.target.value)}
                                  rows={3}
                                  className={`w-full px-3 py-2 rounded-lg border text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring ${
                                    isMissing ? "border-amber-400/60 bg-amber-400/5" : "border-input"
                                  }`}
                                />
                              ) : (
                                <input
                                  value={value}
                                  onChange={e => updateField(field.key, e.target.value)}
                                  className={`w-full px-3 py-2 rounded-lg border text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring ${
                                    isMissing ? "border-amber-400/60 bg-amber-400/5" : "border-input"
                                  }`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={handleEdit}
                          className="flex-1 py-2.5 rounded-xl border border-border bg-secondary/50 text-sm font-medium flex items-center justify-center gap-2 hover:bg-secondary transition-colors"
                        >
                          <Edit3 size={13} /> {t("Editar no formulário")}
                        </button>
                        {onConfirm && (
                          <button
                            onClick={handleConfirm}
                            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                          >
                            <Save size={13} /> {t("Confirmar e salvar")}
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => { setStep("input"); setApiError(""); }}
                        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 py-1"
                      >
                        <ChevronRight size={11} className="rotate-180" /> {t("Tentar novamente")}
                      </button>
                    </div>
                  )}

                  {/* SAVING STEP */}
                  {step === "saving" && (
                    <div className="text-center py-12 space-y-3">
                      <Loader2 size={40} className="mx-auto animate-spin text-accent" />
                      <p className="text-base font-serif font-bold">{t("Salvando...")}</p>
                    </div>
                  )}

                  {/* DONE STEP */}
                  {step === "done" && (
                    <div className="text-center py-10 space-y-4">
                      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                        <CheckCircle2 size={52} className="mx-auto text-accent" />
                      </motion.div>
                      <div>
                        <p className="text-lg font-serif font-bold">{t("Salvo com sucesso!")}</p>
                        <p className="text-sm text-muted-foreground mt-1">{t("Cadastro realizado pelo assistente IA")}</p>
                      </div>
                    </div>
                  )}

                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
