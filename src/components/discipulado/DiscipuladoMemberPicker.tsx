/**
 * Seletor de pessoa reaproveitando public.members + matchesMemberSearch
 * (mesmo predicado usado em src/pages/Membros.tsx) — nunca uma nova busca
 * paralela de pessoas. Usado para matricular um membro numa turma ou
 * atribuir um membro como equipe (coordenador/secretário/discipulador/
 * professor/auxiliar).
 */
import { useEffect, useState } from "react";
import { Search, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { matchesMemberSearch } from "@/lib/memberSearch";

type PickableMember = {
  id: string;
  full_name: string;
  known_name: string | null;
  member_code: string | null;
  legacy_code: string | null;
  legacy_registration: string | null;
  cpf: string | null;
  member_role: string | null;
  administrative_role: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
};

export function DiscipuladoMemberPicker({ organizationId, onSelect, excludeIds = [] }: {
  organizationId: string;
  onSelect: (member: PickableMember) => void;
  excludeIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<PickableMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("members")
        .select("id, full_name, known_name, member_code, legacy_code, legacy_registration, cpf, member_role, administrative_role, email, phone, whatsapp")
        .eq("organization_id", organizationId)
        .order("full_name", { ascending: true });
      if (!cancelled) {
        if (!error) setMembers((data as PickableMember[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [organizationId]);

  const filtered = members
    .filter((m) => !excludeIds.includes(m.id))
    .filter((m) => matchesMemberSearch(m, query))
    .slice(0, 30);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, código, CPF ou telefone…"
          aria-label="Buscar membro"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-3"><Loader2 className="animate-spin" size={14} /> Carregando membros…</div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3 text-center">Nenhum membro encontrado.</p>
      ) : (
        <div className="max-h-56 overflow-y-auto space-y-1 border border-border/60 rounded-lg p-1">
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left hover:bg-secondary transition-colors"
            >
              <User size={14} className="text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{m.known_name || m.full_name}</span>
              {m.member_code && <span className="text-xs text-muted-foreground shrink-0 ml-auto">{m.member_code}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
