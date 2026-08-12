/**
 * DisciplinePeriodDialog — diálogo único usado pela tela Membros para
 * registrar, regularizar ou encerrar o período disciplinar de um membro.
 *
 * Reaproveitado em três fluxos (ver contrato da FASE 1C-H3):
 *   - "enter": entrada em "Em disciplina" (início obrigatório, término
 *     previsto opcional, observação confidencial opcional);
 *   - "regularize": regularização de um membro legado já "Em disciplina"/
 *     "Disciplinado" sem período estruturado (ANDRIELE, DANIEL, DORACI);
 *   - "end": encerramento real ao sair da disciplina (exige a data real de
 *     encerramento, nunca preenchida automaticamente).
 *
 * Nunca preenche uma data silenciosamente — o usuário sempre confirma o
 * valor visível antes de a RPC `set_member_status_with_discipline` ser
 * chamada pelo componente pai. O campo de observação é claramente marcado
 * como confidencial e nunca é reexibido em nenhuma outra tela.
 */

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type DisciplinePeriodDialogMode = "enter" | "regularize" | "end";

export type DisciplinePeriodInfo = {
  startedAt: string | null;
  expectedEndAt: string | null;
};

export type DisciplinePeriodConfirmPayload = {
  startedAt: string | null;
  expectedEndAt: string | null;
  description: string | null;
  endedAt: string | null;
};

type DisciplinePeriodDialogProps = {
  open: boolean;
  mode: DisciplinePeriodDialogMode;
  memberName: string;
  /** Rótulo do status de destino — usado somente no modo "end". */
  targetStatusLabel?: string;
  /** Período atual conhecido (via get_current_member_discipline_period). */
  currentPeriod?: DisciplinePeriodInfo | null;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (payload: DisciplinePeriodConfirmPayload) => void;
};

export function formatIsoDateBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/**
 * Dia civil local do dispositivo do usuário, no formato YYYY-MM-DD — usado
 * exclusivamente para validar "início não pode estar no futuro".
 *
 * Nunca usar `new Date().toISOString()` aqui: `toISOString()` sempre
 * devolve o dia em UTC. No horário do Brasil (UTC-3), entre ~21h e
 * meia-noite locais o UTC já está no dia civil seguinte — o que faria essa
 * validação aceitar uma data que, para o usuário, ainda é uma data futura
 * real. Construir a string a partir de `getFullYear`/`getMonth`/`getDate`
 * (métodos de fuso local) evita esse deslocamento (Fase 1C-H5, achado P1).
 */
function todayIsoDateLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DIALOG_TITLES: Record<DisciplinePeriodDialogMode, string> = {
  enter: "Registrar início da disciplina",
  regularize: "Regularizar período disciplinar",
  end: "Encerrar disciplina",
};

export function DisciplinePeriodDialog({
  open,
  mode,
  memberName,
  targetStatusLabel,
  currentPeriod,
  submitting,
  onCancel,
  onConfirm,
}: DisciplinePeriodDialogProps) {
  const [startedAt, setStartedAt] = useState("");
  const [expectedEndAt, setExpectedEndAt] = useState("");
  const [description, setDescription] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isEditableMode = mode === "enter" || mode === "regularize";

  // Trava síncrona contra submissão dupla (Fase 1C-H5, achado P2): setada
  // imediatamente no clique, antes de qualquer render — não depende da prop
  // assíncrona `submitting` do pai, que só reflete o estado real após pelo
  // menos um ciclo de render. É liberada (ver useEffect abaixo) sempre que o
  // diálogo reabre ou sempre que `submitting` volta a `false` (operação do
  // pai concluída, com sucesso ou erro) — nunca prende o diálogo aberto.
  const confirmingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setStartedAt(mode === "end" ? "" : currentPeriod?.startedAt ?? "");
    setExpectedEndAt(mode === "end" ? "" : currentPeriod?.expectedEndAt ?? "");
    setDescription("");
    setEndedAt("");
    setError(null);
    confirmingRef.current = false;
  }, [open, mode, currentPeriod]);

  useEffect(() => {
    if (!submitting) confirmingRef.current = false;
  }, [submitting]);

  if (!open) return null;

  const showLegacyHint = isEditableMode && !currentPeriod?.startedAt;

  const handleConfirm = () => {
    if (confirmingRef.current) return;

    if (mode === "end") {
      if (!endedAt) {
        setError("Informe a data real de encerramento.");
        return;
      }
      if (currentPeriod?.startedAt && endedAt < currentPeriod.startedAt) {
        setError("O encerramento não pode ser anterior ao início registrado.");
        return;
      }
      setError(null);
      confirmingRef.current = true;
      onConfirm({ startedAt: null, expectedEndAt: null, description: null, endedAt });
      return;
    }

    if (!startedAt) {
      setError("Informe a data de início da disciplina.");
      return;
    }
    if (startedAt > todayIsoDateLocal()) {
      setError("O início não pode estar no futuro.");
      return;
    }
    if (expectedEndAt && expectedEndAt < startedAt) {
      setError("O término previsto não pode ser anterior ao início.");
      return;
    }

    setError(null);
    confirmingRef.current = true;
    onConfirm({
      startedAt,
      expectedEndAt: expectedEndAt || null,
      description: description.trim() || null,
      endedAt: null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent data-discipline-period-dialog={mode}>
        <DialogHeader>
          <DialogTitle>{DIALOG_TITLES[mode]}</DialogTitle>
          <DialogDescription>{memberName}</DialogDescription>
        </DialogHeader>

        {mode === "end" ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-muted-foreground">Novo status: </span>
              <strong>{targetStatusLabel}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Início registrado: </span>
              {currentPeriod?.startedAt ? formatIsoDateBr(currentPeriod.startedAt) : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Término previsto: </span>
              {currentPeriod?.expectedEndAt ? formatIsoDateBr(currentPeriod.expectedEndAt) : "Período em andamento"}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="discipline-ended-at">Data real de encerramento *</Label>
              <Input
                id="discipline-ended-at"
                type="date"
                value={endedAt}
                onChange={(e) => setEndedAt(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {showLegacyHint && (
              <p className="text-xs text-amber-600 dark:text-amber-400" data-discipline-legacy-hint>
                Período ainda não informado — registre as datas reais.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="discipline-started-at">Início da disciplina *</Label>
              <Input
                id="discipline-started-at"
                type="date"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discipline-expected-end-at">Término previsto (opcional)</Label>
              <Input
                id="discipline-expected-end-at"
                type="date"
                value={expectedEndAt}
                onChange={(e) => setExpectedEndAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discipline-description">
                Motivo/observação (opcional) — <span className="font-semibold">confidencial</span>
              </Label>
              <Textarea
                id="discipline-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive" data-discipline-dialog-error>
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
