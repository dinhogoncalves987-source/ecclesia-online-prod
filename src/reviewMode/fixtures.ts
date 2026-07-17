/**
 * src/reviewMode/fixtures.ts
 *
 * Dados 100% fictícios do "Modo Avaliação". Nenhum destes valores existe em
 * produção/staging — nomes, telefones, e-mails, valores financeiros e textos
 * são inventados exclusivamente para navegação de demonstração.
 *
 * O "banco" é um objeto simples em memória (recriado a cada carregamento da
 * página) — mutações feitas durante a sessão (criar/editar/excluir) alteram
 * apenas estas cópias em memória e são perdidas ao recarregar a página.
 * Nada aqui nunca é enviado para qualquer servidor.
 */

import type { AdminRole } from "@/lib/permissions";

export const REVIEW_USER_ID = "00000000-review-0000-0000-000000000001";
export const REVIEW_ORG_ID = "00000000-review-0000-0000-00000000ma01";
export const REVIEW_SETOR_ID = "00000000-review-0000-0000-00000000se01";
export const REVIEW_CONGREGACAO_1_ID = "00000000-review-0000-0000-00000000cg01";
export const REVIEW_CONGREGACAO_2_ID = "00000000-review-0000-0000-00000000cg02";
export const REVIEW_CONGREGACAO_3_ID = "00000000-review-0000-0000-00000000cg03";

const now = () => new Date().toISOString();
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

// ── Organizações ─────────────────────────────────────────────────────────────

export interface ReviewOrganizationRow {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  organization_type: string;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  active: boolean;
  unit_status: string | null;
  denomination_type: string | null;
  hierarchy_model: string | null;
  top_level_label: string | null;
  top_level_label_plural: string | null;
  municipal_level_label: string | null;
  municipal_level_label_plural: string | null;
  intermediate_level_label: string | null;
  intermediate_level_label_plural: string | null;
  local_unit_label: string | null;
  local_unit_label_plural: string | null;
  uses_convention_level: boolean | null;
  uses_municipal_level: boolean | null;
  uses_intermediate_level: boolean | null;
  uses_local_units: boolean | null;
  has_operational_cashbox: boolean | null;
  is_financially_autonomous: boolean | null;
  financially_consolidates_to_id: string | null;
  cnpj: string | null;
  financial_policy_notes: string | null;
  short_name: string | null;
  acronym: string | null;
  pastor_president_name: string | null;
  created_at: string;
}

const baseOrgDefaults = {
  denomination_type: "evangelica",
  hierarchy_model: "ad_brasil_national",
  top_level_label: null,
  top_level_label_plural: null,
  municipal_level_label: "Matriz Municipal",
  municipal_level_label_plural: "Matrizes Municipais",
  intermediate_level_label: "Setor",
  intermediate_level_label_plural: "Setores",
  local_unit_label: "Congregação",
  local_unit_label_plural: "Congregações",
  uses_convention_level: false,
  uses_municipal_level: true,
  uses_intermediate_level: true,
  uses_local_units: true,
  has_operational_cashbox: true,
  is_financially_autonomous: true,
  financially_consolidates_to_id: null,
  cnpj: "00.000.000/0001-00",
  financial_policy_notes: null,
  short_name: null,
  acronym: null,
  pastor_president_name: "Pr. José Administrador (fictício)",
};

