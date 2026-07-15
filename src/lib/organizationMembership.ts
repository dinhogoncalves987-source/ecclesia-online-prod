export const PENDING_CHURCH_SLUG_KEY = "ecclesia.pendingChurchSlug";

export function normalizeChurchSlug(slug: string | null | undefined): string | null {
  const normalized = slug?.trim();
  return normalized || null;
}

export function persistPendingChurchSlug(slug: string | null | undefined) {
  const normalized = normalizeChurchSlug(slug);
  if (!normalized) return;
  localStorage.setItem(PENDING_CHURCH_SLUG_KEY, normalized);
}

/** Prefer URL param, then persisted invite slug (survives Login ↔ Signup navigation). */
export function resolveInviteChurchSlug(urlSlug: string | null | undefined): string | null {
  return normalizeChurchSlug(urlSlug) ?? peekPendingChurchSlug();
}

export function signupPathWithChurch(slug: string | null | undefined): string {
  const resolved = resolveInviteChurchSlug(slug);
  return resolved ? `/signup?church=${encodeURIComponent(resolved)}` : "/signup";
}

export function loginPathWithChurch(slug: string | null | undefined): string {
  const resolved = resolveInviteChurchSlug(slug);
  return resolved ? `/login?church=${encodeURIComponent(resolved)}` : "/login";
}

export function peekPendingChurchSlug(): string | null {
  const slug = localStorage.getItem(PENDING_CHURCH_SLUG_KEY)?.trim();
  return slug || null;
}

export function clearPendingChurchSlug() {
  localStorage.removeItem(PENDING_CHURCH_SLUG_KEY);
}

export function buildSignupMetadata(fullName: string, churchSlug: string | null | undefined) {
  const inviteSlug = resolveInviteChurchSlug(churchSlug);
  if (inviteSlug) {
    // Apenas persiste localmente para fins cosméticos (pré-preencher o link
    // de login após confirmação de e-mail). NUNCA envia church_slug para
    // raw_user_meta_data/user_metadata — ver nota de segurança abaixo.
    persistPendingChurchSlug(inviteSlug);
  }
  return { full_name: fullName.trim() };
}

// ── SEGURANÇA (FASE 2 — hardening P0) ────────────────────────────────────────
// `ensureOrganizationMembership` / a RPC `join_organization_by_slug` foram
// REMOVIDAS (ver migration supabase/migrations/20260715141000_remove_open_
// slug_join.sql), e `handle_new_user()` não lê mais `church_slug` de
// `raw_user_meta_data` (mesma migration). Elas permitiam que qualquer usuário
// autenticado se autoassociasse como membro de QUALQUER organização apenas
// conhecendo (ou adivinhando) o slug público — sem convite, token ou
// aprovação de um administrador. O ingresso em uma organização agora só
// ocorre por convite tokenizado vinculado ao e-mail autenticado
// (accept_member_invite / accept_access_invite em src/lib/memberInvites.ts e
// src/lib/accessInvites.ts).
//
// Por isso este módulo NUNCA mais escreve `church_slug` em
// `options.data`/`user_metadata` (nem no cadastro por e-mail, nem via
// `updateUser` após OAuth) — mesmo que o backend atual já ignore esse campo,
// continuar enviando-o seria reabrir o mesmo vetor caso um trigger futuro
// volte a lê-lo por engano. Os helpers de slug abaixo (URL/localStorage)
// permanecem apenas para fins cosméticos/UX (pré-preencher o link de
// login/signup) e nunca criam vínculo organizacional nem tocam
// raw_user_meta_data.
