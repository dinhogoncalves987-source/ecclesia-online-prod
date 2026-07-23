import { describe, it, expect } from "vitest";
import { validateCpf, formatCpf } from "./cpfValidation";

describe("validateCpf", () => {
  it("valida CPF válido (exemplo real formatado)", () => {
    expect(validateCpf("529.982.247-25")).toBe("52998224725");
  });

  it("valida CPF válido (apenas dígitos)", () => {
    expect(validateCpf("52998224725")).toBe("52998224725");
  });

  it("rejeita CPF com todos os dígitos iguais", () => {
    expect(validateCpf("111.111.111-11")).toBeNull();
    expect(validateCpf("000.000.000-00")).toBeNull();
  });

  it("rejeita CPF com dígito verificador errado", () => {
    expect(validateCpf("529.982.247-26")).toBeNull();
    expect(validateCpf("123.456.789-00")).toBeNull();
  });

  it("rejeita CPF com menos de 11 dígitos", () => {
    expect(validateCpf("529.982.247")).toBeNull();
  });

  it("rejeita CPF com mais de 11 dígitos", () => {
    expect(validateCpf("529.982.247-251")).toBeNull();
  });

  it("rejeita CPF vazio ou null", () => {
    expect(validateCpf("")).toBeNull();
    expect(validateCpf(null)).toBeNull();
    expect(validateCpf(undefined)).toBeNull();
  });

  it("rejeita CPF com letras", () => {
    expect(validateCpf("abc.def.ghi-jk")).toBeNull();
  });
});

describe("formatCpf", () => {
  it("formata CPF limpo para exibição", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });

  it("retorna null para CPF inválido", () => {
    expect(formatCpf("123")).toBeNull();
    expect(formatCpf(null)).toBeNull();
    expect(formatCpf("")).toBeNull();
  });
});