export function createOrganizationFixtures(): ReviewOrganizationRow[] {
  return [
    {
      id: REVIEW_ORG_ID,
      parent_id: null,
      name: "Matriz Municipal de Caxias do Sul (Avaliação)",
      slug: "matriz-municipal-caxias-do-sul-avaliacao",
      organization_type: "matriz",
      city: "Caxias do Sul",
      state: "RS",
      email: "contato@matriz-avaliacao.exemplo",
      phone: "(54) 0000-0000",
      logo_url: null,
      active: true,
      unit_status: "active",
      created_at: daysFromNow(-900),
      ...baseOrgDefaults,
    },
    {
      id: REVIEW_SETOR_ID,
      parent_id: REVIEW_ORG_ID,
      name: "Setor Centro (Avaliação)",
      slug: "setor-centro-avaliacao",
      organization_type: "setor",
      city: "Caxias do Sul",
      state: "RS",
      email: null,
      phone: null,
      logo_url: null,
      active: true,
      unit_status: "active",
      created_at: daysFromNow(-700),
      ...baseOrgDefaults,
    },
    {
      id: REVIEW_CONGREGACAO_1_ID,
      parent_id: REVIEW_SETOR_ID,
      name: "Congregação Jardim das Flores (Avaliação)",
      slug: "congregacao-jardim-das-flores-avaliacao",
      organization_type: "congregacao",
      city: "Caxias do Sul",
      state: "RS",
      email: null,
      phone: "(54) 0000-1111",
      logo_url: null,
      active: true,
      unit_status: "active",
      created_at: daysFromNow(-500),
      ...baseOrgDefaults,
    },
    {
      id: REVIEW_CONGREGACAO_2_ID,
      parent_id: REVIEW_SETOR_ID,
      name: "Congregação Vila Nova (Avaliação)",
      slug: "congregacao-vila-nova-avaliacao",
      organization_type: "congregacao",
      city: "Caxias do Sul",
      state: "RS",
      email: null,
      phone: "(54) 0000-2222",
      logo_url: null,
      active: true,
      unit_status: "active",
      created_at: daysFromNow(-300),
      ...baseOrgDefaults,
    },
    {
      id: REVIEW_CONGREGACAO_3_ID,
      parent_id: REVIEW_ORG_ID,
      name: "Congregação São José (Avaliação)",
      slug: "congregacao-sao-jose-avaliacao",
      organization_type: "congregacao",
      city: "Caxias do Sul",
      state: "RS",
      email: null,
      phone: "(54) 0000-3333",
      logo_url: null,
      active: true,
      unit_status: "active",
      created_at: daysFromNow(-120),
      ...baseOrgDefaults,
    },
  ];
}

// ── Perfis / papéis / vínculos ──────────────────────────────────────────────

export function createProfileFixture() {
  return {
    id: uid("profile"),
    user_id: REVIEW_USER_ID,
    full_name: "Administrador Municipal (Avaliação)",
    avatar_url: null,
    platform_role: null as string | null,
    created_at: daysFromNow(-900),
  };
}

export function createOrganizationUserFixtures() {
  return [
    {
      id: uid("org-user"),
      organization_id: REVIEW_ORG_ID,
      user_id: REVIEW_USER_ID,
      role: "church_admin" as AdminRole,
      is_active: true,
      created_at: daysFromNow(-900),
    },
  ];
}

// ── Membros ──────────────────────────────────────────────────────────────────

const MEMBER_NAMES: Array<{ name: string; status: string; org: string; memberRole: string; adminRole: string }> = [
  { name: "Ana Paula Ferreira (fictícia)", status: "Ativo", org: REVIEW_ORG_ID, memberRole: "Pastor", adminRole: "Pastor Presidente" },
  { name: "Carlos Eduardo Souza (fictício)", status: "Ativo", org: REVIEW_ORG_ID, memberRole: "Diácono", adminRole: "Secretário" },
  { name: "Beatriz Lima Santos (fictícia)", status: "Ativo", org: REVIEW_CONGREGACAO_1_ID, memberRole: "Membro", adminRole: "Líder de Pequeno Grupo" },
  { name: "Daniel Rodrigues Alves (fictício)", status: "Ativo", org: REVIEW_CONGREGACAO_1_ID, memberRole: "Membro", adminRole: "Nenhum" },
  { name: "Eduarda Martins Costa (fictícia)", status: "Visitante", org: REVIEW_CONGREGACAO_2_ID, memberRole: "Membro", adminRole: "Nenhum" },
  { name: "Fábio Henrique Pereira (fictício)", status: "Ativo", org: REVIEW_CONGREGACAO_2_ID, memberRole: "Membro", adminRole: "Líder de Pequeno Grupo" },
  { name: "Gabriela Nunes Oliveira (fictícia)", status: "Ativo", org: REVIEW_CONGREGACAO_3_ID, memberRole: "Diaconisa", adminRole: "Nenhum" },
  { name: "Heitor Almeida Barbosa (fictício)", status: "Inativo", org: REVIEW_CONGREGACAO_3_ID, memberRole: "Membro", adminRole: "Nenhum" },
  { name: "Isabela Cardoso Ribeiro (fictícia)", status: "Ativo", org: REVIEW_ORG_ID, memberRole: "Presbítero", adminRole: "Tesoureiro" },
  { name: "João Vitor Gomes Teixeira (fictício)", status: "Congregado", org: REVIEW_SETOR_ID, memberRole: "Membro", adminRole: "Nenhum" },
];

