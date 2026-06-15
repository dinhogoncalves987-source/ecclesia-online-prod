import { useState } from "react";
import { Send, Loader2 } from "lucide-react";

import { useLanguage } from "@/hooks/useLanguage";
import type { CreateRecommendationLetterInput } from "@/lib/recommendationLetterMutations";

const BRAZIL_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

type Props = {
  defaultMemberName?: string;
  defaultMemberEmail?: string;
  /** Show member name/email inputs (staff creating on behalf of a member). */
  showMemberIdentityFields?: boolean;
  /** Pre-fill destination/reason/observations (from AI helper or external source). */
  initialDestinationChurch?: string;
  initialDestinationCity?: string;
  initialDestinationState?: string;
  initialReason?: string;
  initialObservations?: string;
  submitting?: boolean;
  onSubmit: (input: CreateRecommendationLetterInput) => void | Promise<void>;
};

export function RecommendationLetterForm({
  defaultMemberName = "",
  defaultMemberEmail = "",
  showMemberIdentityFields = true,
  initialDestinationChurch = "",
  initialDestinationCity = "",
  initialDestinationState = "",
  initialReason = "",
  initialObservations = "",
  submitting = false,
  onSubmit,
}: Props) {
  const { t } = useLanguage();

  const [memberName, setMemberName] = useState(defaultMemberName);
  const [memberEmail, setMemberEmail] = useState(defaultMemberEmail);
  const [destinationChurch, setDestinationChurch] = useState(initialDestinationChurch);
  const [destinationCity, setDestinationCity] = useState(initialDestinationCity);
  const [destinationState, setDestinationState] = useState(initialDestinationState);
  const [reason, setReason] = useState(initialReason);
  const [observations, setObservations] = useState(initialObservations);
  const [touched, setTouched] = useState(false);

  const trimmedName = memberName.trim() || defaultMemberName.trim();
  const isValid =
    Boolean(trimmedName) &&
    destinationChurch.trim().length > 0 &&
    destinationCity.trim().length > 0 &&
    reason.trim().length > 0;

  const handleSubmit = async () => {
    setTouched(true);
    if (!isValid || submitting) return;
    await onSubmit({
      memberName: trimmedName,
      memberEmail: memberEmail.trim() || null,
      destinationChurch: destinationChurch.trim(),
      destinationCity: destinationCity.trim(),
      destinationState: destinationState.trim() || null,
      reason: reason.trim(),
      observations: observations.trim() || null,
    });
    // Reset the destination-specific fields; keep identity for convenience
    setDestinationChurch("");
    setDestinationCity("");
    setDestinationState("");
    setReason("");
    setObservations("");
    setTouched(false);
  };

  const inputClass =
    "w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
  const labelClass = "text-xs font-medium text-muted-foreground mb-1 block";

  return (
    <div className="space-y-3">
      {showMemberIdentityFields && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>
              {t("Nome do membro")} <span className="text-destructive">*</span>
            </label>
            <input
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder={t("Nome completo")}
              className={inputClass}
            />
            {touched && !trimmedName && (
              <p className="text-[11px] text-destructive mt-1">{t("Informe o nome.")}</p>
            )}
          </div>
          <div>
            <label className={labelClass}>{t("E-mail (opcional)")}</label>
            <input
              type="email"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              placeholder={t("email@exemplo.com")}
              className={inputClass}
            />
          </div>
        </div>
      )}

      <div>
        <label className={labelClass}>
          {t("Igreja destino")} <span className="text-destructive">*</span>
        </label>
        <input
          value={destinationChurch}
          onChange={(e) => setDestinationChurch(e.target.value)}
          placeholder={t("Nome da igreja de destino")}
          className={inputClass}
        />
        {touched && !destinationChurch.trim() && (
          <p className="text-[11px] text-destructive mt-1">{t("Informe a igreja destino.")}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
        <div>
          <label className={labelClass}>
            {t("Cidade")} <span className="text-destructive">*</span>
          </label>
          <input
            value={destinationCity}
            onChange={(e) => setDestinationCity(e.target.value)}
            placeholder={t("Cidade de destino")}
            className={inputClass}
          />
          {touched && !destinationCity.trim() && (
            <p className="text-[11px] text-destructive mt-1">{t("Informe a cidade.")}</p>
          )}
        </div>
        <div>
          <label className={labelClass}>{t("Estado")}</label>
          <select
            value={destinationState}
            onChange={(e) => setDestinationState(e.target.value)}
            className={inputClass}
          >
            <option value="">{t("UF")}</option>
            {BRAZIL_STATES.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>
          {t("Motivo")} <span className="text-destructive">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("Motivo da solicitação da carta")}
          rows={3}
          className={`${inputClass} resize-none`}
        />
        {touched && !reason.trim() && (
          <p className="text-[11px] text-destructive mt-1">{t("Informe o motivo.")}</p>
        )}
      </div>

      <div>
        <label className={labelClass}>{t("Observações (opcional)")}</label>
        <textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder={t("Observações adicionais")}
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || (touched && !isValid)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {t("Solicitar Carta")}
      </button>
    </div>
  );
}
