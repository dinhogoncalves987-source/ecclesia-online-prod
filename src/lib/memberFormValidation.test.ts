import { describe, it, expect } from "vitest";
import { checkCpfForManualSave } from "./memberFormValidation";

// CPFs válidos conhecidos (dígitos verificadores corretos), usados também em
// cpfValidation.test.ts.
const VALID_CPF_1 = "111.444.777-35";
const VALID_CPF_2 = "529.982.247-25";

describe("checkCpfForManualSave", () => {
  it("bloqueia CPF ausente/vazio no cadastro manual", () => {
    expect(checkCpfForManualSave("", new Set())).toEqual({ ok: false, reason: "missing" });
    expect(checkCpfForManualSave(null, new Set())).toEqual({ ok: false, reason: "missing" });
    expect(checkCpfForManualSave("   ", new Set())).toEqual({ ok: false, reason: "missing" });
  });

  it("bloqueia CPF com dígito verificador inválido", () => {
    const result = checkCpfForManualSave("111.111.111-11", new Set());
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("bloqueia CPF com formato claramente inválido (poucos dígitos)", () => {
    expect(checkCpfForManualSave("123", new Set())).toEqual({ ok: false, reason: "invalid" });
  });

  it("aceita CPF válido não duplicado e retorna normalizado (11 dígitos)", () => {
    const result = checkCpfForManualSave(VALID_CPF_1, new Set());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toBe("11144477735");
    }
  });

  it("bloqueia CPF duplicado na mesma organização", () => {
    const existing = new Set(["11144477735"]);
    const result = checkCpfForManualSave(VALID_CPF_1, existing);
    expect(result).toEqual({ ok: false, reason: "duplicate" });
  });

  it("não bloqueia quando o CPF pertence a outra pessoa mas não está no set de duplicados", () => {
    const existing = new Set(["52998224725"]);
    const result = checkCpfForManualSave(VALID_CPF_1, existing);
    expect(result.ok).toBe(true);
  });

  it("normaliza CPF formatado e não-formatado da mesma forma para checagem de duplicidade", () => {
    const existing = new Set(["11144477735"]);
    // mesmo CPF, sem pontuação
    const result = checkCpfForManualSave("11144477735", existing);
    expect(result).toEqual({ ok: false, reason: "duplicate" });
  });

  it("permite dois CPFs válidos distintos simultaneamente (sem falso positivo de duplicidade)", () => {
    const existing = new Set(["11144477735"]);
    const result = checkCpfForManualSave(VALID_CPF_2, existing);
    expect(result.ok).toBe(true);
  });
});