export function createMemberFixtures() {
  return MEMBER_NAMES.map((m, idx) => ({
    id: uid("member"),
    organization_id: m.org,
    full_name: m.name,
    email: `${m.name.split(" ")[0].toLowerCase()}${idx}@avaliacao.exemplo`,
    phone: `(54) 9${String(90000000 + idx * 1111).padStart(8, "0")}`,
    whatsapp: `(54) 9${String(90000000 + idx * 1111).padStart(8, "0")}`,
    status: m.status,
    member_role: m.memberRole,
    administrative_role: m.adminRole,
    photo_url: null,
    birth_date: "1990-01-01",
    gender: idx % 2 === 0 ? "Feminino" : "Masculino",
    marital_status: "Casado(a)",
    cpf: `000.000.00${idx}-00`,
    rg: null,
    rg_issuer: null,
    rg_issue_date: null,
    joined_at: daysFromNow(-(400 - idx * 10)).slice(0, 10),
    address: "Rua da Avaliação, 100 (fictício)",
    zip_code: "95000-000",
    street: "Rua da Avaliação",
    address_number: "100",
    address_complement: null,
    neighborhood: "Centro (fictício)",
    city: "Caxias do Sul",
    state: "RS",
    baptized_at: null,
    conversion_date: null,
    congregation_id: null,
    sector_id: null,
    father_name: null,
    mother_name: null,
    spouse_name: null,
    notes: null,
    civil_document_type: null,
    civil_document_status: "Pendente",
    civil_document_url: null,
    civil_document_uploaded_at: null,
    civil_document_notes: null,
    holy_spirit_baptism_date: null,
    consecration_date: null,
    user_id: idx === 0 ? REVIEW_USER_ID : null,
    created_at: daysFromNow(-(400 - idx * 10)),
    created_by: REVIEW_USER_ID,
    civil_document_validated_by: null,
  }));
}

// ── Central de documentos ───────────────────────────────────────────────────

export function createDocumentFixtures() {
  const kinds = ["Ata de Assembleia", "Estatuto", "Certidão de Batismo", "Ofício Administrativo"];
  return kinds.map((title, idx) => ({
    id: uid("document"),
    organization_id: REVIEW_ORG_ID,
    title: `${title} (fictício)`,
    description: "Documento de demonstração do Modo Avaliação — sem valor legal.",
    file_url: null,
    file_type: "application/pdf",
    category: idx % 2 === 0 ? "institucional" : "administrativo",
    created_at: daysFromNow(-(200 - idx * 20)),
    created_by: REVIEW_USER_ID,
  }));
}

// ── Agenda ───────────────────────────────────────────────────────────────────

export function createEventFixtures() {
  return [
    { title: "Culto de Celebração (fictício)", offsetDays: 2, location: "Templo Sede (fictício)" },
    { title: "Reunião de Diretoria (fictícia)", offsetDays: 5, location: "Sala de Reuniões (fictícia)" },
    { title: "Encontro de Jovens (fictício)", offsetDays: 9, location: "Salão Social (fictício)" },
    { title: "Assembleia Geral Ordinária (fictícia)", offsetDays: 20, location: "Templo Sede (fictício)" },
  ].map((e, idx) => ({
    id: uid("event"),
    organization_id: REVIEW_ORG_ID,
    title: e.title,
    description: "Evento de demonstração do Modo Avaliação.",
    location: e.location,
    event_type: "Culto",
    is_public: true,
    starts_at: daysFromNow(e.offsetDays),
    ends_at: daysFromNow(e.offsetDays + 0.1),
    all_day: false,
    created_at: daysFromNow(-30 + idx),
    created_by: REVIEW_USER_ID,
  }));
}

