import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * FASE 1C-H3/1C-H5 — guarda de regressão estática para a integração do
 * período disciplinar no frontend.
 *
 * `Membros.tsx` não tem um arquivo de teste comportamental dedicado (fora do
 * escopo autorizado desta fase). Este teste faz uma verificação estática do
 * código-fonte — no mesmo espírito de `membersServerSidePaginationGuard.test.ts`
 * e `walletStatusAndQrLogoGuard.test.ts` — para garantir que:
 *
 *   1. nenhum caminho da interface volte a atualizar `members.status`
 *      diretamente via `.update()` (a RPC transacional
 *      `set_member_status_with_discipline` é o único caminho);
 *   2. a ação "Período" e o bloqueio de legado sem período existem;
 *   3. nenhuma data é preenchida silenciosamente pelo diálogo;
 *   4. a Carteira e o Modo Porteiro nunca expõem motivo/descrição
 *      confidencial junto ao período;
 *   5. a paginação/busca server-side de Membros continua sem `count: "exact"`
 *      e sem fetch-all (não regressão da Fase 1A/1B);
 *   6. (Fase 1C-H5) as correções P1/P2 da revisão 1C-H4 não regridem: dia
 *      civil local (nunca `toISOString()`), erro técnico nunca disfarçado
 *      de ausência, exportação bloqueada durante carregamento/erro,
 *      ausência do guard booleano de execução única, trava de concorrência
 *      por membro, proteção contra submissão dupla e retorno inconsistente
 *      do Porteiro.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const MEMBROS_SOURCE = readFileSync(path.join(ROOT, "src", "pages", "Membros.tsx"), "utf8");
const WALLET_SOURCE = readFileSync(path.join(ROOT, "src", "components", "MemberWalletCard.tsx"), "utf8");
const PORTEIRO_SOURCE = readFileSync(path.join(ROOT, "src", "pages", "ModoPorteiro.tsx"), "utf8");
const DIALOG_SOURCE = readFileSync(path.join(ROOT, "src", "components", "DisciplinePeriodDialog.tsx"), "utf8");

