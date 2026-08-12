import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisciplinePeriodDialog } from "./DisciplinePeriodDialog";

/**
 * FASE 1C-H3 — testes comportamentais do diálogo único usado para
 * registrar, regularizar e encerrar o período disciplinar de um membro.
 * Nenhuma data é preenchida silenciosamente: o usuário sempre confirma o
 * valor visível antes do componente pai chamar a RPC.
 */
describe("DisciplinePeriodDialog — entrada em disciplina (mode=enter)", () => {
  it("renderiza os campos obrigatórios e opcionais com Cancelar/Confirmar", () => {
    render(
      <DisciplinePeriodDialog
        open
        mode="enter"
        memberName="Andriele dos Santos Braz"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Andriele dos Santos Braz")).toBeInTheDocument();
    expect(screen.getByLabelText(/Início da disciplina/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Término previsto/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Motivo\/observação/)).toBeInTheDocument();
    expect(screen.getByText(/confidencial/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument();
  });

  it("bloqueia confirmação sem início obrigatório e não chama onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog open mode="enter" memberName="Membro X" onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Informe a data de início da disciplina.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("rejeita início no futuro e não chama onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog open mode="enter" memberName="Membro X" onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText(/Início da disciplina/), { target: { value: tomorrow } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("O início não pode estar no futuro.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("rejeita término previsto anterior ao início e não chama onConfirm", () => {
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog open mode="enter" memberName="Membro X" onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    fireEvent.change(screen.getByLabelText(/Início da disciplina/), { target: { value: "2026-01-10" } });
    fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: "2026-01-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("O término previsto não pode ser anterior ao início.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("chama onConfirm com os argumentos exatos quando os dados são válidos", () => {
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog open mode="enter" memberName="Membro X" onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    fireEvent.change(screen.getByLabelText(/Início da disciplina/), { target: { value: "2026-01-10" } });
    fireEvent.change(screen.getByLabelText(/Término previsto/), { target: { value: "2026-03-01" } });
    fireEvent.change(screen.getByLabelText(/Motivo\/observação/), { target: { value: "Observação confidencial" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onConfirm).toHaveBeenCalledWith({
      startedAt: "2026-01-10",
      expectedEndAt: "2026-03-01",
      description: "Observação confidencial",
      endedAt: null,
    });
  });

  it("permite término previsto e descrição vazios (opcionais)", () => {
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog open mode="enter" memberName="Membro X" onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    fireEvent.change(screen.getByLabelText(/Início da disciplina/), { target: { value: "2026-01-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onConfirm).toHaveBeenCalledWith({
      startedAt: "2026-01-10",
      expectedEndAt: null,
      description: null,
      endedAt: null,
    });
  });

  it("Cancelar chama onCancel e nunca onConfirm", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog open mode="enter" memberName="Membro X" onCancel={onCancel} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("DisciplinePeriodDialog — regularização de legados (mode=regularize)", () => {
  it("sem período conhecido, mostra o aviso de legado e mantém os campos vazios", () => {
    render(
      <DisciplinePeriodDialog
        open
        mode="regularize"
        memberName="Daniel"
        currentPeriod={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Período ainda não informado — registre as datas reais.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Início da disciplina/)).toHaveValue("");
  });

  it("com período conhecido, pré-preenche início e término previsto sem mostrar o aviso de legado", () => {
    render(
      <DisciplinePeriodDialog
        open
        mode="regularize"
        memberName="Doraci"
        currentPeriod={{ startedAt: "2025-05-01", expectedEndAt: "2025-11-01" }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByText(/registre as datas reais/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Início da disciplina/)).toHaveValue("2025-05-01");
    expect(screen.getByLabelText(/Término previsto/)).toHaveValue("2025-11-01");
  });

  it("permite regularizar com as datas reais informadas pelo usuário", () => {
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog
        open
        mode="regularize"
        memberName="Andriele"
        currentPeriod={null}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Início da disciplina/), { target: { value: "2024-09-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onConfirm).toHaveBeenCalledWith({
      startedAt: "2024-09-15",
      expectedEndAt: null,
      description: null,
      endedAt: null,
    });
  });
});

describe("DisciplinePeriodDialog — encerramento real (mode=end)", () => {
  it("mostra o status de destino e as datas registradas em modo leitura", () => {
    render(
      <DisciplinePeriodDialog
        open
        mode="end"
        memberName="Membro Y"
        targetStatusLabel="Ativo"
        currentPeriod={{ startedAt: "2026-01-10", expectedEndAt: "2026-03-01" }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.getByText("10/01/2026")).toBeInTheDocument();
    expect(screen.getByText("01/03/2026")).toBeInTheDocument();
    expect(screen.getByLabelText(/Data real de encerramento/)).toBeInTheDocument();
  });

  it("sem término previsto, mostra 'Período em andamento' no resumo", () => {
    render(
      <DisciplinePeriodDialog
        open
        mode="end"
        memberName="Membro Y"
        targetStatusLabel="Ativo"
        currentPeriod={{ startedAt: "2026-01-10", expectedEndAt: null }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Período em andamento")).toBeInTheDocument();
  });

  it("bloqueia confirmação sem a data real de encerramento", () => {
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog
        open
        mode="end"
        memberName="Membro Y"
        targetStatusLabel="Ativo"
        currentPeriod={{ startedAt: "2026-01-10", expectedEndAt: null }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Informe a data real de encerramento.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("rejeita encerramento anterior ao início registrado", () => {
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog
        open
        mode="end"
        memberName="Membro Y"
        targetStatusLabel="Ativo"
        currentPeriod={{ startedAt: "2026-01-10", expectedEndAt: null }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Data real de encerramento/), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("O encerramento não pode ser anterior ao início registrado.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirma o encerramento enviando somente a data real, com os demais campos nulos", () => {
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog
        open
        mode="end"
        memberName="Membro Y"
        targetStatusLabel="Ativo"
        currentPeriod={{ startedAt: "2026-01-10", expectedEndAt: "2026-03-01" }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Data real de encerramento/), { target: { value: "2026-02-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onConfirm).toHaveBeenCalledWith({
      startedAt: null,
      expectedEndAt: null,
      description: null,
      endedAt: "2026-02-15",
    });
  });
});

describe("DisciplinePeriodDialog — fechado", () => {
  it("não renderiza nada quando open=false", () => {
    const { container } = render(
      <DisciplinePeriodDialog open={false} mode="enter" memberName="Membro X" onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * FASE 1C-H5 — achado P1: a validação "início não pode estar no futuro"
 * precisa usar o dia civil LOCAL do dispositivo, nunca `toISOString()`
 * (que é UTC). Fixamos o relógio às 23h30 do horário local — o instante em
 * que o dia UTC mais frequentemente já avançou em relação ao dia civil no
 * fuso do Brasil — e provamos que o próprio dia (2026-08-12) continua
 * aceito, e que só um dia realmente futuro (2026-08-13) é rejeitado. O
 * valor esperado nunca é obtido chamando `toISOString()` de novo: é um
 * literal, para que o teste não repita o mesmo bug que está sendo evitado.
 */
describe("DisciplinePeriodDialog — dia civil local (Fase 1C-H5, achado P1)", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "America/Sao_Paulo";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it("23h30 do dia civil local (2026-08-12) não é rejeitado como data futura", () => {
    vi.setSystemTime(new Date(2026, 7, 12, 23, 30, 0));
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog open mode="enter" memberName="Membro X" onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    fireEvent.change(screen.getByLabelText(/Início da disciplina/), { target: { value: "2026-08-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ startedAt: "2026-08-12" }));
  });

  it("um dia realmente futuro (2026-08-13) continua rejeitado às 23h30 locais de 2026-08-12", () => {
    vi.setSystemTime(new Date(2026, 7, 12, 23, 30, 0));
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog open mode="enter" memberName="Membro X" onCancel={vi.fn()} onConfirm={onConfirm} />,
    );

    fireEvent.change(screen.getByLabelText(/Início da disciplina/), { target: { value: "2026-08-13" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("O início não pode estar no futuro.");
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

/**
 * FASE 1C-H5 — correção direta P2: duas confirmações antes do próximo
 * render (duplo clique) devem disparar uma única chamada a `onConfirm`. A
 * trava é síncrona (useRef) — não depende da prop `submitting`, que só
 * reflete a mutação em andamento depois que o componente pai processa o
 * primeiro clique.
 */
describe("DisciplinePeriodDialog — submissão dupla (Fase 1C-H5, correção P2)", () => {
  it("dois cliques rápidos em Confirmar (modo enter) chamam onConfirm uma única vez", () => {
    const onConfirm = vi.fn();
    render(
      <DisciplinePeriodDialog
        open
        mode="enter"
        memberName="Membro X"
        submitting={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Início da disciplina/), { target: { value: "2026-01-10" } });
    const confirmButton = screen.getByRole("button", { name: "Confirmar" });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("depois que o pai conclui a operação (submitting volta a false), um novo clique é permitido", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <DisciplinePeriodDialog
        open
        mode="enter"
        memberName="Membro X"
        submitting={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Início da disciplina/), { target: { value: "2026-01-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    // Simula o ciclo real: o pai sinaliza submitting=true e depois volta a
    // false quando a RPC conclui (com erro, por exemplo — diálogo permanece
    // aberto para nova tentativa).
    rerender(
      <DisciplinePeriodDialog
        open
        mode="enter"
        memberName="Membro X"
        submitting
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    rerender(
      <DisciplinePeriodDialog
        open
        mode="enter"
        memberName="Membro X"
        submitting={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});
