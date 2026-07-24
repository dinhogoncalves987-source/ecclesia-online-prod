import { useEffect, useState } from "react";
import { Loader2, Search, User } from "lucide-react";
import { searchSecretariaMembers, type SecretariaMember } from "@/lib/officialDocuments";

export function SecretariaMemberPicker({
  organizationId,
  selected,
  onSelect,
}: {
  organizationId: string;
  selected?: SecretariaMember | null;
  onSelect: (member: SecretariaMember) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SecretariaMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      const result = await searchSecretariaMembers(organizationId, query);
      if (!cancelled) {
        setRows(result.data);
        setError(result.error?.message ?? null);
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [organizationId, query]);

  return (
    <div className="space-y-2">
      {selected && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <strong>{selected.known_name || selected.full_name}</strong>
          {selected.member_code && <span className="ml-2 text-muted-foreground">#{selected.member_code}</span>}
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
        <input
          className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar membro por nome ou código…"
        />
      </div>
      {loading ? (
        <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={15} /> Buscando…</p>
      ) : error ? (
        <p className="py-3 text-sm text-destructive">{error}</p>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border/70 p-1">
          {rows.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => onSelect(member)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-secondary"
            >
              <User size={14} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{member.known_name || member.full_name}</span>
              {member.member_code && <span className="ml-auto shrink-0 text-xs text-muted-foreground">#{member.member_code}</span>}
            </button>
          ))}
          {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhum membro encontrado.</p>}
        </div>
      )}
    </div>
  );
}
