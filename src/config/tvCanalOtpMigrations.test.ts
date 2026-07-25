import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * OPERAÇÃO ESPECIAL — Auditoria e conclusão de TV Digital, Canal Eclésia e
 * Ecclesia Chat / Login por telefone.
 *
 * Testes de conteúdo (somente leitura) das 4 migrations novas desta
 * operação — nunca aplica, nunca conecta a um banco real. Prova, a partir
 * do próprio arquivo .sql:
 *   - espelho byte a byte staging/produção;
 *   - classificação correta no manifesto (sem alterar nenhuma entrada já
 *     existente);
 *   - ausência de USING(true)/WITH CHECK(true);
 *   - RLS habilitada em toda tabela nova;
 *   - SECURITY DEFINER sempre com SET search_path;
 *   - vínculo idempotente TV → Canal e nenhum "ao vivo" fabricado sem RPC.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relative: string) {
  return readFileSync(path.join(root, relative), "utf8");
}

const CHAT_HARDENING = "20260802090000_internal_chat_identity_hardening.sql";
const OTP_FOUNDATION = "20260802100000_member_login_otp_foundation.sql";
const OTP_ADMIN_TEST = "20260802110000_member_login_otp_admin_test.sql";
const TV_CANAL_FOUNDATION = "20260802120000_tv_canal_foundation.sql";
const TV_CANAL_LIVE = "20260802130000_tv_canal_live_production.sql";
const TV_STREAMING_OPERATIONS = "20260803000000_tv_streaming_operational_rpcs.sql";

const ALL_NAMES = [
  CHAT_HARDENING,
  OTP_FOUNDATION,
  OTP_ADMIN_TEST,
  TV_CANAL_FOUNDATION,
  TV_CANAL_LIVE,
  TV_STREAMING_OPERATIONS,
];

