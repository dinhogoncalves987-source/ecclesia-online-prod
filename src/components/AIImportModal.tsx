import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Upload, Loader2, CheckCircle2, AlertCircle, FileText, Image } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { environment } from "@/config/environment";
import { getEdgeFunctionUrl } from "@/lib/edgeFetch";
import { isReviewModeActive } from "@/config/reviewMode";
import { notifyReviewSimulatedAction } from "@/reviewMode/reviewToast";

type AIImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImport: (rows: Record<string, string>[]) => Promise<{ success: number; errors: number }>;
  fields: { key: string; label: string; required?: boolean }[];
  title?: string;
  moduleName: string;
};

export function AIImportModal({ open, onClose, onImport, fields, title, moduleName }: AIImportModalProps) {
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "analyzing" | "preview" | "importing" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [extractedRows, setExtractedRows] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
  const [error, setError] = useState("");

  const reset = () => {
    setStep("upload");
    setFileName("");
    setExtractedRows([]);
    setResult(null);
    setError("");
  };

  const handleClose = () => { reset(); onClose(); };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      if (file.type.startsWith("image/")) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setStep("analyzing");
    setError("");

    // Modo Avaliação: nunca envia o conteúdo do arquivo a uma edge function
    // de IA real. Gera algumas linhas fictícias com os campos solicitados e
    // segue direto para a revisão.
    if (isReviewModeActive()) {
      notifyReviewSimulatedAction("importação por IA");
      window.setTimeout(() => {
        const simulatedRows = Array.from({ length: 3 }, (_, idx) =>
          fields.reduce<Record<string, string>>((acc, f) => {
            acc[f.key] = `${f.label} de demonstração ${idx + 1} (fictício)`;
            return acc;
          }, {}),
        );
        setExtractedRows(simulatedRows);
        setStep("preview");
      }, 500);
      return;
    }

    try {
      const content = await readFileAsText(file);
      const isImage = file.type.startsWith("image/");
      const fileType = isImage ? "imagem (base64)" : file.name.split(".").pop() || "texto";

      const resp = await fetch(getEdgeFunctionUrl("ai-import"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${environment.supabasePublishableKey}`,
        },
        body: JSON.stringify({
          fileContent: isImage ? `[Imagem em base64: ${content.slice(0, 5000)}...]` : content.slice(0, 15000),
          fileType,
          targetModule: moduleName,
          fields,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${resp.status}`);
      }

      const { data } = await resp.json();
      if (!Array.isArray(data) || data.length === 0) {
        setError(t("A IA não conseguiu extrair dados deste arquivo. Tente outro formato."));
        setStep("upload");
        return;
      }

      setExtractedRows(data);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Erro ao processar"));
      setStep("upload");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    setStep("importing");
    const res = await onImport(extractedRows);
    setResult(res);
    setStep("done");
  };

  const previewFields = fields.filter(f => extractedRows.some(r => r[f.key]));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40" onClick={handleClose} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-card rounded-2xl shadow-xl max-h-[85vh] overflow-hidden flex flex-col">
              
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Sparkles size={20} className="text-accent" />
                  <h2 className="text-lg font-serif font-bold">{title || t("Importar com IA")}</h2>
                </div>
                <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-secondary">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {/* Upload */}
                {step === "upload" && (
                  <div className="space-y-4">
                    <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                      onClick={() => fileRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent/50 hover:bg-secondary/30 transition-colors">
                      <Sparkles size={32} className="mx-auto text-accent mb-3" />
                      <p className="text-sm font-medium text-foreground">{t("Arraste um arquivo aqui")}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t("PDF, imagem, CSV ou texto")}</p>
                      <input ref={fileRef} type="file"
                        accept=".csv,.txt,.pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-secondary/50 rounded-lg p-3 text-center">
                        <FileText size={20} className="mx-auto text-muted-foreground mb-1" />
                        <p className="text-[10px] text-muted-foreground">CSV / TXT</p>
                      </div>
                      <div className="bg-secondary/50 rounded-lg p-3 text-center">
                        <Image size={20} className="mx-auto text-muted-foreground mb-1" />
                        <p className="text-[10px] text-muted-foreground">{t("Fotos")}</p>
                      </div>
                      <div className="bg-secondary/50 rounded-lg p-3 text-center">
                        <FileText size={20} className="mx-auto text-muted-foreground mb-1" />
                        <p className="text-[10px] text-muted-foreground">PDF</p>
                      </div>
                    </div>
                    {error && (
                      <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-lg">
                        <AlertCircle size={14} /> {error}
                      </div>
                    )}
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">
                        🤖 {t("A IA vai analisar o arquivo e extrair os dados automaticamente. Você poderá revisar antes de importar.")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Analyzing */}
                {step === "analyzing" && (
                  <div className="text-center py-10 space-y-4">
                    <Loader2 size={40} className="mx-auto animate-spin text-accent" />
                    <div>
                      <p className="text-base font-serif font-bold">{t("Analisando arquivo...")}</p>
                      <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
                      <p className="text-xs text-muted-foreground mt-2">{t("A IA está extraindo os dados do documento")}</p>
                    </div>
                  </div>
                )}

                {/* Preview */}
                {step === "preview" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles size={14} className="text-accent" />
                      <span className="font-medium">{t("IA extraiu")} {extractedRows.length} {t("registros")}</span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-secondary/50">
                            {previewFields.map(f => (
                              <th key={f.key} className="px-3 py-2 text-left font-medium text-muted-foreground">{f.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {extractedRows.slice(0, 8).map((row, i) => (
                            <tr key={i} className="border-t border-border/30">
                              {previewFields.map(f => (
                                <td key={f.key} className="px-3 py-2 truncate max-w-[150px]">{row[f.key] || "—"}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {extractedRows.length > 8 && (
                      <p className="text-xs text-muted-foreground text-center">
                        ... {t("e mais")} {extractedRows.length - 8} {t("registros")}
                      </p>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button onClick={reset} className="flex-1 py-2.5 rounded-lg bg-secondary text-sm font-medium">
                        {t("Voltar")}
                      </button>
                      <button onClick={handleImport}
                        className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2">
                        {t("Importar")} {extractedRows.length} {t("registros")}
                      </button>
                    </div>
                  </div>
                )}

                {/* Importing */}
                {step === "importing" && (
                  <div className="text-center py-10 space-y-4">
                    <Loader2 size={40} className="mx-auto animate-spin text-accent" />
                    <p className="text-base font-serif font-bold">{t("Importando...")}</p>
                  </div>
                )}

                {/* Done */}
                {step === "done" && result && (
                  <div className="text-center py-6 space-y-4">
                    <CheckCircle2 size={48} className="mx-auto text-accent" />
                    <div>
                      <p className="text-lg font-serif font-bold">{t("Importação concluída!")}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        ✅ {result.success} {t("importados com sucesso")}
                        {result.errors > 0 && (
                          <span className="text-destructive"> · ❌ {result.errors} {t("com erro")}</span>
                        )}
                      </p>
                    </div>
                    <button onClick={handleClose} className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                      {t("Fechar")}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
