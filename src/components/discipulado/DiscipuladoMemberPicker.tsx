/**
 * Seletor de pessoa sobre public.members, via RPC mínima e escopada. A busca
 * acontece no servidor e devolve apenas nome/código — nunca CPF, telefone ou
 * milhares de perfis para o navegador. Usado para matricular ou atribuir
 * um membro como equipe (coordenador/secretário/discipulador/
 * professor/auxiliar).
 */
import { useEffect, useState } from "react";
import { Search, Loader2, User } from "lucide-react";
import {
  searchDiscipleshipMembers,
  type DiscipleshipMemberLabel,
} from "@/lib/discipleship/service";

type PickableMember = DiscipleshipMemberLabel;

export function DiscipuladoMemberPicker({ organizationId, onSelect, excludeIds = [] }: {
  organizationId: string;
  onSelect: (member: PickableMember) => void;
  excludeIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<PickableMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      const result = await searchDiscipleshipMembers(organizationId, query);
      if (!cancelled) {
        setMembers(result.rows);
        setError(result.error?.message ?? null);
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [organizationId, query]);

  const filtered = members.filter((m) => !excludeIds.includes(m.id));

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou código…"
          aria-label="Buscar membro"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-3"><Loader2 className="animate-spin" size={14} /> Carregando membros…</div>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive py-3 text-center">
          Não foi possível buscar os membros. Tente novamente.
        </p>
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