// ── Escalas ──────────────────────────────────────────────────────────────────

export function createScheduleFixtures(memberIds: string[]) {
  const schedules = [
    { title: "Escala de Louvor — Culto de Domingo (fictícia)", ministry: "Louvor", offsetDays: 4, status: "publicada" as const },
    { title: "Escala de Recepção — Culto de Quarta (fictícia)", ministry: "Recepção", offsetDays: 6, status: "rascunho" as const },
  ].map((s, idx) => ({
    id: uid("schedule"),
    organization_id: REVIEW_ORG_ID,
    title: s.title,
    description: "Escala de demonstração do Modo Avaliação.",
    schedule_date: daysFromNow(s.offsetDays).slice(0, 10),
    schedule_time: "19:00",
    ministry: s.ministry,
    status: s.status,
    created_at: daysFromNow(-10 + idx),
    created_by: REVIEW_USER_ID,
  }));

  const assignments = schedules.flatMap((schedule, sIdx) =>
    memberIds.slice(0, 3).map((memberId, mIdx) => ({
      id: uid("schedule-assignment"),
      schedule_id: schedule.id,
      member_id: memberId,
      role: mIdx === 0 ? "Responsável (fictício)" : "Apoio (fictício)",
      status: mIdx === 0 && sIdx === 0 ? "confirmado" : "pendente",
      notes: null,
    })),
  );

  return { schedules, assignments };
}

// ── Pequenos grupos ──────────────────────────────────────────────────────────

export function createGroupFixtures() {
  return [
    { name: "Célula Jardim das Flores (fictícia)", group_type: "Geral", leaderMemberIdx: 2 },
    { name: "Célula Vila Nova (fictícia)", group_type: "Jovens", leaderMemberIdx: 5 },
  ].map((g, idx) => ({
    id: uid("group"),
    organization_id: REVIEW_ORG_ID,
    name: g.name,
    group_type: g.group_type,
    description: "Pequeno grupo de demonstração do Modo Avaliação.",
    leader_member_id: null as string | null,
    meeting_day: idx === 0 ? "Terça-feira" : "Quinta-feira",
    meeting_time: "19:30",
    location: "Endereço fictício de reunião",
    is_active: true,
    created_at: daysFromNow(-150 + idx * 5),
    created_by: REVIEW_USER_ID,
  }));
}

export function createGroupMessageFixtures(groupIds: string[]) {
  if (groupIds.length === 0) return [];
  return [
    { text: "Bem-vindos à célula desta semana! (mensagem fictícia)", offsetHours: -48 },
    { text: "Não esqueçam do lanche compartilhado. (mensagem fictícia)", offsetHours: -20 },
  ].map((m) => ({
    id: uid("group-message"),
    group_id: groupIds[0],
    author_user_id: REVIEW_USER_ID,
    body: m.text,
    created_at: new Date(Date.now() + m.offsetHours * 3_600_000).toISOString(),
  }));
}

export function createGroupMemberFixtures(
  groups: Array<{ id: string }>,
  memberIds: string[],
) {
  if (groups.length === 0 || memberIds.length === 0) return [];
  return groups.flatMap((group, gIdx) =>
    memberIds.slice(gIdx, gIdx + 2).map((memberId, mIdx) => ({
      id: uid("group-member"),
      group_id: group.id,
      member_id: memberId,
      role: mIdx === 0 ? "leader" : "member",
    })),
  );
}

// ── Assembleia geral ─────────────────────────────────────────────────────────