describe("OPERAÇÃO ESPECIAL — migrations novas (TV/Canal/Chat/OTP)", () => {
  it.each(ALL_NAMES)("mirrors %s byte-for-byte in the production directory", (name) => {
    const staging = read(`supabase/migrations/${name}`);
    const production = read(`supabase-production/supabase/migrations/${name}`);
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    expect(digest(production)).toBe(digest(staging));
  });

  it("classifies the chat identity hardening as production_management (hardens an existing production feature)", () => {
    const manifest = JSON.parse(read("supabase/migration-manifest.json")) as {
      production_management: string[];
    };
    expect(manifest.production_management).toContain(CHAT_HARDENING);
  });

  it("classifies the new OTP/TV/Canal modules as staging_feature (never promoted by this operation)", () => {
    const manifest = JSON.parse(read("supabase/migration-manifest.json")) as {
      staging_feature: string[];
    };
    for (const name of [
      OTP_FOUNDATION,
      OTP_ADMIN_TEST,
      TV_CANAL_FOUNDATION,
      TV_CANAL_LIVE,
      TV_STREAMING_OPERATIONS,
    ]) {
      expect(manifest.staging_feature).toContain(name);
    }
  });

  it("never touches any category already present for pre-existing migrations", () => {
    const manifest = JSON.parse(read("supabase/migration-manifest.json")) as Record<string, string[]>;
    // Migrations conhecidas de operações anteriores continuam nas mesmas
    // categorias — este teste falha se uma reclassificação silenciosa
    // acontecer nesta operação.
    expect(manifest.production_management).toContain("20260725090000_internal_chat_realtime_hardening.sql");
    expect(manifest.staging_feature).toContain("20260731140000_missions_history_and_reports.sql");
    expect(manifest.historical).toContain("20260709190000_finalize_member_invite_activation.sql");
  });

  it("nunca usa USING(true)/WITH CHECK(true) em nenhuma das 5 migrations", () => {
    for (const name of ALL_NAMES) {
      const sql = read(`supabase/migrations/${name}`);
      expect(sql, name).not.toMatch(/USING\s*\(\s*true\s*\)/i);
      expect(sql, name).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
    }
  });

  it("habilita RLS em toda CREATE TABLE nova das 5 migrations", () => {
    for (const name of ALL_NAMES) {
      const sql = read(`supabase/migrations/${name}`);
      const tableNames = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map((m) => m[1]);
      for (const table of tableNames) {
        expect(sql, `${name}: ${table} deve habilitar RLS`).toMatch(
          new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`),
        );
      }
    }
  });

  it("toda função SECURITY DEFINER usa SET search_path", () => {
    for (const name of ALL_NAMES) {
      const sql = read(`supabase/migrations/${name}`);
      // Remove comment lines primeiro — "SECURITY DEFINER" também aparece em
      // texto descritivo (ex.: "-- Nenhuma policy: ... RPC SECURITY DEFINER
      // abaixo"), que não é uma declaração de função e nunca precisa de
      // SET search_path.
      const codeOnly = sql
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
      const definerBlocks = codeOnly.split("SECURITY DEFINER").slice(1);
      for (const block of definerBlocks) {
        const nextChunk = block.slice(0, 200);
        expect(nextChunk, `${name}: bloco SECURITY DEFINER sem SET search_path próximo`).toMatch(/SET search_path/);
      }
    }
  });
});

describe("Login por telefone/WhatsApp (Parte D) — contrato de segurança", () => {
  const foundation = () => read(`supabase/migrations/${OTP_FOUNDATION}`);
  const adminTest = () => read(`supabase/migrations/${OTP_ADMIN_TEST}`);

  it("nunca armazena o código OTP em texto puro — apenas o hash sha256", () => {
    const sql = foundation();
    expect(sql).toContain("code_hash text NOT NULL");
    expect(sql).toContain("digest(btrim(p_code), 'sha256')");
    expect(sql).not.toMatch(/code\s+text NOT NULL/);
  });

  it("produção inicia sempre em transport_mode='disabled'", () => {
    const sql = foundation();
    expect(sql).toContain("transport_mode text NOT NULL DEFAULT 'disabled'");
    expect(sql).toContain("VALUES ('disabled')");
  });

  it("nunca chama um provider real de WhatsApp/SMS — 'provider' sempre falha fechado nesta operação", () => {
    const sql = foundation();
    expect(sql).toContain("otp_provider_not_configured");
    expect(sql).not.toMatch(/fetch\(|https?:\/\/api\./);
  });

  it("a verificação (_verify_member_login_otp_internal) e o vínculo (link_member_auth_user) são restritos a service_role", () => {
    const sql = foundation();
    expect(sql).toContain("REVOKE ALL ON FUNCTION public._verify_member_login_otp_internal(text, text) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public._verify_member_login_otp_internal(text, text) TO service_role;");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.link_member_auth_user(uuid, uuid) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.link_member_auth_user(uuid, uuid) TO service_role;");
  });

  it("ambiguidade de telefone falha explicitamente, nunca adivinha o membro dono do número", () => {
    const sql = foundation();
    expect(sql).toContain("ambiguous_phone");
    expect(sql).toContain("v_match_count > 1");
  });

  it("link_member_auth_user nunca sobrescreve um vínculo existente para outro usuário (nunca cria segunda pessoa)", () => {
    const sql = foundation();
    expect(sql).toContain("member_already_linked_to_another_user");
    expect(sql).toContain("auth_user_already_linked_to_another_member");
  });

  it("teste manual exige capability de governança e nunca concede por conveniência a outra responsabilidade", () => {
    const sql = adminTest();
    expect(sql).toContain("WHERE responsibility_type IN ('church_admin', 'responsible_pastor')");
    expect(sql).toContain("member_login.otp_test");
  });

  it("teste manual permite apenas um membro por vez (supera desafios anteriores + índice único parcial)", () => {
    const sql = adminTest();
    const foundationSql = foundation();
    expect(sql).toContain("consumed_result = 'superseded'");
    expect(foundationSql).toContain("uniq_member_otp_challenges_manual_test_active");
  });

  it("a auditoria de teste manual nunca grava o código nem seu hash", () => {
    const sql = adminTest();
    const auditTableMatch = sql.match(/CREATE TABLE IF NOT EXISTS public\.member_otp_admin_audit \(([\s\S]*?)\);/);
    expect(auditTableMatch).not.toBeNull();
    const columns = auditTableMatch![1];
    expect(columns).not.toMatch(/code/i);
  });

  it("a tela que revela OTP manual é importada e roteada somente em staging", () => {
    const app = read("src/App.tsx");
    const verifier = read("scripts/verify-production-bundle.mjs");
    expect(app).toContain(
      'const LoginOtpTeste = IS_STAGING_BUILD ? lazy(() => import("./pages/admin/LoginOtpTeste")) : null;',
    );
    expect(app).toContain("{IS_STAGING_BUILD && LoginOtpTeste ? (");
    expect(verifier).toContain('"pages/admin/LoginOtpTeste"');
  });
});

describe("TV ↔ Canal — vínculo idempotente (Parte A + B, contrato §8)", () => {
  const live = () => read(`supabase/migrations/${TV_CANAL_LIVE}`);

  it("usa advisory lock por (organization_id, slug) para nunca duplicar canais em concorrência", () => {
    const sql = live();
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text || ':' || NEW.slug, 0))");
  });

  it("ON CONFLICT garante que duplo clique/retry nunca cria dois canais equivalentes", () => {
    const sql = live();
    expect(sql).toContain("ON CONFLICT (organization_id, slug) DO UPDATE SET source_tv_channel_id = EXCLUDED.source_tv_channel_id");
  });

  it("nunca vincula um canal de TV a um Canal Eclésia de outra organização", () => {
    const sql = live();
    expect(sql).toContain("canal_link_cross_organization");
  });

  it("import_tv_session_to_canal é idempotente por (tv_live_session_id, channel_id) — nunca duplica o vídeo", () => {
    const sql = live();
    expect(sql).toContain("WHERE tv_live_session_id = p_session_id AND channel_id = p_channel_id");
    expect(sql).toContain("already_existed");
  });

  it("nunca marca uma transmissão como importável sem gravação real disponível", () => {
    const sql = live();
    expect(sql).toContain("recording_not_available");
    expect(sql).toContain("v_session.r2_storage_key IS NULL AND v_session.hls_url IS NULL");
  });

  it("o trigger de vínculo só roda em INSERT — desativar/arquivar a TV nunca apaga o Canal", () => {
    const sql = live();
    expect(sql).toContain("AFTER INSERT ON public.tv_channels");
  });
});

describe("TV/Canal — estados explícitos, nenhum 'ao vivo' fabricado", () => {
  it("toda transição de câmera/direção passa por uma RPC SECURITY DEFINER, nunca só um setState do frontend", () => {
    const sql = read(`supabase/migrations/${TV_CANAL_LIVE}`);
    for (const rpc of [
      "create_live_production",
      "claim_production_director",
      "join_production_as_camera",
      "end_live_production",
      "set_camera_on_air",
    ]) {
      expect(sql, `RPC ${rpc} deve existir e ser SECURITY DEFINER`).toMatch(
        new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\([\\s\\S]{0,400}?SECURITY DEFINER`),
      );
    }
  });

  it("status_transmissao usa uma máquina de estados explícita (não texto livre)", () => {
    const sql = read(`supabase/migrations/${TV_CANAL_FOUNDATION}`);
    expect(sql).toMatch(/status_transmissao text[\s\S]{0,80}CHECK\s*\(status_transmissao IN/);
  });
});

describe("TV streaming — vínculo operacional MediaMTX ↔ sessão real", () => {
  const operations = () => read(`supabase/migrations/${TV_STREAMING_OPERATIONS}`);
  const validator = () => read("supabase/functions/validate-tv-stream-key/index.ts");
  const heartbeat = () => read("supabase/functions/update-tv-heartbeat/index.ts");
  const livekitToken = () => read("supabase/functions/create-livekit-token/index.ts");

  it("ativa exatamente o liveSessionId do caminho RTMP e nunca cria uma sessão aleatória", () => {
    const sql = operations();
    expect(sql).toContain("p_session_id uuid");
    expect(sql).toContain("WHERE id = p_session_id");
    expect(sql).toContain("'session_not_found_or_mismatch'");
    expect(sql).not.toMatch(/INSERT INTO public\.tv_live_sessions/);
    expect(sql).toContain("uniq_tv_live_sessions_active_channel");
  });

  it("a Edge Function exige caminho live/<uuid> exato e envia o UUID à RPC", () => {
    const code = validator();
    expect(code).toContain("const pathMatch = /^live\\/");
    expect(code).toContain("p_session_id: liveSessionId");
    expect(code).not.toContain('path.replace(/^live\\//, "")');
  });

  it("o encerramento do publisher é suportado pelo mesmo endpoint autenticado de heartbeat", () => {
    const code = heartbeat();
    expect(code).toContain('body?.action === "end"');
    expect(code).toContain('"stop_tv_stream_by_session"');
    expect(code).toContain('"update_live_session_heartbeat"');
  });

  it("token de diretor exige vínculo com a produção ou capability operacional", () => {
    const code = livekitToken();
    expect(code).toContain("_permission_key: \"tv.manage\"");
    expect(code).toContain("_permission_key: \"tv.live_operate\"");
    expect(code).toContain("liveSession.director_user_id !== callerId");
    expect(code).toContain("Sem permissão para dirigir esta produção");
  });

  it("grants do LiveKit respeitam privilégio mínimo entre direção e câmera", () => {
    const code = livekitToken();
    expect(code).toContain("canPublish: !isDirector");
    expect(code).toContain("canSubscribe: isDirector");
  });

  it("mock do estúdio só pode ser ativado explicitamente no Vite local", () => {
    const hook = read("src/hooks/useLiveKitStudio.ts");
    expect(hook).toContain("const IS_MOCK = import.meta.env.DEV");
    expect(hook).toContain('import.meta.env.VITE_TV_STUDIO_MOCK_ENABLED === "true"');
    expect(hook).not.toContain("const IS_MOCK       = !LIVEKIT_URL");
  });
});
