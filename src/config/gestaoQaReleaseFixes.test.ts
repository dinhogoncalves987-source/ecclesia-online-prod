import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationName = "20260803140000_gestao_release_qa_fixes.sql";

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("fechamento da homologação da Gestão", () => {
  it("mantém a migration idêntica nos dois ambientes e apta à produção", () => {
    const staging = read(`supabase/migrations/${migrationName}`);
    const production = read(
      `supabase-production/supabase/migrations/${migrationName}`,
    );
    const digest = (value: string) =>
      createHash("sha256").update(value).digest("hex");
    const manifest = JSON.parse(
      read("supabase/migration-manifest.json"),
    ) as Record<string, string[]>;

    expect(digest(production)).toBe(digest(staging));
    expect(manifest.production_management).toContain(migrationName);
    expect(manifest.staging_only ?? []).not.toContain(migrationName);
  });

  it("exclui somente rascunhos de certificado com autenticação e capability", () => {
    const sql = read(`supabase/migrations/${migrationName}`);

    expect(sql).toContain("delete_draft_institutional_certificate");
    expect(sql).toContain("IF v_row.status <> 'rascunho'");
    expect(sql).toContain("has_org_access_permission");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.delete_draft_institutional_certificate");
    expect(sql).toContain("FROM PUBLIC, anon");
    expect(sql).toContain("TO authenticated");
  });

  it("fecha a importação financeira contra autoria forjada e IDs de outra igreja", () => {
    const sql = read(`supabase/migrations/${migrationName}`);

    expect(sql).toContain("jsonb_array_length(p_rows) > 1000");
    expect(sql).toContain("is_org_finance_writer(auth.uid(), v_org)");
    expect(sql).toContain("v_org, auth.uid(), auth.uid()");
    expect(sql).toContain("is_organization_descendant_or_self(v_org, v_congregation_id)");
    expect(sql).toContain("is_organization_descendant_or_self(v_org, v_district_id)");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.import_finance_transactions_bulk(jsonb)");
    expect(sql).not.toContain("'row', v_row");
  });

  it("protege o template AD e instala a estrutura para matrizes já existentes", () => {
    const sql = read(`supabase/migrations/${migrationName}`);

    expect(sql).toContain("REVOKE ALL ON FUNCTION public.seed_assembleia_de_deus_finance_template(uuid)");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("organization_type IN ('matriz', 'sede')");
    expect(sql).toContain("PERFORM public.seed_assembleia_de_deus_finance_template(v_org.id)");
  });

  it("mantém correções de interface encontradas pelo QA", () => {
    const memberWallet = read("src/components/MemberWalletCard.tsx");
    const certificates = read("src/pages/Certificados.tsx");
    const congregations = read("src/pages/Congregacoes.tsx");
    const prayers = read("src/pages/Oracoes.tsx");
    const requests = read("src/pages/SolicitacoesAdministrativas.tsx");
    const finance = read("src/components/financeiro/TransactionList.tsx");

    expect(memberWallet).toContain('aria-label="QR Code seguro ampliado"');
    expect(memberWallet).toContain("size={288}");
    expect(memberWallet).toContain('level="H"');
    expect(certificates).toContain("Excluir rascunho");
    expect(certificates).toContain("Confirmar revogação");
    expect(certificates).not.toContain("window.prompt");
    expect(congregations).toContain('update({ active: false, unit_status: "Arquivada" })');
    expect(prayers).toContain("Remover este pedido de oração?");
    expect(requests).toContain("Rejeitar esta solicitação?");
    expect(finance).toContain("Remover este lançamento financeiro?");
    // Renomeado para "Mais detalhes contábeis" na FASE 1D-C1 (mesma seção
    // expansível do formulário manual, wording alinhado ao pedido do usuário).
    expect(finance).toContain("Mais detalhes contábeis");
  });

  it("protege a importação com IA com sessão real, sem usar a chave pública como usuário", () => {
    const modal = read("src/components/AIImportModal.tsx");
    const edgeFunction = read("supabase/functions/ai-import/index.ts");
    const config = read("supabase/config.toml").replace(/\r\n/g, "\n");

    expect(modal).toContain("supabase.auth.getSession()");
    expect(modal).toContain("Authorization: `Bearer ${accessToken}`");
    expect(modal).not.toContain("Authorization: `Bearer ${environment.supabasePublishableKey}`");
    expect(edgeFunction).toContain("authClient.auth.getUser(jwt)");
    expect(edgeFunction).toContain("Autenticação obrigatória.");
    expect(config).toContain("[functions.ai-import]\nverify_jwt = false");
  });
});