export function createAssemblyFixtures() {
  return [
    {
      id: uid("assembly"),
      organization_id: REVIEW_ORG_ID,
      created_by: REVIEW_USER_ID,
      title: "Assembleia Geral Ordinária 2026 (fictícia)",
      description:
        "CONVOCAÇÃO:\nConvocamos todos os membros para a Assembleia Geral Ordinária (demonstração).\n\nPAUTA:\n1. Prestação de contas.\n2. Eleição de diretoria.\n\nDECISÕES REGISTRADAS:\nEm aberto — assembleia ainda não realizada (dados fictícios).",
      period: "2026",
      assembly_date: daysFromNow(25).slice(0, 10),
      youtube_url: null,
      is_visible: true,
      created_at: daysFromNow(-15),
    },
    {
      id: uid("assembly"),
      organization_id: REVIEW_ORG_ID,
      created_by: REVIEW_USER_ID,
      title: "Assembleia Extraordinária — Reforma do Templo (fictícia)",
      description:
        "CONVOCAÇÃO:\nAssembleia extraordinária para aprovação de orçamento de reforma (demonstração).\n\nPAUTA:\n1. Aprovação do orçamento de reforma.\n\nDECISÕES REGISTRADAS:\nOrçamento aprovado por unanimidade (dados fictícios).",
      period: "2025",
      assembly_date: daysFromNow(-40).slice(0, 10),
      youtube_url: null,
      is_visible: true,
      created_at: daysFromNow(-60),
    },
  ];
}

// ── Campanhas ────────────────────────────────────────────────────────────────

export function createCampaignFixtures() {
  return [
    {
      id: uid("campaign"),
      organization_id: REVIEW_ORG_ID,
      title: "Reforma do Templo Sede (fictícia)",
      description: "Campanha de demonstração — arrecadação para reforma do templo.",
      type: "reforma",
      status: "active",
      goal_amount: 50000,
      raised_amount: 18500,
      start_date: daysFromNow(-60).slice(0, 10),
      end_date: daysFromNow(60).slice(0, 10),
      priority: "high",
      is_featured: true,
      allow_replies: true,
      cover_image_url: null,
      created_by: REVIEW_USER_ID,
      created_at: daysFromNow(-60),
    },
    {
      id: uid("campaign"),
      organization_id: REVIEW_ORG_ID,
      title: "Cestas Básicas de Inverno (fictícia)",
      description: "Campanha de demonstração — arrecadação de cestas básicas.",
      type: "acao_social",
      status: "closed",
      goal_amount: 8000,
      raised_amount: 8000,
      start_date: daysFromNow(-120).slice(0, 10),
      end_date: daysFromNow(-30).slice(0, 10),
      priority: "normal",
      is_featured: false,
      allow_replies: false,
      cover_image_url: null,
      created_by: REVIEW_USER_ID,
      created_at: daysFromNow(-120),
    },
  ];
}

// ── Financeiro ───────────────────────────────────────────────────────────────

export function createTransactionFixtures() {
  const rows: Array<Record<string, unknown>> = [];
  const categories = ["Dízimos", "Ofertas", "Contas de Consumo", "Manutenção", "Eventos"];
  for (let i = 0; i < 12; i += 1) {
    const isIncome = i % 3 !== 0;
    rows.push({
      id: uid("transaction"),
      organization_id: REVIEW_ORG_ID,
      date: daysFromNow(-i * 6).slice(0, 10),
      description: `${isIncome ? "Receita" : "Despesa"} de demonstração ${i + 1} (fictícia)`,
      type: isIncome ? "Entrada" : "Saída",
      amount: isIncome ? 500 + i * 137 : 200 + i * 73,
      status: "Confirmado",
      category: categories[i % categories.length],
      user_id: REVIEW_USER_ID,
      responsible_id: REVIEW_USER_ID,
      payment_method: "Pix",
      receipt_url: null,
      notes: null,
      created_by: REVIEW_USER_ID,
      updated_by: null,
      created_at: daysFromNow(-i * 6),
      updated_at: daysFromNow(-i * 6),
    });
  }
  return rows;
}

// ── Comunicação ──────────────────────────────────────────────────────────────

export function createCommunicationFixtures() {
  return [
    { title: "Aviso: Culto especial de aniversário (fictício)", type: "Importante" },
    { title: "Aviso: Manutenção do estacionamento (fictício)", type: "Normal" },
  ].map((c, idx) => ({
    id: uid("communication"),
    organization_id: REVIEW_ORG_ID,
    title: c.title,
    content: "Comunicado de demonstração do Modo Avaliação.",
    communication_type: c.type,
    is_public: idx === 0,
    published_at: daysFromNow(-5 + idx),
    created_at: daysFromNow(-5 + idx),
    created_by: REVIEW_USER_ID,
  }));
}

