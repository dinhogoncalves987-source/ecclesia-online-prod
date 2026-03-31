import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileSpreadsheet, Download, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import Papa from "papaparse";
import { useLanguage } from "@/hooks/useLanguage";

export type ColumnMapping = {
  csvHeader: string;
  dbField: string;
  label: string;
};

type BulkImportModalProps = {
  open: boolean;
  onClose: () => void;
  onImport: (rows: Record<string, string>[]) => Promise<{ success: number; errors: number }>;
  fields: { key: string; label: string; required?: boolean }[];
  templateData?: Record<string, string>[];
  title?: string;
};

export function BulkImportModal({ open, onClose, onImport, fields, templateData, title }: BulkImportModalProps) {
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
  const [fileName, setFileName] = useState("");

  const reset = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setResult(null);
    setFileName("");
    setImporting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as string[][];
        if (data.length < 2) return;
        const headers = data[0].map(h => h.trim());
        setCsvHeaders(headers);
        setCsvRows(data.slice(1));

        // Auto-map by similarity
        const autoMap: Record<string, string> = {};
        fields.forEach(f => {
          const match = headers.find(h => {
            const hl = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const fl = f.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const fk = f.key.toLowerCase();
            return hl === fl || hl === fk || hl.includes(fl) || fl.includes(hl);
          });
          if (match) autoMap[f.key] = match;
        });
        setMapping(autoMap);
        setStep("map");
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.name.endsWith(".txt"))) {
      handleFile(file);
    }
  };

  const getMappedRows = (): Record<string, string>[] => {
    return csvRows.map(row => {
      const obj: Record<string, string> = {};
      fields.forEach(f => {
        const csvHeader = mapping[f.key];
        if (csvHeader) {
          const idx = csvHeaders.indexOf(csvHeader);
          if (idx >= 0) obj[f.key] = row[idx]?.trim() || "";
        }
      });
      return obj;
    }).filter(row => Object.values(row).some(v => v));
  };

  const handleImport = async () => {
    setImporting(true);
    const rows = getMappedRows();
    const res = await onImport(rows);
    setResult(res);
    setStep("done");
    setImporting(false);
  };

  const downloadTemplate = () => {
    const headers = fields.map(f => f.label);
    let csv = headers.join(",") + "\n";
    if (templateData) {
      templateData.forEach(row => {
        csv += fields.map(f => row[f.key] || "").join(",") + "\n";
      });
    } else {
      csv += fields.map(() => "").join(",") + "\n";
    }
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_importacao.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const requiredMissing = fields.filter(f => f.required && !mapping[f.key]);
  const mappedPreview = getMappedRows().slice(0, 5);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
            onClick={handleClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-card rounded-2xl shadow-xl max-h-[85vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={20} className="text-accent" />
                  <h2 className="text-lg font-serif font-bold">{title || t("Importar Dados")}</h2>
                </div>
                <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-secondary">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {/* Step: Upload */}
                {step === "upload" && (
                  <div className="space-y-4">
                    <div
                      onDrop={handleDrop}
                      onDragOver={e => e.preventDefault()}
                      onClick={() => fileRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent/50 hover:bg-secondary/30 transition-colors"
                    >
                      <Upload size={32} className="mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm font-medium text-foreground">{t("Arraste um arquivo CSV aqui")}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t("ou clique para selecionar")}</p>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,.txt"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) handleFile(f);
                        }}
                      />
                    </div>
                    <button
                      onClick={downloadTemplate}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-secondary text-sm font-medium hover:bg-secondary/80 transition-colors"
                    >
                      <Download size={14} /> {t("Baixar modelo CSV")}
                    </button>
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">
                        💡 {t("Dica: Exporte sua planilha do Excel como CSV (separado por vírgulas). A primeira linha deve conter os nomes das colunas.")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Step: Map columns */}
                {step === "map" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm">
                      <FileSpreadsheet size={14} className="text-accent" />
                      <span className="font-medium">{fileName}</span>
                      <span className="text-muted-foreground">· {csvRows.length} {t("linhas")}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{t("Associe as colunas do CSV aos campos do sistema:")}</p>
                    <div className="space-y-2">
                      {fields.map(f => (
                        <div key={f.key} className="flex items-center gap-3">
                          <span className="text-sm w-32 truncate flex-shrink-0">
                            {f.label} {f.required && <span className="text-destructive">*</span>}
                          </span>
                          <select
                            value={mapping[f.key] || ""}
                            onChange={e => setMapping(prev => ({ ...prev, [f.key]: e.target.value }))}
                            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                          >
                            <option value="">{t("— Não importar —")}</option>
                            {csvHeaders.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    {requiredMissing.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-destructive">
                        <AlertCircle size={12} />
                        {t("Campos obrigatórios não mapeados:")} {requiredMissing.map(f => f.label).join(", ")}
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button onClick={reset} className="flex-1 py-2.5 rounded-lg bg-secondary text-sm font-medium">
                        {t("Voltar")}
                      </button>
                      <button
                        onClick={() => setStep("preview")}
                        disabled={requiredMissing.length > 0}
                        className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                      >
                        {t("Pré-visualizar")}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step: Preview */}
                {step === "preview" && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t("Pré-visualização")} ({getMappedRows().length} {t("registros")})
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-secondary/50">
                            {fields.filter(f => mapping[f.key]).map(f => (
                              <th key={f.key} className="px-3 py-2 text-left font-medium text-muted-foreground">{f.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {mappedPreview.map((row, i) => (
                            <tr key={i} className="border-t border-border/30">
                              {fields.filter(f => mapping[f.key]).map(f => (
                                <td key={f.key} className="px-3 py-2 truncate max-w-[150px]">{row[f.key]}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {getMappedRows().length > 5 && (
                      <p className="text-xs text-muted-foreground text-center">
                        ... {t("e mais")} {getMappedRows().length - 5} {t("registros")}
                      </p>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setStep("map")} className="flex-1 py-2.5 rounded-lg bg-secondary text-sm font-medium">
                        {t("Voltar")}
                      </button>
                      <button
                        onClick={handleImport}
                        disabled={importing}
                        className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {importing && <Loader2 size={14} className="animate-spin" />}
                        {importing ? t("Importando...") : `${t("Importar")} ${getMappedRows().length} ${t("registros")}`}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step: Done */}
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
