import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * OPERAÇÃO ESPECIAL — Parte C (Ecclesia Chat), identidade correta no chat.
 *
 * Regressão para os dois bugs de identidade encontrados na auditoria:
 *   1. `ChatSecretaria.tsx` passava `auth.users.id` como se fosse
 *      `members.id` para `findOrCreateDirectThread`, permitindo (em teoria)
 *      abrir uma conversa "consigo mesmo" quando o membro selecionado era o
 *      próprio usuário autenticado — corrigido tanto no frontend
 *      (`resolveMemberIdForUser` + guarda cliente) quanto aqui, na função
 *      que efetivamente cria/reaproveita a thread.
 *   2. Nenhuma proteção contra duplo clique/retry criando duas threads
 *      diretas para o mesmo par (organização, membro) — corrigido com
 *      recuperação da thread vencedora em caso de violação de índice único.
 *
 * Estes testes usam um mock leve e explícito do query builder do Supabase
 * (encadeamento .select/.eq/.order/.limit/.maybeSingle/.insert/.single) —
 * nunca conecta a um banco real.
 */

const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock("@/lib/webPush", () => ({ triggerChatPush: vi.fn() }));

function chainable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const methods = ["select", "eq", "order", "limit", "insert"];
  for (const method of methods) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  // insertWithOrganizationScope awaits the query directly when no buildQuery
  // customizes .select().single() — but findOrCreateDirectThread always
  // supplies (query) => query.select("*").single(), so .single() is the
  // terminal call for inserts in these tests.
  return builder;
}

describe("findOrCreateDirectThread — identidade e deduplicação (Parte C)", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("nunca cria/abre uma thread cujo membro selecionado é o próprio usuário autenticado", async () => {
    const { findOrCreateDirectThread } = await import("./internalMessageMutations");

    // 1ª chamada: SELECT members.user_id — devolve o MESMO userId do chamador.
    mockFrom.mockImplementationOnce(() =>
      chainable({ data: { user_id: "auth-user-1" }, error: null }),
    );

    const result = await findOrCreateDirectThread("org-1", "auth-user-1", "member-1", "Fulano");

    expect(result).toEqual({ ok: false, error: "self_thread_not_allowed" });
    // Nunca chega a consultar/criar internal_threads — a guarda barra antes.
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("members");
  });

  it("permite abrir a conversa quando o membro selecionado é uma pessoa distinta do usuário autenticado", async () => {
    const { findOrCreateDirectThread } = await import("./internalMessageMutations");

    mockFrom
      // members.user_id do membro-alvo: pessoa diferente do chamador.
      .mockImplementationOnce(() => chainable({ data: { user_id: "auth-user-OTHER" }, error: null }))
      // busca de thread existente: nenhuma ainda.
      .mockImplementationOnce(() => chainable({ data: null, error: null }))
      // insert da nova thread.
      .mockImplementationOnce(() =>
        chainable({
          data: {
            id: "thread-1", organization_id: "org-1", member_id: "member-1", subject: "Fulano",
            source: "secretariat", status: "open", reply_enabled: true, created_at: new Date().toISOString(),
          },
          error: null,
        }),
      );

    const result = await findOrCreateDirectThread("org-1", "auth-user-1", "member-1", "Fulano");

    expect(result.ok).toBe(true);
    expect(result.isNew).toBe(true);
    expect(result.thread?.id).toBe("thread-1");
  });

  it("nunca duplica a thread em concorrência: recupera a thread vencedora em violação de índice único", async () => {
    const { findOrCreateDirectThread } = await import("./internalMessageMutations");

    mockFrom
      .mockImplementationOnce(() => chainable({ data: { user_id: "auth-user-OTHER" }, error: null }))
      .mockImplementationOnce(() => chainable({ data: null, error: null }))
      .mockImplementationOnce(() =>
        chainable({
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint \"uniq_internal_threads_secretariat_member\"" },
        }),
      )
      .mockImplementationOnce(() =>
        chainable({
          data: {
            id: "thread-winner", organization_id: "org-1", member_id: "member-1", subject: "Fulano",
            source: "secretariat", status: "open", reply_enabled: true, created_at: new Date().toISOString(),
          },
          error: null,
        }),
      );

    const result = await findOrCreateDirectThread("org-1", "auth-user-1", "member-1", "Fulano");

    expect(result.ok).toBe(true);
    expect(result.isNew).toBe(false);
    expect(result.thread?.id).toBe("thread-winner");
  });

  it("reaproveita a thread canônica já existente em vez de criar uma nova para a mesma dupla", async () => {
    const { findOrCreateDirectThread } = await import("./internalMessageMutations");

    mockFrom
      .mockImplementationOnce(() => chainable({ data: { user_id: "auth-user-OTHER" }, error: null }))
      .mockImplementationOnce(() =>
        chainable({
          data: {
            id: "thread-existing", organization_id: "org-1", member_id: "member-1", subject: "Fulano",
            source: "secretariat", status: "open", reply_enabled: true, created_at: new Date().toISOString(),
          },
          error: null,
        }),
      );

    const result = await findOrCreateDirectThread("org-1", "auth-user-1", "member-1", "Fulano");

    expect(result.ok).toBe(true);
    expect(result.isNew).toBe(false);
    expect(result.thread?.id).toBe("thread-existing");
    // Nunca chega a tentar inserir — só 2 chamadas (guarda de identidade + busca).
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});
