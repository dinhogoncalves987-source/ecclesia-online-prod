import { useState, useEffect, useRef } from "react";
import { Send, Loader2, Search, X, UserCheck, Calendar, Building2 } from "lucide-react";

import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import type { CreateRecommendationLetterInput } from "@/lib/recommendationLetterMutations";

const BRAZIL_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

type MemberSuggestion = {
  id: string;
  full_name: string;
  member_role: string | null;
  administrative_role: string | null;
  email: string | null;
  phone: string | null;
  baptized_at: string | null;
  joined_at: string | null;
  city: string | null;
  state: string | null;
  congregation_id: string | null;
  status: string;
};

type Props = {
  defaultMemberName?: string;
  defaultMemberEmail?: string;
  /** Show member name/email inputs (staff creating on behalf of a member). */
  showMemberIdentityFields?: boolean;
  /** When true, staff mode: enables member search, changes button label. */
  isStaff?: boolean;
  /** Organization ID required for member search (staff mode). */
  organizationId?: string;
  /** Pre-fill destination/reason/observations (from AI helper or external source). */
  initialDestinationChurch?: string;
  initialDestinationCity?: string;
  initialDestinationState?: string;
  initialReason?: string;
  initialObservations?: string;
  /** Pre-fill all fields for edit mode. */
  initialMemberName?: string;
  initialMemberEmail?: string;
  submitting?: boolean;
  onSubmit: (input: CreateRecommendationLetterInput) => void | Promise<void>;
  /** Submit button label override. */
  submitLabel?: string;
};

export function RecommendationLetterForm({
  defaultMemberName = "",
  defaultMemberEmail = "",
  showMemberIdentityFields = true,
  isStaff = false,
  organizationId,
  initialDestinationChurch = "",
  initialDestinationCity = "",
  initialDestinationState = "",
  initialReason = "",
  initialObservations = "",
  initialMemberName,
  initialMemberEmail,
  submitting = false,
  onSubmit,
  submitLabel,
}: Props) {
  const { t } = useLanguage();

  const [memberName,        setMemberName]        = useState(initialMemberName ?? defaultMemberName);
  const [memberEmail,       setMemberEmail]       = useState(initialMemberEmail ?? defaultMemberEmail);
  const [memberId,          setMemberId]          = useState<string | null>(null);
  const [destinationChurch, setDestinationChurch] = useState(initialDestinationChurch);
  const [destinationCity,   setDestinationCity]   = useState(initialDestinationCity);
  const [destinationState,  setDestinationState]  = useState(initialDestinationState);
  const [reason,            setReason]            = useState(initialReason);
  const [observations,      setObservations]      = useState(initialObservations);
  const [touched,           setTouched]           = useState(false);

  // Member search (staff only)
  const [memberSearch,    setMemberSearch]    = useState("");
  const [memberResults,   setMemberResults]   = useState<MemberSuggestion[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [selectedMember,  setSelectedMember]  = useState<MemberSuggestion | null>(null);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isStaff || !organizationId || !memberSearch.trim()) {
      setMemberResults([]);
      return;
    }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setMemberSearching(true);
      const { data, error } = await supabase
        .from("members")
        .select("id, full_name, member_role, administrative_role, email, phone, baptized_at, joined_at, city, state, congregation_id, status")
        .eq("organization_id", organizationId)
        .ilike("full_name", `%${memberSearch.trim()}%`)
        .order("full_name")
        .limit(8);
      if (!error && data) setMemberResults(data as MemberSuggestion[]);
      setMemberSearching(false);
    }, 280);
  }, [memberSearch, isStaff, organizationId]);

  const handleSelectMember = (m: MemberSuggestion) => {
    setSelectedMember(m);
    setMemberName(m.full_name);
    setMemberEmail(m.email ?? "");
    setMemberId(m.id);
    setMemberSearch("");
    setMemberResults([]);
  };

  const clearSelectedMember = () => {
    setSelectedMember(null);
    setMemberId(null);
    setMemberName("");
    setMemberEmail("");
  };

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
      memberId: memberId ?? null,
      memberName: trimmedName,
      memberEmail: memberEmail.trim() || null,
      destinationChurch: destinationChurch.trim(),
      destinationCity: destinationCity.trim(),
      destinationState: destinationState.trim() || null,
      reason: reason.trim(),
      observations: observations.trim() || null,
    });
    // Reset destination fields; keep identity for convenience
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

  const resolvedSubmitLabel = submitLabel
    ?? (isStaff ? t("Criar Carta") : t("Solicitar Carta"));

  function fmtDate(iso: string | null) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("pt-BR");
  }

  return (
    <div className="space-y-3">
      {/* ── Member search (staff only) ──────────────────────────────────── */}
      {isStaff && (
        <div className="space-y-2">
          <label className={labelClass}>{t("Membro")}</label>

          {selectedMember ? (
            /* Selected member card */
            <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0 uppercase">
                    {selectedMember.full_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{selectedMember.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[selectedMember.member_role, selectedMember.administrative_role].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearSelectedMember}
                  className="p-1 rounded hover:bg-secondary flex-shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={t("Remover seleção")}
                >
                  <X size={14} />
                </button>
              </div>
              {/* Member details row */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {selectedMember.email && (
                  <span className="truncate col-span-2">✉ {selectedMember.email}</span>
                )}
                {selectedMember.phone && (
                  <span className="truncate">📞 {selectedMember.phone}</span>
                )}
                {fmtDate(selectedMember.baptized_at) && (
                  <span className="flex items-center gap-1">
                    <Calendar size={10} /> Batismo: {fmtDate(selectedMember.baptized_at)}
                  </span>
                )}
                {fmtDate(selectedMember.joined_at) && (
                  <span className="flex items-center gap-1">
                    <UserCheck size={10} /> Admissão: {fmtDate(selectedMember.joined_at)}
                  </span>
                )}
                {(selectedMember.city || selectedMember.state) && (
                  <span className="flex items-center gap-1">
                    <Building2 size={10} />
                    {[selectedMember.city, selectedMember.state].filter(Boolean).join("/")}
                  </span>
                )}
                <span className="capitalize">Status: {selectedMember.status}</span>
              </div>
            </div>
          ) : (
            /* Search input */
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder={t("Buscar membro pelo nome...")}
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {memberSearching && (
                <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
              {memberResults.length > 0 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-lg divide-y divide-border max-h-56 overflow-y-auto">
                  {memberResults.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/60 text-left transition-colors"
                      onClick={() => handleSelectMember(m)}
                    >
                      <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 uppercase">
                        {m.full_name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.full_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {[m.member_role, m.administrative_role].filter(Boolean).join(" · ") || "Membro"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {!memberSearching && memberSearch.trim() && memberResults.length === 0 && (
                <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border rounded-xl shadow-sm p-3">
                  <p className="text-xs text-center text-muted-foreground">{t("Nenhum membro encontrado.")}</p>
                </div>
              )}
            </div>
          )}

          {/* Manual name/email fallback when no member selected */}
          {!selectedMember && showMemberIdentityFields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className={labelClass}>{t("Nome (manual)")} <span className="text-destructive">*</span></label>
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
        </div>
      )}

      {/* ── Member identity fields (member self-service) ─────────────────── */}
      {!isStaff && showMemberIdentityFields && (
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

      {/* ── Destination church ─────────────────────────────────────────────── */}
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
              <option key={uf} value={uf}>{uf}</option>
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
        {resolvedSubmitLabel}
      </button>
    </div>
  );
}