// ── Pedidos de oração ────────────────────────────────────────────────────────

export function createPrayerRequestFixtures() {
  return [
    { title: "Saúde de um familiar (fictício)", text: "Oração pela saúde de um familiar (pedido fictício).", is_private: false, status: "Respondido" },
    { title: "Direção profissional (fictício)", text: "Oração por direção profissional (pedido fictício).", is_private: false, status: "Ativo" },
    { title: "Pedido confidencial (fictício)", text: "Pedido confidencial de demonstração (fictício).", is_private: true, status: "Ativo" },
  ].map((p, idx) => ({
    id: uid("prayer"),
    organization_id: REVIEW_ORG_ID,
    title: p.title,
    description: p.text,
    is_private: p.is_private,
    status: p.status,
    user_id: REVIEW_USER_ID,
    created_at: daysFromNow(-10 + idx * 2),
  }));
}

// ── Solicitações administrativas ────────────────────────────────────────────

export function createAdministrativeRequestFixtures() {
  return [
    { request_type: "declaracao_membro", status: "aberta" },
    { request_type: "solicitacao_geral", status: "em_analise" },
    { request_type: "atualizacao_cadastral", status: "concluida" },
  ].map((r, idx) => ({
    id: uid("admin-request"),
    organization_id: REVIEW_ORG_ID,
    member_id: null,
    requester_name: "Ana Paula Ferreira (fictícia)",
    request_type: r.request_type,
    description: "Solicitação de demonstração do Modo Avaliação.",
    status: r.status,
    internal_notes: null,
    completed_at: r.status === "concluida" ? daysFromNow(-1) : null,
    created_at: daysFromNow(-8 + idx),
    updated_at: daysFromNow(-8 + idx),
    created_by: REVIEW_USER_ID,
  }));
}

// ── Cartas de recomendação ───────────────────────────────────────────────────

export function createRecommendationLetterFixtures(memberIds: string[]) {
  return [
    { status: "approved" },
    { status: "requested" },
  ].map((l, idx) => ({
    id: uid("letter"),
    organization_id: REVIEW_ORG_ID,
    member_id: memberIds[idx] ?? null,
    member_name: "Membro de Demonstração (fictício)",
    member_email: null,
    destination_church: "Igreja Destino de Demonstração (fictícia)",
    destination_city: "Caxias do Sul",
    destination_state: "RS",
    reason: "Transferência de membresia (motivo fictício)",
    observations: null,
    status: l.status,
    public_token: uid("letter-token"),
    origin_church_name: "Matriz Municipal de Caxias do Sul (Avaliação)",
    requested_at: daysFromNow(-15 + idx * 3),
    reviewed_at: l.status === "approved" ? daysFromNow(-10 + idx * 3) : null,
    approved_at: l.status === "approved" ? daysFromNow(-8 + idx * 3) : null,
    reviewed_by: l.status === "approved" ? REVIEW_USER_ID : null,
    approved_by: l.status === "approved" ? REVIEW_USER_ID : null,
    created_at: daysFromNow(-15 + idx * 3),
    updated_at: daysFromNow(-15 + idx * 3),
  }));
}

// ── Chat da Secretaria (threads internos) ───────────────────────────────────

export function createInternalThreadFixtures() {
  return [
    {
      id: uid("thread"),
      organization_id: REVIEW_ORG_ID,
      campaign_id: null as string | null,
      member_id: null as string | null,
      created_by: REVIEW_USER_ID,
      assigned_to: REVIEW_USER_ID,
      subject: "Dúvida sobre horário de culto (fictícia)",
      status: "open",
      source: "secretariat",
      reply_enabled: true,
      last_message_at: daysFromNow(-1.9),
      closed_at: null as string | null,
      created_at: daysFromNow(-2),
      updated_at: daysFromNow(-1.9),
    },
  ];
}

