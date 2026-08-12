import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MEMBER_STATUSES } from "@/lib/secretariaConstants";
import ModoPorteiro from "./ModoPorteiro";

/**
 * FASE 1C-G4 — fecha o único achado P1 da revisão obrigatória (Fase 1C-G3):
 * `ModoPorteiro.tsx` tinha correção confirmada por diff e por guarda estática
 * (`walletStatusAndQrLogoGuard.test.ts`), mas nenhum teste renderizava o
 * componente real e conferia o selo de status no DOM.
 *
 * Estes testes renderizam `ModoPorteiro` de verdade, usam o fluxo real de
 * token pela URL (`/admin/porteiro?token=...`) e mockam apenas fronteiras
 * externas: RPC do Supabase e o `AdminLayout` (autenticação/contexto da
 * igreja/menu — não é o que está sob teste aqui). `useLanguage()` NÃO é
 * mockado: seu valor padrão de contexto (`t: (key) => key`) já é a função
 * identidade, então os textos reais aparecem sem tradução alguma.
 */
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: rpcMock },
}));

vi.mock("@/components/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

type FakeValidation = {
  valid: true;
  member_id: string;
  full_name: string;
  photo_url: string | null;
  status: string;
  member_role: string;
  organization_id: string;
  organization_name: string;
  congregation_id: string | null;
  sector_id: string | null;
  matricula: string;
  discipline_period_recorded?: boolean;
  discipline_started_at?: string | null;
  discipline_expected_end_at?: string | null;
};

function buildValidationResult(
  status: string,
  discipline?: {
    discipline_period_recorded?: boolean;
    discipline_started_at?: string | null;
    discipline_expected_end_at?: string | null;
  },
): FakeValidation {
  return {
    valid: true,
    member_id: "11111111-1111-4111-8111-111111111111",
    full_name: "ANDRIELE DOS SANTOS BRAZ",
    photo_url: null,
    status,
    member_role: "Membro",
    organization_id: "org-1",
    organization_name: "Assembleia de Deus Caxias do Sul",
    congregation_id: null,
    sector_id: null,
    matricula: "019904",
    ...discipline,
  };
}

/** Renderiza o componente real usando o fluxo real de token pela URL. */
function renderWithToken(token: string) {
  window.history.pushState({}, "", `/admin/porteiro?token=${encodeURIComponent(token)}`);
  return render(<ModoPorteiro />);
}

describe("ModoPorteiro — selo real de status após validação do QR (Fase 1C-G4)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('"Em disciplina": selo âmbar, texto correto, nunca verde, identidade continua confirmada', async () => {
    rpcMock.mockResolvedValueOnce({ data: buildValidationResult("Em disciplina"), error: null });
    const { container } = renderWithToken("token-em-disciplina");

    await screen.findByText("Membro validado");

    const pill = container.querySelector("[data-porteiro-status-pill]");
    expect(pill).not.toBeNull();
    expect(pill).toHaveTextContent(/em disciplina/i);
    expect(pill).toHaveClass("bg-amber-200");
    expect(pill).not.toHaveClass("bg-emerald-200");
    expect(pill?.className).not.toMatch(/emerald/);

    // O card de "Membro validado" (identidade/QR confirmados) continua
    // verde — isso é esperado e não deve ser confundido com o status do
    // membro, que é exclusivamente o selo [data-porteiro-status-pill].
    expect(screen.getByText("Membro validado")).toBeInTheDocument();
    expect(screen.getByText("ANDRIELE DOS SANTOS BRAZ")).toBeInTheDocument();

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("validate_member_validation_token", {
      p_token: "token-em-disciplina",
    });
  });

  it('"Inativo": selo vermelho, texto correto, nunca verde', async () => {
    rpcMock.mockResolvedValueOnce({ data: buildValidationResult("Inativo"), error: null });
    const { container } = renderWithToken("token-inativo");

    await screen.findByText("Membro validado");

    const pill = container.querySelector("[data-porteiro-status-pill]");
    expect(pill).toHaveTextContent("Inativo");
    expect(pill).toHaveClass("bg-red-200");
    expect(pill).not.toHaveClass("bg-emerald-200");
    expect(pill?.className).not.toMatch(/emerald/);
  });

  it('status desconhecido ("Bloqueado"): exibe o valor real, selo neutro slate, nunca "Ativo"/verde', async () => {
    rpcMock.mockResolvedValueOnce({ data: buildValidationResult("Bloqueado"), error: null });
    const { container } = renderWithToken("token-bloqueado");

    await screen.findByText("Membro validado");

    const pill = container.querySelector("[data-porteiro-status-pill]");
    expect(pill).toHaveTextContent("Bloqueado");
    expect(pill).toHaveClass("bg-slate-200");
    expect(pill).not.toHaveClass("bg-emerald-200");
    expect(pill?.textContent).not.toBe("Ativo");
    expect(pill?.className).not.toMatch(/emerald/);
  });

  it("o selo verificado é sempre o elemento [data-porteiro-status-pill], não o card de identidade confirmada", async () => {
    rpcMock.mockResolvedValueOnce({ data: buildValidationResult("Em disciplina"), error: null });
    const { container } = renderWithToken("token-selo-real");

    await screen.findByText("Membro validado");

    const pills = container.querySelectorAll("[data-porteiro-status-pill]");
    expect(pills).toHaveLength(1);
    // O card de sucesso ao redor do selo permanece com fundo verde
    // (identidade/QR confirmados) — isso é esperado e coexiste com um selo
    // não-verde no mesmo card.
    expect(container.querySelector(".bg-emerald-50")).not.toBeNull();
    expect(pills[0]).not.toHaveClass("bg-emerald-200");
  });

  it("consulta a RPC validate_member_validation_token com o token real da URL, uma única vez, sem alterar TTL/geração/consumo do token", async () => {
    rpcMock.mockResolvedValueOnce({ data: buildValidationResult("Ativo"), error: null });
    renderWithToken("token-consumo-unico-abcdef");

    await screen.findByText("Membro validado");

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("validate_member_validation_token", {
      p_token: "token-consumo-unico-abcdef",
    });
    // O componente não gera, renova nem revalida o mesmo token: só existe
    // uma chamada de RPC por montagem/token lido da URL.
  });

  it.each(MEMBER_STATUSES)(
    'status canônico "%s": selo mostra o valor real e só é verde/esmeralda quando o status é Ativo',
    async (status) => {
      rpcMock.mockResolvedValueOnce({ data: buildValidationResult(status), error: null });
      const { container } = renderWithToken(`token-${status}`);

      await screen.findByText("Membro validado");

      const pill = container.querySelector("[data-porteiro-status-pill]");
      expect(pill).not.toBeNull();
      if (status === "Ativo") {
        expect(pill).toHaveClass("bg-emerald-200");
        expect(pill).toHaveTextContent("Ativo");
      } else {
        expect(pill).not.toHaveClass("bg-emerald-200");
        expect(pill?.className).not.toMatch(/emerald/);
        expect(pill?.textContent).not.toBe("Ativo");
      }
    },
  );

  it('alias legado "Disciplinado": apresentação idêntica a "Em disciplina", nunca verde', async () => {
    rpcMock.mockResolvedValueOnce({ data: buildValidationResult("Disciplinado"), error: null });
    const { container } = renderWithToken("token-disciplinado");

    await screen.findByText("Membro validado");

    const pill = container.querySelector("[data-porteiro-status-pill]");
    expect(pill).toHaveTextContent("Em disciplina");
    expect(pill).toHaveClass("bg-amber-200");
    expect(pill).not.toHaveClass("bg-emerald-200");
  });
});