describe("guarda de regressão — mudança de status via RPC transacional (Membros.tsx)", () => {
  it("não existe mais nenhum caminho de interface que atualize members.status diretamente", () => {
    expect(MEMBROS_SOURCE).not.toMatch(/from\(\s*["']members["']\s*\)\s*\.update\(\s*\{\s*status/);
  });

  it("usa a RPC transacional set_member_status_with_discipline com os seis argumentos do contrato", () => {
    expect(MEMBROS_SOURCE).toContain('supabase.rpc("set_member_status_with_discipline"');
    expect(MEMBROS_SOURCE).toContain("p_member_id: id");
    expect(MEMBROS_SOURCE).toContain("p_new_status: newStatus");
    expect(MEMBROS_SOURCE).toContain("p_discipline_started_at:");
    expect(MEMBROS_SOURCE).toContain("p_discipline_expected_end_at:");
    expect(MEMBROS_SOURCE).toContain("p_discipline_description:");
    expect(MEMBROS_SOURCE).toContain("p_discipline_ended_at:");
  });

  it("consulta get_current_member_discipline_period antes de bloquear ou abrir o diálogo de encerramento/regularização", () => {
    expect(MEMBROS_SOURCE).toContain('supabase.rpc("get_current_member_discipline_period"');
  });

  it("bloqueia a saída da disciplina de um membro legado sem período registrado, sem inventar data", () => {
    expect(MEMBROS_SOURCE).toContain("Registre o período disciplinar antes de alterar este status.");
  });

  it('oferece a ação "Período" apenas para membros em disciplina, na listagem desktop e mobile', () => {
    const occurrences = (MEMBROS_SOURCE.match(/openDisciplinePeriodAction/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3); // definição + 2 chamadas (desktop e mobile)
    expect(MEMBROS_SOURCE).toMatch(/DISCIPLINE_STATUSES\.has\(m\.status\)/);
  });

  it("nunca preenche datas fictícias: nenhuma data literal é enviada à RPC de status/disciplina", () => {
    const rpcCallMatch = MEMBROS_SOURCE.match(
      /supabase\.rpc\("set_member_status_with_discipline",\s*\{[\s\S]*?\}\);/,
    );
    expect(rpcCallMatch, "chamada da RPC não encontrada").not.toBeNull();
    expect(rpcCallMatch?.[0]).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("renderiza o DisciplinePeriodDialog controlado pelo estado local, nunca sempre aberto", () => {
    expect(MEMBROS_SOURCE).toContain('from "@/components/DisciplinePeriodDialog"');
    expect(MEMBROS_SOURCE).toMatch(/<DisciplinePeriodDialog\b/);
    expect(MEMBROS_SOURCE).toContain("open={!!disciplineDialog}");
  });

  it("preserva hasNextPage como a única fonte de verdade da paginação (não regressão)", () => {
    // A ausência de count:"exact"/fetch-all já é coberta exaustivamente (24
    // casos) por `membersServerSidePaginationGuard.test.ts`, executado nas
    // validações desta fase. Uma regex ingênua aqui colidiria com os
    // próprios comentários do código-fonte que documentam essa ausência
    // (ex.: "nunca por count:\"exact\"", "antigo reloadMembers (while(true)").
    expect(MEMBROS_SOURCE).toContain("hasNextPage");
  });
});

/**
 * FASE 1C-H5 — correção direta P2: trava de concorrência por membro. Duas
 * ativações do mesmo membro antes do próximo render não podem disparar duas
 * RPCs; o select e o botão "Período" ficam desabilitados durante a
 * mutação; tudo é restaurado em `finally`.
 */
describe("guarda de regressão — concorrência de status por membro (Fase 1C-H5, correção P2)", () => {
  it("existe uma trava síncrona (useRef<Set>) checada antes de iniciar qualquer mutação de status/disciplina", () => {
    expect(MEMBROS_SOURCE).toMatch(/useRef<Set<string>>\(new Set\(\)\)/);
    expect(MEMBROS_SOURCE).toContain("beginMemberMutation");
    expect(MEMBROS_SOURCE).toContain("endMemberMutation");
    expect(MEMBROS_SOURCE).toMatch(/if\s*\(\s*!beginMemberMutation\(m\.id\)\s*\)\s*return;/);
  });

  it("libera a trava em finally em handleStatusSelect e openDisciplinePeriodAction", () => {
    const occurrences = (MEMBROS_SOURCE.match(/if\s*\(\s*!keepLocked\s*\)\s*endMemberMutation\(m\.id\);/g) || [])
      .length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("libera a trava ao cancelar ou concluir o diálogo disciplinar (não fica presa com o diálogo aberto)", () => {
    expect(MEMBROS_SOURCE).toMatch(/endMemberMutation\(disciplineDialog\.member\.id\)/);
    expect(MEMBROS_SOURCE).toMatch(/endMemberMutation\(memberId\)/);
  });

  it("select de status (desktop e mobile) e botão Período ficam desabilitados via mutatingMemberIds, nunca o antigo guard booleano único", () => {
    const selectDisabledOccurrences = (MEMBROS_SOURCE.match(/disabled=\{mutatingMemberIds\.has\(m\.id\)\}/g) || [])
      .length;
    expect(selectDisabledOccurrences).toBeGreaterThanOrEqual(3); // 2 selects + botão "Período" desktop (mobile reaproveita a mesma expressão)
    expect(MEMBROS_SOURCE).not.toContain("disciplineBusyId");
    expect(MEMBROS_SOURCE).not.toContain("setDisciplineBusyId");
  });

  it("erro da RPC de status continua restaurando o select real (resyncStatusSelect) mesmo com a trava nova", () => {
    expect(MEMBROS_SOURCE).toContain("resyncStatusSelect(id)");
  });
});

describe("guarda de regressão — período na Carteira sem motivo confidencial (MemberWalletCard.tsx)", () => {
  it("consulta get_current_member_discipline_period somente para status disciplinares", () => {
    expect(WALLET_SOURCE).toContain('supabase.rpc("get_current_member_discipline_period"');
    expect(WALLET_SOURCE).toMatch(/if\s*\(\s*!isDisciplineStatus\s*\)\s*\{[\s\S]{0,80}?return;/);
  });

  it("nunca exibe motivo/descrição confidencial no cartão, PDF ou compartilhamento", () => {
    expect(WALLET_SOURCE).not.toContain("discipline_description");
    expect(WALLET_SOURCE).not.toMatch(/p_discipline_description/);
  });

  it("nunca inventa data: sem registro mostra 'Período ainda não informado', sem previsão mostra 'Período em andamento'", () => {
    expect(WALLET_SOURCE).toContain("Período ainda não informado");
    expect(WALLET_SOURCE).toContain("Período em andamento");
  });
});

/**
 * FASE 1C-H5 — achados P1/P2 da revisão 1C-H4, específicos da Carteira:
 * erro técnico nunca disfarçado de ausência, exportação bloqueada durante
 * carregamento/erro, e o guard booleano de execução única (frágil sob
 * Strict Mode e trocas de membro) foi substituído por sequência de
 * requisição.
 */
describe("guarda de regressão — Carteira: erro real, exportação protegida, sem guard de execução única (Fase 1C-H5)", () => {
  it("o antigo guard booleano disciplinePeriodFetchedRef foi removido (substituído por sequência de requisição)", () => {
    expect(WALLET_SOURCE).not.toContain("disciplinePeriodFetchedRef");
    expect(WALLET_SOURCE).toContain("disciplineRequestIdRef");
    expect(WALLET_SOURCE).toMatch(/requestId\s*===\s*disciplineRequestIdRef\.current/);
  });

  it("verifica result.error da RPC e nunca trata erro/motivo inesperado como ausência legítima", () => {
    expect(WALLET_SOURCE).toMatch(/if\s*\(\s*result\?\.\s*error\s*\)/);
    expect(WALLET_SOURCE).toContain("DISCIPLINE_PERIOD_NOT_RECORDED_REASON");
    expect(WALLET_SOURCE).toContain("Não foi possível carregar o período disciplinar");
  });

  it("bloqueia PDF/impressão/compartilhamento (disabled) durante carregamento ou erro, libera após resposta confiável", () => {
    expect(WALLET_SOURCE).toContain("disciplineDocumentActionsBlocked");
    expect(WALLET_SOURCE).toMatch(/disabled=\{disciplineDocumentActionsBlocked\}/);
    expect(WALLET_SOURCE).toMatch(/kind\s*===\s*"loading"\s*\|\|\s*disciplineState\.kind\s*===\s*"error"/);
  });
});

describe("guarda de regressão — período no Modo Porteiro sem motivo confidencial (ModoPorteiro.tsx)", () => {
  it("ValidationResult foi ampliado com os três campos de período, sem motivo/descrição", () => {
    expect(PORTEIRO_SOURCE).toContain("discipline_period_recorded?: boolean");
    expect(PORTEIRO_SOURCE).toContain("discipline_started_at?: string | null");
    expect(PORTEIRO_SOURCE).toContain("discipline_expected_end_at?: string | null");
    expect(PORTEIRO_SOURCE).not.toMatch(/discipline_description/);
  });

  it("exibe o período junto ao selo de status via [data-porteiro-discipline-period]", () => {
    expect(PORTEIRO_SOURCE).toContain("data-porteiro-discipline-period");
  });

  it("nunca inventa data: sem registro mostra 'Período ainda não informado'", () => {
    expect(PORTEIRO_SOURCE).toContain("Período ainda não informado");
  });

  it("(Fase 1C-H5) recorded=true sem started_at é retorno inconsistente, nunca a mesma ausência legítima", () => {
    expect(PORTEIRO_SOURCE).toContain("Dados do período disciplinar inconsistentes");
    expect(PORTEIRO_SOURCE).toMatch(/discipline_period_recorded\s*===\s*true/);
  });
});

describe("guarda de regressão — o diálogo nunca preenche datas silenciosamente (DisciplinePeriodDialog.tsx)", () => {
  it("os campos de data começam vazios, nunca pré-preenchidos com a data de hoje", () => {
    expect(DIALOG_SOURCE).not.toMatch(/useState\(\s*todayIsoDate(Local)?\(\)\s*\)/);
    expect(DIALOG_SOURCE).toMatch(/useState\(["']["']\)/);
  });

  it("valida início obrigatório, início não futuro e término/encerramento não anterior ao início", () => {
    expect(DIALOG_SOURCE).toContain("Informe a data de início da disciplina.");
    expect(DIALOG_SOURCE).toContain("O início não pode estar no futuro.");
    expect(DIALOG_SOURCE).toContain("O término previsto não pode ser anterior ao início.");
    expect(DIALOG_SOURCE).toContain("O encerramento não pode ser anterior ao início registrado.");
  });

  it("o campo de observação é claramente identificado como confidencial", () => {
    expect(DIALOG_SOURCE).toMatch(/confidencial/i);
  });

  it("(Fase 1C-H5, achado P1) a validação de data futura usa o dia civil local (getFullYear/getMonth/getDate), nunca toISOString()", () => {
    // `toISOString()` só pode aparecer dentro de comentário explicando o bug
    // evitado — nunca em código executável (a antiga expressão buscada era
    // `new Date().toISOString().slice(0, 10)`).
    expect(DIALOG_SOURCE).not.toMatch(/toISOString\(\)\.slice/);
    expect(DIALOG_SOURCE).toContain("todayIsoDateLocal");
    expect(DIALOG_SOURCE).toMatch(/startedAt\s*>\s*todayIsoDateLocal\(\)/);
    expect(DIALOG_SOURCE).toContain("getFullYear()");
    expect(DIALOG_SOURCE).toContain("getMonth() + 1");
    expect(DIALOG_SOURCE).toContain("getDate()");
  });

  it("(Fase 1C-H5, correção P2) impede submissão dupla com uma trava síncrona (useRef), liberada quando submitting volta a false", () => {
    expect(DIALOG_SOURCE).toMatch(/const confirmingRef = useRef\(false\)/);
    expect(DIALOG_SOURCE).toMatch(/if\s*\(\s*confirmingRef\.current\s*\)\s*return;/);
    expect(DIALOG_SOURCE).toMatch(/if\s*\(\s*!submitting\s*\)\s*confirmingRef\.current\s*=\s*false;/);
  });
});