export function createInternalMessageFixtures(threadIds: string[]) {
  if (threadIds.length === 0) return [];
  return [
    { text: "Olá! Gostaria de confirmar o horário do culto de domingo. (mensagem fictícia)" },
    { text: "Olá! O culto de domingo continua às 19h. (mensagem fictícia)" },
  ].map((m, idx) => ({
    id: uid("internal-message"),
    thread_id: threadIds[0],
    organization_id: REVIEW_ORG_ID,
    sender_user_id: REVIEW_USER_ID,
    sender_member_id: null as string | null,
    sender_role: "church_admin",
    body: m.text,
    message_type: "text",
    reply_to_message_id: null as string | null,
    read_at: null as string | null,
    created_at: new Date(Date.now() - (2 - idx) * 3_600_000).toISOString(),
  }));
}

// ── Estrutura completa do "banco" em memória ────────────────────────────────

export interface ReviewStoreTables {
  organizations: ReviewOrganizationRow[];
  profiles: ReturnType<typeof createProfileFixture>[];
  organization_users: ReturnType<typeof createOrganizationUserFixtures>;
  user_roles: Array<{ id: string; user_id: string; role: string; organization_id: string | null }>;
  super_admins: Array<{ user_id: string }>;
  members: ReturnType<typeof createMemberFixtures>;
  documents: ReturnType<typeof createDocumentFixtures>;
  events: ReturnType<typeof createEventFixtures>;
  schedules: Array<Record<string, unknown>>;
  schedule_assignments: Array<Record<string, unknown>>;
  groups: ReturnType<typeof createGroupFixtures>;
  group_messages: Array<Record<string, unknown>>;
  group_members: Array<Record<string, unknown>>;
  assemblies: ReturnType<typeof createAssemblyFixtures>;
  assembly_attachments: Array<Record<string, unknown>>;
  campaigns: ReturnType<typeof createCampaignFixtures>;
  campaign_updates: Array<Record<string, unknown>>;
  campaign_media: Array<Record<string, unknown>>;
  campaign_contributions: Array<Record<string, unknown>>;
  transactions: ReturnType<typeof createTransactionFixtures>;
  communications: ReturnType<typeof createCommunicationFixtures>;
  prayer_requests: ReturnType<typeof createPrayerRequestFixtures>;
  administrative_requests: ReturnType<typeof createAdministrativeRequestFixtures>;
  recommendation_letters: Array<Record<string, unknown>>;
  internal_threads: ReturnType<typeof createInternalThreadFixtures>;
  internal_messages: Array<Record<string, unknown>>;
  internal_message_attachments: Array<Record<string, unknown>>;
  platform_announcements: Array<Record<string, unknown>>;
  [table: string]: Array<Record<string, unknown>>;
}

export function createReviewStoreTables(): ReviewStoreTables {
  const members = createMemberFixtures();
  const memberIds = members.map((m) => m.id);
  const groups = createGroupFixtures();
  const groupIds = groups.map((g) => g.id);
  const { schedules, assignments } = createScheduleFixtures(memberIds);
  const threads = createInternalThreadFixtures();
  const threadIds = threads.map((t) => t.id);

  return {
    organizations: createOrganizationFixtures(),
    profiles: [createProfileFixture()],
    organization_users: createOrganizationUserFixtures(),
    user_roles: [],
    super_admins: [],
    members,
    documents: createDocumentFixtures(),
    events: createEventFixtures(),
    schedules,
    schedule_assignments: assignments,
    groups,
    group_messages: createGroupMessageFixtures(groupIds),
    group_members: createGroupMemberFixtures(groups, memberIds),
    assemblies: createAssemblyFixtures(),
    assembly_attachments: [],
    campaigns: createCampaignFixtures(),
    campaign_updates: [],
    campaign_media: [],
    campaign_contributions: [],
    transactions: createTransactionFixtures(),
    communications: createCommunicationFixtures(),
    prayer_requests: createPrayerRequestFixtures(),
    administrative_requests: createAdministrativeRequestFixtures(),
    recommendation_letters: createRecommendationLetterFixtures(memberIds),
    internal_threads: threads,
    internal_messages: createInternalMessageFixtures(threadIds),
    internal_message_attachments: [],
    platform_announcements: [],
  };
}

export { now, daysFromNow, uid };
