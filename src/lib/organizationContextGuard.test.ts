import { describe, it, expect } from "vitest";
import { checkOrganizationContext } from "./organizationContextGuard";

// CENÁRIO OBRIGATÓRIO 6: o guard de escrita nunca falha silenciosamente —
// sempre retorna um motivo e uma mensagem visível quando bloqueia, em vez de
// simplesmente abortar a operação sem feedback (era o comportamento de
// `if (!user || !church) return;` em Membros.tsx, Comunicacao.tsx e
// Documentos.tsx antes desta correção).
//
// CENÁRIO OBRIGATÓRIO 7 (seletores subordinados permanecem disponíveis após
// refetch/foco) é coberto pelos testes de estabilidade de referência de
// `church` em `useChurch.test.tsx` — telas como Membros.tsx recarregam seus
// seletores territoriais (`reloadSubOrgs`) num `useEffect` com `[church]`
// como dependência; garantindo que `church` nunca mude de referência
// espontaneamente (ver "refetch em segundo plano do bootstrap NÃO zera
// church"), esses seletores também deixam de ser recarregados/zerados
// espontaneamente.
describe("checkOrganizationContext", () => {
  it("bloqueia com reason='loading' e mensagem visível quando o contexto ainda está carregando", () => {
    const result = checkOrganizationContext("org-1", true);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe("loading");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("bloqueia com reason='missing' e mensagem visível quando não há organização ativa", () => {
    const result = checkOrganizationContext(null, false);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe("missing");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("prioriza 'loading' sobre 'missing' quando ambos são verdadeiros — nunca dá um diagnóstico incorreto", () => {
    const result = checkOrganizationContext(null, true);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe("loading");
    }
  });

  it("libera a operação (ok=true) quando há organização ativa e não está carregando", () => {
    const result = checkOrganizationContext("org-1", false);
    expect(result.ok).toBe(true);
  });
});