/**
 * FASE 1C-H3 — período disciplinar exibido junto ao selo, usando os campos
 * retornados por `validate_member_validation_token`. Nunca inventa data e
 * nunca exibe motivo/descrição (a RPC não retorna esse campo).
 */
describe("ModoPorteiro — período disciplinar (Fase 1C-H3)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("mostra início e previsão de término quando o período foi registrado", async () => {
    rpcMock.mockResolvedValueOnce({
      data: buildValidationResult("Em disciplina", {
        discipline_period_recorded: true,
        discipline_started_at: "2026-01-10",
        discipline_expected_end_at: "2026-03-01",
      }),
      error: null,
    });
    const { container } = renderWithToken("token-periodo-completo");

    await screen.findByText("Membro validado");

    const period = container.querySelector("[data-porteiro-discipline-period]");
    expect(period).toHaveTextContent("Início: 10/01/2026");
    expect(period).toHaveTextContent("Previsão: 01/03/2026");
  });

  it("sem término previsto, mostra 'Período em andamento'", async () => {
    rpcMock.mockResolvedValueOnce({
      data: buildValidationResult("Em disciplina", {
        discipline_period_recorded: true,
        discipline_started_at: "2026-01-10",
        discipline_expected_end_at: null,
      }),
      error: null,
    });
    const { container } = renderWithToken("token-periodo-andamento");

    await screen.findByText("Membro validado");

    expect(container.querySelector("[data-porteiro-discipline-period]")).toHaveTextContent(
      "Período em andamento",
    );
  });

  it("sem período registrado (legado), mostra aviso sem inventar nenhuma data", async () => {
    rpcMock.mockResolvedValueOnce({
      data: buildValidationResult("Disciplinado", { discipline_period_recorded: false }),
      error: null,
    });
    const { container } = renderWithToken("token-periodo-legado");

    await screen.findByText("Membro validado");

    const period = container.querySelector("[data-porteiro-discipline-period]");
    expect(period).toHaveTextContent("Período ainda não informado");
    expect(period?.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("nunca exibe motivo/descrição confidencial junto ao período", async () => {
    rpcMock.mockResolvedValueOnce({
      data: buildValidationResult("Em disciplina", {
        discipline_period_recorded: true,
        discipline_started_at: "2026-01-10",
        discipline_expected_end_at: null,
      }),
      error: null,
    });
    renderWithToken("token-sem-motivo");

    await screen.findByText("Membro validado");

    expect(screen.queryByText(/confidencial/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/motivo/i)).not.toBeInTheDocument();
  });

  it("não exibe o período para status não disciplinares", async () => {
    rpcMock.mockResolvedValueOnce({ data: buildValidationResult("Ativo"), error: null });
    const { container } = renderWithToken("token-ativo-sem-periodo");

    await screen.findByText("Membro validado");

    expect(container.querySelector("[data-porteiro-discipline-period]")).toBeNull();
  });

  /**
   * FASE 1C-H5 — correção direta P2: `discipline_period_recorded === true`
   * sem `discipline_started_at` é um retorno inconsistente do backend, não
   * a mesma "ausência legítima" de um membro legado sem período. Nunca
   * inventa data; a identidade e o selo âmbar continuam confirmados.
   */
  it("recorded=true sem discipline_started_at mostra aviso de inconsistência, nunca 'ainda não informado' e nunca inventa data", async () => {
    rpcMock.mockResolvedValueOnce({
      data: buildValidationResult("Em disciplina", {
        discipline_period_recorded: true,
        discipline_started_at: null,
        discipline_expected_end_at: null,
      }),
      error: null,
    });
    const { container } = renderWithToken("token-periodo-inconsistente");

    await screen.findByText("Membro validado");

    const period = container.querySelector("[data-porteiro-discipline-period]");
    expect(period).toHaveTextContent("Dados do período disciplinar inconsistentes");
    expect(period).not.toHaveTextContent("Período ainda não informado");
    expect(period?.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);

    // Identidade e selo continuam confirmados mesmo com o dado inconsistente.
    expect(screen.getByText("Membro validado")).toBeInTheDocument();
    const pill = container.querySelector("[data-porteiro-status-pill]");
    expect(pill).toHaveClass("bg-amber-200");
  });
});
