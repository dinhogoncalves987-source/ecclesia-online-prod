import { describe, it, expect } from "vitest";
import { matchesMemberSearch, type SearchableMember } from "./memberSearch";

function makeMember(overrides: Partial<SearchableMember> = {}): SearchableMember {
  return {
    full_name: "João da Silva",
    known_name: "Joãozinho",
    member_code: "0001",
    legacy_code: "WT-9876",
    legacy_registration: "MAT-555",
    cpf: "11144477735",
    member_role: "Diácono",
    administrative_role: "Nenhum",
    email: "joao@example.com",
    phone: "11999990000",
    whatsapp: "11999990001",
    ...overrides,
  };
}

describe("matchesMemberSearch", () => {
  it("retorna true para query vazia (sem filtro)", () => {
    expect(matchesMemberSearch(makeMember(), "")).toBe(true);
    expect(matchesMemberSearch(makeMember(), "   ")).toBe(true);
  });

  it("encontra por nome completo (case-insensitive)", () => {
    expect(matchesMemberSearch(makeMember(), "joão da silva")).toBe(true);
    expect(matchesMemberSearch(makeMember(), "SILVA")).toBe(true);
  });

  it("encontra por nome conhecido", () => {
    expect(matchesMemberSearch(makeMember(), "joãozinho")).toBe(true);
  });

  it("encontra por código operacional do Ecclesia", () => {
    expect(matchesMemberSearch(makeMember(), "0001")).toBe(true);
  });

  it("encontra por código legado do Wintechi", () => {
    expect(matchesMemberSearch(makeMember(), "wt-9876")).toBe(true);
  });

  it("encontra por matrícula antiga", () => {
    expect(matchesMemberSearch(makeMember(), "mat-555")).toBe(true);
  });

  it("encontra por CPF", () => {
    expect(matchesMemberSearch(makeMember(), "11144477735")).toBe(true);
  });

  it("encontra por telefone e WhatsApp", () => {
    expect(matchesMemberSearch(makeMember(), "999990000")).toBe(true);
    expect(matchesMemberSearch(makeMember(), "999990001")).toBe(true);
  });

  it("encontra por e-mail", () => {
    expect(matchesMemberSearch(makeMember(), "joao@example.com")).toBe(true);
  });

  it("não encontra quando nada corresponde", () => {
    expect(matchesMemberSearch(makeMember(), "inexistente-xyz")).toBe(false);
  });

  it("lida com campos nulos sem lançar erro", () => {
    const member = makeMember({ known_name: null, legacy_code: null, legacy_registration: null, cpf: null, email: null, phone: null, whatsapp: null });
    expect(() => matchesMemberSearch(member, "silva")).not.toThrow();
    expect(matchesMemberSearch(member, "silva")).toBe(true);
    expect(matchesMemberSearch(member, "inexistente")).toBe(false);
  });
});
