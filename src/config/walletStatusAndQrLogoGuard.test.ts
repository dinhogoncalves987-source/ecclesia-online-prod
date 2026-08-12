import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MEMBER_STATUSES } from "@/lib/secretariaConstants";

/**
 * FASE 1C-G2 — guarda de regressão para o status da Carteira de Membro, a
 * validação do Modo Porteiro e o logo Ω dourado no QR Code.
 *
 * Contexto do bug original: ANDRIELE DOS SANTOS BRAZ (matrícula 019904)
 * possuía status real "Em disciplina" na tela Membros, mas a Carteira
 * exibia o selo verde "Ativo" porque `STATUS_BADGE` (em
 * `MemberWalletCard.tsx`) não conhecia a chave "Em disciplina" e caía no
 * fallback `?? STATUS_BADGE.Ativo`. O Modo Porteiro, por sua vez, sempre
 * pintava o selo de status em verde (`bg-emerald-200`), independentemente
 * do status real retornado pela RPC `validate_member_validation_token`.
 *
 * Assim como `membersServerSidePaginationGuard.test.ts`, este teste faz uma
 * verificação estática do código-fonte (sem renderizar componentes) para
 * impedir que os fallbacks perigosos ou a configuração do QR sejam
 * reintroduzidos por engano.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const WALLET_SOURCE = readFileSync(
  path.join(ROOT, "src", "components", "MemberWalletCard.tsx"),
  "utf8",
);
const PORTEIRO_SOURCE = readFileSync(path.join(ROOT, "src", "pages", "ModoPorteiro.tsx"), "utf8");

describe("guarda de regressão — status da Carteira de Membro (MemberWalletCard.tsx)", () => {
  it("não reintroduz o fallback perigoso que faz qualquer status desconhecido cair em Ativo", () => {
    expect(WALLET_SOURCE).not.toMatch(/\?\?\s*STATUS_BADGE\.Ativo/);
    expect(WALLET_SOURCE).not.toMatch(/\?\?\s*STATUS_PROFILES\.Ativo/);
    expect(WALLET_SOURCE).not.toMatch(/\?\?\s*STATUS_PROFILES\[["']Ativo["']\]/);
  });

  it("todos os 8 status canônicos de MEMBER_STATUSES aparecem explicitamente em STATUS_PROFILES", () => {
    for (const status of MEMBER_STATUSES) {
      // Cada status canônico deve aparecer como chave literal do dicionário
      // (com ou sem aspas, pois "Em disciplina" precisa de aspas por ter espaço).
      const escaped = status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|\\s)(${escaped}|"${escaped}"):\\s*\\{`, "m");
      expect(WALLET_SOURCE, `status ausente em STATUS_PROFILES: ${status}`).toMatch(pattern);
    }
  });

  it('mantém "Disciplinado" apenas como alias legado, nunca como status com apresentação própria de Ativo', () => {
    expect(WALLET_SOURCE).toMatch(/Disciplinado:\s*\{/);
    expect(WALLET_SOURCE).toMatch(/alias legado/i);
  });

  it("o rodapé institucional é sempre condicionado ao status (nunca mais um texto fixo único)", () => {
    expect(WALLET_SOURCE).not.toMatch(
      /<p[^>]*>\s*Documento institucional · Válido mediante verificação de cadastro ativo\s*<\/p>/,
    );
    expect(WALLET_SOURCE).toContain("{statusProfile.footer}");
  });

  it("os três QRCodeSVG da carteira preservam level=\"H\" e usam imageSettings com o logo oficial", () => {
    const levelHCount = (WALLET_SOURCE.match(/level="H"/g) || []).length;
    expect(levelHCount).toBe(3);

    const imageSettingsCount = (WALLET_SOURCE.match(/imageSettings=\{qrLogoImageSettings\(/g) || []).length;
    expect(imageSettingsCount).toBe(3);

    expect(WALLET_SOURCE).toContain('QR_LOGO_SRC = "/icons/ecclesia-omega-qr.png"');
    expect(WALLET_SOURCE).toContain("excavate: true");
  });

  it("o logo do QR nunca excede 15% da largura/altura (QR_LOGO_MAX_RATIO = 0.15)", () => {
    expect(WALLET_SOURCE).toMatch(/QR_LOGO_MAX_RATIO\s*=\s*0\.15\b/);
  });

  it("a geração, o TTL de 5 minutos e o consumo único do token de QR permanecem inalterados", () => {
    expect(WALLET_SOURCE).toContain('supabase.rpc("generate_member_validation_token"');
    expect(WALLET_SOURCE).toContain("setQrTimeLeft(300)");
  });
});

describe("guarda de regressão — selo de status no Modo Porteiro (ModoPorteiro.tsx)", () => {
  it("não usa mais um selo de status fixo verde independente do status retornado pela RPC", () => {
    // STATUS_LABEL era o dicionário antigo cujo texto estava sempre dentro
    // de um <span> com classe fixa "bg-emerald-200" (verde), qualquer que
    // fosse o status real. Não pode mais existir essa referência.
    expect(PORTEIRO_SOURCE).not.toContain("STATUS_LABEL[result.status]");
    expect(PORTEIRO_SOURCE).not.toMatch(/STATUS_LABEL\s*:\s*Record/);
    expect(PORTEIRO_SOURCE).toContain("getStatusPill(result.status)");
  });

  it("todos os 8 status canônicos de MEMBER_STATUSES possuem entrada em STATUS_PILL", () => {
    for (const status of MEMBER_STATUSES) {
      const escaped = status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|\\s)(${escaped}|"${escaped}"):\\s*\\{`, "m");
      expect(PORTEIRO_SOURCE, `status ausente em STATUS_PILL: ${status}`).toMatch(pattern);
    }
  });

  it('mantém "Disciplinado" apenas como alias legado de "Em disciplina", nunca em verde', () => {
    expect(PORTEIRO_SOURCE).toMatch(/Disciplinado:\s*\{/);
    expect(PORTEIRO_SOURCE).toMatch(/alias legado/i);
  });

  it("o fallback de status desconhecido nunca usa a cor verde/esmeralda do Ativo", () => {
    const fallbackMatch = PORTEIRO_SOURCE.match(
      /function getStatusPill[\s\S]*?\n\}/,
    );
    expect(fallbackMatch, "função getStatusPill não encontrada").not.toBeNull();
    expect(fallbackMatch?.[0]).not.toMatch(/emerald/);
  });

  it("a validação continua consultando a RPC validate_member_validation_token e rejeitando URLs legadas /validar-membro/", () => {
    expect(PORTEIRO_SOURCE).toContain('"validate_member_validation_token"');
    expect(PORTEIRO_SOURCE).toContain("/validar-membro/");
  });
});
