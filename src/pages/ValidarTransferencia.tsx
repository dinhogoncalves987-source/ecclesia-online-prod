import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TransferLetterDocument } from "@/components/secretaria/TransferLetterDocument";
import { getPublicTransferLetter, type PublicTransferLetter } from "@/lib/officialDocuments";

export default function ValidarTransferencia() {
  const { token } = useParams<{ token: string }>();
  const [letter, setLetter] = useState<PublicTransferLetter | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    void getPublicTransferLetter(token).then((result) => {
      setLetter(result.data);
      setLoading(false);
    });
  }, [token]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-primary" /><span className="text-sm font-semibold">Ecclesia Online — Validação de Documento</span></div>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-24 text-muted-foreground"><Loader2 className="animate-spin" /> Verificando documento…</p>
        ) : !letter ? (
          <InvalidDocument title="Carta de Transferência não encontrada" />
        ) : (
          <div className="space-y-6">
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${letter.status === "cancelada" ? "border-rose-500/30 bg-rose-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
              {letter.status === "cancelada" ? <XCircle className="text-rose-600" /> : <CheckCircle2 className="text-emerald-600" />}
              <div>
                <p className="font-semibold">{letter.status === "cancelada" ? "Documento cancelado" : "Carta de Transferência válida"}</p>
                <p className="text-xs text-muted-foreground">
                  {letter.status === "cancelada" && letter.cancellation_reason
                    ? `Motivo: ${letter.cancellation_reason}`
                    : "A situação acima é consultada diretamente no registro oficial da igreja."}
                </p>
              </div>
            </div>
            <TransferLetterDocument letter={letter} showActions={false} />
          </div>
        )}
      </main>
    </div>
  );
}

function InvalidDocument({ title }: { title: string }) {
  return (
    <div className="py-24 text-center">
      <XCircle className="mx-auto mb-4 text-rose-500" size={52} />
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">O código pode estar incorreto ou o documento ainda não foi emitido.</p>
      <Link to="/" className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">Ir para o Ecclesia Online</Link>
    </div>
  );
}
