import { describe, expect, it } from "vitest";
import {
  buildManualTransactionPayload,
  createEmptyManualTransactionDraft,
  parseManualTransactionAmount,
} from "./financeManualPayload";

describe("payload de lançamento financeiro manual", () => {
  it("preserva todos os campos da operação da Assembleia de Deus", () => {
    const draft = createEmptyManualTransactionDraft({
      desc: "Oferta do culto",
      value: "R$ 1.234,56",
      date: "2026-07-29",
      issueDate: "2026-07-28",
      documentTypeId: "tipo-1",
      documentNumber: "RC-99",
      legacyRecordNumber: "123",
      periodLabel: "JUL/26",
      accountingGroupId: "grupo-1",
      accountCategoryId: "conta-1",
      districtId: "distrito-1",
      congregationId: "congregacao-1",
      contributorName: "Contribuinte",
      contributorDocument: "00000000000",
      collectorName: "Coletor",
      treasurerName: "Tesoureiro",
    });

    expect(buildManualTransactionPayload(draft, "usuario-1")).toMatchObject({
      description: "Oferta do culto",
      amount: 1234.56,
      date: "2026-07-29",
      accounting_date: "2026-07-29",
      issue_date: "2026-07-28",
      document_type_id: "tipo-1",
      document_number: "RC-99",
      legacy_record_number: "123",
      period_label: "JUL/26",
      accounting_group_id: "grupo-1",
      account_category_id: "conta-1",
      district_id: "distrito-1",
      congregation_id: "congregacao-1",
      contributor_name: "Contribuinte",
      contributor_document: "00000000000",
      collector_name: "Coletor",
      treasurer_name: "Tesoureiro",
      origin: "manual",
      source_module: "manual",
    });
  });

  it("não sobrescreve a origem de lançamentos importados durante edição", () => {
    const payload = buildManualTransactionPayload(
      createEmptyManualTransactionDraft({ desc: "Editado", value: "10" }),
      "usuario-1",
      { preserveOrigin: true },
    );

    expect(payload).not.toHaveProperty("origin");
    expect(payload).not.toHaveProperty("source_module");
  });

  it("aceita valores brasileiros e internacionais", () => {
    expect(parseManualTransactionAmount("1.234,56")).toBe(1234.56);
    expect(parseManualTransactionAmount("1234.56")).toBe(1234.56);
  });
});
