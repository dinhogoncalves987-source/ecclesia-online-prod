import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InternalMessageComposer } from "./InternalMessageComposer";

vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ t: (value: string) => value }),
}));

vi.mock("@/components/messages/InternalAttachmentButton", () => ({
  InternalAttachmentButton: () => <button type="button" aria-label="Anexar">+</button>,
}));

vi.mock("@/components/messages/InternalAudioRecorder", () => ({
  InternalAudioRecorder: ({
    children,
  }: {
    children: (state: Record<string, unknown>) => React.ReactNode;
  }) => children({
    isRecording: false,
    isPreparing: false,
    elapsedSeconds: 0,
    start: vi.fn(),
    stopAndSend: vi.fn(),
    cancel: vi.fn(),
  }),
}));

describe("InternalMessageComposer", () => {
  it("mantém o cursor após o primeiro caractere e preserva a ordem digitada", () => {
    render(<InternalMessageComposer onSend={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("Mensagem") as HTMLTextAreaElement;

    fireEvent.focus(textarea);
    fireEvent.change(textarea, {
      target: { value: "a", selectionStart: 1, selectionEnd: 1 },
    });

    expect(textarea.value).toBe("a");
    expect(textarea.selectionStart).toBe(1);

    fireEvent.change(textarea, {
      target: { value: "ab", selectionStart: 2, selectionEnd: 2 },
    });

    expect(textarea.value).toBe("ab");
    expect(textarea.selectionStart).toBe(2);
    expect(textarea).toHaveAttribute("dir", "ltr");
  });
});
