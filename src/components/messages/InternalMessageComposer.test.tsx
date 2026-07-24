import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InternalMessageComposer } from "./InternalMessageComposer";

/**
 * OPERAÇÃO ESPECIAL — Parte C (Ecclesia Chat), item 10.1: "digitação
 * invertida". Regressão para o bug em que digitar `abençoado` podia virar
 * `bençoadoa` (ou qualquer outra reordenação de caracteres).
 *
 * A causa raiz identificada na auditoria: sincronizar o estado React
 * (setText) e mexer no DOM (auto-grow do textarea) a CADA evento onChange
 * durante uma composição de IME ativa (acentos/mobile) disputa o DOM com o
 * navegador enquanto ele ainda está montando o glifo. A correção usa
 * `isComposingRef` para nunca tocar em texto/altura enquanto
 * `compositionstart`..`compositionend` está em andamento.
 */
describe("InternalMessageComposer — ordem de digitação e composição IME", () => {
  it("mantém a ordem exata dos caracteres em digitação simples, sem IME (onChange sequencial)", () => {
    render(<InternalMessageComposer onSend={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Mensagem") as HTMLTextAreaElement;

    // Simula digitação tecla-a-tecla como o navegador realmente dispara:
    // cada onChange recebe o value ACUMULADO até aquele ponto.
    const word = "abençoado";
    for (let i = 1; i <= word.length; i++) {
      fireEvent.change(textarea, { target: { value: word.slice(0, i) } });
    }

    expect(textarea.value).toBe("abençoado");
    expect(textarea.value).not.toBe("bençoadoa");
  });

  it("nunca reordena caracteres ao concluir uma composição de IME (compositionend sincroniza o valor final)", () => {
    render(<InternalMessageComposer onSend={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Mensagem") as HTMLTextAreaElement;

    fireEvent.compositionStart(textarea);
    // Enquanto compõe, o navegador desenha os glifos intermediários
    // livremente no próprio DOM. O React não deve disputar isso re-setando
    // estado/altura a cada evento — é exatamente essa disputa que causava a
    // reordenação de caracteres no bug original.
    fireEvent.change(textarea, { target: { value: "aben" } });
    fireEvent.change(textarea, { target: { value: "abenç" } });
    fireEvent.change(textarea, { target: { value: "abenço" } });

    // Ao concluir a composição, o valor final e completo é sincronizado de
    // uma vez com o estado React — nunca fragmentado/reordenado.
    fireEvent.compositionEnd(textarea, { target: { value: "abençoado" } });
    expect(textarea.value).toBe("abençoado");
    expect(textarea.value).not.toBe("bençoadoa");
  });

  it("preserva colagem de texto acentuado sem reordenar caracteres", () => {
    render(<InternalMessageComposer onSend={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Mensagem") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "Que Deus os abençoe e guarde! 🙏" } });

    expect(textarea.value).toBe("Que Deus os abençoe e guarde! 🙏");
  });

  it("envia exatamente o texto digitado, sem reordenação, ao pressionar Enter", async () => {
    const onSend = vi.fn();
    render(<InternalMessageComposer onSend={onSend} />);
    const textarea = screen.getByPlaceholderText("Mensagem") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "abençoado" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    expect(onSend).toHaveBeenCalledWith("abençoado", undefined);
  });

  it("ignora Enter disparado durante composição de IME (nunca envia a meio da digitação)", () => {
    const onSend = vi.fn();
    render(<InternalMessageComposer onSend={onSend} />);
    const textarea = screen.getByPlaceholderText("Mensagem") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "abenç" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter", isComposing: true });

    expect(onSend).not.toHaveBeenCalled();
  });
});
